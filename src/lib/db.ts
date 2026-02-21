import "server-only";

import { Pool, type QueryResult, type QueryResultRow } from "pg";

import { getEnv } from "@/lib/env";

declare global {
  var __pipelineDbPool: Pool | undefined;
}

let processPool: Pool | undefined;

function shouldUseSsl(connectionString: string): boolean {
  return !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1");
}

function createPool(): Pool {
  const { DATABASE_URL } = getEnv();

  return new Pool({
    connectionString: DATABASE_URL,
    ssl: shouldUseSsl(DATABASE_URL) ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

function getPool(): Pool {
  if (process.env.NODE_ENV !== "production") {
    if (globalThis.__pipelineDbPool) {
      return globalThis.__pipelineDbPool;
    }

    const devPool = createPool();
    globalThis.__pipelineDbPool = devPool;
    return devPool;
  }

  if (processPool) {
    return processPool;
  }

  processPool = createPool();
  return processPool;
}

export async function sql<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function checkDatabaseConnection(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}

export async function closeDatabasePool(): Promise<void> {
  if (globalThis.__pipelineDbPool) {
    await globalThis.__pipelineDbPool.end();
    globalThis.__pipelineDbPool = undefined;
  }

  if (processPool) {
    await processPool.end();
    processPool = undefined;
  }
}
