-- Enable pgvector extension for code semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. PROFILES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 2. REPOSITORIES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_repo_id BIGINT,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  description TEXT,
  language TEXT,
  is_private BOOLEAN NOT NULL DEFAULT false,
  files_count INT NOT NULL DEFAULT 0,
  chunks_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ready', -- 'idle', 'indexing', 'ready', 'failed'
  last_indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 3. REPOSITORY MEMBERS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.repository_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner', -- 'owner', 'collaborator', 'viewer'
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(repository_id, user_id)
);

-- ==============================================================================
-- 4. FILES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  language TEXT,
  sha TEXT,
  content TEXT,
  size INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(repository_id, path)
);

-- ==============================================================================
-- 5. CHUNKS (AST / Semantic Code Segments)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(768), -- Gemini text-embedding-004 standard dimension
  language TEXT,
  symbol_name TEXT,
  symbol_type TEXT, -- 'function', 'class', 'method', 'interface', 'type', 'module', 'constant'
  start_line INT NOT NULL DEFAULT 1,
  end_line INT NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  fts_tokens tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(symbol_name, '') || ' ' || coalesce(content, ''))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 6. COMMITS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  sha TEXT NOT NULL,
  message TEXT NOT NULL,
  author TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  diff TEXT,
  changed_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(repository_id, sha)
);

-- ==============================================================================
-- 7. PULL REQUESTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.pull_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  github_number INT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  author TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open', -- 'open', 'closed', 'merged'
  diff TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  merged_at TIMESTAMPTZ,
  UNIQUE(repository_id, github_number)
);

-- ==============================================================================
-- 8. ISSUES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  github_number INT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  author TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open', -- 'open', 'closed'
  labels JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  closed_at TIMESTAMPTZ,
  UNIQUE(repository_id, github_number)
);

-- ==============================================================================
-- 9. DOCUMENTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(768),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  fts_tokens tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || content)) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(repository_id, path)
);

-- ==============================================================================
-- 10. CONVERSATIONS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 11. MESSAGES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL, -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 12. GITHUB CONNECTIONS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.github_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  access_token TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id)
);

