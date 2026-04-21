window.LitLab.requireAuth();

const params = new URLSearchParams(window.location.search);
const projectId = params.get("id");

const projectMessageEl = document.getElementById("project-message");
const projectTitleEl = document.getElementById("project-title");
const projectDescriptionEl = document.getElementById("project-description");
const frameworkGuideEl = document.getElementById("framework-guide");
const notesFormEl = document.getElementById("framework-notes-form");
const savedPapersEl = document.getElementById("saved-papers");
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

let selectedPaper = null;
const searchPaperMap = new Map();

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
                .replace(/'/g, "&apos;")}'>Save to Project</button>`
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
    if (!papers.length) {
      savedPapersEl.innerHTML = "<p class='muted'>No saved papers yet.</p>";
      selectedPaper = null;
      return;
    }
    savedPapersEl.innerHTML = papers.map((paper) => paperCard(paper, false)).join("");
    if (!selectedPaper) {
      selectedPaper = papers[0];
      aiOutputEl.textContent = `Selected paper: ${selectedPaper.title}`;
      loadSelectedPaperNote();
    }
  } catch (error) {
    savedPapersEl.innerHTML = `<p class='message error'>${error.message || "Could not load saved papers."}</p>`;
  }
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
    await window.LitLab.apiFetch("/papers/ingest", {
      method: "POST",
      body: JSON.stringify({
        ...paper,
        collection_ids: [projectId],
      }),
    });
    setMessage("Paper saved to project.", "success");
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
            collection_ids: [projectId],
          }),
        });
      })
    );
    setMessage(`Saved ${checked.length} paper(s) to this collection.`, "success");
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

loadProjectDetail();
loadSavedPapers();
