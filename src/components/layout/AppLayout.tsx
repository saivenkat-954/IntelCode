import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { CommandPalette } from '@/components/navigation/CommandPalette';
import { repositoryService, DEMO_REPO_ID } from '@/services/repositoryService';
import {
  LayoutDashboard,
  FolderGit2,
  Terminal,
  GitCommit,
  GitPullRequest,
  AlertCircle,
  FileText,
  Settings,
  LogOut,
  Sun,
  Moon,
  Search,
  Menu,
  X,
  Sparkles,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const { user, signOut, isDemoMode, exitDemoMode } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [keySequence, setKeySequence] = useState<string[]>([]);
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);

  // Close mobile drawer on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Handle Escape key to close mobile menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  // Dynamically resolve active repository
  useEffect(() => {
    if (params.id) {
      setActiveRepoId(params.id);
      return;
    }

    if (isDemoMode) {
      setActiveRepoId(DEMO_REPO_ID);
      return;
    }

    repositoryService
      .getRepositories()
      .then((repos) => {
        if (repos.length > 0) {
          setActiveRepoId(repos[0].id);
        } else {
          setActiveRepoId(null);
        }
      })
      .catch(() => setActiveRepoId(null));
  }, [params.id, isDemoMode]);

  // Keyboard shortcut handler (Cmd+K, G then R, G then C, G then P, G then I)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen((prev) => !prev);
        return;
      }

      if (e.key.toLowerCase() === 'g') {
        setKeySequence(['g']);
        setTimeout(() => setKeySequence([]), 1200);
        return;
      }

      if (keySequence[0] === 'g') {
        const nextKey = e.key.toLowerCase();
        if (nextKey === 'r') {
          e.preventDefault();
          navigate('/repositories');
          setKeySequence([]);
        } else if (nextKey === 'c') {
          e.preventDefault();
          navigate('/commits');
          setKeySequence([]);
        } else if (nextKey === 'p') {
          e.preventDefault();
          navigate('/pull-requests');
          setKeySequence([]);
        } else if (nextKey === 'i') {
          e.preventDefault();
          navigate('/issues');
          setKeySequence([]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keySequence, navigate]);

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors select-none min-h-[38px]',
      isActive
        ? 'bg-intel-raised text-intel-text shadow-subtle border border-intel-border/70 font-semibold'
        : 'text-intel-text-secondary hover:text-intel-text hover:bg-intel-raised/50'
    );

  const currentPageLabel = (() => {
    const path = location.pathname;
    if (path.startsWith('/repositories/')) return 'Repository workspace';
    const labels: Record<string, string> = {
      '/dashboard': 'Overview',
      '/repositories': 'Repositories',
      '/commits': 'Commit history',
      '/pull-requests': 'Pull requests',
      '/issues': 'Issues',
      '/documents': 'Documents',
      '/settings': 'Settings',
    };
    return labels[path] || 'Workspace';
  })();

  const handleAskNavigation = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsMobileMenuOpen(false);
    if (activeRepoId) {
      navigate(`/repositories/${activeRepoId}?tab=ask`);
    } else {
      navigate('/repositories');
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-intel-surface border-r border-intel-border w-full md:w-[240px] flex-shrink-0">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-intel-border">
        <NavLink
          to="/dashboard"
          onClick={() => setIsMobileMenuOpen(false)}
          className="flex items-center gap-2.5 select-none group"
        >
          <div className="w-7 h-7 rounded-md bg-intel-raised border border-intel-border flex items-center justify-center text-intel-accent shadow-subtle group-hover:border-intel-border-strong transition-colors">
            <Layers className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-intel-text font-mono group-hover:text-intel-accent transition-colors">
              INTELCODE
            </span>
          </div>
        </NavLink>

        <div className="flex items-center gap-1">
          <button
            onClick={toggleTheme}
            className="p-1.5 text-intel-muted hover:text-intel-text rounded hover:bg-intel-raised transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-intel-accent"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            aria-label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-intel-warning" /> : <Moon className="w-4 h-4 text-intel-accent" />}
          </button>

          {/* Close button for mobile drawer */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close mobile navigation menu"
            className="p-1.5 text-intel-muted hover:text-intel-text rounded hover:bg-intel-raised transition-colors md:hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-intel-accent"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {/* Workspace */}
        <div className="space-y-1">
          <div className="px-3 py-1 text-[11px] font-semibold text-intel-muted uppercase tracking-wider font-mono">
            Workspace
          </div>
          <NavLink to="/dashboard" onClick={() => setIsMobileMenuOpen(false)} className={navItemClass}>
            <LayoutDashboard className="w-4 h-4 text-intel-muted" />
            <span>Overview</span>
          </NavLink>
          <NavLink to="/repositories" onClick={() => setIsMobileMenuOpen(false)} className={navItemClass}>
            <FolderGit2 className="w-4 h-4 text-intel-muted" />
            <span>Repositories</span>
          </NavLink>
          <a
            href="#ask"
            onClick={handleAskNavigation}
            className={cn(
              'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors select-none min-h-[38px]',
              location.pathname.includes('/repositories/') && location.search.includes('tab=ask')
                ? 'bg-intel-raised text-intel-text shadow-subtle border border-intel-border/70 font-semibold'
                : 'text-intel-text-secondary hover:text-intel-text hover:bg-intel-raised/50'
            )}
          >
            <Terminal className="w-4 h-4 text-intel-accent" />
            <span>Ask IntelCode</span>
          </a>
        </div>

        {/* Knowledge */}
        <div className="space-y-1">
          <div className="px-3 py-1 text-[11px] font-semibold text-intel-muted uppercase tracking-wider font-mono">
            Knowledge Layer
          </div>
          <NavLink to="/commits" onClick={() => setIsMobileMenuOpen(false)} className={navItemClass}>
            <GitCommit className="w-4 h-4 text-intel-warning" />
            <span>Commits</span>
          </NavLink>
          <NavLink to="/pull-requests" onClick={() => setIsMobileMenuOpen(false)} className={navItemClass}>
            <GitPullRequest className="w-4 h-4 text-intel-success" />
            <span>Pull Requests</span>
          </NavLink>
          <NavLink to="/issues" onClick={() => setIsMobileMenuOpen(false)} className={navItemClass}>
            <AlertCircle className="w-4 h-4 text-intel-error" />
            <span>Issues</span>
          </NavLink>
          <NavLink to="/documents" onClick={() => setIsMobileMenuOpen(false)} className={navItemClass}>
            <FileText className="w-4 h-4 text-intel-muted" />
            <span>Documents</span>
          </NavLink>
        </div>

        {/* System */}
        <div className="space-y-1">
          <div className="px-3 py-1 text-[11px] font-semibold text-intel-muted uppercase tracking-wider font-mono">
            System
          </div>
          <NavLink to="/settings" onClick={() => setIsMobileMenuOpen(false)} className={navItemClass}>
            <Settings className="w-4 h-4 text-intel-muted" />
            <span>Settings</span>
          </NavLink>
        </div>
      </div>

      {/* Quick Search Shortcut Trigger */}
      <div className="p-3 border-t border-intel-border/60">
        <button
          onClick={() => {
            setIsMobileMenuOpen(false);
            setIsPaletteOpen(true);
          }}
          className="flex items-center justify-between w-full px-3 py-2 rounded-md bg-intel-bg border border-intel-border text-xs text-intel-muted hover:text-intel-text hover:border-intel-border-strong transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-intel-accent min-h-[36px]"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5" />
            <span>Quick search...</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[10px] bg-intel-raised rounded border border-intel-border font-mono">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* User profile & Sign out */}
      <div className="flex items-center justify-between p-3 border-t border-intel-border bg-intel-surface">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-md bg-intel-raised border border-intel-border flex items-center justify-center font-mono text-xs font-semibold text-intel-accent flex-shrink-0">
            {user?.full_name ? user.full_name[0].toUpperCase() : 'U'}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-intel-text truncate">
              {user?.full_name || 'Developer'}
            </span>
            <span className="text-[11px] text-intel-muted truncate font-mono">
              {user?.email || 'dev@intelcode.io'}
            </span>
          </div>
        </div>

        <button
          onClick={() => {
            setIsMobileMenuOpen(false);
            signOut();
          }}
          className="p-1.5 text-intel-muted hover:text-intel-error rounded hover:bg-intel-raised transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-intel-accent"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="ic-workspace-shell flex h-screen w-screen overflow-hidden bg-intel-bg text-intel-text">
      {/* Desktop Sidebar (240px fixed) */}
      <aside className="hidden md:flex flex-shrink-0" aria-label="Desktop Sidebar Navigation">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Navigation */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Mobile Navigation Drawer">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer content */}
          <div className="relative z-10 w-[260px] max-w-[85vw] h-full shadow-modal animate-slide-down">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Explicit Demo Mode Banner */}
        {isDemoMode && (
          <div className="bg-intel-warning/10 border-b border-intel-warning/20 px-4 py-2 flex items-center justify-between text-xs text-intel-warning select-none">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 flex-shrink-0" />
              <span>
                <strong>DEMO WORKSPACE:</strong> You are exploring synthetic benchmark data. Actions here do not affect production accounts.
              </span>
            </div>
            <button
              onClick={() => exitDemoMode()}
              className="text-xs underline hover:text-intel-text font-medium ml-4 flex-shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-intel-warning rounded"
            >
              Exit Demo
            </button>
          </div>
        )}

        {/* Persistent workspace bar: page context and command search stay available while content scrolls. */}
        <header className="ic-workspace-topbar hidden md:flex h-12 shrink-0 items-center justify-between gap-4 border-b border-intel-border/80 px-6">
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <span className="text-intel-muted">Workspace</span>
            <ChevronRight className="h-3.5 w-3.5 text-intel-muted/70" aria-hidden="true" />
            <span className="truncate font-medium text-intel-text">{currentPageLabel}</span>
            {isDemoMode && <span className="ml-1 rounded border border-intel-warning/25 bg-intel-warning/10 px-1.5 py-0.5 font-mono text-[10px] text-intel-warning">DEMO</span>}
          </div>

          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            aria-label="Open command palette to search IntelCode"
            className="group flex h-8 w-full max-w-[340px] items-center justify-between rounded-md border border-intel-border bg-intel-surface px-3 text-xs text-intel-muted transition-colors hover:border-intel-border-strong hover:bg-intel-raised hover:text-intel-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-intel-accent"
          >
            <span className="flex items-center gap-2"><Search className="h-3.5 w-3.5" /><span>Search or jump to…</span></span>
            <kbd className="rounded border border-intel-border bg-intel-raised px-1.5 py-0.5 font-mono text-[10px] text-intel-muted">Ctrl K</kbd>
          </button>
        </header>

        {/* Mobile Top Header */}
        <header className="flex md:hidden items-center justify-between px-4 py-3 bg-intel-surface border-b border-intel-border">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-expanded={isMobileMenuOpen}
              aria-label={isMobileMenuOpen ? 'Close navigation drawer' : 'Open navigation drawer'}
              className="p-1.5 rounded text-intel-text hover:bg-intel-raised border border-intel-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-intel-accent min-h-[36px] min-w-[36px] flex items-center justify-center"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-mono font-bold text-sm tracking-tight text-intel-text">INTELCODE</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPaletteOpen(true)}
              aria-label="Open command palette"
              className="p-1.5 text-intel-muted hover:text-intel-text rounded hover:bg-intel-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-intel-accent"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content Outlet */}
        <main className="ic-workspace-content flex-1 overflow-y-auto min-w-0">
          <Outlet />
        </main>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={isPaletteOpen}
        onClose={() => setIsPaletteOpen(false)}
        currentRepoId={activeRepoId || undefined}
      />
    </div>
  );
}
