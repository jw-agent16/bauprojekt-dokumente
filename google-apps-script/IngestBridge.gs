/**
 * Optional: from Apps Script, forward one message's attachments to Vercel ingest API.
 *
 * Set in Script Properties:
 *   INGEST_API_URL = https://bauprojekt-app-tau.vercel.app/api/emails/process
 *   INGEST_API_SECRET = same as Vercel INGEST_API_SECRET
 *
 * Example:
 *   forwardMessageToIngestApi_(GmailApp.getMessageById("..."));
 */
function forwardMessageToIngestApi_(message) {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty("INGEST_API_URL");
  var secret = props.getProperty("INGEST_API_SECRET");
  if (!url || !secret) {
    throw new Error("INGEST_API_URL / INGEST_API_SECRET fehlen in Script Properties");
  }

  var attachments = message.getAttachments({
    includeInlineImages: false,
    includeAttachments: true,
  });

  var payloadAttachments = [];
  attachments.forEach(function (attachment) {
    if (!isImportableAttachment_(attachment)) return;
    var bytes = attachment.getBytes();
    payloadAttachments.push({
      filename: attachment.getName() || "dokument",
      contentType: attachment.getContentType() || "application/octet-stream",
      encoding: "base64",
      data: Utilities.base64Encode(bytes),
    });
  });

  if (!payloadAttachments.length) return { ok: true, skipped: true };

  var body = {
    emailId: message.getId(),
    subject: message.getSubject() || "",
    from: message.getFrom() || "",
    receivedAt: message.getDate().toISOString(),
    attachments: payloadAttachments,
  };

  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { "x-ingest-secret": secret },
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  var text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("Ingest HTTP " + code + ": " + text.slice(0, 300));
  }
  return JSON.parse(text);
}
