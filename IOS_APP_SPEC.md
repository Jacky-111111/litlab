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
    static let apiBaseURL       = URL(string: "https://litlab-delta.vercel.app/api")!

    // For local development against `./backend/run_dev.sh` on the same LAN:
    // static let apiBaseURL = URL(string: "http://<mac-lan-ip>:5500/api")!
}
```

> The web app's public Supabase URL + anon key live in
> `frontend/config.js` in the LitLab repo. Reuse the **same values** on iOS.
> The production backend is deployed at `https://litlab-delta.vercel.app`
> and all API calls hit `https://litlab-delta.vercel.app/api/...`.

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

Base URL: `AppConfig.apiBaseURL` = `https://litlab-delta.vercel.app/api`.
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
- A small debug caption showing the backend host
  (`litlab-delta.vercel.app`) is acceptable while the app is in TestFlight.

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

## 10. Design system (MUST match the web app)

The iOS app is a direct visual sibling of the LitLab web app. All tokens
below are lifted verbatim from `frontend/styles.css` — **do not invent new
colors, radii, or shadows**. If something isn't covered here, pick the closest
token, don't make up a new one.

### 10.1 Color tokens

Create a single `LitLabTheme.swift` that exposes every token as a computed
`Color` so that light/dark values are picked automatically.

| Token                | Light          | Dark           | Used for                           |
|----------------------|----------------|----------------|------------------------------------|
| `bg`                 | `#F6F8FC`      | `#0F1420`      | App background                     |
| `surface`            | `#FFFFFF`      | `#161D2B`      | Cards, list rows, nav bars         |
| `surfaceSoft`        | `#FBFCFF`      | `#1B2435`      | Subtle panels, segmented bg        |
| `text`               | `#131722`      | `#E8EDF7`      | Primary text                       |
| `muted`              | `#5D6579`      | `#A7B2C9`      | Secondary text, captions           |
| `primary` (accent)   | `#2158D9`      | `#5C8FFF`      | Buttons, links, selected states    |
| `primarySoft`        | `#E7EFFF`      | `#22365F`      | Pills, chip backgrounds, hover bg  |
| `danger`             | `#C8354E`      | `#E0536D`      | Sign-out button, destructive text  |
| `border`             | `#DDE4F2`      | `#2A3550`      | Hairlines, card borders            |
| `infoBg` / `infoText`     | `#EDF2FF` / `#2C4376` | `#1F2E53` / `#C9D9FF` | Info banners                |
| `successBg` / `successText` | `#E8F9EF` / `#1E6D41` | `#17362A` / `#A9F0CD` | Success toast (rare in v1)  |
| `warningBg` / `warningText` | `#FFF5DB` / `#885B00` | `#4A3512` / `#FFE4A4` | Warning banners             |
| `errorBg` / `errorText`     | `#FFE9EE` / `#9F1F39` | `#4D1F29` / `#FFC4CF` | Error banners               |

Recommended SwiftUI snippet (iOS 17):

```swift
extension Color {
    static let litlabBg           = Color(light: 0xF6F8FC, dark: 0x0F1420)
    static let litlabSurface      = Color(light: 0xFFFFFF, dark: 0x161D2B)
    static let litlabSurfaceSoft  = Color(light: 0xFBFCFF, dark: 0x1B2435)
    static let litlabText         = Color(light: 0x131722, dark: 0xE8EDF7)
    static let litlabMuted        = Color(light: 0x5D6579, dark: 0xA7B2C9)
    static let litlabPrimary      = Color(light: 0x2158D9, dark: 0x5C8FFF)
    static let litlabPrimarySoft  = Color(light: 0xE7EFFF, dark: 0x22365F)
    static let litlabDanger       = Color(light: 0xC8354E, dark: 0xE0536D)
    static let litlabBorder       = Color(light: 0xDDE4F2, dark: 0x2A3550)
}

extension Color {
    init(light: UInt, dark: UInt) {
        self = Color(UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(hex: dark) : UIColor(hex: light)
        })
    }
}
```

Set the app-wide accent via `.tint(.litlabPrimary)` at the root of
`LitLabiOSApp`. That propagates to `TabView` selected icon, buttons, links,
`ProgressView`, toggles, etc.

