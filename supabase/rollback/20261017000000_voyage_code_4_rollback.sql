-- ==============================================================================
-- IntelCode Database Migration Rollback: Revert Voyage Code 4 (512-d) Embeddings
-- Safely removes 512-d vector columns, indexes, and restores legacy 768-d functions.
--
-- MANUAL EXECUTION ONLY:
-- Do NOT place this file inside supabase/migrations/ or execute via automatic migration runners.
-- Run manually in Supabase SQL Editor ONLY if rolling back the Voyage Code 4 migration.
-- ==============================================================================

-- 1. Drop 512-dimension vector functions
DROP FUNCTION IF EXISTS public.hybrid_search_chunks_v4(TEXT, vector(512), UUID, INT, FLOAT, FLOAT, INT);
DROP FUNCTION IF EXISTS public.hybrid_search_chunks(TEXT, vector(512), UUID, INT, FLOAT, FLOAT, INT);

-- 2. Drop 512-dimension indexes
DROP INDEX IF EXISTS public.idx_chunks_embedding_v4;
DROP INDEX IF EXISTS public.idx_chunks_chunk_hash;
DROP INDEX IF EXISTS public.idx_docs_embedding_v4;

-- 3. Drop checkpoint columns from indexing_jobs
ALTER TABLE public.indexing_jobs
  DROP COLUMN IF EXISTS current_file_index,
  DROP COLUMN IF EXISTS total_files,
  DROP COLUMN IF EXISTS checkpoint_data,
  DROP COLUMN IF EXISTS failed_files,
  DROP COLUMN IF EXISTS batch_status;

-- 4. Drop metadata columns from repositories
ALTER TABLE public.repositories
  DROP COLUMN IF EXISTS embedding_model,
  DROP COLUMN IF EXISTS embedding_dimension,
  DROP COLUMN IF EXISTS indexing_version;

-- 5. Drop 512-dimension columns from documents
ALTER TABLE public.documents
  DROP COLUMN IF EXISTS embedding_v4,
  DROP COLUMN IF EXISTS embedding_model,
  DROP COLUMN IF EXISTS embedding_dimension;

-- 6. Drop 512-dimension columns from chunks
ALTER TABLE public.chunks
  DROP COLUMN IF EXISTS embedding_v4,
  DROP COLUMN IF EXISTS embedding_model,
  DROP COLUMN IF EXISTS embedding_dimension,
  DROP COLUMN IF EXISTS chunk_hash;

-- Existing 768-dimension vectors and public.hybrid_search_chunks(TEXT, vector(768), UUID, ...) remain untouched and fully active.
