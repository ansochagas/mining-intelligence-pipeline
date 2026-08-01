# Mining Intelligence Pipeline

> End-to-end AI and data pipeline for web discovery, structured extraction, PostgreSQL persistence, traceable sources, and semantic search.

This project demonstrates how fragmented public information can be transformed into structured, searchable, and auditable intelligence.

It was designed as both a technical implementation and a product exercise involving scope definition, cost analysis, traceability, risk management, and documented trade-offs.

## Product and technical decisions

- Traceability over opaque answers: extracted information remains connected to its public sources.
- Structured outputs: leadership and asset information are validated before persistence.
- Cost awareness: the project includes an operating-cost estimate for processing 10,000 companies per month.
- Controlled duplication: source caching and content hashes reduce unnecessary processing.
- Progressive complexity: semantic search is optional rather than a dependency for the core pipeline.
- Explicit trade-offs: engineering decisions, limitations, risks, and mitigation options are documented.

## My role

I was responsible for the end-to-end definition and implementation of the project, including:

- problem decomposition and scope definition;
- pipeline and data-model decisions;
- API and interface design;
- structured extraction and validation;
- source traceability;
- semantic-search implementation;
- cost estimation;
- quality review;
- documentation of risks and trade-offs.

The project reflects my approach as a Technical Product Manager: connecting product requirements, technical feasibility, operating cost, user experience, and delivery evidence.

I built this project as a technical assessment to show an end-to-end automation pipeline for mining intelligence.

The system takes a list of mining companies, discovers relevant public pages, extracts structured data (leadership and assets), stores results in PostgreSQL, and exposes everything through API + UI. Semantic search is included as an optional bonus using `pgvector`.

## What Is Included

- End-to-end pipeline: discover -> scrape -> extract -> persist
- Content hash deduplication and source cache support
- API endpoints: `/api/run`, `/api/companies`, `/api/companies/:id`, `/api/search`
- UI to run the pipeline and inspect persisted company results
- Cost estimate for 10,000 companies/month
- Technical quality snapshot and documented trade-offs

Reference docs:

- `docs/trade-offs.md`
- `docs/quality-snapshot.md`
- `docs/cost-estimation-10k.md`

## Tech Stack

- Next.js (App Router) + TypeScript
- PostgreSQL (Neon) with `pg`
- Input/output validation with `zod`
- Web discovery and scraping via Firecrawl
- Structured extraction and embeddings via OpenAI
- Semantic search with `pgvector` (`raw_chunks` table)

## Requirements

- Node.js 20+
- npm 10+
- PostgreSQL (Neon recommended)

## Quick Setup

1. Install dependencies:

```bash
npm install
```

2. Create your local env file:

PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Bash:

```bash
cp .env.example .env.local
```

3. Fill `.env.local`.

Required to run API/UI:

- `DATABASE_URL`

Required to run the pipeline and semantic search:

- `OPENAI_API_KEY`
- `FIRECRAWL_API_KEY`

Optional (defaults):

- `SCRAPE_CACHE_TTL_HOURS` (`24`)
- `CHUNK_TARGET_CHARS` (`1000`)
- `CHUNK_OVERLAP_CHARS` (`120`)
- `MAX_CHUNKS_PER_DOCUMENT` (`30`)
- `EMBEDDING_BATCH_SIZE` (`16`)
- `SEARCH_TOP_K` (`8`)

4. Apply database schema:

```sql
\i database/init.sql
```

If you are using Neon, run the contents of `database/init.sql` in the SQL Editor.

5. Start the app:

```bash
npm run dev
```

6. Optional health check:

- `GET http://localhost:3000/api/health/db`

## Manual Usage Flow

1. Open `http://localhost:3000`.
2. Enter company names separated by commas.
3. Click `Run Pipeline`.
4. Open `View details` for each company to inspect leadership, assets, and sources.
5. Test semantic search from the same screen (`/api/search` behind the UI).

## Main Endpoints

- `POST /api/run`
  - Body: `{ "input": "BHP, Rio Tinto" }`
  - Sequential processing per company
  - Includes cache and hash-based dedupe

- `GET /api/companies`
  - Lists processed companies

- `GET /api/companies/:id`
  - Returns company + leadership + assets + sources

- `GET /api/search?q=...&limit=...`
  - Semantic search over `raw_chunks`

- `GET /api/health/db`
  - Database connectivity check

## Useful Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
- `npm run typecheck`
- `npm run run:single -- "<company>"`
- `npm run search:test -- "<query>"`
- `npm run chunks:backfill`
- `npm run assets:reextract`
- `npm run cost:estimate -- --companies 10000`

## Delivery Evidence

- `docs/quality-snapshot.md`: current quality and integrity indicators
- `docs/cost-estimation-10k.md`: methodology and cost estimate for 10k/month
- `docs/trade-offs.md`: engineering decisions, risks, and mitigations

## Credentials Note

Credentials are not versioned.
This repository includes only `.env.example`.
For local execution, create `.env.local` with your own keys (or temporary keys).
