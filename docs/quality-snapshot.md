# Quality Snapshot

Reference date: February 21, 2026.

## Scope

Operational snapshot of the pipeline to evaluate:

- end-to-end functional coverage
- data integrity
- structured extraction quality
- semantic coverage (`pgvector`)
- estimated cost for 10,000 companies/month

## How It Was Measured

Executed commands:

```bash
npm run lint
npm run typecheck
npm run build
npm run run:single -- "Fortescue"
npm run chunks:backfill
npm run assets:reextract
npm run cost:estimate -- --companies 10000
```

Additional SQL audit:

- key consistency and links across `sources`, `raw_documents`, `assets`, `company_people`, `raw_chunks`
- `raw_chunks` coverage by `raw_document`
- field completeness quality for leadership and assets

## Current Result

### 1) Functional Coverage

- End-to-end pipeline with a new company: **ok** (`Fortescue`)
- Main APIs (`/api/run`, `/api/companies`, `/api/companies/:id`, `/api/search`): **ok**
- UI displaying persisted data: **ok**

### 2) Current Database Volume

- companies: **5**
- sources: **34**
- raw_documents: **34**
- people: **154**
- assets: **110**
- raw_chunks: **486**

### 3) Relational Integrity

All critical checks are at **0** inconsistencies:

- `raw_documents.company_id` vs `sources.company_id`
- `assets.company_id` vs `sources.company_id`
- `company_people.company_id` vs `sources.company_id`
- `raw_chunks.company_id` vs `raw_documents.company_id`

### 4) Extraction Quality

Leadership:

- unknown type: **0.00%**
- missing title: **0.00%**

Assets:

- unknown status: **23.64%** (26/110)
- missing country: **15.45%**

Note:

- Unknown status dropped from **31.25%** to **23.64%** after conservative asset re-extraction from `raw_documents`.

### 5) Semantic Coverage (`pgvector`)

- docs with chunks: **34/34 (100.00%)**
- previous coverage: **52.94%**
- gain after backfill: **+47.06 p.p.**

### 6) Discovery Quality

- low-priority sources (penalized domains): **2.94%** (1/34)
- companies with both source types (`leadership` + `assets`): **5/5**

### 7) Estimated Cost (10,000 companies/month)

- conservative: **$1,290.25/month**
- baseline: **$934.44/month**
- cache-optimized: **$532.91/month**

Interpretation:

- baseline scenario remains below **$1k/month**.

## Conclusion

Current state: **ready for technical delivery**.

Strengths:

- stable, idempotent, and observable pipeline
- consistent relational model
- semantic search with full coverage of current documents
- competitive baseline cost for the requested scope

Main residual risk:

- a portion of assets still remains with `status = unknown` when source pages do not provide clear signals.
