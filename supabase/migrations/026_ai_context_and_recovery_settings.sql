-- Conversation context, sales recovery discounts, and platform spam defaults

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS ai_chat_history_limit integer,
  ADD COLUMN IF NOT EXISTS ai_session_window_hours integer,
  ADD COLUMN IF NOT EXISTS ai_recovery_discount_percent integer,
  ADD COLUMN IF NOT EXISTS ai_recovery_bundle_discount_percent integer;

ALTER TABLE platform_ai_defaults
  ADD COLUMN IF NOT EXISTS ai_chat_history_limit integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS ai_session_window_hours integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ai_recovery_discount_percent integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS ai_recovery_bundle_discount_percent integer NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS ai_conversation_reply_limit integer,
  ADD COLUMN IF NOT EXISTS ai_conversation_reply_window_hours integer;

COMMENT ON COLUMN stores.ai_chat_history_limit IS
  'How many recent WhatsApp messages the AI sees (null = platform default)';
COMMENT ON COLUMN stores.ai_session_window_hours IS
  'Hours of chat the AI remembers before a fresh session (null = platform default)';
COMMENT ON COLUMN stores.ai_recovery_discount_percent IS
  'First-refusal discount % (null = platform default)';
COMMENT ON COLUMN stores.ai_recovery_bundle_discount_percent IS
  'Second-refusal 2-pack bundle discount % (null = platform default)';

UPDATE platform_ai_defaults
SET
  ai_chat_history_limit = COALESCE(ai_chat_history_limit, 10),
  ai_session_window_hours = COALESCE(ai_session_window_hours, 2),
  ai_recovery_discount_percent = COALESCE(ai_recovery_discount_percent, 15),
  ai_recovery_bundle_discount_percent = COALESCE(ai_recovery_bundle_discount_percent, 25)
WHERE id = 1;
