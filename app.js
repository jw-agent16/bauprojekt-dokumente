const STORAGE_KEY = "bauprojekt-documents";
const TYPE_OVERRIDES_KEY = "bauprojekt-type-overrides";
const KV_STORAGE_KEY = "bauprojekt-kv";

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
const kpiUpload = document.getElementById("kpi-upload");
const kpiOfferten = document.getElementById("kpi-offerten-count");
const kpiRechnungen = document.getElementById("kpi-rechnungen-count");
const kpiPlaene = document.getElementById("kpi-plaene-count");
const navBadgePlaene = document.getElementById("nav-badge-plaene");
const plaeneGrid = document.getElementById("plaene-grid");
const plaeneCount = document.getElementById("plaene-count");
const plaeneEmpty = document.getElementById("plaene-empty");
const plaeneUploadBtn = document.getElementById("plaene-upload-btn");
const previewImage = document.getElementById("preview-image");
const DOC_TYPES = ["Offerte", "Rechnung", "Bauplan", "Sonstige"];
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const topbarTitle = document.getElementById("topbar-title");
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
const docsPanel = document.getElementById("docs-panel");
const kvAmountInput = document.getElementById("kv-amount-input");
const kvFileInput = document.getElementById("kv-file-input");
const kvFileName = document.getElementById("kv-file-name");
const kvRangeHint = document.getElementById("kv-range-hint");
const financeKvMeta = document.getElementById("finance-kv-meta");
const financeKvLow = document.getElementById("finance-kv-low");
const financeKvHigh = document.getElementById("finance-kv-high");
const financeKvMidLabel = document.getElementById("finance-kv-mid-label");
const financeOffertenMeta = document.getElementById("finance-offerten-meta");
const financeOffertenFill = document.getElementById("finance-offerten-fill");
const financeOffertenBar = document.getElementById("finance-offerten-bar");
const financeOffertenDetail = document.getElementById("finance-offerten-detail");
const financeRechnungenMeta = document.getElementById("finance-rechnungen-meta");
const financeRechnungenFill = document.getElementById("finance-rechnungen-fill");
const financeRechnungenBar = document.getElementById("finance-rechnungen-bar");
const financeRechnungenDetail = document.getElementById("finance-rechnungen-detail");

/** @type {{ amount: number | null, fileName: string }} */
let kvState = loadKvState();

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

const VIEW_TITLES = {
  home: "Bauprojekt S9",
  projekt: "Projekt",
  finanzen: "Finanzen",
  dokumente: "Dokumente",
  plaene: "Pläne",
  account: "Account",
  support: "Support",
  einstellungen: "Einstellungen",
};

function closeSidebar() {
  document.body.classList.remove("sidebar-open");
  if (sidebarBackdrop) sidebarBackdrop.hidden = true;
  if (sidebarToggle) {
    sidebarToggle.setAttribute("aria-expanded", "false");
    sidebarToggle.setAttribute("aria-label", "Menü öffnen");
  }
}

function openSidebar() {
  document.body.classList.add("sidebar-open");
  if (sidebarBackdrop) sidebarBackdrop.hidden = false;
  if (sidebarToggle) {
    sidebarToggle.setAttribute("aria-expanded", "true");
    sidebarToggle.setAttribute("aria-label", "Menü schliessen");
  }
}

function toggleSidebar() {
  if (document.body.classList.contains("sidebar-open")) closeSidebar();
  else openSidebar();
}

/**
 * @param {string} viewId
 */
function showView(viewId) {
  if (!VIEW_TITLES[viewId]) viewId = "home";

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

  const title = VIEW_TITLES[viewId];
  if (topbarTitle) topbarTitle.textContent = title;
  document.title = `Bauprojekt S9 — ${title}`;
  if (viewId === "finanzen") renderFinanzen();
  if (viewId === "plaene") renderPlaene();
}

