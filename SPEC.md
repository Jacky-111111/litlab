LitLab SPEC

1. Overview

Product name: LitLab
Type: AI-powered research assistant web app
Audience: Beginner student researchers
Platform (MVP): Web app
Future platforms: Mobile app, Chrome extension

One-sentence pitch:
LitLab helps beginners start, organize, and understand research projects by combining paper search, project management, structured research guidance, and AI-powered paper analysis.

⸻

2. Problem

Beginner researchers often struggle with:

* finding relevant papers
* understanding dense academic writing
* organizing project ideas
* choosing an appropriate research structure
* turning reading into a real project plan

Existing tools are often too advanced, too fragmented, or too focused on only one task.

⸻

3. Solution

LitLab is a beginner-friendly AI research assistant that lets users:

* create and manage research projects
* choose a research framework such as IMRAD or Review/Survey
* search for academic papers
* save papers into project reading lists
* use AI to summarize papers, explain them simply, and generate comprehension questions
* get lightweight related-paper recommendations

⸻

4. MVP Goals

The MVP should be:

* functional
* explainable
* portfolio-ready
* simple enough for oral exam discussion
* cleanly designed
* deployable on Vercel

The MVP will focus on one strong user flow:

Sign up → create a project → choose a framework → search papers → save papers → analyze a paper with AI

⸻

5. Non-Goals for MVP

These are explicitly out of scope for the first version:

* mobile app
* Chrome extension
* real-time collaboration
* paper editing/revision workflows
* advanced citation graph visualization
* team sharing permissions
* highly personalized recommendation engine
* PDF upload and parsing
* full Google Scholar scraping

⸻

6. Target Users

Primary user

A beginner student researcher who:

* is new to academic research
* needs structure and guidance
* wants help understanding papers
* wants to organize projects in one place

Example users

* a high school student doing a research competition
* a college freshman starting a first literature review
* a student exploring a research topic for a class project

⸻

7. Core User Stories

Authentication

* As a user, I want to sign up and log in so my projects and saved papers are stored securely.
* As a user, I want to log out safely.

Project management

* As a user, I want to create a research project with a title, description, and framework.
* As a user, I want to view my project list.
* As a user, I want to edit or delete a project.

Research structure guidance

* As a user, I want LitLab to guide me differently depending on whether my project is IMRAD, Review/Survey, Theoretical, or Case Study.
* As a user, I want beginner-friendly prompts and checklist items for my project type.

Paper discovery

* As a user, I want to search for papers by keyword.
* As a user, I want to see title, authors, year, source, and abstract snippet.
* As a user, I want to open the source link externally.

Save to project

* As a user, I want to save a paper to a selected project.
* As a user, I want to see saved papers within a project.

AI understanding

* As a user, I want AI to summarize a saved paper.
* As a user, I want AI to explain a paper in beginner-friendly language.
* As a user, I want AI to generate quiz questions that test my understanding.

Recommendations

* As a user, I want to see related paper suggestions based on a paper I saved.

⸻

8. Functional Requirements

8.1 Authentication

The system must allow users to:

* sign up with email and password
* log in with email and password
* log out
* persist session state
* access only their own projects and saved papers

Implementation note: Supabase Auth

8.2 Project Management

The system must allow authenticated users to:

* create a project
* edit project metadata
* delete a project
* list all their projects
* open a project detail page

Each project includes:

* title
* description
* framework type
* created timestamp
* updated timestamp

8.3 Research Framework Guidance

Each project must have one framework type:

* IMRAD
* Review / Survey
* Theoretical Paper
* Case Study

For each framework, the app must display a structured guide.

IMRAD

Sections:

* Research Question
* Background
* Method
* Results
* Discussion

Review / Survey

Sections:

* Topic Scope
* Search Strategy
* Theme Clusters
* Comparison of Sources
* Research Gap

Theoretical Paper

Sections:

* Problem Definition
* Assumptions
* Proposition / Claim
* Reasoning / Proof Sketch
* Implications

Case Study

Sections:

* Context
* Problem
* Evidence / Observations
* Analysis
* Reflection / Implications

Each section should include:

* a short explanation
* a prompt for the student
* a checklist item or note field

8.4 Paper Search

The system must allow users to search papers from an academic API.

Search input

* keyword query
* optional search button

Search result fields

* title
* authors
* year
* source
* abstract snippet
* paper URL

API preference

Use one stable academic API for MVP:

* Semantic Scholar, or
* OpenAlex, or
* arXiv

The backend should normalize the response so the frontend uses a consistent paper format.

8.5 Save Paper to Project

Users must be able to:

* choose a project from search results
* save a paper into that project
* avoid duplicate saves for the same project if possible

Stored metadata should include:

* external paper ID
* title
* authors
* year
* source
* abstract
* URL
* saved timestamp

8.6 AI Paper Actions

For each saved paper, the system must provide:

Summarize

Generate:

* concise overview
* key contribution
* why it matters

Explain for Beginner

Generate:

* plain-language explanation
* important concepts explained simply
* ideal for first-time student researchers

Generate Quiz Questions

Generate:

* 3 to 5 questions
* aimed at understanding, not memorization only
* preferably short-answer or conceptual questions

Implementation note: OpenAI API via backend only

8.7 Related Paper Recommendation

For MVP, recommendation logic can be simple:

* extract keywords from title and/or abstract
* run a follow-up search using those keywords
* return a few related papers

This logic should be:

* lightweight
* understandable
* easy to explain in oral exam

⸻

9. Non-Functional Requirements

The app should be:

* secure with secrets stored in environment variables
* readable and easy to explain
* responsive on desktop and basic tablet/mobile widths
* clean and polished for portfolio use
* resilient to common errors
* simple enough to maintain

⸻

10. UI / UX Requirements

Visual style

* blue + black/white palette
* minimal
* academic but approachable
* beginner-friendly
* modern card-based layout

Design principles

* strong hierarchy
* generous spacing
* clean navigation
* friendly empty states
* clear call-to-action buttons
* readable typography
* subtle shadows and rounded corners

Suggested palette

* Primary blue: deep or medium blue
* Background: white or very light gray
* Text: near-black / dark gray
* Accent: soft blue hover states

⸻

11. Main Pages

11.1 Landing Page

Purpose:

* explain what LitLab is
* encourage sign up / log in

Sections:

* hero
* key features
* simple workflow
* CTA buttons

11.2 Auth Page / Modal

Functions:

* sign up
* log in
* log out

11.3 Dashboard

Shows:

* user’s projects
* create project button
* quick overview of project frameworks
* possibly recent saved papers later

11.4 Project Detail Page

Shows:

* project metadata
* framework guidance panel
* saved papers list
* search papers section
* AI analysis panel for selected saved paper

11.5 Paper Search Area

Shows:

* search input
* result cards
* save-to-project action

11.6 Paper Analysis Panel

For a selected saved paper:

* summarize button
* explain button
* generate quiz button
* AI response display area

⸻

12. Recommended Information Architecture

LitLab
├─ Landing
├─ Auth
├─ Dashboard
│  ├─ Project Card
│  └─ Create Project
└─ Project Detail
   ├─ Project Info
   ├─ Framework Guidance
   ├─ Saved Papers
   ├─ Search Papers
   └─ AI Analysis

⸻

13. Technical Stack

Frontend

* HTML
* CSS
* Vanilla JavaScript

Backend

* FastAPI

Database / Auth

* Supabase

Deployment

* Vercel

AI

* OpenAI API

Paper search source

* Semantic Scholar or OpenAlex or arXiv

⸻

14. Suggested Folder Structure

litlab/
├── frontend/
│   ├── index.html
│   ├── dashboard.html
│   ├── project.html
│   ├── styles.css
│   ├── app.js
│   ├── auth.js
│   ├── dashboard.js
│   └── project.js
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── routes/
│   │   ├── projects.py
│   │   ├── papers.py
│   │   └── ai.py
│   ├── services/
│   │   ├── supabase_service.py
│   │   ├── paper_search_service.py
│   │   └── openai_service.py
│   ├── prompts/
│   │   └── paper_prompts.py
│   └── utils/
│       └── framework_guidance.py
├── README.md
├── PROMPT_LOG.md
├── REFLECTION.md
├── .env.example
└── .gitignore

⸻

15. Database Schema

15.1 profiles

Purpose: basic user profile metadata

Fields:

* id (UUID, references auth user)
* email
* created_at

15.2 projects

Purpose: store research projects

Fields:

* id (UUID)
* user_id (UUID)
* title (text)
* description (text)
* framework_type (text)
* created_at (timestamp)
* updated_at (timestamp)

15.3 saved_papers

Purpose: papers saved to a project

Fields:

* id (UUID)
* project_id (UUID)
* external_paper_id (text)
* source (text)
* title (text)
* authors (text or json)
* year (integer)
* abstract (text)
* url (text)
* created_at (timestamp)

15.4 ai_outputs

Purpose: optionally store AI-generated outputs for history

Fields:

* id (UUID)
* saved_paper_id (UUID)
* output_type (text: summary / explanation / quiz)
* content (json or text)
* created_at (timestamp)

Optional for MVP. Can be added later if needed.

⸻

16. Backend API Endpoints

Auth

Supabase handles auth mostly client-side, but backend may validate tokens if needed.

Projects

* GET /projects
* POST /projects
* GET /projects/{project_id}
* PUT /projects/{project_id}
* DELETE /projects/{project_id}

Papers

* GET /papers/search?q=...
* POST /projects/{project_id}/papers
* GET /projects/{project_id}/papers

AI

* POST /ai/summarize
* POST /ai/explain
* POST /ai/quiz
* POST /ai/recommend

⸻

17. Data Models

