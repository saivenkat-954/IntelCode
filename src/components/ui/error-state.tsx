import * as React from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './button';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'An error occurred',
  message,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'p-4 rounded-lg bg-intel-error/5 border border-intel-error/20 text-xs text-intel-text space-y-2',
        className
      )}
    >
      <div className="flex items-center gap-2 text-intel-error font-medium">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>{title}</span>
      </div>
      <p className="text-intel-text-secondary leading-relaxed pl-6">{message}</p>
      {onRetry && (
        <div className="pl-6 pt-1">
          <Button variant="outline" size="sm" onClick={onRetry} className="h-7 text-xs gap-1.5">
            <RefreshCw className="w-3 h-3" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
