window.LitLab.requireAuth();

const urlFormEl = document.getElementById("url-form");
const pdfFormEl = document.getElementById("pdf-form");
const pdfInputEl = document.getElementById("paper-pdf-input");
const choosePdfBtn = document.getElementById("choose-pdf-btn");
const selectedPdfNameEl = document.getElementById("selected-pdf-name");
const messageEl = document.getElementById("read-papers-message");
const paperMetaEl = document.getElementById("paper-meta");
const analysisOutputEl = document.getElementById("analysis-output");
const relatedQueryEl = document.getElementById("related-query");
const relatedPapersEl = document.getElementById("related-papers");

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
  const authors = (paper.authors || []).join(", ") || "Unknown";
  paperMetaEl.classList.remove("muted");
  paperMetaEl.innerHTML = `
    <strong>${paper.title || "Untitled paper"}</strong>
    <p>Authors: ${authors}</p>
    <p>Year: ${paper.year || "Unknown"}</p>
    <p>Source: ${paper.source || "Unknown"}</p>
    ${paper.url ? `<p><a href="${paper.url}" target="_blank" rel="noopener noreferrer">Original URL</a></p>` : ""}
  `;
}

function renderAnalysisResponse(payload) {
  renderPaperMeta(payload.paper || {});
  analysisOutputEl.textContent = payload.analysis || "No analysis returned.";
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

urlFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(urlFormEl);
  const url = String(formData.get("paper_url") || "").trim();
  if (!url) {
    setMessage("Please provide a paper URL.", "warning");
    return;
  }

  setMessage("Analyzing paper URL...");
  analysisOutputEl.textContent = "Analyzing...";
  relatedPapersEl.innerHTML = "";
  try {
    const payload = await window.LitLab.apiFetch("/ai/read-paper/url", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
    renderAnalysisResponse(payload);
    setMessage("URL analysis completed.", "success");
  } catch (error) {
    analysisOutputEl.textContent = "";
    relatedPapersEl.innerHTML = "";
    setMessage(error.message || "Could not analyze URL.", "error");
  }
});

pdfFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = pdfInputEl.files && pdfInputEl.files.length ? pdfInputEl.files[0] : null;
  if (!(file instanceof File)) {
    setMessage("Please choose a PDF file.", "warning");
    return;
  }

  setMessage("Uploading PDF and generating analysis...");
  analysisOutputEl.textContent = "Analyzing PDF...";
  relatedPapersEl.innerHTML = "";
  try {
    const pdfBase64 = await fileToBase64(file);
    const payload = await window.LitLab.apiFetch("/ai/read-paper/pdf", {
      method: "POST",
      body: JSON.stringify({
        filename: file.name || "uploaded.pdf",
        pdf_base64: pdfBase64,
      }),
    });
    renderAnalysisResponse(payload);
    setMessage("PDF analysis completed.", "success");
  } catch (error) {
    analysisOutputEl.textContent = "";
    relatedPapersEl.innerHTML = "";
    setMessage(error.message || "Could not analyze PDF.", "error");
  }
});
