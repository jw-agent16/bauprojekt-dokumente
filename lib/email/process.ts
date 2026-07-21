import { detectDocType } from "../documents/detect-type";
import type {
  DocumentInsert,
  DocumentRecord,
  InboundEmailPayload,
  ProcessEmailResult,
} from "../documents/types";
import {
  EmailIngestError,
  STORAGE_BUCKET,
  getSupabaseAdmin,
} from "../supabase/client";
import {
  attachmentToBuffer,
  buildStoragePath,
  ensureExtension,
  resolveMimeType,
  sanitizeFilename,
} from "./attachments";

/**
 * Process one inbound email: store allowed attachments and insert DB rows.
 */
export async function processInboundEmail(
  payload: InboundEmailPayload
): Promise<ProcessEmailResult> {
  const emailId = String(payload.emailId || "").trim();
  if (!emailId) {
    throw new EmailIngestError("emailId is required", 400, "VALIDATION_ERROR");
  }

  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
    : [];

  const result: ProcessEmailResult = {
    emailId,
    imported: [],
    skipped: [],
    errors: [],
  };

  if (attachments.length === 0) {
    return result;
  }

  const supabase = getSupabaseAdmin();
  const subject = payload.subject || "";

  for (const raw of attachments) {
    const baseName = sanitizeFilename(raw.filename || "dokument");
    try {
      const mime = resolveMimeType(baseName, raw.contentType || "");
      if (!mime) {
        result.skipped.push({
          filename: baseName,
          reason: `Unsupported type: ${raw.contentType || "unknown"}`,
        });
        continue;
      }

      const filename = ensureExtension(baseName, mime);
      const buffer = attachmentToBuffer(raw);
      if (!buffer.length) {
        result.skipped.push({ filename, reason: "Empty attachment" });
        continue;
      }

      // Idempotency: skip if same email + filename already stored
      const { data: existing, error: existingError } = await supabase
        .from("documents")
        .select("id, filename, file_url, doc_type")
        .eq("email_id", emailId)
        .eq("filename", filename)
        .maybeSingle();

      if (existingError) {
        throw new EmailIngestError(
          `DB lookup failed: ${existingError.message}`,
          502,
          "DB_ERROR"
        );
      }

      if (existing) {
        result.skipped.push({
          filename,
          reason: "Already imported for this email",
        });
        continue;
      }

      const storagePath = buildStoragePath(emailId, filename);
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          contentType: mime,
          upsert: false,
        });

      if (uploadError) {
        throw new EmailIngestError(
          `Storage upload failed: ${uploadError.message}`,
          502,
          "STORAGE_ERROR"
        );
      }

      const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      const fileUrl = publicUrlData?.publicUrl;
      if (!fileUrl) {
        throw new EmailIngestError(
          "Could not resolve file_url after upload",
          502,
          "STORAGE_ERROR"
        );
      }

      const docType = detectDocType(filename, subject);
      const insert: DocumentInsert = {
        filename,
        file_url: fileUrl,
        email_id: emailId,
        doc_type: docType,
        is_read: false,
        mime_type: mime,
        size_bytes: buffer.length,
        storage_path: storagePath,
      };

      const { data: created, error: insertError } = await supabase
        .from("documents")
        .insert(insert)
        .select("id, filename, file_url, doc_type")
        .single();

      if (insertError || !created) {
        // Best-effort cleanup of orphaned storage object
        await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
        throw new EmailIngestError(
          `DB insert failed: ${insertError?.message || "unknown"}`,
          502,
          "DB_ERROR"
        );
      }

      result.imported.push({
        id: created.id,
        filename: created.filename,
        file_url: created.file_url,
        doc_type: created.doc_type,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      result.errors.push({ filename: baseName, error: message });
    }
  }

  return result;
}

export async function listUnreadDocuments(
  limit = 50
): Promise<DocumentRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("is_read", false)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new EmailIngestError(`List failed: ${error.message}`, 502, "DB_ERROR");
  }
  return (data || []) as DocumentRecord[];
}
