window.LitLab.requireAuth();

const paperUrlInputEl = document.getElementById("paper-url-input");
const savePaperUrlBtn = document.getElementById("save-paper-url-btn");
const pdfInputEl = document.getElementById("paper-pdf-input");
const choosePdfBtn = document.getElementById("choose-pdf-btn");
const selectedPdfNameEl = document.getElementById("selected-pdf-name");
const analyzePaperBtn = document.getElementById("analyze-paper-btn");
const savedSourceInfoEl = document.getElementById("saved-source-info");
const messageEl = document.getElementById("read-papers-message");
const paperMetaEl = document.getElementById("paper-meta");
const analysisSectionsEl = document.getElementById("analysis-sections");
const analysisOutputEl = document.getElementById("analysis-output");
const relatedQueryEl = document.getElementById("related-query");
const relatedPapersEl = document.getElementById("related-papers");
const citationSectionEl = document.getElementById("citation-section");
const citationMlaEl = document.getElementById("citation-mla");
const citationApaEl = document.getElementById("citation-apa");
const citationChicagoEl = document.getElementById("citation-chicago");
const collectionsEl = document.getElementById("read-paper-collections");
const persistToggleEl = document.getElementById("persist-to-library");
const libraryMembershipStatusEl = document.getElementById("library-membership-status");
const saveLibraryMembershipBtn = document.getElementById("save-library-membership-btn");
const removeFromLibraryBtn = document.getElementById("remove-from-library-btn");
const readerModeHintEl = document.getElementById("reader-mode-hint");
const backToLibraryBtn = document.getElementById("back-to-library-btn");
const nicknameEditorEl = document.getElementById("nickname-editor");
const paperNicknameInputEl = document.getElementById("paper-nickname-input");
const savePaperNicknameBtn = document.getElementById("save-paper-nickname-btn");
const pageParams = new URLSearchParams(window.location.search);
const presetPaperId = String(pageParams.get("paper_id") || "").trim();
let currentPaperId = "";
let currentPaperData = null;
let availableCollections = [];
let currentCollectionIds = new Set();

function setMessage(text, tone = "info") {
  messageEl.textContent = text;
  messageEl.className = `message ${tone}`;
}

function paperCardTemplate(paper) {
  const authors = (paper.authors || []).join(", ") || "Unknown author";
  const abstract = paper.abstract || "No abstract available.";
  const snippet = abstract.length > 260 ? `${abstract.slice(0, 260)}...` : abstract;
  return `
    <article class="card paper-card">
      <h4>${paper.title || "Untitled paper"}</h4>
      <p class="muted">${authors}${paper.year ? ` · ${paper.year}` : ""} · ${paper.source || "Unknown source"}</p>
      <p>${snippet}</p>
      ${
        paper.url
          ? `<div class="paper-actions"><a class="secondary" href="${paper.url}" target="_blank" rel="noopener noreferrer">Open Source</a></div>`
          : ""
      }
    </article>
  `;
}

function renderPaperMeta(paper) {
  const nickname = (paper.nickname || paper.title || "Untitled").trim();
  currentPaperId = String(paper.id || "").trim();
  currentPaperData = paper || null;
  if (paper?.url) {
    paperUrlInputEl.value = String(paper.url);
  }
  nicknameEditorEl.hidden = !currentPaperId;
  if (currentPaperId) {
    paperNicknameInputEl.value = nickname;
  }
  const authors = (paper.authors || []).join(", ") || "Unknown";
  paperMetaEl.classList.remove("muted");
  paperMetaEl.innerHTML = `
    <strong>${nickname}</strong>
    <p>Detected title: ${paper.title || "Untitled paper"}</p>
    <p>Authors: ${authors}</p>
    <p>Year: ${paper.year || "Unknown"}</p>
    <p>Source: ${paper.source || "Unknown"}</p>
    ${paper.pdf_storage_path ? `<p>PDF saved: ${paper.pdf_storage_path}</p>` : ""}
    ${paper.url ? `<p><a href="${paper.url}" target="_blank" rel="noopener noreferrer">Original URL</a></p>` : ""}
  `;
  renderSavedSourceInfo(paper);
  refreshLibraryControls();
}

