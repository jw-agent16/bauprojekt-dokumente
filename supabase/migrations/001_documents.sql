-- documents table + storage folder convention: bucket "documents"
-- Run in Supabase SQL editor (or via CLI migration).

create extension if not exists "pgcrypto";

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  file_url text not null,
  created_at timestamptz not null default now(),
  is_read boolean not null default false,
  email_id text not null,
  doc_type text not null default 'Sonstige'
    check (doc_type in ('Offerte', 'Rechnung', 'Bauplan', 'Sonstige')),
  mime_type text,
  size_bytes bigint,
  storage_path text,
  unique (email_id, filename)
);

create index if not exists documents_created_at_idx on public.documents (created_at desc);
create index if not exists documents_email_id_idx on public.documents (email_id);
create index if not exists documents_is_read_idx on public.documents (is_read);

comment on table public.documents is 'Imported email attachments for Bauprojekt S9';
comment on column public.documents.email_id is 'Provider message id (Gmail/Resend/etc.)';
