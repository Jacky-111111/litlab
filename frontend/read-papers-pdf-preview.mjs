/**
 * Inline PDF preview for Read Papers (PDF.js). Listens for `litlab:paper-context-changed`.
 * Supports a bottom panel and an optional inline panel beside Analysis Result.
 */
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.mjs";

const PDFJS_VERSION = "4.4.168";
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.mjs`;

function getApiConfig() {
  const apiBaseUrl =
    (window.LitLab && window.LitLab.LitLabConfig && window.LitLab.LitLabConfig.apiBaseUrl) || "http://127.0.0.1:8000";
  const getToken = () =>
    (window.LitLab && typeof window.LitLab.getAccessToken === "function" && window.LitLab.getAccessToken()) ||
    localStorage.getItem("litlab_access_token") ||
    "";
  return { apiBaseUrl, getToken };
}

async function fetchSignedPdfUrl(paperId, mode) {
  const { apiBaseUrl, getToken } = getApiConfig();
  const token = getToken();
  if (!token) {
    throw new Error("Sign in to preview the saved PDF.");
  }
  const res = await fetch(
    `${apiBaseUrl}/papers/${encodeURIComponent(paperId)}/pdf-download-url?mode=${mode}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );
  if (!res.ok) {
    let detail = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      if (body.detail) {
        detail = Array.isArray(body.detail)
          ? body.detail
              .map((x) => (x && typeof x === "object" && x.msg ? String(x.msg) : String(x)))
              .join("; ")
          : String(body.detail);
      }
    } catch (_e) {
      // ignore
    }
    throw new Error(detail);
  }
  const data = await res.json();
  const url = data.download_url || "";
  if (!url) throw new Error("No PDF URL returned.");
  return url;
}

/** @type {{ paperId: string; hasStoredPdf: boolean; localFile: File | null; pdfDisplayName: string }} */
let context = { paperId: "", hasStoredPdf: false, localFile: null, pdfDisplayName: "" };

/** @type {ReturnType<typeof createPdfPreview>[]} */
const previewInstances = [];

function canPreview() {
  if (context.hasStoredPdf && context.paperId) return true;
  if (context.localFile instanceof File) return true;
  return false;
}

function resolvedPdfFileLabel() {
  if (context.hasStoredPdf && context.paperId) {
    const baseName = context.pdfDisplayName || "Paper";
    return baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
  }
  if (context.localFile instanceof File) {
    return context.localFile.name || "document.pdf";
  }
  return "";
}

/**
 * @param {HTMLElement} root
 * @param {{ scrollIntoViewOnExpand?: boolean; bindToggleClick?: boolean }} [options]
 */
