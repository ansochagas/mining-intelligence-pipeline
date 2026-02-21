import fs from "fs";
import path from "path";

import { Client } from "pg";

type SqlNumeric = string | number | null;

type ObservedMetrics = {
  sampledCompanies: number;
  avgSourcesPerCompany: number;
  avgDocsPerCompany: number;
  avgDocumentChars: number;
  avgChunksPerDocument: number;
  avgChunkTokens: number;
};

type Scenario = {
  id: string;
  label: string;
  docsMultiplier: number;
  outputTokensMultiplier: number;
  cacheHitRate: number;
};

type FirecrawlPlan = {
  name: string;
  monthlyUsd: number;
  includedCredits: number;
  overagePackCredits: number | null;
  overagePackUsd: number | null;
};

type FirecrawlPlanEstimate = {
  planName: string;
  monthlyUsd: number;
  includedCredits: number;
  extraCredits: number;
  extraPacks: number;
};

const DEFAULT_COMPANIES_PER_MONTH = 10_000;
const DEFAULT_SEARCH_QUERIES_PER_COMPANY = 2;
const DEFAULT_SEARCH_RESULTS_PER_QUERY = 12;

const FIRECRAWL_SEARCH_CREDITS_PER_10_RESULTS = 2;
const FIRECRAWL_SCRAPE_CREDITS_PER_PAGE = 1;

const GPT41_INPUT_USD_PER_1M_TOKENS = 2.0;
const GPT41_OUTPUT_USD_PER_1M_TOKENS = 8.0;
const EMBEDDING_SMALL_USD_PER_1M_TOKENS = 0.02;

const EXTRACTION_MAX_INPUT_CHARS = 24_000;
const APPROX_CHARS_PER_TOKEN = 4;
const EXTRACTION_PROMPT_OVERHEAD_TOKENS = 320;

const FALLBACK_DOCS_PER_COMPANY = 6;
const FALLBACK_DOCUMENT_CHARS = 11_000;
const FALLBACK_CHUNKS_PER_DOCUMENT = 12;
const FALLBACK_CHUNK_TOKENS = 120;
const FALLBACK_EXTRACTION_OUTPUT_TOKENS = 650;

const FIRECRAWL_PLANS: FirecrawlPlan[] = [
  {
    name: "Hobby",
    monthlyUsd: 16,
    includedCredits: 3_000,
    overagePackCredits: 1_000,
    overagePackUsd: 9,
  },
  {
    name: "Standard",
    monthlyUsd: 83,
    includedCredits: 100_000,
    overagePackCredits: 35_000,
    overagePackUsd: 47,
  },
  {
    name: "Growth",
    monthlyUsd: 333,
    includedCredits: 500_000,
    overagePackCredits: 175_000,
    overagePackUsd: 177,
  },
  {
    name: "Scale",
    monthlyUsd: 599,
    includedCredits: 1_000_000,
    overagePackCredits: null,
    overagePackUsd: null,
  },
];

const SCENARIOS: Scenario[] = [
  {
    id: "conservative",
    label: "Conservador (mais fontes e saidas maiores)",
    docsMultiplier: 1.25,
    outputTokensMultiplier: 1.35,
    cacheHitRate: 0,
  },
  {
    id: "base",
    label: "Base (comportamento atual observado)",
    docsMultiplier: 1,
    outputTokensMultiplier: 1,
    cacheHitRate: 0,
  },
  {
    id: "optimized_cache",
    label: "Otimizado (cache e menor redundancia)",
    docsMultiplier: 0.9,
    outputTokensMultiplier: 0.9,
    cacheHitRate: 0.35,
  },
];

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseNumberArg(flag: string, defaultValue: number): number {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return defaultValue;
  }

  const nextValue = process.argv[index + 1];
  if (!nextValue) {
    return defaultValue;
  }

  const parsed = Number(nextValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return parsed;
}

