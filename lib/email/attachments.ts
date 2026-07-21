import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  type AllowedMimeType,
  type EmailAttachmentInput,
} from "../documents/types";

const EXT_MIME: Record<string, AllowedMimeType> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function sanitizeFilename(name: string): string {
  const cleaned = String(name || "dokument")
    .replace(/[\/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "dokument";
}

export function resolveMimeType(
  filename: string,
  contentType: string
): AllowedMimeType | null {
  const mime = String(contentType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if ((ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime)) {
    return mime as AllowedMimeType;
  }

  const lower = filename.toLowerCase();
  for (const [ext, mapped] of Object.entries(EXT_MIME)) {
    if (lower.endsWith(ext)) return mapped;
  }
  return null;
}

export function attachmentToBuffer(attachment: EmailAttachmentInput): Buffer {
  if (Buffer.isBuffer(attachment.data)) {
    return attachment.data;
  }
  if (attachment.data instanceof Uint8Array) {
    return Buffer.from(attachment.data);
  }

  const text = String(attachment.data);
  if (attachment.encoding === "base64" || looksLikeBase64(text)) {
    return Buffer.from(text.replace(/\s/g, ""), "base64");
  }
  return Buffer.from(text, "binary");
}

function looksLikeBase64(value: string): boolean {
  const compact = value.replace(/\s/g, "");
  return compact.length > 32 && /^[A-Za-z0-9+/]+=*$/.test(compact);
}

export function ensureExtension(filename: string, mime: AllowedMimeType): string {
  if (/\.(pdf|jpe?g|png|webp|gif)$/i.test(filename)) return filename;
  switch (mime) {
    case "application/pdf":
      return `${filename}.pdf`;
    case "image/png":
      return `${filename}.png`;
    case "image/webp":
      return `${filename}.webp`;
    case "image/gif":
      return `${filename}.gif`;
    case "image/jpeg":
    case "image/jpg":
    default:
      return `${filename}.jpg`;
  }
}

/** Storage object path: documents/<emailId>/<unique-filename> */
export function buildStoragePath(emailId: string, filename: string): string {
  const safeEmail = sanitizeFilename(emailId).replace(/\s+/g, "_");
  const safeName = sanitizeFilename(filename);
  const stamp = Date.now().toString(36);
  return `${safeEmail}/${stamp}_${safeName}`;
}
