window.LitLab.requireAuth();

const projectsGridEl = document.getElementById("projects-grid");
const dashboardMessageEl = document.getElementById("dashboard-message");
const createProjectFormEl = document.getElementById("create-project-form");
const logoutButtonEl = document.getElementById("logout-btn");
const emptyStateEl = document.getElementById("empty-state");
const userEmailEl = document.getElementById("user-email");
const librarySummaryEl = document.getElementById("library-summary");
const libraryPreviewEl = document.getElementById("library-preview");

function setMessage(text, tone = "info") {
  dashboardMessageEl.textContent = text;
  dashboardMessageEl.className = `message ${tone}`;
}

function projectCardTemplate(project) {
  const frameworkClass = window.LitLab.getFrameworkBadgeClass(project.framework_type);
  return `
    <article class="card project-card">
      <div class="card-head">
        <h3>${project.title}</h3>
        <span class="${frameworkClass}">${project.framework_type}</span>
      </div>
      <p class="muted">${project.description || "No description yet."}</p>
      <div class="project-actions">
        <button data-action="open" data-id="${project.id}">Manage</button>
        <button data-action="delete" data-id="${project.id}" class="danger">Delete</button>
      </div>
    </article>
  `;
}

function setLibrarySummary(text, tone = "info") {
  librarySummaryEl.textContent = text;
  librarySummaryEl.className = `message ${tone}`;
}

function paperPreviewCard(paper) {
  const authors = (paper.authors || []).join(", ") || "Unknown author";
  return `
    <article class="mini-card">
      <h4>${paper.title || "Untitled paper"}</h4>
      <p class="muted">${authors}${paper.year ? ` · ${paper.year}` : ""}</p>
    </article>
  `;
}

async function loadProjects() {
  setMessage("Loading projects...");
  try {
    const response = await window.LitLab.apiFetch("/projects");
    const projects = response.projects || [];
    projectsGridEl.innerHTML = projects.map(projectCardTemplate).join("");
    emptyStateEl.hidden = projects.length > 0;
    setMessage(projects.length ? "Projects loaded." : "No projects yet. Create your first one.", "success");
  } catch (error) {
    setMessage(error.message || "Could not load projects.", "error");
  }
}

async function loadLibraryOverview() {
  setLibrarySummary("Loading library overview...");
  try {
    const response = await window.LitLab.apiFetch("/papers?limit=5&offset=0");
    const papers = response.papers || [];
    if (!papers.length) {
      libraryPreviewEl.innerHTML = "<p class='muted'>No papers yet. Add one from Read Papers.</p>";
      setLibrarySummary("Your library is empty.", "warning");
      return;
    }

    libraryPreviewEl.innerHTML = papers.slice(0, 3).map(paperPreviewCard).join("");
    setLibrarySummary(`Latest ${Math.min(papers.length, 5)} papers loaded from your library.`, "success");
  } catch (error) {
    libraryPreviewEl.innerHTML = "<p class='muted'>Could not load library preview.</p>";
    setLibrarySummary(error.message || "Could not load library overview.", "error");
  }
}

createProjectFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(createProjectFormEl);
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const frameworkType = String(formData.get("framework_type") || "").trim();
  if (!title || !frameworkType) {
    setMessage("Title and framework are required.", "error");
    return;
  }

  setMessage("Creating project...");
  try {
    await window.LitLab.apiFetch("/projects", {
      method: "POST",
      body: JSON.stringify({
        title,
        description,
        framework_type: frameworkType,
      }),
    });
    createProjectFormEl.reset();
    setMessage("Project created.", "success");
    await loadProjects();
  } catch (error) {
    setMessage(error.message || "Could not create project.", "error");
  }
});

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
    const confirmed = window.confirm("Delete this project and its context?");
    if (!confirmed) return;
    try {
      await window.LitLab.apiFetch(`/projects/${projectId}`, { method: "DELETE" });
      setMessage("Project deleted.", "success");
      await loadProjects();
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
loadLibraryOverview();
