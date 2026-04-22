-- =========================================================
-- LitLab — Collection sharing v1  (STEP 2 of 2)
--   file: 0003_collection_sharing__step2_tables.sql
-- =========================================================
--
-- Prerequisite: you have already run
-- `0002_collection_sharing__step1_enum.sql` successfully (it adds the
-- `'selected'` value to the collection_visibility enum and must be
-- committed before any statement below can use that value).
--
-- This file is idempotent; safe to re-run.
--
-- Steps performed:
--   1. user_profiles.public_handle (unique, auto-generated) + email cache
--   2. Migrate any legacy `'link'` rows to `'selected'`
--   3. collection_shared_users table for per-collection invited emails
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- 1) user_profiles: public_handle + email cache
-- ---------------------------------------------------------

alter table public.user_profiles
  add column if not exists public_handle text;

alter table public.user_profiles
  add column if not exists email text;

update public.user_profiles
set public_handle = 'u_' || encode(gen_random_bytes(6), 'hex')
where public_handle is null or length(public_handle) = 0;

create unique index if not exists user_profiles_public_handle_unique
  on public.user_profiles(public_handle);

-- Auto-fill public_handle for any future insert that forgets it.
create or replace function public.ensure_public_handle()
returns trigger
language plpgsql
as $$
begin
  if new.public_handle is null or length(new.public_handle) = 0 then
    new.public_handle := 'u_' || encode(gen_random_bytes(6), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_public_handle on public.user_profiles;
create trigger trg_user_profiles_public_handle
  before insert on public.user_profiles
  for each row execute function public.ensure_public_handle();

-- ---------------------------------------------------------
-- 2) Migrate legacy 'link' rows to 'selected'
-- ---------------------------------------------------------
-- Requires step 1 to have been committed first (that's where the 'selected'
-- enum value was added).

update public.collections
set visibility = 'selected'
where visibility = 'link';

-- 'link' remains a harmless dead value in the enum. No rows will use it.

-- ---------------------------------------------------------
-- 3) collection_shared_users: per-collection invited emails
-- ---------------------------------------------------------

create table if not exists public.collection_shared_users (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references public.collections(id) on delete cascade,
  invited_email text not null,
  invited_user_id uuid references auth.users(id) on delete set null,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (collection_id, invited_email)
);

create index if not exists collection_shared_users_email_idx
  on public.collection_shared_users(lower(invited_email));

create index if not exists collection_shared_users_collection_idx
  on public.collection_shared_users(collection_id);

alter table public.collection_shared_users enable row level security;

drop policy if exists collection_shared_users_owner_all on public.collection_shared_users;
create policy collection_shared_users_owner_all
  on public.collection_shared_users
  for all
  to authenticated
  using (
    exists (
      select 1 from public.collections c
      where c.id = collection_shared_users.collection_id
        and c.owner_user_id = auth.uid()
    )
  )
  with check (
    added_by = auth.uid()
    and exists (
      select 1 from public.collections c
      where c.id = collection_shared_users.collection_id
        and c.owner_user_id = auth.uid()
    )
  );
