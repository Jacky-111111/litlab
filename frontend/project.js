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
const libraryPickerToggleBtn = document.getElementById("library-picker-toggle");
const libraryPickerBodyEl = document.getElementById("library-picker-body");
const libraryPickerSourceEl = document.getElementById("library-picker-source");
const libraryPickerFilterEl = document.getElementById("library-picker-filter");
const libraryPickerResultsEl = document.getElementById("library-picker-results");
const libraryPickerMessageEl = document.getElementById("library-picker-message");
const libraryPickerSelectAllBtn = document.getElementById("library-picker-select-all");
const libraryPickerClearBtn = document.getElementById("library-picker-clear");
const libraryPickerAddBtn = document.getElementById("library-picker-add");

const exportBibMlaBtn = document.getElementById("export-bib-mla");
const exportBibApaBtn = document.getElementById("export-bib-apa");
const exportBibChicagoBtn = document.getElementById("export-bib-chicago");

const advisorRunBtn = document.getElementById("advisor-run-btn");
const advisorMessageEl = document.getElementById("advisor-message");
const advisorBodyEl = document.getElementById("advisor-body");
const advisorMetaEl = document.getElementById("advisor-meta");
const advisorSummaryEl = document.getElementById("advisor-summary");
const advisorScoresEl = document.getElementById("advisor-scores");
const advisorDirectionsEl = document.getElementById("advisor-directions");
const advisorInnovationsEl = document.getElementById("advisor-innovations");
const advisorRisksEl = document.getElementById("advisor-risks");
const advisorNextStepsEl = document.getElementById("advisor-next-steps");

let attachedCollections = [];
let primaryCollectionId = null;

let libraryPickerSource = "library";
let libraryPickerPapers = [];
const libraryPickerSelection = new Set();
const projectPaperIdSet = new Set();
let allCollectionsCache = [];

let projectTitleText = "Project";
let projectSavedPapers = [];

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

function updateSavedPapersScrollLayout() {
  if (!savedPapersEl) return;
  const apply = () => {
    const cards = savedPapersEl.querySelectorAll(".paper-card");
    if (cards.length <= 3) {
      savedPapersEl.classList.remove("saved-papers--scrollable");
      savedPapersEl.style.maxHeight = "";
      return;
    }
    let h = 0;
    for (let i = 0; i < 3; i++) {
      h += cards[i].getBoundingClientRect().height;
    }
    const s = getComputedStyle(savedPapersEl);
    const gap = parseFloat(s.rowGap) || parseFloat(s.gap) || 16;
    h += 2 * gap;
    savedPapersEl.classList.add("saved-papers--scrollable");
    savedPapersEl.style.maxHeight = `${Math.ceil(h)}px`;
  };
  // Measure after layout (double rAF handles paint after innerHTML)
  requestAnimationFrame(() => {
    requestAnimationFrame(apply);
  });
}

function paperCard(paper) {
  const paperId = paper.id || paper.external_paper_id || "";
  const authors = (paper.authors || []).join(", ") || "Unknown author";
  const abstract = paper.abstract || "No abstract available for this paper.";
  const abstractSnippet = abstract.length > 280 ? `${abstract.slice(0, 280)}...` : abstract;
  const displayName = (paper.nickname || paper.title || "Untitled").trim();
  return `
    <article class="card paper-card" data-paper-id="${paperId}">
      ${paper.url ? `<a class="paper-card-source-link" href="${paper.url}" target="_blank" rel="noopener noreferrer">Open Source</a>` : ""}
      <h4>${escapeHtml(displayName)}</h4>
      <p class="muted">${authors} ${paper.year ? `· ${paper.year}` : ""} · ${paper.source || "Unknown source"}</p>
      <p>${abstractSnippet}</p>
      <div class="paper-actions">
        ${paper.id ? `<button data-action="read-paper" data-paper-id="${paper.id}">Read Paper</button>` : ""}
      </div>
    </article>
  `;
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
    projectTitleText = (project.title || "Project").trim() || "Project";
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
    projectSavedPapers = papers;
    projectPaperIdSet.clear();
    papers.forEach((paper) => {
      if (paper.id) projectPaperIdSet.add(paper.id);
    });
    updateBibliographyExportButtons();
    if (!papers.length) {
      savedPapersEl.innerHTML = "<p class='muted'>No saved papers yet.</p>";
      renderLibraryPickerResults();
      updateSavedPapersScrollLayout();
      return;
    }
    savedPapersEl.innerHTML = papers.map((paper) => paperCard(paper)).join("");
    renderLibraryPickerResults();
    updateSavedPapersScrollLayout();
    if (papers.length > 3 && document.fonts?.ready) {
      document.fonts.ready.then(() => updateSavedPapersScrollLayout());
    }
  } catch (error) {
    projectSavedPapers = [];
    updateBibliographyExportButtons();
    savedPapersEl.innerHTML = `<p class='message error'>${error.message || "Could not load saved papers."}</p>`;
    updateSavedPapersScrollLayout();
  }
}

