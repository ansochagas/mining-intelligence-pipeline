import "server-only";

import { sql } from "@/lib/db";
import type {
  AssetStatus,
  PersonType,
  SourceType,
} from "@/lib/pipeline/schemas";

export type CompanyRecord = {
  id: string;
  name: string;
  created_at: string;
};

export type SourceRecord = {
  id: number;
  company_id: string;
  url: string;
  source_type: SourceType;
  discovery_query: string | null;
  discovered_at: string;
};

export type UpsertRawDocumentResult = {
  id: number;
  inserted: boolean;
};

export type RecentRawDocument = {
  id: number;
  content_hash: string;
  scraped_at: string;
};

export type RawChunkRecord = {
  id: number;
  raw_document_id: number;
  company_id: string;
  source_id: number | null;
  chunk_index: number;
  content: string;
  token_count: number | null;
};

export type SemanticSearchResult = {
  chunk_id: number;
  raw_document_id: number;
  company_id: string;
  company_name: string;
  source_id: number | null;
  source_type: SourceType | null;
  source_url: string | null;
  chunk_index: number;
  content: string;
  similarity: number;
};

export type CompanyDetails = {
  company: CompanyRecord;
  leadership: Array<{
    person_id: string;
    full_name: string;
    title: string | null;
    type: PersonType;
    expertise_tags: string[];
    bullets: string[];
    source_id: number | null;
    source_url: string | null;
  }>;
  assets: Array<{
    asset_id: string;
    name: string;
    commodities: string[];
    status: AssetStatus;
    country: string | null;
    region: string | null;
    town: string | null;
    latitude: number | null;
    longitude: number | null;
    notes: string | null;
    source_id: number | null;
    source_url: string | null;
  }>;
  sources: SourceRecord[];
};

export async function upsertCompany(name: string): Promise<CompanyRecord> {
  const result = await sql<CompanyRecord>(
    `
      INSERT INTO companies (name)
      VALUES ($1)
      ON CONFLICT (normalized_name)
      DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = NOW()
      RETURNING id, name, created_at
    `,
    [name],
  );

  return result.rows[0];
}

export async function upsertSource(params: {
  companyId: string;
  url: string;
  sourceType: SourceType;
  discoveryQuery: string;
}): Promise<SourceRecord> {
  const result = await sql<SourceRecord>(
    `
      INSERT INTO sources (company_id, url, source_type, discovery_query)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (company_id, normalized_url)
      DO UPDATE SET
        source_type = CASE
          WHEN sources.source_type = 'unknown' THEN EXCLUDED.source_type
          ELSE sources.source_type
        END,
        discovery_query = EXCLUDED.discovery_query,
        discovered_at = NOW()
      RETURNING id, company_id, url, source_type, discovery_query, discovered_at
    `,
    [params.companyId, params.url, params.sourceType, params.discoveryQuery],
  );

  return result.rows[0];
}

export async function upsertRawDocument(params: {
  sourceId: number;
  companyId: string;
  url: string;
  contentMarkdown: string;
  contentHash: string;
}): Promise<UpsertRawDocumentResult> {
  const result = await sql<UpsertRawDocumentResult>(
    `
      WITH inserted AS (
        INSERT INTO raw_documents (
          source_id,
          company_id,
          url,
          content_markdown,
          content_hash
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (company_id, content_hash)
        DO NOTHING
        RETURNING id, TRUE AS inserted
      )
      SELECT id, inserted
      FROM inserted
      UNION ALL
      SELECT rd.id, FALSE AS inserted
      FROM raw_documents rd
      WHERE rd.company_id = $2
        AND rd.content_hash = $5
      LIMIT 1
    `,
    [params.sourceId, params.companyId, params.url, params.contentMarkdown, params.contentHash],
  );

  return result.rows[0];
}

export async function findRecentRawDocumentBySource(params: {
  companyId: string;
  sourceId: number;
  maxAgeHours: number;
}): Promise<RecentRawDocument | null> {
  if (params.maxAgeHours <= 0) {
    return null;
  }

  const result = await sql<RecentRawDocument>(
    `
      SELECT id, content_hash, scraped_at
      FROM raw_documents
      WHERE company_id = $1
        AND source_id = $2
        AND scraped_at >= NOW() - make_interval(hours => $3::int)
      ORDER BY scraped_at DESC
      LIMIT 1
    `,
    [params.companyId, params.sourceId, params.maxAgeHours],
  );

  return result.rows[0] ?? null;
}