function initNavigation() {
  document.querySelectorAll(".nav-link[data-view]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const view = link.dataset.view;
      if (!view) return;
      showView(view);
      history.replaceState(null, "", `#${view}`);
      closeSidebar();
    });
  });

  const brand = document.querySelector(".brand");
  brand?.addEventListener("click", (event) => {
    event.preventDefault();
    showView("home");
    history.replaceState(null, "", "#home");
    closeSidebar();
  });

  sidebarToggle?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleSidebar();
  });

  sidebarBackdrop?.addEventListener("click", () => closeSidebar());

  window.addEventListener("hashchange", () => {
    const view = (location.hash || "#home").replace("#", "");
    showView(VIEW_TITLES[view] ? view : "home");
  });

  const initial = (location.hash || "#home").replace("#", "");
  showView(VIEW_TITLES[initial] ? initial : "home");
}

function openFilePicker() {
  showView("dokumente");
  history.replaceState(null, "", "#dokumente");
  fileInput?.click();
}

/**
 * @param {string} type
 */
function scrollToDocPicker(type) {
  showView("dokumente");
  history.replaceState(null, "", "#dokumente");
  docsPanel?.scrollIntoView({ behavior: "smooth", block: "start" });

  const match = getAllDocuments().find((doc) => doc.type === type);
  if (match && docPicker) {
    docPicker.value = match.id;
    renderSelectedDocument();
  }

  window.setTimeout(() => docPicker?.focus(), 320);
}

kpiUpload?.addEventListener("click", () => openFilePicker());

document.querySelectorAll("[data-scroll-type]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const type = btn.getAttribute("data-scroll-type");
    if (type) scrollToDocPicker(type);
  });
});

document.querySelectorAll("[data-view-jump]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.getAttribute("data-view-jump");
    if (!view) return;
    showView(view);
    history.replaceState(null, "", `#${view}`);
  });
});

plaeneUploadBtn?.addEventListener("click", () => openFilePicker());

if (kvAmountInput) {
  kvAmountInput.value = kvState.amount != null ? formatInputAmount(kvState.amount) : "";
  kvAmountInput.addEventListener("change", () => {
    const parsed = parseAmount(kvAmountInput.value);
    kvState.amount = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    persistKvState();
    renderFinanzen();
  });
  kvAmountInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      kvAmountInput.blur();
    }
  });
}

if (kvFileName && kvState.fileName) {
  kvFileName.hidden = false;
  kvFileName.textContent = `KV-Datei: ${kvState.fileName}`;
}

kvFileInput?.addEventListener("change", () => {
  const file = kvFileInput.files?.[0];
  if (!file) return;
  if (!isAllowedFile(file)) {
    setStatus("Nur PDF- oder Bilddateien sind als KV erlaubt.", true);
    kvFileInput.value = "";
    return;
  }
  kvState.fileName = file.name;
  persistKvState();
  if (kvFileName) {
    kvFileName.hidden = false;
    kvFileName.textContent = `KV-Datei: ${file.name}`;
  }
  kvFileInput.value = "";
  renderFinanzen();
});

renderAll();
syncDriveFiles();
initNavigation();

