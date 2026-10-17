import * as React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon, FolderGit2 } from 'lucide-react';
import { Button } from './button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export function EmptyState({
  icon: Icon = FolderGit2,
  title,
  description,
  actionLabel,
  onAction,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-8 border border-dashed border-intel-border rounded-lg bg-intel-surface/40 max-w-md mx-auto my-6',
        className
      )}
    >
      <div className="w-10 h-10 rounded-md bg-intel-raised border border-intel-border flex items-center justify-center text-intel-muted mb-3">
        <Icon className="w-5 h-5 text-intel-text-secondary" />
      </div>
      <h3 className="text-sm font-semibold text-intel-text">{title}</h3>
      <p className="text-xs text-intel-text-secondary mt-1 max-w-xs">{description}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
      {children}
    </div>
  );
}
