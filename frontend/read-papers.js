window.LitLab.requireAuth();

const paperUrlInputEl = document.getElementById("paper-url-input");
const savePaperUrlBtn = document.getElementById("save-paper-url-btn");
const pdfInputEl = document.getElementById("paper-pdf-input");
const choosePdfBtn = document.getElementById("choose-pdf-btn");
const selectedPdfNameEl = document.getElementById("selected-pdf-name");
const analyzePaperBtn = document.getElementById("analyze-paper-btn");
const paperSourcePanelEl = document.getElementById("paper-source-panel");
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
const paperNoteEditorEl = document.getElementById("paper-note-editor");
const paperNoteInputEl = document.getElementById("paper-note-input");
const savePaperNoteBtn = document.getElementById("save-paper-note-btn");
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

function notifyPdfPreviewContext() {
  const paperId = String(currentPaperId || "").trim();
  const hasStoredPdf =
    Boolean(String(currentPaperData?.pdf_storage_path || "").trim()) && Boolean(paperId);
  const localFile = pdfInputEl.files && pdfInputEl.files.length ? pdfInputEl.files[0] : null;
  const pdfDisplayName = String(
    (currentPaperData && (currentPaperData.nickname || currentPaperData.title || "").trim()) || ""
  );
  document.dispatchEvent(
    new CustomEvent("litlab:paper-context-changed", {
      detail: { paperId, hasStoredPdf, localFile, pdfDisplayName },
    })
  );
}

function paperCardTemplate(paper) {
  const authors = (paper.authors || []).join(", ") || "Unknown author";
  const abstract = paper.abstract || "No abstract available.";
  const snippet = abstract.length > 260 ? `${abstract.slice(0, 260)}...` : abstract;
  const displayName = (paper.nickname || paper.title || "Untitled paper").trim();
  return `
    <article class="card paper-card">
      <h4>${displayName}</h4>
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
    ${
      paper.url
        ? `<p><a class="outbound-link" href="${paper.url}" target="_blank" rel="noopener noreferrer">Original URL <span aria-hidden="true">↗</span></a></p>`
        : ""
    }
  `;
  renderSavedSourceInfo(paper);
  refreshLibraryControls();
  notifyPdfPreviewContext();
}

function renderSavedSourceInfo(paper) {
  const url = String(paper?.url || "").trim();
  const pdfPath = String(paper?.pdf_storage_path || "").trim();
  const lines = [];
  lines.push(`<p><strong>Saved URL:</strong> ${url || "Not saved"}</p>`);
  lines.push(`<p><strong>Saved PDF:</strong> ${pdfPath || "Not saved"}</p>`);
  const pdfButtonsDisabled = pdfPath && currentPaperId ? "" : "disabled";
  lines.push(
    `<div class="inline-actions">
      <button type="button" class="secondary" data-source-action="copy-url" ${url ? "" : "disabled"}>Copy URL</button>
      <button type="button" class="secondary" data-source-action="view-pdf" ${pdfButtonsDisabled}>View PDF</button>
      <button type="button" class="secondary" data-source-action="download-pdf" ${pdfButtonsDisabled}>Download PDF</button>
    </div>`
  );
  savedSourceInfoEl.classList.remove("muted");
  savedSourceInfoEl.innerHTML = lines.join("");
}

function applyPaperLibraryState(paperId, collectionIds = []) {
  currentPaperId = String(paperId || "").trim();
  currentCollectionIds = new Set(collectionIds);
  nicknameEditorEl.hidden = !currentPaperId;
  paperNoteEditorEl.hidden = !currentPaperId;
  if (!currentPaperId) {
    paperNoteInputEl.value = "";
  }
  syncCollectionSelectionToUi(currentCollectionIds);
  refreshLibraryControls();
  notifyPdfPreviewContext();
}

function renderPaperNote(notePayload) {
  const content = String(notePayload?.content || "");
  paperNoteInputEl.value = content;
}

