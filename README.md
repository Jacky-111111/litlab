# LitLab

LitLab is a beginner-friendly AI-powered research assistant that helps students create research projects, search and save academic papers, and understand literature through summaries, explanations, and comprehension questions.

## MVP Features

- Email/password authentication via Supabase.
- Project CRUD with framework type selection:
  - `IMRAD`
  - `Review / Survey`
  - `Theoretical Paper`
  - `Case Study`
- Framework-specific guidance with explanation and prompt per section.
- Paper search through Semantic Scholar (normalized response format).
- Save papers into project reading lists with duplicate prevention per project.
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
│   ├── project.html
│   ├── styles.css
│   ├── config.js
│   ├── app.js
│   ├── auth.js
│   ├── dashboard.js
│   └── project.js
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── routes/
│   ├── services/
│   ├── prompts/
│   └── utils/
├── .env.example
├── PROMPT_LOG.md
└── REFLECTION.md
```

## Supabase Setup

Create these tables in Supabase:

### `projects`

- `id` (uuid, primary key, default `gen_random_uuid()`)
- `user_id` (uuid, not null)
- `title` (text, not null)
- `description` (text)
- `framework_type` (text, not null)
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

### `saved_papers`

- `id` (uuid, primary key, default `gen_random_uuid()`)
- `project_id` (uuid, not null, references `projects.id`)
- `external_paper_id` (text, not null)
- `source` (text, not null)
- `title` (text, not null)
- `authors` (jsonb or text[])
- `year` (int)
- `abstract` (text)
- `url` (text)
- `created_at` (timestamptz default `now()`)

Recommended unique constraint:

- (`project_id`, `external_paper_id`)

Enable row-level security and scope rows to authenticated user ownership through `projects.user_id`.

## Environment Variables

Copy `.env.example` to `.env` and fill values:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, default `gpt-4o-mini`)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGINS`

## Run Locally

### 1) Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### 2) Frontend

Set public frontend runtime values in `frontend/config.js` before serving:

```js
window.__LITLAB_CONFIG__ = {
  apiBaseUrl: "http://127.0.0.1:8000",
  supabaseUrl: "https://your-project.supabase.co",
  supabaseAnonKey: "your_supabase_anon_key",
};
```

Serve `frontend/` with any static server (example with Python):

```bash
cd frontend
python3 -m http.server 5500
```

Open [http://127.0.0.1:5500/index.html](http://127.0.0.1:5500/index.html)

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