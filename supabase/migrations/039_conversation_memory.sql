-- Conversation memory: rolling summary, customer sales profile, pgvector for Mem0

-- Enable pgvector for Mem0 / long-term embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Rolling summary on each WhatsApp conversation
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS rolling_summary text,
  ADD COLUMN IF NOT EXISTS summary_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS history_token_estimate int NOT NULL DEFAULT 0;

COMMENT ON COLUMN whatsapp_conversations.rolling_summary IS
  'LLM-compressed older turns; injected with last N verbatim messages';
COMMENT ON COLUMN whatsapp_conversations.history_token_estimate IS
  'Approx tokens of summary + recent history; updated every AI turn for compaction';

-- Always-on customer sales profile (durable across session clears).
-- Compatible with existing table shape: language/funnel_stage + profile jsonb.
CREATE TABLE IF NOT EXISTS customer_sales_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_phone text NOT NULL,
  language text,
  funnel_stage text,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_sales_profiles
  ADD COLUMN IF NOT EXISTS language text,
  ADD COLUMN IF NOT EXISTS funnel_stage text,
  ADD COLUMN IF NOT EXISTS profile jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS customer_sales_profiles_store_phone_uidx
  ON customer_sales_profiles (store_id, customer_phone);

CREATE INDEX IF NOT EXISTS customer_sales_profiles_store_updated_idx
  ON customer_sales_profiles (store_id, updated_at DESC);

COMMENT ON TABLE customer_sales_profiles IS
  'Durable AI sales profile per store+phone; structured fields in profile jsonb';
