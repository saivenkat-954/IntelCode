import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { repositoryService, DEMO_REPO_ID } from '@/services/repositoryService';
import {
  Repository,
  FileItem,
  CommitItem,
  PullRequestItem,
  IssueItem,
  DocumentItem,
  SourceCitation,
  IndexingJob,
} from '@/types';
import { formatRelativeTime } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog } from '@/components/ui/dialog';
import { CodeViewer } from '@/components/code/CodeViewer';
import { FileTree } from '@/components/code/FileTree';
import { ChatView } from '@/components/chat/ChatView';
import { WhyModal } from '@/components/intelligence/WhyModal';
import { CodeHistoryModal } from '@/components/intelligence/CodeHistoryModal';
import { ImpactModal } from '@/components/intelligence/ImpactModal';
import {
  FolderGit2,
  FileCode,
  Terminal,
  GitCommit,
  GitPullRequest,
  AlertCircle,
  FileText,
  ExternalLink,
  RefreshCw,
  GitBranch,
  Shield,
  HelpCircle,
  Clock,
  Sparkles,
  ArrowLeft,
  Trash2,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

const STAGE_LABELS: Record<string, string> = {
  pending: 'Queued',
  fetching: 'Fetching files',
  chunking: 'Chunking',
  embedding: 'Generating embeddings',
  saving: 'Saving index',
  completed: 'Completed',
  failed: 'Failed',
  paused: 'Paused (Quota Exhausted)',
};

export function RepositoryDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const repoId = id;
  const currentTab = searchParams.get('tab') || 'overview';

  const [repo, setRepo] = useState<Repository | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [prs, setPRs] = useState<PullRequestItem[]>([]);
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [indexingJob, setIndexingJob] = useState<IndexingJob | null>(null);
  const [highlightRange, setHighlightRange] = useState<{ startLine: number; endLine: number } | undefined>();
  const [loading, setLoading] = useState(true);
  const [isReindexing, setIsReindexing] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Modals for intelligence actions
  const [whyModal, setWhyModal] = useState<{ open: boolean; path: string; symbol: string }>({
    open: false,
    path: '',
    symbol: '',
  });
  const [historyModal, setHistoryModal] = useState<{ open: boolean; path: string; symbol: string }>({
    open: false,
    path: '',
    symbol: '',
  });
  const [impactModal, setImpactModal] = useState<{ open: boolean; path: string; symbol: string }>({
    open: false,
    path: '',
    symbol: '',
  });

  useEffect(() => {
    if (repoId) {
      loadRepositoryData();
    } else {
      setLoading(false);
    }
  }, [repoId]);

  // Safe polling effect while repository or job is in an active non-terminal state
  useEffect(() => {
    const isJobActive =
      repo?.status === 'indexing' ||
      (indexingJob && ['pending', 'fetching', 'chunking', 'embedding', 'saving'].includes(indexingJob.status));

    if (!isJobActive || !repoId) return;

    const interval = setInterval(async () => {
      try {
        const [updatedRepo, updatedJob] = await Promise.all([
          repositoryService.getRepository(repoId),
          repositoryService.getLatestIndexingJob(repoId),
        ]);

        if (updatedRepo) {
          setRepo(updatedRepo);
          // When entering terminal state, refresh complete repository entities
          if (updatedRepo.status === 'ready' || updatedRepo.status === 'failed') {
            const [fileList, commitList, prList, issueList, docList] = await Promise.all([
              repositoryService.getFiles(repoId),
              repositoryService.getCommits(repoId),
              repositoryService.getPullRequests(repoId),
              repositoryService.getIssues(repoId),
              repositoryService.getDocuments(repoId),
            ]);
            setFiles(fileList);
            setCommits(commitList);
            setPRs(prList);
            setIssues(issueList);
            setDocs(docList);
          }
        }
        if (updatedJob) {
          setIndexingJob(updatedJob);
        }
      } catch (err) {
        console.error('Error polling indexing status:', err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [repoId, repo?.status, indexingJob?.status]);

  const loadRepositoryData = async () => {
    if (!repoId) return;
    setLoading(true);
    try {
      const [repoData, fileList, commitList, prList, issueList, docList, latestJob] = await Promise.all([
        repositoryService.getRepository(repoId),
        repositoryService.getFiles(repoId),
        repositoryService.getCommits(repoId),
        repositoryService.getPullRequests(repoId),
        repositoryService.getIssues(repoId),
        repositoryService.getDocuments(repoId),
        repositoryService.getLatestIndexingJob(repoId),
      ]);

      setRepo(repoData);
      setFiles(fileList);
      setCommits(commitList);
      setPRs(prList);
      setIssues(issueList);
      setDocs(docList);
      setIndexingJob(latestJob);

      if (fileList.length > 0) {
        setSelectedFile(fileList[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab });
  };

  const handleSelectCitation = (citation: SourceCitation) => {
    if (citation.type === 'code' && citation.path) {
      const target = files.find((f) => f.path === citation.path);
      if (target) {
        setSelectedFile(target);
        if (citation.start_line) {
          setHighlightRange({
            startLine: citation.start_line,
            endLine: citation.end_line || citation.start_line,
          });
        }
        handleTabChange('code');
      }
    } else if (citation.type === 'commit') {
      handleTabChange('commits');
    } else if (citation.type === 'pr') {
      handleTabChange('pull-requests');
    } else if (citation.type === 'issue') {
      handleTabChange('issues');
    } else if (citation.type === 'doc') {
      handleTabChange('documents');
    }
  };

  const handleReindex = async () => {
    if (!repoId) return;
    setIsReindexing(true);
    try {
      await repositoryService.triggerReindex(repoId, repo?.full_name);
      await loadRepositoryData();
    } finally {
      setIsReindexing(false);
    }
  };

  const handleDeleteRepo = async () => {
    if (!repo || repo.id === DEMO_REPO_ID) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await repositoryService.deleteRepository(repo.id);
      navigate('/repositories');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete repository.';
      setDeleteError(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const getSymbolForFile = (f: FileItem): string => {
    const classMatch = f.content.match(
      /export\s+(?:default\s+)?(?:class|function|interface|const)\s+([A-Za-z0-9_]+)/
    );
    if (classMatch) return classMatch[1];
    const base = f.path.split('/').pop()?.replace(/\.[^/.]+$/, '') || '';
    return base.charAt(0).toUpperCase() + base.slice(1);
  };

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto space-y-5">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (!repoId || !repo) {
    return (
      <div className="p-12 text-center max-w-lg mx-auto space-y-4">
        <FolderGit2 className="w-12 h-12 text-intel-muted mx-auto" />
        <h2 className="text-xl font-bold text-intel-text">Repository Not Found</h2>
        <p className="text-sm text-intel-text-secondary leading-relaxed">
          The requested repository does not exist, has been removed, or is not authorized for your account.
        </p>
        <Button onClick={() => navigate('/repositories')} className="text-xs h-9 gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Return to Repositories</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-intel-bg text-intel-text overflow-hidden">
      {/* Repository Header */}
      <div className="px-5 sm:px-7 py-4 bg-intel-surface border-b border-intel-border shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2.5">
              <FolderGit2 className="w-5 h-5 text-intel-accent shrink-0" />
              <h1 className="font-mono text-base sm:text-lg font-bold text-intel-text truncate">
                {repo.full_name}
              </h1>
              {repo.is_private && (
                <Badge variant="neutral" size="sm" className="text-xs">
                  Private
                </Badge>
              )}
              {repo.status === 'ready' ? (
                <Badge variant="success" size="sm" className="text-xs gap-1 font-mono">
                  <CheckCircle2 className="w-3 h-3 text-intel-success" />
                  <span>Indexed</span>
                </Badge>
              ) : repo.status === 'indexing' ? (
                <Badge variant="accent" size="sm" className="text-xs gap-1 font-mono">
                  <Loader2 className="w-3 h-3 animate-spin text-intel-accent" />
                  <span>
                    {indexingJob?.status && STAGE_LABELS[indexingJob.status]
                      ? STAGE_LABELS[indexingJob.status]
                      : 'Indexing'}
                  </span>
                </Badge>
              ) : repo.status === 'paused' ? (
                <Badge variant="warning" size="sm" className="text-xs gap-1 font-mono">
                  <Clock className="w-3 h-3 text-amber-500" />
                  <span>Paused (Quota)</span>
                </Badge>
              ) : repo.status === 'failed' ? (
                <Badge variant="error" size="sm" className="text-xs gap-1 font-mono">
                  <AlertCircle className="w-3 h-3 text-intel-error" />
                  <span>Failed</span>
                </Badge>
              ) : (
                <Badge variant="neutral" size="sm" className="text-xs font-mono">
                  {repo.status}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-intel-muted font-mono">
              <span className="flex items-center gap-1 text-intel-text">
                <GitBranch className="w-3.5 h-3.5" />
                {repo.default_branch}
              </span>
              <span>•</span>
              <span className="text-intel-text font-medium">{repo.language}</span>
              <span>•</span>
              <span>{files.length} files</span>
              <span>•</span>
              <span>{repo.chunks_count} chunks</span>
              <span>•</span>
              <span>
                {repo.last_indexed_at
                  ? `Indexed ${formatRelativeTime(repo.last_indexed_at)}`
                  : 'Never indexed'}
              </span>
              <span>•</span>
              <span>Updated {formatRelativeTime(repo.updated_at)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReindex}
              isLoading={isReindexing}
              className="text-xs h-8 gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reindex</span>
            </Button>

            <a
              href={`https://github.com/${repo.full_name}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-intel-raised border border-intel-border hover:bg-intel-border/60 transition-colors"
            >
              <span>GitHub</span>
              <ExternalLink className="w-3.5 h-3.5 text-intel-muted" />
            </a>

            {repo.id !== DEMO_REPO_ID && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDeleteError(null);
                  setIsDeleteModalOpen(true);
                }}
                title="Remove repository from IntelCode"
                className="text-xs h-8 gap-1.5 text-intel-muted hover:text-intel-error hover:bg-intel-error/10 hover:border-intel-error/30 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Active Indexing Progress Card */}
      {repo.status === 'indexing' && (
        <div className="mx-5 sm:mx-7 mt-4 p-4 rounded-lg bg-intel-surface border border-intel-accent/30 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-intel-accent shrink-0" />
              <div>
                <span className="text-xs font-semibold text-intel-text">
                  Indexing Codebase AST & Generating Vectors
                </span>
                <span className="text-xs text-intel-muted ml-2 font-mono">
                  Stage: <strong className="text-intel-accent">{indexingJob?.status && STAGE_LABELS[indexingJob.status] ? STAGE_LABELS[indexingJob.status] : 'Fetching files'}</strong>
                </span>
              </div>
            </div>
            <div className="text-xs font-mono text-intel-muted">
              <span>{indexingJob?.files_processed ?? files.length} files processed</span>
              <span className="mx-1.5">•</span>
              <span>{indexingJob?.chunks_created ?? repo.chunks_count} chunks created</span>
              {typeof indexingJob?.progress === 'number' && indexingJob.progress > 0 && (
                <>
                  <span className="mx-1.5">•</span>
                  <span className="text-intel-accent font-bold">{Math.round(indexingJob.progress)}%</span>
                </>
              )}
            </div>
          </div>
          {typeof indexingJob?.progress === 'number' && indexingJob.progress > 0 && (
            <div className="w-full bg-intel-raised rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-intel-accent h-1.5 transition-all duration-300 rounded-full"
                style={{ width: `${Math.min(100, Math.max(5, indexingJob.progress))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Paused Indexing Banner (Daily Quota Exhaustion / Cooldown) */}
      {(repo.status === 'paused' || indexingJob?.status === 'paused') && (
        <div className="mx-5 sm:mx-7 mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                <span>Indexing Paused (Gemini API Daily Quota Reached)</span>
              </h4>
              <p className="text-xs text-intel-text-secondary leading-relaxed max-w-2xl">
                Google Gemini API free-tier daily embedding quota has been exhausted.
                All completed file chunks, symbols, and progress have been securely preserved.
                You can resume indexing once your quota resets at midnight Pacific Time (00:00 UTC-8),
                or upgrade your Gemini API tier in Google AI Studio for higher daily limits.
              </p>
              {indexingJob?.error && (
                <p className="text-xs text-intel-muted font-mono break-all pt-1">
                  Details: {indexingJob.error}
                </p>
              )}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleReindex}
            isLoading={isReindexing}
            className="text-xs h-8 gap-1.5 shrink-0 self-start sm:self-center border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReindexing ? 'animate-spin' : ''}`} />
            <span>Resume Indexing</span>
          </Button>
        </div>
      )}

      {/* Failed Indexing Banner with Retry Action & Sanitized Error */}
      {(repo.status === 'failed' || (indexingJob && indexingJob.status === 'failed')) && (
        <div className="mx-5 sm:mx-7 mt-4 p-4 rounded-lg bg-intel-error/10 border border-intel-error/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-intel-error shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-intel-error">
                Indexing Encountered an Issue
              </h4>
              <p className="text-xs text-intel-text-secondary font-mono break-all">
                {indexingJob?.error || 'The indexing pipeline failed or timed out. Your previous index data (if any) has been preserved.'}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="danger"
            onClick={handleReindex}
            isLoading={isReindexing}
            className="text-xs h-8 gap-1.5 shrink-0 self-start sm:self-center"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReindexing ? 'animate-spin' : ''}`} />
            <span>Retry Indexing</span>
          </Button>
        </div>
      )}

      {/* Tabs Navigation */}
      <Tabs value={currentTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
        <div className="px-5 sm:px-7 bg-intel-surface border-b border-intel-border shrink-0">
          <TabsList className="bg-transparent border-none p-0 overflow-x-auto gap-1">
            <TabsTrigger value="overview" icon={<FolderGit2 className="w-4 h-4" />}>
              Overview
            </TabsTrigger>
            <TabsTrigger value="code" icon={<FileCode className="w-4 h-4" />}>
              Code Explorer
            </TabsTrigger>
            <TabsTrigger
              value="ask"
              icon={<Terminal className="w-4 h-4 text-intel-accent" />}
              badge={
                <span className="px-1.5 py-0.5 text-xs bg-intel-accent/20 text-intel-accent rounded font-mono ml-1">
                  AI
                </span>
              }
            >
              Ask IntelCode
            </TabsTrigger>
            <TabsTrigger
              value="commits"
              icon={<GitCommit className="w-4 h-4 text-intel-warning" />}
            >
              Commits ({commits.length})
            </TabsTrigger>
            <TabsTrigger
              value="pull-requests"
              icon={<GitPullRequest className="w-4 h-4 text-intel-success" />}
            >
              Pull Requests ({prs.length})
            </TabsTrigger>
            <TabsTrigger
              value="issues"
              icon={<AlertCircle className="w-4 h-4 text-intel-error" />}
            >
              Issues ({issues.length})
            </TabsTrigger>
            <TabsTrigger value="documents" icon={<FileText className="w-4 h-4" />}>
              Docs ({docs.length})
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Overview */}
        <TabsContent
          value="overview"
          className="flex-1 overflow-y-auto p-5 sm:p-7 max-w-6xl mx-auto w-full space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* README Content */}
            <div className="md:col-span-2 space-y-4">
              <div className="p-5 sm:p-6 rounded-lg bg-intel-surface border border-intel-border space-y-3.5">
                <div className="flex items-center gap-2 pb-2.5 border-b border-intel-border text-xs font-mono font-semibold text-intel-text">
                  <FileText className="w-4 h-4 text-intel-muted" />
                  <span>README.md</span>
                </div>
                <div className="prose prose-invert max-w-none text-sm text-intel-text-secondary leading-relaxed font-sans">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {files.find((f) => f.path === 'README.md')?.content ||
                      `# ${repo.name}\n\n${repo.description || 'Welcome to this repository.'}`}
                  </ReactMarkdown>
                </div>
              </div>
            </div>

            {/* Sidebar quick metadata */}
            <div className="space-y-4">
              <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-3.5 text-xs sm:text-sm">
                <h3 className="font-semibold text-intel-text font-mono uppercase tracking-wider text-xs">
                  Repository Architecture
                </h3>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-intel-muted">AST Index Status</span>
                    <Badge variant="success" size="sm" className="text-xs">
                      {repo.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-intel-muted">Indexed Files</span>
                    <span className="font-mono text-intel-text font-medium">{files.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-intel-muted">Semantic Chunks</span>
                    <span className="font-mono text-intel-text font-medium">{repo.chunks_count}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-intel-muted">Vector Dimensions</span>
                    <span className="font-mono text-intel-text font-medium">
                      {(repo as any).embedding_dimension ? `${(repo as any).embedding_dimension}-d pgvector (${(repo as any).embedding_model || 'Voyage Code 4'})` : '512-d pgvector (Voyage Code 4)'}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-intel-border">
                  <Button
                    size="sm"
                    onClick={() => handleTabChange('ask')}
                    className="w-full text-xs h-9 gap-1.5"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Ask Questions About Code</span>
                  </Button>
                </div>
              </div>

              {/* Recent PR badge list */}
              <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-3 text-xs sm:text-sm">
                <h3 className="font-semibold text-intel-text font-mono uppercase tracking-wider text-xs">
                  Recent Pull Requests
                </h3>
                <div className="space-y-2.5">
                  {prs.slice(0, 3).map((pr) => (
                    <div
                      key={pr.id}
                      className="p-3 rounded-md bg-intel-bg border border-intel-border space-y-1.5"
                    >
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <GitPullRequest className="w-3.5 h-3.5 text-intel-success" />
                        <span className="text-intel-text font-semibold truncate">
                          PR #{pr.github_number}
                        </span>
                      </div>
                      <p className="text-xs text-intel-text-secondary truncate">{pr.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Code Viewer & Explorer */}
        <TabsContent
          value="code"
          className="flex-1 flex flex-col sm:flex-row min-h-0 overflow-hidden pt-0"
        >
          {/* File Explorer Tree */}
          <div className="w-full sm:w-[260px] shrink-0 h-52 sm:h-full border-b sm:border-b-0 border-intel-border">
            <FileTree
              files={files}
              selectedFileId={selectedFile?.id}
              onSelectFile={(f) => {
                setSelectedFile(f);
                setHighlightRange(undefined);
              }}
            />
          </div>

          {/* Monaco Editor Pane */}
          <div className="flex-1 flex flex-col min-w-0 h-full p-2.5 bg-intel-bg">
            {selectedFile ? (
              <div className="flex-1 flex flex-col min-h-0 space-y-2.5">
                {/* Code actions toolbar */}
                <div className="flex items-center justify-between px-3.5 py-2 bg-intel-surface rounded-md border border-intel-border text-xs sm:text-sm">
                  <div className="flex items-center gap-2 font-mono text-intel-text font-medium text-xs sm:text-sm truncate">
                    <span>{selectedFile.path}</span>
                    <span className="text-intel-muted text-xs">({selectedFile.size} bytes)</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setWhyModal({
                          open: true,
                          path: selectedFile.path,
                          symbol: getSymbolForFile(selectedFile),
                        })
                      }
                      className="h-7 text-xs px-2.5 gap-1.5"
                    >
                      <HelpCircle className="w-3.5 h-3.5 text-intel-accent" />
                      <span>Why?</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setHistoryModal({
                          open: true,
                          path: selectedFile.path,
                          symbol: getSymbolForFile(selectedFile),
                        })
                      }
                      className="h-7 text-xs px-2.5 gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5 text-intel-warning" />
                      <span>History</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setImpactModal({
                          open: true,
                          path: selectedFile.path,
                          symbol: getSymbolForFile(selectedFile),
                        })
                      }
                      className="h-7 text-xs px-2.5 gap-1.5"
                    >
                      <Shield className="w-3.5 h-3.5 text-intel-error" />
                      <span>Impact</span>
                    </Button>
                  </div>
                </div>

                {/* Monaco Viewer */}
                <div className="flex-1 min-h-0">
                  <CodeViewer
                    code={selectedFile.content}
                    language={selectedFile.language}
                    filePath={selectedFile.path}
                    highlightRange={highlightRange}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-intel-muted">
                Select a file from the explorer to view code.
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 3: Ask IntelCode */}
        <TabsContent value="ask" className="flex-1 min-h-0 p-3 sm:p-5 pt-0">
          <ChatView
            repositoryId={repo.id}
            repositoryName={repo.full_name}
            onSelectCitation={handleSelectCitation}
            onWhyClick={(path, symbol) => setWhyModal({ open: true, path, symbol })}
            onImpactClick={(path, symbol) => setImpactModal({ open: true, path, symbol })}
          />
        </TabsContent>

        {/* Tab 4: Commits */}
        <TabsContent
          value="commits"
          className="flex-1 overflow-y-auto p-5 sm:p-7 max-w-5xl mx-auto w-full space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-intel-border">
            <h2 className="text-sm font-semibold text-intel-text uppercase font-mono tracking-wider">
              Git Commit Telemetry ({commits.length})
            </h2>
          </div>

          <div className="space-y-3">
            {commits.map((c) => (
              <div
                key={c.id}
                className="p-4 rounded-lg bg-intel-surface border border-intel-border space-y-2 text-xs sm:text-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-xs font-semibold text-intel-warning">
                      {c.sha.slice(0, 7)}
                    </span>
                    <span className="font-medium text-intel-text text-sm">{c.message}</span>
                  </div>
                  <span className="text-xs text-intel-muted font-mono">
                    {formatRelativeTime(c.timestamp)}
                  </span>
                </div>

                <div className="text-xs text-intel-muted font-mono flex items-center gap-3">
                  <span>Author: {c.author}</span>
                  <span>•</span>
                  <span>Touched: {c.changed_files.join(', ')}</span>
                </div>

                {c.diff && (
                  <pre className="p-3 rounded bg-intel-bg border border-intel-border/60 font-mono text-xs text-intel-text overflow-x-auto leading-5">
                    <code>{c.diff}</code>
                  </pre>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Tab 5: Pull Requests */}
        <TabsContent
          value="pull-requests"
          className="flex-1 overflow-y-auto p-5 sm:p-7 max-w-5xl mx-auto w-full space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-intel-border">
            <h2 className="text-sm font-semibold text-intel-text uppercase font-mono tracking-wider">
              Pull Requests ({prs.length})
            </h2>
          </div>

          <div className="space-y-3">
            {prs.map((pr) => (
              <div
                key={pr.id}
                className="p-4 rounded-lg bg-intel-surface border border-intel-border space-y-2 text-xs sm:text-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Badge variant={pr.state === 'merged' ? 'success' : 'default'} size="sm" className="text-xs">
                      PR #{pr.github_number}
                    </Badge>
                    <span className="font-semibold text-intel-text text-sm">{pr.title}</span>
                  </div>
                  <span className="text-xs text-intel-muted font-mono">
                    {formatRelativeTime(pr.created_at)}
                  </span>
                </div>

                <p className="text-sm text-intel-text-secondary leading-relaxed">{pr.description}</p>

                <div className="text-xs text-intel-muted font-mono">
                  Author: <span className="text-intel-text">{pr.author}</span>
                  {pr.merged_at && <span> • Merged {formatRelativeTime(pr.merged_at)}</span>}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Tab 6: Issues */}
        <TabsContent
          value="issues"
          className="flex-1 overflow-y-auto p-5 sm:p-7 max-w-5xl mx-auto w-full space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-intel-border">
            <h2 className="text-sm font-semibold text-intel-text uppercase font-mono tracking-wider">
              Issues & Incidents ({issues.length})
            </h2>
          </div>

          <div className="space-y-3">
            {issues.map((iss) => (
              <div
                key={iss.id}
                className="p-4 rounded-lg bg-intel-surface border border-intel-border space-y-2 text-xs sm:text-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Badge variant={iss.state === 'closed' ? 'neutral' : 'error'} size="sm" className="text-xs">
                      #{iss.github_number} {iss.state.toUpperCase()}
                    </Badge>
                    <span className="font-semibold text-intel-text text-sm">{iss.title}</span>
                  </div>
                  <span className="text-xs text-intel-muted font-mono">
                    {formatRelativeTime(iss.created_at)}
                  </span>
                </div>

                <p className="text-sm text-intel-text-secondary leading-relaxed">{iss.body}</p>

                <div className="flex items-center gap-2 pt-1">
                  {iss.labels.map((l) => (
                    <span
                      key={l}
                      className="px-2 py-0.5 rounded bg-intel-raised text-xs text-intel-text font-mono border border-intel-border"
                    >
                      {l}
                    </span>
                  ))}
                  <span className="text-xs text-intel-muted font-mono ml-auto">
                    Opened by {iss.author}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Tab 7: Documents */}
        <TabsContent
          value="documents"
          className="flex-1 overflow-y-auto p-5 sm:p-7 max-w-5xl mx-auto w-full space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-intel-border">
            <h2 className="text-sm font-semibold text-intel-text uppercase font-mono tracking-wider">
              Indexed Documentation ({docs.length})
            </h2>
          </div>

          <div className="space-y-4">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="p-5 sm:p-6 rounded-lg bg-intel-surface border border-intel-border space-y-3.5 text-xs sm:text-sm"
              >
                <div className="flex items-center justify-between pb-2.5 border-b border-intel-border">
                  <div className="flex items-center gap-2 font-mono">
                    <FileText className="w-4 h-4 text-intel-accent" />
                    <span className="font-semibold text-intel-text text-sm">{doc.title}</span>
                    <span className="text-intel-muted text-xs">({doc.path})</span>
                  </div>
                </div>

                <div className="prose prose-invert max-w-none text-sm text-intel-text-secondary leading-relaxed font-sans">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Intelligence Modals */}
      <WhyModal
        isOpen={whyModal.open}
        onClose={() => setWhyModal({ open: false, path: '', symbol: '' })}
        repositoryId={repo.id}
        filePath={whyModal.path}
        symbolName={whyModal.symbol}
      />

      <CodeHistoryModal
        isOpen={historyModal.open}
        onClose={() => setHistoryModal({ open: false, path: '', symbol: '' })}
        repositoryId={repo.id}
        filePath={historyModal.path}
        symbolName={historyModal.symbol}
      />

      <ImpactModal
        isOpen={impactModal.open}
        onClose={() => setImpactModal({ open: false, path: '', symbol: '' })}
        repositoryId={repo.id}
        filePath={impactModal.path}
        symbolName={impactModal.symbol}
      />

      {/* Delete Confirmation Modal */}
      <Dialog
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isDeleting) setIsDeleteModalOpen(false);
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
                {repo?.full_name}
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
              onClick={() => setIsDeleteModalOpen(false)}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={isDeleting}
              onClick={handleDeleteRepo}
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
