-- ==============================================================================
-- IntelCode Database Migration: Voyage Code 4 (512-dimension) Embeddings Upgrade
-- Safe, non-destructive migration supporting staged cutover and instant rollback.
-- ==============================================================================

-- 1. Ensure pgvector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add 512-dimension vector columns and metadata to chunks
ALTER TABLE public.chunks
  ADD COLUMN IF NOT EXISTS embedding_v4 vector(512),
  ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'voyage-code-4',
  ADD COLUMN IF NOT EXISTS embedding_dimension INT DEFAULT 512,
  ADD COLUMN IF NOT EXISTS chunk_hash TEXT;

-- 3. Add 512-dimension vector columns to documents
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS embedding_v4 vector(512),
  ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'voyage-code-4',
  ADD COLUMN IF NOT EXISTS embedding_dimension INT DEFAULT 512;

-- 4. Add embedding model and indexing version metadata to repositories
ALTER TABLE public.repositories
  ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'voyage-code-4',
  ADD COLUMN IF NOT EXISTS embedding_dimension INT DEFAULT 512,
  ADD COLUMN IF NOT EXISTS indexing_version TEXT DEFAULT 'v2-voyage4-ast';

-- 5. Add resilient checkpointing columns to indexing_jobs
ALTER TABLE public.indexing_jobs
  ADD COLUMN IF NOT EXISTS current_file_index INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_files INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS checkpoint_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS failed_files JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS batch_status TEXT DEFAULT 'pending';

-- 6. Indexes for 512-dimensional vector similarity and chunk hashing
-- HNSW provides fast similarity search and does not require pre-populating rows.
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_v4
  ON public.chunks USING hnsw (embedding_v4 vector_cosine_ops);

CREATE INDEX IF NOT EXISTS idx_chunks_chunk_hash
  ON public.chunks(chunk_hash);

CREATE INDEX IF NOT EXISTS idx_docs_embedding_v4
  ON public.documents USING hnsw (embedding_v4 vector_cosine_ops);

-- 7. Overload hybrid_search_chunks for 512-dimensional Voyage Code 4 embeddings
-- Retains existing hybrid_search_chunks(vector(768)) for backward compatibility/rollback.
CREATE OR REPLACE FUNCTION public.hybrid_search_chunks(
  query_text TEXT,
  query_embedding vector(512),
  target_repo_id UUID,
  match_count INT DEFAULT 10,
  full_text_weight FLOAT DEFAULT 0.3,
  semantic_weight FLOAT DEFAULT 0.7,
  rrf_k INT DEFAULT 60
)
RETURNS TABLE (
  chunk_id UUID,
  file_id UUID,
  file_path TEXT,
  language TEXT,
  symbol_name TEXT,
  symbol_type TEXT,
  start_line INT,
  end_line INT,
  content TEXT,
  combined_score FLOAT,
  semantic_score FLOAT,
  lexical_score FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Strict authorization check: caller must have valid access to target repository
  IF NOT public.has_repo_access(target_repo_id) THEN
    RAISE EXCEPTION 'Access denied: You do not have permission to query repository %', target_repo_id;
  END IF;

  RETURN QUERY
  WITH semantic_matches AS (
    SELECT
      c.id,
      1 - (c.embedding_v4 <=> query_embedding) AS sem_score,
      ROW_NUMBER() OVER (ORDER BY c.embedding_v4 <=> query_embedding) AS sem_rank
    FROM public.chunks c
    WHERE c.repository_id = target_repo_id
      AND c.embedding_v4 IS NOT NULL
    LIMIT match_count * 3
  ),
  lexical_matches AS (
    SELECT
      c.id,
      ts_rank_cd(c.fts_tokens, plainto_tsquery('english', query_text)) AS lex_score,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(c.fts_tokens, plainto_tsquery('english', query_text)) DESC) AS lex_rank
    FROM public.chunks c
    WHERE c.repository_id = target_repo_id
      AND c.fts_tokens @@ plainto_tsquery('english', query_text)
    LIMIT match_count * 3
  ),
  fused AS (
    SELECT
      COALESCE(s.id, l.id) AS id,
      COALESCE(s.sem_score, 0)::FLOAT AS s_score,
      COALESCE(l.lex_score, 0)::FLOAT AS l_score,
      -- Reciprocal Rank Fusion (RRF) with configurable weights
      (COALESCE(1.0 / (rrf_k + s.sem_rank), 0.0) * semantic_weight +
       COALESCE(1.0 / (rrf_k + l.lex_rank), 0.0) * full_text_weight) AS rrf_score
    FROM semantic_matches s
    FULL OUTER JOIN lexical_matches l ON s.id = l.id
  )
  SELECT
    c.id AS chunk_id,
    c.file_id,
    f.path AS file_path,
    c.language,
    c.symbol_name,
    c.symbol_type,
    c.start_line,
    c.end_line,
    c.content,
    fused.rrf_score::FLOAT AS combined_score,
    fused.s_score::FLOAT AS semantic_score,
    fused.l_score::FLOAT AS lexical_score
  FROM fused
  JOIN public.chunks c ON c.id = fused.id
  JOIN public.files f ON c.file_id = f.id
  WHERE c.repository_id = target_repo_id
  ORDER BY fused.rrf_score DESC
  LIMIT match_count;
END;
$$;

-- 8. Explicit hybrid_search_chunks_v4 function for direct targeting of Voyage 4 embeddings
CREATE OR REPLACE FUNCTION public.hybrid_search_chunks_v4(
  query_text TEXT,
  query_embedding vector(512),
  target_repo_id UUID,
  match_count INT DEFAULT 10,
  full_text_weight FLOAT DEFAULT 0.3,
  semantic_weight FLOAT DEFAULT 0.7,
  rrf_k INT DEFAULT 60
)
RETURNS TABLE (
  chunk_id UUID,
  file_id UUID,
  file_path TEXT,
  language TEXT,
  symbol_name TEXT,
  symbol_type TEXT,
  start_line INT,
  end_line INT,
  content TEXT,
  combined_score FLOAT,
  semantic_score FLOAT,
  lexical_score FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.hybrid_search_chunks(
    query_text,
    query_embedding,
    target_repo_id,
    match_count,
    full_text_weight,
    semantic_weight,
    rrf_k
  );
END;
$$;
