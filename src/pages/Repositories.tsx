import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { repositoryService, DEMO_REPO_ID } from '@/services/repositoryService';
import { Repository } from '@/types';
import { formatRelativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import {
  FolderGit2,
  Plus,
  Search,
  Terminal,
  FileCode,
  RefreshCw,
  Github,
  Loader2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Link2,
  Trash2,
} from 'lucide-react';

function parseGitHubUrl(url: string): { owner: string; name: string } | null {
  const clean = url.trim().replace(/\.git$/, '').replace(/\/$/, '');
  const match = clean.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)/i);
  if (match) {
    return { owner: match[1], name: match[2] };
  }
  const parts = clean.split('/');
  if (parts.length === 2 && parts[0] && parts[1] && !parts[0].includes('http') && !parts[0].includes('.')) {
    return { owner: parts[0], name: parts[1] };
  }
  return null;
}

export function Repositories() {
  const navigate = useNavigate();
  const { isDemoMode } = useAuth();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [reindexingId, setReindexingId] = useState<string | null>(null);

  // Import Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [urlFetching, setUrlFetching] = useState(false);
  const [urlVerifiedInfo, setUrlVerifiedInfo] = useState<string | null>(null);
  const [importOwner, setImportOwner] = useState('');
  const [importName, setImportName] = useState('');
  const [importDesc, setImportDesc] = useState('');
  const [importLang, setImportLang] = useState('TypeScript');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Delete Repository state
  const [repoToDelete, setRepoToDelete] = useState<Repository | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // GitHub integration inside import modal
  const [githubRepos, setGithubRepos] = useState<any[]>([]);
  const [loadingGithubRepos, setLoadingGithubRepos] = useState(false);
  const githubToken = localStorage.getItem('intelcode_github_token');

  const handleOpenDelete = (repo: Repository, e: React.MouseEvent) => {
    e.stopPropagation();
    if (repo.id === DEMO_REPO_ID) {
      alert('The benchmark demo repository is protected and cannot be removed.');
      return;
    }
    setRepoToDelete(repo);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!repoToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await repositoryService.deleteRepository(repoToDelete.id);
      setRepoToDelete(null);
      await loadRepositories();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete repository.';
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    loadRepositories();
  }, []);

  // Automatically refresh if any repository is indexing
  useEffect(() => {
    const isAnyIndexing = repositories.some((r) => r.status === 'indexing');
    if (!isAnyIndexing) return;

    const interval = setInterval(() => {
      loadRepositories();
    }, 2500);

    return () => clearInterval(interval);
  }, [repositories]);

  const loadRepositories = async () => {
    setLoading(true);
    try {
      const data = await repositoryService.getRepositories();
      setRepositories(data);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenImportModal = () => {
    setIsImportModalOpen(true);
    setRepoUrl('');
    setUrlVerifiedInfo(null);
    setImportError(null);
    if (githubToken && githubRepos.length === 0) {
      loadGitHubUserRepos();
    }
  };

  const handleUrlChange = async (url: string) => {
    setRepoUrl(url);
    setUrlVerifiedInfo(null);
    const parsed = parseGitHubUrl(url);
    if (parsed) {
      setImportOwner(parsed.owner);
      setImportName(parsed.name);
      setUrlFetching(true);
      try {
        const res = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.name}`, {
          headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'IntelCode-App' },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.description) setImportDesc(data.description);
          if (data.language) setImportLang(data.language);
          setUrlVerifiedInfo(`Verified: ${data.full_name} (${data.language || 'Code'})`);
        }
      } catch {
        // Ignore network errors
      } finally {
        setUrlFetching(false);
      }
    }
  };

  const loadGitHubUserRepos = async () => {
    if (!githubToken) return;
    setLoadingGithubRepos(true);
    try {
      const res = await fetch('/api/github?action=list_repos', {
        headers: { Authorization: `Bearer ${githubToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGithubRepos(data.repositories || []);
      }
    } catch {
      // Ignore network errors
    } finally {
      setLoadingGithubRepos(false);
    }
  };

  const handleSelectGitHubRepo = (fullName: string) => {
    const chosen = githubRepos.find((r) => r.full_name === fullName);
    if (chosen) {
      setRepoUrl(`https://github.com/${chosen.full_name}`);
      setImportOwner(chosen.owner?.login || chosen.full_name.split('/')[0]);
      setImportName(chosen.name || chosen.full_name.split('/')[1]);
      setImportDesc(chosen.description || '');
      setImportLang(chosen.language || 'TypeScript');
      setUrlVerifiedInfo(`Selected: ${chosen.full_name}`);
    }
  };

  const handleStartImport = async (e: React.FormEvent) => {
    e.preventDefault();

    let owner = importOwner.trim();
    let name = importName.trim();

    if (!owner || !name) {
      const parsed = parseGitHubUrl(repoUrl);
      if (parsed) {
        owner = parsed.owner;
        name = parsed.name;
        setImportOwner(owner);
        setImportName(name);
      }
    }

    if (!owner || !name) {
      setImportError('Please provide a valid GitHub repository URL or specify the Owner and Name.');
      return;
    }

    setImportError(null);
    setIsSubmitting(true);

    try {
      const created = await repositoryService.importRepository({
        owner,
        name,
        description: importDesc.trim() || undefined,
        language: importLang.trim() || 'TypeScript',
        isPrivate: false,
      });

      setIsImportModalOpen(false);
      setRepoUrl('');
      setUrlVerifiedInfo(null);
      setImportOwner('');
      setImportName('');
      setImportDesc('');
      await loadRepositories();
      navigate(`/repositories/${created.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to import repository.';
      setImportError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReindex = async (repo: Repository, e: React.MouseEvent) => {
    e.stopPropagation();
    setReindexingId(repo.id);
    try {
      await repositoryService.triggerReindex(repo.id, repo.full_name);
      await loadRepositories();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reindexing failed.';
      alert(msg);
    } finally {
      setReindexingId(null);
    }
  };

  const filteredRepositories = repositories.filter(
    (repo) =>
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      repo.owner.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (repo.description && repo.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header with Title and Import Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-intel-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-intel-text flex items-center gap-2.5">
            <FolderGit2 className="w-6 h-6 text-intel-accent" />
            <span>Connected Repositories</span>
          </h1>
          <p className="text-sm text-intel-text-secondary mt-1">
            Browse, search, and manage indexed engineering repositories with AST semantic intelligence
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={handleOpenImportModal}
            size="sm"
            className="text-xs h-9 gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Repository</span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-intel-muted" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search repositories by name, owner, or stack..."
            className="pl-9 text-sm h-9 bg-intel-surface border-intel-border"
          />
        </div>
        <div className="flex items-center gap-2 text-xs text-intel-muted font-mono">
          <span>{filteredRepositories.length} indexed repositories</span>
          {isDemoMode && (
            <Badge variant="warning" size="sm" className="font-mono text-xs">
              Demo Workspace
            </Badge>
          )}
        </div>
      </div>

      {/* Main Repository List / Grid */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : filteredRepositories.length === 0 ? (
        <div className="p-12 text-center rounded-lg bg-intel-surface border border-dashed border-intel-border space-y-4">
          <div className="w-12 h-12 rounded-full bg-intel-raised border border-intel-border flex items-center justify-center text-intel-muted mx-auto">
            <FolderGit2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-intel-text">No repositories match your criteria</h3>
            <p className="text-xs text-intel-text-secondary mt-1 max-w-sm mx-auto">
              {searchQuery
                ? `No repository matches "${searchQuery}". Clear your search query to see all indexed codebases.`
                : 'Connect your first GitHub repository to parse AST code trees and start querying.'}
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleOpenImportModal}
            className="text-xs h-9 gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Repository</span>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRepositories.map((repo) => (
            <div
              key={repo.id}
              onClick={() => navigate(`/repositories/${repo.id}`)}
              className="p-4 sm:p-5 rounded-lg bg-intel-surface border border-intel-border hover:border-intel-border-strong hover:bg-intel-raised/40 transition-colors cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h3 className="text-sm font-semibold text-intel-text group-hover:text-intel-accent transition-colors truncate">
                    {repo.owner} / <span className="text-intel-accent">{repo.name}</span>
                  </h3>
                  <Badge
                    variant={
                      repo.status === 'ready'
                        ? 'success'
                        : repo.status === 'indexing'
                        ? 'accent'
                        : repo.status === 'paused'
                        ? 'warning'
                        : repo.status === 'failed'
                        ? 'error'
                        : 'neutral'
                    }
                    size="sm"
                    className="font-mono text-xs uppercase tracking-wider"
                  >
                    {repo.status === 'ready' ? (
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-intel-success" />
                        Indexed
                      </span>
                    ) : repo.status === 'indexing' ? (
                      <span className="flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin text-intel-accent" />
                        Indexing AST
                      </span>
                    ) : repo.status === 'paused' ? (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        Paused (Quota)
                      </span>
                    ) : repo.status === 'failed' ? (
                      <span className="flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-intel-error" />
                        Failed
                      </span>
                    ) : (
                      repo.status
                    )}
                  </Badge>

                  {repo.language && (
                    <span className="text-xs font-mono text-intel-muted px-2 py-0.5 rounded bg-intel-raised border border-intel-border">
                      {repo.language}
                    </span>
                  )}
                </div>

                {repo.description && (
                  <p className="text-xs text-intel-text-secondary line-clamp-1">
                    {repo.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs font-mono text-intel-muted">
                  <span className="flex items-center gap-1">
                    <FileCode className="w-3.5 h-3.5" />
                    <span>{repo.files_count} files</span>
                  </span>
                  <span>•</span>
                  <span>{repo.chunks_count} AST vector chunks</span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {repo.last_indexed_at
                        ? `Indexed ${formatRelativeTime(repo.last_indexed_at)}`
                        : 'Never indexed'}
                    </span>
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 sm:self-center">
                <Button
                  variant={repo.status === 'failed' ? 'danger' : 'outline'}
                  size="sm"
                  disabled={reindexingId === repo.id}
                  onClick={(e) => handleReindex(repo, e)}
                  className={`text-xs h-8 gap-1.5 ${
                    repo.status === 'failed'
                      ? 'border-intel-error/40 text-intel-error hover:bg-intel-error/10'
                      : 'border-intel-border text-intel-text-secondary hover:text-intel-text'
                  }`}
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      reindexingId === repo.id ? 'animate-spin text-intel-accent' : ''
                    }`}
                  />
                  <span>{repo.status === 'paused' ? 'Resume Index' : repo.status === 'failed' ? 'Retry Index' : 'Re-index'}</span>
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/repositories/${repo.id}`);
                  }}
                  className="text-xs h-8"
                >
                  Explore
                </Button>
                {repo.id !== DEMO_REPO_ID && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleOpenDelete(repo, e)}
                    title="Remove repository from IntelCode"
                    className="text-xs h-8 px-2.5 gap-1.5 text-intel-muted hover:text-intel-error hover:bg-intel-error/10 border border-transparent hover:border-intel-error/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Remove</span>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Connect Repository Modal */}
      <Dialog
        isOpen={isImportModalOpen}
        onClose={() => {
          if (!isSubmitting) setIsImportModalOpen(false);
        }}
        title="Connect & Index Repository"
        description="Provide a GitHub repository to parse AST code structure, extract commit diffs, and generate vector embeddings."
        maxWidth="md"
      >
        <form onSubmit={handleStartImport} className="space-y-4 pt-2">
          {importError && (
            <div className="p-3 rounded-md bg-intel-error/10 border border-intel-error/20 flex items-start gap-2.5 text-xs text-intel-error">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{importError}</span>
            </div>
          )}

          {/* Connect via Repository URL or Slug */}
          <div className="space-y-2 p-3.5 rounded-lg bg-intel-raised border border-intel-border">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-intel-text flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-intel-accent" />
                <span>GitHub Repository URL or Slug</span>
              </label>
              {urlFetching && (
                <span className="text-[11px] text-intel-muted flex items-center gap-1 font-mono">
                  <Loader2 className="w-3 h-3 animate-spin text-intel-accent" /> Detecting repository...
                </span>
              )}
              {urlVerifiedInfo && (
                <span className="text-[11px] text-intel-success flex items-center gap-1 font-mono">
                  <CheckCircle2 className="w-3 h-3 text-intel-success" /> {urlVerifiedInfo}
                </span>
              )}
            </div>
            <Input
              value={repoUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="https://github.com/facebook/react or facebook/react"
              className="text-sm h-9 bg-intel-surface border-intel-border focus:border-intel-accent"
              autoFocus
            />
            <p className="text-[11px] text-intel-text-secondary">
              Paste any GitHub repository link (e.g. <code className="text-intel-text font-mono">https://github.com/facebook/react</code>) to auto-fill owner, name, and stack details.
            </p>
          </div>

          {/* GitHub Connected Repos Picker */}
          {githubToken ? (
            <div className="p-3 rounded-md bg-intel-raised border border-intel-border space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-intel-text flex items-center gap-1.5">
                  <Github className="w-3.5 h-3.5 text-intel-warning" />
                  <span>Or Pick from Your Connected GitHub Account</span>
                </span>
                {loadingGithubRepos && (
                  <span className="text-intel-muted flex items-center gap-1 font-mono">
                    <Loader2 className="w-3 h-3 animate-spin" /> Loading repos...
                  </span>
                )}
              </div>

              {githubRepos.length > 0 ? (
                <select
                  onChange={(e) => handleSelectGitHubRepo(e.target.value)}
                  className="w-full text-xs h-9 bg-intel-surface border border-intel-border rounded px-2.5 text-intel-text focus:outline-none focus:border-intel-accent"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose a GitHub repository to auto-fill...
                  </option>
                  {githubRepos.map((r) => (
                    <option key={r.id} value={r.full_name}>
                      {r.full_name} ({r.language || 'Code'})
                    </option>
                  ))}
                </select>
              ) : !loadingGithubRepos ? (
                <div className="text-xs text-intel-muted">
                  No repositories found on this GitHub account, or token expired.
                </div>
              ) : null}
            </div>
          ) : (
            <div className="p-3 rounded-md bg-intel-raised border border-intel-border flex items-center justify-between text-xs text-intel-text-secondary">
              <span className="flex items-center gap-1.5">
                <Github className="w-3.5 h-3.5 text-intel-warning" />
                <span>Have private repositories? Connect GitHub in Settings.</span>
              </span>
              <Link
                to="/settings"
                className="text-xs text-intel-accent hover:underline font-medium"
              >
                Go to Settings
              </Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-intel-text">Owner / Organization</label>
              <Input
                value={importOwner}
                onChange={(e) => setImportOwner(e.target.value)}
                placeholder="e.g. facebook or acme-org"
                required
                className="text-sm h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-intel-text">Repository Name</label>
              <Input
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder="e.g. react or gateway"
                required
                className="text-sm h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-intel-text">Primary Language</label>
            <Input
              value={importLang}
              onChange={(e) => setImportLang(e.target.value)}
              placeholder="e.g. TypeScript, Python, Go, Rust"
              className="text-sm h-9"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-intel-text">Description (Optional)</label>
            <Input
              value={importDesc}
              onChange={(e) => setImportDesc(e.target.value)}
              placeholder="Brief summary of repository architecture"
              className="text-sm h-9"
            />
          </div>

          <div className="p-3 rounded bg-intel-surface border border-intel-border text-xs text-intel-text-secondary space-y-1">
            <div className="flex items-center gap-1.5 text-intel-text font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-intel-success" />
              <span>Ingestion Pipeline Safeguards</span>
            </div>
            <p>
              Sensitive files (<code className="font-mono text-intel-warning">.env</code>, keys, credentials, binary packages) are automatically excluded during the AST parsing pass.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => setIsImportModalOpen(false)}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="text-xs h-9 gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Connect & Index</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog
        isOpen={!!repoToDelete}
        onClose={() => {
          if (!isDeleting) setRepoToDelete(null);
        }}
        title="Remove Repository"
        description="Permanently remove this repository and all indexed metadata from IntelCode."
        maxWidth="md"
      >
        <div className="space-y-4">
          {deleteError && (
            <div className="p-3 rounded-md bg-intel-error/10 border border-intel-error/20 flex items-start gap-2.5 text-xs text-intel-error">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{deleteError}</span>
            </div>
          )}

          <div className="p-3.5 rounded-lg bg-intel-raised border border-intel-border text-xs sm:text-sm text-intel-text-secondary space-y-2">
            <p>
              Are you sure you want to remove{' '}
              <strong className="text-intel-text font-mono font-bold">
                {repoToDelete?.full_name}
              </strong>{' '}
              from IntelCode?
            </p>
            <p className="text-xs text-intel-muted">
              This will permanently delete:
            </p>
            <ul className="list-disc list-inside text-xs text-intel-muted space-y-1 font-mono">
              <li>All indexed code files and AST syntax trees</li>
              <li>All 512-d Voyage vector embeddings and lexical search indexes</li>
              <li>All commit history, pull request links, and issue telemetry</li>
              <li>All conversational threads and citations associated with this repository</li>
            </ul>
          </div>

          <div className="p-3 rounded-md bg-intel-error/10 border border-intel-error/20 text-xs text-intel-error font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>This action cannot be undone.</span>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDeleting}
              onClick={() => setRepoToDelete(null)}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="text-xs h-9 gap-1.5"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Removing...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Repository</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
