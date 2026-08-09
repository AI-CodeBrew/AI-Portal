-- Mem0 Supabase vector store (Gemini embeddings = 768 dims)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS memories (
  id text PRIMARY KEY,
  embedding vector(768),
  metadata jsonb,
  created_at timestamptz DEFAULT timezone('utc', now()),
  updated_at timestamptz DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS memory_migrations (
  user_id text PRIMARY KEY,
  created_at timestamptz DEFAULT timezone('utc', now())
);

CREATE OR REPLACE FUNCTION match_vectors(
  query_embedding vector(768),
  match_count int,
  filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id text,
  similarity float,
  metadata jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id::text,
    1 - (t.embedding <=> query_embedding) AS similarity,
    t.metadata
  FROM memories t
  WHERE CASE
    WHEN filter::text = '{}'::text THEN true
    ELSE t.metadata @> filter
  END
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Allow service role full access (Mem0 uses service key)
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_migrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS memories_service_all ON memories;
CREATE POLICY memories_service_all ON memories
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS memory_migrations_service_all ON memory_migrations;
CREATE POLICY memory_migrations_service_all ON memory_migrations
  FOR ALL USING (true) WITH CHECK (true);
