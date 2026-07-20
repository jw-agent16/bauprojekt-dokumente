const STORAGE_KEY = "bauprojekt-documents";
const TYPE_OVERRIDES_KEY = "bauprojekt-type-overrides";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const uploadStatus = document.getElementById("upload-status");
const docPicker = document.getElementById("doc-picker");
const docCount = document.getElementById("doc-count");
const docDetail = document.getElementById("doc-detail");
const docEmptyHint = document.getElementById("doc-empty-hint");
const docDetailName = document.getElementById("doc-detail-name");
const docDetailMeta = document.getElementById("doc-detail-meta");
const docDetailType = document.getElementById("doc-detail-type");
const docDetailOpen = document.getElementById("doc-detail-open");
const docDetailDelete = document.getElementById("doc-detail-delete");
const docDetailStatus = document.getElementById("doc-detail-status");
const navBadge = document.getElementById("nav-badge");
const kpiTotal = document.getElementById("kpi-total");
const kpiOfferten = document.getElementById("kpi-offerten");
const kpiRechnungen = document.getElementById("kpi-rechnungen");
const kpiSonstige = document.getElementById("kpi-sonstige");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const driveStatus = document.getElementById("drive-status");
const driveSyncBtn = document.getElementById("drive-sync-btn");
const docExtract = document.getElementById("doc-extract");
const docExtractFirma = document.getElementById("doc-extract-firma");
const docExtractDatum = document.getElementById("doc-extract-datum");
const docExtractBetrag = document.getElementById("doc-extract-betrag");
const docExtractKurz = document.getElementById("doc-extract-kurzbeschrieb");
const pdfViewer = document.getElementById("pdf-viewer");
const pdfViewerStatus = document.getElementById("pdf-viewer-status");
const pdfFrame = document.getElementById("pdf-frame");

/** @type {Array<{id: string, name: string, type: string, size: number, uploadedAt: string, source?: string, webViewLink?: string}>} */
let localDocuments = loadLocalDocuments();
/** @type {Array<{id: string, name: string, type: string, size: number, uploadedAt: string, source: string, webViewLink?: string, driveFileId?: string}>} */
let driveDocuments = [];
/** @type {Record<string, string>} */
let typeOverrides = loadTypeOverrides();
/** @type {Map<string, File>} */
const localFileBlobs = new Map();
/** @type {string | null} */
let activeObjectUrl = null;
/** @type {number} */
let pdfLoadToken = 0;

renderAll();
syncDriveFiles();
initNavigation();

const VIEW_META = {
  cockpit: { title: "Cockpit", crumb: "Übersicht" },
  projekt: { title: "Projekt", crumb: "Details" },
  finanzen: { title: "Finanzen", crumb: "Übersicht" },
  dokumente: { title: "Dokumente", crumb: "Offerten & Rechnungen" },
  account: { title: "Account", crumb: "Profil" },
  support: { title: "Support", crumb: "Hilfe" },
  einstellungen: { title: "Einstellungen", crumb: "Allgemein" },
};

function initNavigation() {
  const links = document.querySelectorAll(".nav-link[data-view]");
  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const view = link.dataset.view;
      if (!view) return;
      showView(view);
      history.replaceState(null, "", `#${view}`);
      document.body.classList.remove("sidebar-open");
      if (sidebarBackdrop) sidebarBackdrop.hidden = true;
    });
  });

  const brand = document.querySelector(".brand");
  brand?.addEventListener("click", (event) => {
    event.preventDefault();
    showView("dokumente");
    history.replaceState(null, "", "#dokumente");
  });

  const initial = (location.hash || "#dokumente").replace("#", "");
  showView(VIEW_META[initial] ? initial : "dokumente");
}

/**
 * @param {string} viewId
 */
