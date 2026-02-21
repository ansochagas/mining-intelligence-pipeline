import fs from "fs";
import path from "path";

import { OpenAIExtractionClient } from "../src/lib/clients/openai";
import { searchRawChunksByEmbedding } from "../src/lib/data-access";
import { getEnv } from "../src/lib/env";

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

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));

  const query = process.argv[2] ?? "lithium projects in Australia";
  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required.");
  }

  const openai = new OpenAIExtractionClient({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    embeddingModel: env.EMBEDDING_MODEL,
    embeddingBatchSize: env.EMBEDDING_BATCH_SIZE,
    retryLimit: env.EXTRACT_RETRY_LIMIT,
  });

  const embedding = await openai.embedQuery(query);
  const results = await searchRawChunksByEmbedding({
    queryEmbedding: embedding,
    limit: env.SEARCH_TOP_K,
  });

  console.log(`[test-semantic-search] query="${query}" results=${results.length}`);
  for (const item of results) {
    const snippet = item.content.slice(0, 180).replace(/\s+/g, " ");
    console.log(
      `- score=${item.similarity.toFixed(4)} company=${item.company_name} sourceType=${item.source_type ?? "unknown"} chunk=${item.chunk_index}`,
    );
    console.log(`  ${snippet}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[test-semantic-search] failed: ${message}`);
  process.exit(1);
});
