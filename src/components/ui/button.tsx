import * as React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading = false, children, disabled, type = 'button', ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-md select-none text-sm cursor-pointer disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-intel-accent focus-visible:ring-offset-2 focus-visible:ring-offset-intel-bg';

    const variants = {
      primary:
        'bg-intel-accent text-white hover:bg-intel-accent-hover shadow-subtle border border-intel-accent/80',
      secondary:
        'bg-intel-raised text-intel-text hover:bg-intel-border/70 border border-intel-border active:bg-intel-border',
      outline:
        'bg-transparent text-intel-text hover:bg-intel-raised border border-intel-border active:bg-intel-surface',
      ghost:
        'bg-transparent text-intel-text-secondary hover:text-intel-text hover:bg-intel-raised border border-transparent',
      danger:
        'bg-intel-error/10 text-intel-error hover:bg-intel-error/20 border border-intel-error/30 active:bg-intel-error/25',
    };

    const sizes = {
      sm: 'h-8 px-3 text-xs gap-1.5',
      md: 'h-9 px-4 text-xs tracking-wide gap-2',
      lg: 'h-10 px-5 text-sm gap-2',
      icon: 'h-9 w-9 p-0',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
