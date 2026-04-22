// Read-only shared collection page.
//
// This file intentionally avoids `window.LitLab.apiFetch` because that helper
// auto-signs the user out on 401. Here, a 401 from the backend only means our
// token is stale — it should not nuke the viewer's session. The backend
// returns 200 + an access envelope for denied states, so 401 really only
// occurs when Supabase could not validate the token; we treat that as
// "sign in required".

const apiBaseUrl =
  (window.LitLab && window.LitLab.LitLabConfig && window.LitLab.LitLabConfig.apiBaseUrl) ||
  "http://127.0.0.1:8000";

const loadingPanelEl = document.getElementById("shared-loading-panel");
const deniedPanelEl = document.getElementById("shared-denied-panel");
const deniedTitleEl = document.getElementById("shared-denied-title");
const deniedBodyEl = document.getElementById("shared-denied-body");
const deniedActionsEl = document.getElementById("shared-denied-actions");
const grantedPanelEl = document.getElementById("shared-granted-panel");
const titleEl = document.getElementById("shared-collection-title");
const visibilityEl = document.getElementById("shared-collection-visibility");
const descriptionEl = document.getElementById("shared-collection-description");
const sharerNicknameEl = document.getElementById("sharer-nickname");
const sharerHandleEl = document.getElementById("sharer-handle");
const sharerEmailEl = document.getElementById("sharer-email");
const sharerSchoolEl = document.getElementById("sharer-school");
const papersListEl = document.getElementById("shared-papers-list");
const paperCountEl = document.getElementById("shared-paper-count");
const signInLinkEl = document.getElementById("shared-sign-in-link");

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function getQueryParam(name) {
  try {
    return new URL(window.location.href).searchParams.get(name) || "";
  } catch (_error) {
    return "";
  }
}

function getStoredToken() {
  try {
    return localStorage.getItem("litlab_access_token") || "";
  } catch (_error) {
    return "";
  }
}

function currentPageAsNext() {
  return window.location.pathname + window.location.search;
}

function signInHref() {
  const next = encodeURIComponent(currentPageAsNext());
  return `index.html?next=${next}`;
}

