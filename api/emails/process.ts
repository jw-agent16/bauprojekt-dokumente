import type { VercelRequest, VercelResponse } from "@vercel/node";
import { processInboundEmail } from "../../lib/email/process";
import { EmailIngestError } from "../../lib/supabase/client";
import type {
  EmailAttachmentInput,
  InboundEmailPayload,
} from "../../lib/documents/types";

/**
 * POST /api/emails/process
 *
 * Ingests a new email (webhook / Apps Script / cron caller).
 * Auth: header `x-ingest-secret` must match INGEST_API_SECRET.
 *
 * Body JSON:
 * {
 *   "emailId": "gmail-msg-id",
 *   "subject": "...",
 *   "from": "...",
 *   "attachments": [
 *     { "filename": "rechnung.pdf", "contentType": "application/pdf", "data": "<base64>", "encoding": "base64" }
 *   ]
 * }
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  try {
    assertIngestAuthorized(req);
    const payload = parsePayload(req.body);
    const result = await processInboundEmail(payload);

    const hasHardErrors = result.errors.length > 0 && result.imported.length === 0;
    res.status(hasHardErrors ? 207 : 200).json({
      ok: !hasHardErrors || result.imported.length > 0,
      ...result,
    });
  } catch (error) {
    if (error instanceof EmailIngestError) {
      res.status(error.status).json({
        ok: false,
        error: error.message,
        code: error.code,
      });
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error("[emails/process]", message);
    res.status(500).json({ ok: false, error: message, code: "INTERNAL_ERROR" });
  }
}

function assertIngestAuthorized(req: VercelRequest): void {
  const expected = process.env.INGEST_API_SECRET?.trim();
  if (!expected) {
    throw new EmailIngestError(
      "INGEST_API_SECRET is not configured",
      503,
      "CONFIG_ERROR"
    );
  }

  const provided = String(req.headers["x-ingest-secret"] || "").trim();
  if (!provided || provided !== expected) {
    throw new EmailIngestError("Unauthorized", 401, "UNAUTHORIZED");
  }
}

function parsePayload(body: unknown): InboundEmailPayload {
  if (!body || typeof body !== "object") {
    throw new EmailIngestError("JSON body required", 400, "VALIDATION_ERROR");
  }

  const raw = body as Record<string, unknown>;
  const emailId = String(raw.emailId || raw.email_id || "").trim();
  if (!emailId) {
    throw new EmailIngestError("emailId is required", 400, "VALIDATION_ERROR");
  }

  const attachmentsRaw = Array.isArray(raw.attachments) ? raw.attachments : [];
  const attachments: EmailAttachmentInput[] = attachmentsRaw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new EmailIngestError(
        `attachments[${index}] must be an object`,
        400,
        "VALIDATION_ERROR"
      );
    }
    const att = item as Record<string, unknown>;
    const filename = String(att.filename || att.name || `attachment-${index + 1}`);
    const contentType = String(att.contentType || att.mimeType || att.type || "");
    const data = att.data ?? att.content ?? att.base64;
    if (data == null) {
      throw new EmailIngestError(
        `attachments[${index}].data is required`,
        400,
        "VALIDATION_ERROR"
      );
    }

    return {
      filename,
      contentType,
      data: typeof data === "string" ? data : Buffer.from(data as ArrayBuffer),
      encoding:
        att.encoding === "binary"
          ? "binary"
          : "base64",
    };
  });

  return {
    emailId,
    subject: raw.subject ? String(raw.subject) : undefined,
    from: raw.from ? String(raw.from) : undefined,
    receivedAt: raw.receivedAt ? String(raw.receivedAt) : undefined,
    attachments,
  };
}