Project object

{
  "id": "uuid",
  "title": "Climate Migration and Coastal Risk",
  "description": "A beginner research project on climate migration in Bangladesh.",
  "framework_type": "IMRAD",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}

Paper object

{
  "external_paper_id": "abc123",
  "source": "Semantic Scholar",
  "title": "Example Paper Title",
  "authors": ["Author One", "Author Two"],
  "year": 2023,
  "abstract": "This paper examines...",
  "url": "https://..."
}

⸻

18. Error Handling Requirements

The system should:

* show user-friendly errors for failed API calls
* handle empty search results gracefully
* handle missing abstract data
* prevent crashes from incomplete paper metadata
* show loading states for AI calls
* show auth-required messages when necessary

Examples:

* “No papers found for this search.”
* “Could not generate summary right now. Please try again.”
* “Please log in to save papers.”

⸻

19. Security Requirements

* store all API keys in environment variables
* never expose OpenAI API key on frontend
* keep database operations scoped to authenticated user
* use Supabase auth/session handling securely
* avoid committing secrets to GitHub

Environment variables may include:

* OPENAI_API_KEY
* SUPABASE_URL
* SUPABASE_ANON_KEY
* SUPABASE_SERVICE_ROLE_KEY if needed on backend
* academic API key if a chosen source requires one

⸻

20. Research Framework Guidance Content

IMRAD

Description: Standard empirical research structure
Prompts:

* What is your research question?
* What background does the reader need?
* What method will you use?
* What results do you expect or observe?
* What do the results mean?

Review / Survey

Description: Summarize and compare existing literature
Prompts:

* What topic scope are you reviewing?
* How will you search for literature?
* What themes appear repeatedly?
* How do sources differ?
* What gap or open question remains?

Theoretical Paper

Description: Build an argument or conceptual model
Prompts:

* What is the core problem?
* What assumptions are you making?
* What is your claim or proposition?
* How do you justify it?
* Why does it matter?

Case Study

Description: Analyze one specific case in depth
Prompts:

* What is the context?
* What happened or what is the issue?
* What evidence do you have?
* What does it reveal?
* What broader lesson follows?

⸻

21. AI Prompt Behavior Requirements

The AI should:

* use simple but accurate language
* avoid inventing facts not in the provided paper data
* clearly label uncertainty when needed
* be beginner-friendly
* produce short, structured outputs

Summary output format

* Main idea
* Key contribution
* Why it matters

Beginner explanation output format

* What this paper is about
* Key terms in simple words
* Why a student should care

Quiz output format

* 3–5 questions
* conceptual
* answerable from the paper summary/abstract/context

⸻

22. Success Criteria for MVP

The MVP is successful if a user can:

1. sign up and log in
2. create a project
3. choose a framework type
4. search for papers
5. save at least one paper to a project
6. generate at least one AI summary or quiz
7. view a clean, working interface without major bugs

⸻

23. Nice-to-Have Features If Time Allows

* save notes per section of framework guidance
* save AI outputs to database
* project progress indicator
* favorite papers
* duplicate-project prevention improvements
* better recommendation ranking
* copy/share reading list link
* improved loading animations

⸻

24. Future Roadmap

Version 2

* collaborative project sharing
* richer related-paper recommendation engine
* note-taking per paper
* citation export
* paper comparison view

Version 3

* mobile app
* Chrome extension
* PDF upload and paper parsing
* paper revision assistance
* writing support for draft sections

⸻

25. MVP Development Phases

Phase 1: Project setup

* create repo
* scaffold frontend and backend
* set up Supabase project
* configure environment variables

Phase 2: Auth + dashboard

* implement signup/login/logout
* create dashboard UI
* connect user session

Phase 3: Project CRUD

* create/edit/delete/view projects
* framework selection
* dashboard project cards

Phase 4: Paper search + save

* connect academic API
* show result cards
* save selected paper to project

Phase 5: AI actions

* summarize
* explain
* generate quiz

Phase 6: polish + docs

* improve styling
* handle errors
* write README
* write prompt log
* prep demo

⸻

26. Oral Exam Readiness Notes

The codebase should make it easy to explain:

* how frontend talks to backend
* how backend calls OpenAI
* how paper search is normalized
* how Supabase stores projects and saved papers
* how framework guidance is generated/displayed
* what logic was manually written

Best custom logic to emphasize:

* framework guidance design
* related-paper recommendation logic
* normalized paper data model
* UI flow for project-based research support

⸻

27. README Positioning Statement

Suggested README opening:

LitLab is a beginner-friendly AI-powered research assistant that helps students create research projects, search and save academic papers, and understand literature through summaries, explanations, and comprehension questions.

⸻

28. Final Product Vision

LitLab is not just a paper tool. It is an early-stage research thinking platform for beginners. The MVP focuses on helping users move from confusion to structure by combining:

* project organization
* paper discovery
* AI understanding
* research framework guidance