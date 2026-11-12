ALTER TABLE mina_exam_attempts
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'practice';

ALTER TABLE mina_exam_attempts
  ALTER COLUMN grade DROP NOT NULL,
  ALTER COLUMN stream DROP NOT NULL;
