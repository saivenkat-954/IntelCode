import * as React from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'intelcode-privacy-notice-v1';

export function CookieBanner() {
  const [isVisible, setIsVisible] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(false);

  React.useEffect(() => {
    try {
      const acknowledged = localStorage.getItem(STORAGE_KEY);
      if (!acknowledged) {
        setIsVisible(true);
      }
    } catch {
      // Ignore localStorage access failures
    }
  }, []);

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      // Ignore localStorage write failures
    }
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <aside
      aria-label="Privacy and local storage notice"
      role="complementary"
      className={cn(
        'fixed bottom-0 inset-x-0 z-40 p-3 sm:p-4 bg-intel-surface/95 backdrop-blur-md border-t border-intel-border shadow-modal text-intel-text transition-all duration-200 animate-slide-down'
      )}
    >
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-7 h-7 rounded bg-intel-raised border border-intel-border flex items-center justify-center text-intel-accent flex-shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="space-y-1 text-xs leading-relaxed text-intel-text-secondary">
            <p>
              <strong className="text-intel-text font-medium">Essential Storage Only:</strong> IntelCode stores your authentication session tokens and interface theme preferences in browser storage to operate the developer intelligence workspace. No advertising or marketing cookies are tracked.
            </p>
            {showDetails && (
              <p className="pt-1 text-[11px] text-intel-muted font-mono leading-normal border-t border-intel-border/50">
                Stored items: <code className="text-intel-text">sb-*-auth-token</code> (authenticated session), <code className="text-intel-text">intelcode-theme</code> (dark/light preference), <code className="text-intel-text">intelcode_demo_mode</code> (benchmark preview toggle).
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-center flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            className="text-xs text-intel-muted hover:text-intel-text underline px-2 py-1 select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-intel-accent rounded"
          >
            {showDetails ? 'Hide details' : 'View storage items'}
          </button>
          <Button
            size="sm"
            onClick={handleDismiss}
            className="text-xs h-8 px-3 font-medium select-none"
          >
            Understood
          </Button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss privacy notice"
            className="p-1.5 text-intel-muted hover:text-intel-text rounded hover:bg-intel-raised transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-intel-accent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