### 10.2 Typography

The web brand uses **Inter**. Ship Inter with the app (variable font TTF
dropped into the bundle + `UIAppFonts` in Info.plist). If Inter is missing
for any reason, fall back to SF Pro (`.system`). Never mix fonts per screen.

| Role         | Font           | Size / Weight            | Swift                                    |
|--------------|----------------|--------------------------|------------------------------------------|
| Brand wordmark (nav title) | Inter 800 | 22 pt              | `.font(.inter(.extraBold, 22))`          |
| Screen title | Inter 700      | 28 pt (large), 20 (inline) | `.font(.inter(.bold, 28))`             |
| Card title   | Inter 700      | 17 pt                    | `.font(.inter(.bold, 17))`               |
| Body         | Inter 400      | 15 pt, line 1.5          | `.font(.inter(.regular, 15))`            |
| Secondary / caption | Inter 400 | 13 pt, `litlabMuted`   | `.font(.inter(.regular, 13))`            |
| Button label | Inter 600      | 15 pt                    | `.font(.inter(.semibold, 15))`           |
| Monospace (user_id, citation) | SF Mono | 13 pt              | `.font(.system(.footnote, design: .monospaced))` |

Line height: 1.45–1.6 for body text. Never use `.font(.largeTitle)` raw —
always go through the scale above.

### 10.3 Spacing, radius, and elevation

Web tokens: `--radius: 14px`, `--shadow: 0 8px 24px rgba(20,30,60,0.08)`.

Use a 4-pt grid. Approved spacings: `4, 8, 12, 16, 20, 24, 32, 40`. Nothing
else.

| Element              | Corner radius | Padding                          | Shadow                                    |
|----------------------|---------------|----------------------------------|-------------------------------------------|
| Card / panel         | 14            | 16                               | `y 8, blur 24, opacity 0.08` (light only) |
| List row             | 12            | h 16, v 12                       | none — rely on card container             |
| Button (primary)     | 10            | h 16, v 12 (44 pt min tap height)| none                                      |
| Button (secondary)   | 10            | h 16, v 12                       | 1 px `litlabBorder` stroke                |
| Segmented control    | 12            | 4                                | none                                      |
| Pill / chip (framework) | 999 (capsule) | h 10, v 4                     | none                                      |
| Text input           | 10            | h 12, v 10                       | 1 px `litlabBorder` stroke                |

Dark mode disables the soft shadow (web uses `0 10px 30px rgba(0,0,0,0.35)`,
but on iOS it usually looks muddy — skip shadow in dark mode and rely on the
`litlabBorder` hairline instead).

### 10.4 Component recipes

**Card** (used for every content grouping on every screen):

```swift
struct LitLabCard<Content: View>: View {
    @ViewBuilder var content: Content
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        content
            .padding(16)
            .background(Color.litlabSurface)
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.litlabBorder, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .shadow(color: scheme == .dark ? .clear
                                           : Color(red: 0.08, green: 0.12, blue: 0.24, opacity: 0.08),
                    radius: 12, x: 0, y: 8)
    }
}
```

**Primary button**: background `litlabPrimary`, label white, radius 10,
min-height 44. Pressed state: darken background by ~12% (web uses `#1C4CC0`,
so hardcode that as `litlabPrimaryPressed = 0x1C4CC0 / 0x4677E6`).

**Secondary button**: clear background, `litlabPrimary` label + 1 px
`litlabPrimary` stroke. Pressed: `litlabPrimarySoft` background.

**Destructive button** (only Sign Out): `litlabDanger` background, white
label. No other destructive actions in v1.

**Framework pill**: capsule, `litlabPrimarySoft` background, `litlabPrimary`
text, 13 pt semibold, inset 10/4.

**Paper row**:

```
┌──────────────────────────────────────────────┐
│ {nickname or title}                          │  ← 15 pt, semibold, litlabText
│ {authors.prefix(3).joined(", ")} · {year}    │  ← 13 pt, litlabMuted
└──────────────────────────────────────────────┘
```

Dividers between rows use a 1 px line in `litlabBorder`. No chevrons on
right — the whole row is tappable and SwiftUI's `NavigationLink` arrow is
fine.

