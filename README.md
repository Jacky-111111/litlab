# LitLab

**Website:** [https://litlab-delta.vercel.app/](https://litlab-delta.vercel.app/)

LitLab is a beginner-friendly AI-powered research assistant. It gives students one workspace to plan projects, keep a paper library, attach reading lists to projects, and run reusable AI analysis on literature.

## Features

**Account and data**

- Email/password sign-in via Supabase; session-backed API calls.
- Row-level data scoped per user in Supabase (projects, papers, collections, notes).

**Projects**

- Create, edit, and delete projects with status and metadata.
- Choose a research **framework** per project: `IMRAD`, `Review / Survey`, `Theoretical Paper`, or `Case Study`.
- In-project **framework guidance**: section explanations and writing prompts.
- Section **notes / checklists** in the browser (stored locally per project section).
- **Reading lists**: attach multiple collections to a project, pick a **primary** list (default target for new papers from that project), and attach more lists from your library.
- **Saved papers** for the project (aggregated from attached lists) with quick open into the reader.
- Export a **bibliography** (MLA, APA, Chicago) as `.txt` from saved papers.
- **AI Direction Advisor**: combines framework notes and saved papers to suggest directions, risks, and next steps (OpenAI on the backend).

**Library and collections**

- **Paper library**: each paper is stored once per user and can belong to multiple **collections** (reading lists).
- Search and add papers via **Semantic Scholar** (normalized API shape).
- Batch add/remove papers in collections; add papers from the library into a project’s primary list.
- Per-paper **notes** synced to the backend.
- **Collection sharing**: invite collaborators and manage access via the collections API (used from the Library / dashboard flows).

**Read and analyze papers**

- **Read papers** workspace: open papers, run AI actions backed by OpenAI (summary, beginner-friendly explanation, quiz-style questions).
- **URL/PDF analysis** with cached AI results (`summary`, `explain`, `quiz`, related/recommend flows) so repeat views stay fast.
- Lightweight **related-paper** suggestions.

**Mobile**

- A separate **Expo** app implements a **subset** of these features against the same backend. Clone or follow development here: **[litlab-mobile on GitHub](https://github.com/Jacky-111111/litlab-mobile)** (not feature-complete vs. the web app).

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
│   ├── supabase_schema.sql
│   ├── routes/
│   ├── services/
│   ├── prompts/
│   └── utils/
├── requirements.txt
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

## Local deployment

Run the stack on your machine in two processes: **FastAPI** (port `5500`) and a **static server** for `frontend/` (example: port `8001`).

### Prerequisites

- Python **3.10+** recommended  
- A Supabase project with schema applied (see [Supabase Setup](#supabase-setup))  
- `.env` at the repo root from [`.env.example`](.env.example) (OpenAI + Supabase keys)

### 1. Backend API

From the **repository root**:

```bash
python3 -m venv backend/.venv
source backend/.venv/bin/activate   # Windows: backend\.venv\Scripts\activate
pip install -r requirements.txt
./backend/run_dev.sh
```

The dev server matches production routing: all API routes live under **`/api`**.

- Base URL: `http://127.0.0.1:5500/api`  
- Health: `http://127.0.0.1:5500/api/health`

Without the script (still from repo root):

```bash
uvicorn backend.main:app --reload --host 127.0.0.1 --port 5500 \
  --reload-dir backend --reload-exclude "**/.venv/*" --reload-exclude "**/__pycache__/*"
```

### 2. Frontend

[`frontend/config.js`](frontend/config.js) is set up to use **`http://127.0.0.1:5500/api`** when you open the site from localhost. Override there if your API port or host differs:

```js
window.__LITLAB_CONFIG__ = {
  apiBaseUrl: "http://127.0.0.1:5500/api",
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "your_supabase_anon_key",
};
```

Serve the `frontend` folder with any static file server, for example:

```bash
cd frontend
python3 -m http.server 8001
```

Then open [http://127.0.0.1:8001/index.html](http://127.0.0.1:8001/index.html) (or `dashboard.html`, `project.html?id=…`, etc.).

### 3. CORS

Allow your static origin in the backend `.env` (comma-separated):

```env
CORS_ORIGINS=http://127.0.0.1:8001,http://localhost:8001,http://[::]:8001,http://[::1]:8001
```

Restart the API after changing `.env`.

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