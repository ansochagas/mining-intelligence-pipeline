import "server-only";

import OpenAI from "openai";
import { z } from "zod";

import {
  assetsExtractionSchema,
  leadershipExtractionSchema,
  type AssetsExtraction,
  type LeadershipExtraction,
} from "@/lib/pipeline/schemas";
import { truncateText } from "@/lib/pipeline/utils";

const MAX_INPUT_CHARS = 24_000;

type OpenAIExtractionClientConfig = {
  apiKey: string;
  model: string;
  embeddingModel: string;
  embeddingBatchSize: number;
  retryLimit: number;
};

const LEADERSHIP_SYSTEM_PROMPT = `You extract structured leadership data from public mining company pages.
Rules:
- Use only information explicitly present in the source text.
- Do not infer missing facts.
- Include only executive leadership members and board directors/chairs.
- Exclude media contacts, investor relations contacts, advisors, and committee memberships as standalone roles.
- If a field is missing, return null for nullable fields and [] for arrays.
- Return strict JSON only. No markdown, no code fences, no comments.
Output JSON schema:
{
  "people": [
    {
      "full_name": "string",
      "title": "string|null",
      "type": "executive|board|unknown",
      "expertise_tags": ["string"],
      "bullets": ["string"]
    }
  ]
}`;

const ASSETS_SYSTEM_PROMPT = `You extract structured mining asset data from public mining company pages.
Rules:
- Use only information explicitly present in the source text.
- Do not infer missing facts.
- If unavailable, use null for nullable fields and [] for arrays.
- Status must be one of: operating, development, care_and_maintenance, closed, exploration, unknown.
- Prefer explicit operational wording when present:
  - active/producing/in production/operating => operating
  - under construction/feasibility/project development => development
  - exploration/prospect/drilling => exploration
  - care and maintenance/suspended => care_and_maintenance
  - closed/closure/decommissioned => closed
- Use unknown only when the source text has no clear signal.
- Return strict JSON only. No markdown, no code fences, no comments.
Output JSON schema:
{
  "assets": [
    {
      "name": "string",
      "commodities": ["string"],
      "status": "string|null",
      "country": "string|null",
      "region": "string|null",
      "town": "string|null",
      "latitude": "number|null",
      "longitude": "number|null",
      "notes": "string|null"
    }
  ]
}`;

export class OpenAIExtractionClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly embeddingModel: string;
  private readonly embeddingBatchSize: number;
  private readonly retryLimit: number;

  constructor(config: OpenAIExtractionClientConfig) {
    this.client = new OpenAI({ apiKey: config.apiKey });
    this.model = config.model;
    this.embeddingModel = config.embeddingModel;
    this.embeddingBatchSize = config.embeddingBatchSize;
    this.retryLimit = config.retryLimit;
  }

  async extractLeadership(content: string): Promise<LeadershipExtraction> {
    return this.extractWithRetry(leadershipExtractionSchema, LEADERSHIP_SYSTEM_PROMPT, content);
  }

  async extractAssets(content: string): Promise<AssetsExtraction> {
    return this.extractWithRetry(assetsExtractionSchema, ASSETS_SYSTEM_PROMPT, content);
  }

  async embedQuery(query: string): Promise<number[]> {
    const [embedding] = await this.embedTexts([query]);
    if (!embedding) {
      throw new Error("Embedding API returned empty result for query.");
    }

    return embedding;
  }

  async embedTexts(inputTexts: string[]): Promise<number[][]> {
    if (inputTexts.length === 0) {
      return [];
    }

    const embeddings: number[][] = [];

    for (let start = 0; start < inputTexts.length; start += this.embeddingBatchSize) {
      const batch = inputTexts.slice(start, start + this.embeddingBatchSize);
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: batch,
        encoding_format: "float",
      });

      const batchEmbeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);

      if (batchEmbeddings.length !== batch.length) {
        throw new Error(
          `Embedding API returned ${batchEmbeddings.length} vectors for ${batch.length} inputs.`,
        );
      }

      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  private async extractWithRetry<TSchema extends z.ZodTypeAny>(
    schema: TSchema,
    systemPrompt: string,
    rawContent: string,
  ): Promise<z.infer<TSchema>> {
    const content = truncateText(rawContent, MAX_INPUT_CHARS);

    let lastError: Error | null = null;
    let latestResponseText = "";

    for (let attempt = 0; attempt <= this.retryLimit; attempt += 1) {
      try {
        const prompt = this.buildAttemptPrompt(content, attempt, latestResponseText);
        const response = await this.client.chat.completions.create({
          model: this.model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
        });

        const responseText = response.choices[0]?.message?.content ?? "";
        latestResponseText = responseText;

        const parsed = parseJsonFromModel(responseText);
        const validated = schema.parse(parsed);
        return validated;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown OpenAI extraction error");
      }
    }

    throw new Error(`OpenAI extraction failed after retries: ${lastError?.message ?? "unknown error"}`);
  }

  private buildAttemptPrompt(content: string, attempt: number, previousOutput: string): string {
    if (attempt === 0) {
      return `Source text:\n${content}`;
    }

    return `Your previous answer was invalid JSON or did not match schema.
Return corrected strict JSON only.
Previous invalid output:\n${previousOutput}\n\nSource text:\n${content}`;
  }
}

function parseJsonFromModel(responseText: string): unknown {
  const trimmed = responseText.trim();
  if (trimmed.length === 0) {
    throw new Error("Model returned empty response");
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      throw new Error("No JSON object found in model response");
    }

    return JSON.parse(objectMatch[0]);
  }
}
