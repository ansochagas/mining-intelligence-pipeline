import "server-only";

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  FIRECRAWL_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4.1"),
  EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  MAX_SOURCES_PER_TYPE: z.coerce.number().int().min(1).max(10).default(3),
  EXTRACT_RETRY_LIMIT: z.coerce.number().int().min(0).max(3).default(1),
  SCRAPE_CACHE_TTL_HOURS: z.coerce.number().int().min(0).max(720).default(24),
  CHUNK_TARGET_CHARS: z.coerce.number().int().min(200).max(4000).default(1000),
  CHUNK_OVERLAP_CHARS: z.coerce.number().int().min(0).max(1000).default(120),
  MAX_CHUNKS_PER_DOCUMENT: z.coerce.number().int().min(1).max(200).default(30),
  EMBEDDING_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(16),
  SEARCH_TOP_K: z.coerce.number().int().min(1).max(50).default(8),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

function formatZodErrors(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
}

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${formatZodErrors(parsed.error)}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
