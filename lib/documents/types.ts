/**
 * Document domain types for Bauprojekt S9.
 */

export const DOC_TYPES = ["Offerte", "Rechnung", "Bauplan", "Sonstige"] as const;

export type DocType = (typeof DOC_TYPES)[number];

export type DocumentRecord = {
  id: string;
  filename: string;
  file_url: string;
  created_at: string;
  is_read: boolean;
  email_id: string;
  doc_type: DocType;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
};

export type DocumentInsert = {
  filename: string;
  file_url: string;
  email_id: string;
  doc_type: DocType;
  is_read?: boolean;
  mime_type?: string | null;
  size_bytes?: number | null;
  storage_path?: string | null;
};

/** Allowed attachment MIME types / extensions for import. */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

export type AllowedMimeType = (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];

export type EmailAttachmentInput = {
  filename: string;
  contentType: string;
  /** Raw bytes or base64 string */
  data: Buffer | Uint8Array | string;
  encoding?: "base64" | "binary";
};

export type InboundEmailPayload = {
  /** Unique message id from the mail provider */
  emailId: string;
  subject?: string;
  from?: string;
  receivedAt?: string;
  attachments: EmailAttachmentInput[];
};

export type ProcessEmailResult = {
  emailId: string;
  imported: Array<{
    id: string;
    filename: string;
    file_url: string;
    doc_type: DocType;
  }>;
  skipped: Array<{ filename: string; reason: string }>;
  errors: Array<{ filename: string; error: string }>;
};
