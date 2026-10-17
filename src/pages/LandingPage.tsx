import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { ScrollProgress } from '@/components/ui/ScrollProgress';
import { FaqSection } from '@/components/landing/FaqSection';
import {
  Layers,
  ArrowRight,
  Terminal,
  FileCode,
  GitCommit,
  GitPullRequest,
  FileText,
  ShieldCheck,
  Database,
  Lock,
  ExternalLink,
  Sparkles,
  Menu,
  X,
} from 'lucide-react';

export function LandingPage() {
  const { user, enterDemoMode } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'answer' | 'code' | 'git'>('answer');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Lock body scroll when mobile navigation is open
  useEffect(() => {
    if (isMobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileNavOpen]);

  // Handle Escape key to close mobile nav
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileNavOpen) {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileNavOpen]);

  const handleDemoClick = () => {
    enterDemoMode();
    navigate('/dashboard');
  };

  const closeMobileNav = () => {
    setIsMobileNavOpen(false);
  };

  return (
    <div className="ic-landing min-h-screen w-full bg-intel-bg text-intel-text flex flex-col selection:bg-intel-accent/20 selection:text-intel-accent">
      {/* Scroll Progress Indicator */}
      <ScrollProgress />

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b border-intel-border/70 bg-intel-bg/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Product Name */}
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5 select-none group" onClick={closeMobileNav}>
              <div className="w-8 h-8 rounded-md bg-intel-surface border border-intel-border flex items-center justify-center text-intel-accent shadow-subtle group-hover:border-intel-border-strong transition-colors">
                <Layers className="w-4.5 h-4.5" />
              </div>
              <span className="font-mono font-bold text-base tracking-tight text-intel-text group-hover:text-intel-accent transition-colors">
                INTELCODE
              </span>
            </Link>
            <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-mono text-intel-muted bg-intel-surface rounded border border-intel-border">
              Developer Intelligence
            </span>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-intel-text-secondary" aria-label="Main Navigation">
            <a href="#features" className="hover:text-intel-text transition-colors">
              Workflows
            </a>
            <a href="#architecture" className="hover:text-intel-text transition-colors">
              Architecture
            </a>
            <a href="#security" className="hover:text-intel-text transition-colors">
              Security
            </a>
            <a href="#faq" className="hover:text-intel-text transition-colors">
              FAQ
            </a>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle size="sm" />
            {user ? (
              <Button size="sm" onClick={() => navigate('/dashboard')} className="text-xs h-9">
                Open Workspace
                <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </Button>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-sm font-medium text-intel-text-secondary hover:text-intel-text px-2 py-1 transition-colors"
                >
                  Sign in
                </Link>
                <Button size="sm" onClick={() => navigate('/signup')} className="text-xs h-9">
                  Get started
                </Button>
              </>
            )}
          </div>

          {/* Mobile Header Controls */}
          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle size="sm" />
            <button
              type="button"
              onClick={() => setIsMobileNavOpen((prev) => !prev)}
              aria-expanded={isMobileNavOpen}
              aria-controls="landing-mobile-menu"
              aria-label={isMobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="p-2 rounded-md text-intel-text-secondary hover:text-intel-text hover:bg-intel-raised border border-intel-border transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-intel-accent min-h-[40px] min-w-[40px] flex items-center justify-center"
            >
              {isMobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileNavOpen && (
          <div
            id="landing-mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation"
            className="md:hidden border-b border-intel-border bg-intel-surface/98 backdrop-blur-lg px-4 py-5 space-y-4 shadow-modal animate-slide-down"
          >
            <nav className="flex flex-col space-y-2 text-sm font-medium" aria-label="Mobile Menu Links">
              <a
                href="#features"
                onClick={closeMobileNav}
                className="px-3 py-2.5 rounded-md text-intel-text-secondary hover:text-intel-text hover:bg-intel-raised transition-colors flex items-center justify-between"
              >
                <span>Workflows</span>
                <span className="text-xs font-mono text-intel-muted">&rarr;</span>
              </a>
              <a
                href="#architecture"
                onClick={closeMobileNav}
                className="px-3 py-2.5 rounded-md text-intel-text-secondary hover:text-intel-text hover:bg-intel-raised transition-colors flex items-center justify-between"
              >
                <span>Architecture</span>
                <span className="text-xs font-mono text-intel-muted">&rarr;</span>
              </a>
              <a
                href="#security"
                onClick={closeMobileNav}
                className="px-3 py-2.5 rounded-md text-intel-text-secondary hover:text-intel-text hover:bg-intel-raised transition-colors flex items-center justify-between"
              >
                <span>Security</span>
                <span className="text-xs font-mono text-intel-muted">&rarr;</span>
              </a>
              <a
                href="#faq"
                onClick={closeMobileNav}
                className="px-3 py-2.5 rounded-md text-intel-text-secondary hover:text-intel-text hover:bg-intel-raised transition-colors flex items-center justify-between"
              >
                <span>FAQ</span>
                <span className="text-xs font-mono text-intel-muted">&rarr;</span>
              </a>
            </nav>

            <div className="pt-3 border-t border-intel-border/60 flex flex-col gap-2.5">
              {user ? (
                <Button
                  size="md"
                  onClick={() => {
                    closeMobileNav();
                    navigate('/dashboard');
                  }}
                  className="w-full justify-center h-10 font-medium"
                >
                  Open Workspace
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <>
                  <Button
                    size="md"
                    onClick={() => {
                      closeMobileNav();
                      navigate('/signup');
                    }}
                    className="w-full justify-center h-10 font-semibold"
                  >
                    Get started
                  </Button>
                  <Button
                    size="md"
                    variant="outline"
                    onClick={() => {
                      closeMobileNav();
                      navigate('/login');
                    }}
                    className="w-full justify-center h-10 font-medium"
                  >
                    Sign in
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Hero Section: Editorial Asymmetric Two-Column Composition */}
      <section className="pt-12 sm:pt-16 pb-16 sm:pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Left Column: Product Proposition & Primary Actions */}
          <div className="lg:col-span-5 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-intel-surface border border-intel-border text-xs text-intel-text-secondary font-mono">
              <span className="w-2 h-2 rounded-full bg-intel-accent" />
              <span>Engineering Knowledge Engine</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-5xl font-bold tracking-tight text-intel-text font-sans leading-[1.12]">
              Understand your codebase. <br />
              <span className="text-intel-text-secondary">Not just your files.</span>
            </h1>

            <p className="text-sm sm:text-base text-intel-text-secondary leading-relaxed">
              IntelCode connects source code, Git history, pull requests, issues, and documentation
              into one searchable engineering knowledge base.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <Button
                size="lg"
                onClick={() => navigate(user ? '/dashboard' : '/signup')}
                className="h-11 px-6 text-sm font-semibold gap-2 justify-center"
              >
                <span>Get started</span>
                <ArrowRight className="w-4 h-4" />
              </Button>

              <Button
                size="lg"
                variant="secondary"
                onClick={handleDemoClick}
                className="h-11 px-6 text-sm font-medium gap-2 justify-center bg-intel-surface border border-intel-border hover:bg-intel-raised"
              >
                <Sparkles className="w-4 h-4 text-intel-accent" />
                <span>Explore demo</span>
              </Button>
            </div>

            {/* Benchmark Telemetry Chips */}
            <div className="pt-4 border-t border-intel-border/60">
              <span className="text-xs font-mono text-intel-muted uppercase tracking-wider block mb-2">
                Interactive Preview Fixture
              </span>
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-intel-text-secondary">
                <span className="px-2 py-1 rounded bg-intel-surface border border-intel-border text-intel-text">
                  acme-org/intel-gateway
                </span>
                <span>•</span>
                <span>5 Files</span>
                <span>•</span>
                <span>14 AST Chunks</span>
                <span>•</span>
                <span className="text-intel-accent">pgvector 512-d (Voyage Code 4)</span>
              </div>
            </div>
          </div>

          {/* Right Column: Realistic Workspace Preview */}
          <div className="lg:col-span-7">
            <div className="rounded-xl bg-intel-surface border border-intel-border shadow-modal overflow-hidden text-left">
              {/* Window Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-intel-bg border-b border-intel-border">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5" aria-hidden="true">
                    <div className="w-3 h-3 rounded-full bg-intel-border" />
                    <div className="w-3 h-3 rounded-full bg-intel-border" />
                    <div className="w-3 h-3 rounded-full bg-intel-border" />
                  </div>
                  <span className="text-xs font-mono text-intel-muted ml-2 truncate">
                    acme-org/intel-gateway — Codebase Investigation
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="success" size="sm" className="font-mono text-xs">
                    Ready (14 Chunks)
                  </Badge>
                </div>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="flex items-center gap-1 px-4 py-2 bg-intel-surface border-b border-intel-border text-xs sm:text-sm overflow-x-auto">
                <button
                  onClick={() => setActiveTab('answer')}
                  className={`px-3 py-1.5 rounded transition-colors font-medium whitespace-nowrap ${
                    activeTab === 'answer'
                      ? 'bg-intel-raised text-intel-text border border-intel-border shadow-subtle'
                      : 'text-intel-text-secondary hover:text-intel-text'
                  }`}
                >
                  Grounded Investigation
                </button>
                <button
                  onClick={() => setActiveTab('code')}
                  className={`px-3 py-1.5 rounded transition-colors font-medium whitespace-nowrap ${
                    activeTab === 'code'
                      ? 'bg-intel-raised text-intel-text border border-intel-border shadow-subtle'
                      : 'text-intel-text-secondary hover:text-intel-text'
                  }`}
                >
                  Monaco: src/payment/retry.ts
                </button>
                <button
                  onClick={() => setActiveTab('git')}
                  className={`px-3 py-1.5 rounded transition-colors font-medium whitespace-nowrap ${
                    activeTab === 'git'
                      ? 'bg-intel-raised text-intel-text border border-intel-border shadow-subtle'
                      : 'text-intel-text-secondary hover:text-intel-text'
                  }`}
                >
                  Git Lineage: PR #184
                </button>
              </div>

              {/* Preview Body */}
              <div className="flex flex-col sm:flex-row min-h-[320px] bg-intel-bg">
                {/* Micro File Tree Pane */}
                <div className="w-full sm:w-48 bg-intel-surface/50 border-b sm:border-b-0 sm:border-r border-intel-border p-3 font-mono text-xs space-y-1.5 shrink-0">
                  <span className="text-intel-muted text-[11px] uppercase tracking-wider block font-semibold mb-2">
                    Explorer
                  </span>
                  <div className="p-1 rounded bg-intel-raised text-intel-accent flex items-center gap-1.5 font-medium truncate">
                    <FileCode className="w-3.5 h-3.5 shrink-0" />
                    <span>retry.ts</span>
                  </div>
                  <div className="p-1 rounded text-intel-text-secondary hover:text-intel-text flex items-center gap-1.5 truncate">
                    <FileCode className="w-3.5 h-3.5 shrink-0" />
                    <span>session.ts</span>
                  </div>
                  <div className="p-1 rounded text-intel-text-secondary hover:text-intel-text flex items-center gap-1.5 truncate">
                    <FileCode className="w-3.5 h-3.5 shrink-0" />
                    <span>redis.ts</span>
                  </div>
                  <div className="p-1 rounded text-intel-text-secondary hover:text-intel-text flex items-center gap-1.5 truncate">
                    <FileCode className="w-3.5 h-3.5 shrink-0" />
                    <span>rate-limiter.ts</span>
                  </div>
                  <div className="p-1 rounded text-intel-text-secondary hover:text-intel-text flex items-center gap-1.5 truncate">
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span>README.md</span>
                  </div>
                </div>

                {/* Main Content Pane */}
                <div className="flex-1 p-4 sm:p-5 text-sm space-y-3.5">
                  {activeTab === 'answer' && (
                    <div className="space-y-3 animate-fade-in">
                      <div className="p-3 rounded-md bg-intel-raised border border-intel-border font-mono text-xs text-intel-text flex items-center gap-2">
                        <Terminal className="w-3.5 h-3.5 text-intel-accent shrink-0" />
                        <span>How does payment retry work and why was it introduced?</span>
                      </div>

                      <div className="p-4 rounded-lg bg-intel-surface border border-intel-border space-y-3">
                        <p className="text-intel-text-secondary text-xs sm:text-sm leading-relaxed">
                          Payment retries are executed by <code className="text-intel-accent font-mono text-xs">RetryService</code> in{' '}
                          <code className="text-intel-text font-mono text-xs">src/payment/retry.ts</code>. The service handles intermittent HTTP 503 Provider Unavailable errors with exponential backoff up to 3 attempts.
                        </p>

                        <div className="pt-2 border-t border-intel-border/60">
                          <span className="text-[11px] font-semibold text-intel-muted uppercase tracking-wider block mb-2 font-mono">
                            Verified Source Citations (3)
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div className="p-2.5 rounded bg-intel-raised border border-intel-border space-y-0.5">
                              <div className="flex items-center gap-1.5 text-intel-accent font-mono font-medium">
                                <FileCode className="w-3.5 h-3.5" />
                                <span>src/payment/retry.ts</span>
                              </div>
                              <div className="text-intel-muted text-[11px]">Lines 11–48 (RetryService)</div>
                            </div>

                            <div className="p-2.5 rounded bg-intel-raised border border-intel-border space-y-0.5">
                              <div className="flex items-center gap-1.5 text-intel-success font-mono font-medium">
                                <GitPullRequest className="w-3.5 h-3.5" />
                                <span>PR #184 (Merged)</span>
                              </div>
                              <div className="text-intel-muted text-[11px]">Upstream 503 circuit breaker</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'code' && (
                    <pre className="font-mono text-xs leading-relaxed text-intel-text p-3.5 bg-intel-surface rounded-md border border-intel-border overflow-x-auto animate-fade-in">
                      <code>{`// src/payment/retry.ts
export class RetryService {
  private defaultOptions: RetryOptions = {
    maxRetries: 3,         // commit 7a81d2f (sarah.dev)
    initialDelayMs: 200,   // exponential backoff 2x
    backoffFactor: 2,
  };

  async executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    // Intercepts transient HTTP 503 errors from upstream payment PSP
    ...
  }
}`}</code>
                    </pre>
                  )}

                  {activeTab === 'git' && (
                    <div className="p-4 bg-intel-surface rounded-md border border-intel-border space-y-2.5 animate-fade-in text-xs sm:text-sm">
                      <div className="flex items-center justify-between">
                        <Badge variant="success" size="sm">PR #184 MERGED</Badge>
                        <span className="text-intel-muted font-mono text-xs">Merged by sarah.dev</span>
                      </div>
                      <h4 className="font-semibold text-intel-text text-sm">
                        Payment retry logic and circuit breaker for upstream 503s
                      </h4>
                      <p className="text-intel-text-secondary leading-relaxed text-xs">
                        Linked to Issue #179: Upstream provider experienced transient packet drops during high-throughput checkout spikes.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How IntelCode Works: The 4-Stage Ingestion Pipeline */}
      <section id="architecture" className="py-20 px-4 sm:px-6 lg:px-8 border-t border-intel-border/60 bg-intel-surface/30">
        <div className="max-w-6xl mx-auto space-y-12">
          <div className="text-center space-y-2">
            <span className="text-xs font-mono font-semibold text-intel-accent uppercase tracking-wider">
              Architecture & Ingestion
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-intel-text">
              How IntelCode Indexes Engineering Repositories
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs sm:text-sm">
            <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-2.5">
              <div className="w-9 h-9 rounded-md bg-intel-raised border border-intel-border flex items-center justify-center text-intel-accent">
                <FileCode className="w-4.5 h-4.5" />
              </div>
              <h3 className="font-semibold text-intel-text text-base">1. AST Chunking</h3>
              <p className="text-intel-text-secondary text-xs sm:text-sm leading-relaxed">
                Source files are parsed into semantic symbols: functions, classes, interfaces, and methods with accurate line boundaries.
              </p>
            </div>

            <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-2.5">
              <div className="w-9 h-9 rounded-md bg-intel-raised border border-intel-border flex items-center justify-center text-intel-warning">
                <Database className="w-4.5 h-4.5" />
              </div>
              <h3 className="font-semibold text-intel-text text-base">2. Hybrid Vectors</h3>
              <p className="text-intel-text-secondary text-xs sm:text-sm leading-relaxed">
                512-dimensional code embeddings with Voyage Code 4 blended with PostgreSQL Full-Text Search rank via Reciprocal Rank Fusion (RRF) in pgvector.
              </p>
            </div>

            <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-2.5">
              <div className="w-9 h-9 rounded-md bg-intel-raised border border-intel-border flex items-center justify-center text-intel-success">
                <GitCommit className="w-4.5 h-4.5" />
              </div>
              <h3 className="font-semibold text-intel-text text-base">3. Git Correlation</h3>
              <p className="text-intel-text-secondary text-xs sm:text-sm leading-relaxed">
                Commits, pull requests, issues, and docs are connected to code chunks to answer historical &quot;Why&quot; inquiries.
              </p>
            </div>

            <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-2.5">
              <div className="w-9 h-9 rounded-md bg-intel-raised border border-intel-border flex items-center justify-center text-intel-accent">
                <ShieldCheck className="w-4.5 h-4.5" />
              </div>
              <h3 className="font-semibold text-intel-text text-base">4. Grounded Output</h3>
              <p className="text-intel-text-secondary text-xs sm:text-sm leading-relaxed">
                Answers are grounded strictly in retrieved context. Sensitive files (.env, keys) are stripped before ingestion.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Real Developer Inquiries */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto space-y-12">
          <div className="text-center space-y-2">
            <span className="text-xs font-mono font-semibold text-intel-accent uppercase tracking-wider">
              Real Workflows
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-intel-text">
              Questions Engineers Ask Daily
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {[
              {
                q: 'Why does this payment retry logic exist?',
                desc: 'Trace back from code lines to PR #184 and post-mortem incident reports.',
              },
              {
                q: 'How has this function changed over time?',
                desc: 'View an interactive evolution timeline of git diffs and commits.',
              },
              {
                q: 'What could break if I modify this function?',
                desc: 'Static dependency blast-radius evaluation with suggested test suites.',
              },
              {
                q: 'Why was Redis introduced into this service?',
                desc: 'Correlate architectural RFCs with cache configuration files.',
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-2"
              >
                <div className="font-mono font-semibold text-intel-text flex items-center gap-2 text-sm sm:text-base">
                  <span className="text-intel-accent">&gt;</span>
                  <span>{item.q}</span>
                </div>
                <p className="text-intel-text-secondary text-xs sm:text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Safeguards */}
      <section id="security" className="py-20 px-4 sm:px-6 lg:px-8 border-t border-intel-border/60 bg-intel-surface/30">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-2">
            <span className="text-xs font-mono font-semibold text-intel-success uppercase tracking-wider flex items-center justify-center gap-2">
              <Lock className="w-4 h-4" />
              Security by Architecture
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-intel-text">
              Zero Secret Indexing & Untrusted Context Isolation
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs sm:text-sm">
            <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-2">
              <span className="font-semibold text-intel-text text-sm">Secret Filtering</span>
              <p className="text-intel-text-secondary text-xs sm:text-sm leading-relaxed">
                .env files, private keys, certificates, and credentials are automatically stripped and never sent to AI models.
              </p>
            </div>
            <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-2">
              <span className="font-semibold text-intel-text text-sm">Server-Side Execution</span>
              <p className="text-intel-text-secondary text-xs sm:text-sm leading-relaxed">
                All Gemini API keys, Voyage AI tokens, and GitHub OAuth client secrets remain locked inside serverless Vercel Functions.
              </p>
            </div>
            <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-2">
              <span className="font-semibold text-intel-text text-sm">Row Level Security</span>
              <p className="text-intel-text-secondary text-xs sm:text-sm leading-relaxed">
                PostgreSQL RLS ensures developers only see repositories they own or have been explicitly granted access to.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <FaqSection />

      {/* Final Call to Action */}
      <section className="py-24 px-4 sm:px-6 text-center max-w-2xl mx-auto space-y-6">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-intel-text font-mono">
          Ready to understand your codebase?
        </h2>
        <p className="text-sm sm:text-base text-intel-text-secondary leading-relaxed">
          Index your repositories and turn source code, Git history, and PRs into an actionable engineering knowledge layer.
        </p>
        <div className="pt-2 flex justify-center gap-3">
          <Button size="lg" onClick={() => navigate(user ? '/dashboard' : '/signup')} className="h-11 px-6 font-semibold">
            Get started with IntelCode
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-intel-border/60 py-8 px-4 sm:px-6 text-xs text-intel-muted bg-intel-bg">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-intel-text">INTELCODE</span>
            <span>—</span>
            <span>Understand your codebase. Not just your files.</span>
          </div>

          <div className="flex items-center gap-6 text-intel-text-secondary">
            <Link to="/login" className="hover:text-intel-text">Sign in</Link>
            <Link to="/signup" className="hover:text-intel-text">Create Workspace</Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="hover:text-intel-text flex items-center gap-1"
            >
              GitHub <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
