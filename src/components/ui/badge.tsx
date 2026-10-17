import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'accent' | 'neutral';
  size?: 'sm' | 'md';
}

export function Badge({
  className,
  variant = 'default',
  size = 'md',
  children,
  ...props
}: BadgeProps) {
  const variants = {
    default: 'bg-intel-raised text-intel-text-secondary border-intel-border',
    success: 'bg-intel-success/10 text-intel-success border-intel-success/20',
    warning: 'bg-intel-warning/10 text-intel-warning border-intel-warning/20',
    error: 'bg-intel-error/10 text-intel-error border-intel-error/20',
    accent: 'bg-intel-accent/10 text-intel-accent border-intel-accent/20',
    neutral: 'bg-intel-surface text-intel-muted border-intel-border',
  };

  const sizes = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-0.5 text-xs',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center font-mono font-medium rounded border transition-colors',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
