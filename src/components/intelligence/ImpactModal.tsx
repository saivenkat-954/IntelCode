import React, { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { ImpactAnalysisResult } from '@/types';
import { ragService } from '@/services/ragService';
import { AlertTriangle, CheckCircle2, ShieldAlert, Loader2, FileCode } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ImpactModalProps {
  isOpen: boolean;
  onClose: () => void;
  repositoryId: string;
  filePath: string;
  symbolName: string;
}

export function ImpactModal({
  isOpen,
  onClose,
  repositoryId,
  filePath,
  symbolName,
}: ImpactModalProps) {
  const [loading, setLoading] = useState(true);
  const [impact, setImpact] = useState<ImpactAnalysisResult | null>(null);

  useEffect(() => {
    if (isOpen && filePath) {
      setLoading(true);
      ragService
        .analyzeImpact(repositoryId, filePath, symbolName)
        .then((data) => setImpact(data))
        .finally(() => setLoading(false));
    }
  }, [isOpen, repositoryId, filePath, symbolName]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Impact & Blast Radius Analysis"
      description={`What could break if you modify ${symbolName || filePath}?`}
      maxWidth="lg"
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-intel-accent" />
          <span className="text-sm text-intel-text-secondary font-mono">
            Evaluating dependency graph and downstream callers...
          </span>
        </div>
      ) : impact ? (
        <div className="space-y-4 text-sm">
          {/* Summary */}
          <div className="p-4 rounded-md bg-intel-raised border border-intel-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-intel-text text-base">{impact.symbolName}</span>
              <Badge
                variant={
                  impact.confidence === 'high'
                    ? 'success'
                    : impact.confidence === 'medium'
                    ? 'warning'
                    : 'default'
                }
                size="sm"
                className="text-xs"
              >
                {impact.confidence.toUpperCase()} CONFIDENCE
              </Badge>
            </div>
            <p className="text-intel-text-secondary leading-relaxed">{impact.summary}</p>
          </div>

          {/* Downstream affected components */}
          <div>
            <div className="text-xs font-semibold text-intel-muted uppercase tracking-wider mb-2.5 font-mono">
              Downstream Dependent Components ({impact.affectedComponents.length})
            </div>
            <div className="space-y-2.5">
              {impact.affectedComponents.length === 0 ? (
                <div className="p-4 rounded-md bg-intel-surface border border-intel-border text-xs text-intel-muted">
                  No direct downstream consumers were found in indexed files.
                </div>
              ) : (
                impact.affectedComponents.map((comp) => (
                  <div
                    key={comp.name}
                    className="p-3.5 rounded-md bg-intel-surface border border-intel-border space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium text-intel-text text-sm">
                        {comp.name}
                      </span>
                      <Badge
                        variant={
                          comp.criticality === 'high'
                            ? 'error'
                            : comp.criticality === 'medium'
                            ? 'warning'
                            : 'neutral'
                        }
                        size="sm"
                        className="text-xs"
                      >
                        {comp.criticality} risk
                      </Badge>
                    </div>
                    <div className="text-xs font-mono text-intel-muted flex items-center gap-1.5">
                      <FileCode className="w-3.5 h-3.5 text-intel-accent" />
                      <span>{comp.filePath}</span>
                    </div>
                    <p className="text-xs text-intel-text-secondary leading-relaxed">
                      {comp.reason}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Suggested Verification Tests */}
          <div>
            <div className="text-xs font-semibold text-intel-muted uppercase tracking-wider mb-2 font-mono">
              Suggested Test Coverage
            </div>
            <div className="p-3.5 rounded-md bg-intel-bg border border-intel-border space-y-1.5">
              {impact.suggestedTests.map((test, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-intel-text font-mono">
                  <CheckCircle2 className="w-3.5 h-3.5 text-intel-success shrink-0" />
                  <span>{test}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
