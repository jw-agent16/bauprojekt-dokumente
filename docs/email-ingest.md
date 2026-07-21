## Email → Storage → documents

Verarbeitet eingehende Mails mit Anhängen und legt Datensätze in Supabase an.

### Setup

1. Migration ausführen: `supabase/migrations/001_documents.sql`
2. In Supabase Storage einen Bucket **`documents`** anlegen (public oder signed URLs)
3. Vercel Env Vars setzen:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `INGEST_API_SECRET` (beliebiges Geheimnis)

### API

`POST /api/emails/process`  
Header: `x-ingest-secret: <INGEST_API_SECRET>`  
Content-Type: `application/json`

```json
{
  "emailId": "msg-123",
  "subject": "Rechnung März",
  "from": "buchhaltung@firma.ch",
  "attachments": [
    {
      "filename": "rechnung.pdf",
      "contentType": "application/pdf",
      "encoding": "base64",
      "data": "<base64>"
    }
  ]
}
```

### Verhalten

1. Prüft Anhänge (PDF, JPEG, PNG, WebP, GIF)
2. Speichert unter Bucket `documents` → Pfad `<emailId>/<stamp>_<filename>`
3. Insert in Tabelle `documents` (`is_read` default `false`, `doc_type` heuristisch)
4. Idempotent über Unique `(email_id, filename)`

### Anbindung an Gmail

Bestehendes Apps Script kann nach dem Speichern in Drive dieselbe Mail an diese Route posten (Base64-Anhang + `emailId`). Alternativ Inbound-Parse (Resend/SendGrid) auf diese URL zeigen.