export async function isRawChunksTableAvailable(): Promise<boolean> {
  const result = await sql<{ available: boolean }>(
    `
      SELECT to_regclass('public.raw_chunks') IS NOT NULL AS available
    `,
  );

  return result.rows[0]?.available ?? false;
}

export async function replaceRawChunksForDocument(params: {
  rawDocumentId: number;
  companyId: string;
  sourceId: number | null;
  chunks: Array<{
    chunkIndex: number;
    content: string;
    embedding: number[] | null;
    tokenCount: number | null;
  }>;
}): Promise<number> {
  await sql("DELETE FROM raw_chunks WHERE raw_document_id = $1", [params.rawDocumentId]);

  let inserted = 0;
  for (const chunk of params.chunks) {
    await sql(
      `
        INSERT INTO raw_chunks (
          raw_document_id,
          company_id,
          source_id,
          chunk_index,
          content,
          embedding,
          token_count
        )
        VALUES ($1, $2, $3, $4, $5, $6::vector, $7)
        ON CONFLICT (raw_document_id, chunk_index)
        DO UPDATE SET
          source_id = EXCLUDED.source_id,
          content = EXCLUDED.content,
          embedding = EXCLUDED.embedding,
          token_count = EXCLUDED.token_count
      `,
      [
        params.rawDocumentId,
        params.companyId,
        params.sourceId,
        chunk.chunkIndex,
        chunk.content,
        chunk.embedding ? toVectorLiteral(chunk.embedding) : null,
        chunk.tokenCount,
      ],
    );
    inserted += 1;
  }

  return inserted;
}

export async function searchRawChunksByEmbedding(params: {
  queryEmbedding: number[];
  limit: number;
}): Promise<SemanticSearchResult[]> {
  const limit = Math.max(1, Math.min(params.limit, 50));
  const vectorLiteral = toVectorLiteral(params.queryEmbedding);

  const result = await sql<SemanticSearchResult>(
    `
      SELECT
        rc.id AS chunk_id,
        rc.raw_document_id,
        rc.company_id,
        c.name AS company_name,
        rc.source_id,
        s.source_type,
        s.url AS source_url,
        rc.chunk_index,
        rc.content,
        (1 - (rc.embedding <=> $1::vector))::float8 AS similarity
      FROM raw_chunks rc
      INNER JOIN companies c ON c.id = rc.company_id
      LEFT JOIN sources s ON s.id = rc.source_id
      WHERE rc.embedding IS NOT NULL
      ORDER BY rc.embedding <=> $1::vector
      LIMIT $2
    `,
    [vectorLiteral, limit],
  );

  return result.rows;
}

export async function upsertPerson(params: {
  fullName: string;
  title: string | null;
  personType: PersonType;
  expertiseTags: string[];
  bullets: string[];
}): Promise<{ id: string }> {
  const result = await sql<{ id: string }>(
    `
      INSERT INTO people (
        full_name,
        title,
        person_type,
        expertise_tags,
        bullets
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (normalized_full_name, normalized_title)
      DO UPDATE SET
        person_type = CASE
          WHEN people.person_type = 'unknown' THEN EXCLUDED.person_type
          ELSE people.person_type
        END,
        expertise_tags = CASE
          WHEN COALESCE(array_length(people.expertise_tags, 1), 0) = 0 THEN EXCLUDED.expertise_tags
          ELSE people.expertise_tags
        END,
        bullets = CASE
          WHEN COALESCE(array_length(people.bullets, 1), 0) = 0 THEN EXCLUDED.bullets
          ELSE people.bullets
        END,
        updated_at = NOW()
      RETURNING id
    `,
    [params.fullName, params.title, params.personType, params.expertiseTags, params.bullets],
  );

  return result.rows[0];
}