function renderSavedSourceInfo(paper) {
  const url = String(paper?.url || "").trim();
  const pdfPath = String(paper?.pdf_storage_path || "").trim();
  const lines = [];
  lines.push(`<p><strong>Saved URL:</strong> ${url || "Not saved"}</p>`);
  lines.push(`<p><strong>Saved PDF:</strong> ${pdfPath || "Not saved"}</p>`);
  lines.push(
    `<div class="inline-actions">
      <button type="button" class="secondary" data-source-action="copy-url" ${url ? "" : "disabled"}>Copy URL</button>
      <button type="button" class="secondary" data-source-action="download-pdf" ${pdfPath && currentPaperId ? "" : "disabled"}>Download PDF</button>
    </div>`
  );
  savedSourceInfoEl.classList.remove("muted");
  savedSourceInfoEl.innerHTML = lines.join("");
}

function applyPaperLibraryState(paperId, collectionIds = []) {
  currentPaperId = String(paperId || "").trim();
  currentCollectionIds = new Set(collectionIds);
  nicknameEditorEl.hidden = !currentPaperId;
  syncCollectionSelectionToUi(currentCollectionIds);
  refreshLibraryControls();
}

function renderCitations(paper) {
  const citations = paper?.citations || {};
  citationMlaEl.textContent = citations.mla || paper?.citation_mla || "Citation unavailable.";
  citationApaEl.textContent = citations.apa || paper?.citation_apa || "Citation unavailable.";
  citationChicagoEl.textContent = citations.chicago || paper?.citation_chicago || "Citation unavailable.";
}

function cleanInlineMarkdown(text) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function parseAnalysisSections(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const rawLine of lines) {
    const headingMatch = rawLine.match(/^##\s*(.+)$/);
    if (headingMatch) {
      if (current) sections.push(current);
      const normalizedTitle = cleanInlineMarkdown(headingMatch[1]).replace(/^\d+\)\s*/, "");
      current = { title: normalizedTitle || "Analysis", lines: [] };
      continue;
    }

    if (!current) {
      current = { title: "Analysis", lines: [] };
    }
    current.lines.push(rawLine);
  }

  if (current) sections.push(current);
  return sections.filter((section) => section.lines.some((line) => line.trim()));
}

function appendSectionBlocks(sectionEl, lines) {
  for (let index = 0; index < lines.length; ) {
    const raw = lines[index];
    const trimmed = raw.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const listEl = document.createElement("ul");
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        const liEl = document.createElement("li");
        liEl.textContent = cleanInlineMarkdown(lines[index].trim().replace(/^[-*]\s+/, ""));
        listEl.appendChild(liEl);
        index += 1;
      }
      sectionEl.appendChild(listEl);
      continue;
    }

    const paragraphParts = [cleanInlineMarkdown(trimmed)];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || /^[-*]\s+/.test(next)) break;
      paragraphParts.push(cleanInlineMarkdown(next));
      index += 1;
    }
    const paragraphEl = document.createElement("p");
    paragraphEl.textContent = paragraphParts.join(" ");
    sectionEl.appendChild(paragraphEl);
  }
}

function renderStructuredAnalysis(markdown) {
  const sections = parseAnalysisSections(markdown);
  analysisSectionsEl.innerHTML = "";

  if (!sections.length) {
    analysisSectionsEl.innerHTML = "<p class='muted'>No analysis returned.</p>";
    return;
  }

  sections.forEach((section) => {
    const sectionEl = document.createElement("article");
    sectionEl.className = "mini-card analysis-card";

    const titleEl = document.createElement("h3");
    titleEl.textContent = section.title;
    sectionEl.appendChild(titleEl);

    appendSectionBlocks(sectionEl, section.lines);
    analysisSectionsEl.appendChild(sectionEl);
  });
}

function renderAnalysisResponse(payload) {
  renderPaperMeta(payload.paper || {});
  renderCitations(payload.paper || {});
  const analysisText = payload.analysis || "No analysis returned.";
  renderStructuredAnalysis(analysisText);
  analysisOutputEl.textContent = analysisText;
  if (payload.recommendation_error) {
    relatedQueryEl.textContent = `Related papers unavailable: ${payload.recommendation_error}`;
  } else {
    relatedQueryEl.textContent = payload.query ? `Related query: ${payload.query}` : "";
  }

  const papers = payload.papers || [];
  if (!papers.length) {
    relatedPapersEl.innerHTML = "<p class='muted'>No related papers found.</p>";
    return;
  }
  relatedPapersEl.innerHTML = papers.map((paper) => paperCardTemplate(paper)).join("");
}