// ---------------------------------------------------------------------------
// Bibliography export (MLA / APA / Chicago .txt download)
// ---------------------------------------------------------------------------

const BIBLIOGRAPHY_STYLE_META = {
  mla: { label: "MLA", heading: "Works Cited" },
  apa: { label: "APA", heading: "References" },
  chicago: { label: "Chicago", heading: "Bibliography" },
};

function updateBibliographyExportButtons() {
  const disabled = projectSavedPapers.length === 0;
  [exportBibMlaBtn, exportBibApaBtn, exportBibChicagoBtn].forEach((btn) => {
    if (btn) btn.disabled = disabled;
  });
}

function firstAuthorLastName(paper) {
  const firstAuthor = (paper?.authors || [])[0];
  if (!firstAuthor) return "";
  const parts = String(firstAuthor).trim().split(/\s+/);
  return (parts[parts.length - 1] || "").toLowerCase();
}

function sortedPapersForBibliography(papers) {
  return [...papers].sort((a, b) => {
    const keyA = firstAuthorLastName(a) || String(a?.title || "").toLowerCase();
    const keyB = firstAuthorLastName(b) || String(b?.title || "").toLowerCase();
    if (keyA === keyB) return 0;
    if (!keyA) return 1;
    if (!keyB) return -1;
    return keyA < keyB ? -1 : 1;
  });
}

function citationFor(paper, style) {
  const fromDict = paper?.citations?.[style];
  if (typeof fromDict === "string" && fromDict.trim()) return fromDict.trim();
  const flat = paper?.[`citation_${style}`];
  if (typeof flat === "string" && flat.trim()) return flat.trim();
  return "";
}

function buildBibliographyText(style) {
  const meta = BIBLIOGRAPHY_STYLE_META[style];
  const sorted = sortedPapersForBibliography(projectSavedPapers);
  const entries = [];
  const skipped = [];
  sorted.forEach((paper) => {
    const line = citationFor(paper, style);
    if (line) {
      entries.push(line);
    } else {
      skipped.push(paper?.title || paper?.nickname || "Untitled paper");
    }
  });

  const now = new Date();
  const generatedOn = now.toISOString().slice(0, 10);
  const header = [
    projectTitleText,
    `${meta.heading} (${meta.label})`,
    `Generated ${generatedOn} by LitLab · ${entries.length} source${entries.length === 1 ? "" : "s"}`,
  ];
  const divider = "=".repeat(Math.min(72, Math.max(header[0].length, header[1].length, 24)));

  const parts = [header[0], divider, header[1], header[2], ""];
  if (entries.length === 0) {
    parts.push("(No citations available for the saved papers.)");
  } else {
    parts.push(...entries.flatMap((line) => [line, ""]));
  }
  if (skipped.length) {
    parts.push("");
    parts.push(`Note: ${skipped.length} paper(s) had no citation data and were omitted:`);
    skipped.forEach((title) => parts.push(`  - ${title}`));
  }
  return `${parts.join("\n").trimEnd()}\n`;
}

