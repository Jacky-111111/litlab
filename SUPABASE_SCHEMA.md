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
-- depends on public.collections(id, owner_user_id)
-- (historical note: prior to the 2026-04-21 refactor the FK
-- pointed at public.projects(id); the migration block further
-- down repoints it to collections. Fresh installs get the new
-- FK from the start.)
-- =========================================================
create table if not exists public.collection_papers (
  collection_id uuid not null,
  paper_id uuid not null references public.papers(id) on delete cascade,
  added_at timestamptz not null default now(),
  added_by uuid not null,
  primary key (collection_id, paper_id)
);

create index if not exists collection_papers_paper_idx
  on public.collection_papers(paper_id);

alter table public.collection_papers enable row level security;

-- The RLS policy is (re)created further down, after the collections
-- table exists, so that fresh installs and upgrades end in the same
-- state.

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

-- =========================================================
-- 7) Refactor: separate Projects and Collections (2026-04-21)
-- Fully additive. No DROP TABLE. Safe to re-run.
-- =========================================================

-- 7.1) Extend projects with workspace fields.
alter table public.projects
  add column if not exists goal text not null default '';

alter table public.projects
  add column if not exists status text not null default 'active';

-- 7.2) Visibility enum for collections.
do $$
begin
  create type public.collection_visibility as enum ('private', 'link', 'public');
exception
  when duplicate_object then null;
end
$$;

-- 7.3) collections table.
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  visibility public.collection_visibility not null default 'private',
  share_slug text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collections_owner_updated_idx
  on public.collections(owner_user_id, updated_at desc);

drop trigger if exists trg_collections_updated_at on public.collections;
create trigger trg_collections_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

alter table public.collections enable row level security;

drop policy if exists collections_owner_all on public.collections;
create policy collections_owner_all
  on public.collections
  for all
  to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- 7.4) Backfill: one collection per existing project, reusing the id.
insert into public.collections (id, owner_user_id, title, description, created_at, updated_at)
select
  p.id,
  p.user_id,
  coalesce(nullif(p.title, ''), 'Untitled'),
  coalesce(p.description, ''),
  p.created_at,
  p.updated_at
from public.projects p
on conflict (id) do nothing;

-- 7.5) project_collections linking table + backfill.
create table if not exists public.project_collections (
  project_id uuid not null references public.projects(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  is_primary boolean not null default false,
  attached_at timestamptz not null default now(),
  primary key (project_id, collection_id)
);

create index if not exists project_collections_collection_idx
  on public.project_collections(collection_id);

create unique index if not exists project_collections_one_primary_idx
  on public.project_collections(project_id)
  where is_primary;

alter table public.project_collections enable row level security;

drop policy if exists project_collections_owner_all on public.project_collections;
create policy project_collections_owner_all
  on public.project_collections
  for all
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_collections.project_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_collections.project_id
        and p.user_id = auth.uid()
    )
    and exists (
      select 1 from public.collections c
      where c.id = project_collections.collection_id
        and c.owner_user_id = auth.uid()
    )
  );

insert into public.project_collections (project_id, collection_id, is_primary)
select p.id, p.id, true
from public.projects p
on conflict do nothing;

-- 7.6) Repoint collection_papers.collection_id FK to collections(id).
alter table public.collection_papers
  drop constraint if exists collection_papers_collection_id_fkey;

alter table public.collection_papers
  add constraint collection_papers_collection_id_fkey
  foreign key (collection_id) references public.collections(id) on delete cascade;

-- 7.7) Update collection_papers RLS to use collections ownership.
drop policy if exists collection_papers_owner_all on public.collection_papers;
create policy collection_papers_owner_all
  on public.collection_papers
  for all
  to authenticated
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_papers.collection_id
        and c.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.collections c
      where c.id = collection_papers.collection_id
        and c.owner_user_id = auth.uid()
    )
    and added_by = auth.uid()
  );
```
