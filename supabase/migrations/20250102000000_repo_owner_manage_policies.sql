-- ==============================================================================
-- IntelCode: Add write policies for repository members and owners
-- Allows authenticated users with repository access to manage indexing jobs,
-- files, chunks, commits, pull requests, issues, and documents.
-- ==============================================================================

-- Indexing Jobs
DROP POLICY IF EXISTS "Repo members can insert indexing jobs" ON public.indexing_jobs;
CREATE POLICY "Repo members can insert indexing jobs"
  ON public.indexing_jobs FOR INSERT
  WITH CHECK (public.has_repo_access(repository_id));

DROP POLICY IF EXISTS "Repo members can update indexing jobs" ON public.indexing_jobs;
CREATE POLICY "Repo members can update indexing jobs"
  ON public.indexing_jobs FOR UPDATE
  USING (public.has_repo_access(repository_id));

-- Files
DROP POLICY IF EXISTS "Repo members can manage files" ON public.files;
CREATE POLICY "Repo members can manage files"
  ON public.files FOR ALL
  USING (public.has_repo_access(repository_id))
  WITH CHECK (public.has_repo_access(repository_id));

-- Chunks
DROP POLICY IF EXISTS "Repo members can manage chunks" ON public.chunks;
CREATE POLICY "Repo members can manage chunks"
  ON public.chunks FOR ALL
  USING (public.has_repo_access(repository_id))
  WITH CHECK (public.has_repo_access(repository_id));

-- Commits
DROP POLICY IF EXISTS "Repo members can manage commits" ON public.commits;
CREATE POLICY "Repo members can manage commits"
  ON public.commits FOR ALL
  USING (public.has_repo_access(repository_id))
  WITH CHECK (public.has_repo_access(repository_id));

-- Pull Requests
DROP POLICY IF EXISTS "Repo members can manage pull requests" ON public.pull_requests;
CREATE POLICY "Repo members can manage pull requests"
  ON public.pull_requests FOR ALL
  USING (public.has_repo_access(repository_id))
  WITH CHECK (public.has_repo_access(repository_id));

-- Issues
DROP POLICY IF EXISTS "Repo members can manage issues" ON public.issues;
CREATE POLICY "Repo members can manage issues"
  ON public.issues FOR ALL
  USING (public.has_repo_access(repository_id))
  WITH CHECK (public.has_repo_access(repository_id));

-- Documents
DROP POLICY IF EXISTS "Repo members can manage documents" ON public.documents;
CREATE POLICY "Repo members can manage documents"
  ON public.documents FOR ALL
  USING (public.has_repo_access(repository_id))
  WITH CHECK (public.has_repo_access(repository_id));
