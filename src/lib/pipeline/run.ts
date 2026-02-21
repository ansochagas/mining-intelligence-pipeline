import "server-only";

import { FirecrawlClient } from "@/lib/clients/firecrawl";
import { OpenAIExtractionClient } from "@/lib/clients/openai";
import {
  findRecentRawDocumentBySource,
  isRawChunksTableAvailable,
  replaceRawChunksForDocument,
  upsertAsset,
  upsertCompany,
  upsertCompanyPerson,
  upsertPerson,
  upsertRawDocument,
  upsertSource,
} from "@/lib/data-access";
import { getEnv } from "@/lib/env";
import { chunkText } from "@/lib/pipeline/chunking";
import { sourceTypeSchema, type SourceType } from "@/lib/pipeline/schemas";
import {
  normalizeAssetStatus,
  normalizeTitle,
  sanitizeString,
  sha256,
  splitCompanyInput,
} from "@/lib/pipeline/utils";

type CompanyPipelineResult = {
  companyId: string | null;
  companyName: string;
  discoveredSources: number;
  scrapedSources: number;
  skippedByCache: number;
  skippedByHash: number;
  chunkRecords: number;
  embeddingFailures: number;
  leadershipRecords: number;
  assetRecords: number;
  failedSources: number;
  errors: string[];
};

export type PipelineRunSummary = {
  startedAt: string;
  finishedAt: string;
  companiesRequested: number;
  companiesProcessed: number;
  results: CompanyPipelineResult[];
};

const DISCOVERY_TYPES: SourceType[] = ["leadership", "assets"];

export async function runPipelineFromInput(input: string): Promise<PipelineRunSummary> {
  const companyNames = splitCompanyInput(input);
  if (companyNames.length === 0) {
    throw new Error("No valid company names found in input.");
  }

  const env = getEnv();
  if (!env.FIRECRAWL_API_KEY) {
    throw new Error("FIRECRAWL_API_KEY is required to run the pipeline.");
  }
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required to run the pipeline.");
  }

  const firecrawl = new FirecrawlClient({
    apiKey: env.FIRECRAWL_API_KEY,
    maxSourcesPerType: env.MAX_SOURCES_PER_TYPE,
  });
  const extractor = new OpenAIExtractionClient({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    embeddingModel: env.EMBEDDING_MODEL,
    embeddingBatchSize: env.EMBEDDING_BATCH_SIZE,
    retryLimit: env.EXTRACT_RETRY_LIMIT,
  });
  const rawChunksAvailable = await isRawChunksTableAvailable().catch(() => false);

  const startedAt = new Date().toISOString();
  const results: CompanyPipelineResult[] = [];

  for (const companyName of companyNames) {
    try {
      const result = await runSingleCompany({
        companyName,
        firecrawl,
        extractor,
        scrapeCacheTtlHours: env.SCRAPE_CACHE_TTL_HOURS,
        rawChunksAvailable,
        chunkTargetChars: env.CHUNK_TARGET_CHARS,
        chunkOverlapChars: env.CHUNK_OVERLAP_CHARS,
        maxChunksPerDocument: env.MAX_CHUNKS_PER_DOCUMENT,
      });
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown company-level error";
      console.error(
        JSON.stringify({
          event: "pipeline.company.fatal",
          companyName,
          error: message,
          at: new Date().toISOString(),
        }),
      );

      results.push({
        companyId: null,
        companyName,
        discoveredSources: 0,
        scrapedSources: 0,
        skippedByCache: 0,
        skippedByHash: 0,
        chunkRecords: 0,
        embeddingFailures: 0,
        leadershipRecords: 0,
        assetRecords: 0,
        failedSources: 1,
        errors: [message],
      });
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    companiesRequested: companyNames.length,
    companiesProcessed: results.length,
    results,
  };
}

