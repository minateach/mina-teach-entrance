ALTER TABLE mina_gemini_grounding_usage
  ADD COLUMN IF NOT EXISTS usage_day DATE,
  ADD COLUMN IF NOT EXISTS daily_grounded_requests INTEGER NOT NULL DEFAULT 0
    CHECK (daily_grounded_requests >= 0);
