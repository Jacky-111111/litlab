window.LitLab.requireAuth();

const params = new URLSearchParams(window.location.search);
const projectId = params.get("id");

const projectMessageEl = document.getElementById("project-message");
const projectTitleEl = document.getElementById("project-title");
const projectDescriptionEl = document.getElementById("project-description");
const frameworkGuideEl = document.getElementById("framework-guide");
const notesFormEl = document.getElementById("framework-notes-form");
const savedPapersEl = document.getElementById("saved-papers");
const readingListsEl = document.getElementById("project-reading-lists");
const searchFormEl = document.getElementById("search-form");
const searchResultsEl = document.getElementById("search-results");
const batchSaveSearchBtn = document.getElementById("batch-save-search-btn");
const aiOutputEl = document.getElementById("ai-output");
const summarizeBtn = document.getElementById("btn-summarize");
const explainBtn = document.getElementById("btn-explain");
const quizBtn = document.getElementById("btn-quiz");
const recommendBtn = document.getElementById("btn-recommend");
const relatedPapersEl = document.getElementById("related-papers");
const paperNoteInputEl = document.getElementById("selected-paper-note");
const savePaperNoteBtn = document.getElementById("save-selected-paper-note");
const libraryPickerToggleBtn = document.getElementById("library-picker-toggle");
const libraryPickerBodyEl = document.getElementById("library-picker-body");
const libraryPickerSourceEl = document.getElementById("library-picker-source");
const libraryPickerFilterEl = document.getElementById("library-picker-filter");
const libraryPickerResultsEl = document.getElementById("library-picker-results");
const libraryPickerMessageEl = document.getElementById("library-picker-message");
const libraryPickerSelectAllBtn = document.getElementById("library-picker-select-all");
const libraryPickerClearBtn = document.getElementById("library-picker-clear");
const libraryPickerAddBtn = document.getElementById("library-picker-add");

let selectedPaper = null;
let attachedCollections = [];
let primaryCollectionId = null;
const searchPaperMap = new Map();

let libraryPickerSource = "library";
let libraryPickerPapers = [];
const libraryPickerSelection = new Set();
const projectPaperIdSet = new Set();
let allCollectionsCache = [];

function setMessage(text, tone = "info") {
  projectMessageEl.textContent = text;
  projectMessageEl.className = `message ${tone}`;
}

function notesStorageKey(sectionTitle) {
  return `litlab_notes_${projectId}_${sectionTitle}`;
}

function renderGuidance(guidance) {
  const sections = guidance?.sections || [];
  if (!sections.length) {
    frameworkGuideEl.innerHTML = "<p class='muted'>No framework guidance available.</p>";
    notesFormEl.innerHTML = "";
    return;
  }

  frameworkGuideEl.innerHTML = sections
    .map(
      (section) => `
      <article class="mini-card">
        <h4>${section.title}</h4>
        <p>${section.explanation}</p>
        <p class="prompt"><strong>Prompt:</strong> ${section.prompt}</p>
      </article>
    `
    )
    .join("");

  notesFormEl.innerHTML = sections
    .map(
      (section) => `
      <label class="note-block">
        <span>${section.title} note/checklist</span>
        <textarea data-section="${section.title}" rows="3" placeholder="Write checklist items or notes...">${localStorage.getItem(
          notesStorageKey(section.title)
        ) || ""}</textarea>
      </label>
    `
    )
    .join("");
}

