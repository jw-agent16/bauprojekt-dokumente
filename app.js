const STORAGE_KEY = "bauprojekt-documents";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const uploadStatus = document.getElementById("upload-status");
const docsTbody = document.getElementById("docs-tbody");
const docCount = document.getElementById("doc-count");
const navBadge = document.getElementById("nav-badge");
const kpiTotal = document.getElementById("kpi-total");
const kpiOfferten = document.getElementById("kpi-offerten");
const kpiRechnungen = document.getElementById("kpi-rechnungen");
const kpiSize = document.getElementById("kpi-size");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");

/** @type {Array<{id: string, name: string, type: string, size: number, uploadedAt: string}>} */
let documents = loadDocuments();

renderAll();

sidebarToggle?.addEventListener("click", () => {
  document.body.classList.toggle("sidebar-open");
  sidebarBackdrop.hidden = !document.body.classList.contains("sidebar-open");
});

sidebarBackdrop?.addEventListener("click", () => {
  document.body.classList.remove("sidebar-open");
  sidebarBackdrop.hidden = true;
});

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files?.length) {
    handleFiles(fileInput.files);
    fileInput.value = "";
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
  });
});

dropzone.addEventListener("drop", (event) => {
  const files = event.dataTransfer?.files;
  if (files?.length) handleFiles(files);
});

docsTbody.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || !target.dataset.id) return;

  const doc = documents.find((item) => item.id === target.dataset.id);
  if (!doc) return;

  doc.type = target.value;
  persistDocuments();
  renderAll();
  setStatus(`Typ von „${doc.name}“ auf ${target.value} gesetzt.`);
});

docsTbody.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const button = target.closest("button[data-delete-id]");
  if (!(button instanceof HTMLButtonElement)) return;

  const id = button.dataset.deleteId;
  const doc = documents.find((item) => item.id === id);
  documents = documents.filter((item) => item.id !== id);
  persistDocuments();
  renderAll();
  setStatus(doc ? `„${doc.name}“ entfernt.` : "Dokument entfernt.");
});

/**
 * @param {FileList | File[]} fileList
 */
function handleFiles(fileList) {
  const files = Array.from(fileList);
  const pdfs = files.filter(isPdf);
  const rejected = files.length - pdfs.length;

  if (pdfs.length === 0) {
    setStatus("Nur PDF-Dateien sind erlaubt.", true);
    return;
  }

  const added = pdfs.map((file) => ({
    id: crypto.randomUUID(),
    name: file.name,
    type: guessType(file.name),
    size: file.size,
    uploadedAt: new Date().toISOString(),
  }));

  documents = [...added, ...documents];
  persistDocuments();
  renderAll();

  let message =
    added.length === 1
      ? `„${added[0].name}“ hochgeladen.`
      : `${added.length} PDFs hochgeladen.`;

  if (rejected > 0) {
    message += ` ${rejected} Datei${rejected === 1 ? "" : "en"} übersprungen (kein PDF).`;
  }

  setStatus(message, rejected > 0 && added.length === 0);
}

/**
 * @param {File} file
 */
function isPdf(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/**
 * @param {string} name
 */
function guessType(name) {
  const lower = name.toLowerCase();
  if (lower.includes("rechnung") || lower.includes("invoice")) return "Rechnung";
  if (lower.includes("offerte") || lower.includes("angebot") || lower.includes("quote")) {
    return "Offerte";
  }
  return "Offerte";
}

function renderAll() {
  renderKpis();
  renderTable();
}

function renderKpis() {
  const offerten = documents.filter((doc) => doc.type === "Offerte").length;
  const rechnungen = documents.filter((doc) => doc.type === "Rechnung").length;
  const totalSize = documents.reduce((sum, doc) => sum + doc.size, 0);

  kpiTotal.textContent = String(documents.length);
  kpiOfferten.textContent = String(offerten);
  kpiRechnungen.textContent = String(rechnungen);
  kpiSize.textContent = formatSize(totalSize);

  docCount.textContent =
    documents.length === 1 ? "1 Dokument" : `${documents.length} Dokumente`;

  if (documents.length > 0) {
    navBadge.hidden = false;
    navBadge.textContent = String(documents.length);
  } else {
    navBadge.hidden = true;
  }
}

function renderTable() {
  if (documents.length === 0) {
    docsTbody.innerHTML = `
      <tr class="empty-row">
        <td colspan="6">Noch keine Dokumente. Lade ein PDF hoch, um zu starten.</td>
      </tr>
    `;
    return;
  }

  docsTbody.innerHTML = documents
    .map((doc) => {
      const dotClass = doc.type === "Rechnung" ? "dot-rechnung" : "dot-offerte";
      return `
      <tr>
        <td>
          <div class="filename-cell">
            <span class="dot ${dotClass}" aria-hidden="true"></span>
            <span class="filename">${escapeHtml(doc.name)}</span>
          </div>
        </td>
        <td>
          <label class="visually-hidden" for="type-${doc.id}">Typ für ${escapeHtml(doc.name)}</label>
          <select class="type-select" id="type-${doc.id}" data-id="${doc.id}">
            <option value="Offerte"${doc.type === "Offerte" ? " selected" : ""}>Offerte</option>
            <option value="Rechnung"${doc.type === "Rechnung" ? " selected" : ""}>Rechnung</option>
          </select>
        </td>
        <td class="meta">${formatSize(doc.size)}</td>
        <td class="meta">${formatDate(doc.uploadedAt)}</td>
        <td><span class="status-pill">Hochgeladen</span></td>
        <td>
          <button type="button" class="btn-delete" data-delete-id="${doc.id}">
            Entfernen
          </button>
        </td>
      </tr>
    `;
    })
    .join("");
}

function persistDocuments() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
}

function loadDocuments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} message
 * @param {boolean} [isError]
 */
function setStatus(message, isError = false) {
  uploadStatus.textContent = message;
  uploadStatus.classList.toggle("is-error", isError);
}

/**
 * @param {number} bytes
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * @param {string} iso
 */
function formatDate(iso) {
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
