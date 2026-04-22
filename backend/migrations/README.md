# LitLab Migrations

Ordered, idempotent SQL migrations for the Supabase / Postgres backend.
Each file is a standalone script safe to re-run.

## Naming convention

```
NNNN_short_name.sql
NNNN_topic__stepM_stage.sql   # when a topic must be split into multiple files
```

- `NNNN` — 4-digit sequential prefix (`0001`, `0002`, …). Ordering is by
  prefix, **not** by date. Filenames intentionally do not include a date
  because migrations land whenever they are ready, not on a fixed calendar.
- `short_name` — lowercase, `snake_case`, describes the change.
- `__stepM_stage` — used only when one logical migration must be split into
  two or more SQL files (for example, because PostgreSQL requires a
  commit between statements). The double underscore makes the split
  visually obvious.

## Run order

Run every file in order in the Supabase SQL Editor.
If you are bootstrapping a fresh project:

1. `backend/supabase_schema.sql` — the canonical base schema.
2. Every file in this folder, in filename order:

| File | Purpose |
| --- | --- |
| `0001_separate_projects_and_collections.sql` | Splits the MVP `projects` table into separate `projects` / `collections` / `project_collections`. Backfill is additive and preserves IDs. |
| `0002_collection_sharing__step1_enum.sql` | Adds the `'selected'` value to the `collection_visibility` enum. Must commit before step 2 can reference it. |
| `0003_collection_sharing__step2_tables.sql` | `user_profiles.public_handle` + email cache, migrates legacy `'link'` rows to `'selected'`, creates `collection_shared_users` table + owner-only RLS. |

All files are idempotent (they use `if not exists`, `create or replace`,
and `drop ... if exists`), so re-running is safe.

## Why some migrations are split (`__stepM_stage`)

PostgreSQL requires that a new enum value added via
`ALTER TYPE ... ADD VALUE` be committed before any statement in the same
transaction can reference it. Supabase's SQL Editor sometimes batches a
pasted script into a single transaction, so trying to add the enum value
and use it in one paste fails with:

```
ERROR: 55P04: unsafe use of new value "selected" of enum type
              collection_visibility
HINT:  New enum values must be committed before they can be used.
```

The split (`__step1_enum` / `__step2_tables`) forces the commit between
the two files, which avoids the error without complicating the happy path.

## Authoring a new migration

1. Pick the next `NNNN` prefix (e.g. `0004`).
2. Write it idempotent — every statement must be safe to re-run.
3. If you touch enums, consider whether you need a `__step1_enum` /
   `__step2_tables` split.
4. Also append the SQL to `SUPABASE_SCHEMA.md` for discoverability so the
   canonical schema doc stays the source of truth.
