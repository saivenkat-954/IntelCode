import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Settings as SettingsIcon,
  Database,
  Cpu,
  Github,
  Shield,
  Keyboard,
  Moon,
  Sun,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  User,
  RefreshCw,
  Loader2,
  Unlink,
} from 'lucide-react';

interface HealthData {
  supabase: {
    configured: boolean;
    url: string | null;
    anonKeyPresent: boolean;
    serviceKeyPresent: boolean;
    databaseReachable: boolean;
    tablesExist: boolean;
    details: string;
  };
  embeddings?: {
    provider: string;
    configured: boolean;
    model: string;
    dimensions: number;
    status: string;
  };
  gemini: {
    configured: boolean;
    chatModel: string;
    embeddingModel?: string;
    embeddingDimensions?: number;
    status: string;
  };
  github: {
    configured: boolean;
    clientId: string | null;
    status: string;
  };
}

export function Settings() {
  const { user, isDemoMode, exitDemoMode } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [health, setHealth] = useState<HealthData | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [githubToken, setGithubToken] = useState<string | null>(() => {
    return localStorage.getItem('intelcode_github_token');
  });
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [isConnectingGitHub, setIsConnectingGitHub] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [oauthSuccess, setOauthSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth();
    checkGitHubCallback();
  }, []);

  useEffect(() => {
    if (githubToken) {
      verifyGitHubUser(githubToken);
    } else {
      setGithubUser(null);
    }
  }, [githubToken]);

  const fetchHealth = async () => {
    setLoadingHealth(true);
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch {
      // Serverless functions might be offline in local standalone Vite mode
    } finally {
      setLoadingHealth(false);
    }
  };

  const verifyGitHubUser = async (token: string) => {
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        setGithubUser(data.login || data.name);
      } else {
        // Token invalid or expired
        localStorage.removeItem('intelcode_github_token');
        setGithubToken(null);
      }
    } catch {
      // Network error or rate limit
    }
  };

  const checkGitHubCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');

    if (!code) return;

    // Validate CSRF state
    const savedState = sessionStorage.getItem('intelcode_github_oauth_state');
    if (!savedState || savedState !== state) {
      setOauthError('GitHub OAuth state parameter mismatch. Token exchange blocked to prevent CSRF attacks.');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    sessionStorage.removeItem('intelcode_github_oauth_state');
    setIsConnectingGitHub(true);
    setOauthError(null);

    try {
      const res = await fetch('/api/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'exchange', code, state }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setOauthError(data.error || 'GitHub token exchange failed.');
      } else if (data.access_token) {
        localStorage.setItem('intelcode_github_token', data.access_token);
        setGithubToken(data.access_token);
        setOauthSuccess('GitHub account connected successfully!');
        verifyGitHubUser(data.access_token);
      }
    } catch (err: any) {
      setOauthError(err.message || 'Network error during GitHub authentication.');
    } finally {
      setIsConnectingGitHub(false);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  const handleConnectGitHub = async () => {
    setIsConnectingGitHub(true);
    setOauthError(null);

    try {
      const res = await fetch('/api/github?action=config');
      const data = await res.json();

      if (!data.configured || !data.clientId) {
        setOauthError(
          'GitHub OAuth credentials (GITHUB_CLIENT_ID & GITHUB_CLIENT_SECRET) are not configured on the server.'
        );
        setIsConnectingGitHub(false);
        return;
      }

      // Generate cryptographically secure random state
      const state = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2);

      sessionStorage.setItem('intelcode_github_oauth_state', state);

      const redirectUri = encodeURIComponent(`${window.location.origin}/settings`);
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${data.clientId}&redirect_uri=${redirectUri}&scope=repo%20read:user&state=${state}`;

      window.location.href = authUrl;
    } catch (err: any) {
      setOauthError(err.message || 'Failed to initialize GitHub OAuth authorization flow.');
      setIsConnectingGitHub(false);
    }
  };

  const handleDisconnectGitHub = () => {
    localStorage.removeItem('intelcode_github_token');
    setGithubToken(null);
    setGithubUser(null);
    setOauthSuccess('GitHub account disconnected.');
  };

  return (
    <div className="p-5 sm:p-8 max-w-4xl mx-auto space-y-7">
      <div className="pb-4 border-b border-intel-border">
        <h1 className="text-2xl font-bold tracking-tight text-intel-text flex items-center gap-2.5">
          <SettingsIcon className="w-6 h-6 text-intel-muted" />
          <span>Workspace Settings</span>
        </h1>
        <p className="text-sm text-intel-text-secondary mt-1">
          System telemetry, infrastructure configurations, and developer preferences
        </p>
      </div>

      {oauthError && (
        <div className="p-4 rounded-md bg-intel-error/10 border border-intel-error/20 flex items-start gap-3 text-xs text-intel-error">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">Authentication Error</span>
            {oauthError}
          </div>
        </div>
      )}

      {oauthSuccess && (
        <div className="p-4 rounded-md bg-intel-success/10 border border-intel-success/20 flex items-start gap-3 text-xs text-intel-success">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">Connected</span>
            {oauthSuccess}
          </div>
        </div>
      )}

      <div className="space-y-6 text-sm">
        {/* User Profile */}
        <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-intel-muted font-mono flex items-center gap-2">
              <User className="w-3.5 h-3.5" />
              <span>Developer Account</span>
            </h2>
            {isDemoMode && (
              <Badge variant="warning" size="sm" className="font-mono text-xs">
                Demo Benchmark Mode
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
            <div className="p-3 rounded-md bg-intel-bg border border-intel-border">
              <span className="text-intel-muted block text-xs">Display Name</span>
              <span className="font-medium text-intel-text text-sm">
                {user?.full_name || (isDemoMode ? 'Alex Chen (Benchmark)' : 'Guest Developer')}
              </span>
            </div>
            <div className="p-3 rounded-md bg-intel-bg border border-intel-border">
              <span className="text-intel-muted block text-xs">Authenticated Email</span>
              <span className="font-mono text-intel-text text-sm">
                {user?.email || (isDemoMode ? 'alex.chen@intelcode.dev' : 'Unauthenticated')}
              </span>
            </div>
          </div>

          {isDemoMode && (
            <div className="pt-2 flex items-center justify-between text-xs text-intel-text-secondary">
              <span>Currently in isolated read-only demo benchmark mode.</span>
              <Button variant="outline" size="sm" onClick={exitDemoMode} className="text-xs h-7">
                Exit Demo
              </Button>
            </div>
          )}
        </div>

        {/* Integration Statuses */}
        <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-intel-muted font-mono">
              Infrastructure & Service Connections
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchHealth}
              disabled={loadingHealth}
              className="text-xs h-7 gap-1 text-intel-muted hover:text-intel-text"
            >
              <RefreshCw className={`w-3 h-3 ${loadingHealth ? 'animate-spin' : ''}`} />
              <span>Refresh Status</span>
            </Button>
          </div>

          <div className="space-y-3">
            {/* Supabase */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-md bg-intel-bg border border-intel-border">
              <div className="flex items-start gap-3">
                <Database className="w-5 h-5 text-intel-accent shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-intel-text text-sm block">
                    Supabase PostgreSQL & pgvector (512-d / 768-d)
                  </span>
                  <p className="text-xs text-intel-text-secondary mt-0.5">
                    {health?.supabase.details ||
                      (isSupabaseConfigured
                        ? 'Connected to Supabase project with Row Level Security.'
                        : 'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY required for live accounts.')}
                  </p>
                </div>
              </div>
              <Badge
                variant={
                  health?.supabase.tablesExist
                    ? 'success'
                    : isSupabaseConfigured
                    ? 'warning'
                    : 'neutral'
                }
                size="sm"
                className="text-xs shrink-0 self-start sm:self-auto font-mono"
              >
                {health?.supabase.tablesExist
                  ? 'Schema Active'
                  : isSupabaseConfigured
                  ? 'Tables Pending'
                  : 'Unconfigured'}
              </Badge>
            </div>

            {/* Voyage AI Code 4 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-md bg-intel-bg border border-intel-border">
              <div className="flex items-start gap-3">
                <Cpu className="w-5 h-5 text-intel-accent shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-intel-text text-sm block">
                    Voyage AI Code 4 Embeddings (Vector Search)
                  </span>
                  <p className="text-xs text-intel-text-secondary mt-0.5">
                    Model: <code className="font-mono text-intel-text">{health?.embeddings?.model || 'voyage-code-4'}</code> •
                    Dimension: <code className="font-mono text-intel-text">{health?.embeddings?.dimensions || 512}</code> (Matryoshka floating-point)
                  </p>
                </div>
              </div>
              <Badge
                variant={health?.embeddings?.configured ? 'success' : 'neutral'}
                size="sm"
                className="text-xs shrink-0 self-start sm:self-auto font-mono"
              >
                {health?.embeddings?.configured ? 'Voyage Active' : 'Key Unconfigured'}
              </Badge>
            </div>

            {/* Google Gemini */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-md bg-intel-bg border border-intel-border">
              <div className="flex items-start gap-3">
                <Cpu className="w-5 h-5 text-intel-success shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-intel-text text-sm block">
                    Google Gemini Grounded Intelligence
                  </span>
                  <p className="text-xs text-intel-text-secondary mt-0.5">
                    Model: <code className="font-mono text-intel-text">{health?.gemini.chatModel || 'gemini-2.5-flash'}</code> •
                    AI answer generation grounded on retrieved repository code
                  </p>
                </div>
              </div>
              <Badge
                variant={health?.gemini.configured ? 'success' : 'neutral'}
                size="sm"
                className="text-xs shrink-0 self-start sm:self-auto font-mono"
              >
                {health?.gemini.configured ? 'API Key Active' : 'Key Unconfigured'}
              </Badge>
            </div>

            {/* GitHub OAuth */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-md bg-intel-bg border border-intel-border">
              <div className="flex items-start gap-3">
                <Github className="w-5 h-5 text-intel-warning shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-intel-text text-sm block">
                    GitHub App OAuth Integration
                  </span>
                  <p className="text-xs text-intel-text-secondary mt-0.5">
                    {githubUser ? (
                      <span>
                        Connected as <strong className="text-intel-text font-mono">@{githubUser}</strong>. Repository importing and git trees enabled.
                      </span>
                    ) : (
                      <span>
                        Enables repository importing, default branch syncing, and commit diff extraction.
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                {githubToken ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisconnectGitHub}
                    className="text-xs h-7 gap-1 border-intel-border text-intel-text-secondary hover:text-intel-error"
                  >
                    <Unlink className="w-3 h-3" />
                    <span>Disconnect</span>
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleConnectGitHub}
                    disabled={isConnectingGitHub}
                    className="text-xs h-7 gap-1.5"
                  >
                    {isConnectingGitHub ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Github className="w-3 h-3" />
                    )}
                    <span>Connect GitHub</span>
                  </Button>
                )}
                <Badge
                  variant={githubToken ? 'success' : health?.github.configured ? 'neutral' : 'warning'}
                  size="sm"
                  className="text-xs font-mono"
                >
                  {githubToken ? 'Connected' : health?.github.configured ? 'Ready' : 'Not Configured'}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Security & Exclusion Filters */}
        <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-3.5">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-intel-accent" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-intel-muted font-mono">
              AST Ingestion Security Rules (Secret Exclusions)
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-intel-text-secondary leading-relaxed">
            The ingestion pipeline automatically discards matches against the following patterns to prevent credentials, secrets, or binary artifacts from reaching the database or AI models:
          </p>
          <div className="flex flex-wrap gap-2 font-mono text-xs">
            {[
              '.env*',
              '*.pem',
              '*.key',
              'id_rsa',
              'credentials.json',
              'node_modules',
              '.git',
              'dist',
              'build',
              'coverage',
              '*.bin',
              '*.exe',
            ].map((pattern) => (
              <span
                key={pattern}
                className="px-2.5 py-1 rounded bg-intel-bg border border-intel-border text-intel-text-secondary"
              >
                {pattern}
              </span>
            ))}
          </div>
        </div>

        {/* Keyboard Shortcuts Reference */}
        <div className="p-5 rounded-lg bg-intel-surface border border-intel-border space-y-3.5">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-intel-text-secondary" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-intel-muted font-mono">
              Engineering Keyboard Shortcuts
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono">
            <div className="flex items-center justify-between p-2.5 rounded bg-intel-bg border border-intel-border">
              <span className="text-intel-text-secondary">Open Command Palette</span>
              <kbd className="px-2 py-0.5 bg-intel-surface rounded border border-intel-border text-intel-text font-semibold">
                ⌘ / Ctrl + K
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded bg-intel-bg border border-intel-border">
              <span className="text-intel-text-secondary">Send Question</span>
              <kbd className="px-2 py-0.5 bg-intel-surface rounded border border-intel-border text-intel-text font-semibold">
                ⌘ / Ctrl + Enter
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded bg-intel-bg border border-intel-border">
              <span className="text-intel-text-secondary">Navigate to Repositories</span>
              <kbd className="px-2 py-0.5 bg-intel-surface rounded border border-intel-border text-intel-text font-semibold">
                G then R
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded bg-intel-bg border border-intel-border">
              <span className="text-intel-text-secondary">Navigate to Commits</span>
              <kbd className="px-2 py-0.5 bg-intel-surface rounded border border-intel-border text-intel-text font-semibold">
                G then C
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded bg-intel-bg border border-intel-border">
              <span className="text-intel-text-secondary">Navigate to Pull Requests</span>
              <kbd className="px-2 py-0.5 bg-intel-surface rounded border border-intel-border text-intel-text font-semibold">
                G then P
              </kbd>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded bg-intel-bg border border-intel-border">
              <span className="text-intel-text-secondary">Navigate to Issues</span>
              <kbd className="px-2 py-0.5 bg-intel-surface rounded border border-intel-border text-intel-text font-semibold">
                G then I
              </kbd>
            </div>
          </div>
        </div>

        {/* Theme Settings */}
        <div className="p-5 rounded-lg bg-intel-surface border border-intel-border flex items-center justify-between">
          <div>
            <span className="font-semibold text-intel-text text-sm">Theme Appearance</span>
            <p className="text-xs text-intel-text-secondary mt-0.5">
              High-contrast developer dark theme and crisp technical light appearance
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            className="gap-2 text-xs h-9 px-3"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-intel-warning" />
            ) : (
              <Moon className="w-4 h-4 text-intel-accent" />
            )}
            <span>{theme === 'dark' ? 'Light Theme' : 'Dark Theme'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
