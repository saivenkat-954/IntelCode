import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { repositoryService } from '@/services/repositoryService';
import { IssueItem, Repository } from '@/types';
import { formatRelativeTime } from '@/lib/utils';
import { AlertCircle, Search, FolderGit2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export function IssuesView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    repositoryService.getRepositories().then((repos) => {
      setRepositories(repos);
      const urlRepoId = searchParams.get('repoId');
      const targetId =
        urlRepoId && repos.some((r) => r.id === urlRepoId)
          ? urlRepoId
          : repos[0]?.id || '';
      setSelectedRepoId(targetId);
    });
  }, []);

  useEffect(() => {
    if (!selectedRepoId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    repositoryService
      .getIssues(selectedRepoId)
      .then((data) => setIssues(data))
      .finally(() => setLoading(false));
  }, [selectedRepoId]);

  const handleRepoChange = (id: string) => {
    setSelectedRepoId(id);
    setSearchParams({ repoId: id });
  };

  const filtered = issues.filter(
    (i) =>
      i.title.toLowerCase().includes(search.toLowerCase()) ||
      i.body.toLowerCase().includes(search.toLowerCase()) ||
      i.labels.some((l) => l.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-5 sm:p-8 max-w-5xl mx-auto space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-intel-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-intel-text flex items-center gap-2.5">
            <AlertCircle className="w-6 h-6 text-intel-error" />
            <span>Issues & Incidents</span>
          </h1>
          <p className="text-sm text-intel-text-secondary mt-1">
            Bug reports, incident post-mortems, and customer escalations
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {repositories.length > 1 && (
            <select
              value={selectedRepoId}
              onChange={(e) => handleRepoChange(e.target.value)}
              className="px-3 py-2 rounded-md bg-intel-surface border border-intel-border text-xs text-intel-text font-mono focus:outline-none focus:border-intel-accent"
            >
              {repositories.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          )}

          <div className="w-full sm:w-64">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search issues and labels..."
              icon={<Search className="w-4 h-4 text-intel-muted" />}
              className="text-sm h-9"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3.5">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : repositories.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-intel-border rounded-xl space-y-3">
          <FolderGit2 className="w-8 h-8 text-intel-muted mx-auto" />
          <h3 className="text-base font-semibold text-intel-text">No repositories connected</h3>
          <p className="text-sm text-intel-text-secondary max-w-sm mx-auto">
            Connect a repository to inspect issue tracking context.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center border border-dashed border-intel-border rounded-lg text-sm text-intel-muted">
          No issues matching "{search}"
        </div>
      ) : (
        <div className="space-y-3.5">
          {filtered.map((iss) => (
            <div
              key={iss.id}
              className="p-4 sm:p-5 rounded-lg bg-intel-surface border border-intel-border space-y-2.5 text-xs sm:text-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Badge
                    variant={iss.state === 'closed' ? 'neutral' : 'error'}
                    size="sm"
                    className="text-xs"
                  >
                    #{iss.github_number} {iss.state.toUpperCase()}
                  </Badge>
                  <span className="font-semibold text-intel-text text-sm sm:text-base">
                    {iss.title}
                  </span>
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
      )}
    </div>
  );
}
