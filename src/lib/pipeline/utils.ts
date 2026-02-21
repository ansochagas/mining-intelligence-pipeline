import { createHash } from "crypto";

import type { AssetStatus } from "@/lib/pipeline/schemas";

const ASSET_STATUS_MAP: Record<string, AssetStatus> = {
  operating: "operating",
  operation: "operating",
  operational: "operating",
  "in production": "operating",
  production: "operating",
  "in operation": "operating",
  "ramp up": "operating",
  "ramp-up": "operating",
  commissioned: "operating",
  producing: "operating",
  active: "operating",
  development: "development",
  developed: "development",
  construction: "development",
  "under construction": "development",
  expansion: "development",
  feasibility: "development",
  "pre feasibility": "development",
  "pre-feasibility": "development",
  prefeasibility: "development",
  "scoping study": "development",
  "bankable feasibility": "development",
  build: "development",
  "care and maintenance": "care_and_maintenance",
  care_and_maintenance: "care_and_maintenance",
  "care & maintenance": "care_and_maintenance",
  "temporarily suspended": "care_and_maintenance",
  "on hold": "care_and_maintenance",
  standby: "care_and_maintenance",
  suspended: "care_and_maintenance",
  closed: "closed",
  closure: "closed",
  "shut down": "closed",
  "shut-down": "closed",
  decommissioned: "closed",
  retired: "closed",
  abandoned: "closed",
  exploration: "exploration",
  exploration_stage: "exploration",
  "advanced exploration": "exploration",
  "early exploration": "exploration",
  "brownfield exploration": "exploration",
  "greenfield exploration": "exploration",
  prospecting: "exploration",
  drilling: "exploration",
  prospect: "exploration",
  unknown: "unknown",
};

export function splitCompanyInput(input: string): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const rawName of input.split(",")) {
    const name = rawName.trim().replace(/\s+/g, " ");
    if (!name) {
      continue;
    }

    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(name);
  }

  return output;
}

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function normalizeAssetStatus(
  rawStatus: string | null | undefined,
  fallbackText: string | null | undefined = null,
): AssetStatus {
  const fromStatus = normalizeAssetStatusFromText(rawStatus);
  if (fromStatus !== "unknown") {
    return fromStatus;
  }

  return inferAssetStatusFromFallback(fallbackText);
}

function normalizeAssetStatusFromText(raw: string | null | undefined): AssetStatus {
  if (!raw) {
    return "unknown";
  }

  const normalized = raw.trim().toLowerCase().replace(/[-\s]+/g, " ");
  return ASSET_STATUS_MAP[normalized] ?? "unknown";
}

function inferAssetStatusFromFallback(raw: string | null | undefined): AssetStatus {
  if (!raw) {
    return "unknown";
  }

  const text = raw.toLowerCase();

  const keywordSets: Array<{ status: AssetStatus; keywords: string[] }> = [
    {
      status: "care_and_maintenance",
      keywords: ["care and maintenance", "care & maintenance", "temporarily suspended", "on hold"],
    },
    {
      status: "closed",
      keywords: ["decommissioned", "shut down", "closure", "closed", "retired", "abandoned"],
    },
    {
      status: "operating",
      keywords: ["in production", "in operation", "operating", "production", "producing", "commissioned"],
    },
    {
      status: "development",
      keywords: [
        "under construction",
        "construction",
        "feasibility",
        "pre-feasibility",
        "prefeasibility",
        "scoping study",
        "expansion",
      ],
    },
    {
      status: "exploration",
      keywords: ["exploration", "prospect", "prospecting", "drilling", "resource definition"],
    },
  ];

  for (const item of keywordSets) {
    if (item.keywords.some((keyword) => text.includes(keyword))) {
      return item.status;
    }
  }

  return "unknown";
}

export function sanitizeString(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

export function normalizeTitle(value: string | null | undefined): string | null {
  const sanitized = sanitizeString(value);
  if (!sanitized) {
    return null;
  }

  return sanitized
    .replace(/[,:;]+/g, "")
    .replace(/&/g, "and")
    .replace(/[-]+/g, " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return value.slice(0, maxChars);
}
