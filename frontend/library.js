window.LitLab.requireAuth();

const messageEl = document.getElementById("library-message");
const searchFormEl = document.getElementById("library-search-form");
const searchInputEl = document.getElementById("library-search-input");
const clearSearchBtn = document.getElementById("clear-search-btn");
const papersEl = document.getElementById("library-papers");
const filterMenuEl = document.getElementById("library-filter-menu");
const resultsTitleEl = document.getElementById("library-results-title");
const resultsMetaEl = document.getElementById("library-results-meta");

let visiblePapers = [];
let collections = [];
let activeCollectionId = "all";
const paperCollectionIdsCache = new Map();

function setMessage(text, tone = "info") {
  messageEl.textContent = text;
  messageEl.className = `message ${tone}`;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function paperCard(paper) {
  const nickname = escapeHtml((paper.nickname || paper.title || "Untitled").trim());
  const title = escapeHtml((paper.title || "Untitled paper").trim());
  const authors = (paper.authors || []).join(", ") || "Unknown author";
  const abstract = paper.abstract || "No abstract available.";
  const snippet = abstract.length > 260 ? `${abstract.slice(0, 260)}...` : abstract;
  const urlText = paper.url ? paper.url.replace(/^https?:\/\//, "") : "";
  return `
    <article class="card paper-card" data-paper-id="${paper.id}">
      <h4>${nickname}</h4>
      <p class="muted">Title: ${title}</p>
      <p class="muted">${escapeHtml(authors)}${paper.year ? ` · ${paper.year}` : ""} · ${escapeHtml(
    paper.source || "Unknown source"
  )}</p>
      <p class="muted">${escapeHtml(urlText || "No source URL saved")}</p>
      <p>${escapeHtml(snippet)}</p>
      <div class="paper-actions">
        <button type="button" data-role="open-detail" data-paper-id="${paper.id}">Read Paper</button>
        <button type="button" class="secondary" data-role="rename-paper" data-paper-id="${paper.id}">Rename</button>
        <button type="button" class="secondary" data-role="toggle-collections" data-paper-id="${paper.id}">
          Set Collections
        </button>
        <button type="button" class="danger library-delete-btn" data-role="delete-paper" data-paper-id="${paper.id}">
          Delete
        </button>
        ${paper.url ? `<a class="secondary" href="${paper.url}" target="_blank" rel="noopener noreferrer">Open Source</a>` : ""}
      </div>
      <section class="paper-collection-editor" data-role="collection-editor" hidden>
        <h5>Collection Settings</h5>
        <p class="muted">Choose which collections should include this paper.</p>
        <div class="stack" data-role="collection-options"></div>
        <div class="inline-actions">
          <button type="button" data-role="save-collections" data-paper-id="${paper.id}">Save Collections</button>
          <button type="button" class="secondary" data-role="cancel-collections">Cancel</button>
        </div>
      </section>
    </article>
  `;
}

function getActiveCollectionTitle() {
  if (activeCollectionId === "all") return "All Papers";
  const collection = collections.find((item) => item.id === activeCollectionId);
  return collection?.title || "Collection";
}

function renderFilterMenu() {
  const menuItems = [
    `<button type="button" class="library-filter-item ${activeCollectionId === "all" ? "active" : ""}" data-role="filter-item" data-collection-id="all">All Papers</button>`,
    ...collections.map(
      (collection) => `
        <button
          type="button"
          class="library-filter-item ${activeCollectionId === collection.id ? "active" : ""}"
          data-role="filter-item"
          data-collection-id="${collection.id}"
        >
          ${escapeHtml(collection.title)}
        </button>
      `
    ),
  ];
  filterMenuEl.innerHTML = menuItems.join("");
}

function renderResultsHeader() {
  const query = String(searchInputEl.value || "").trim();
  const suffix = query ? ` for "${query}"` : "";
  resultsTitleEl.textContent = getActiveCollectionTitle();
  resultsMetaEl.textContent = `${visiblePapers.length} paper(s) shown${suffix}.`;
}

function renderPapers() {
  if (!visiblePapers.length) {
    papersEl.innerHTML = "<p class='muted'>No papers found for this view.</p>";
    return;
  }
  papersEl.innerHTML = visiblePapers.map(paperCard).join("");
}

async function loadCollectionsAndMenu() {
  try {
    const response = await window.LitLab.apiFetch("/projects");
    collections = response.projects || [];
    if (!collections.find((item) => item.id === activeCollectionId)) {
      activeCollectionId = "all";
    }
    renderFilterMenu();
  } catch (error) {
    collections = [];
    activeCollectionId = "all";
    renderFilterMenu();
    setMessage(error.message || "Could not load collections.", "error");
  }
}

async function loadPapers() {
  const query = String(searchInputEl.value || "").trim();
  setMessage("Loading paper library...");
  papersEl.innerHTML = "<p class='muted'>Loading papers...</p>";
  try {
    if (activeCollectionId === "all") {
      const path = query ? `/papers?q=${encodeURIComponent(query)}` : "/papers";
      const response = await window.LitLab.apiFetch(path);
      visiblePapers = response.papers || [];
    } else {
      const response = await window.LitLab.apiFetch(`/collections/${activeCollectionId}/papers`);
      const papers = response.papers || [];
      visiblePapers = query
        ? papers.filter((paper) => {
            const title = String(paper.title || "").toLowerCase();
            const nickname = String(paper.nickname || "").toLowerCase();
            const normalizedQuery = query.toLowerCase();
            return title.includes(normalizedQuery) || nickname.includes(normalizedQuery);
          })
        : papers;
    }

    if (!visiblePapers.length) {
      renderResultsHeader();
      renderPapers();
      setMessage("No papers yet. Analyze a URL or PDF in Read Papers.", "warning");
      return;
    }
    renderResultsHeader();
    renderPapers();
    setMessage(`Loaded ${visiblePapers.length} papers.`, "success");
  } catch (error) {
    papersEl.innerHTML = "<p class='muted'>Could not load papers.</p>";
    renderResultsHeader();
    setMessage(error.message || "Failed to load paper library.", "error");
  }
}

async function openPaperDetail(paperId) {
  window.location.href = `read-papers.html?paper_id=${encodeURIComponent(paperId)}`;
}

function getCollectionEditorEl(paperCardEl) {
  return paperCardEl?.querySelector('[data-role="collection-editor"]') || null;
}

function getCollectionOptionsEl(paperCardEl) {
  return paperCardEl?.querySelector('[data-role="collection-options"]') || null;
}

async function openCollectionEditor(paperCardEl, paperId) {
  const editorEl = getCollectionEditorEl(paperCardEl);
  const optionsEl = getCollectionOptionsEl(paperCardEl);
  if (!editorEl || !optionsEl) return;

  optionsEl.innerHTML = "<p class='muted'>Loading collections...</p>";
  editorEl.hidden = false;
  try {
    const response = await window.LitLab.apiFetch(`/papers/${paperId}`);
    const selectedIds = new Set(response.collection_ids || []);
    paperCollectionIdsCache.set(paperId, selectedIds);
    if (!collections.length) {
      optionsEl.innerHTML = "<p class='muted'>No collections yet. Create a project first.</p>";
      return;
    }
    optionsEl.innerHTML = collections
      .map(
        (collection) => `
          <label class="checkbox-inline mini-card">
            <input
              type="checkbox"
              data-role="editor-collection-checkbox"
              value="${collection.id}"
              ${selectedIds.has(collection.id) ? "checked" : ""}
            />
            <span>${escapeHtml(collection.title)}</span>
          </label>
        `
      )
      .join("");
  } catch (error) {
    optionsEl.innerHTML = `<p class='message error'>${escapeHtml(error.message || "Could not load paper collections.")}</p>`;
  }
}

async function savePaperCollections(paperCardEl, paperId) {
  const editorEl = getCollectionEditorEl(paperCardEl);
  if (!editorEl) return;
  const selectedNodes = editorEl.querySelectorAll('input[data-role="editor-collection-checkbox"]:checked');
  const nextSelectedIds = new Set(
    Array.from(selectedNodes)
      .map((node) => node.value)
      .filter(Boolean)
  );
  const currentSelectedIds = paperCollectionIdsCache.get(paperId) || new Set();
  const addIds = collections.filter((collection) => nextSelectedIds.has(collection.id) && !currentSelectedIds.has(collection.id));
  const removeIds = collections.filter((collection) => !nextSelectedIds.has(collection.id) && currentSelectedIds.has(collection.id));

  if (!addIds.length && !removeIds.length) {
    setMessage("No collection changes to save.", "info");
    editorEl.hidden = true;
    return;
  }

  setMessage("Saving collection settings...");
  try {
    await Promise.all([
      ...addIds.map((collection) =>
        window.LitLab.apiFetch(`/collections/${collection.id}/papers:batchAdd`, {
          method: "POST",
          body: JSON.stringify({ paper_ids: [paperId] }),
        })
      ),
      ...removeIds.map((collection) =>
        window.LitLab.apiFetch(`/collections/${collection.id}/papers:batchRemove`, {
          method: "POST",
          body: JSON.stringify({ paper_ids: [paperId] }),
        })
      ),
    ]);
    paperCollectionIdsCache.set(paperId, nextSelectedIds);
    editorEl.hidden = true;
    setMessage("Collection settings updated.", "success");
    await loadPapers();
  } catch (error) {
    setMessage(error.message || "Could not save collection settings.", "error");
  }
}

searchFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadPapers();
});

