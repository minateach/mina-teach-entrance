CREATE TABLE IF NOT EXISTS mina_gemini_grounding_usage (
  usage_month DATE PRIMARY KEY,
  grounded_requests INTEGER NOT NULL DEFAULT 0 CHECK (grounded_requests >= 0),
  search_queries INTEGER NOT NULL DEFAULT 0 CHECK (search_queries >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
