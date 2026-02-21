import "server-only";

import { sourceTypeSchema, type SourceType } from "@/lib/pipeline/schemas";
import { sanitizeString } from "@/lib/pipeline/utils";

const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v1";
const SOURCE_DISCOVERY_MULTIPLIER = 4;
const SOURCE_DISCOVERY_MAX_LIMIT = 12;
const FIRECRAWL_MAX_ATTEMPTS = 3;

const LOW_PRIORITY_DOMAINS = [
  "marketscreener.com",
  "reuters.com",
  "bloomberg.com",
  "linkedin.com",
  "wikipedia.org",
  "yahoo.com",
  "investing.com",
  "simplywall.st",
];

export type FirecrawlSearchResult = {
  url: string;
  title: string | null;
  description: string | null;
};

type FirecrawlClientConfig = {
  apiKey: string;
  maxSourcesPerType: number;
  baseUrl?: string;
};

export class FirecrawlClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxSourcesPerType: number;
  private readonly searchLimit: number;

  constructor(config: FirecrawlClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? FIRECRAWL_BASE_URL;
    this.maxSourcesPerType = config.maxSourcesPerType;
    this.searchLimit = Math.min(
      Math.max(this.maxSourcesPerType * SOURCE_DISCOVERY_MULTIPLIER, this.maxSourcesPerType),
      SOURCE_DISCOVERY_MAX_LIMIT,
    );
  }

  async discoverByType(companyName: string, sourceType: SourceType): Promise<FirecrawlSearchResult[]> {
    const safeSourceType = sourceTypeSchema.parse(sourceType);
    const query =
      safeSourceType === "leadership"
        ? `${companyName} leadership board executives`
        : `${companyName} operations mines projects assets`;

    const payload = {
      query,
      limit: this.searchLimit,
    };

    const responseData = await this.request<unknown>("/search", payload);
    const items = this.extractArray(responseData);

    return items
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const rawUrl = (item as { url?: unknown }).url;
        if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
          return null;
        }

        const rawTitle = (item as { title?: unknown }).title;
        const rawDescription = (item as { description?: unknown }).description;

        return {
          url: rawUrl.trim(),
          title: typeof rawTitle === "string" ? sanitizeString(rawTitle) : null,
          description: typeof rawDescription === "string" ? sanitizeString(rawDescription) : null,
        } satisfies FirecrawlSearchResult;
      })
      .filter((value): value is FirecrawlSearchResult => value !== null)
      .map((result) => ({
        score: scoreSearchResult({
          companyName,
          sourceType: safeSourceType,
          result,
        }),
        result,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxSourcesPerType)
      .map((entry) => entry.result);
  }

  async scrapeMarkdown(url: string): Promise<string | null> {
    const payload = {
      url,
      formats: ["markdown"],
    };

    const responseData = await this.request<unknown>("/scrape", payload);
    const data = this.extractObject(responseData);

    const markdownCandidates = [
      data?.markdown,
      data?.content,
      data?.rawMarkdown,
      data?.raw_content,
      data?.text,
    ];

    for (const candidate of markdownCandidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate;
      }
    }

    return null;
  }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= FIRECRAWL_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
            "x-api-key": this.apiKey,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const text = await response.text();
          const message = `Firecrawl request failed (${response.status}): ${text.slice(0, 400)}`;
          const isRetryable = response.status >= 500 || response.status === 429;
          if (isRetryable && attempt < FIRECRAWL_MAX_ATTEMPTS) {
            await delay(attempt * 800);
            continue;
          }

          throw new Error(message);
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown Firecrawl request error");
        if (attempt < FIRECRAWL_MAX_ATTEMPTS) {
          await delay(attempt * 800);
          continue;
        }
      }
    }

    throw new Error(lastError?.message ?? "Firecrawl request failed without details");
  }

  private extractArray(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    if (value && typeof value === "object") {
      const data = (value as { data?: unknown }).data;
      if (Array.isArray(data)) {
        return data;
      }
    }

    return [];
  }

  private extractObject(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if ("data" in value) {
        const data = (value as { data?: unknown }).data;
        if (data && typeof data === "object" && !Array.isArray(data)) {
          return data as Record<string, unknown>;
        }
      }

      return value as Record<string, unknown>;
    }

    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function scoreSearchResult(params: {
  companyName: string;
  sourceType: SourceType;
  result: FirecrawlSearchResult;
}): number {
  const raw = `${params.result.url} ${params.result.title ?? ""} ${params.result.description ?? ""}`;
  const text = raw.toLowerCase();

  let score = 0;
  const compactCompany = params.companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compactCompany.length > 2 && text.includes(compactCompany)) {
    score += 40;
  }

  const tokens = params.companyName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);

  for (const token of tokens) {
    if (text.includes(token)) {
      score += 12;
    }
  }

  if (params.sourceType === "leadership") {
    for (const keyword of ["leadership", "board", "executive", "governance", "management"]) {
      if (text.includes(keyword)) {
        score += 6;
      }
    }

    for (const keyword of ["foundation", "media centre", "image gallery", "photo gallery", "press release"]) {
      if (text.includes(keyword)) {
        score -= 12;
      }
    }
  }

  if (params.sourceType === "assets") {
    for (const keyword of ["operations", "mine", "project", "asset", "portfolio", "businesses"]) {
      if (text.includes(keyword)) {
        score += 6;
      }
    }

    for (const keyword of ["news", "media centre", "image gallery", "photo gallery"]) {
      if (text.includes(keyword)) {
        score -= 8;
      }
    }
  }

  try {
    const hostname = new URL(params.result.url).hostname.toLowerCase();
    const compactHostname = hostname.replace(/[^a-z0-9]/g, "");
    if (compactCompany.length > 2 && compactHostname.includes(compactCompany)) {
      score += 10;
    }

    for (const token of tokens) {
      if (compactHostname.includes(token)) {
        score += 3;
      }
    }

    if (LOW_PRIORITY_DOMAINS.some((domain) => hostname.endsWith(domain))) {
      score -= 18;
    }
  } catch {
    score -= 10;
  }

  return score;
}
