window.LitLab.requireAuth();

const messageEl = document.getElementById("library-message");
const searchFormEl = document.getElementById("library-search-form");
const papersEl = document.getElementById("library-papers");
const collectionsEl = document.getElementById("collection-checklist");
const batchAddBtn = document.getElementById("batch-add-btn");

let latestPapers = [];

function setMessage(text, tone = "info") {
  messageEl.textContent = text;
  messageEl.className = `message ${tone}`;
}

function paperCard(paper) {
  const nickname = (paper.nickname || paper.title || "Untitled").trim();
  const title = (paper.title || "Untitled paper").trim();
  const authors = (paper.authors || []).join(", ") || "Unknown author";
  const abstract = paper.abstract || "No abstract available.";
  const snippet = abstract.length > 260 ? `${abstract.slice(0, 260)}...` : abstract;
  const urlText = paper.url ? paper.url.replace(/^https?:\/\//, "") : "";
  return `
    <article class="card paper-card" data-paper-id="${paper.id}">
      <div class="paper-select-row">
        <label class="checkbox-inline">
          <input type="checkbox" data-role="paper-checkbox" value="${paper.id}" />
          Select
        </label>
      </div>
      <h4>${nickname}</h4>
      <p class="muted">Title: ${title}</p>
      <p class="muted">${authors}${paper.year ? ` · ${paper.year}` : ""} · ${paper.source || "Unknown source"}</p>
      <p class="muted">${urlText || "No source URL saved"}</p>
      <p>${snippet}</p>
      <div class="paper-actions">
        <button type="button" class="secondary" data-role="rename-paper" data-paper-id="${paper.id}">Rename</button>
        <button type="button" class="secondary" data-role="open-detail" data-paper-id="${paper.id}">Read Paper</button>
        ${paper.url ? `<a class="secondary" href="${paper.url}" target="_blank" rel="noopener noreferrer">Open Source</a>` : ""}
      </div>
    </article>
  `;
}

function getSelectedPaperIds() {
  const nodes = papersEl.querySelectorAll('input[data-role="paper-checkbox"]:checked');
  return Array.from(nodes)
    .map((node) => node.value)
    .filter(Boolean);
}

function getSelectedCollectionIds() {
  const nodes = collectionsEl.querySelectorAll('input[data-role="collection-checkbox"]:checked');
  return Array.from(nodes)
    .map((node) => node.value)
    .filter(Boolean);
}

async function loadCollections() {
  try {
    const response = await window.LitLab.apiFetch("/projects");
    const projects = response.projects || [];
    if (!projects.length) {
      collectionsEl.innerHTML = "<p class='muted'>No collections yet. Create a project first.</p>";
      return;
    }
    collectionsEl.innerHTML = projects
      .map(
        (project) => `
          <label class="checkbox-inline mini-card">
            <input type="checkbox" data-role="collection-checkbox" value="${project.id}" />
            <span>${project.title}</span>
          </label>
        `
      )
      .join("");
  } catch (error) {
    collectionsEl.innerHTML = `<p class="message error">${error.message || "Could not load collections."}</p>`;
  }
}

async function loadPapers(query = "") {
  setMessage("Loading paper library...");
  papersEl.innerHTML = "<p class='muted'>Loading papers...</p>";
  const path = query ? `/papers?q=${encodeURIComponent(query)}` : "/papers";
  try {
    const response = await window.LitLab.apiFetch(path);
    latestPapers = response.papers || [];
    if (!latestPapers.length) {
      papersEl.innerHTML = "<p class='muted'>No papers found.</p>";
      setMessage("No papers yet. Analyze a URL or PDF in Read Papers.", "warning");
      return;
    }
    papersEl.innerHTML = latestPapers.map(paperCard).join("");
    setMessage(`Loaded ${latestPapers.length} papers.`, "success");
  } catch (error) {
    papersEl.innerHTML = "<p class='muted'>Could not load papers.</p>";
    setMessage(error.message || "Failed to load paper library.", "error");
  }
}

async function openPaperDetail(paperId) {
  window.location.href = `read-papers.html?paper_id=${encodeURIComponent(paperId)}`;
}

searchFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(searchFormEl);
  const query = String(formData.get("query") || "").trim();
  await loadPapers(query);
});

papersEl.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const renameButton = target.closest("button[data-role='rename-paper']");
  if (renameButton instanceof HTMLButtonElement) {
    const paperId = renameButton.dataset.paperId;
    if (!paperId) return;
    const paper = latestPapers.find((item) => item.id === paperId);
    const currentName = paper?.nickname || paper?.title || "Untitled";
    const nextName = window.prompt("Set a nickname for this paper:", currentName);
    if (nextName === null) return;
    try {
      await window.LitLab.apiFetch(`/papers/${paperId}/nickname`, {
        method: "PUT",
        body: JSON.stringify({ nickname: nextName }),
      });
      setMessage("Paper nickname updated.", "success");
      await loadPapers(String(new FormData(searchFormEl).get("query") || "").trim());
    } catch (error) {
      setMessage(error.message || "Could not update paper nickname.", "error");
    }
    return;
  }

  const button = target.closest("button[data-role='open-detail']");
  if (!(button instanceof HTMLButtonElement)) return;
  const paperId = button.dataset.paperId;
  if (!paperId) return;
  openPaperDetail(paperId);
});

batchAddBtn.addEventListener("click", async () => {
  const paperIds = getSelectedPaperIds();
  const collectionIds = getSelectedCollectionIds();
  if (!paperIds.length) {
    setMessage("Choose at least one paper.", "warning");
    return;
  }
  if (!collectionIds.length) {
    setMessage("Choose at least one collection.", "warning");
    return;
  }

  setMessage("Adding papers to collections...");
  try {
    await Promise.all(
      collectionIds.map((collectionId) =>
        window.LitLab.apiFetch(`/collections/${collectionId}/papers:batchAdd`, {
          method: "POST",
          body: JSON.stringify({ paper_ids: paperIds }),
        })
      )
    );
    setMessage(`Added ${paperIds.length} paper(s) to ${collectionIds.length} collection(s).`, "success");
  } catch (error) {
    setMessage(error.message || "Could not batch add papers.", "error");
  }
});

loadCollections();
loadPapers();