function createPdfPreview(root, options = {}) {
  const { scrollIntoViewOnExpand = true, bindToggleClick = true } = options;
  /** @param {string} name */
  const $ = (name) => root.querySelector(`[data-pdf-preview="${name}"]`);

  const panelEl = root;
  const headMetaEl = /** @type {HTMLElement | null} */ ($("head-meta"));
  const toggleBtn = /** @type {HTMLButtonElement | null} */ ($("toggle"));
  const previewBodyEl = /** @type {HTMLElement | null} */ ($("body"));
  const filenameEl = /** @type {HTMLElement | null} */ ($("filename"));
  const downloadWrap = /** @type {HTMLElement | null} */ ($("download-wrap"));
  const downloadLink = /** @type {HTMLAnchorElement | null} */ ($("download-link"));
  const statusEl = /** @type {HTMLElement | null} */ ($("status"));
  const stageEl = /** @type {HTMLElement | null} */ ($("stage"));
  const canvas = /** @type {HTMLCanvasElement | null} */ ($("canvas"));
  const pagePrev = /** @type {HTMLButtonElement | null} */ ($("page-prev"));
  const pageNext = /** @type {HTMLButtonElement | null} */ ($("page-next"));
  const pageInput = /** @type {HTMLInputElement | null} */ ($("page-input"));
  const pageCountEl = /** @type {HTMLElement | null} */ ($("page-count"));
  const zoomOutBtn = /** @type {HTMLButtonElement | null} */ ($("zoom-out"));
  const zoomInBtn = /** @type {HTMLButtonElement | null} */ ($("zoom-in"));
  const zoomLabel = /** @type {HTMLElement | null} */ ($("zoom-label"));
  const rotateBtn = /** @type {HTMLButtonElement | null} */ ($("rotate"));
  const fsBtn = /** @type {HTMLButtonElement | null} */ ($("fullscreen"));

  let pdfDoc = null;
  let renderTask = null;
  let objectUrl = null;
  let currentPageNum = 1;
  let scale = 1.25;
  let rotation = 0;

  function syncHeadMetaVisibility() {
    const has = canPreview();
    if (panelEl) {
      panelEl.classList.toggle("read-papers-pdf-preview--has-source", has);
    }
    if (headMetaEl) {
      headMetaEl.hidden = !has;
    }
    if (filenameEl) {
      filenameEl.textContent = has ? resolvedPdfFileLabel() || "PDF" : "";
    }
    if (!isPreviewExpanded() && downloadWrap) {
      downloadWrap.hidden = true;
    }
  }

  function setStatus(text, tone = "info") {
    if (!statusEl) return;
    if (!text) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = text;
    statusEl.className = `message ${tone}`;
  }

  function syncViewButton() {
    if (!toggleBtn) return;
    const ok = canPreview();
    toggleBtn.disabled = !ok;
    toggleBtn.title = ok ? "" : "Save a PDF to this paper or choose a PDF file above.";
  }

  function setExpandedUi(isExpanded) {
    if (panelEl) {
      panelEl.classList.toggle("read-papers-pdf-preview--expanded", isExpanded);
    }
    if (previewBodyEl) {
      previewBodyEl.hidden = !isExpanded;
    }
    if (toggleBtn) {
      toggleBtn.textContent = isExpanded ? "Show Less" : "View PDF";
      toggleBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    }
    syncHeadMetaVisibility();
  }

  function isPreviewExpanded() {
    return Boolean(previewBodyEl && !previewBodyEl.hidden);
  }

  function updateZoomLabel() {
    if (zoomLabel) zoomLabel.textContent = `${Math.round(scale * 100)}%`;
  }

  function updatePageUi() {
    const total = pdfDoc ? pdfDoc.numPages : 0;
    if (pageInput) {
      pageInput.max = String(Math.max(1, total));
      pageInput.value = String(currentPageNum);
    }
    if (pageCountEl) pageCountEl.textContent = total ? `of ${total}` : "of 0";
    if (pagePrev) pagePrev.disabled = currentPageNum <= 1;
    if (pageNext) pageNext.disabled = !pdfDoc || currentPageNum >= total;
  }

  async function renderCurrentPage() {
    if (!pdfDoc || !canvas) return;
    if (renderTask) {
      try {
        renderTask.cancel();
      } catch (_e) {
        // ignore
      }
      renderTask = null;
    }

    const page = await pdfDoc.getPage(currentPageNum);
    const viewport = page.getViewport({ scale, rotation });
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    renderTask = page.render({
      canvasContext: ctx,
      viewport,
    });
    try {
      await renderTask.promise;
    } catch (e) {
      if (e && e.name === "RenderingCancelledException") return;
      throw e;
    } finally {
      renderTask = null;
    }
  }

  async function openPdfFromUrl(url, displayName) {
    if (renderTask) {
      try {
        renderTask.cancel();
      } catch (_e) {
        // ignore
      }
      renderTask = null;
    }
    if (pdfDoc) {
      try {
        await pdfDoc.destroy();
      } catch (_e) {
        // ignore
      }
      pdfDoc = null;
    }
    const loadingTask = pdfjsLib.getDocument({ url, withCredentials: false });
    pdfDoc = await loadingTask.promise;
    currentPageNum = 1;
    if (filenameEl) filenameEl.textContent = displayName || "PDF";
    updatePageUi();
    await renderCurrentPage();
  }

  async function openPdfFromFile(file) {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    objectUrl = URL.createObjectURL(file);
    await openPdfFromUrl(objectUrl, file.name || "uploaded.pdf");
  }

  async function teardownPdf() {
    if (renderTask) {
      try {
        renderTask.cancel();
      } catch (_e) {
        // ignore
      }
      renderTask = null;
    }
    if (pdfDoc) {
      try {
        await pdfDoc.destroy();
      } catch (_e) {
        // ignore
      }
      pdfDoc = null;
    }
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 0;
      canvas.height = 0;
    }
    currentPageNum = 1;
    scale = 1.25;
    rotation = 0;
    updateZoomLabel();
    updatePageUi();
  }

  function setDownloadUi(filename, href) {
    if (!downloadWrap || !downloadLink) return;
    if (!href) {
      downloadWrap.hidden = true;
      downloadLink.removeAttribute("href");
      downloadLink.textContent = "";
      return;
    }
    downloadWrap.hidden = false;
    downloadLink.href = href;
    downloadLink.textContent = filename ? `Download ${filename}` : "Download PDF";
  }

  async function expandAndLoad() {
    if (!canPreview()) return;

    setExpandedUi(true);
    setStatus("Loading PDF…", "info");

    try {
      if (context.hasStoredPdf && context.paperId) {
        const viewUrl = await fetchSignedPdfUrl(context.paperId, "view");
        let downloadUrl = "";
        try {
          downloadUrl = await fetchSignedPdfUrl(context.paperId, "download");
        } catch (_e) {
          downloadUrl = viewUrl;
        }
        const baseName = context.pdfDisplayName || "Paper";
        const displayName = baseName.toLowerCase().endsWith(".pdf") ? baseName : `${baseName}.pdf`;
        setDownloadUi(displayName, downloadUrl || viewUrl);

        await openPdfFromUrl(viewUrl, displayName);
      } else if (context.localFile instanceof File) {
        await openPdfFromFile(context.localFile);
        const name = context.localFile.name || "document.pdf";
        if (objectUrl) {
          setDownloadUi(name, objectUrl);
          downloadLink?.setAttribute("download", name);
        }
      }
      setStatus("", "info");
      if (scrollIntoViewOnExpand) {
        panelEl?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (err) {
      const msg = err && err.message ? err.message : "Could not load PDF.";
      setStatus(msg, "error");
      await teardownPdf();
      setDownloadUi("", "");
    }
  }

  async function collapse() {
    setExpandedUi(false);
    setStatus("", "info");
    await teardownPdf();
    setDownloadUi("", "");
    if (downloadLink) downloadLink.removeAttribute("download");
  }

  function syncAfterContextChange() {
    syncViewButton();
    syncHeadMetaVisibility();
    if (isPreviewExpanded() && !canPreview()) {
      void collapse();
    }
  }

  if (bindToggleClick && toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (isPreviewExpanded()) {
        void collapse();
      } else {
        void expandAndLoad();
      }
    });
  }

  pagePrev?.addEventListener("click", async () => {
    if (currentPageNum <= 1) return;
    currentPageNum -= 1;
    updatePageUi();
    await renderCurrentPage();
  });

  pageNext?.addEventListener("click", async () => {
    if (!pdfDoc || currentPageNum >= pdfDoc.numPages) return;
    currentPageNum += 1;
    updatePageUi();
    await renderCurrentPage();
  });

  pageInput?.addEventListener("change", async () => {
    if (!pdfDoc) return;
    let n = parseInt(String(pageInput.value), 10);
    if (Number.isNaN(n)) n = 1;
    n = Math.min(Math.max(1, n), pdfDoc.numPages);
    currentPageNum = n;
    updatePageUi();
    await renderCurrentPage();
  });

  zoomOutBtn?.addEventListener("click", async () => {
    scale = Math.max(0.5, Math.round((scale - 0.15) * 100) / 100);
    updateZoomLabel();
    await renderCurrentPage();
  });

  zoomInBtn?.addEventListener("click", async () => {
    scale = Math.min(3, Math.round((scale + 0.15) * 100) / 100);
    updateZoomLabel();
    await renderCurrentPage();
  });

  rotateBtn?.addEventListener("click", async () => {
    rotation = (rotation + 90) % 360;
    await renderCurrentPage();
  });

  fsBtn?.addEventListener("click", () => {
    const el = stageEl || root.querySelector('[data-pdf-preview="canvas-wrap"]');
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  });

  updateZoomLabel();

  return {
    expandAndLoad,
    collapse,
    isPreviewExpanded,
    syncAfterContextChange,
    syncViewButton,
    syncHeadMetaVisibility,
  };
}