function asNumber(value: SqlNumeric, fallback: number): number {
  if (value === null || value === undefined) {
    return fallback;
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return numeric;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function chooseFirecrawlPlan(totalCredits: number): FirecrawlPlanEstimate {
  const candidates: FirecrawlPlanEstimate[] = [];

  for (const plan of FIRECRAWL_PLANS) {
    if (totalCredits <= plan.includedCredits) {
      candidates.push({
        planName: plan.name,
        monthlyUsd: plan.monthlyUsd,
        includedCredits: plan.includedCredits,
        extraCredits: 0,
        extraPacks: 0,
      });
      continue;
    }

    if (plan.overagePackCredits === null || plan.overagePackUsd === null) {
      continue;
    }

    const extraCredits = totalCredits - plan.includedCredits;
    const extraPacks = Math.ceil(extraCredits / plan.overagePackCredits);
    candidates.push({
      planName: plan.name,
      monthlyUsd: plan.monthlyUsd + extraPacks * plan.overagePackUsd,
      includedCredits: plan.includedCredits,
      extraCredits,
      extraPacks,
    });
  }

  if (candidates.length === 0) {
    const bundles = Math.ceil(totalCredits / 1_000_000);
    return {
      planName: "Scale (bundle estimate)",
      monthlyUsd: bundles * 599,
      includedCredits: bundles * 1_000_000,
      extraCredits: 0,
      extraPacks: 0,
    };
  }

  return candidates.reduce((best, current) => {
    if (current.monthlyUsd < best.monthlyUsd) {
      return current;
    }
    return best;
  });
}

async function getObservedMetrics(client: Client): Promise<ObservedMetrics> {
  const companiesRes = await client.query("SELECT COUNT(*)::int AS total FROM companies");
  const sampledCompanies = asNumber(companiesRes.rows[0]?.total ?? 0, 0);

  const sourcesRes = await client.query(`
    SELECT COALESCE(AVG(source_count)::numeric, 0) AS avg_sources
    FROM (
      SELECT company_id, COUNT(*)::int AS source_count
      FROM sources
      GROUP BY company_id
    ) grouped_sources
  `);

  const docsRes = await client.query(`
    SELECT COALESCE(AVG(doc_count)::numeric, 0) AS avg_docs
    FROM (
      SELECT company_id, COUNT(*)::int AS doc_count
      FROM raw_documents
      GROUP BY company_id
    ) grouped_docs
  `);

  const docCharsRes = await client.query(`
    SELECT COALESCE(AVG(LENGTH(content_markdown))::numeric, 0) AS avg_chars
    FROM raw_documents
  `);

  const rawChunksTableRes = await client.query(
    "SELECT to_regclass('public.raw_chunks') IS NOT NULL AS available",
  );
  const rawChunksAvailable = Boolean(rawChunksTableRes.rows[0]?.available);

  let avgChunksPerDocument = 0;
  let avgChunkTokens = 0;

  if (rawChunksAvailable) {
    const chunksPerDocRes = await client.query(`
      SELECT COALESCE(AVG(chunk_count)::numeric, 0) AS avg_chunks
      FROM (
        SELECT raw_document_id, COUNT(*)::int AS chunk_count
        FROM raw_chunks
        GROUP BY raw_document_id
      ) grouped_chunks
    `);

    const chunkTokensRes = await client.query(`
      SELECT COALESCE(AVG(token_count)::numeric, 0) AS avg_chunk_tokens
      FROM raw_chunks
    `);

    avgChunksPerDocument = asNumber(chunksPerDocRes.rows[0]?.avg_chunks ?? 0, 0);
    avgChunkTokens = asNumber(chunkTokensRes.rows[0]?.avg_chunk_tokens ?? 0, 0);
  }

  return {
    sampledCompanies,
    avgSourcesPerCompany: asNumber(sourcesRes.rows[0]?.avg_sources ?? 0, 0),
    avgDocsPerCompany: asNumber(docsRes.rows[0]?.avg_docs ?? 0, 0),
    avgDocumentChars: asNumber(docCharsRes.rows[0]?.avg_chars ?? 0, 0),
    avgChunksPerDocument,
    avgChunkTokens,
  };
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to estimate cost.");
  }

  const companiesPerMonth = Math.floor(parseNumberArg("--companies", DEFAULT_COMPANIES_PER_MONTH));
  const searchResultsPerQuery = parseNumberArg("--search-results", DEFAULT_SEARCH_RESULTS_PER_QUERY);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const observed = await getObservedMetrics(client);
  await client.end();

  const docsPerCompanyObserved =
    observed.avgDocsPerCompany > 0
      ? observed.avgDocsPerCompany
      : observed.avgSourcesPerCompany > 0
        ? observed.avgSourcesPerCompany
        : FALLBACK_DOCS_PER_COMPANY;

  const documentCharsObserved =
    observed.avgDocumentChars > 0 ? observed.avgDocumentChars : FALLBACK_DOCUMENT_CHARS;

  const chunksPerDocumentObserved =
    observed.avgChunksPerDocument > 0 ? observed.avgChunksPerDocument : FALLBACK_CHUNKS_PER_DOCUMENT;

  const chunkTokensObserved = observed.avgChunkTokens > 0 ? observed.avgChunkTokens : FALLBACK_CHUNK_TOKENS;

  const cappedInputChars = Math.min(documentCharsObserved, EXTRACTION_MAX_INPUT_CHARS);
  const extractionInputTokensPerDocument =
    cappedInputChars / APPROX_CHARS_PER_TOKEN + EXTRACTION_PROMPT_OVERHEAD_TOKENS;

  const searchCreditsPerCompany =
    DEFAULT_SEARCH_QUERIES_PER_COMPANY *
    (searchResultsPerQuery / 10) *
    FIRECRAWL_SEARCH_CREDITS_PER_10_RESULTS;

  console.log(`[estimate-monthly-cost] companies_per_month=${companiesPerMonth}`);
  console.log(
    `[estimate-monthly-cost] sampled_companies=${observed.sampledCompanies} avg_docs_per_company=${round2(docsPerCompanyObserved)} avg_doc_chars=${round2(documentCharsObserved)}`,
  );
  console.log(
    `[estimate-monthly-cost] avg_chunks_per_document=${round2(chunksPerDocumentObserved)} avg_chunk_tokens=${round2(chunkTokensObserved)}`,
  );
  console.log(
    `[estimate-monthly-cost] openai_prices_usd_per_1m: gpt4.1_input=${GPT41_INPUT_USD_PER_1M_TOKENS}, gpt4.1_output=${GPT41_OUTPUT_USD_PER_1M_TOKENS}, embedding_small=${EMBEDDING_SMALL_USD_PER_1M_TOKENS}`,
  );
  console.log(
    `[estimate-monthly-cost] firecrawl_search_credits_per_company=${round2(searchCreditsPerCompany)}`,
  );
  console.log("");

  for (const scenario of SCENARIOS) {
    const docsPerCompany = docsPerCompanyObserved * scenario.docsMultiplier;
    const scrapedDocsPerCompany = docsPerCompany * (1 - scenario.cacheHitRate);

    const extractionOutputTokensPerDocument =
      FALLBACK_EXTRACTION_OUTPUT_TOKENS * scenario.outputTokensMultiplier;
    const embeddingTokensPerDocument = chunksPerDocumentObserved * chunkTokensObserved;

    const firecrawlSearchCreditsMonth = companiesPerMonth * searchCreditsPerCompany;
    const firecrawlScrapeCreditsMonth = companiesPerMonth * scrapedDocsPerCompany * FIRECRAWL_SCRAPE_CREDITS_PER_PAGE;
    const firecrawlCreditsMonth = firecrawlSearchCreditsMonth + firecrawlScrapeCreditsMonth;

    const extractionInputTokensMonth = companiesPerMonth * scrapedDocsPerCompany * extractionInputTokensPerDocument;
    const extractionOutputTokensMonth =
      companiesPerMonth * scrapedDocsPerCompany * extractionOutputTokensPerDocument;
    const embeddingTokensMonth = companiesPerMonth * scrapedDocsPerCompany * embeddingTokensPerDocument;

    const openaiExtractionInputUsd =
      (extractionInputTokensMonth / 1_000_000) * GPT41_INPUT_USD_PER_1M_TOKENS;
    const openaiExtractionOutputUsd =
      (extractionOutputTokensMonth / 1_000_000) * GPT41_OUTPUT_USD_PER_1M_TOKENS;
    const openaiEmbeddingUsd = (embeddingTokensMonth / 1_000_000) * EMBEDDING_SMALL_USD_PER_1M_TOKENS;

    const firecrawlPlan = chooseFirecrawlPlan(Math.ceil(firecrawlCreditsMonth));

    const openaiTotalUsd = openaiExtractionInputUsd + openaiExtractionOutputUsd + openaiEmbeddingUsd;
    const grandTotalUsd = firecrawlPlan.monthlyUsd + openaiTotalUsd;

    console.log(`[scenario:${scenario.id}] ${scenario.label}`);
    console.log(
      `  assumed_docs_per_company=${round2(docsPerCompany)} cache_hit_rate=${round2(scenario.cacheHitRate * 100)}%`,
    );
    console.log(
      `  firecrawl_credits_month=${Math.ceil(firecrawlCreditsMonth)} (search=${Math.ceil(firecrawlSearchCreditsMonth)}, scrape=${Math.ceil(firecrawlScrapeCreditsMonth)})`,
    );
    console.log(
      `  firecrawl_plan=${firecrawlPlan.planName} cost=${formatUsd(firecrawlPlan.monthlyUsd)} included=${firecrawlPlan.includedCredits} extra_packs=${firecrawlPlan.extraPacks}`,
    );
    console.log(
      `  openai_tokens_month: input=${Math.ceil(extractionInputTokensMonth)}, output=${Math.ceil(extractionOutputTokensMonth)}, embedding=${Math.ceil(embeddingTokensMonth)}`,
    );
    console.log(
      `  openai_cost_usd: input=${formatUsd(openaiExtractionInputUsd)} output=${formatUsd(openaiExtractionOutputUsd)} embedding=${formatUsd(openaiEmbeddingUsd)} total=${formatUsd(openaiTotalUsd)}`,
    );
    console.log(`  grand_total_usd=${formatUsd(grandTotalUsd)}`);
    console.log("");
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[estimate-monthly-cost] failed: ${message}`);
  process.exit(1);
});