export async function upsertCompanyPerson(params: {
  companyId: string;
  personId: string;
  sourceId: number | null;
  observedTitle: string | null;
  observedPersonType: PersonType;
}): Promise<void> {
  await sql(
    `
      INSERT INTO company_people (
        company_id,
        person_id,
        source_id,
        observed_title,
        observed_person_type
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (company_id, person_id)
      DO UPDATE SET
        source_id = COALESCE(company_people.source_id, EXCLUDED.source_id),
        observed_title = COALESCE(EXCLUDED.observed_title, company_people.observed_title),
        observed_person_type = CASE
          WHEN company_people.observed_person_type = 'unknown' THEN EXCLUDED.observed_person_type
          ELSE company_people.observed_person_type
        END,
        updated_at = NOW()
    `,
    [
      params.companyId,
      params.personId,
      params.sourceId,
      params.observedTitle,
      params.observedPersonType,
    ],
  );
}

export async function upsertAsset(params: {
  companyId: string;
  sourceId: number | null;
  name: string;
  commodities: string[];
  status: AssetStatus;
  country: string | null;
  region: string | null;
  town: string | null;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
}): Promise<void> {
  await sql(
    `
      INSERT INTO assets (
        company_id,
        source_id,
        name,
        commodities,
        status,
        country,
        region,
        town,
        latitude,
        longitude,
        notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (company_id, normalized_name)
      DO UPDATE SET
        source_id = COALESCE(assets.source_id, EXCLUDED.source_id),
        commodities = CASE
          WHEN COALESCE(array_length(assets.commodities, 1), 0) = 0 THEN EXCLUDED.commodities
          ELSE assets.commodities
        END,
        status = CASE
          WHEN assets.status = 'unknown' THEN EXCLUDED.status
          ELSE assets.status
        END,
        country = COALESCE(assets.country, EXCLUDED.country),
        region = COALESCE(assets.region, EXCLUDED.region),
        town = COALESCE(assets.town, EXCLUDED.town),
        latitude = COALESCE(assets.latitude, EXCLUDED.latitude),
        longitude = COALESCE(assets.longitude, EXCLUDED.longitude),
        notes = COALESCE(assets.notes, EXCLUDED.notes),
        updated_at = NOW()
    `,
    [
      params.companyId,
      params.sourceId,
      params.name,
      params.commodities,
      params.status,
      params.country,
      params.region,
      params.town,
      params.latitude,
      params.longitude,
      params.notes,
    ],
  );
}

export async function listCompanies(): Promise<CompanyRecord[]> {
  const result = await sql<CompanyRecord>(
    `
      SELECT id, name, created_at
      FROM companies
      ORDER BY created_at DESC
    `,
  );

  return result.rows;
}

export async function getCompanyDetails(companyId: string): Promise<CompanyDetails | null> {
  const companyResult = await sql<CompanyRecord>(
    `
      SELECT id, name, created_at
      FROM companies
      WHERE id = $1
    `,
    [companyId],
  );

  const company = companyResult.rows[0];
  if (!company) {
    return null;
  }

  const leadershipResult = await sql<CompanyDetails["leadership"][number]>(
    `
      SELECT
        p.id AS person_id,
        p.full_name,
        COALESCE(cp.observed_title, p.title) AS title,
        CASE
          WHEN cp.observed_person_type <> 'unknown' THEN cp.observed_person_type
          ELSE p.person_type
        END AS type,
        p.expertise_tags,
        p.bullets,
        cp.source_id,
        s.url AS source_url
      FROM company_people cp
      INNER JOIN people p ON p.id = cp.person_id
      LEFT JOIN sources s ON s.id = cp.source_id
      WHERE cp.company_id = $1
      ORDER BY p.full_name ASC
    `,
    [companyId],
  );

  const assetsResult = await sql<CompanyDetails["assets"][number]>(
    `
      SELECT
        a.id AS asset_id,
        a.name,
        a.commodities,
        a.status,
        a.country,
        a.region,
        a.town,
        a.latitude,
        a.longitude,
        a.notes,
        a.source_id,
        s.url AS source_url
      FROM assets a
      LEFT JOIN sources s ON s.id = a.source_id
      WHERE a.company_id = $1
      ORDER BY a.name ASC
    `,
    [companyId],
  );

  const sourcesResult = await sql<SourceRecord>(
    `
      SELECT id, company_id, url, source_type, discovery_query, discovered_at
      FROM sources
      WHERE company_id = $1
      ORDER BY discovered_at DESC
    `,
    [companyId],
  );

  return {
    company,
    leadership: leadershipResult.rows,
    assets: assetsResult.rows,
    sources: sourcesResult.rows,
  };
}

function toVectorLiteral(values: number[]): string {
  return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}