function sanitizeFilename(value) {
  return String(value || "project")
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "project";
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportBibliography(style) {
  if (!BIBLIOGRAPHY_STYLE_META[style]) return;
  if (!projectSavedPapers.length) {
    setMessage("No saved papers yet — nothing to export.", "warning");
    return;
  }
  const text = buildBibliographyText(style);
  const base = sanitizeFilename(projectTitleText);
  downloadTextFile(`${base}-bibliography-${style}.txt`, text);
  const label = BIBLIOGRAPHY_STYLE_META[style].label;
  setMessage(`Downloaded ${label} bibliography for this project.`, "success");
}

exportBibMlaBtn?.addEventListener("click", () => exportBibliography("mla"));
exportBibApaBtn?.addEventListener("click", () => exportBibliography("apa"));
exportBibChicagoBtn?.addEventListener("click", () => exportBibliography("chicago"));

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

savedPapersEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;

  if (target.dataset.action === "read-paper") {
    const paperId = target.dataset.paperId;
    if (!paperId) return;
    window.location.href = `read-papers.html?paper_id=${encodeURIComponent(paperId)}`;
  }
});

notesFormEl.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) return;
  const section = target.dataset.section;
  if (!section) return;
  localStorage.setItem(notesStorageKey(section), target.value);
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
          <strong>${escapeHtml((paper.nickname || paper.title || "Untitled").trim())}</strong>
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

// ---------------------------------------------------------------------------
// AI Direction Advisor
// ---------------------------------------------------------------------------

const SCORE_LABELS = {
  innovation: "Innovation",
  feasibility: "Feasibility",
  scope_clarity: "Scope clarity",
  literature_coverage: "Literature coverage",
  methodology_strength: "Methodology strength",
};

function setAdvisorMessage(text, tone = "info") {
  if (!advisorMessageEl) return;
  if (!text) {
    advisorMessageEl.textContent = "";
    advisorMessageEl.hidden = true;
    return;
  }
  advisorMessageEl.textContent = text;
  advisorMessageEl.className = `message ${tone}`;
  advisorMessageEl.hidden = false;
}

function collectFrameworkNotes() {
  const notes = {};
  if (!notesFormEl) return notes;
  const textareas = notesFormEl.querySelectorAll("textarea[data-section]");
  textareas.forEach((textarea) => {
    const section = textarea.dataset.section;
    if (!section) return;
    notes[section] = textarea.value || "";
  });
  return notes;
}

function scoreTone(score) {
  if (score >= 8) return "strong";
  if (score >= 5) return "okay";
  return "weak";
}

function renderAdvisorScores(scores = {}, rationales = {}) {
  if (!advisorScoresEl) return;
  const html = Object.keys(SCORE_LABELS)
    .map((key) => {
      const raw = Number(scores?.[key]);
      const value = Number.isFinite(raw) ? Math.max(0, Math.min(10, raw)) : 0;
      const tone = scoreTone(value);
      const rationale = rationales?.[key] || "";
      return `
        <article class="advisor-score advisor-score-${tone}">
          <div class="advisor-score-top">
            <span class="advisor-score-label">${escapeHtml(SCORE_LABELS[key])}</span>
            <span class="advisor-score-value">${value}<span class="advisor-score-max">/10</span></span>
          </div>
          <div class="advisor-score-bar"><span style="width:${value * 10}%"></span></div>
          ${rationale ? `<p class="advisor-score-rationale">${escapeHtml(rationale)}</p>` : ""}
        </article>
      `;
    })
    .join("");
  advisorScoresEl.innerHTML = html;
}

