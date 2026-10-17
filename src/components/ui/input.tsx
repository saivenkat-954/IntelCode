import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', error, icon, rightElement, hint, ...props }, ref) => {
    return (
      <div className="w-full space-y-1.5">
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3.5 text-intel-muted flex items-center pointer-events-none">
              {icon}
            </div>
          )}
          <input
            type={type}
            className={cn(
              'flex h-9.5 w-full rounded-md bg-intel-surface px-3.5 py-2 text-sm text-intel-text placeholder:text-intel-muted',
              'border border-intel-border focus:border-intel-accent focus:ring-1 focus:ring-intel-accent/30 focus:outline-none transition-colors duration-150',
              'disabled:cursor-not-allowed disabled:opacity-50',
              icon && 'pl-10',
              (rightElement || hint) && 'pr-10',
              error && 'border-intel-error focus:border-intel-error focus:ring-intel-error/30',
              className
            )}
            ref={ref}
            {...props}
          />
          {rightElement ? (
            <div className="absolute right-2.5 flex items-center">
              {rightElement}
            </div>
          ) : hint ? (
            <div className="absolute right-3 pointer-events-none">
              <kbd className="px-1.5 py-0.5 text-[11px] bg-intel-raised text-intel-muted rounded border border-intel-border font-mono">
                {hint}
              </kbd>
            </div>
          ) : null}
        </div>
        {error && <p className="text-xs text-intel-error pl-1">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