**Empty state**: a centered SF Symbol (40 pt, `litlabMuted`), a 17 pt bold
`litlabText` headline, and a 14 pt `litlabMuted` caption below. Choose
symbols that match: `books.vertical` (library empty), `folder.badge.questionmark`
(projects empty), `tray` (collection empty).

### 10.5 Global UI behaviors

- Root view sets `.tint(.litlabPrimary)` and
  `.background(Color.litlabBg.ignoresSafeArea())`.
- Use `ScrollView { LazyVStack(spacing: 12) { … } }` for content lists
  (wrapped in `LitLabCard`s) so spacing & color match the web cards.
  Exception: `AccountView` may use `Form { Section { … } }` with
  `.scrollContentBackground(.hidden)` + `.background(Color.litlabBg)` to keep
  native feel while matching the palette.
- `TabView` items use SF Symbols listed in §8, tinted by the accent token.
  Set `UITabBar.appearance().backgroundColor = UIColor(Color.litlabSurface)`
  in `init()` of the app struct.
- `NavigationStack` titles: `.navigationTitle(...)` with
  `.navigationBarTitleDisplayMode(.inline)` on detail screens, `.large` on
  tab root screens.
- Navigation bar background: `.toolbarBackground(Color.litlabSurface, for: .navigationBar)`
  and `.toolbarBackground(.visible, for: .navigationBar)`.
- **Loading**: centered `ProgressView().tint(.litlabPrimary)`, ~200 ms
  debounce before showing so fast responses don't flash a spinner.
- **Errors**: inline banner using `errorBg`/`errorText` tokens with a
  `Retry` secondary button. Never use `Alert` for network errors on list
  screens. Alerts are reserved for Sign Out confirmation.
- **Pull-to-refresh**: `.refreshable { await vm.reload() }` on every list.
- Haptics: `UIImpactFeedbackGenerator(style: .light)` on tab change and on
  successful sign-in. No haptics on failures.
- Animations: use `.animation(.smooth, value: ...)` on state transitions —
  do not chain manual springs. Keep it calm; LitLab is a reading app.

### 10.6 Screen-by-screen visual notes

- **LoginView**: centered `LitLabCard` on `litlabBg`. Brand wordmark
  "LitLab" at top in Inter ExtraBold 28 pt, `litlabPrimary`. Two rounded
  text fields, then a primary button. Error banner slides in above the
  button when auth fails.
- **LibraryHomeView**: custom segmented control (capsule background in
  `litlabSurfaceSoft`, selected pill in `litlabPrimary` with white label) —
  do NOT use `Picker(.segmented)` because its color API is too limited for
  brand parity.
- **CollectionListView**: each collection is a `LitLabCard` showing title
  (17 pt bold), description (14 pt muted, max 2 lines), and a right-aligned
  `chevron.right` symbol in `litlabMuted`.
- **PaperListView**: a single `LitLabCard` that contains a `LazyVStack` of
  paper rows separated by 1 px `litlabBorder` dividers. Feels like one panel.
- **PaperDetailView**: stacked `LitLabCard`s — "Overview" (title, authors,
  year/source), "Abstract", "Cite" (APA block in monospaced 13 pt inside a
  `litlabSurfaceSoft` box with 10 pt radius). "View source" is a secondary
  button at the bottom.
- **ProjectListView**: each row is a `LitLabCard` with the project title
  (17 pt bold), a framework pill right below, and a small
  `Updated 3d ago` caption in `litlabMuted` on the right.
- **ProjectSpaceView**: first `LitLabCard` = project header (title, pill,
  description, goal). Second card = "Framework Guidance" with a short intro
  and a `DisclosureGroup` per section (section title bold, explanation
  muted, prompt rendered in `litlabSurfaceSoft` sub-box with italic). Third
  card = "Papers in this project" — same row style as Library.
- **AccountView**: one `LitLabCard` listing the 4 profile fields with
  label-on-left / value-on-right layout (label in `litlabMuted` 13 pt,
  value in `litlabText` 15 pt; `user_id` is monospaced footnote). Sign Out
  is a destructive button at the bottom, outside the card, with 24 pt
  spacing above it.

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
