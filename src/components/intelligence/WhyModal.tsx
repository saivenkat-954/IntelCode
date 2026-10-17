import React, { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { WhyAnalysisResult } from '@/types';
import { ragService } from '@/services/ragService';
import { GitCommit, GitPullRequest, AlertCircle, Calendar, FileCode, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface WhyModalProps {
  isOpen: boolean;
  onClose: () => void;
  repositoryId: string;
  filePath: string;
  symbolName: string;
}

export function WhyModal({
  isOpen,
  onClose,
  repositoryId,
  filePath,
  symbolName,
}: WhyModalProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<WhyAnalysisResult | null>(null);

  useEffect(() => {
    if (isOpen && filePath) {
      setLoading(true);
      ragService
        .explainWhy(repositoryId, filePath, symbolName)
        .then((data) => setResult(data))
        .finally(() => setLoading(false));
    }
  }, [isOpen, repositoryId, filePath, symbolName]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Code Genesis & Historical Justification"
      description={`Why does ${symbolName || filePath} exist?`}
      maxWidth="lg"
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-intel-accent" />
          <span className="text-sm text-intel-text-secondary font-mono">
            Synthesizing Git history, PR discussions, and incident reports...
          </span>
        </div>
      ) : result ? (
        <div className="space-y-4 text-sm">
          {/* Summary Banner */}
          <div className="p-4 rounded-md bg-intel-raised border border-intel-border leading-relaxed text-intel-text text-sm">
            {result.explanation}
          </div>

          {/* Historical Narrative */}
          <div>
            <h4 className="text-xs font-semibold text-intel-muted uppercase tracking-wider mb-2 font-mono">
              Historical Context & Lineage
            </h4>
            <p className="text-intel-text-secondary leading-relaxed p-3.5 rounded-md bg-intel-bg border border-intel-border text-sm">
              {result.historicalContext}
            </p>
          </div>

          {/* Connected Artifacts Matrix */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            {result.originCommit && (
              <div className="p-3 rounded-md bg-intel-surface border border-intel-border space-y-1.5">
                <div className="flex items-center gap-1.5 text-intel-warning font-mono text-xs font-semibold">
                  <GitCommit className="w-4 h-4" />
                  <span>commit {result.originCommit.sha.slice(0, 7)}</span>
                </div>
                <p className="text-xs text-intel-text truncate font-medium">
                  {result.originCommit.message}
                </p>
                <div className="text-xs text-intel-muted">
                  By {result.originCommit.author}
                </div>
              </div>
            )}

            {result.originPR && (
              <div className="p-3 rounded-md bg-intel-surface border border-intel-border space-y-1.5">
                <div className="flex items-center gap-1.5 text-intel-success font-mono text-xs font-semibold">
                  <GitPullRequest className="w-4 h-4" />
                  <span>PR #{result.originPR.github_number}</span>
                </div>
                <p className="text-xs text-intel-text truncate font-medium">
                  {result.originPR.title}
                </p>
                <Badge variant="success" size="sm" className="text-xs">
                  {result.originPR.state}
                </Badge>
              </div>
            )}

            {result.originIssue && (
              <div className="p-3 rounded-md bg-intel-surface border border-intel-border space-y-1.5">
                <div className="flex items-center gap-1.5 text-intel-error font-mono text-xs font-semibold">
                  <AlertCircle className="w-4 h-4" />
                  <span>Issue #{result.originIssue.github_number}</span>
                </div>
                <p className="text-xs text-intel-text truncate font-medium">
                  {result.originIssue.title}
                </p>
                <Badge variant="neutral" size="sm" className="text-xs">
                  {result.originIssue.state}
                </Badge>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