function showView(viewId) {
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    const active = panel.getAttribute("data-view-panel") === viewId;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });

  document.querySelectorAll(".nav-link[data-view]").forEach((link) => {
    const active = link.dataset.view === viewId;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  const meta = VIEW_META[viewId] || VIEW_META.dokumente;
  const crumbSection = document.getElementById("crumb-section");
  const crumbPage = document.getElementById("crumb-page");
  if (crumbSection) crumbSection.textContent = meta.title;
  if (crumbPage) crumbPage.textContent = meta.crumb;
  document.title = `Bauprojekt S9 — ${meta.title}`;
}

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

docPicker?.addEventListener("change", () => {
  renderSelectedDocument();
});

docDetailType?.addEventListener("change", () => {
  const id = docPicker.value;
  if (!id) return;

  const localDoc = localDocuments.find((item) => item.id === id);
  if (localDoc) {
    localDoc.type = docDetailType.value;
    persistLocalDocuments();
  } else {
    typeOverrides[id] = docDetailType.value;
    persistTypeOverrides();
    const driveDoc = driveDocuments.find((item) => item.id === id);
    if (driveDoc) driveDoc.type = docDetailType.value;
  }

  renderKpis();
  renderSelectedDocument();
  const option = Array.from(docPicker.options).find((item) => item.value === id);
  const doc = getAllDocuments().find((item) => item.id === id);
  if (option && doc) {
    option.textContent = `${doc.name} · ${doc.type}`;
  }
  setStatus(`Typ auf ${docDetailType.value} gesetzt.`);
});

docDetailDelete?.addEventListener("click", () => {
  const id = docPicker.value;
  if (!id) return;
  const doc = localDocuments.find((item) => item.id === id);
  if (!doc) return;
  localFileBlobs.delete(id);
  localDocuments = localDocuments.filter((item) => item.id !== id);
  persistLocalDocuments();
  clearPdfViewer();
  renderAll();
  setStatus(`„${doc.name}“ entfernt.`);
});

driveSyncBtn?.addEventListener("click", () => syncDriveFiles());

function clearPdfViewer() {
  pdfLoadToken += 1;
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
  if (pdfFrame) {
    pdfFrame.hidden = true;
    pdfFrame.removeAttribute("src");
  }
  if (pdfViewer) pdfViewer.hidden = true;
  if (pdfViewerStatus) pdfViewerStatus.textContent = "";
}

/**
 * @param {{ source?: string, driveFileId?: string, id: string } | null | undefined} doc
 */
async function showPdfPreview(doc) {
  clearPdfViewer();
  if (!doc || !pdfViewer || !pdfFrame || !pdfViewerStatus) return;

  pdfViewer.hidden = false;
  const token = pdfLoadToken;

  if (doc.source === "local") {
    const file = localFileBlobs.get(doc.id);
    if (!file) {
      pdfViewerStatus.textContent =
        "Vorschau für lokale Dateien nur direkt nach dem Upload.";
      return;
    }
    const url = URL.createObjectURL(file);
    if (token !== pdfLoadToken) {
      URL.revokeObjectURL(url);
      return;
    }
    activeObjectUrl = url;
    pdfFrame.hidden = false;
    pdfFrame.src = url;
    pdfViewerStatus.textContent = "";
    return;
  }

  if (doc.source === "drive" && doc.driveFileId) {
    pdfViewerStatus.textContent = "Lade PDF…";
    try {
      const response = await fetch(
        `/api/pdf?id=${encodeURIComponent(doc.driveFileId)}`,
        { cache: "no-store" }
      );
      const contentType = response.headers.get("content-type") || "";

      if (!response.ok || contentType.includes("application/json")) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      const blob = await response.blob();
      if (token !== pdfLoadToken) return;

      const url = URL.createObjectURL(blob);
      activeObjectUrl = url;
      pdfFrame.hidden = false;
      pdfFrame.src = url;
      pdfViewerStatus.textContent = "";
    } catch (error) {
      if (token !== pdfLoadToken) return;
      const message = error instanceof Error ? error.message : String(error);
      pdfViewerStatus.textContent = `Vorschau fehlgeschlagen: ${message}`;
    }
    return;
  }

  pdfViewerStatus.textContent = "Keine Vorschau verfügbar.";
}

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

  const added = pdfs.map((file) => {
    const id = crypto.randomUUID();
    localFileBlobs.set(id, file);
    return {
      id,
      name: file.name,
      type: guessType(file.name),
      size: file.size,
      uploadedAt: new Date().toISOString(),
      source: "local",
    };
  });

  localDocuments = [...added, ...localDocuments];
  persistLocalDocuments();
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
  if (lower.includes("rechnung") || lower.includes("invoice") || lower.includes("faktura")) {
    return "Rechnung";
  }
  if (
    lower.includes("offerte") ||
    lower.includes("angebot") ||
    lower.includes("quote") ||
    lower.includes("kostenvoranschlag")
  ) {
    return "Offerte";
  }
  return "Sonstige";
}

function getAllDocuments() {
  return [...driveDocuments, ...localDocuments];
}

function renderAll() {
  renderKpis();
  renderDocumentPicker();
  renderSelectedDocument();
}

function renderKpis() {
  const documents = getAllDocuments();
  const offerten = documents.filter((doc) => doc.type === "Offerte").length;
  const rechnungen = documents.filter((doc) => doc.type === "Rechnung").length;
  const sonstige = documents.filter((doc) => doc.type === "Sonstige").length;

  kpiTotal.textContent = String(documents.length);
  kpiOfferten.textContent = String(offerten);
  kpiRechnungen.textContent = String(rechnungen);
  kpiSonstige.textContent = String(sonstige);

  docCount.textContent =
    documents.length === 1 ? "1 Dokument" : `${documents.length} Dokumente`;

  if (documents.length > 0) {
    navBadge.hidden = false;
    navBadge.textContent = String(documents.length);
  } else {
    navBadge.hidden = true;
  }
}

