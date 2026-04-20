window.LitLab.requireAuth();

const projectsGridEl = document.getElementById("projects-grid");
const dashboardMessageEl = document.getElementById("dashboard-message");
const createProjectFormEl = document.getElementById("create-project-form");
const logoutButtonEl = document.getElementById("logout-btn");
const emptyStateEl = document.getElementById("empty-state");
const userEmailEl = document.getElementById("user-email");

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
        <button data-action="open" data-id="${project.id}">Open</button>
        <button data-action="edit" data-id="${project.id}" class="secondary">Edit</button>
        <button data-action="delete" data-id="${project.id}" class="danger">Delete</button>
      </div>
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

  if (action === "edit") {
    const nextTitle = window.prompt("New project title:");
    if (!nextTitle) return;
    const nextDescription = window.prompt("New project description (optional):") || "";
    try {
      await window.LitLab.apiFetch(`/projects/${projectId}`, {
        method: "PUT",
        body: JSON.stringify({ title: nextTitle, description: nextDescription }),
      });
      setMessage("Project updated.", "success");
      await loadProjects();
    } catch (error) {
      setMessage(error.message || "Could not update project.", "error");
    }
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

userEmailEl.textContent = localStorage.getItem("litlab_user_email") || "researcher";
loadProjects();
