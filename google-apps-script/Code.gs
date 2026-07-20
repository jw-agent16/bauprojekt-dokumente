/**
 * Bauprojekt — Gmail PDF-Anhänge automatisch nach Google Drive speichern
 *
 * Einrichtung (einmalig):
 * 1. https://script.google.com → Neues Projekt
 * 2. Standardcode löschen, diesen gesamten Code einfügen
 * 3. CONFIG unten anpassen (optional)
 * 4. Funktion "einmaligEinrichten" auswählen → Ausführen
 * 5. Google-Konto wählen und Berechtigungen erlauben
 * 6. Danach Funktion "pdfsNachDriveSpeichern" einmal manuell testen
 * 7. Trigger: Trigger (Uhr-Symbol) → Trigger hinzufügen
 *    - Funktion: pdfsNachDriveSpeichern
 *    - Ereignisquelle: Zeitgesteuert
 *    - Minuten-Timer: alle 5 Minuten (oder 10/15)
 *
 * Fertig: Neue Mails mit PDF landen im Drive-Ordner.
 */

var CONFIG = {
  /** Zielordner in Google Drive (wird angelegt, falls fehlend) */
  driveFolderPath: ["Bauprojekt", "Eingang"],

  /**
   * Gmail-Suche — passt du bei Bedarf an.
   * Beispiele:
   *   "has:attachment filename:pdf newer_than:30d -label:Bauprojekt-Drive"
   *   "from:rechnung@beispiel.ch has:attachment filename:pdf -label:Bauprojekt-Drive"
   */
  gmailQuery:
    "has:attachment filename:pdf newer_than:30d -label:Bauprojekt-Drive",

  /** Label, das nach erfolgreichem Speichern gesetzt wird (verhindert Doppel-Import) */
  processedLabel: "Bauprojekt-Drive",

  /** Max. Threads pro Lauf (Apps Script Zeitlimit) */
  maxThreadsPerRun: 40,

  /**
   * true = Dateiname bekommt Präfix mit Datum der Mail (weniger Namenskollisionen)
   * false = Original-Dateiname behalten
   */
  prefixWithMailDate: true,

  /**
   * Geheimnis für die Web-App-API (doGet).
   * Muss mit api/drive-config.js übereinstimmen.
   */
  apiToken: "bpS9_7f3a9c2e8b1d4e6a9f0c2b4d6e8a1c",

  /**
   * Gemini API Key von https://aistudio.google.com/apikey
   * (kostenloses Kontingent reicht für den Start)
   */
  geminiApiKey: "",

  /** Max. PDFs pro Auslese-Lauf (Apps Script Zeitlimit) */
  maxExtractionsPerRun: 5,
};

/**
 * Einmal ausführen: Ordner + Label anlegen und kurz prüfen.
 */
function einmaligEinrichten() {
  var folder = getOrCreateFolderPath_(CONFIG.driveFolderPath);
  getOrCreateLabel_(CONFIG.processedLabel);

  Logger.log("Drive-Ordner bereit: %s", folder.getUrl());
  Logger.log("Ordner-ID (für die Bauprojekt-App): %s", folder.getId());
  Logger.log('Gmail-Label bereit: "%s"', CONFIG.processedLabel);
  Logger.log("Als Nächstes: pdfsNachDriveSpeichern einmal ausführen, dann Trigger setzen.");
}

/**
 * Zeigt die Ordner-ID für die Web-App (Client-Einstellungen).
 */
function ordnerIdAnzeigen() {
  var folder = getOrCreateFolderPath_(CONFIG.driveFolderPath);
  Logger.log("Ordner: %s", folder.getName());
  Logger.log("URL: %s", folder.getUrl());
  Logger.log("Ordner-ID: %s", folder.getId());
}

/**
 * Web-App-Endpunkt für die Bauprojekt-S9-Website.
 *
 * Deployment (einmalig):
 * 1. Diesen Code speichern
 * 2. Deploy → New deployment → Type: Web app
 * 3. Execute as: Me
 * 4. Who has access: Anyone
 * 5. Deploy → Web-App-URL kopieren
 * 6. URL in api/drive-config.js als scriptUrl eintragen und Vercel neu deployen
 */
