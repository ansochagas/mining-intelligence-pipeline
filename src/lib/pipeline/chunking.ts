export type TextChunk = {
  chunkIndex: number;
  content: string;
  tokenCount: number;
};

export type ChunkingOptions = {
  targetChars: number;
  overlapChars: number;
  maxChunks: number;
};

const MIN_BREAK_FRACTION = 0.6;

export function chunkText(rawText: string, options: ChunkingOptions): TextChunk[] {
  const text = normalizeText(rawText);
  if (!text) {
    return [];
  }

  const targetChars = Math.max(200, options.targetChars);
  const overlapChars = Math.max(0, Math.min(options.overlapChars, Math.floor(targetChars / 2)));
  const maxChunks = Math.max(1, options.maxChunks);

  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < text.length && chunks.length < maxChunks) {
    let end = Math.min(start + targetChars, text.length);
    if (end < text.length) {
      const adjusted = findBestBreakPoint(text, start, end, targetChars);
      if (adjusted !== null) {
        end = adjusted;
      }
    }

    const content = text.slice(start, end).trim();
    if (content.length > 0) {
      chunks.push({
        chunkIndex: chunks.length,
        content,
        tokenCount: estimateTokenCount(content),
      });
    }

    if (end >= text.length) {
      break;
    }

    const nextStart = Math.max(end - overlapChars, start + 1);
    start = nextStart;
  }

  return chunks;
}

function normalizeText(value: string): string {
  return value
    .replace(/\r/g, "")
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findBestBreakPoint(
  text: string,
  start: number,
  preferredEnd: number,
  targetChars: number,
): number | null {
  const minAcceptableEnd = start + Math.floor(targetChars * MIN_BREAK_FRACTION);
  if (minAcceptableEnd >= preferredEnd) {
    return null;
  }

  const window = text.slice(minAcceptableEnd, preferredEnd + 1);
  const candidates = ["\n\n", "\n", ". ", "; ", ", ", " "];

  for (const marker of candidates) {
    const idx = window.lastIndexOf(marker);
    if (idx >= 0) {
      return minAcceptableEnd + idx + marker.length;
    }
  }

  return null;
}

function estimateTokenCount(content: string): number {
  const words = content.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words * 1.3));
}
