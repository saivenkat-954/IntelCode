import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { repositoryService } from '@/services/repositoryService';
import { DocumentItem, Repository } from '@/types';
import { formatRelativeTime } from '@/lib/utils';
import { FileText, Search, FolderGit2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

export function DocumentsView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('');
  const [docs, setDocs] = useState<DocumentItem[]>([]);
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
      .getDocuments(selectedRepoId)
      .then((data) => setDocs(data))
      .finally(() => setLoading(false));
  }, [selectedRepoId]);

  const handleRepoChange = (id: string) => {
    setSelectedRepoId(id);
    setSearchParams({ repoId: id });
  };

  const filtered = docs.filter(
    (d) =>
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.content.toLowerCase().includes(search.toLowerCase()) ||
      d.path.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-5 sm:p-8 max-w-5xl mx-auto space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-intel-border">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-intel-text flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-intel-accent" />
            <span>Architecture & Incident Documents</span>
          </h1>
          <p className="text-sm text-intel-text-secondary mt-1">
            Indexed documentation, RFCs, and post-mortems contributing to RAG retrieval
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
              placeholder="Search documentation..."
              icon={<Search className="w-4 h-4 text-intel-muted" />}
              className="text-sm h-9"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3.5">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : repositories.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-intel-border rounded-xl space-y-3">
          <FolderGit2 className="w-8 h-8 text-intel-muted mx-auto" />
          <h3 className="text-base font-semibold text-intel-text">No repositories connected</h3>
          <p className="text-sm text-intel-text-secondary max-w-sm mx-auto">
            Connect a repository to index Markdown documentation.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-10 text-center border border-dashed border-intel-border rounded-lg text-sm text-intel-muted">
          No documentation matching "{search}"
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((doc) => (
            <div
              key={doc.id}
              className="p-5 sm:p-6 rounded-lg bg-intel-surface border border-intel-border space-y-3.5 text-xs sm:text-sm"
            >
              <div className="flex items-center justify-between pb-2.5 border-b border-intel-border">
                <div className="flex items-center gap-2 font-mono">
                  <FileText className="w-4 h-4 text-intel-accent" />
                  <span className="font-semibold text-intel-text text-sm sm:text-base">{doc.title}</span>
                  <span className="text-intel-muted text-xs">({doc.path})</span>
                </div>
              </div>

              <div className="prose prose-invert max-w-none text-sm text-intel-text-secondary leading-relaxed font-sans">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