function doGet(e) {
  e = e || { parameter: {} };
  var token = String((e.parameter && e.parameter.token) || "");
  if (token !== CONFIG.apiToken) {
    return jsonResponse_({ ok: false, error: "unauthorized" }, 401);
  }

  var action = String((e.parameter && e.parameter.action) || "list");
  if (action === "pdf") {
    return servePdf_(e.parameter && e.parameter.id);
  }

  try {
    var folder = resolveEingangFolder_();
    var extractions = loadExtractionsMap_();
    var files = listDocsInFolder_(folder).map(function (file) {
      var extra = extractions[file.id] || null;
      if (extra) {
        file.docType = extra.docType;
        file.firma = extra.firma;
        file.datum = extra.datum;
        file.betrag = extra.betrag;
        file.kurzbeschrieb = extra.kurzbeschrieb;
        file.extracted = true;
      } else {
        file.extracted = false;
      }
      return file;
    });
    return jsonResponse_({
      ok: true,
      folder: {
        id: folder.getId(),
        name: folder.getName(),
        url: folder.getUrl(),
      },
      files: files,
    });
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  }
}

/**
 * PDF für In-App-Vorschau (nur Dateien im Eingang-Ordner).
 * Max. ca. 5 MB wegen Apps-Script-/Hosting-Limits.
 */
