# Supabase Database Rollback Scripts

This directory contains manual rollback scripts for IntelCode database schema changes.

> [!WARNING]
> **Manual Execution Only:**
> Scripts in this folder are intended for manual disaster recovery or emergency rollbacks in the Supabase Dashboard SQL Editor.
> They are intentionally placed outside of `supabase/migrations/` so that automated migration runners (e.g., `supabase db push`, `supabase migration up`) never execute destructive rollback commands automatically.

## Available Rollback Scripts

- **`20261017000000_voyage_code_4_rollback.sql`**:
  - Reverts the 512-dimensional Voyage Code 4 vector migration (`20261017000000_voyage_code_4_embeddings.sql`).
  - Drops `embedding_v4`, HNSW indexes, checkpoint columns, and 512-d `hybrid_search_chunks` functions.
  - Leaves original 768-d vectors and baseline schema completely intact.