-- ==============================================================================
-- 13. INDEXING JOBS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.indexing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES public.repositories(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'fetching', 'chunking', 'embedding', 'completed', 'failed'
  progress INT NOT NULL DEFAULT 0,
  files_processed INT NOT NULL DEFAULT 0,
  chunks_created INT NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- INDEXES FOR PERFORMANCE
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_chunks_repo ON public.chunks(repository_id);
CREATE INDEX IF NOT EXISTS idx_chunks_file ON public.chunks(file_id);
CREATE INDEX IF NOT EXISTS idx_chunks_fts ON public.chunks USING GIN(fts_tokens);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON public.chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_docs_repo ON public.documents(repository_id);
CREATE INDEX IF NOT EXISTS idx_docs_fts ON public.documents USING GIN(fts_tokens);

CREATE INDEX IF NOT EXISTS idx_commits_repo ON public.commits(repository_id);
CREATE INDEX IF NOT EXISTS idx_prs_repo ON public.pull_requests(repository_id);
CREATE INDEX IF NOT EXISTS idx_issues_repo ON public.issues(repository_id);
CREATE INDEX IF NOT EXISTS idx_files_repo ON public.files(repository_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_repo ON public.conversations(user_id, repository_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages(conversation_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repository_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pull_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indexing_jobs ENABLE ROW LEVEL SECURITY;

-- Helper security function: Check repository access
CREATE OR REPLACE FUNCTION public.has_repo_access(check_repo_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.repositories r
    WHERE r.id = check_repo_id AND r.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.repository_members rm
    WHERE rm.repository_id = check_repo_id AND rm.user_id = auth.uid()
  );
$$;

-- Profiles: Own profile access
CREATE POLICY "Users can manage own profile"
  ON public.profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Repositories: Access if owner or member
CREATE POLICY "Users can view their accessible repositories"
  ON public.repositories FOR SELECT
  USING (user_id = auth.uid() OR public.has_repo_access(id));

CREATE POLICY "Users can create own repositories"
  ON public.repositories FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners can update their repositories"
  ON public.repositories FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Owners can delete their repositories"
  ON public.repositories FOR DELETE
  USING (user_id = auth.uid());

-- Repository Members
CREATE POLICY "Users can view members of accessible repositories"
  ON public.repository_members FOR SELECT
  USING (public.has_repo_access(repository_id));

-- Files, Chunks, Commits, PRs, Issues, Documents, Indexing Jobs
CREATE POLICY "Repo members can view files"
  ON public.files FOR SELECT
  USING (public.has_repo_access(repository_id));

CREATE POLICY "Repo members can view chunks"
  ON public.chunks FOR SELECT
  USING (public.has_repo_access(repository_id));

CREATE POLICY "Repo members can view commits"
  ON public.commits FOR SELECT
  USING (public.has_repo_access(repository_id));

CREATE POLICY "Repo members can view pull requests"
  ON public.pull_requests FOR SELECT
  USING (public.has_repo_access(repository_id));

CREATE POLICY "Repo members can view issues"
  ON public.issues FOR SELECT
  USING (public.has_repo_access(repository_id));

CREATE POLICY "Repo members can view documents"
  ON public.documents FOR SELECT
  USING (public.has_repo_access(repository_id));

CREATE POLICY "Repo members can view indexing jobs"
  ON public.indexing_jobs FOR SELECT
  USING (public.has_repo_access(repository_id));

-- Conversations
CREATE POLICY "Users can manage own conversations"
  ON public.conversations FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Messages
CREATE POLICY "Users can manage messages in their conversations"
  ON public.messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- GitHub Connections
CREATE POLICY "Users can manage own GitHub connection"
  ON public.github_connections FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ==============================================================================
-- HYBRID RETRIEVAL FUNCTION
-- Combines pgvector Cosine Distance and Postgres Full-Text Search Rank
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.hybrid_search_chunks(
  query_text TEXT,
  query_embedding vector(768),
  target_repo_id UUID,
  match_count INT DEFAULT 10,
  full_text_weight FLOAT DEFAULT 0.3,
  semantic_weight FLOAT DEFAULT 0.7
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
  -- Enforce authorization check: caller must have valid access to target repository
  IF NOT public.has_repo_access(target_repo_id) THEN
    RAISE EXCEPTION 'Access denied: You do not have permission to query repository %', target_repo_id;
  END IF;

  RETURN QUERY
  WITH semantic_matches AS (
    SELECT
      c.id,
      1 - (c.embedding <=> query_embedding) AS sem_score
    FROM public.chunks c
    WHERE c.repository_id = target_repo_id
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  lexical_matches AS (
    SELECT
      c.id,
      ts_rank_cd(c.fts_tokens, plainto_tsquery('english', query_text)) AS lex_score
    FROM public.chunks c
    WHERE c.repository_id = target_repo_id
      AND c.fts_tokens @@ plainto_tsquery('english', query_text)
    LIMIT match_count * 2
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
    COALESCE(s.sem_score, 0) * semantic_weight + COALESCE(l.lex_score, 0) * full_text_weight AS combined_score,
    COALESCE(s.sem_score, 0)::FLOAT AS semantic_score,
    COALESCE(l.lex_score, 0)::FLOAT AS lexical_score
  FROM public.chunks c
  JOIN public.files f ON c.file_id = f.id
  LEFT JOIN semantic_matches s ON c.id = s.id
  LEFT JOIN lexical_matches l ON c.id = l.id
  WHERE c.repository_id = target_repo_id
    AND (s.id IS NOT NULL OR l.id IS NOT NULL)
  ORDER BY combined_score DESC
  LIMIT match_count;
END;
$$;
