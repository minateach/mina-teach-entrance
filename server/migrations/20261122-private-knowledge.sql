CREATE TABLE IF NOT EXISTS mina_private_documents (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Uncategorized',
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  sha256 TEXT NOT NULL,
  file_data BYTEA NOT NULL,
  processing_status TEXT NOT NULL CHECK (processing_status IN ('ready','needs_ocr','needs_review','available_for_ai')),
  page_count INTEGER,
  extracted_characters INTEGER NOT NULL DEFAULT 0,
  processing_notice TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, sha256)
);

ALTER TABLE mina_private_documents
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE mina_private_documents
  ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS mina_private_documents_owner_idx
  ON mina_private_documents(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS mina_private_document_chunks (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES mina_private_documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  page_number INTEGER,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  UNIQUE (document_id, chunk_index)
);

ALTER TABLE mina_private_document_chunks
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS mina_private_chunks_owner_idx
  ON mina_private_document_chunks(user_id, document_id);
CREATE INDEX IF NOT EXISTS mina_private_chunks_search_idx
  ON mina_private_document_chunks USING GIN(search_vector);