function servePdf_(fileId) {
  fileId = String(fileId || "").trim();
  if (!fileId) {
    return jsonResponse_({ ok: false, error: "id fehlt" });
  }

  try {
    if (!isPdfInEingang_(fileId)) {
      return jsonResponse_({ ok: false, error: "Datei nicht im Eingang-Ordner" });
    }

    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var bytes = blob.getBytes();
    var maxBytes = 5 * 1024 * 1024;
    if (bytes.length > maxBytes) {
      return jsonResponse_({
        ok: false,
        error: "PDF zu gross für In-App-Ansicht (max. 5 MB)",
      });
    }

    return jsonResponse_({
      ok: true,
      name: file.getName(),
      mimeType: blob.getContentType() || "application/pdf",
      base64: Utilities.base64Encode(bytes),
    });
  } catch (err) {
    return jsonResponse_({
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  }
}

function isPdfInEingang_(fileId) {
  var folder = resolveEingangFolder_();
  var files = listDocsInFolder_(folder);
  for (var i = 0; i < files.length; i++) {
    if (files[i].id === fileId) return true;
  }
  return false;
}

function resolveEingangFolder_() {
  var preferred = getOrCreateFolderPath_(CONFIG.driveFolderPath);
  if (countFiles_(preferred) > 0) return preferred;

  // Fallback: anderen „Eingang“-Ordner mit Dateien finden
  var it = DriveApp.getFoldersByName("Eingang");
  var best = preferred;
  var bestCount = 0;
  while (it.hasNext()) {
    var folder = it.next();
    var count = countFiles_(folder);
    if (count > bestCount) {
      best = folder;
      bestCount = count;
    }
  }
  return best;
}

function countFiles_(folder) {
  var n = 0;
  var files = folder.getFiles();
  while (files.hasNext()) {
    files.next();
    n++;
    if (n > 100) break;
  }
  return n;
}

function listPdfsInFolder_(folder) {
  return listDocsInFolder_(folder).filter(function (f) {
    return String(f.mimeType || "").indexOf("pdf") !== -1 || /\.pdf$/i.test(f.name || "");
  });
}

function listDocsInFolder_(folder) {
  var out = [];
  var files = folder.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var name = file.getName() || "dokument";
    var mime = "";
    try {
      mime = file.getMimeType() || "";
    } catch (ignore) {}
    var isPdf =
      mime === "application/pdf" ||
      String(mime).indexOf("pdf") !== -1 ||
      /\.pdf$/i.test(name);
    var isImage =
      String(mime).indexOf("image/") === 0 ||
      /\.(jpe?g|png|webp|gif)$/i.test(name);
    if (!isPdf && !isImage) continue;

    out.push({
      id: file.getId(),
      name: name,
      size: file.getSize(),
      createdTime: file.getDateCreated().toISOString(),
      modifiedTime: file.getLastUpdated().toISOString(),
      webViewLink: file.getUrl(),
      mimeType: mime || (isImage ? "image/jpeg" : "application/pdf"),
    });
  }

  out.sort(function (a, b) {
    return String(b.modifiedTime).localeCompare(String(a.modifiedTime));
  });
  return out;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * Gemini API-Key speichern (einmal ausführen nach dem Eintragen unten im Prompt nicht nötig —
 * besser: Key in CONFIG.geminiApiKey einfügen ODER diese Funktion mit dem Key aufrufen).
 *
 * Beispiel in der Editor-Konsole:
 *   setGeminiApiKey("AIza...");
 */
function setGeminiApiKey(key) {
  PropertiesService.getScriptProperties().setProperty("GEMINI_API_KEY", String(key || ""));
  Logger.log("Gemini API-Key gespeichert.");
}

/**
 * PDFs im Eingangsordner per KI auslesen.
 * Für Trigger oder manuellen Start. Verarbeitet nur noch nicht ausgelesene Dateien.
 */
function dokumenteAuslesen() {
  var key = getGeminiApiKey_();
  if (!key) {
    throw new Error(
      "Kein Gemini API-Key. Bitte in CONFIG.geminiApiKey eintragen oder setGeminiApiKey('...') ausführen. Key: https://aistudio.google.com/apikey"
    );
  }

  var folder = resolveEingangFolder_();
  var store = loadExtractionsStore_();
  var existing = store.map;
  var files = listDocsInFolder_(folder);
  var pending = files.filter(function (f) {
    return !existing[f.id] || isFailedExtraction_(existing[f.id]);
  });

  var limit = Math.min(pending.length, CONFIG.maxExtractionsPerRun || 5);
  var done = 0;
  var errors = 0;

  for (var i = 0; i < limit; i++) {
    var meta = pending[i];
    try {
      var file = DriveApp.getFileById(meta.id);
      var extracted = extractPdfWithGemini_(file, key);
      existing[meta.id] = {
        docType: extracted.docType || "Sonstige",
        firma: extracted.firma || "",
        datum: extracted.datum || "",
        betrag: extracted.betrag || "",
        kurzbeschrieb: extracted.kurzbeschrieb || "",
        fileName: meta.name,
        updatedAt: new Date().toISOString(),
      };
      done++;
      Logger.log('Ausgelesen: "%s" → %s', meta.name, extracted.docType);
    } catch (err) {
      errors++;
      Logger.log('Fehler bei "%s": %s', meta.name, err);
      // Fehlversuch nicht speichern — nächster Lauf versucht erneut
    }
  }

  saveExtractionsStore_(store.file, existing);

  Logger.log(
    "KI-Auslese fertig. Neu: %s | Fehler: %s | Offen danach: %s",
    done,
    errors,
    pending.length - done
  );
}

function isFailedExtraction_(entry) {
  if (!entry) return true;
  return String(entry.kurzbeschrieb || "").indexOf("Auslesen fehlgeschlagen") !== -1;
}

/**
 * Fehlversuche löschen, danach dokumenteAuslesen() erneut ausführen.
 */
function fehlgeschlageneExtraktionenZuruecksetzen() {
  var store = loadExtractionsStore_();
  var map = store.map;
  var removed = 0;
  Object.keys(map).forEach(function (id) {
    if (isFailedExtraction_(map[id])) {
      delete map[id];
      removed++;
    }
  });
  saveExtractionsStore_(store.file, map);
  Logger.log("Fehlversuche entfernt: %s", removed);
}

function getGeminiApiKey_() {
  var fromProps = PropertiesService.getScriptProperties().getProperty("GEMINI_API_KEY");
  if (fromProps) return fromProps;
  return String(CONFIG.geminiApiKey || "");
}

/**
 * Speichert Auslese-Ergebnisse als JSON in Drive (ohne Spreadsheet-Berechtigung).
 */
function loadExtractionsStore_() {
  var folder = getOrCreateFolderPath_(["Bauprojekt"]);
  var file = null;
  var it = folder.getFilesByName("bauprojekt-s9-extraktion.json");
  if (it.hasNext()) {
    file = it.next();
  } else {
    file = folder.createFile(
      "bauprojekt-s9-extraktion.json",
      "{}",
      MimeType.PLAIN_TEXT
    );
  }

  var map = {};
  try {
    var parsed = JSON.parse(file.getBlob().getDataAsString() || "{}");
    if (parsed && typeof parsed === "object") map = parsed;
  } catch (ignore) {
    map = {};
  }
  return { file: file, map: map };
}

function loadExtractionsMap_() {
  return loadExtractionsStore_().map;
}

function saveExtractionsStore_(file, map) {
  file.setContent(JSON.stringify(map));
}

function extractPdfWithGemini_(file, apiKey) {
  var blob = file.getBlob();
  var bytes = blob.getBytes();
  // Zu große PDFs überspringen (Base64 + Limit)
  if (bytes.length > 12 * 1024 * 1024) {
    throw new Error("PDF zu groß für Auslese (>12 MB)");
  }

  var base64 = Utilities.base64Encode(bytes);
  var mime = blob.getContentType() || "application/pdf";

  var prompt =
    "Du analysierst ein Bauprojekt-Dokument (PDF oder Bild, Schweiz/DE). Antworte NUR mit gültigem JSON, ohne Markdown.\n" +
    "Schema:\n" +
    "{\n" +
    '  "docType": "Offerte" | "Rechnung" | "Bauplan" | "Sonstige",\n' +
    '  "firma": "Absender/Firma oder leer",\n' +
    '  "datum": "Dokumentdatum als YYYY-MM-DD oder leer",\n' +
    '  "betrag": "Bruttobetrag inkl. MwSt als Text z.B. \\\"1\'234.50 CHF\\\" oder leer",\n' +
    '  "kurzbeschrieb": "1-2 Sätze worum es geht"\n' +
    "}\n" +
    "Regeln:\n" +
    "- Offerte: Angebot, Kostenvoranschlag, Offerte, Quote\n" +
    "- Rechnung: Rechnung, Invoice, Faktura, Zahlungsaufforderung\n" +
    "- Bauplan: Grundriss, Bauplan, Lageplan, Schnitt, Fassade, Architekturplan, Werkplan\n" +
    "- Sonstige: alles andere (Bestätigungen ohne klaren Typ, etc.)\n" +
    "- Bei Bauplan/Sonstige: firma/datum/betrag leer lassen, nur kurzbeschrieb füllen\n" +
    "- Bei Offerte/Rechnung: firma, datum, betrag (inkl. MwSt) und kurzbeschrieb so gut wie möglich füllen";

  var payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mime,
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  };

  var url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
    encodeURIComponent(apiKey);

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  var body = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("Gemini HTTP " + code + ": " + body.slice(0, 240));
  }

  var parsed = JSON.parse(body);
  var text =
    ((((parsed || {}).candidates || [])[0] || {}).content || {}).parts || [];
  var jsonText = text.length ? String(text[0].text || "") : "";
  jsonText = jsonText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();

  var data = JSON.parse(jsonText);
  var docType = String(data.docType || "Sonstige");
  if (["Offerte", "Rechnung", "Bauplan", "Sonstige"].indexOf(docType) === -1) {
    docType = "Sonstige";
  }

  if (docType === "Sonstige" || docType === "Bauplan") {
    return {
      docType: docType,
      firma: "",
      datum: "",
      betrag: "",
      kurzbeschrieb: String(data.kurzbeschrieb || "").trim(),
    };
  }

  return {
    docType: docType,
    firma: String(data.firma || "").trim(),
    datum: String(data.datum || "").trim(),
    betrag: String(data.betrag || "").trim(),
    kurzbeschrieb: String(data.kurzbeschrieb || "").trim(),
  };
}