function selectedCollectionIds() {
  const nodes = collectionsEl.querySelectorAll('input[data-role="collection-checkbox"]:checked');
  return Array.from(nodes)
    .map((node) => node.value)
    .filter(Boolean);
}

function setCollectionSelectionEnabled(enabled) {
  const checkboxes = collectionsEl.querySelectorAll('input[data-role="collection-checkbox"]');
  checkboxes.forEach((checkbox) => {
    checkbox.disabled = !enabled;
  });
}

function setLibraryMembershipStatus(text, tone = "muted") {
  libraryMembershipStatusEl.textContent = text;
  libraryMembershipStatusEl.className = tone === "error" ? "message error" : "muted";
}

function syncCollectionSelectionToUi(collectionIds) {
  const selectedSet = new Set(collectionIds || []);
  const checkboxes = collectionsEl.querySelectorAll('input[data-role="collection-checkbox"]');
  checkboxes.forEach((checkbox) => {
    checkbox.checked = selectedSet.has(checkbox.value);
  });
}

function refreshLibraryControls() {
  const hasSavedPaper = Boolean(currentPaperId);
  saveLibraryMembershipBtn.disabled = !hasSavedPaper;
  removeFromLibraryBtn.disabled = !hasSavedPaper;
  setCollectionSelectionEnabled(persistToggleEl.checked && hasSavedPaper);

  if (!persistToggleEl.checked) {
    setLibraryMembershipStatus("Library save is off. Analyze without saving.", "muted");
    return;
  }
  if (!hasSavedPaper) {
    setLibraryMembershipStatus("This paper is not in Library yet. Run Analyze to save it first.", "muted");
    return;
  }

  setLibraryMembershipStatus(
    `Saved in Library. Currently linked to ${currentCollectionIds.size} collection(s).`,
    "muted"
  );
}

async function loadCollections() {
  try {
    const response = await window.LitLab.apiFetch("/projects");
    availableCollections = response.projects || [];
    if (!availableCollections.length) {
      collectionsEl.innerHTML = "<p class='muted'>No collections yet. Create a project first.</p>";
      refreshLibraryControls();
      return;
    }
    collectionsEl.innerHTML = availableCollections
      .map(
        (project) => `
          <label class="checkbox-inline mini-card">
            <input type="checkbox" data-role="collection-checkbox" value="${project.id}" />
            <span>${project.title}</span>
          </label>
        `
      )
      .join("");
    syncCollectionSelectionToUi(currentCollectionIds);
    refreshLibraryControls();
  } catch (error) {
    availableCollections = [];
    collectionsEl.innerHTML = `<p class='message error'>${error.message || "Could not load collections."}</p>`;
    refreshLibraryControls();
  }
}

async function readExistingPaper(paperId) {
  setMessage("Loading paper from your library...");
  analysisSectionsEl.innerHTML = "<p class='muted'>Loading...</p>";
  analysisOutputEl.textContent = "";
  relatedPapersEl.innerHTML = "";
  try {
    const paperPayload = await window.LitLab.apiFetch(`/papers/${paperId}`);
    if (paperPayload?.paper?.url) {
      paperUrlInputEl.value = paperPayload.paper.url;
    }
    renderPaperMeta(paperPayload.paper || {});
    applyPaperLibraryState(paperPayload?.paper?.id || "", paperPayload.collection_ids || []);
    renderCitations(paperPayload.paper || {});
    const analysisPayload = await window.LitLab.apiFetch(`/ai/papers/${paperId}/analysis`, {
      method: "POST",
    });
    if (!analysisPayload.paper) {
      analysisPayload.paper = paperPayload.paper || {};
    }
    renderAnalysisResponse(analysisPayload);
    setMessage(analysisPayload.cached ? "Library paper loaded from cache." : "Library paper analyzed.", "success");
  } catch (error) {
    analysisSectionsEl.innerHTML = "<p class='muted'>No analysis returned.</p>";
    setMessage(error.message || "Could not load this library paper.", "error");
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      if (!base64) {
        reject(new Error("Could not read PDF file."));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Could not read PDF file."));
    reader.readAsDataURL(file);
  });
}

choosePdfBtn.addEventListener("click", () => {
  pdfInputEl.click();
});

pdfInputEl.addEventListener("change", () => {
  const file = pdfInputEl.files && pdfInputEl.files.length ? pdfInputEl.files[0] : null;
  selectedPdfNameEl.textContent = file ? file.name : "No file chosen";
});

