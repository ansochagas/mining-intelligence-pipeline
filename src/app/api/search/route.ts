import { NextResponse } from "next/server";

import { OpenAIExtractionClient } from "@/lib/clients/openai";
import { isRawChunksTableAvailable, searchRawChunksByEmbedding } from "@/lib/data-access";
import { getEnv } from "@/lib/env";

export async function GET(request: Request) {
  try {
    const env = getEnv();
    const requestUrl = new URL(request.url);
    const query = requestUrl.searchParams.get("q")?.trim() ?? "";
    const limitParam = requestUrl.searchParams.get("limit");
    const requestedLimit = limitParam ? Number(limitParam) : env.SEARCH_TOP_K;
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 50)) : env.SEARCH_TOP_K;

    if (!query) {
      return NextResponse.json(
        {
          error: "Missing query",
          message: "Use /api/search?q=your+query",
        },
        { status: 400 },
      );
    }

    if (!env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          error: "Missing OPENAI_API_KEY",
          message: "Set OPENAI_API_KEY before using semantic search.",
        },
        { status: 500 },
      );
    }

    const chunksTableAvailable = await isRawChunksTableAvailable();
    if (!chunksTableAvailable) {
      return NextResponse.json(
        {
          error: "raw_chunks unavailable",
          message: "raw_chunks table is missing. Enable pgvector and run database/init.sql again.",
        },
        { status: 501 },
      );
    }

    const openai = new OpenAIExtractionClient({
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL,
      embeddingModel: env.EMBEDDING_MODEL,
      embeddingBatchSize: env.EMBEDDING_BATCH_SIZE,
      retryLimit: env.EXTRACT_RETRY_LIMIT,
    });

    const queryEmbedding = await openai.embedQuery(query);
    const matches = await searchRawChunksByEmbedding({
      queryEmbedding,
      limit,
    });

    const results = matches.map((item) => ({
      chunkId: item.chunk_id,
      rawDocumentId: item.raw_document_id,
      companyId: item.company_id,
      companyName: item.company_name,
      sourceId: item.source_id,
      sourceType: item.source_type,
      sourceUrl: item.source_url,
      chunkIndex: item.chunk_index,
      similarity: Number(item.similarity.toFixed(4)),
      snippet: item.content.slice(0, 420),
    }));

    return NextResponse.json(
      {
        query,
        limit,
        count: results.length,
        results,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Semantic search failed", error);
    return NextResponse.json(
      {
        error: "Semantic search failed",
        message: error instanceof Error ? error.message : "Unknown search error",
      },
      { status: 500 },
    );
  }
}
