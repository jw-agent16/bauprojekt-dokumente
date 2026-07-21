import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new EmailIngestError(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      503,
      "CONFIG_ERROR"
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export const STORAGE_BUCKET = "documents";

export class EmailIngestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 500, code = "INGEST_ERROR") {
    super(message);
    this.name = "EmailIngestError";
    this.status = status;
    this.code = code;
  }
}