async function analyzeFromCurrentSource() {
  const url = String(paperUrlInputEl.value || "").trim();
  const file = pdfInputEl.files && pdfInputEl.files.length ? pdfInputEl.files[0] : null;
  if (!(file instanceof File) && !url) {
    if (currentPaperId) {
      await readExistingPaper(currentPaperId);
      return;
    }
    setMessage("Provide URL or choose PDF before analyzing.", "warning");
    return;
  }

  analysisSectionsEl.innerHTML = "<p class='muted'>Analyzing source...</p>";
  analysisOutputEl.textContent = "";
  relatedPapersEl.innerHTML = "";
  try {
    let payload = null;
    if (file instanceof File) {
      setMessage("Uploading PDF and analyzing...");
      const pdfBase64 = await fileToBase64(file);
      payload = await window.LitLab.apiFetch("/ai/read-paper/pdf", {
        method: "POST",
        body: JSON.stringify({
          filename: file.name || "uploaded.pdf",
          pdf_base64: pdfBase64,
          persist: persistToggleEl.checked,
          collection_ids: selectedCollectionIds(),
        }),
      });
    } else {
      setMessage("Analyzing URL...");
      try {
        payload = await window.LitLab.apiFetch("/ai/read-paper/url", {
          method: "POST",
          body: JSON.stringify({
            url,
            persist: persistToggleEl.checked,
            collection_ids: selectedCollectionIds(),
          }),
        });
      } catch (urlError) {
        // If URL fetch is blocked (e.g. 403) and this saved paper has PDF, fallback to stored-PDF analysis.
        if (currentPaperId && String(currentPaperData?.pdf_storage_path || "").trim()) {
          setMessage("URL fetch failed, falling back to saved PDF...", "warning");
          payload = await window.LitLab.apiFetch(`/ai/papers/${currentPaperId}/analysis`, {
            method: "POST",
          });
        } else {
          throw urlError;
        }
      }
    }
    renderAnalysisResponse(payload);
    const savedPaperId = String(payload?.paper?.id || "").trim();
    if (savedPaperId) {
      applyPaperLibraryState(savedPaperId, selectedCollectionIds());
    } else {
      applyPaperLibraryState("", []);
    }
    setMessage(
      persistToggleEl.checked ? "Analysis completed and saved to library." : "Analysis completed (not saved).",
      "success"
    );
    if (file instanceof File) {
      pdfInputEl.value = "";
      selectedPdfNameEl.textContent = "No file chosen";
    }
  } catch (error) {
    analysisSectionsEl.innerHTML = "<p class='muted'>No analysis returned.</p>";
    analysisOutputEl.textContent = "";
    relatedPapersEl.innerHTML = "";
    setMessage(error.message || "Could not analyze source.", "error");
  }
}

analyzePaperBtn.addEventListener("click", async () => {
  await analyzeFromCurrentSource();
});

persistToggleEl.addEventListener("change", () => {
  refreshLibraryControls();
});

saveLibraryMembershipBtn.addEventListener("click", async () => {
  if (!currentPaperId) {
    setMessage("This paper is not in Library yet. Analyze with save enabled first.", "warning");
    return;
  }

  const nextSelectedIds = new Set(selectedCollectionIds());
  const toAdd = availableCollections
    .map((collection) => collection.id)
    .filter((collectionId) => nextSelectedIds.has(collectionId) && !currentCollectionIds.has(collectionId));
  const toRemove = availableCollections
    .map((collection) => collection.id)
    .filter((collectionId) => !nextSelectedIds.has(collectionId) && currentCollectionIds.has(collectionId));

  if (!toAdd.length && !toRemove.length) {
    setMessage("No collection changes to save.", "info");
    return;
  }

  setMessage("Updating collection placement...");
  try {
    await Promise.all([
      ...toAdd.map((collectionId) =>
        window.LitLab.apiFetch(`/collections/${collectionId}/papers:batchAdd`, {
          method: "POST",
          body: JSON.stringify({ paper_ids: [currentPaperId] }),
        })
      ),
      ...toRemove.map((collectionId) =>
        window.LitLab.apiFetch(`/collections/${collectionId}/papers:batchRemove`, {
          method: "POST",
          body: JSON.stringify({ paper_ids: [currentPaperId] }),
        })
      ),
    ]);
    currentCollectionIds = nextSelectedIds;
    refreshLibraryControls();
    setMessage("Collection placement updated.", "success");
  } catch (error) {
    setMessage(error.message || "Could not update collection placement.", "error");
  }
});

