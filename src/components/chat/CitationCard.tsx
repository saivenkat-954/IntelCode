import React from 'react';
import { SourceCitation } from '@/types';
import { cn } from '@/lib/utils';
import { FileCode, GitCommit, GitPullRequest, AlertCircle, FileText, ExternalLink } from 'lucide-react';

interface CitationCardProps {
  citation: SourceCitation;
  onClick?: (citation: SourceCitation) => void;
  className?: string;
}

export function CitationCard({ citation, onClick, className }: CitationCardProps) {
  const getIcon = () => {
    switch (citation.type) {
      case 'code':
        return <FileCode className="w-3.5 h-3.5 text-intel-accent flex-shrink-0" />;
      case 'commit':
        return <GitCommit className="w-3.5 h-3.5 text-intel-warning flex-shrink-0" />;
      case 'pr':
        return <GitPullRequest className="w-3.5 h-3.5 text-intel-success flex-shrink-0" />;
      case 'issue':
        return <AlertCircle className="w-3.5 h-3.5 text-intel-error flex-shrink-0" />;
      case 'doc':
        return <FileText className="w-3.5 h-3.5 text-intel-text-secondary flex-shrink-0" />;
    }
  };

  return (
    <button
      onClick={() => onClick?.(citation)}
      className={cn(
        'group flex flex-col items-start p-2.5 rounded-md bg-intel-surface border border-intel-border hover:border-intel-border-strong hover:bg-intel-raised/70 transition-all text-left w-full sm:w-auto min-w-[200px]',
        className
      )}
    >
      <div className="flex items-center justify-between w-full gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {getIcon()}
          <span className="text-xs font-mono font-medium text-intel-text truncate group-hover:text-intel-accent transition-colors">
            {citation.title}
          </span>
        </div>
        <ExternalLink className="w-3 h-3 text-intel-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {citation.subtitle && (
        <p className="text-[11px] text-intel-text-secondary mt-1 truncate max-w-[280px]">
          {citation.subtitle}
        </p>
      )}

      {citation.start_line && citation.end_line && (
        <span className="mt-1 text-[10px] font-mono text-intel-muted">
          Lines {citation.start_line}–{citation.end_line}
        </span>
      )}
    </button>
  );
}