async function loadPaperNote(paperId) {
  if (!paperId) {
    renderPaperNote({ content: "" });
    return;
  }
  try {
    const payload = await window.LitLab.apiFetch(`/papers/${paperId}`);
    renderPaperNote(payload.note || { content: "" });
  } catch (_error) {
    renderPaperNote({ content: "" });
  }
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
    const response = await window.LitLab.apiFetch("/collections");
    availableCollections = response.collections || [];
    if (!availableCollections.length) {
      collectionsEl.innerHTML = "<p class='muted'>No collections yet. Create one from a project or the Collections page.</p>";
      refreshLibraryControls();
      return;
    }
    collectionsEl.innerHTML = availableCollections
      .map(
        (collection) => `
          <label class="checkbox-inline mini-card">
            <input type="checkbox" data-role="collection-checkbox" value="${collection.id}" />
            <span>${collection.title}</span>
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
    renderPaperNote(paperPayload.note || { content: "" });
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
  notifyPdfPreviewContext();
});

function isPdfFile(file) {
  if (!(file instanceof File)) return false;
  const name = String(file.name || "").toLowerCase();
  return file.type === "application/pdf" || name.endsWith(".pdf");
}

function extractHttpUrlFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return "";
  const uriList = dataTransfer.getData("text/uri-list") || "";
  const uriLine = uriList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  if (uriLine) {
    try {
      const parsed = new URL(uriLine);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
    } catch (_err) {
      // fall through
    }
  }
  const plain = (dataTransfer.getData("text/plain") || "").trim();
  if (!plain) return "";
  const firstLine = plain.split(/\r?\n/)[0].trim();
  try {
    const parsed = new URL(firstLine);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.href;
  } catch (_err) {
    return "";
  }
  return "";
}

function setPaperSourceDragHighlight(on) {
  if (!paperSourcePanelEl) return;
  paperSourcePanelEl.classList.toggle("paper-source--drag-over", Boolean(on));
}

if (paperSourcePanelEl) {
  paperSourcePanelEl.addEventListener("dragenter", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setPaperSourceDragHighlight(true);
  });

  paperSourcePanelEl.addEventListener("dragleave", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (
      event.relatedTarget instanceof Node &&
      paperSourcePanelEl.contains(event.relatedTarget)
    ) {
      return;
    }
    setPaperSourceDragHighlight(false);
  });

  paperSourcePanelEl.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  });

  paperSourcePanelEl.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setPaperSourceDragHighlight(false);

    const dt = event.dataTransfer;
    if (!dt) return;

    const droppedFile = dt.files && dt.files.length ? dt.files[0] : null;
    if (droppedFile && isPdfFile(droppedFile)) {
      try {
        const out = new DataTransfer();
        out.items.add(droppedFile);
        pdfInputEl.files = out.files;
        pdfInputEl.dispatchEvent(new Event("change", { bubbles: true }));
        setMessage(`PDF "${droppedFile.name}" ready. Click Start Analyze when you're ready.`, "success");
      } catch (_err) {
        setMessage("Could not attach the dropped PDF. Try Choose File instead.", "warning");
      }
      return;
    }
    if (droppedFile && !isPdfFile(droppedFile)) {
      setMessage("Only PDF files can be dropped here for upload.", "warning");
      return;
    }

    const url = extractHttpUrlFromDataTransfer(dt);
    if (url) {
      paperUrlInputEl.value = url;
      setMessage("URL loaded from drop. Click Start Analyze below to run analysis.", "success");
      if (typeof paperUrlInputEl.scrollIntoView === "function") {
        paperUrlInputEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      paperUrlInputEl.focus({ preventScroll: true });
      return;
    }

    setMessage("Drop a PDF file or a web link (http/https) onto Paper Source.", "warning");
  });
}

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
      await loadPaperNote(savedPaperId);
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

savePaperNoteBtn.addEventListener("click", async () => {
  if (!currentPaperId) {
    setMessage("This paper is not saved yet. Enable save and analyze first.", "warning");
    return;
  }
  try {
    const content = String(paperNoteInputEl.value || "");
    await window.LitLab.apiFetch(`/papers/${currentPaperId}/note`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    });
    setMessage("Personal notes saved.", "success");
  } catch (error) {
    setMessage(error.message || "Could not save notes.", "error");
  }
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
    window.LitLab.showToast("Copied");
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
      window.LitLab.showToast("Copied");
    } catch (_error) {
      setMessage("Could not copy URL. Please copy manually.", "warning");
    }
    return;
  }

  if (action === "view-pdf") {
    if (!currentPaperId) {
      setMessage("No saved paper selected.", "warning");
      return;
    }
    try {
      const payload = await window.LitLab.apiFetch(
        `/papers/${currentPaperId}/pdf-download-url?mode=view`
      );
      const viewUrl = payload.download_url || "";
      if (!viewUrl) {
        setMessage("Could not get PDF view URL.", "error");
        return;
      }
      window.open(viewUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage(error.message || "Could not open saved PDF.", "error");
    }
    return;
  }

  if (action === "download-pdf") {
    if (!currentPaperId) {
      setMessage("No saved paper selected.", "warning");
      return;
    }
    try {
      const payload = await window.LitLab.apiFetch(
        `/papers/${currentPaperId}/pdf-download-url?mode=download`
      );
      const downloadUrl = payload.download_url || "";
      if (!downloadUrl) {
        setMessage("Could not get PDF download URL.", "error");
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.rel = "noopener noreferrer";
      anchor.target = "_blank";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setMessage("PDF download started.", "success");
    } catch (error) {
      setMessage(error.message || "Could not download saved PDF.", "error");
    }
  }
});

const publicSearchInputEl = document.getElementById("public-search-input");
const publicSearchBtn = document.getElementById("public-search-btn");
const publicSearchStatusEl = document.getElementById("public-search-status");
const publicSearchResultsEl = document.getElementById("public-search-results");
let publicSearchSelectedId = "";

