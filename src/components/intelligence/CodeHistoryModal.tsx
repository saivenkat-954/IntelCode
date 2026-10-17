import React, { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { CodeHistoryItem } from '@/types';
import { ragService } from '@/services/ragService';
import { GitCommit, Clock, Loader2, ArrowRight } from 'lucide-react';

interface CodeHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  repositoryId: string;
  filePath: string;
  symbolName: string;
}

export function CodeHistoryModal({
  isOpen,
  onClose,
  repositoryId,
  filePath,
  symbolName,
}: CodeHistoryModalProps) {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<CodeHistoryItem[]>([]);

  useEffect(() => {
    if (isOpen && filePath) {
      setLoading(true);
      ragService
        .getCodeHistory(repositoryId, filePath, symbolName)
        .then((items) => setHistory(items))
        .finally(() => setLoading(false));
    }
  }, [isOpen, repositoryId, filePath, symbolName]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Code Evolution Timeline"
      description={`Chronological modifications for ${symbolName || filePath}`}
      maxWidth="lg"
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-intel-accent" />
          <span className="text-sm text-intel-text-secondary font-mono">
            Traversing Git commit trees and symbol diff history...
          </span>
        </div>
      ) : (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="relative border-l border-intel-border ml-3.5 space-y-6 py-2">
            {history.map((item) => (
              <div key={item.sha} className="relative pl-6">
                <div className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-intel-surface border-2 border-intel-accent flex items-center justify-center" />

                <div className="p-4 rounded-lg bg-intel-surface border border-intel-border space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-intel-accent">
                        {item.sha.slice(0, 7)}
                      </span>
                      <span className="text-sm font-semibold text-intel-text">
                        {item.commitMessage}
                      </span>
                    </div>
                    <span className="text-xs text-intel-muted flex items-center gap-1 font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      {item.date}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-intel-text-secondary leading-relaxed">
                    {item.changeSummary}
                  </p>

                  {item.diffSnippet && (
                    <pre className="p-3 rounded-md bg-intel-bg border border-intel-border/60 font-mono text-xs text-intel-text overflow-x-auto leading-5">
                      <code>{item.diffSnippet}</code>
                    </pre>
                  )}

                  <div className="text-xs text-intel-muted">
                    Committed by <span className="text-intel-text font-medium">{item.author}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}