function setAnalysisSideTabExpanded(isExpanded) {
  const tab = document.getElementById("analysis-pdf-side-tab");
  if (!tab) return;
  const label = tab.querySelector(".analysis-pdf-side-tab__label");
  if (label) {
    label.textContent = isExpanded ? "Show Less" : "View PDF";
  }
  tab.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  tab.setAttribute(
    "aria-label",
    isExpanded ? "Show Less — close PDF beside analysis" : "View PDF beside analysis"
  );
}

function closeAnalysisSplitUi() {
  const tab = document.getElementById("analysis-pdf-side-tab");
  const shell = document.getElementById("read-papers-analysis-shell");
  const inlinePanel = document.getElementById("read-papers-inline-pdf-panel");
  shell?.classList.remove("read-papers-analysis-shell--open");
  if (inlinePanel) {
    inlinePanel.setAttribute("hidden", "");
  }
  setAnalysisSideTabExpanded(false);
}

function syncAnalysisSideTab() {
  const tab = document.getElementById("analysis-pdf-side-tab");
  if (!tab) return;
  const ok = canPreview();
  tab.disabled = !ok;
  const shell = document.getElementById("read-papers-analysis-shell");
  const isOpen = Boolean(shell?.classList.contains("read-papers-analysis-shell--open"));
  tab.title = !ok
    ? "Save a PDF to this paper or choose a PDF file above."
    : isOpen
      ? "Show Less — close PDF beside analysis"
      : "Open PDF beside analysis (same as bottom View PDF)";
  setAnalysisSideTabExpanded(ok && isOpen);
}

