# Engineering Trade-offs

Reference date: February 20, 2026.

## 1. Sequential vs Concurrent Processing

Decision:

- Sequential processing per company and per source.

Rationale:

- Lower risk of hitting external API rate limits.
- More predictable execution flow for debugging.
- Simpler cost control.

Trade-off:

- Lower raw throughput compared to concurrent execution.

Mitigation:

- Keep sequential design in the MVP.
- Move to bounded concurrency (queue + worker pool) after stability.

## 2. Broad Discovery Search vs Rigid Whitelist

Decision:

- Use open Firecrawl search plus score-based relevance ranking.

Rationale:

- Better autonomy for new companies and non-standard domains.

Trade-off:

- Higher risk of pulling non-official sources.

Mitigation:

- Penalize low-priority domains.
- Deduplicate normalized URLs.
- Cap maximum sources per type.

## 3. LLM Extraction vs Deterministic Parsing

Decision:

- Use structured extraction with `gpt-4.1` and mandatory Zod validation.

Rationale:

- More robust for heterogeneous pages without fixed schema.

Trade-off:

- Token cost.
- Possibility of invalid JSON.

Mitigation:

- Strict JSON prompts.
- Limited retry for repair.
- Input truncation to enforce cost ceilings.

## 4. Content-Hash Idempotency

Decision:

- Use SHA256 per raw document plus unique key by company/hash.

Rationale:

- Avoid reprocessing repeated content.
- Improve traceability.

Trade-off:

- Small text changes produce new hashes.

Mitigation:

- TTL cache by `source_id` to reduce repeated scrape calls in short windows.

## 5. Normalized Relational Model

Decision:

- Keep separate tables (`companies`, `people`, `company_people`, `assets`, `sources`, `raw_documents`).

Rationale:

- Better data consistency.
- Reusable entities and source history.

Trade-off:

- More joins on read queries.

Mitigation:

- Indexes on key lookup paths.
- Endpoints prepared to aggregate by company.

## 6. Optional Embeddings (`pgvector`)

Decision:

- Treat `raw_chunks` and semantic search as an optional bonus.

Rationale:

- Adds retrieval value without blocking core delivery.

Trade-off:

- Extra embedding cost.
- More storage usage.

Mitigation:

- Chunk limits per document.
- Batch embedding generation.
- Automatic fallback when `raw_chunks` is unavailable.

## 7. Cost: Quality vs Efficiency

Decision:

- Prioritize extraction reliability in the MVP and control cost through limits.

Rationale:

- The test prioritizes robustness and structured output quality.

Trade-off:

- Higher cost than aggressive heuristic-only approaches.

Mitigation:

- Per-type source limits.
- Hash dedupe.
- TTL cache.
- Cost monitoring script (`cost:estimate`).
