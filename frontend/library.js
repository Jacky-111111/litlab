window.LitLab.requireAuth();

const messageEl = document.getElementById("library-message");
const searchFormEl = document.getElementById("library-search-form");
const papersEl = document.getElementById("library-papers");
const collectionsEl = document.getElementById("collection-checklist");
const batchAddBtn = document.getElementById("batch-add-btn");
const detailEmptyEl = document.getElementById("detail-empty");
const detailEl = document.getElementById("paper-detail");
const detailMetaEl = document.getElementById("paper-detail-meta");
const noteInputEl = document.getElementById("paper-note-input");
const saveNoteBtn = document.getElementById("save-note-btn");
const aiOutputEl = document.getElementById("detail-ai-output");
const summaryBtn = document.getElementById("detail-summary-btn");
const explainBtn = document.getElementById("detail-explain-btn");
const quizBtn = document.getElementById("detail-quiz-btn");
const recommendBtn = document.getElementById("detail-recommend-btn");

let selectedPaper = null;
let latestPapers = [];

function setMessage(text, tone = "info") {
  messageEl.textContent = text;
  messageEl.className = `message ${tone}`;
}

function paperCard(paper) {
  const authors = (paper.authors || []).join(", ") || "Unknown author";
  const abstract = paper.abstract || "No abstract available.";
  const snippet = abstract.length > 260 ? `${abstract.slice(0, 260)}...` : abstract;
  return `
    <article class="card paper-card" data-paper-id="${paper.id}">
      <div class="paper-select-row">
        <label class="checkbox-inline">
          <input type="checkbox" data-role="paper-checkbox" value="${paper.id}" />
          Select
        </label>
      </div>
      <h4>${paper.title || "Untitled paper"}</h4>
      <p class="muted">${authors}${paper.year ? ` · ${paper.year}` : ""} · ${paper.source || "Unknown source"}</p>
      <p>${snippet}</p>
      <div class="paper-actions">
        <button type="button" class="secondary" data-role="open-detail" data-paper-id="${paper.id}">Open Detail</button>
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

function renderPaperDetail(payload) {
  const paper = payload.paper || {};
  selectedPaper = paper;
  detailEmptyEl.hidden = true;
  detailEl.hidden = false;
  const authors = (paper.authors || []).join(", ") || "Unknown author";
  const collections = payload.collection_ids || [];
  detailMetaEl.innerHTML = `
    <strong>${paper.title || "Untitled paper"}</strong>
    <p class="muted">${authors}${paper.year ? ` · ${paper.year}` : ""} · ${paper.source || "Unknown source"}</p>
    <p class="muted">In ${collections.length} collection(s)</p>
    ${paper.url ? `<p><a href="${paper.url}" target="_blank" rel="noopener noreferrer">Original URL</a></p>` : ""}
  `;
  noteInputEl.value = payload.note?.content || "";
  aiOutputEl.textContent = "";
}

async function openPaperDetail(paperId) {
  setMessage("Loading paper detail...");
  try {
    const payload = await window.LitLab.apiFetch(`/papers/${paperId}`);
    renderPaperDetail(payload);
    setMessage("Paper detail loaded.", "success");
  } catch (error) {
    setMessage(error.message || "Could not load paper detail.", "error");
  }
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
  const button = target.closest("button[data-role='open-detail']");
  if (!(button instanceof HTMLButtonElement)) return;
  const paperId = button.dataset.paperId;
  if (!paperId) return;
  await openPaperDetail(paperId);
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

saveNoteBtn.addEventListener("click", async () => {
  if (!selectedPaper?.id) {
    setMessage("Select a paper first.", "warning");
    return;
  }
  try {
    await window.LitLab.apiFetch(`/papers/${selectedPaper.id}/note`, {
      method: "PUT",
      body: JSON.stringify({ content: noteInputEl.value || "" }),
    });
    setMessage("Note saved.", "success");
  } catch (error) {
    setMessage(error.message || "Could not save note.", "error");
  }
});

async function runDetailAi(kind) {
  if (!selectedPaper?.id) {
    setMessage("Select a paper first.", "warning");
    return;
  }
  aiOutputEl.textContent = "Generating...";
  try {
    const payload = await window.LitLab.apiFetch(`/ai/papers/${selectedPaper.id}/${kind}`, {
      method: "POST",
    });
    if (kind === "recommend") {
      const papers = payload.papers || [];
      aiOutputEl.textContent = papers.length
        ? `Query: ${payload.query || ""}\n\n${papers.map((paper) => `- ${paper.title}`).join("\n")}`
        : "No related papers found.";
    } else {
      aiOutputEl.textContent = payload.output || "No output returned.";
    }
    setMessage(payload.cached ? "Loaded from cache." : "AI result generated.", "success");
  } catch (error) {
    aiOutputEl.textContent = "";
    setMessage(error.message || "AI action failed.", "error");
  }
}

summaryBtn.addEventListener("click", () => runDetailAi("summary"));
explainBtn.addEventListener("click", () => runDetailAi("explain"));
quizBtn.addEventListener("click", () => runDetailAi("quiz"));
recommendBtn.addEventListener("click", () => runDetailAi("recommend"));

loadCollections();
loadPapers();
