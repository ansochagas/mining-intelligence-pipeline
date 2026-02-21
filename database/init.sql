BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN undefined_file THEN
    RAISE NOTICE 'pgvector extension is not installed on this Postgres instance.';
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'No privilege to install pgvector extension. Enable it manually in Neon.';
END
$$;

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_name TEXT GENERATED ALWAYS AS (LOWER(BTRIM(name))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT companies_name_not_blank CHECK (CHAR_LENGTH(BTRIM(name)) > 0),
  CONSTRAINT companies_normalized_name_unique UNIQUE (normalized_name)
);

CREATE TABLE IF NOT EXISTS sources (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  normalized_url TEXT GENERATED ALWAYS AS (LOWER(BTRIM(url))) STORED,
  source_type TEXT NOT NULL,
  discovery_query TEXT,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sources_url_not_blank CHECK (CHAR_LENGTH(BTRIM(url)) > 0),
  CONSTRAINT sources_source_type_check CHECK (source_type IN ('leadership', 'assets', 'unknown')),
  CONSTRAINT sources_company_url_unique UNIQUE (company_id, normalized_url)
);

CREATE TABLE IF NOT EXISTS raw_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  content_hash CHAR(64) NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT raw_documents_url_not_blank CHECK (CHAR_LENGTH(BTRIM(url)) > 0),
  CONSTRAINT raw_documents_content_not_blank CHECK (CHAR_LENGTH(BTRIM(content_markdown)) > 0),
  CONSTRAINT raw_documents_content_hash_format CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT raw_documents_company_hash_unique UNIQUE (company_id, content_hash)
);

CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  title TEXT,
  normalized_full_name TEXT GENERATED ALWAYS AS (LOWER(BTRIM(full_name))) STORED,
  normalized_title TEXT GENERATED ALWAYS AS (LOWER(BTRIM(COALESCE(title, '')))) STORED,
  person_type TEXT NOT NULL DEFAULT 'unknown',
  expertise_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  bullets TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT people_full_name_not_blank CHECK (CHAR_LENGTH(BTRIM(full_name)) > 0),
  CONSTRAINT people_person_type_check CHECK (person_type IN ('executive', 'board', 'unknown')),
  CONSTRAINT people_name_title_unique UNIQUE (normalized_full_name, normalized_title)
);

CREATE TABLE IF NOT EXISTS company_people (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  source_id BIGINT REFERENCES sources(id) ON DELETE SET NULL,
  observed_title TEXT,
  observed_person_type TEXT NOT NULL DEFAULT 'unknown',
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, person_id),
  CONSTRAINT company_people_person_type_check CHECK (observed_person_type IN ('executive', 'board', 'unknown'))
);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_id BIGINT REFERENCES sources(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  normalized_name TEXT GENERATED ALWAYS AS (LOWER(BTRIM(name))) STORED,
  commodities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'unknown',
  country TEXT,
  region TEXT,
  town TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT assets_name_not_blank CHECK (CHAR_LENGTH(BTRIM(name)) > 0),
  CONSTRAINT assets_status_check CHECK (status IN ('operating', 'development', 'care_and_maintenance', 'closed', 'exploration', 'unknown')),
  CONSTRAINT assets_latitude_check CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
  CONSTRAINT assets_longitude_check CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  CONSTRAINT assets_company_name_unique UNIQUE (company_id, normalized_name)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE '
      CREATE TABLE IF NOT EXISTS raw_chunks (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        raw_document_id BIGINT NOT NULL REFERENCES raw_documents(id) ON DELETE CASCADE,
        company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        source_id BIGINT REFERENCES sources(id) ON DELETE SET NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding VECTOR(1536),
        token_count INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT raw_chunks_chunk_index_non_negative CHECK (chunk_index >= 0),
        CONSTRAINT raw_chunks_content_not_blank CHECK (CHAR_LENGTH(BTRIM(content)) > 0),
        CONSTRAINT raw_chunks_document_index_unique UNIQUE (raw_document_id, chunk_index)
      )
    ';
  ELSE
    RAISE NOTICE 'raw_chunks table skipped because pgvector is unavailable.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_people_updated_at ON people;
CREATE TRIGGER trg_people_updated_at
BEFORE UPDATE ON people
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_company_people_updated_at ON company_people;
CREATE TRIGGER trg_company_people_updated_at
BEFORE UPDATE ON company_people
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_assets_updated_at ON assets;
CREATE TRIGGER trg_assets_updated_at
BEFORE UPDATE ON assets
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_sources_company_type ON sources (company_id, source_type);
CREATE INDEX IF NOT EXISTS idx_raw_documents_source ON raw_documents (source_id);
CREATE INDEX IF NOT EXISTS idx_raw_documents_company ON raw_documents (company_id);
CREATE INDEX IF NOT EXISTS idx_company_people_person ON company_people (person_id);
CREATE INDEX IF NOT EXISTS idx_assets_company_status ON assets (company_id, status);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'raw_chunks'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_raw_chunks_document ON raw_chunks (raw_document_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_raw_chunks_company ON raw_chunks (company_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_raw_chunks_source ON raw_chunks (source_id)';
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_raw_chunks_embedding_cosine ON raw_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)';
    EXCEPTION
      WHEN undefined_object THEN
        RAISE NOTICE 'ivfflat operator class unavailable. Create vector index manually.';
      WHEN undefined_function THEN
        RAISE NOTICE 'vector cosine ops unavailable. Create vector index manually.';
    END;
  END IF;
END
$$;

COMMIT;
