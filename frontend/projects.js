window.LitLab.requireAuth();

const createFormEl = document.getElementById("create-project-form");
const createMessageEl = document.getElementById("create-message");
const listMessageEl = document.getElementById("list-message");
const projectsGridEl = document.getElementById("projects-grid");
const projectsCountEl = document.getElementById("projects-count");
const emptyStateEl = document.getElementById("projects-empty-state");

const FRAMEWORK_OPTIONS = ["IMRAD", "Review / Survey", "Theoretical Paper", "Case Study"];
const STATUS_OPTIONS = ["active", "paused", "completed", "archived"];

let projectsCache = [];
const paperCountsCache = new Map();

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function setMessage(el, text, tone = "info") {
  if (!el) return;
  if (!text) {
    el.textContent = "";
    el.hidden = true;
    return;
  }
  el.textContent = text;
  el.className = `message ${tone}`;
  el.hidden = false;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function projectCardTemplate(project) {
  const description = project.description || "";
  const goal = project.goal || "";
  const status = project.status || "active";
  const paperCount = paperCountsCache.get(project.id);
  const paperLabel =
    typeof paperCount === "number" ? pluralize(paperCount, "paper") : "… papers";

  const frameworkSelect = FRAMEWORK_OPTIONS.map(
    (option) => `<option value="${escapeHtml(option)}" ${project.framework_type === option ? "selected" : ""}>${escapeHtml(option)}</option>`
  ).join("");
  const statusSelect = STATUS_OPTIONS.map(
    (option) => `<option value="${option}" ${status === option ? "selected" : ""}>${option}</option>`
  ).join("");

  return `
    <article class="card project-card" data-project-id="${project.id}">
      <div class="card-head">
        <div class="project-row-main">
          <input
            type="text"
            class="project-row-title-inline"
            data-role="title-input"
            value="${escapeHtml(project.title)}"
            aria-label="Project title"
          />
        </div>
        <span class="muted project-row-paper-count">${paperLabel}</span>
      </div>

      <div class="project-edit-panel">
        <div class="grid grid-2">
          <label>
            Framework
            <select data-role="framework-input">${frameworkSelect}</select>
          </label>
          <label>
            Status
            <select data-role="status-input">${statusSelect}</select>
          </label>
        </div>
        <label>
          Description
          <textarea data-role="description-input" rows="2">${escapeHtml(description)}</textarea>
        </label>
        <label>
          Research goal
          <textarea data-role="goal-input" rows="2">${escapeHtml(goal)}</textarea>
        </label>
      </div>

      <div class="project-card-actions project-actions">
        <a class="button" href="project.html?id=${project.id}">Open Workspace</a>
        <button type="button" data-action="save">Save changes</button>
        <button type="button" class="danger" data-action="delete">Delete</button>
      </div>
    </article>
  `;
}

function renderProjects() {
  if (!projectsCache.length) {
    projectsGridEl.innerHTML = "";
    emptyStateEl.hidden = false;
    projectsCountEl.textContent = "";
    return;
  }
  emptyStateEl.hidden = true;
  projectsCountEl.textContent = pluralize(projectsCache.length, "project");
  projectsGridEl.innerHTML = projectsCache.map(projectCardTemplate).join("");
}

async function fetchPaperCount(projectId) {
  try {
    const response = await window.LitLab.apiFetch(`/projects/${projectId}/papers`);
    return (response.papers || []).length;
  } catch (_error) {
    return null;
  }
}

async function refreshPaperCounts() {
  const results = await Promise.all(
    projectsCache.map(async (project) => [project.id, await fetchPaperCount(project.id)])
  );
  for (const [id, count] of results) {
    if (typeof count === "number") {
      paperCountsCache.set(id, count);
    }
  }
  renderProjects();
}

async function loadProjects() {
  setMessage(listMessageEl, "Loading projects...");
  try {
    const response = await window.LitLab.apiFetch("/projects");
    projectsCache = response.projects || [];
    setMessage(listMessageEl, "");
    renderProjects();
    refreshPaperCounts();
  } catch (error) {
    setMessage(listMessageEl, error.message || "Could not load projects.", "error");
  }
}

async function saveProject(cardEl) {
  const projectId = cardEl.dataset.projectId;
  const title = cardEl.querySelector('[data-role="title-input"]').value.trim();
  const description = cardEl.querySelector('[data-role="description-input"]').value.trim();
  const goal = cardEl.querySelector('[data-role="goal-input"]').value.trim();
  const frameworkType = cardEl.querySelector('[data-role="framework-input"]').value;
  const status = cardEl.querySelector('[data-role="status-input"]').value;

  if (!title) {
    setMessage(listMessageEl, "Title cannot be empty.", "error");
    return;
  }

  setMessage(listMessageEl, "Saving project...");
  try {
    const response = await window.LitLab.apiFetch(`/projects/${projectId}`, {
      method: "PUT",
      body: JSON.stringify({
        title,
        description,
        goal,
        framework_type: frameworkType,
        status,
      }),
    });
    const updated = response.project;
    projectsCache = projectsCache.map((p) => (p.id === projectId ? { ...p, ...updated } : p));
    setMessage(listMessageEl, "Project updated.", "success");
    renderProjects();
  } catch (error) {
    setMessage(listMessageEl, error.message || "Could not update project.", "error");
  }
}

async function deleteProject(cardEl) {
  const projectId = cardEl.dataset.projectId;
  const confirmed = window.confirm(
    "Delete this project? Its reading lists stay in Collections, and your Library papers are not removed."
  );
  if (!confirmed) return;
  setMessage(listMessageEl, "Deleting project...");
  try {
    await window.LitLab.apiFetch(`/projects/${projectId}`, { method: "DELETE" });
    projectsCache = projectsCache.filter((p) => p.id !== projectId);
    paperCountsCache.delete(projectId);
    setMessage(listMessageEl, "Project deleted.", "success");
    renderProjects();
  } catch (error) {
    setMessage(listMessageEl, error.message || "Could not delete project.", "error");
  }
}

projectsGridEl.addEventListener("click", (event) => {
  const target = event.target;
  const button = target.closest("button");
  if (!button) return;
  const cardEl = button.closest("[data-project-id]");
  if (!cardEl) return;

  const action = button.dataset.action;
  if (action === "save") {
    saveProject(cardEl);
  } else if (action === "delete") {
    deleteProject(cardEl);
  }
});

createFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(createFormEl);
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const goal = String(formData.get("goal") || "").trim();
  const frameworkType = String(formData.get("framework_type") || "").trim();

  if (!title || !frameworkType) {
    setMessage(createMessageEl, "Title and framework are required.", "error");
    return;
  }

  setMessage(createMessageEl, "Creating project...");
  try {
    await window.LitLab.apiFetch("/projects", {
      method: "POST",
      body: JSON.stringify({ title, description, goal, framework_type: frameworkType }),
    });
    createFormEl.reset();
    setMessage(createMessageEl, "Project created.", "success");
    await loadProjects();
  } catch (error) {
    setMessage(createMessageEl, error.message || "Could not create project.", "error");
  }
});

function prefillFrameworkFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const requested = (params.get("framework") || "").trim();
  if (!requested) return;

  const frameworkSelect = createFormEl.querySelector('select[name="framework_type"]');
  if (!(frameworkSelect instanceof HTMLSelectElement)) return;

  const match = FRAMEWORK_OPTIONS.find(
    (option) => option.toLowerCase() === requested.toLowerCase()
  );
  if (match) {
    frameworkSelect.value = match;
  }
}

prefillFrameworkFromUrl();

if (window.location.hash === "#create") {
  const createPanel = document.getElementById("create-project-panel");
  if (createPanel) {
    setTimeout(() => createPanel.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }
  const titleInput = createFormEl.querySelector('input[name="title"]');
  if (titleInput instanceof HTMLInputElement) {
    setTimeout(() => titleInput.focus(), 0);
  }
}

loadProjects();