/**
 * Hauptfunktion — für manuellen Test und für den zeitgesteuerten Trigger.
 */
function pdfsNachDriveSpeichern() {
  var folder = getOrCreateFolderPath_(CONFIG.driveFolderPath);
  var label = getOrCreateLabel_(CONFIG.processedLabel);
  var threads = GmailApp.search(CONFIG.gmailQuery, 0, CONFIG.maxThreadsPerRun);

  var saved = 0;
  var skipped = 0;

  threads.forEach(function (thread) {
    var messages = thread.getMessages();
    var threadSavedSomething = false;

    messages.forEach(function (message) {
      var result = savePdfAttachmentsFromMessage_(message, folder);
      saved += result.saved;
      skipped += result.skipped;
      if (result.saved > 0) threadSavedSomething = true;
    });

    // Auch Threads ohne neues PDF labeln, wenn sie schon im Suchergebnis sind
    // und nur PDFs hatten die wir übersprungen haben — verhindert Endlosschleife.
    if (threadSavedSomething || threadHasOnlyHandledPdfs_(thread, folder)) {
      thread.addLabel(label);
    }
  });

  Logger.log(
    "Fertig. Neu gespeichert: %s | Übersprungen: %s | Threads geprüft: %s",
    saved,
    skipped,
    threads.length
  );

  // Neue PDFs direkt auslesen (wenn Gemini-Key gesetzt)
  try {
    if (getGeminiApiKey_()) {
      dokumenteAuslesen();
    }
  } catch (extractErr) {
    Logger.log("KI-Auslese übersprungen/fehlgeschlagen: %s", extractErr);
  }
}

