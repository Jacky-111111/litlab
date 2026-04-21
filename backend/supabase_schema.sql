-- LitLab paper library schema (incremental migration)
-- Run this in Supabase SQL editor.

create table if not exists papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null default 'Manual',
  external_paper_id text,
  title text not null,
  nickname text not null default '',
  authors_json jsonb not null default '[]'::jsonb,
  year int,
  abstract text not null default '',
  canonical_url text not null default '',
  pdf_storage_path text,
  content_hash text,
  citation_mla text not null default '',
  citation_apa text not null default '',
  citation_chicago text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table papers add column if not exists nickname text not null default '';
alter table papers add column if not exists citation_mla text not null default '';
alter table papers add column if not exists citation_apa text not null default '';
alter table papers add column if not exists citation_chicago text not null default '';

create unique index if not exists papers_user_source_external_idx
  on papers(user_id, source, external_paper_id)
  where external_paper_id is not null and external_paper_id <> '';

create unique index if not exists papers_user_content_hash_idx
  on papers(user_id, content_hash)
  where content_hash is not null and content_hash <> '';

create index if not exists papers_user_updated_idx on papers(user_id, updated_at desc);

create table if not exists collection_papers (
  collection_id uuid not null references projects(id) on delete cascade,
  paper_id uuid not null references papers(id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid not null,
  primary key (collection_id, paper_id)
);

create index if not exists collection_papers_paper_idx on collection_papers(paper_id);

create table if not exists paper_notes (
  paper_id uuid not null references papers(id) on delete cascade,
  user_id uuid not null,
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (paper_id, user_id)
);

create table if not exists paper_ai_cache (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references papers(id) on delete cascade,
  user_id uuid not null,
  kind text not null,
  model text not null default 'gpt-4o-mini',
  prompt_hash text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_id, user_id, kind, prompt_hash)
);

create index if not exists paper_ai_cache_user_created_idx on paper_ai_cache(user_id, created_at desc);

-- Optional storage bucket for uploaded PDFs (run once).
insert into storage.buckets (id, name, public)
values ('paper-pdfs', 'paper-pdfs', false)
on conflict (id) do nothing;
