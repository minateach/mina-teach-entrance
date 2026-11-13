BEGIN;
-- Relax a storage limit, without removing or rewriting any lesson content.
ALTER TABLE mina_learning_lessons DROP CONSTRAINT IF EXISTS mina_learning_lessons_content_check;
ALTER TABLE mina_learning_lessons ADD CONSTRAINT mina_learning_lessons_content_check CHECK (length(content)>=1);
ALTER TABLE mina_learning_lessons ADD COLUMN IF NOT EXISTS materials JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE mina_learning_lessons ADD COLUMN IF NOT EXISTS content_version INTEGER NOT NULL DEFAULT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mina_learning_lessons'::regclass AND conname='mina_learning_lessons_materials_array_check') THEN
    ALTER TABLE mina_learning_lessons ADD CONSTRAINT mina_learning_lessons_materials_array_check CHECK (jsonb_typeof(materials)='array');
  END IF;
END $$;
COMMIT;
