window.LitLab.requireAuth();

const projectsGridEl = document.getElementById("projects-grid");
const dashboardMessageEl = document.getElementById("dashboard-message");
const logoutButtonEl = document.getElementById("logout-btn");
const emptyStateEl = document.getElementById("empty-state");
const userEmailEl = document.getElementById("user-email");
const librarySummaryEl = document.getElementById("library-summary");
const libraryPreviewEl = document.getElementById("library-preview");
const collectionsGridEl = document.getElementById("collections-grid");
const collectionsEmptyEl = document.getElementById("collections-empty-state");

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function setMessage(text, tone = "info") {
  if (!dashboardMessageEl) return;
  if (!text) {
    dashboardMessageEl.textContent = "";
    dashboardMessageEl.hidden = true;
    return;
  }
  dashboardMessageEl.textContent = text;
  dashboardMessageEl.className = `message ${tone}`;
  dashboardMessageEl.hidden = false;
}

function setLibrarySummary(text, tone = "info") {
  librarySummaryEl.textContent = text;
  librarySummaryEl.className = `message ${tone}`;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function projectCardTemplate(project, paperCount) {
  const frameworkClass = window.LitLab.getFrameworkBadgeClass(project.framework_type);
  const description = project.description || "No description yet.";
  const goalHtml = project.goal
    ? `<p class="muted project-card-goal"><strong>Goal:</strong> ${escapeHtml(project.goal)}</p>`
    : "";
  const countLabel =
    typeof paperCount === "number" ? pluralize(paperCount, "paper") : "… papers";
  return `
    <article class="card project-card">
      <div class="card-head">
        <h3>${escapeHtml(project.title)}</h3>
        <span class="${frameworkClass}">${escapeHtml(project.framework_type)}</span>
      </div>
      <p class="muted">${escapeHtml(description)}</p>
      ${goalHtml}
      <p class="muted project-card-stats"><span class="badge gray">${countLabel}</span></p>
      <div class="project-actions">
        <button data-action="open" data-id="${project.id}">Manage</button>
        <button data-action="delete" data-id="${project.id}" class="danger">Delete</button>
      </div>
    </article>
  `;
}

function paperPreviewCard(paper) {
  const nickname = (paper.nickname || paper.title || "Untitled").trim();
  const title = (paper.title || "Untitled paper").trim();
  const authors = (paper.authors || []).join(", ") || "Unknown author";
  return `
    <article class="mini-card">
      <h4>${escapeHtml(nickname)}</h4>
      <p class="muted">Title: ${escapeHtml(title)}</p>
      <p class="muted">${escapeHtml(authors)}${paper.year ? ` · ${paper.year}` : ""}</p>
    </article>
  `;
}

function collectionCardTemplate(collection, paperCount, isPrimaryForAnyProject) {
  const visibility = collection.visibility || "private";
  const visibilityClass = visibility === "public" ? "violet" : visibility === "link" ? "teal" : "gray";
  const primaryBadge = isPrimaryForAnyProject
    ? `<span class="badge primary-badge">Primary</span>`
    : "";
  const countLabel =
    typeof paperCount === "number" ? pluralize(paperCount, "paper") : "… papers";
  const description = collection.description
    ? `<p class="muted">${escapeHtml(collection.description)}</p>`
    : "";
  return `
    <article class="card collection-card">
      <div class="card-head">
        <h3>${escapeHtml(collection.title || "Untitled collection")}</h3>
        <span class="badge ${visibilityClass}">${escapeHtml(visibility)}</span>
      </div>
      ${description}
      <p class="muted collection-card-stats">
        <span class="badge gray">${countLabel}</span>
        ${primaryBadge}
      </p>
      <div class="project-actions">
        <a class="button secondary" href="library.html">Open in Library</a>
      </div>
    </article>
  `;
}

async function fetchCollectionPaperCount(collectionId) {
  try {
    const response = await window.LitLab.apiFetch(`/collections/${collectionId}/papers`);
    return (response.papers || []).length;
  } catch (_error) {
    return null;
  }
}

async function fetchProjectPaperCount(projectId) {
  try {
    const response = await window.LitLab.apiFetch(`/projects/${projectId}/papers`);
    return (response.papers || []).length;
  } catch (_error) {
    return null;
  }
}

async function fetchPrimaryCollectionIdsByProject() {
  // Returns a Set of collection IDs that serve as some project's primary list.
  try {
    const projectsResponse = await window.LitLab.apiFetch("/projects");
    const projects = projectsResponse.projects || [];
    const primaryLookups = await Promise.all(
      projects.map(async (project) => {
        try {
          const linkResponse = await window.LitLab.apiFetch(
            `/projects/${project.id}/primary-collection`
          );
          return linkResponse.collection?.id || null;
        } catch (_error) {
          return null;
        }
      })
    );
    return new Set(primaryLookups.filter(Boolean));
  } catch (_error) {
    return new Set();
  }
}

async function loadProjects() {
  setMessage("");
  try {
    const response = await window.LitLab.apiFetch("/projects");
    const projects = response.projects || [];
    if (!projects.length) {
      projectsGridEl.innerHTML = "";
      emptyStateEl.hidden = false;
      return;
    }
    emptyStateEl.hidden = true;
    projectsGridEl.innerHTML = projects
      .map((project) => projectCardTemplate(project, undefined))
      .join("");

    const counts = await Promise.all(projects.map((project) => fetchProjectPaperCount(project.id)));
    projectsGridEl.innerHTML = projects
      .map((project, index) => projectCardTemplate(project, counts[index]))
      .join("");
  } catch (error) {
    setMessage(error.message || "Could not load projects.", "error");
  }
}

async function loadLibraryOverview() {
  setLibrarySummary("Loading library overview...");
  try {
    const [papersResponse, collectionsResponse] = await Promise.all([
      window.LitLab.apiFetch("/papers?limit=5&offset=0"),
      window.LitLab.apiFetch("/collections"),
    ]);
    const papers = papersResponse.papers || [];
    const collections = collectionsResponse.collections || [];

    if (!papers.length) {
      libraryPreviewEl.innerHTML = "<p class='muted'>No papers yet. Add one from Read Papers.</p>";
      setLibrarySummary("Your library is empty.", "warning");
      return;
    }

    libraryPreviewEl.innerHTML = papers.slice(0, 3).map(paperPreviewCard).join("");
    const paperLabel = pluralize(papers.length, "recent paper");
    const collectionLabel = pluralize(collections.length, "collection");
    setLibrarySummary(
      `${paperLabel} shown · ${collectionLabel} in your workspace.`,
      "success"
    );
  } catch (error) {
    libraryPreviewEl.innerHTML = "<p class='muted'>Could not load library preview.</p>";
    setLibrarySummary(error.message || "Could not load library overview.", "error");
  }
}

async function loadCollections() {
  try {
    const response = await window.LitLab.apiFetch("/collections");
    const collections = response.collections || [];
    if (!collections.length) {
      collectionsGridEl.innerHTML = "";
      collectionsEmptyEl.hidden = false;
      return;
    }
    collectionsEmptyEl.hidden = true;
    collectionsGridEl.innerHTML = collections
      .map((collection) => collectionCardTemplate(collection, undefined, false))
      .join("");

    const [counts, primarySet] = await Promise.all([
      Promise.all(collections.map((collection) => fetchCollectionPaperCount(collection.id))),
      fetchPrimaryCollectionIdsByProject(),
    ]);
    collectionsGridEl.innerHTML = collections
      .map((collection, index) =>
        collectionCardTemplate(collection, counts[index], primarySet.has(collection.id))
      )
      .join("");
  } catch (error) {
    collectionsGridEl.innerHTML = `<p class='message error'>${escapeHtml(
      error.message || "Could not load collections."
    )}</p>`;
  }
}

projectsGridEl.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  const action = target.dataset.action;
  const projectId = target.dataset.id;
  if (!action || !projectId) return;

  if (action === "open") {
    window.location.href = `project.html?id=${projectId}`;
    return;
  }

  if (action === "delete") {
    const confirmed = window.confirm(
      "Delete this project? Its reading lists stay in Collections, and your Library papers are not removed."
    );
    if (!confirmed) return;
    try {
      await window.LitLab.apiFetch(`/projects/${projectId}`, { method: "DELETE" });
      setMessage("Project deleted.", "success");
      await Promise.all([loadProjects(), loadCollections()]);
    } catch (error) {
      setMessage(error.message || "Could not delete project.", "error");
    }
  }
});

logoutButtonEl.addEventListener("click", async () => {
  try {
    const supabase = window.LitLab.initSupabaseClient();
    await supabase.auth.signOut();
  } catch (_error) {
    // Ignore signout failures and clear local session anyway.
  }
  window.LitLab.signOutLocal();
  window.location.href = "index.html";
});

async function loadWelcomeIdentity() {
  const fallbackEmail = localStorage.getItem("litlab_user_email") || "researcher";
  userEmailEl.textContent = fallbackEmail;

  try {
    const response = await window.LitLab.apiFetch("/account/profile");
    const profile = response.profile || {};
    const nickname = String(profile.nickname || "").trim();
    const email = String(profile.email || fallbackEmail).trim();
    userEmailEl.textContent = nickname || email || "researcher";
  } catch (_error) {
    // Keep fallback value when account profile is unavailable.
  }
}

loadWelcomeIdentity();
loadProjects();
loadCollections();
loadLibraryOverview();