async function sharedFetch(slug) {
  const headers = { "Content-Type": "application/json" };
  const token = getStoredToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`${apiBaseUrl}/shared/c/${encodeURIComponent(slug)}`, {
    method: "GET",
    headers,
  });
  if (response.status === 401) {
    // Stale token on an anonymous-friendly page — treat as "sign in required"
    // without wiping the session. The user's dashboard elsewhere will sort it
    // out on its next apiFetch.
    return { access: "denied", reason: "sign_in_required" };
  }
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}).`);
  }
  return response.json();
}

function hideAllPanels() {
  if (loadingPanelEl) loadingPanelEl.hidden = true;
  if (deniedPanelEl) deniedPanelEl.hidden = true;
  if (grantedPanelEl) grantedPanelEl.hidden = true;
}

function showLoading() {
  hideAllPanels();
  if (loadingPanelEl) loadingPanelEl.hidden = false;
}

function showDenied({ title, body, actionsHtml }) {
  hideAllPanels();
  if (deniedPanelEl) deniedPanelEl.hidden = false;
  if (deniedTitleEl) deniedTitleEl.textContent = title;
  if (deniedBodyEl) deniedBodyEl.textContent = body;
  if (deniedActionsEl) deniedActionsEl.innerHTML = actionsHtml || "";
}

function paperRowTemplate(paper) {
  const displayName = (paper.nickname || paper.title || "Untitled paper").trim();
  const authors = Array.isArray(paper.authors) && paper.authors.length
    ? paper.authors.join(", ")
    : "Unknown author";
  const year = paper.year ? ` · ${paper.year}` : "";
  const source = paper.source ? ` · ${paper.source}` : "";
  const abstract = paper.abstract
    ? `<p class="muted shared-paper-abstract">${escapeHtml(paper.abstract)}</p>`
    : "";
  const urlLink = paper.url
    ? `<a class="button secondary" href="${escapeHtml(paper.url)}" target="_blank" rel="noopener noreferrer">Open source</a>`
    : "";
  return `
    <article class="card shared-paper-card">
      <h3>${escapeHtml(displayName)}</h3>
      <p class="muted">${escapeHtml(authors)}${escapeHtml(year)}${escapeHtml(source)}</p>
      ${abstract}
      ${urlLink ? `<div class="inline-actions">${urlLink}</div>` : ""}
    </article>
  `;
}

function renderGranted(data) {
  hideAllPanels();
  if (grantedPanelEl) grantedPanelEl.hidden = false;

  const collection = data.collection || {};
  const sharer = data.sharer || {};
  const papers = Array.isArray(data.papers) ? data.papers : [];

  if (titleEl) titleEl.textContent = collection.title || "Shared collection";
  if (visibilityEl) {
    const visibility = collection.visibility || "private";
    visibilityEl.textContent = visibility;
    visibilityEl.className = `badge ${
      visibility === "public" ? "violet" : visibility === "selected" ? "teal" : "gray"
    }`;
  }
  if (descriptionEl) {
    descriptionEl.textContent = collection.description || "";
    descriptionEl.hidden = !collection.description;
  }

  if (sharerNicknameEl) sharerNicknameEl.textContent = sharer.nickname || "—";
  if (sharerHandleEl) {
    sharerHandleEl.textContent = sharer.public_handle ? `@${sharer.public_handle}` : "—";
  }
  if (sharerEmailEl) sharerEmailEl.textContent = sharer.email || "—";
  if (sharerSchoolEl) sharerSchoolEl.textContent = sharer.school || "—";

  if (paperCountEl) paperCountEl.textContent = pluralize(papers.length, "paper");
  if (papersListEl) {
    papersListEl.innerHTML = papers.length
      ? papers.map(paperRowTemplate).join("")
      : "<p class='muted'>This collection does not contain any papers yet.</p>";
  }

  if (signInLinkEl && data.viewer && data.viewer.is_authenticated) {
    signInLinkEl.hidden = true;
  }
}

function handleDenied(reason) {
  switch (reason) {
    case "sign_in_required":
      showDenied({
        title: "Sign in required",
        body: "This collection is shared with specific people. Please sign in to continue.",
        actionsHtml: `<a class="button" href="${signInHref()}">Sign in</a>`,
      });
      return;
    case "not_authorized":
      showDenied({
        title: "Not invited",
        body:
          "This collection is shared with specific people and your account is not on the list. Ask the owner to add your email.",
        actionsHtml: `<a class="button secondary" href="index.html">Back to LitLab</a>`,
      });
      return;
    case "private":
      showDenied({
        title: "Private collection",
        body: "The owner has not made this collection shareable.",
        actionsHtml: `<a class="button secondary" href="index.html">Back to LitLab</a>`,
      });
      return;
    case "not_found":
    default:
      showDenied({
        title: "Link is invalid",
        body: "We couldn't find a shared collection for this link. It may have been removed or regenerated.",
        actionsHtml: `<a class="button secondary" href="index.html">Back to LitLab</a>`,
      });
  }
}

async function main() {
  const slug = getQueryParam("slug");
  if (!slug) {
    handleDenied("not_found");
    return;
  }

  showLoading();

  try {
    const data = await sharedFetch(slug);
    if (!data || typeof data !== "object") {
      handleDenied("not_found");
      return;
    }
    if (data.access === "granted") {
      renderGranted(data);
    } else {
      handleDenied(data.reason || "not_found");
    }
  } catch (error) {
    showDenied({
      title: "Could not load shared collection",
      body: error.message || "Network error. Please try again later.",
      actionsHtml: `<a class="button secondary" href="index.html">Back to LitLab</a>`,
    });
  }
}

main();
