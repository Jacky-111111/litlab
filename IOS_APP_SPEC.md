# LitLab iOS App — Build Spec (v1)

This document is a self-contained build spec for the LitLab iOS companion app.
Hand this file to a Cursor agent (or any iOS developer) and they should be able
to implement the whole app without reading the web codebase.

The iOS app reuses **the same Supabase project** and **the same FastAPI
backend** as the web app. There is no new backend work in this spec.

---

## 1. Product scope

LitLab iOS v1 is a **read-only companion** to the LitLab web app. Users sign
in with their existing LitLab (Supabase) account and can:

1. **My Account** — sign in / sign out, see profile.
2. **Projects** — list their projects, tap a project to enter its space
   (project metadata + framework guidance + papers in that project).
3. **Library** — view all papers they have saved across the whole library,
   plus browse their collections and view each collection's papers.

### Explicit non-goals for v1

The app must NOT implement these:

- Creating / editing / deleting projects.
- Creating / editing / deleting collections.
- Creating / deleting papers, uploading PDFs, editing notes, changing URLs.
- Paper search (Semantic Scholar).
- AI features: summarize, explain, quiz, recommend, URL/PDF analysis.
- Sharing (share links, invitations, public collections).
- Offline sync / caching beyond in-memory.
- Push notifications.

If the spec says the app only *views* something, it only views it.

---

## 2. Platform & tech stack

- **Target**: iOS 17.0+
- **Language**: Swift 5.9+
- **UI**: SwiftUI (`TabView` with 3 tabs matching the Library / Projects / My
  Account wireframe)
