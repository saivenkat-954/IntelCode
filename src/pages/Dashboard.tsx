import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { repositoryService } from '@/services/repositoryService';
import { Repository, CommitItem, PullRequestItem, IssueItem } from '@/types';
import { formatRelativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuth } from '@/hooks/useAuth';
import {
  FolderGit2,
  FileCode,
  Layers,
  Activity,
  Plus,
  GitCommit,
  GitPullRequest,
  Search,
  MessageSquare,
  ArrowRight,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  GitBranch,
} from 'lucide-react';

export function Dashboard() {
  const navigate = useNavigate();
  const { isDemoMode } = useAuth();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [recentCommits, setRecentCommits] = useState<CommitItem[]>([]);
  const [recentPRs, setRecentPRs] = useState<PullRequestItem[]>([]);
  const [recentIssues, setRecentIssues] = useState<IssueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const repos = await repositoryService.getRepositories();
      setRepositories(repos);

      if (repos.length > 0) {
        const firstRepoId = repos[0].id;
        const [commits, prs, issues] = await Promise.all([
          repositoryService.getCommits(firstRepoId),
          repositoryService.getPullRequests(firstRepoId),
          repositoryService.getIssues(firstRepoId),
        ]);
        setRecentCommits(commits.slice(0, 5));
        setRecentPRs(prs.slice(0, 3));
        setRecentIssues(issues.slice(0, 3));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load workspace data.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const totalFiles = repositories.reduce((sum, r) => sum + (r.files_count || 0), 0);
  const totalChunks = repositories.reduce((sum, r) => sum + (r.chunks_count || 0), 0);

  return (
    <div className="p-5 sm:p-8 max-w-6xl mx-auto space-y-7">
      {/* 1. Clear Page Heading, One-Line Description, Contextual Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-intel-border">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-intel-text">
              Engineering Workspace
            </h1>
            {isDemoMode && (
              <Badge variant="warning" size="sm" className="font-mono text-xs">
                Demo Benchmark
              </Badge>
            )}
          </div>
          <p className="text-sm text-intel-text-secondary mt-1">
            Connected repositories, semantic index health, and Git change telemetry.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboardData}
            className="text-xs h-9 gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync</span>
          </Button>

          <Button
            size="sm"
            onClick={() => navigate('/repositories')}
            className="text-xs h-9 gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Repository</span>
          </Button>
        </div>
      </div>

      {/* Error state banner with retry */}
      {error && (
        <div className="p-4 rounded-lg bg-intel-error/10 border border-intel-error/20 flex items-center justify-between gap-3 text-xs sm:text-sm text-intel-error">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboardData}
            className="text-xs h-7 border-intel-error/30 text-intel-error hover:bg-intel-error/10"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Demo Workspace Banner */}
      {isDemoMode && (
        <div className="p-4 rounded-lg bg-intel-surface border border-intel-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-intel-accent shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-intel-text">
                Benchmark Demo Dataset Active
              </p>
              <p className="text-xs sm:text-sm text-intel-text-secondary mt-0.5">
                Exploring <code className="text-intel-accent font-mono text-xs">acme-org/intel-gateway</code> with 5 indexed source files, 14 AST chunks, and genuine Git commit diffs.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/repositories')}
            className="text-xs h-8 shrink-0 self-start sm:self-auto"
          >
            Connect Own GitHub
          </Button>
        </div>
      )}

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-16 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : repositories.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
          title="No repositories connected"
          description="Connect a GitHub repository to index code, pull requests, and commit history into your searchable knowledge layer."
          actionLabel="Connect GitHub Repository"
          onAction={() => navigate('/repositories')}
        />
      ) : (
        <>
          {/* 2. Compact Horizontal Metric Summary Bar */}
          <div className="p-4 rounded-lg bg-intel-surface border border-intel-border flex flex-wrap items-center justify-between gap-4 text-xs sm:text-sm">
            <div className="flex items-center gap-6 divide-x divide-intel-border">
              <div className="space-y-0.5">
                <span className="text-xs font-mono text-intel-muted uppercase tracking-wider block">
                  Repositories
                </span>
                <span className="text-lg font-bold font-mono text-intel-text">
                  {repositories.length} Active
                </span>
              </div>

              <div className="pl-6 space-y-0.5">
                <span className="text-xs font-mono text-intel-muted uppercase tracking-wider block">
                  Indexed Files
                </span>
                <span className="text-lg font-bold font-mono text-intel-text">
                  {totalFiles} ({totalChunks} Chunks)
                </span>
              </div>

              <div className="pl-6 space-y-0.5 hidden md:block">
                <span className="text-xs font-mono text-intel-muted uppercase tracking-wider block">
                  Git History
                </span>
                <span className="text-lg font-bold font-mono text-intel-text">
                  {recentCommits.length + recentPRs.length} Tracked Changes
                </span>
              </div>
            </div>

            <Button
              size="sm"
              onClick={() => {
                if (repositories.length > 0) {
                  navigate(`/repositories/${repositories[0].id}?tab=ask`);
                } else {
                  navigate('/repositories');
                }
              }}
              className="text-xs h-8 gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Ask IntelCode</span>
            </Button>
          </div>

          {/* 3. Prominent Repository List */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-intel-text flex items-center gap-2">
                <FolderGit2 className="w-4 h-4 text-intel-accent" />
                <span>Connected Repositories</span>
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/repositories')}
                className="text-xs h-7 text-intel-text-secondary hover:text-intel-text"
              >
                View all ({repositories.length})
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {repositories.map((repo) => (
                <div
                  key={repo.id}
                  onClick={() => navigate(`/repositories/${repo.id}`)}
                  className="group p-5 rounded-lg bg-intel-surface border border-intel-border hover:border-intel-border-strong hover:bg-intel-raised/40 transition-all cursor-pointer flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-base font-semibold text-intel-text group-hover:text-intel-accent transition-colors truncate">
                        {repo.full_name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {repo.is_private && (
                          <Badge variant="neutral" size="sm" className="text-xs">
                            Private
                          </Badge>
                        )}
                        <Badge variant="success" size="sm" className="text-xs">
                          {repo.status}
                        </Badge>
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm text-intel-text-secondary line-clamp-2 leading-relaxed">
                      {repo.description || 'No description provided.'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-intel-border/50 text-xs text-intel-muted font-mono">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="text-intel-text font-medium">{repo.language}</span>
                      <span>•</span>
                      <span>{repo.files_count} files</span>
                      <span>•</span>
                      <span>{repo.chunks_count} chunks</span>
                    </div>

                    <div className="flex items-center gap-1 text-intel-text-secondary group-hover:text-intel-accent transition-colors">
                      <span className="text-xs">Open</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Engineering Activity Telemetry */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* Commits */}
            <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-3">
              <div className="flex items-center justify-between pb-2.5 border-b border-intel-border">
                <span className="text-sm font-semibold text-intel-text flex items-center gap-1.5">
                  <GitCommit className="w-4 h-4 text-intel-warning" />
                  Recent Commits
                </span>
                <span className="text-xs text-intel-muted font-mono">Git History</span>
              </div>

              <div className="space-y-2.5">
                {recentCommits.length === 0 ? (
                  <p className="text-xs text-intel-muted py-2">No commit history available.</p>
                ) : (
                  recentCommits.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 rounded-md bg-intel-bg border border-intel-border space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-intel-warning font-semibold">
                          {c.sha.slice(0, 7)}
                        </span>
                        <span className="text-xs text-intel-muted">
                          {formatRelativeTime(c.timestamp)}
                        </span>
                      </div>
                      <p className="text-intel-text text-xs sm:text-sm truncate font-medium">
                        {c.message}
                      </p>
                      <div className="text-xs text-intel-muted">By {c.author}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Pull Requests & Issues */}
            <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-3">
              <div className="flex items-center justify-between pb-2.5 border-b border-intel-border">
                <span className="text-sm font-semibold text-intel-text flex items-center gap-1.5">
                  <GitPullRequest className="w-4 h-4 text-intel-success" />
                  Pull Requests & Issues
                </span>
                <span className="text-xs text-intel-muted font-mono">Review Layer</span>
              </div>

              <div className="space-y-2.5">
                {recentPRs.length === 0 && recentIssues.length === 0 ? (
                  <p className="text-xs text-intel-muted py-2">No pull requests or issues recorded.</p>
                ) : (
                  <>
                    {recentPRs.map((pr) => (
                      <div
                        key={pr.id}
                        className="p-3 rounded-md bg-intel-bg border border-intel-border space-y-1.5 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="success" size="sm" className="text-xs">
                              PR #{pr.github_number}
                            </Badge>
                            <span className="text-intel-text font-medium text-xs sm:text-sm truncate max-w-[200px]">
                              {pr.title}
                            </span>
                          </div>
                          <span className="text-xs text-intel-muted">
                            {formatRelativeTime(pr.created_at)}
                          </span>
                        </div>
                        <p className="text-intel-text-secondary text-xs line-clamp-1">
                          {pr.description}
                        </p>
                      </div>
                    ))}

                    {recentIssues.map((iss) => (
                      <div
                        key={iss.id}
                        className="p-3 rounded-md bg-intel-bg border border-intel-border space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="error" size="sm" className="text-xs">
                              Issue #{iss.github_number}
                            </Badge>
                            <span className="text-intel-text font-medium text-xs sm:text-sm truncate max-w-[200px]">
                              {iss.title}
                            </span>
                          </div>
                          <span className="text-xs text-intel-muted">
                            {formatRelativeTime(iss.created_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
