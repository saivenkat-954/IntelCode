import * as React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';

export interface ThemeToggleProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function ThemeToggle({
  className,
  size = 'md',
  showLabel = false,
  ...props
}: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-md border border-intel-border bg-intel-surface text-intel-text-secondary hover:text-intel-text hover:bg-intel-raised hover:border-intel-border-strong active:bg-intel-raised/80 transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-intel-accent',
        size === 'sm' ? 'h-8 px-2.5 text-xs gap-1.5' : 'h-9 px-3 text-xs gap-2',
        !showLabel && (size === 'sm' ? 'w-8 p-0' : 'w-9 p-0'),
        className
      )}
      {...props}
    >
      {isDark ? (
        <Sun className={cn(size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4', 'text-intel-warning')} />
      ) : (
        <Moon className={cn(size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4', 'text-intel-accent')} />
      )}
      {showLabel && (
        <span className="font-mono text-xs font-medium">
          {isDark ? 'Light' : 'Dark'}
        </span>
      )}
    </button>
  );
}
