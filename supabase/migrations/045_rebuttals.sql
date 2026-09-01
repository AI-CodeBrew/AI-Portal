-- Admin-moderated objection rebuttals library.
-- Embeddings are Gemini gemini-embedding-001 @ 768 dims, generated in app code
-- (src/lib/rebuttals/embeddings.ts) — NOT via mem0. Mem0 stays per-customer.

create extension if not exists vector;

create table if not exists sales_rebuttals (
  id uuid primary key default gen_random_uuid(),
  -- null store_id = global rebuttal, applies to every reseller
  store_id uuid references stores(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  objection_text text not null,
  answer_text text not null,
  -- 'auto' = captured from a live turn, 'manual' = admin-authored
  source text not null default 'auto' check (source in ('auto', 'manual')),
  language text,
  embedding vector(768),
  source_conversation_id uuid references whatsapp_conversations(id) on delete set null,
  source_meta_message_id text,
  times_served int not null default 0,
  last_served_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table sales_rebuttals is
  'Platform-admin-moderated objection rebuttals. store_id null = global.';
comment on column sales_rebuttals.embedding is
  'Embedding of objection_text, written at capture time so pending rows can be deduped. Retrieval is gated on status, not on this being null.';

create index if not exists idx_sales_rebuttals_status_created
  on sales_rebuttals (status, created_at desc);

create index if not exists idx_sales_rebuttals_store_status
  on sales_rebuttals (store_id, status);

-- HNSW (not ivfflat): ivfflat trains centroids at CREATE INDEX time and this
-- migration runs on an empty table, so it would need a manual REINDEX later.
create index if not exists idx_sales_rebuttals_embedding_hnsw
  on sales_rebuttals using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- Retrieval: threshold + store-specific-over-global preference in one call.
-- p_statuses lets the capture path dedupe against approved+pending+rejected.
create or replace function match_rebuttals(
  query_embedding vector(768),
  p_store_id uuid default null,
  match_threshold float default 0.65,
  match_count int default 5,
  p_statuses text[] default array['approved']
)
returns table (
  id uuid,
  store_id uuid,
  objection_text text,
  answer_text text,
  status text,
  similarity float
)
language sql
stable
as $$
  select
    r.id,
    r.store_id,
    r.objection_text,
    r.answer_text,
    r.status,
    1 - (r.embedding <=> query_embedding) as similarity
  from sales_rebuttals r
  where r.embedding is not null
    and r.status = any(p_statuses)
    and (r.store_id is null or r.store_id = p_store_id)
    and 1 - (r.embedding <=> query_embedding) >= match_threshold
  -- Hard precedence: a store's own rebuttal is a deliberate override, so it
  -- beats a global even at lower similarity. This defeats the HNSW index
  -- (leading sort key is not the distance operator) — fine below ~50k rows.
  order by
    (r.store_id is not null) desc,
    r.embedding <=> query_embedding
  limit match_count;
$$;

-- supabase-js has no atomic increment; concurrent webhooks would race a
-- read-modify-write.
create or replace function increment_rebuttal_served(p_id uuid)
returns void
language sql
as $$
  update sales_rebuttals
     set times_served = times_served + 1,
         last_served_at = now()
   where id = p_id;
$$;

-- Admin-only table; server reads it through the service role (bypasses RLS).
-- Resellers get no policy — they never touch this table directly.
alter table sales_rebuttals enable row level security;

drop policy if exists sales_rebuttals_admin_all on sales_rebuttals;
create policy sales_rebuttals_admin_all on sales_rebuttals
  for all
  using (
    exists (
      select 1 from portal_users
      where portal_users.id = auth.uid()
        and portal_users.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from portal_users
      where portal_users.id = auth.uid()
        and portal_users.role = 'admin'
    )
  );