function renderDocumentPicker() {
  const documents = getAllDocuments();
  const previous = docPicker.value;

  docPicker.innerHTML = `<option value="">— Bitte wählen —</option>`;
  documents.forEach((doc) => {
    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = `${doc.name} · ${doc.type}`;
    docPicker.appendChild(option);
  });

  const stillExists = documents.some((doc) => doc.id === previous);
  docPicker.value = stillExists ? previous : "";

  const hasDocs = documents.length > 0;
  docPicker.hidden = !hasDocs;
  docPicker.closest(".doc-picker-field")?.toggleAttribute("hidden", !hasDocs);
  if (docEmptyHint) docEmptyHint.hidden = hasDocs;
}

function renderSelectedDocument() {
  const id = docPicker.value;
  const doc = getAllDocuments().find((item) => item.id === id);

  if (!doc) {
    docDetail.hidden = true;
    clearPdfViewer();
    return;
  }

  const isDrive = doc.source === "drive";
  docDetail.hidden = false;
  docDetailName.textContent = doc.name;
  docDetailMeta.textContent = `${formatSize(Number(doc.size) || 0)} · ${formatDate(doc.uploadedAt)}`;
  docDetailType.value = ["Offerte", "Rechnung", "Sonstige"].includes(doc.type)
    ? doc.type
    : "Sonstige";

  const extracted = Boolean(doc.extracted);
  if (docExtract) {
    docExtract.hidden = !extracted && !doc.kurzbeschrieb;
    const isSonstige = doc.type === "Sonstige";
    docExtract.querySelectorAll("[data-field]").forEach((row) => {
      const field = row.getAttribute("data-field");
      if (isSonstige && field !== "kurzbeschrieb") {
        row.hidden = true;
      } else {
        row.hidden = false;
      }
    });
    docExtractFirma.textContent = doc.firma || "—";
    docExtractDatum.textContent = doc.datum || "—";
    docExtractBetrag.textContent = doc.betrag || "—";
    docExtractKurz.textContent = doc.kurzbeschrieb || "—";
  }

  if (extracted) {
    docDetailStatus.textContent = "KI ausgelesen";
    docDetailStatus.className = "status-pill is-drive";
  } else {
    docDetailStatus.textContent = isDrive ? "Google Drive · noch nicht ausgelesen" : "Hochgeladen";
    docDetailStatus.className = isDrive ? "status-pill is-drive" : "status-pill";
  }

  if (isDrive && doc.webViewLink) {
    docDetailOpen.hidden = false;
    docDetailOpen.href = doc.webViewLink;
  } else {
    docDetailOpen.hidden = true;
    docDetailOpen.removeAttribute("href");
  }

  docDetailDelete.hidden = isDrive;
  showPdfPreview(doc);
}

async function syncDriveFiles() {
  setDriveStatus("Lade Dokumente aus Google Drive…");
  driveSyncBtn.disabled = true;

  try {
    const response = await fetch("/api/drive", { cache: "no-store" });
    const data = await response.json();

    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }

    const files = Array.isArray(data.files) ? data.files : [];
    const folderName = data.folder?.name || "Drive";

    driveDocuments = files.map((file) => {
      const id = `drive:${file.id}`;
      const aiType = file.docType;
      const type =
        typeOverrides[id] ||
        (aiType && ["Offerte", "Rechnung", "Sonstige"].includes(aiType)
          ? aiType
          : guessType(file.name || ""));

      return {
        id,
        driveFileId: file.id,
        name: file.name || "dokument.pdf",
        type,
        size: Number(file.size) || 0,
        uploadedAt: file.modifiedTime || file.createdTime || new Date().toISOString(),
        source: "drive",
        webViewLink: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
        extracted: Boolean(file.extracted),
        firma: file.firma || "",
        datum: file.datum || "",
        betrag: file.betrag || "",
        kurzbeschrieb: file.kurzbeschrieb || "",
      };
    });

    renderAll();
    setDriveStatus(
      driveDocuments.length === 0
        ? `Ordner „${folderName}“: keine PDFs gefunden.`
        : `Ordner „${folderName}“: ${driveDocuments.length} PDF${driveDocuments.length === 1 ? "" : "s"} geladen.`
    );
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    setDriveStatus(`Drive-Sync fehlgeschlagen: ${message}`, true);
  } finally {
    driveSyncBtn.disabled = false;
  }
}

function persistLocalDocuments() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localDocuments));
}

function loadLocalDocuments() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((doc) => ({ ...doc, source: doc.source || "local" }));
  } catch {
    return [];
  }
}

function persistTypeOverrides() {
  localStorage.setItem(TYPE_OVERRIDES_KEY, JSON.stringify(typeOverrides));
}

function loadTypeOverrides() {
  try {
    const raw = localStorage.getItem(TYPE_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
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
 * @param {string} message
 * @param {boolean} [isError]
 */
function setDriveStatus(message, isError = false) {
  driveStatus.textContent = message;
  driveStatus.classList.toggle("is-error", Boolean(isError));
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