function setPublicSearchStatus(text, tone = "muted") {
  publicSearchStatusEl.textContent = text;
  publicSearchStatusEl.className = tone === "error" ? "message error" : "muted";
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function publicResultCardTemplate(paper, index) {
  const authors = (paper.authors || []).join(", ") || "Unknown author";
  const abstract = paper.abstract || "No abstract available.";
  const snippet = abstract.length > 260 ? `${abstract.slice(0, 260)}...` : abstract;
  const displayTitle = paper.title || "Untitled paper";
  const year = paper.year ? ` · ${paper.year}` : "";
  const source = paper.source || "Semantic Scholar";
  const resultKey = String(paper.external_paper_id || paper.url || `idx-${index}`);
  const hasUrl = Boolean(paper.url);
  return `
    <article class="card paper-card" data-result-key="${escapeHtml(resultKey)}">
      <h4>${escapeHtml(displayTitle)}</h4>
      <p class="muted">${escapeHtml(authors)}${escapeHtml(year)} · ${escapeHtml(source)}</p>
      <p>${escapeHtml(snippet)}</p>
      <div class="paper-actions">
        <button
          type="button"
          data-action="use-url"
          data-url="${escapeHtml(paper.url || "")}"
          data-title="${escapeHtml(displayTitle)}"
          ${hasUrl ? "" : "disabled"}
        >Use this URL</button>
        ${
          hasUrl
            ? `<a class="secondary button" href="${escapeHtml(paper.url)}" target="_blank" rel="noopener noreferrer">Open</a>`
            : ""
        }
      </div>
    </article>
  `;
}

function highlightSelectedPublicResult() {
  const cards = publicSearchResultsEl.querySelectorAll(".paper-card");
  cards.forEach((card) => {
    const key = card.getAttribute("data-result-key") || "";
    if (publicSearchSelectedId && key === publicSearchSelectedId) {
      card.classList.add("is-selected");
    } else {
      card.classList.remove("is-selected");
    }
  });
}

async function runPublicPaperSearch() {
  const query = String(publicSearchInputEl.value || "").trim();
  if (!query) {
    setPublicSearchStatus("Enter a keyword to search public papers.", "error");
    return;
  }
  setPublicSearchStatus(`Searching public papers for "${query}"...`);
  publicSearchResultsEl.innerHTML = "";
  publicSearchBtn.disabled = true;
  try {
    const response = await window.LitLab.apiFetch(
      `/papers/search?q=${encodeURIComponent(query)}`
    );
    const papers = (response && response.papers) || [];
    if (!papers.length) {
      publicSearchResultsEl.innerHTML = "";
      setPublicSearchStatus(`No public papers found for "${query}".`);
      return;
    }
    publicSearchResultsEl.innerHTML = papers
      .map((paper, index) => publicResultCardTemplate(paper, index))
      .join("");
    highlightSelectedPublicResult();
    setPublicSearchStatus(
      `Showing ${papers.length} public paper${papers.length === 1 ? "" : "s"} for "${query}". Click "Use this URL" to fill the source field below.`
    );
  } catch (error) {
    publicSearchResultsEl.innerHTML = "";
    const rawMessage = String(error && error.message ? error.message : "");
    const isRateLimited =
      (error && error.status === 429) ||
      /429|rate[- ]?limit|too many requests/i.test(rawMessage);
    let friendly;
    if (isRateLimited) {
      friendly =
        "Semantic Scholar is rate-limiting public searches right now. Please wait ~10 seconds and try again.";
    } else if (rawMessage) {
      // Trim overly long upstream URLs so the error box stays readable.
      friendly = rawMessage.length > 200 ? `${rawMessage.slice(0, 200)}...` : rawMessage;
    } else {
      friendly = "Public paper search failed.";
    }
    setPublicSearchStatus(friendly, "error");
  } finally {
    publicSearchBtn.disabled = false;
  }
}

publicSearchBtn.addEventListener("click", () => {
  runPublicPaperSearch();
});

publicSearchInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    runPublicPaperSearch();
  }
});

publicSearchResultsEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.dataset.action !== "use-url") return;
  const url = String(target.dataset.url || "").trim();
  const title = String(target.dataset.title || "").trim();
  if (!url) {
    setPublicSearchStatus("This result has no public URL.", "error");
    return;
  }
  paperUrlInputEl.value = url;
  const card = target.closest(".paper-card");
  publicSearchSelectedId = card ? card.getAttribute("data-result-key") || "" : "";
  highlightSelectedPublicResult();
  setMessage(
    `URL loaded${title ? `: ${title}` : ""}. Click "Start Analyze" below to add it to your library.`,
    "success"
  );
  setPublicSearchStatus(
    `Selected "${title || url}". The URL is filled in the Paper Source field below.`
  );
  if (typeof paperUrlInputEl.scrollIntoView === "function") {
    paperUrlInputEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  paperUrlInputEl.focus({ preventScroll: true });
});

if (presetPaperId) {
  readerModeHintEl.textContent = "Reader mode: opening a paper from your library.";
  backToLibraryBtn.hidden = false;
  readExistingPaper(presetPaperId);
}

refreshLibraryControls();
loadCollections();
notifyPdfPreviewContext();
