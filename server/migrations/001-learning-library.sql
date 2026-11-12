CREATE TABLE IF NOT EXISTS mina_learning_lessons (
  id BIGSERIAL PRIMARY KEY,
  grade SMALLINT NOT NULL CHECK (grade IN (9, 10, 11, 12)),
  stream TEXT NOT NULL CHECK (stream IN ('natural', 'social', 'common')),
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 80),
  chapter TEXT NOT NULL CHECK (length(chapter) BETWEEN 1 AND 120),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'om', 'am')),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 20000),
  examples JSONB NOT NULL DEFAULT '[]'::jsonb,
  key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_label TEXT NOT NULL CHECK (length(source_label) BETWEEN 1 AND 300),
  source_url TEXT,
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft', 'published', 'rejected')),
  created_by TEXT,
  updated_by TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (grade, stream, subject, chapter, title, language)
);

CREATE INDEX IF NOT EXISTS mina_learning_lessons_public_filter
  ON mina_learning_lessons (grade, stream, subject, language, review_status);