function paperCard(paper, includeSave = false) {
  const paperKey = includeSave
    ? [paper.external_paper_id || "", paper.title || "", paper.source || ""].join("::")
    : paper.id || paper.external_paper_id || "";
  const authors = (paper.authors || []).join(", ") || "Unknown author";
  const abstract = paper.abstract || "No abstract available for this paper.";
  const abstractSnippet = abstract.length > 280 ? `${abstract.slice(0, 280)}...` : abstract;
  return `
    <article class="card paper-card" data-paper-id="${paper.id || paper.external_paper_id || ""}" data-paper-key="${paperKey}">
      <h4>${paper.title}</h4>
      <p class="muted">${authors} ${paper.year ? `· ${paper.year}` : ""} · ${paper.source || "Unknown source"}</p>
      <p>${abstractSnippet}</p>
      <div class="paper-actions">
        ${
          includeSave
            ? `<label class="checkbox-inline"><input type="checkbox" data-action="batch-save-paper" value="${paperKey}" /> Select</label>`
            : ""
        }
        ${paper.url ? `<a class="secondary" href="${paper.url}" target="_blank" rel="noopener noreferrer">Open Source</a>` : ""}
        ${
          includeSave
            ? `<button data-action="save-paper" data-paper='${JSON.stringify(paper)
                .replace(/'/g, "&apos;")}'>Save to Primary List</button>`
            : `<button data-action="select-paper" data-paper='${JSON.stringify(paper)
                .replace(/'/g, "&apos;")}'>Analyze</button>`
        }
      </div>
    </article>
  `;
}

async function loadSelectedPaperNote() {
  if (!selectedPaper?.id) {
    paperNoteInputEl.value = "";
    return;
  }
  try {
    const response = await window.LitLab.apiFetch(`/papers/${selectedPaper.id}`);
    paperNoteInputEl.value = response.note?.content || "";
  } catch (_error) {
    paperNoteInputEl.value = "";
  }
}

async function loadProjectDetail() {
  if (!projectId) {
    setMessage("Missing project id in URL.", "error");
    return;
  }

  setMessage("Loading project...");
  try {
    const response = await window.LitLab.apiFetch(`/projects/${projectId}`);
    const project = response.project;
    projectTitleEl.textContent = project.title;
    projectDescriptionEl.textContent = project.description || "No description provided.";
    renderGuidance(response.framework_guidance);
    setMessage("Project loaded.", "success");
  } catch (error) {
    setMessage(error.message || "Could not load project.", "error");
  }
}

async function loadSavedPapers() {
  try {
    const response = await window.LitLab.apiFetch(`/projects/${projectId}/papers`);
    const papers = response.papers || [];
    projectPaperIdSet.clear();
    papers.forEach((paper) => {
      if (paper.id) projectPaperIdSet.add(paper.id);
    });
    if (!papers.length) {
      savedPapersEl.innerHTML = "<p class='muted'>No saved papers yet.</p>";
      selectedPaper = null;
      renderLibraryPickerResults();
      return;
    }
    savedPapersEl.innerHTML = papers.map((paper) => paperCard(paper, false)).join("");
    if (!selectedPaper) {
      selectedPaper = papers[0];
      aiOutputEl.textContent = `Selected paper: ${selectedPaper.title}`;
      loadSelectedPaperNote();
    }
    renderLibraryPickerResults();
  } catch (error) {
    savedPapersEl.innerHTML = `<p class='message error'>${error.message || "Could not load saved papers."}</p>`;
  }
}

function renderReadingLists() {
  if (!readingListsEl) return;
  if (!attachedCollections.length) {
    readingListsEl.innerHTML =
      "<p class='muted'>No reading lists attached to this project yet.</p>";
    return;
  }
  readingListsEl.innerHTML = attachedCollections
    .map((collection) => {
      const title = collection.title || "Untitled collection";
      const badge = collection.is_primary ? "<span class='badge primary-badge'>Primary</span>" : "";
      const description = collection.description
        ? `<p class='muted'>${collection.description}</p>`
        : "";
      return `
        <article class="mini-card">
          <h4>${title} ${badge}</h4>
          ${description}
        </article>
      `;
    })
    .join("");
}

async function loadAttachedCollections() {
  try {
    const response = await window.LitLab.apiFetch(`/projects/${projectId}/collections`);
    attachedCollections = response.collections || [];
    const primary = attachedCollections.find((collection) => collection.is_primary);
    primaryCollectionId = primary?.id || attachedCollections[0]?.id || null;
    renderReadingLists();
  } catch (error) {
    attachedCollections = [];
    primaryCollectionId = null;
    if (readingListsEl) {
      readingListsEl.innerHTML = `<p class='message error'>${
        error.message || "Could not load reading lists."
      }</p>`;
    }
  }
}

function ensurePrimaryCollectionId() {
  if (!primaryCollectionId) {
    setMessage(
      "This project does not have a primary reading list yet. Refresh the page or try again.",
      "error"
    );
    return null;
  }
  return primaryCollectionId;
}

searchFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(searchFormEl);
  const query = String(formData.get("query") || "").trim();
  if (!query) {
    setMessage("Enter a keyword to search papers.", "warning");
    return;
  }

  setMessage("Searching papers...");
  searchResultsEl.innerHTML = "<p class='muted'>Searching...</p>";
  try {
    const response = await window.LitLab.apiFetch(`/papers/search?q=${encodeURIComponent(query)}`);
    const papers = response.papers || [];
    searchPaperMap.clear();
    papers.forEach((paper) => {
      const key = [paper.external_paper_id || "", paper.title || "", paper.source || ""].join("::");
      searchPaperMap.set(key, paper);
    });
    if (!papers.length) {
      searchResultsEl.innerHTML = "<p class='muted'>No papers found for this search.</p>";
      setMessage("No papers found.", "warning");
      return;
    }
    searchResultsEl.innerHTML = papers.map((paper) => paperCard(paper, true)).join("");
    setMessage(`Found ${papers.length} papers.`, "success");
  } catch (error) {
    searchResultsEl.innerHTML = "<p class='muted'>Search failed.</p>";
    setMessage(error.message || "Could not search papers.", "error");
  }
});

