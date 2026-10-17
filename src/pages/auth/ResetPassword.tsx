import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Layers, Lock, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';

export function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError('Supabase authentication is not configured. Password update requires an active Supabase project.');
      setCheckingSession(false);
      setHasValidSession(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (sessionError || !session) {
        setError('No active password recovery session found. Please request a new recovery link.');
        setHasValidSession(false);
      } else {
        setHasValidSession(true);
      }
      setCheckingSession(false);
    });
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (!isSupabaseConfigured) {
      setError('Cannot update password: authentication service is not configured.');
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      setIsSuccess(true);
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred updating your password.');
      setIsLoading(false);
    }
  };

  return (
    <div className="ic-auth-shell relative min-h-screen w-full flex items-center justify-center p-4 bg-intel-bg text-intel-text selection:bg-intel-accent/20 selection:text-intel-accent">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle size="sm" />
      </div>
      <div className="w-full max-w-md rounded-lg bg-intel-surface border border-intel-border p-8 shadow-modal space-y-6 animate-slide-down">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-10 h-10 rounded-md bg-intel-raised border border-intel-border flex items-center justify-center text-intel-accent shadow-subtle">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-intel-text tracking-tight font-mono">
              Update Password
            </h1>
            <p className="text-sm text-intel-text-secondary mt-1">
              Set a new secure password for your workspace account
            </p>
          </div>
        </div>

        {checkingSession ? (
          <div className="py-8 text-center text-sm text-intel-text-secondary font-mono animate-pulse">
            Verifying recovery session...
          </div>
        ) : isSuccess ? (
          <div className="p-5 rounded-md bg-intel-success/10 border border-intel-success/20 text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-intel-success mx-auto" />
            <div className="text-sm font-semibold text-intel-success">Password updated successfully!</div>
            <p className="text-xs text-intel-text-secondary">
              Your password has been changed. Redirecting to your dashboard...
            </p>
          </div>
        ) : !hasValidSession ? (
          <div className="space-y-4">
            <div className="p-4 rounded-md bg-intel-error/10 border border-intel-error/20 flex items-start gap-3 text-xs text-intel-error leading-relaxed">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">Invalid or Expired Link</span>
                {error || 'Your recovery session has expired or is invalid. Please request a new recovery email.'}
              </div>
            </div>

            <Link
              to="/forgot-password"
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium bg-intel-raised border border-intel-border text-intel-text rounded-md hover:bg-intel-border transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Request new recovery link</span>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleReset} className="space-y-4">
            {error && (
              <div className="p-3 rounded-md bg-intel-error/10 border border-intel-error/20 text-xs text-intel-error flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-intel-text">New Password</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                icon={<Lock className="w-4 h-4" />}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-intel-text">Confirm New Password</label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your new password"
                icon={<Lock className="w-4 h-4" />}
                autoComplete="new-password"
                required
              />
            </div>

            <Button type="submit" className="w-full text-xs h-9 mt-2" isLoading={isLoading}>
              Update Password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