fileInput?.addEventListener("change", () => {
  if (fileInput.files?.length) {
    handleFiles(fileInput.files);
    fileInput.value = "";
  }
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
  if (previewImage) {
    previewImage.hidden = true;
    previewImage.removeAttribute("src");
  }
  if (pdfViewer) pdfViewer.hidden = true;
  if (pdfViewerStatus) pdfViewerStatus.textContent = "";
}

/**
 * @param {string | undefined} name
 * @param {string | undefined} mime
 */
function isImageDoc(name, mime) {
  const m = String(mime || "").toLowerCase();
  if (m.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(String(name || ""));
}

/**
 * @param {{ source?: string, driveFileId?: string, id: string, name?: string, mimeType?: string } | null | undefined} doc
 */
async function showPdfPreview(doc) {
  clearPdfViewer();
  if (!doc || !pdfViewer || !pdfViewerStatus) return;

  pdfViewer.hidden = false;
  const token = pdfLoadToken;
  const asImage = isImageDoc(doc.name, doc.mimeType);

  const showBlob = (blob) => {
    if (token !== pdfLoadToken) return;
    const url = URL.createObjectURL(blob);
    activeObjectUrl = url;
    if (asImage && previewImage) {
      previewImage.hidden = false;
      previewImage.src = url;
    } else if (pdfFrame) {
      pdfFrame.hidden = false;
      pdfFrame.src = url;
    }
    pdfViewerStatus.textContent = "";
  };

  if (doc.source === "local") {
    const file = localFileBlobs.get(doc.id);
    if (!file) {
      pdfViewerStatus.textContent =
        "Vorschau für lokale Dateien nur direkt nach dem Upload.";
      return;
    }
    showBlob(file);
    return;
  }

  if (doc.source === "drive" && doc.driveFileId) {
    pdfViewerStatus.textContent = "Lade Datei…";
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
      showBlob(blob);
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
  const allowed = files.filter(isAllowedFile);
  const rejected = files.length - allowed.length;

  if (allowed.length === 0) {
    setStatus("Nur PDF- und Bilddateien (JPG, PNG, WebP) sind erlaubt.", true);
    return;
  }

  const added = allowed.map((file) => {
    const id = crypto.randomUUID();
    localFileBlobs.set(id, file);
    const type = guessType(file.name);
    return {
      id,
      name: file.name,
      type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      source: "local",
      mimeType: file.type || "",
    };
  });

  localDocuments = [...added, ...localDocuments];
  persistLocalDocuments();
  renderAll();

  let message =
    added.length === 1
      ? `„${added[0].name}“ hochgeladen.`
      : `${added.length} Dateien hochgeladen.`;

  if (rejected > 0) {
    message += ` ${rejected} Datei${rejected === 1 ? "" : "en"} übersprungen.`;
  }

  setStatus(message, rejected > 0 && added.length === 0);

  const plan = added.find((doc) => doc.type === "Bauplan");
  if (plan) {
    showView("plaene");
    history.replaceState(null, "", "#plaene");
  }
}

/**
 * @param {File} file
 */
function isAllowedFile(file) {
  const name = file.name.toLowerCase();
  const type = String(file.type || "").toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return true;
  if (type.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp)$/i.test(name);
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
  if (
    lower.includes("grundriss") ||
    lower.includes("bauplan") ||
    lower.includes("lageplan") ||
    lower.includes("schnitt") ||
    lower.includes("plan_") ||
    /\bplan\b/.test(lower)
  ) {
    return "Bauplan";
  }
  if (/\.(jpe?g|png|webp)$/i.test(lower)) {
    return "Bauplan";
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
  renderFinanzen();
  renderPlaene();
}

function renderKpis() {
  const documents = getAllDocuments();
  const offerten = documents.filter((doc) => doc.type === "Offerte").length;
  const rechnungen = documents.filter((doc) => doc.type === "Rechnung").length;
  const plaene = documents.filter((doc) => doc.type === "Bauplan").length;

  if (kpiOfferten) kpiOfferten.textContent = String(offerten);
  if (kpiRechnungen) kpiRechnungen.textContent = String(rechnungen);
  if (kpiPlaene) kpiPlaene.textContent = String(plaene);

  docCount.textContent =
    documents.length === 1 ? "1 Dokument" : `${documents.length} Dokumente`;

  if (documents.length > 0) {
    navBadge.hidden = false;
    navBadge.textContent = String(documents.length);
  } else {
    navBadge.hidden = true;
  }

  if (navBadgePlaene) {
    if (plaene > 0) {
      navBadgePlaene.hidden = false;
      navBadgePlaene.textContent = String(plaene);
    } else {
      navBadgePlaene.hidden = true;
    }
  }
}

function renderPlaene() {
  if (!plaeneGrid) return;
  const plans = getAllDocuments().filter((doc) => doc.type === "Bauplan");

  if (plaeneCount) {
    plaeneCount.textContent = plans.length === 1 ? "1 Plan" : `${plans.length} Pläne`;
  }
  if (plaeneEmpty) plaeneEmpty.hidden = plans.length > 0;

  plaeneGrid.innerHTML = "";
  plans.forEach((doc) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "plaene-card";
    card.innerHTML = `
      <span class="plaene-card-name"></span>
      <span class="plaene-card-meta"></span>
    `;
    card.querySelector(".plaene-card-name").textContent = doc.name;
    card.querySelector(".plaene-card-meta").textContent = [
      doc.kurzbeschrieb || "Bauplan / Grundriss",
      formatDate(doc.uploadedAt),
    ].join(" · ");
    card.addEventListener("click", () => {
      showView("dokumente");
      history.replaceState(null, "", "#dokumente");
      if (docPicker) {
        docPicker.value = doc.id;
        renderSelectedDocument();
        docsPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    plaeneGrid.appendChild(card);
  });
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
  docDetailType.value = DOC_TYPES.includes(doc.type) ? doc.type : "Sonstige";

  const extracted = Boolean(doc.extracted);
  if (docExtract) {
    docExtract.hidden = !extracted && !doc.kurzbeschrieb;
    const hideAmounts = doc.type === "Sonstige" || doc.type === "Bauplan";
    docExtract.querySelectorAll("[data-field]").forEach((row) => {
      const field = row.getAttribute("data-field");
      if (hideAmounts && field !== "kurzbeschrieb") {
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
        (aiType && DOC_TYPES.includes(aiType) ? aiType : guessType(file.name || ""));

      return {
        id,
        driveFileId: file.id,
        name: file.name || "dokument.pdf",
        type,
        size: Number(file.size) || 0,
        uploadedAt: file.modifiedTime || file.createdTime || new Date().toISOString(),
        source: "drive",
        mimeType: file.mimeType || "",
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
        ? `Ordner „${folderName}“: keine Dateien gefunden.`
        : `Ordner „${folderName}“: ${driveDocuments.length} Datei${driveDocuments.length === 1 ? "" : "en"} geladen.`
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
  if (!uploadStatus) return;
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

function loadKvState() {
  try {
    const raw = localStorage.getItem(KV_STORAGE_KEY);
    if (!raw) return { amount: null, fileName: "" };
    const data = JSON.parse(raw);
    const amount = Number(data?.amount);
    return {
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      fileName: typeof data?.fileName === "string" ? data.fileName : "",
    };
  } catch {
    return { amount: null, fileName: "" };
  }
}

function persistKvState() {
  localStorage.setItem(
    KV_STORAGE_KEY,
    JSON.stringify({
      amount: kvState.amount,
      fileName: kvState.fileName || "",
    })
  );
}

/**
 * Parse Swiss/EU currency strings to a number.
 * @param {unknown} value
 * @returns {number}
 */
function parseAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  let text = String(value || "")
    .replace(/\s/g, "")
    .replace(/CHF|Fr\.?|SFr\.?/gi, "")
    .replace(/[^\d.,'-]/g, "");

  if (!text) return NaN;

  // 1'234.50 or 1'234,50
  if (text.includes("'")) {
    text = text.replace(/'/g, "");
  }

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");

  if (hasComma && hasDot) {
    // 1.234,50 → EU ; 1,234.50 → US
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = text.split(",");
    text =
      parts.length === 2 && parts[1].length <= 2
        ? `${parts[0].replace(/\./g, "")}.${parts[1]}`
        : text.replace(/,/g, "");
  } else if (hasDot) {
    const parts = text.split(".");
    if (parts.length > 2) {
      const dec = parts.pop();
      text = `${parts.join("")}.${dec}`;
    }
  }

  const num = Number(text);
  return Number.isFinite(num) ? num : NaN;
}

/**
 * @param {number} amount
 */
function formatCHF(amount) {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * @param {number} amount
 */
function formatInputAmount(amount) {
  return new Intl.NumberFormat("de-CH", {
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * @param {string} type
 */
function sumAmountsByType(type) {
  return getAllDocuments()
    .filter((doc) => doc.type === type)
    .reduce((sum, doc) => {
      const amount = parseAmount(doc.betrag);
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0);
}

/**
 * @param {string} type
 */
function countAmountsByType(type) {
  return getAllDocuments().filter((doc) => {
    if (doc.type !== type) return false;
    return Number.isFinite(parseAmount(doc.betrag));
  }).length;
}

function renderFinanzen() {
  if (!financeKvMeta) return;

  const kv = kvState.amount;
  const offertenSum = sumAmountsByType("Offerte");
  const rechnungenSum = sumAmountsByType("Rechnung");
  const offertenCount = countAmountsByType("Offerte");
  const rechnungenCount = countAmountsByType("Rechnung");

  if (kv != null && kv > 0) {
    const low = kv * 0.9;
    const high = kv * 1.1;
    if (kvRangeHint) {
      kvRangeHint.textContent = `Bandbreite ±10 %: ${formatCHF(low)} – ${formatCHF(high)}`;
    }
    financeKvMeta.textContent = formatCHF(kv);
    if (financeKvLow) financeKvLow.textContent = formatCHF(low);
    if (financeKvHigh) financeKvHigh.textContent = formatCHF(high);
    if (financeKvMidLabel) financeKvMidLabel.textContent = formatCHF(kv);
  } else {
    if (kvRangeHint) kvRangeHint.textContent = "Noch kein KV hinterlegt — Betrag oben eintragen.";
    financeKvMeta.textContent = "—";
    if (financeKvLow) financeKvLow.textContent = "−10 %";
    if (financeKvHigh) financeKvHigh.textContent = "+10 %";
    if (financeKvMidLabel) financeKvMidLabel.textContent = "KV";
  }

  const offerPct = kv && kv > 0 ? Math.min(100, (offertenSum / kv) * 100) : 0;
  const cashPct = kv && kv > 0 ? Math.min(100, (rechnungenSum / kv) * 100) : 0;

  if (financeOffertenFill) financeOffertenFill.style.width = `${offerPct}%`;
  if (financeOffertenBar) financeOffertenBar.setAttribute("aria-valuenow", String(Math.round(offerPct)));
  if (financeOffertenMeta) {
    financeOffertenMeta.textContent =
      kv && kv > 0 ? `${offerPct.toFixed(1)} %` : "KV fehlt";
  }
  if (financeOffertenDetail) {
    financeOffertenDetail.textContent =
      offertenCount > 0
        ? `${formatCHF(offertenSum)} aus ${offertenCount} Offerte${offertenCount === 1 ? "" : "n"}${
            kv ? ` · Ziel ${formatCHF(kv)}` : ""
          }`
        : "Noch keine Offerten-Beträge ausgelesen.";
  }

  if (financeRechnungenFill) financeRechnungenFill.style.width = `${cashPct}%`;
  if (financeRechnungenBar) financeRechnungenBar.setAttribute("aria-valuenow", String(Math.round(cashPct)));
  if (financeRechnungenMeta) {
    financeRechnungenMeta.textContent =
      kv && kv > 0 ? `${cashPct.toFixed(1)} %` : "KV fehlt";
  }
  if (financeRechnungenDetail) {
    financeRechnungenDetail.textContent =
      rechnungenCount > 0
        ? `${formatCHF(rechnungenSum)} aus ${rechnungenCount} Rechnung${
            rechnungenCount === 1 ? "" : "en"
          }${kv ? ` · vom KV` : ""}`
        : "Noch keine Rechnungs-Beträge ausgelesen.";
  }
}
