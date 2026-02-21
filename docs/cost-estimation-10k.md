# Cost Estimate - 10,000 Companies/Month

Reference date: February 21, 2026.

## Objective

Estimate monthly operating cost for processing 10,000 companies.

The estimate uses:

- real metrics from the database (collected locally)
- official pricing from OpenAI and Firecrawl
- operation scenarios (conservative, baseline, and cache-optimized)

## Official Pricing Sources

- OpenAI pricing (`gpt-4.1` and embeddings):  
  https://platform.openai.com/docs/pricing
- Firecrawl pricing (plans and credits):  
  https://www.firecrawl.dev/pricing
- Firecrawl search credits (2 credits per 10 results):  
  https://docs.firecrawl.dev/features/search
- Firecrawl scrape credits (1 credit per page):  
  https://docs.firecrawl.dev/usage-guide

## Methodology

Executed command:

```bash
npm run cost:estimate -- --companies 10000
```

Script:

- `scripts/estimate-monthly-cost.ts`

Observed database metrics (current sample):

- sampled companies: `5`
- average documents per company: `6.8`
- average document size: `11,917` characters
- average chunks per document: `14.29`
- average tokens per chunk: `110.09`

Economic assumptions used in the script:

- OpenAI `gpt-4.1` input: `$2.00 / 1M tokens`
- OpenAI `gpt-4.1` output: `$8.00 / 1M tokens`
- OpenAI `text-embedding-3-small`: `$0.02 / 1M tokens`
- Firecrawl search: `2` credits per `10` results
- Firecrawl scrape: `1` credit per page
- `2` searches per company (`leadership` + `assets`)
- `12` results per search

## Result (10,000 companies/month)

### 1) Conservative

- docs/company: `8.5`
- cache hit: `0%`
- Firecrawl: `133,000` credits/month
- estimated Firecrawl plan: `Standard` with overage (`1` package)
- Firecrawl cost: `$130.00`
- OpenAI cost: `$1,160.25`
- total cost: `$1,290.25 / month`

### 2) Baseline

- docs/company: `6.8`
- cache hit: `0%`
- Firecrawl: `116,000` credits/month
- estimated Firecrawl plan: `Standard` with overage (`1` package)
- Firecrawl cost: `$130.00`
- OpenAI cost: `$804.44`
- total cost: `$934.44 / month`

### 3) Cache-Optimized

- docs/company: `6.12`
- cache hit: `35%`
- Firecrawl: `87,780` credits/month
- estimated Firecrawl plan: `Standard` without overage
- Firecrawl cost: `$83.00`
- OpenAI cost: `$449.91`
- total cost: `$532.91 / month`

## Executive Summary

- estimated range: **$532.91 to $1,290.25 / month**
- current baseline scenario: **$934.44 / month**
- highest cost component: **extraction tokens (`gpt-4.1`)**
- embeddings (`text-embedding-3-small`) are a low-cost component in the current design

## Important Notes

- Values vary with discovery quality and page size.
- Firecrawl prices may change by plan/region/billing.
- Current sample size is 5 companies; expanding the sample keeps improving confidence.
- The script allows quick recalculation after each pipeline adjustment.
