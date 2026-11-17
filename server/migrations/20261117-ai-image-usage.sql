CREATE TABLE IF NOT EXISTS mina_image_ai_usage (
  usage_month DATE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('gemini_vision', 'minimax_image')),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  successful_images INTEGER NOT NULL DEFAULT 0 CHECK (successful_images >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (usage_month, provider)
);
