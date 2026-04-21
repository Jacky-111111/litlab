# Supabase Schema Source of Truth

Use this file as the single source of truth for Supabase SQL.

## How to use

1. Open Supabase SQL Editor.
2. Copy the entire SQL block below.
3. Run it as one script.
4. If prompted about RLS, choose **Run and enable RLS**.

This script is designed to be safe to re-run.

```sql
-- =========================================================
-- LitLab final Supabase schema + RLS policies
-- Safe to re-run
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Common updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================
-- 1) user_profiles
-- =========================================================
create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '',
  school text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_select_own on public.user_profiles;
drop policy if exists user_profiles_insert_own on public.user_profiles;
drop policy if exists user_profiles_update_own on public.user_profiles;

create policy user_profiles_select_own
on public.user_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy user_profiles_insert_own
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy user_profiles_update_own
on public.user_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- =========================================================
-- 2) papers
-- =========================================================
create table if not exists public.papers (
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

-- 兼容老库：如果 papers 已存在则补列
alter table public.papers add column if not exists nickname text not null default '';
alter table public.papers add column if not exists citation_mla text not null default '';
alter table public.papers add column if not exists citation_apa text not null default '';
alter table public.papers add column if not exists citation_chicago text not null default '';

-- 回填旧数据昵称：优先 title，没有就 Untitled
update public.papers
set nickname = coalesce(nullif(title, ''), 'Untitled')
where coalesce(nullif(nickname, ''), '') = '';

create unique index if not exists papers_user_source_external_idx
  on public.papers(user_id, source, external_paper_id)
  where external_paper_id is not null and external_paper_id <> '';

create unique index if not exists papers_user_content_hash_idx
  on public.papers(user_id, content_hash)
  where content_hash is not null and content_hash <> '';

create index if not exists papers_user_updated_idx
  on public.papers(user_id, updated_at desc);

drop trigger if exists trg_papers_updated_at on public.papers;
create trigger trg_papers_updated_at
before update on public.papers
for each row execute function public.set_updated_at();

alter table public.papers enable row level security;

drop policy if exists papers_owner_all on public.papers;
create policy papers_owner_all
on public.papers
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- =========================================================
-- 3) collection_papers (many-to-many)
-- depends on public.projects(id, user_id)
-- =========================================================
create table if not exists public.collection_papers (
  collection_id uuid not null references public.projects(id) on delete cascade,
  paper_id uuid not null references public.papers(id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid not null,
  primary key (collection_id, paper_id)
);

create index if not exists collection_papers_paper_idx
  on public.collection_papers(paper_id);

alter table public.collection_papers enable row level security;

drop policy if exists collection_papers_owner_all on public.collection_papers;
create policy collection_papers_owner_all
on public.collection_papers
for all
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = collection_papers.collection_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.projects p
    where p.id = collection_papers.collection_id
      and p.user_id = auth.uid()
  )
  and added_by = auth.uid()
);

-- =========================================================
-- 4) paper_notes
-- =========================================================
create table if not exists public.paper_notes (
  paper_id uuid not null references public.papers(id) on delete cascade,
  user_id uuid not null,
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (paper_id, user_id)
);

drop trigger if exists trg_paper_notes_updated_at on public.paper_notes;
create trigger trg_paper_notes_updated_at
before update on public.paper_notes
for each row execute function public.set_updated_at();

alter table public.paper_notes enable row level security;

drop policy if exists paper_notes_owner_all on public.paper_notes;
create policy paper_notes_owner_all
on public.paper_notes
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- =========================================================
-- 5) paper_ai_cache
-- =========================================================
create table if not exists public.paper_ai_cache (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers(id) on delete cascade,
  user_id uuid not null,
  kind text not null,
  model text not null default 'gpt-4o-mini',
  prompt_hash text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (paper_id, user_id, kind, prompt_hash)
);

create index if not exists paper_ai_cache_user_created_idx
  on public.paper_ai_cache(user_id, created_at desc);

drop trigger if exists trg_paper_ai_cache_updated_at on public.paper_ai_cache;
create trigger trg_paper_ai_cache_updated_at
before update on public.paper_ai_cache
for each row execute function public.set_updated_at();

alter table public.paper_ai_cache enable row level security;

drop policy if exists paper_ai_cache_owner_all on public.paper_ai_cache;
create policy paper_ai_cache_owner_all
on public.paper_ai_cache
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- =========================================================
-- 6) Storage bucket + policies (paper-pdfs)
-- =========================================================
insert into storage.buckets (id, name, public)
values ('paper-pdfs', 'paper-pdfs', false)
on conflict (id) do nothing;

-- Note: storage.objects already has RLS enabled by Supabase.
-- Folder convention: user_id/filename.pdf
drop policy if exists paper_pdfs_select_own on storage.objects;
drop policy if exists paper_pdfs_insert_own on storage.objects;
drop policy if exists paper_pdfs_update_own on storage.objects;
drop policy if exists paper_pdfs_delete_own on storage.objects;

create policy paper_pdfs_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id = 'paper-pdfs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy paper_pdfs_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'paper-pdfs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy paper_pdfs_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'paper-pdfs'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'paper-pdfs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy paper_pdfs_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'paper-pdfs'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```
