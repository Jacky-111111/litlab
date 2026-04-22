-- =========================================================
-- LitLab schema refactor: separate Projects and Collections
-- Safe to re-run. Fully additive. No DROP TABLE.
--
-- What this does, in order:
--   1. Extend projects with workspace fields (goal, status).
--   2. Create collection_visibility enum.
--   3. Create collections table + RLS + updated_at trigger.
--   4. Backfill one collection per existing project (same id,
--      owner, title, description, timestamps).
--   5. Create project_collections link table + RLS, and mark
--      each backfilled collection as the project's primary
--      reading list.
--   6. Repoint collection_papers.collection_id FK from
--      projects(id) to collections(id). Existing rows remain
--      valid because collections.id equals the old projects.id
--      for backfilled rows.
--   7. Update collection_papers RLS to use collections
--      ownership instead of projects ownership.
-- =========================================================

-- Pre-reqs expected to already exist from the canonical schema:
--   extension pgcrypto
--   function public.set_updated_at()
--   table public.projects
--   table public.collection_papers
-- If you have not run the canonical schema yet, run
-- SUPABASE_SCHEMA.md first, then this file.

-- 1) Extend projects with workspace fields.
alter table public.projects
  add column if not exists goal text not null default '';

alter table public.projects
  add column if not exists status text not null default 'active';

-- 2) Visibility enum for collections (idempotent).
do $$
begin
  create type public.collection_visibility as enum ('private', 'link', 'public');
exception
  when duplicate_object then null;
end
$$;

-- 3) collections table.
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

-- Shared-read policy can be added later as:
--   create policy collections_shared_select on public.collections
--     for select to authenticated
--     using (visibility in ('link', 'public'));

-- 4) Backfill: one collection per existing project, reusing the id.
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

-- 5) project_collections linking table + backfill.
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
      select 1
      from public.projects p
      where p.id = project_collections.project_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_collections.project_id
        and p.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.collections c
      where c.id = project_collections.collection_id
        and c.owner_user_id = auth.uid()
    )
  );

insert into public.project_collections (project_id, collection_id, is_primary)
select p.id, p.id, true
from public.projects p
on conflict do nothing;

-- 6) Repoint collection_papers.collection_id FK from projects(id) to collections(id).
--    Works without data movement because step 4 preserved IDs.
alter table public.collection_papers
  drop constraint if exists collection_papers_collection_id_fkey;

alter table public.collection_papers
  add constraint collection_papers_collection_id_fkey
  foreign key (collection_id) references public.collections(id) on delete cascade;

-- 7) Update collection_papers RLS to use collections ownership.
drop policy if exists collection_papers_owner_all on public.collection_papers;
create policy collection_papers_owner_all
  on public.collection_papers
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.collections c
      where c.id = collection_papers.collection_id
        and c.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.collections c
      where c.id = collection_papers.collection_id
        and c.owner_user_id = auth.uid()
    )
    and added_by = auth.uid()
  );