/**
 * @param {ReturnType<typeof createPdfPreview>} inlinePreview
 */
function wireAnalysisSideTab(inlinePreview) {
  const tab = document.getElementById("analysis-pdf-side-tab");
  const shell = document.getElementById("read-papers-analysis-shell");
  const inlinePanel = document.getElementById("read-papers-inline-pdf-panel");
  if (!tab || !shell || !inlinePanel) return;

  tab.addEventListener("click", () => {
    if (tab.disabled) return;
    const willOpen = !shell.classList.contains("read-papers-analysis-shell--open");
    if (willOpen) {
      shell.classList.add("read-papers-analysis-shell--open");
      inlinePanel.removeAttribute("hidden");
      setAnalysisSideTabExpanded(true);
      void inlinePreview.expandAndLoad();
    } else {
      shell.classList.remove("read-papers-analysis-shell--open");
      setAnalysisSideTabExpanded(false);
      void inlinePreview.collapse();
      inlinePanel.setAttribute("hidden", "");
    }
  });
}

function onContextChanged(ev) {
  const d = ev.detail || {};
  context = {
    paperId: String(d.paperId || "").trim(),
    hasStoredPdf: Boolean(d.hasStoredPdf),
    localFile: d.localFile instanceof File ? d.localFile : null,
    pdfDisplayName: String(d.pdfDisplayName || "").trim(),
  };

  if (!canPreview()) {
    closeAnalysisSplitUi();
  }

  for (const inst of previewInstances) {
    inst.syncAfterContextChange();
  }
  syncAnalysisSideTab();
}

const bottomRoot = document.getElementById("paper-pdf-preview-panel");
const inlineRoot = document.getElementById("read-papers-inline-pdf-panel");

if (bottomRoot) {
  previewInstances.push(createPdfPreview(bottomRoot, { scrollIntoViewOnExpand: true, bindToggleClick: true }));
}
if (inlineRoot) {
  const inline = createPdfPreview(inlineRoot, { scrollIntoViewOnExpand: false, bindToggleClick: false });
  previewInstances.push(inline);
  wireAnalysisSideTab(inline);
}

document.addEventListener("litlab:paper-context-changed", onContextChanged);

for (const inst of previewInstances) {
  inst.syncViewButton();
  inst.syncHeadMetaVisibility();
}
syncAnalysisSideTab();