searchResultsEl.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.dataset.action !== "save-paper") return;

  const paperJson = target.dataset.paper?.replace(/&apos;/g, "'");
  if (!paperJson) return;

  try {
    const paper = JSON.parse(paperJson);
    const collectionId = ensurePrimaryCollectionId();
    if (!collectionId) return;
    await window.LitLab.apiFetch("/papers/ingest", {
      method: "POST",
      body: JSON.stringify({
        ...paper,
        collection_ids: [collectionId],
      }),
    });
    setMessage("Paper saved to this project's primary reading list.", "success");
    await loadSavedPapers();
  } catch (error) {
    setMessage(error.message || "Could not save paper.", "error");
  }
});

savedPapersEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.dataset.action !== "select-paper") return;

  const paperJson = target.dataset.paper?.replace(/&apos;/g, "'");
  if (!paperJson) return;
  selectedPaper = JSON.parse(paperJson);
  aiOutputEl.textContent = `Selected paper: ${selectedPaper.title}`;
  relatedPapersEl.innerHTML = "";
  loadSelectedPaperNote();
});

notesFormEl.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  const section = target.dataset.section;
  if (!section) return;
  localStorage.setItem(notesStorageKey(section), target.value);
});

async function runAiAction(endpoint) {
  if (!selectedPaper) {
    setMessage("Select a saved paper first.", "warning");
    return;
  }
  aiOutputEl.textContent = "Generating...";
  try {
    if (selectedPaper.id) {
      const response = await window.LitLab.apiFetch(`/ai/papers/${selectedPaper.id}/${endpoint}`, {
        method: "POST",
      });
      aiOutputEl.textContent = response.output || "No output returned.";
    } else {
      const response = await window.LitLab.apiFetch(`/ai/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({ paper: selectedPaper }),
      });
      aiOutputEl.textContent = response.output;
    }
    setMessage("AI response generated.", "success");
  } catch (error) {
    aiOutputEl.textContent = "";
    setMessage(error.message || "AI action failed.", "error");
  }
}

summarizeBtn.addEventListener("click", () => runAiAction("summarize"));
explainBtn.addEventListener("click", () => runAiAction("explain"));
quizBtn.addEventListener("click", () => runAiAction("quiz"));

recommendBtn.addEventListener("click", async () => {
  if (!selectedPaper) {
    setMessage("Select a saved paper first.", "warning");
    return;
  }
  relatedPapersEl.innerHTML = "<p class='muted'>Finding related papers...</p>";
  try {
    const response = selectedPaper.id
      ? await window.LitLab.apiFetch(`/ai/papers/${selectedPaper.id}/recommend`, { method: "POST" })
      : await window.LitLab.apiFetch("/ai/recommend", {
          method: "POST",
          body: JSON.stringify({ paper: selectedPaper }),
        });
    const papers = response.papers || [];
    if (!papers.length) {
      relatedPapersEl.innerHTML = "<p class='muted'>No related papers found.</p>";
      return;
    }
    relatedPapersEl.innerHTML = `
      <p class="muted">Related query: ${response.query}</p>
      ${papers.map((paper) => paperCard(paper, true)).join("")}
    `;
  } catch (error) {
    relatedPapersEl.innerHTML = `<p class='message error'>${error.message || "Recommendation failed."}</p>`;
  }
});

batchSaveSearchBtn.addEventListener("click", async () => {
  const checked = Array.from(searchResultsEl.querySelectorAll('input[data-action="batch-save-paper"]:checked'));
  if (!checked.length) {
    setMessage("Select at least one search result.", "warning");
    return;
  }
  const collectionId = ensurePrimaryCollectionId();
  if (!collectionId) return;
  setMessage("Saving selected papers...");
  try {
    await Promise.all(
      checked.map((inputNode) => {
        const key = inputNode.value;
        const paper = searchPaperMap.get(key);
        if (!paper) return Promise.resolve();
        return window.LitLab.apiFetch("/papers/ingest", {
          method: "POST",
          body: JSON.stringify({
            ...paper,
            collection_ids: [collectionId],
          }),
        });
      })
    );
    setMessage(`Saved ${checked.length} paper(s) to this project's primary reading list.`, "success");
    await loadSavedPapers();
  } catch (error) {
    setMessage(error.message || "Could not batch save papers.", "error");
  }
});

savePaperNoteBtn.addEventListener("click", async () => {
  if (!selectedPaper?.id) {
    setMessage("Select a saved paper first.", "warning");
    return;
  }
  try {
    await window.LitLab.apiFetch(`/papers/${selectedPaper.id}/note`, {
      method: "PUT",
      body: JSON.stringify({ content: paperNoteInputEl.value || "" }),
    });
    setMessage("Paper note saved.", "success");
  } catch (error) {
    setMessage(error.message || "Could not save paper note.", "error");
  }
});

// ---------------------------------------------------------------------------
// Add-papers-from-Library picker
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setPickerMessage(text, tone = "info") {
  if (!libraryPickerMessageEl) return;
  if (!text) {
    libraryPickerMessageEl.textContent = "";
    libraryPickerMessageEl.hidden = true;
    return;
  }
  libraryPickerMessageEl.textContent = text;
  libraryPickerMessageEl.className = `message ${tone}`;
  libraryPickerMessageEl.hidden = false;
}

function pickerPaperCard(paper) {
  const alreadyInProject = paper.id && projectPaperIdSet.has(paper.id);
  const checked = libraryPickerSelection.has(paper.id) ? "checked" : "";
  const disabled = alreadyInProject ? "disabled" : "";
  const authors = (paper.authors || []).join(", ") || "Unknown author";
  const source = paper.source || "Unknown source";
  const metaParts = [authors];
  if (paper.year) metaParts.push(String(paper.year));
  metaParts.push(escapeHtml(source));
  return `
    <article class="card paper-card paper-picker-row${alreadyInProject ? " disabled" : ""}" data-paper-id="${escapeHtml(paper.id || "")}">
      <label class="checkbox-inline paper-picker-check">
        <input type="checkbox" data-action="picker-select" value="${escapeHtml(paper.id || "")}" ${checked} ${disabled} />
        <span>
          <strong>${escapeHtml(paper.title || "Untitled")}</strong>
          ${alreadyInProject ? "<span class='badge gray'>In project</span>" : ""}
        </span>
      </label>
      <p class="muted paper-picker-meta">${escapeHtml(metaParts.join(" · "))}</p>
    </article>
  `;
}

function getFilteredPickerPapers() {
  const filter = (libraryPickerFilterEl?.value || "").trim().toLowerCase();
  if (!filter) return libraryPickerPapers;
  return libraryPickerPapers.filter((paper) => {
    const titleMatch = String(paper.title || "").toLowerCase().includes(filter);
    const authorMatch = (paper.authors || [])
      .join(" ")
      .toLowerCase()
      .includes(filter);
    return titleMatch || authorMatch;
  });
}

function renderLibraryPickerResults() {
  if (!libraryPickerResultsEl) return;
  const papers = getFilteredPickerPapers();
  if (!libraryPickerPapers.length) {
    libraryPickerResultsEl.innerHTML =
      "<p class='muted'>No papers available from this source.</p>";
    return;
  }
  if (!papers.length) {
    libraryPickerResultsEl.innerHTML = "<p class='muted'>No matches for this filter.</p>";
    return;
  }
  libraryPickerResultsEl.innerHTML = papers.map(pickerPaperCard).join("");
}

async function loadPickerPapers() {
  setPickerMessage("Loading papers...");
  libraryPickerResultsEl.innerHTML = "<p class='muted'>Loading...</p>";
  try {
    let papers = [];
    if (libraryPickerSource === "library") {
      const response = await window.LitLab.apiFetch("/papers?limit=100&offset=0");
      papers = response.papers || [];
    } else {
      const response = await window.LitLab.apiFetch(
        `/collections/${libraryPickerSource}/papers`
      );
      papers = response.papers || [];
    }
    libraryPickerPapers = papers;
    for (const id of Array.from(libraryPickerSelection)) {
      if (!papers.find((p) => p.id === id)) libraryPickerSelection.delete(id);
    }
    renderLibraryPickerResults();
    setPickerMessage(
      `${papers.length} paper${papers.length === 1 ? "" : "s"} available.`,
      "success"
    );
  } catch (error) {
    libraryPickerPapers = [];
    renderLibraryPickerResults();
    setPickerMessage(error.message || "Could not load papers.", "error");
  }
}

function populatePickerSourceOptions() {
  if (!libraryPickerSourceEl) return;
  const previousValue = libraryPickerSourceEl.value || "library";
  const collectionOptions = allCollectionsCache
    .map(
      (collection) =>
        `<option value="${escapeHtml(collection.id)}">${escapeHtml(
          collection.title || "Untitled"
        )}</option>`
    )
    .join("");
  libraryPickerSourceEl.innerHTML = `
    <option value="library">All Library papers</option>
    ${collectionOptions ? `<optgroup label="Collections">${collectionOptions}</optgroup>` : ""}
  `;
  libraryPickerSourceEl.value = allCollectionsCache.find((c) => c.id === previousValue)
    ? previousValue
    : "library";
  libraryPickerSource = libraryPickerSourceEl.value;
}

async function loadCollectionsForPicker() {
  try {
    const response = await window.LitLab.apiFetch("/collections");
    allCollectionsCache = response.collections || [];
  } catch (_error) {
    allCollectionsCache = [];
  }
  populatePickerSourceOptions();
}

libraryPickerToggleBtn?.addEventListener("click", async () => {
  const willOpen = libraryPickerBodyEl.hidden;
  libraryPickerBodyEl.hidden = !willOpen;
  libraryPickerToggleBtn.textContent = willOpen ? "Close Picker" : "Open Picker";
  if (willOpen && !libraryPickerPapers.length) {
    await loadPickerPapers();
  }
});

libraryPickerSourceEl?.addEventListener("change", async () => {
  libraryPickerSource = libraryPickerSourceEl.value;
  libraryPickerSelection.clear();
  await loadPickerPapers();
});

libraryPickerFilterEl?.addEventListener("input", () => {
  renderLibraryPickerResults();
});

libraryPickerResultsEl?.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.action !== "picker-select") return;
  const paperId = target.value;
  if (!paperId) return;
  if (target.checked) libraryPickerSelection.add(paperId);
  else libraryPickerSelection.delete(paperId);
});