removeFromLibraryBtn.addEventListener("click", async () => {
  if (!currentPaperId) {
    setMessage("This paper is not saved in Library.", "warning");
    return;
  }
  const confirmed = window.confirm("Remove this paper from your Library? This also removes its collection links and notes.");
  if (!confirmed) return;

  setMessage("Removing paper from Library...");
  try {
    await window.LitLab.apiFetch(`/papers/${currentPaperId}`, { method: "DELETE" });
    applyPaperLibraryState("", []);
    persistToggleEl.checked = false;
    refreshLibraryControls();
    setMessage("Paper removed from Library.", "success");
  } catch (error) {
    setMessage(error.message || "Could not remove paper from Library.", "error");
  }
});

savePaperNicknameBtn.addEventListener("click", async () => {
  await saveNicknameFromEditor();
});

savePaperUrlBtn.addEventListener("click", async () => {
  if (!currentPaperId) {
    setMessage("Please analyze and save this paper first, then you can save URL directly.", "warning");
    return;
  }
  const url = String(paperUrlInputEl.value || "").trim();
  if (!url) {
    setMessage("Please enter a valid URL first.", "warning");
    return;
  }
  try {
    const response = await window.LitLab.apiFetch(`/papers/${currentPaperId}/url`, {
      method: "PUT",
      body: JSON.stringify({ url }),
    });
    const updatedPaper = response.paper || {};
    renderPaperMeta({ ...updatedPaper, authors: updatedPaper.authors || [] });
    renderCitations(updatedPaper);
    setMessage("Paper URL saved and synced.", "success");
  } catch (error) {
    setMessage(error.message || "Could not save URL.", "error");
  }
});

paperNicknameInputEl.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  await saveNicknameFromEditor();
});

async function saveNicknameFromEditor() {
  if (!currentPaperId) {
    setMessage("This paper is not saved yet. Enable save and analyze first.", "warning");
    return;
  }
  const nickname = String(paperNicknameInputEl.value || "").trim();
  if (!nickname) {
    setMessage("Nickname cannot be empty.", "warning");
    return;
  }
  try {
    const response = await window.LitLab.apiFetch(`/papers/${currentPaperId}/nickname`, {
      method: "PUT",
      body: JSON.stringify({ nickname }),
    });
    const updatedPaper = response.paper || {};
    renderPaperMeta({
      ...updatedPaper,
      authors: updatedPaper.authors || [],
    });
    setMessage("Nickname synced to Library.", "success");
  } catch (error) {
    setMessage(error.message || "Could not update nickname.", "error");
  }
}

citationSectionEl.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const elementId = target.dataset.copyTarget;
  if (!elementId) return;
  const sourceEl = document.getElementById(elementId);
  if (!(sourceEl instanceof HTMLElement)) return;
  const value = sourceEl.textContent || "";
  if (!value.trim()) {
    setMessage("No citation text to copy yet.", "warning");
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    setMessage("Citation copied.", "success");
  } catch (_error) {
    setMessage("Could not copy citation. Please copy manually.", "warning");
  }
});

savedSourceInfoEl.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  const action = target.dataset.sourceAction;
  if (!action) return;

  if (action === "copy-url") {
    const url = String(currentPaperData?.url || "").trim();
    if (!url) {
      setMessage("No saved URL available.", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Saved URL copied.", "success");
    } catch (_error) {
      setMessage("Could not copy URL. Please copy manually.", "warning");
    }
    return;
  }

  if (action === "download-pdf") {
    if (!currentPaperId) {
      setMessage("No saved paper selected.", "warning");
      return;
    }
    try {
      const payload = await window.LitLab.apiFetch(`/papers/${currentPaperId}/pdf-download-url`);
      const downloadUrl = payload.download_url || "";
      if (!downloadUrl) {
        setMessage("Could not get PDF download URL.", "error");
        return;
      }
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      setMessage("PDF download started.", "success");
    } catch (error) {
      setMessage(error.message || "Could not download saved PDF.", "error");
    }
  }
});

if (presetPaperId) {
  readerModeHintEl.textContent = "Reader mode: opening a paper from your library.";
  backToLibraryBtn.hidden = false;
  readExistingPaper(presetPaperId);
}

refreshLibraryControls();
loadCollections();