async function runSingleCompany(params: {
  companyName: string;
  firecrawl: FirecrawlClient;
  extractor: OpenAIExtractionClient;
  scrapeCacheTtlHours: number;
  rawChunksAvailable: boolean;
  chunkTargetChars: number;
  chunkOverlapChars: number;
  maxChunksPerDocument: number;
}): Promise<CompanyPipelineResult> {
  const company = await upsertCompany(params.companyName);

  const result: CompanyPipelineResult = {
    companyId: company.id,
    companyName: company.name,
    discoveredSources: 0,
    scrapedSources: 0,
    skippedByCache: 0,
    skippedByHash: 0,
    chunkRecords: 0,
    embeddingFailures: 0,
    leadershipRecords: 0,
    assetRecords: 0,
    failedSources: 0,
    errors: [],
  };

  console.log(
    JSON.stringify({
      event: "pipeline.company.start",
      companyId: company.id,
      companyName: company.name,
      at: new Date().toISOString(),
    }),
  );

  let discoveredSources = [];
  try {
    discoveredSources = await discoverAndStoreSources({
      companyId: company.id,
      companyName: company.name,
      firecrawl: params.firecrawl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown discovery error";
    result.errors.push(`Discover failed: ${message}`);
    result.failedSources += 1;
    return result;
  }

  result.discoveredSources = discoveredSources.length;

  for (const source of discoveredSources) {
    try {
      const recentRawDocument = await findRecentRawDocumentBySource({
        companyId: company.id,
        sourceId: source.id,
        maxAgeHours: params.scrapeCacheTtlHours,
      });

      if (recentRawDocument) {
        result.skippedByCache += 1;
        console.log(
          JSON.stringify({
            event: "scrape.skip_cache",
            companyId: company.id,
            sourceId: source.id,
            rawDocumentId: recentRawDocument.id,
            ttlHours: params.scrapeCacheTtlHours,
            at: new Date().toISOString(),
          }),
        );
        continue;
      }

      console.log(
        JSON.stringify({
          event: "scrape.start",
          companyId: company.id,
          sourceId: source.id,
          sourceType: source.source_type,
          url: source.url,
          at: new Date().toISOString(),
        }),
      );

      const markdown = await params.firecrawl.scrapeMarkdown(source.url);
      if (!markdown) {
        result.failedSources += 1;
        result.errors.push(`Source ${source.id}: scrape returned empty content.`);
        continue;
      }

      result.scrapedSources += 1;
      const contentHash = sha256(markdown);

      const rawDocument = await upsertRawDocument({
        sourceId: source.id,
        companyId: company.id,
        url: source.url,
        contentMarkdown: markdown,
        contentHash,
      });

      if (!rawDocument.inserted) {
        result.skippedByHash += 1;
        console.log(
          JSON.stringify({
            event: "scrape.skip_hash",
            companyId: company.id,
            sourceId: source.id,
            rawDocumentId: rawDocument.id,
            contentHash,
            at: new Date().toISOString(),
          }),
        );
        continue;
      }

      if (source.source_type === "leadership") {
        const extracted = await params.extractor.extractLeadership(markdown);
        const insertedLeadership = await persistLeadership({
          companyId: company.id,
          sourceId: source.id,
          people: extracted.people,
        });
        result.leadershipRecords += insertedLeadership;
      } else if (source.source_type === "assets") {
        const extracted = await params.extractor.extractAssets(markdown);
        const insertedAssets = await persistAssets({
          companyId: company.id,
          sourceId: source.id,
          assets: extracted.assets,
        });
        result.assetRecords += insertedAssets;
      }

      if (params.rawChunksAvailable) {
        try {
          const insertedChunks = await persistEmbeddingsForRawDocument({
            rawDocumentId: rawDocument.id,
            companyId: company.id,
            sourceId: source.id,
            markdown,
            extractor: params.extractor,
            chunkTargetChars: params.chunkTargetChars,
            chunkOverlapChars: params.chunkOverlapChars,
            maxChunksPerDocument: params.maxChunksPerDocument,
          });
          result.chunkRecords += insertedChunks;
        } catch (embeddingError) {
          result.embeddingFailures += 1;
          const message =
            embeddingError instanceof Error ? embeddingError.message : "Unknown embedding error";
          result.errors.push(`Source ${source.id}: embedding failed (${message}).`);
          console.error(
            JSON.stringify({
              event: "embedding.fail",
              companyId: company.id,
              sourceId: source.id,
              rawDocumentId: rawDocument.id,
              error: message,
              at: new Date().toISOString(),
            }),
          );
        }
      }

      console.log(
        JSON.stringify({
          event: "extract.done",
          companyId: company.id,
          sourceId: source.id,
          sourceType: source.source_type,
          at: new Date().toISOString(),
        }),
      );
    } catch (error) {
      result.failedSources += 1;
      const message = error instanceof Error ? error.message : "Unknown source error";
      result.errors.push(`Source ${source.id}: ${message}`);
      console.error(
        JSON.stringify({
          event: "source.fail",
          companyId: company.id,
          sourceId: source.id,
          error: message,
          at: new Date().toISOString(),
        }),
      );
    }
  }

  console.log(
    JSON.stringify({
      event: "pipeline.company.done",
      companyId: company.id,
      companyName: company.name,
      discoveredSources: result.discoveredSources,
      scrapedSources: result.scrapedSources,
      skippedByCache: result.skippedByCache,
      skippedByHash: result.skippedByHash,
      chunkRecords: result.chunkRecords,
      embeddingFailures: result.embeddingFailures,
      leadershipRecords: result.leadershipRecords,
      assetRecords: result.assetRecords,
      failedSources: result.failedSources,
      at: new Date().toISOString(),
    }),
  );

  return result;
}

async function persistEmbeddingsForRawDocument(params: {
  rawDocumentId: number;
  companyId: string;
  sourceId: number | null;
  markdown: string;
  extractor: OpenAIExtractionClient;
  chunkTargetChars: number;
  chunkOverlapChars: number;
  maxChunksPerDocument: number;
}): Promise<number> {
  const chunks = chunkText(params.markdown, {
    targetChars: params.chunkTargetChars,
    overlapChars: params.chunkOverlapChars,
    maxChunks: params.maxChunksPerDocument,
  });

  if (chunks.length === 0) {
    return 0;
  }

  const embeddings = await params.extractor.embedTexts(chunks.map((chunk) => chunk.content));
  if (embeddings.length !== chunks.length) {
    throw new Error(
      `Embedding output mismatch: ${embeddings.length} embeddings for ${chunks.length} chunks.`,
    );
  }

  const rows = chunks.map((chunk, index) => ({
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    embedding: embeddings[index],
    tokenCount: chunk.tokenCount,
  }));

  return replaceRawChunksForDocument({
    rawDocumentId: params.rawDocumentId,
    companyId: params.companyId,
    sourceId: params.sourceId,
    chunks: rows,
  });
}

async function discoverAndStoreSources(params: {
  companyId: string;
  companyName: string;
  firecrawl: FirecrawlClient;
}) {
  const discoveredMap = new Map<string, { url: string; sourceType: SourceType; query: string }>();

  for (const sourceType of DISCOVERY_TYPES) {
    const query =
      sourceType === "leadership"
        ? `${params.companyName} leadership board executives`
        : `${params.companyName} operations mines projects assets`;

    let discovered = [];
    try {
      discovered = await params.firecrawl.discoverByType(params.companyName, sourceType);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown discover error";
      console.error(
        JSON.stringify({
          event: "discover.fail",
          companyId: params.companyId,
          companyName: params.companyName,
          sourceType,
          query,
          error: message,
          at: new Date().toISOString(),
        }),
      );
      continue;
    }

    for (const item of discovered) {
      const key = item.url.trim().toLowerCase();
      if (!key) {
        continue;
      }

      if (!discoveredMap.has(key)) {
        discoveredMap.set(key, {
          url: item.url.trim(),
          sourceType,
          query,
        });
      }
    }
  }

  const persistedSources = [];
  for (const item of discoveredMap.values()) {
    const source = await upsertSource({
      companyId: params.companyId,
      url: item.url,
      sourceType: sourceTypeSchema.parse(item.sourceType),
      discoveryQuery: item.query,
    });
    persistedSources.push(source);
  }

  return persistedSources;
}

async function persistLeadership(params: {
  companyId: string;
  sourceId: number;
  people: Array<{
    full_name: string;
    title: string | null;
    type: "executive" | "board" | "unknown";
    expertise_tags: string[];
    bullets: string[];
  }>;
}): Promise<number> {
  let insertedCount = 0;
  const filteredPeople = selectBestLeadershipEntries(params.people);

  for (const person of filteredPeople) {
    const fullName = sanitizeString(person.full_name);
    if (!fullName) {
      continue;
    }

    const title = normalizeTitle(person.title);
    const expertiseTags = normalizeStringList(person.expertise_tags);
    const bullets = normalizeStringList(person.bullets);

    const upsertedPerson = await upsertPerson({
      fullName,
      title,
      personType: person.type,
      expertiseTags,
      bullets,
    });

    await upsertCompanyPerson({
      companyId: params.companyId,
      personId: upsertedPerson.id,
      sourceId: params.sourceId,
      observedTitle: title,
      observedPersonType: person.type,
    });

    insertedCount += 1;
  }

  return insertedCount;
}

async function persistAssets(params: {
  companyId: string;
  sourceId: number;
  assets: Array<{
    name: string;
    commodities: string[];
    status: string | null;
    country: string | null;
    region: string | null;
    town: string | null;
    latitude: number | null;
    longitude: number | null;
    notes: string | null;
  }>;
}): Promise<number> {
  let insertedCount = 0;

  for (const asset of params.assets) {
    const name = sanitizeString(asset.name);
    if (!name) {
      continue;
    }

    await upsertAsset({
      companyId: params.companyId,
      sourceId: params.sourceId,
      name,
      commodities: normalizeStringList(asset.commodities),
      status: normalizeAssetStatus(asset.status, `${asset.notes ?? ""} ${name}`),
      country: sanitizeString(asset.country),
      region: sanitizeString(asset.region),
      town: sanitizeString(asset.town),
      latitude: asset.latitude,
      longitude: asset.longitude,
      notes: sanitizeString(asset.notes),
    });

    insertedCount += 1;
  }

  return insertedCount;
}

function normalizeStringList(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const rawValue of values) {
    const normalized = sanitizeString(rawValue);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(normalized);
  }

  return output;
}

function selectBestLeadershipEntries(
  people: Array<{
    full_name: string;
    title: string | null;
    type: "executive" | "board" | "unknown";
    expertise_tags: string[];
    bullets: string[];
  }>,
) {
  const bestByName = new Map<
    string,
    {
      score: number;
      person: {
        full_name: string;
        title: string | null;
        type: "executive" | "board" | "unknown";
        expertise_tags: string[];
        bullets: string[];
      };
    }
  >();

  for (const person of people) {
    const normalizedName = sanitizeString(person.full_name);
    if (!normalizedName) {
      continue;
    }

    const title = normalizeTitle(person.title);
    const score = scoreLeadershipTitle(title, person.type);
    const existing = bestByName.get(normalizedName.toLowerCase());
    if (!existing || score > existing.score) {
      bestByName.set(normalizedName.toLowerCase(), {
        score,
        person: {
          ...person,
          full_name: normalizedName,
          title,
        },
      });
    }
  }

  return Array.from(bestByName.values())
    .map((entry) => entry.person)
    .filter((person) => !isExcludedLeadershipRole(person.title));
}

function scoreLeadershipTitle(
  title: string | null,
  type: "executive" | "board" | "unknown",
): number {
  if (!title) {
    return type === "unknown" ? -10 : 0;
  }

  const normalized = title.toLowerCase();
  let score = 0;

  for (const keyword of ["chief", "ceo", "cfo", "coo", "president", "executive", "director", "chair", "board"]) {
    if (normalized.includes(keyword)) {
      score += 8;
    }
  }

  for (const keyword of ["committee", "contact", "communications", "media", "investor relations"]) {
    if (normalized.includes(keyword)) {
      score -= 10;
    }
  }

  if (type === "executive") {
    score += 4;
  } else if (type === "board") {
    score += 3;
  }

  return score;
}

function isExcludedLeadershipRole(title: string | null): boolean {
  if (!title) {
    return false;
  }

  const normalized = title.toLowerCase();
  const hasNoiseKeyword =
    normalized.includes("contact") ||
    normalized.includes("communications") ||
    normalized.includes("investor relations") ||
    normalized.includes("media");
  if (!hasNoiseKeyword) {
    return false;
  }

  return !(
    normalized.includes("chief") ||
    normalized.includes("director") ||
    normalized.includes("board") ||
    normalized.includes("president") ||
    normalized.includes("executive")
  );
}