function renderAdvisorCards(container, items, { primaryKey = "title", bodyKey = "description", footerKey = "" } = {}) {
  if (!container) return;
  if (!Array.isArray(items) || !items.length) {
    container.innerHTML = "<p class='muted'>No suggestions yet.</p>";
    return;
  }
  container.innerHTML = items
    .map((item) => {
      const title = escapeHtml(String(item?.[primaryKey] || "Suggestion").trim());
      const description = escapeHtml(String(item?.[bodyKey] || "").trim());
      const footerText = footerKey ? String(item?.[footerKey] || "").trim() : "";
      return `
        <article class="advisor-card">
          <h4>${title}</h4>
          ${description ? `<p>${description}</p>` : ""}
          ${footerText ? `<p class='muted advisor-card-footer'>${escapeHtml(footerText)}</p>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderAdvisorRisks(items) {
  if (!advisorRisksEl) return;
  if (!Array.isArray(items) || !items.length) {
    advisorRisksEl.innerHTML = "<li class='muted'>No specific risks flagged.</li>";
    return;
  }
  advisorRisksEl.innerHTML = items
    .map((item) => {
      const label = escapeHtml(String(item?.label || "Risk").trim());
      const mitigation = escapeHtml(String(item?.mitigation || "").trim());
      return `
        <li>
          <strong>${label}.</strong>
          ${mitigation ? ` ${mitigation}` : ""}
        </li>
      `;
    })
    .join("");
}

function renderAdvisorNextSteps(items) {
  if (!advisorNextStepsEl) return;
  if (!Array.isArray(items) || !items.length) {
    advisorNextStepsEl.innerHTML = "<li class='muted'>No next steps yet.</li>";
    return;
  }
  advisorNextStepsEl.innerHTML = items
    .map((step) => `<li>${escapeHtml(String(step || "").trim())}</li>`)
    .join("");
}

function renderAdvisorMeta(context = {}) {
  if (!advisorMetaEl) return;
  const paperCount = Number(context.paper_count || 0);
  const filledNotes = Number(context.filled_note_count || 0);
  const noteSections = Number(context.note_section_count || 0);
  const stamp = context.generated_at ? new Date(context.generated_at).toLocaleString() : "";
  const parts = [
    `${paperCount} saved paper${paperCount === 1 ? "" : "s"}`,
    `${filledNotes}/${noteSections} note section${noteSections === 1 ? "" : "s"} filled`,
  ];
  if (stamp) parts.push(`generated ${stamp}`);
  advisorMetaEl.textContent = parts.join(" · ");
}

function renderAdvisorResult(result) {
  if (!advisorBodyEl) return;
  renderAdvisorMeta(result.context || {});
  if (advisorSummaryEl) {
    const summary = String(result.summary || "").trim();
    advisorSummaryEl.textContent = summary || "No summary generated.";
  }
  renderAdvisorScores(result.scores || {}, result.score_rationales || {});
  renderAdvisorCards(advisorDirectionsEl, result.writing_directions, {
    primaryKey: "title",
    bodyKey: "description",
    footerKey: "based_on",
  });
  renderAdvisorCards(advisorInnovationsEl, result.innovation_angles, {
    primaryKey: "title",
    bodyKey: "description",
    footerKey: "rationale",
  });
  renderAdvisorRisks(result.risks);
  renderAdvisorNextSteps(result.next_steps);
  advisorBodyEl.hidden = false;
}

async function runAdvisor() {
  if (!projectId) return;
  const notes = collectFrameworkNotes();

  setAdvisorMessage("Reading your notes and papers, then drafting suggestions...");
  const advisorBtnLabel = advisorRunBtn?.querySelector("span") || advisorRunBtn;
  if (advisorRunBtn) {
    advisorRunBtn.disabled = true;
    if (advisorBtnLabel) {
      advisorBtnLabel.dataset.originalText =
        advisorBtnLabel.dataset.originalText || advisorBtnLabel.textContent;
      advisorBtnLabel.textContent = "Generating...";
    }
  }

  try {
    const response = await window.LitLab.apiFetch(`/ai/projects/${projectId}/advise`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    });
    renderAdvisorResult(response || {});
    setAdvisorMessage("Fresh suggestions ready below.", "success");
  } catch (error) {
    setAdvisorMessage(error.message || "Could not generate suggestions right now.", "error");
  } finally {
    if (advisorRunBtn) {
      advisorRunBtn.disabled = false;
      if (advisorBtnLabel) {
        advisorBtnLabel.textContent =
          advisorBtnLabel.dataset.originalText || "Generate suggestions";
      }
    }
  }
}

advisorRunBtn?.addEventListener("click", runAdvisor);

let savedPapersLayoutResizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(savedPapersLayoutResizeTimer);
  savedPapersLayoutResizeTimer = setTimeout(() => {
    updateSavedPapersScrollLayout();
  }, 150);
});

loadProjectDetail();
loadAttachedCollections();
loadSavedPapers();
loadCollectionsForPicker();
