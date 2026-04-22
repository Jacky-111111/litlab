# LitLab

LitLab is a beginner-friendly AI-powered research assistant that helps students create research projects, build a persistent paper library, save notes, and understand literature through reusable AI analysis.

## MVP Features

- Email/password authentication via Supabase.
- Project CRUD with framework type selection:
  - `IMRAD`
  - `Review / Survey`
  - `Theoretical Paper`
  - `Case Study`
- Framework-specific guidance with explanation and prompt per section.
- Paper search through Semantic Scholar (normalized response format).
- Paper library where each paper is stored once per user and can be added to multiple collections.
- Global per-paper notes synced to backend.
- URL/PDF analysis persistence with AI cache (summary/explain/quiz/related).
- Batch add papers to multiple collections.
- AI paper actions through backend OpenAI integration:
  - Summary
  - Beginner explanation
  - Conceptual quiz questions
- Lightweight related-paper recommendations.

## Tech Stack

- Frontend: Vanilla HTML/CSS/JavaScript
- Backend: FastAPI
- Auth + DB: Supabase
- AI: OpenAI API (backend only)
- Paper search: Semantic Scholar API

## Project Structure

```text
litlab/
├── frontend/
│   ├── index.html
│   ├── dashboard.html
│   ├── library.html
│   ├── project.html
│   ├── read-papers.html
│   ├── styles.css
│   ├── config.js
│   ├── app.js
│   ├── auth.js
│   ├── dashboard.js
│   ├── library.js
│   ├── project.js
│   └── read-papers.js
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── supabase_schema.sql
│   ├── routes/
│   ├── services/
│   ├── prompts/
│   └── utils/
├── .env.example
├── PROMPT_LOG.md
└── REFLECTION.md
```

## Supabase Setup

Run [`backend/supabase_schema.sql`](backend/supabase_schema.sql) in Supabase SQL editor.

Core tables include:

### `projects`

- `id` (uuid, primary key, default `gen_random_uuid()`)
- `user_id` (uuid, not null)
- `title` (text, not null)
- `description` (text)
- `framework_type` (text, not null)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### `papers`

- `id` (uuid, primary key, default `gen_random_uuid()`)
- `user_id` (uuid, not null)
- `source` (text, not null)
- `external_paper_id` (text, nullable)
- `title` (text, not null)
- `authors_json` (jsonb)
- `year` (int)
- `abstract` (text)
- `canonical_url` (text)
- `pdf_storage_path` (text, nullable)
- `content_hash` (text, nullable)
- `created_at`, `updated_at` (timestamptz)

### `collection_papers`

- `collection_id` (uuid, references `projects.id`)
- `paper_id` (uuid, references `papers.id`)
- `added_at`
- `added_by`

### `paper_notes`

- `paper_id` (uuid)
- `user_id` (uuid)
- `content` (text)
- `updated_at`

### `paper_ai_cache`

- `paper_id` (uuid)
- `user_id` (uuid)
- `kind` (`summary`, `explain`, `quiz`, `recommend`, `analysis`)
- `model`
- `prompt_hash`
- `payload_json`
- `created_at`, `updated_at`

Enable row-level security and scope rows to authenticated user ownership through `projects.user_id`.
Also create storage bucket `paper-pdfs` for uploaded PDF persistence (included in SQL file).

## Environment Variables

Copy `.env.example` to `.env` and fill values:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, default `gpt-4o-mini`)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGINS`
- `SUPABASE_PDF_BUCKET` (optional, default: `paper-pdfs`)
- `AI_RATE_LIMIT_WINDOW_SECONDS` (optional, default: `60`)
- `AI_RATE_LIMIT_REQUESTS` (optional, default: `20`)
- `AI_DAILY_CACHE_WRITES` (optional, default: `120`)

## Run Locally

### 1) Backend

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate
pip install -r requirements.txt
./backend/run_dev.sh
```

The local API is served under the `/api` prefix (same shape as the
Vercel deployment), so the default local backend URL is:

- `http://127.0.0.1:5500/api`

Health check: `http://127.0.0.1:5500/api/health`.

If you prefer not to use the script, run from the project root:

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 5500 \
  --reload-dir backend --reload-exclude "**/.venv/*" --reload-exclude "**/__pycache__/*"
```

### 2) Frontend

Set public frontend runtime values in `frontend/config.js` before serving.
For local development, make sure the frontend targets backend `5500`:

```js
window.__LITLAB_CONFIG__ = {
  apiBaseUrl: "http://localhost:5500/api",
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "your_supabase_anon_key",
};
```

`frontend/config.js` already picks this up automatically on localhost; the
snippet above is only for manual overrides.

Serve `frontend/` with any static server (example with Python):

```bash
cd frontend
python3 -m http.server 8001
```

Open [http://127.0.0.1:8001/index.html](http://127.0.0.1:8001/index.html)

Set backend CORS for local frontend origins in `.env`:

```env
CORS_ORIGINS=http://127.0.0.1:8001,http://localhost:8001,http://[::]:8001,http://[::1]:8001
```

## Deploy on Vercel

This repo is configured to deploy both frontend and backend from one Vercel project:

- Static frontend pages are served from `frontend/`.
- FastAPI backend is served from `api/index.py` and exposed at `/api/*`.

Recommended deploy flow:

```bash
vercel link
vercel
vercel --prod
```

After deployment, ensure these environment variables are set in Vercel Project Settings:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGINS` (optional; if unset, same-origin `/api` calls still work)

## Important Notes

- OpenAI key is only used on backend; do not expose it in frontend code.
- Frontend reads deploy-time public runtime config from `frontend/config.js` (no end-user config form).
- Backend expects a Supabase access token via `Authorization: Bearer <token>`.