/**
 * Speichert alle PDF-Anhänge einer Mail in den Drive-Ordner.
 */
function savePdfAttachmentsFromMessage_(message, folder) {
  var saved = 0;
  var skipped = 0;
  var attachments = message.getAttachments({
    includeInlineImages: false,
    includeAttachments: true,
  });

  var messageId = message.getId();
  var mailDate = message.getDate();

  attachments.forEach(function (attachment) {
    if (!isPdfAttachment_(attachment)) {
      return;
    }

    var baseName = sanitizeFileName_(attachment.getName() || "dokument.pdf");
    if (!/\.pdf$/i.test(baseName)) {
      baseName += ".pdf";
    }

    var fileName = CONFIG.prefixWithMailDate
      ? formatDatePrefix_(mailDate) + "_" + baseName
      : baseName;

    // Doppelte Imports derselben Mail+Datei vermeiden
    var dedupeKey = "pdf:" + messageId + ":" + baseName.toLowerCase();
    if (PropertiesService.getScriptProperties().getProperty(dedupeKey)) {
      skipped++;
      return;
    }

    // Falls Dateiname schon existiert: Zähler anhängen
    fileName = uniqueFileName_(folder, fileName);

    folder.createFile(attachment.copyBlob().setName(fileName));
    PropertiesService.getScriptProperties().setProperty(dedupeKey, "1");
    saved++;

    Logger.log('Gespeichert: "%s" (von %s)', fileName, message.getFrom());
  });

  return { saved: saved, skipped: skipped };
}

function threadHasOnlyHandledPdfs_(thread, folder) {
  // Wenn der Thread PDFs hat, aber nichts Neues zu speichern war,
  // trotzdem als erledigt markieren, sobald alle PDF-Keys gesetzt sind.
  var messages = thread.getMessages();
  var pdfCount = 0;
  var handled = 0;

  messages.forEach(function (message) {
    var attachments = message.getAttachments({
      includeInlineImages: false,
      includeAttachments: true,
    });
    attachments.forEach(function (attachment) {
      if (!isPdfAttachment_(attachment)) return;
      pdfCount++;
      var baseName = sanitizeFileName_(attachment.getName() || "dokument.pdf");
      if (!/\.pdf$/i.test(baseName)) baseName += ".pdf";
      var dedupeKey = "pdf:" + message.getId() + ":" + baseName.toLowerCase();
      if (PropertiesService.getScriptProperties().getProperty(dedupeKey)) {
        handled++;
      }
    });
  });

  return pdfCount > 0 && pdfCount === handled;
}

function isPdfAttachment_(attachment) {
  var name = (attachment.getName() || "").toLowerCase();
  var contentType = (attachment.getContentType() || "").toLowerCase();
  return (
    contentType === "application/pdf" ||
    contentType.indexOf("application/pdf") === 0 ||
    name.endsWith(".pdf")
  );
}

function getOrCreateFolderPath_(pathParts) {
  var folder = DriveApp.getRootFolder();
  pathParts.forEach(function (name) {
    var it = folder.getFoldersByName(name);
    folder = it.hasNext() ? it.next() : folder.createFolder(name);
  });
  return folder;
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}

function sanitizeFileName_(name) {
  return String(name)
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDatePrefix_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function uniqueFileName_(folder, fileName) {
  if (!folder.getFilesByName(fileName).hasNext()) {
    return fileName;
  }
  var match = fileName.match(/^(.*)(\.[^.]+)$/);
  var stem = match ? match[1] : fileName;
  var ext = match ? match[2] : "";
  var i = 2;
  var candidate;
  do {
    candidate = stem + " (" + i + ")" + ext;
    i++;
  } while (folder.getFilesByName(candidate).hasNext());
  return candidate;
}