libraryPickerSelectAllBtn?.addEventListener("click", () => {
  const visible = getFilteredPickerPapers();
  visible.forEach((paper) => {
    if (paper.id && !projectPaperIdSet.has(paper.id)) libraryPickerSelection.add(paper.id);
  });
  renderLibraryPickerResults();
});

libraryPickerClearBtn?.addEventListener("click", () => {
  libraryPickerSelection.clear();
  renderLibraryPickerResults();
});

libraryPickerAddBtn?.addEventListener("click", async () => {
  const collectionId = ensurePrimaryCollectionId();
  if (!collectionId) return;
  const paperIds = Array.from(libraryPickerSelection).filter(
    (id) => !projectPaperIdSet.has(id)
  );
  if (!paperIds.length) {
    setPickerMessage("Select at least one paper that is not already in the project.", "warning");
    return;
  }
  setPickerMessage(`Adding ${paperIds.length} paper(s) to the primary reading list...`);
  try {
    const response = await window.LitLab.apiFetch(
      `/collections/${collectionId}/papers:batchAdd`,
      {
        method: "POST",
        body: JSON.stringify({ paper_ids: paperIds }),
      }
    );
    const added = Array.isArray(response.added) ? response.added.length : paperIds.length;
    setPickerMessage(`Added ${added} paper(s) to the primary reading list.`, "success");
    libraryPickerSelection.clear();
    await loadSavedPapers();
  } catch (error) {
    setPickerMessage(error.message || "Could not add papers.", "error");
  }
});

loadProjectDetail();
loadAttachedCollections();
loadSavedPapers();
loadCollectionsForPicker();
