import fs from "fs";
import path from "path";

import { OpenAIExtractionClient } from "../src/lib/clients/openai";
import { isRawChunksTableAvailable, replaceRawChunksForDocument } from "../src/lib/data-access";
import { sql } from "../src/lib/db";
import { getEnv } from "../src/lib/env";
import { chunkText } from "../src/lib/pipeline/chunking";

type RawDocumentRow = {
  raw_document_id: number;
  company_id: string;
  source_id: number | null;
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

async function listDocumentsMissingChunks(companyName: string | null): Promise<RawDocumentRow[]> {
  if (companyName) {
    const result = await sql<RawDocumentRow>(
      `
        SELECT
          rd.id AS raw_document_id,
          rd.company_id,
          rd.source_id,
          rd.content_markdown
        FROM raw_documents rd
        INNER JOIN companies c ON c.id = rd.company_id
        LEFT JOIN raw_chunks rc ON rc.raw_document_id = rd.id
        WHERE c.normalized_name = LOWER(BTRIM($1))
        GROUP BY rd.id, rd.company_id, rd.source_id, rd.content_markdown
        HAVING COUNT(rc.id) = 0
        ORDER BY rd.id ASC
      `,
      [companyName],
    );
    return result.rows;
  }

  const result = await sql<RawDocumentRow>(
    `
      SELECT
        rd.id AS raw_document_id,
        rd.company_id,
        rd.source_id,
        rd.content_markdown
      FROM raw_documents rd
      LEFT JOIN raw_chunks rc ON rc.raw_document_id = rd.id
      GROUP BY rd.id, rd.company_id, rd.source_id, rd.content_markdown
      HAVING COUNT(rc.id) = 0
      ORDER BY rd.id ASC
    `,
  );
  return result.rows;
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  const env = getEnv();
  const companyFilter = parseCompanyArg();

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for chunk backfill.");
  }

  const rawChunksAvailable = await isRawChunksTableAvailable();
  if (!rawChunksAvailable) {
    throw new Error("raw_chunks table is unavailable. Enable pgvector and run database/init.sql.");
  }

  const extractor = new OpenAIExtractionClient({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    embeddingModel: env.EMBEDDING_MODEL,
    embeddingBatchSize: env.EMBEDDING_BATCH_SIZE,
    retryLimit: env.EXTRACT_RETRY_LIMIT,
  });

  const documents = await listDocumentsMissingChunks(companyFilter);
  console.log(
    `[backfill-raw-chunks] target_docs=${documents.length}${companyFilter ? ` company="${companyFilter}"` : ""}`,
  );

  let processedDocs = 0;
  let insertedChunks = 0;
  let failedDocs = 0;

  for (const document of documents) {
    try {
      const chunks = chunkText(document.content_markdown, {
        targetChars: env.CHUNK_TARGET_CHARS,
        overlapChars: env.CHUNK_OVERLAP_CHARS,
        maxChunks: env.MAX_CHUNKS_PER_DOCUMENT,
      });

      if (chunks.length === 0) {
        processedDocs += 1;
        continue;
      }

      const embeddings = await extractor.embedTexts(chunks.map((chunk) => chunk.content));
      if (embeddings.length !== chunks.length) {
        throw new Error(
          `Embedding mismatch for raw_document_id=${document.raw_document_id}: ${embeddings.length}/${chunks.length}`,
        );
      }

      const affected = await replaceRawChunksForDocument({
        rawDocumentId: document.raw_document_id,
        companyId: document.company_id,
        sourceId: document.source_id,
        chunks: chunks.map((chunk, index) => ({
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          embedding: embeddings[index],
          tokenCount: chunk.tokenCount,
        })),
      });

      insertedChunks += affected;
      processedDocs += 1;
    } catch (error) {
      failedDocs += 1;
      const message = error instanceof Error ? error.message : "unknown error";
      console.error(
        `[backfill-raw-chunks] failed raw_document_id=${document.raw_document_id}: ${message}`,
      );
    }
  }

  console.log(
    JSON.stringify(
      {
        targetDocs: documents.length,
        processedDocs,
        failedDocs,
        insertedChunks,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[backfill-raw-chunks] failed: ${message}`);
  process.exit(1);
});
