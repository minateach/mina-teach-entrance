CREATE TABLE IF NOT EXISTS mina_general_knowledge_lessons (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND length(slug) <= 100),
  category_slug TEXT NOT NULL CHECK (length(category_slug) BETWEEN 1 AND 100),
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 180),
  language TEXT NOT NULL CHECK (language IN ('en', 'om', 'am')),
  language_review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (language_review_status IN ('pending', 'verified', 'not_applicable')),
  content JSONB NOT NULL,
  source_refs JSONB NOT NULL CHECK (jsonb_typeof(source_refs) = 'array'),
  related_slugs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  review_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (review_status IN ('draft', 'published', 'rejected')),
  content_version INTEGER NOT NULL DEFAULT 1 CHECK (content_version > 0),
  created_by TEXT,
  updated_by TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slug, language)
);

CREATE INDEX IF NOT EXISTS mina_general_knowledge_public
  ON mina_general_knowledge_lessons (language, category_slug, title)
  WHERE review_status = 'published';

CREATE INDEX IF NOT EXISTS mina_general_knowledge_review
  ON mina_general_knowledge_lessons (review_status, updated_at DESC);
