-- Migration: Add progress column to rag_ingest_jobs
-- Description: Adds numeric progress (0-100) for job tracking, keeping payload progress as fallback
-- Date: 2025-08-29

alter table if exists public.rag_ingest_jobs
  add column if not exists progress integer default 0 check (progress >= 0 and progress <= 100);

comment on column public.rag_ingest_jobs.progress is 'Job completion percentage (0-100). Also mirrored in payload.progress for backward compatibility.';


