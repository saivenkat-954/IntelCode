import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import {
  Search,
  Terminal,
  FileCode,
  GitCommit,
  GitPullRequest,
  AlertCircle,
  FolderGit2,
  Settings,
  Sun,
  Moon,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommandItem {
  id: string;
  title: string;
  category: 'Actions' | 'Navigation' | 'Settings';
  icon: React.ReactNode;
  shortcut?: string;
  perform: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  currentRepoId,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentRepoId?: string;
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: CommandItem[] = [
    {
      id: 'ask',
      title: currentRepoId ? 'Ask IntelCode about active repository' : 'Ask IntelCode (Select repository)',
      category: 'Actions',
      icon: <Terminal className="w-4 h-4 text-intel-accent" />,
      shortcut: '⌘K',
      perform: () => {
        if (currentRepoId) {
          navigate(`/repositories/${currentRepoId}?tab=ask`);
        } else {
          navigate('/repositories');
        }
        onClose();
      },
    },
    {
      id: 'explore-code',
      title: currentRepoId ? 'Explore Source Code & AST Chunks' : 'Explore Code (Select repository)',
      category: 'Actions',
      icon: <FileCode className="w-4 h-4 text-intel-text-secondary" />,
      perform: () => {
        if (currentRepoId) {
          navigate(`/repositories/${currentRepoId}?tab=code`);
        } else {
          navigate('/repositories');
        }
        onClose();
      },
    },
    {
      id: 'nav-dashboard',
      title: 'Go to Workspace Overview',
      category: 'Navigation',
      icon: <FolderGit2 className="w-4 h-4 text-intel-text-secondary" />,
      perform: () => {
        navigate('/dashboard');
        onClose();
      },
    },
    {
      id: 'nav-repos',
      title: 'Go to Repositories',
      category: 'Navigation',
      icon: <FolderGit2 className="w-4 h-4 text-intel-text-secondary" />,
      shortcut: 'G R',
      perform: () => {
        navigate('/repositories');
        onClose();
      },
    },
    {
      id: 'nav-commits',
      title: 'Go to Commits History',
      category: 'Navigation',
      icon: <GitCommit className="w-4 h-4 text-intel-warning" />,
      shortcut: 'G C',
      perform: () => {
        navigate('/commits');
        onClose();
      },
    },
    {
      id: 'nav-prs',
      title: 'Go to Pull Requests',
      category: 'Navigation',
      icon: <GitPullRequest className="w-4 h-4 text-intel-success" />,
      shortcut: 'G P',
      perform: () => {
        navigate('/pull-requests');
        onClose();
      },
    },
    {
      id: 'nav-issues',
      title: 'Go to Issues & Incidents',
      category: 'Navigation',
      icon: <AlertCircle className="w-4 h-4 text-intel-error" />,
      shortcut: 'G I',
      perform: () => {
        navigate('/issues');
        onClose();
      },
    },
    {
      id: 'nav-settings',
      title: 'Open Settings',
      category: 'Settings',
      icon: <Settings className="w-4 h-4 text-intel-text-secondary" />,
      perform: () => {
        navigate('/settings');
        onClose();
      },
    },
    {
      id: 'toggle-theme',
      title: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
      category: 'Settings',
      icon: theme === 'dark' ? <Sun className="w-4 h-4 text-intel-warning" /> : <Moon className="w-4 h-4 text-intel-accent" />,
      perform: () => {
        toggleTheme();
        onClose();
      },
    },
  ];

  const filtered = commands.filter((cmd) =>
    cmd.title.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].perform();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/60 backdrop-blur-[2px] animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-xl rounded-lg bg-intel-surface border border-intel-border shadow-modal overflow-hidden text-intel-text z-10 animate-slide-down">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-intel-border/60 bg-intel-bg">
          <Search className="w-4 h-4 text-intel-muted mr-3 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search actions..."
            className="w-full bg-transparent text-sm text-intel-text placeholder:text-intel-muted focus:outline-none"
          />
          <kbd className="px-2 py-0.5 text-xs bg-intel-raised text-intel-muted rounded border border-intel-border font-mono select-none">
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-intel-muted">
              No matching commands found.
            </div>
          ) : (
            filtered.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={() => item.perform()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={cn(
                    'flex items-center justify-between w-full px-3.5 py-2.5 text-sm rounded-md transition-colors text-left',
                    isSelected
                      ? 'bg-intel-raised text-intel-text shadow-subtle border border-intel-border/60'
                      : 'text-intel-text-secondary hover:text-intel-text border border-transparent'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span className="font-medium text-xs sm:text-sm">{item.title}</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {item.shortcut && (
                      <kbd className="px-2 py-0.5 text-xs font-mono bg-intel-surface text-intel-muted rounded border border-intel-border">
                        {item.shortcut}
                      </kbd>
                    )}
                    {isSelected && (
                      <ArrowRight className="w-4 h-4 text-intel-accent" />
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2 bg-intel-surface border-t border-intel-border/60 text-xs text-intel-muted flex items-center justify-between font-mono select-none">
          <span>Navigate with ↑↓ • Select with ↵</span>
          <span>INTELCODE PALETTE</span>
        </div>
      </div>
    </div>
  );
}
