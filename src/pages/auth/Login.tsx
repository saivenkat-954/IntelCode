import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Layers, Github, ArrowRight, Sparkles, Mail, Lock, AlertCircle, Info } from 'lucide-react';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, signInWithGitHub, enterDemoMode, error, clearError, isConfigured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    const { error: err } = await signIn(email, password);
    setIsLoading(false);

    if (!err) {
      navigate(from, { replace: true });
    }
  };

  const handleDemoSignIn = () => {
    enterDemoMode();
    navigate('/dashboard');
  };

  return (
    <div className="ic-auth-shell relative min-h-screen w-full flex items-center justify-center p-4 bg-intel-bg text-intel-text selection:bg-intel-accent/20 selection:text-intel-accent">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle size="sm" />
      </div>
      <div className="w-full max-w-md rounded-lg bg-intel-surface border border-intel-border p-8 shadow-modal space-y-6 animate-slide-down">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-10 h-10 rounded-md bg-intel-raised border border-intel-border flex items-center justify-center text-intel-accent shadow-subtle">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-intel-text tracking-tight font-mono">
              INTELCODE
            </h1>
            <p className="text-sm text-intel-text-secondary mt-1">
              Sign in to your engineering intelligence workspace
            </p>
          </div>
        </div>

        {/* Configuration Notice if Supabase is unconfigured */}
        {!isConfigured && (
          <div className="p-3.5 rounded-md bg-intel-raised border border-intel-border/80 text-xs text-intel-text-secondary space-y-2">
            <div className="flex items-center gap-2 font-medium text-intel-warning">
              <Info className="w-4 h-4 flex-shrink-0" />
              <span>Supabase Not Configured</span>
            </div>
            <p className="leading-relaxed text-[11px]">
              Live accounts require <code className="text-intel-text">VITE_SUPABASE_URL</code> and <code className="text-intel-text">VITE_SUPABASE_ANON_KEY</code>.
              To inspect the application immediately with synthetic benchmarks, click below.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full text-xs h-7 gap-1.5 border-intel-accent/40 text-intel-accent hover:bg-intel-accent/10"
              onClick={handleDemoSignIn}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Explore Demo Workspace (Synthetic Data)</span>
            </Button>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-md bg-intel-error/10 border border-intel-error/20 text-xs text-intel-error flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold block">{error}</span>
              {error === 'Invalid login credentials' && (
                <p className="text-[11px] text-intel-text-secondary leading-relaxed">
                  Account not found or password incorrect. If you haven't created this account on your Supabase project yet, click{' '}
                  <Link to="/signup" className="text-intel-accent hover:underline font-medium">
                    Create workspace
                  </Link>{' '}
                  below, or add the user in your Supabase Dashboard under <strong>Authentication &rarr; Users &rarr; Add user</strong>.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSignIn} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-intel-text">Work Email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError();
              }}
              placeholder="developer@company.com"
              icon={<Mail className="w-4 h-4" />}
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-intel-text">Password</label>
              <Link
                to="/forgot-password"
                className="text-xs text-intel-accent hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError();
              }}
              placeholder="••••••••"
              icon={<Lock className="w-4 h-4" />}
              autoComplete="current-password"
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full text-xs h-9"
            isLoading={isLoading}
          >
            Sign in
          </Button>
        </form>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="w-full border-t border-intel-border/60" />
          <span className="absolute bg-intel-surface px-2 text-[11px] text-intel-muted uppercase font-mono">
            or
          </span>
        </div>

        {/* GitHub OAuth */}
        <div className="space-y-2">
          <Button
            type="button"
            variant="secondary"
            className="w-full text-xs h-9 gap-2"
            onClick={async () => {
              const res = await signInWithGitHub();
              if (res?.error) {
                // error displayed via state
              }
            }}
          >
            <Github className="w-4 h-4" />
            Continue with GitHub
          </Button>

          {isConfigured && (
            <Button
              type="button"
              variant="outline"
              className="w-full text-xs h-8 gap-1.5 border-dashed border-intel-border text-intel-text-secondary hover:text-intel-text"
              onClick={handleDemoSignIn}
            >
              <Sparkles className="w-3.5 h-3.5 text-intel-accent" />
              Switch to Isolated Demo Workspace
            </Button>
          )}
        </div>

        {/* Footer Link */}
        <div className="text-center pt-2 text-xs text-intel-text-secondary">
          Don't have an account?{' '}
          <Link to="/signup" className="text-intel-accent hover:underline font-medium">
            Create workspace
          </Link>
        </div>
      </div>
    </div>
  );
}