- **Auth**: [`supabase-swift`](https://github.com/supabase/supabase-swift) —
  `GoTrue` for email+password login, session persistence, refresh.
- **Networking**: `URLSession` + `async/await` + `Codable`. No third-party
  networking library needed.
- **Concurrency**: Swift Concurrency (`async/await`, `@MainActor` for
  view-model updates).
- **State**: `@Observable` view-models (iOS 17 Observation framework) injected
  via `@Environment`. Avoid singletons except for the shared `SupabaseClient`.
- **Min deps** (Swift Package Manager):
  - `supabase-swift` (latest 2.x)
  - No other runtime packages required.

---

## 3. Configuration

Create a `Config.swift` file that reads the following values (hard-coded for
v1 is fine, but keep them in one place):

```swift
enum AppConfig {
    // Supabase — same project the web app uses.
    static let supabaseURL      = URL(string: "https://uguvepoqmkauovjljytn.supabase.co")!
    static let supabaseAnonKey  = "sb_publishable_Z5e3UZno3wIAea5SVVI1zg_ukkD6HYr"

    // Backend API base. Production is same-origin `/api` on Vercel, but
    // the iOS client always needs an absolute URL.
    // Replace with the real deployed URL once known.
    static let apiBaseURL       = URL(string: "https://<your-litlab-vercel-domain>/api")!

    // For local development against `./backend/run_dev.sh` on the same LAN:
    // static let apiBaseURL = URL(string: "http://<mac-lan-ip>:5500/api")!
}
```

> The web app's public Supabase URL + anon key live in
> `frontend/config.js` in the LitLab repo. Reuse the **same values** on iOS.
> The `apiBaseURL` must be the deployed domain (e.g. `https://litlab.app/api`),
> since iOS can't resolve `/api` like the browser does.

### App Transport Security

If the dev team needs to hit the backend over plain HTTP during local
development, add an ATS exception for that specific LAN IP only. Production
must stay HTTPS-only.

---

## 4. Authentication model

The web app delegates auth entirely to Supabase and just forwards the access
token to the FastAPI backend. iOS does the same:

1. User enters email + password on **Login screen**.
2. App calls `SupabaseClient.shared.auth.signIn(email:password:)`.
3. On success, `supabase-swift` stores the session automatically and exposes
   `session.accessToken` + `session.user`.
4. For every call to the LitLab backend, attach
   `Authorization: Bearer <accessToken>`.
5. On app launch, call `auth.session` — if a valid session exists, go
   straight to the tab bar. Otherwise show the Login screen.
6. `auth.onAuthStateChange` should:
   - On `.signedIn` → navigate to the main `TabView`.
   - On `.signedOut` / `.tokenRefreshFailure` → clear in-memory caches and
     navigate back to Login.
7. Token refresh is automatic inside `supabase-swift`; do not manage it
   yourself. Always read `auth.session.accessToken` right before each HTTP
   request so you pick up refreshed tokens.

### Login screen behavior

- Email + password fields, "Sign In" primary button.
- Show a small "Don't have an account? Sign up on LitLab web." caption —
  **v1 does not implement sign-up in the iOS app**. Link out with `UIApplication.open` to `https://<your-litlab-vercel-domain>/` if the tester insists.
- On auth error, show the Supabase error message inline (do not try to
  humanize it further in v1).
- Persist session automatically via `supabase-swift`'s default storage
  (UserDefaults-backed secure storage). Sign-out must call `auth.signOut()`.

---

## 5. Networking layer

Implement one small API client. All endpoints below are JSON in / JSON out
and all (except `/health`) require the `Authorization: Bearer ...` header.

```swift
actor APIClient {
    static let shared = APIClient()

    func get<T: Decodable>(_ path: String, query: [String: String] = [:]) async throws -> T { ... }
    func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T { ... }
    // PUT/PATCH/DELETE not needed for v1 (the app is read-only).
}
```

Rules:

- Prepend `AppConfig.apiBaseURL` to every path (so pass `"/projects"`, not the
  whole URL).
- Fetch `accessToken` from `SupabaseClient.shared.auth.session` on every call.
  If it's missing, throw `APIError.notAuthenticated` and have the app route
  back to Login.
- On HTTP 401 from backend, trigger sign-out.
- On HTTP 4xx/5xx, try to decode `{"detail": "..."}` (FastAPI default) into an
  `APIError.server(message:)` and surface it in the UI. Otherwise fall back
  to `"Something went wrong (\(statusCode))"`.
- Decode using `JSONDecoder` with `.convertFromSnakeCase`? **No** — the
  backend already uses snake_case in JSON but our Swift models below use
  `CodingKeys` explicitly. Keep the default decoder (no key strategy) so
  Codable keys match the JSON exactly as written in the models.
- Set `timeoutIntervalForRequest = 30`.

---

## 6. Data models (Swift)

These mirror exactly what the backend returns. Stick to `let` properties;
v1 never mutates a server object locally.

```swift
struct Profile: Decodable, Identifiable {
    var id: String { user_id }
    let user_id: String
    let email: String
    let nickname: String      // display as "Username"
    let school: String
    let public_handle: String
}
struct ProfileEnvelope: Decodable { let profile: Profile }

struct Project: Decodable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let framework_type: String          // "IMRAD" | "Review / Survey" | "Theoretical Paper" | "Case Study"
    let goal: String?
    let status: String?
    let created_at: String?
    let updated_at: String?
}
struct ProjectsEnvelope: Decodable { let projects: [Project] }

struct FrameworkSection: Decodable, Identifiable {
    var id: String { title }
    let title: String
    let explanation: String
    let prompt: String
}
struct FrameworkGuidance: Decodable {
    let description: String
    let sections: [FrameworkSection]
}
struct ProjectDetailEnvelope: Decodable {
    let project: Project
    let framework_guidance: FrameworkGuidance
}

struct Collection: Decodable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let visibility: String?
    let share_slug: String?
    let created_at: String?
    let updated_at: String?
}
struct CollectionsEnvelope: Decodable { let collections: [Collection] }

struct Paper: Decodable, Identifiable {
    let id: String
    let external_paper_id: String
    let source: String
    let title: String
    let nickname: String
    let authors: [String]
    let year: Int?
    let abstract: String
    let url: String
    let pdf_storage_path: String
    let content_hash: String
    let citation_mla: String
    let citation_apa: String
    let citation_chicago: String
    let created_at: String?
    let updated_at: String?
}
struct PapersEnvelope: Decodable { let papers: [Paper] }
```

Dates come back as ISO8601 strings; keep them as `String` and format lazily
in the UI with `ISO8601DateFormatter` → `Date.FormatStyle`. Do not make them
`Date` in the struct, because some values can be `null` and the decoder
strictness is not worth the bug surface for v1.

---

## 7. Backend endpoints used by iOS v1

Base URL: `AppConfig.apiBaseURL` (e.g. `https://<host>/api`).
All of these exist already in the backend — no backend changes required.

All require `Authorization: Bearer <access_token>` unless noted.

### 7.1 Health (public, optional debug use)

```
GET /health                  → { "status": "ok" }
```

### 7.2 Account / profile

```
GET /account/profile
→ {
    "profile": {
      "user_id": "uuid",
      "email":   "alice@example.com",
      "nickname":"Alice",
      "school":  "NYU",
      "public_handle": ""
    }
  }
```

v1 does not call `PUT /account/profile` (no editing on mobile).

### 7.3 Projects

```
GET /projects
→ { "projects": [ Project, ... ] }       // newest first

GET /projects/{project_id}
→ { "project": Project,
    "framework_guidance": FrameworkGuidance }

GET /projects/{project_id}/papers
→ { "papers": [ Paper, ... ] }            // aggregated across all
                                          // collections attached to the
                                          // project, de-duplicated.

GET /projects/{project_id}/collections
→ { "collections": [ Collection + { "is_primary": Bool, "attached_at": "iso" }, ... ] }
```

The extra `is_primary` / `attached_at` fields on the per-project collections
response are optional on the Swift model — make them `let is_primary: Bool?`
and `let attached_at: String?` in a dedicated `ProjectCollection` type if the
UI ever needs them. v1 does not need them.

### 7.4 Library — all papers

```
GET /papers?limit=50&offset=0
→ { "papers": [ Paper, ... ] }            // newest-updated first
```

- Default `limit` is 20, max 100. v1 can request 50 per page.
- Pagination is `offset`-based; infinite scroll should bump `offset` by the
  returned count.
- The web app exposes a `q=` filter but v1 iOS does not use it (no search).

### 7.5 Library — collections

```
GET /collections
→ { "collections": [ Collection, ... ] }  // user's own collections

GET /collections/{collection_id}
→ { "collection": Collection }

GET /collections/{collection_id}/papers
→ { "papers": [ Paper, ... ] }            // newest-attached first
```

### 7.6 Single paper (optional, for future paper detail screen)

v1 can keep paper detail inline and not call this, but it is available:

```
GET /papers/{paper_id}
→ { "paper": Paper,
    "note": { "paper_id": "uuid", "content": "...", "updated_at": "iso" | null },
    "collection_ids": [ "uuid", ... ] }
```

v1 should **not** call `/papers/{paper_id}/pdf-download-url` (the app does
not open PDFs).

---

## 8. Screens & navigation

Root: `if auth.isSignedIn { MainTabView } else { LoginView }`.

`MainTabView` is a `TabView` with 3 tabs, in this order (matches the
wireframe):

| Tab | Icon (SF Symbol) | Label       |
|-----|------------------|-------------|
| 0   | `books.vertical` | Library     |
| 1   | `folder`         | Projects    |
| 2   | `person.crop.circle` | My Account |

Each tab has its own `NavigationStack`.

### 8.1 Library tab

`LibraryHomeView` has a segmented control at the top with two options:

- **All** — renders `PaperListView(source: .allLibrary)`
  backed by `GET /papers`.
- **Collections** — renders `CollectionListView` backed by `GET /collections`.
  Tapping a collection pushes `PaperListView(source: .collection(id))` backed
  by `GET /collections/{id}/papers`. The title in the nav bar is the
  collection's `title`.

**Paper row**: show `paper.nickname` (fall back to `title` if nickname is
empty), then a secondary line with `authors.prefix(3).joined(separator: ", ")`
and `year` if present. No action buttons on v1.

**Paper detail** (tap a row): push `PaperDetailView` showing:

- Title (large)
- Authors (comma-joined)
- Year, source
- Abstract (scrollable)
- APA citation (in a monospaced block)
- If `paper.url` is non-empty: a "View source" button that opens the URL in
  `SFSafariViewController`.

No edit, no delete, no AI, no notes in v1.

**Empty states**:

- "No papers in your library yet. Add some from the LitLab web app."
- "No collections yet. Create collections from the LitLab web app."

### 8.2 Projects tab

`ProjectListView` — `GET /projects`. Each row shows:

- `project.title` (primary)
- `project.framework_type` as a small pill
- `project.updated_at` relative ("3d ago") if present

Tap a project → push `ProjectSpaceView(projectId:)`.

`ProjectSpaceView`:

- Header: title, framework pill, description (if any), goal (if any).
- **Framework Guidance** section:
  parallel-load `GET /projects/{id}` → render `framework_guidance.description`
  and an expandable list of `sections` (title, explanation, prompt). A
  `DisclosureGroup` per section works well.
- **Papers in this project** section:
  `GET /projects/{id}/papers` → same row UI as Library. Tap to push
  `PaperDetailView`.

Pull-to-refresh reloads all three calls.

**No** create-project button anywhere. **No** edit/delete affordances.

### 8.3 My Account tab

`AccountView` — `GET /account/profile`. Static card layout:

```
Username   : {profile.nickname | "—"}
User ID    : {profile.user_id}               // small, monospaced
Email      : {profile.email}
School     : {profile.school | "—"}
```

Below the card:

- "Sign Out" destructive button → `auth.signOut()` → back to Login.
- Small footer text: `LitLab iOS v1 · © 2026`.

Loading state: skeleton placeholders for the 4 rows.
Error state: "Couldn't load your profile. Pull to retry."

---

## 9. Suggested project structure

```
LitLabiOS/
├── LitLabiOSApp.swift          // @main, decides Login vs TabView
├── Config.swift
├── AppState.swift              // @Observable, owns SupabaseClient + session
├── Networking/
│   ├── APIClient.swift
│   └── APIError.swift
├── Models/
│   ├── Profile.swift
│   ├── Project.swift
│   ├── Collection.swift
│   ├── Paper.swift
│   └── Envelopes.swift
├── Features/
│   ├── Auth/
│   │   └── LoginView.swift
│   ├── Library/
│   │   ├── LibraryHomeView.swift
│   │   ├── PaperListView.swift
│   │   ├── PaperDetailView.swift
│   │   └── CollectionListView.swift
│   ├── Projects/
│   │   ├── ProjectListView.swift
│   │   └── ProjectSpaceView.swift
│   └── Account/
│       └── AccountView.swift
└── Shared/
    ├── LoadingState.swift      // enum LoadingState<T> { idle, loading, loaded(T), failed(String) }
    └── RelativeDateText.swift
```

Keep view-models co-located with their view (`ProjectListView.ViewModel`
nested type is fine). Do not introduce Redux / TCA / Combine pipelines for
v1.

---

## 10. UX details

- Match the LitLab web palette: primary blue accent (`#2563eb` works), near-
  black text on near-white background, generous spacing. Dark mode must look
  correct out of the box — only use semantic `Color`s (`.primary`, `.secondary`,
  `.background`) except for the one accent color.
- Loading: `ProgressView()` centered, ~200ms debounce before showing it so
  fast responses don't flash a spinner.
- Errors: inline `Text` in `.red` with a "Retry" button. Never use `Alert`
  for network errors on list screens.
- Pull-to-refresh on every list (`.refreshable { await vm.reload() }`).
- Empty states: one `Text` headline + one short caption, centered.
- `ScrollView` + `LazyVStack` for list screens (not `List`) so the accent
  color and spacing match the web brand — except the Account screen, which
  can use `Form`/`List` for a native-feeling profile layout.

---

## 11. Acceptance criteria

The app is done for v1 when:

1. User can install, launch, sign in with their existing LitLab (web)
   account, and see their real data.
2. Library → All shows the same papers that `GET /papers` returns in the web
   app.
3. Library → Collections shows the same collections as
   `GET /collections`, and tapping one shows the same papers as
   `GET /collections/{id}/papers`.
4. Projects shows `GET /projects`; tapping one shows its framework guidance
   from `/projects/{id}` and its papers from `/projects/{id}/papers`.
5. My Account shows nickname, user_id, email, school, and Sign Out works
   and returns the user to Login.
6. No screen has a create / edit / delete / search / AI button.
7. App handles expired tokens by returning to Login without crashing.
8. App launches into the correct screen (Login vs TabView) based on stored
   session.
9. Works on iPhone (all sizes iOS 17+) in both light and dark mode.

---

## 12. Out of scope for v1 (for the PM's memory)

If future versions want to add features, the backend already supports:

- Creating projects/collections → `POST /projects`, `POST /collections`.
- Adding papers → `POST /papers/ingest`, `POST /projects/{id}/papers`.
- Editing paper nickname / URL / note → `PUT /papers/{id}/nickname` etc.
- AI actions → `POST /ai/summarize`, `POST /ai/explain`, `POST /ai/quiz`,
  `POST /ai/recommend`, `POST /ai/analysis`.
- Paper search → `GET /papers/search?q=...`.
- Sharing — `GET/PATCH /collections/{id}/sharing`.
- PDF viewing — `GET /papers/{id}/pdf-download-url` returns a signed URL.

Do not wire any of the above in v1. They are listed only so the iOS codebase
is organized in a way that lets us bolt them on later without refactoring
(e.g. don't make `Paper` structs with `let` fields that couldn't hold updated
data — that's fine as-is, just know more fields may appear).
