import fs from "fs";
import path from "path";

import { OpenAIExtractionClient } from "../src/lib/clients/openai";
import { upsertAsset } from "../src/lib/data-access";
import { sql } from "../src/lib/db";
import { getEnv } from "../src/lib/env";
import { normalizeAssetStatus, sanitizeString } from "../src/lib/pipeline/utils";

type AssetRawDocument = {
  raw_document_id: number;
  company_id: string;
  company_name: string;
  source_id: number;
  source_url: string;
  content_markdown: string;
};

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

function parseCompanyArg(): string | null {
  const flagIndex = process.argv.indexOf("--company");
  if (flagIndex < 0) {
    return null;
  }

  const value = process.argv[flagIndex + 1]?.trim();
  return value ? value : null;
}

async function countUnknownStatuses(companyName: string | null): Promise<{ total: number; unknown: number }> {
  if (companyName) {
    const result = await sql<{ total: number; unknown: number }>(
      `
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE a.status = 'unknown')::int AS unknown
        FROM assets a
        INNER JOIN companies c ON c.id = a.company_id
        WHERE c.normalized_name = LOWER(BTRIM($1))
      `,
      [companyName],
    );
    return result.rows[0] ?? { total: 0, unknown: 0 };
  }

  const result = await sql<{ total: number; unknown: number }>(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'unknown')::int AS unknown
      FROM assets
    `,
  );
  return result.rows[0] ?? { total: 0, unknown: 0 };
}

async function listLatestAssetDocuments(companyName: string | null): Promise<AssetRawDocument[]> {
  if (companyName) {
    const result = await sql<AssetRawDocument>(
      `
        SELECT DISTINCT ON (rd.source_id)
          rd.id AS raw_document_id,
          rd.company_id,
          c.name AS company_name,
          rd.source_id,
          s.url AS source_url,
          rd.content_markdown
        FROM raw_documents rd
        INNER JOIN sources s ON s.id = rd.source_id
        INNER JOIN companies c ON c.id = rd.company_id
        WHERE s.source_type = 'assets'
          AND c.normalized_name = LOWER(BTRIM($1))
        ORDER BY rd.source_id, rd.scraped_at DESC, rd.id DESC
      `,
      [companyName],
    );
    return result.rows;
  }

  const result = await sql<AssetRawDocument>(
    `
      SELECT DISTINCT ON (rd.source_id)
        rd.id AS raw_document_id,
        rd.company_id,
        c.name AS company_name,
        rd.source_id,
        s.url AS source_url,
        rd.content_markdown
      FROM raw_documents rd
      INNER JOIN sources s ON s.id = rd.source_id
      INNER JOIN companies c ON c.id = rd.company_id
      WHERE s.source_type = 'assets'
      ORDER BY rd.source_id, rd.scraped_at DESC, rd.id DESC
    `,
  );
  return result.rows;
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  const env = getEnv();
  const companyFilter = parseCompanyArg();

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for asset re-extraction.");
  }

  const before = await countUnknownStatuses(companyFilter);
  const documents = await listLatestAssetDocuments(companyFilter);

  console.log(
    `[reextract-assets-from-raw] target_docs=${documents.length}${companyFilter ? ` company="${companyFilter}"` : ""}`,
  );
  console.log(
    `[reextract-assets-from-raw] unknown_before=${before.unknown} total_assets_before=${before.total}`,
  );

  const extractor = new OpenAIExtractionClient({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    embeddingModel: env.EMBEDDING_MODEL,
    embeddingBatchSize: env.EMBEDDING_BATCH_SIZE,
    retryLimit: env.EXTRACT_RETRY_LIMIT,
  });

  let processedDocs = 0;
  let failedDocs = 0;
  let extractedAssets = 0;
  let extractedKnownStatus = 0;

  for (const document of documents) {
    try {
      const extracted = await extractor.extractAssets(document.content_markdown);

      for (const asset of extracted.assets) {
        const name = sanitizeString(asset.name);
        if (!name) {
          continue;
        }

        const notes = sanitizeString(asset.notes);
        const normalizedStatus = normalizeAssetStatus(asset.status, `${notes ?? ""} ${name}`);

        await upsertAsset({
          companyId: document.company_id,
          sourceId: document.source_id,
          name,
          commodities: asset.commodities
            .map((item) => sanitizeString(item))
            .filter((item): item is string => item !== null),
          status: normalizedStatus,
          country: sanitizeString(asset.country),
          region: sanitizeString(asset.region),
          town: sanitizeString(asset.town),
          latitude: asset.latitude,
          longitude: asset.longitude,
          notes,
        });

        extractedAssets += 1;
        if (normalizedStatus !== "unknown") {
          extractedKnownStatus += 1;
        }
      }

      processedDocs += 1;
    } catch (error) {
      failedDocs += 1;
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(
        `[reextract-assets-from-raw] failed raw_document_id=${document.raw_document_id}: ${message}`,
      );
    }
  }

  const after = await countUnknownStatuses(companyFilter);
  const reducedUnknown = before.unknown - after.unknown;

  console.log(
    JSON.stringify(
      {
        targetDocs: documents.length,
        processedDocs,
        failedDocs,
        extractedAssets,
        extractedKnownStatus,
        totalAssetsBefore: before.total,
        unknownBefore: before.unknown,
        totalAssetsAfter: after.total,
        unknownAfter: after.unknown,
        reducedUnknown,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[reextract-assets-from-raw] failed: ${message}`);
  process.exit(1);
});