clearSearchBtn.addEventListener("click", async () => {
  searchInputEl.value = "";
  await loadPapers();
});

filterMenuEl.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest("button[data-role='filter-item']");
  if (!(button instanceof HTMLButtonElement)) return;
  const collectionId = button.dataset.collectionId || "all";
  if (collectionId === activeCollectionId) return;
  activeCollectionId = collectionId;
  renderFilterMenu();
  await loadPapers();
});

papersEl.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const renameButton = target.closest("button[data-role='rename-paper']");
  if (renameButton instanceof HTMLButtonElement) {
    const paperId = renameButton.dataset.paperId;
    if (!paperId) return;
    const paper = visiblePapers.find((item) => item.id === paperId);
    const currentName = paper?.nickname || paper?.title || "Untitled";
    const nextName = window.prompt("Set a nickname for this paper:", currentName);
    if (nextName === null) return;
    try {
      await window.LitLab.apiFetch(`/papers/${paperId}/nickname`, {
        method: "PUT",
        body: JSON.stringify({ nickname: nextName }),
      });
      setMessage("Paper nickname updated.", "success");
      await loadPapers();
    } catch (error) {
      setMessage(error.message || "Could not update paper nickname.", "error");
    }
    return;
  }

  const openDetailButton = target.closest("button[data-role='open-detail']");
  if (openDetailButton instanceof HTMLButtonElement) {
    const paperId = openDetailButton.dataset.paperId;
    if (!paperId) return;
    openPaperDetail(paperId);
    return;
  }

  const deletePaperButton = target.closest("button[data-role='delete-paper']");
  if (deletePaperButton instanceof HTMLButtonElement) {
    const paperId = deletePaperButton.dataset.paperId;
    if (!paperId) return;
    const confirmed = window.confirm(
      "Delete this paper from your library? This will remove it from all collections."
    );
    if (!confirmed) return;
    setMessage("Deleting paper...");
    try {
      await window.LitLab.apiFetch(`/papers/${paperId}`, { method: "DELETE" });
      setMessage("Paper deleted from library.", "success");
      await loadPapers();
    } catch (error) {
      setMessage(error.message || "Could not delete paper.", "error");
    }
    return;
  }

  const toggleCollectionsButton = target.closest("button[data-role='toggle-collections']");
  if (toggleCollectionsButton instanceof HTMLButtonElement) {
    const paperId = toggleCollectionsButton.dataset.paperId;
    if (!paperId) return;
    const paperCardEl = toggleCollectionsButton.closest(".paper-card");
    const editorEl = getCollectionEditorEl(paperCardEl);
    if (!editorEl) return;
    if (!editorEl.hidden) {
      editorEl.hidden = true;
      return;
    }
    await openCollectionEditor(paperCardEl, paperId);
    return;
  }

  const saveCollectionsButton = target.closest("button[data-role='save-collections']");
  if (saveCollectionsButton instanceof HTMLButtonElement) {
    const paperId = saveCollectionsButton.dataset.paperId;
    if (!paperId) return;
    const paperCardEl = saveCollectionsButton.closest(".paper-card");
    await savePaperCollections(paperCardEl, paperId);
    return;
  }

  const cancelCollectionsButton = target.closest("button[data-role='cancel-collections']");
  if (cancelCollectionsButton instanceof HTMLButtonElement) {
    const paperCardEl = cancelCollectionsButton.closest(".paper-card");
    const editorEl = getCollectionEditorEl(paperCardEl);
    if (editorEl) editorEl.hidden = true;
  }
});

async function initLibraryPage() {
  await loadCollectionsAndMenu();
  await loadPapers();
}

initLibraryPage();
