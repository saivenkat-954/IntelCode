import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Layers, Mail, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const { resetPassword, error, isConfigured } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    const { error: err } = await resetPassword(email);
    setIsLoading(false);

    if (!err) {
      setIsSent(true);
    }
  };

  return (
    <div className="ic-auth-shell relative min-h-screen w-full flex items-center justify-center p-4 bg-intel-bg text-intel-text selection:bg-intel-accent/20 selection:text-intel-accent">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle size="sm" />
      </div>
      <div className="w-full max-w-md rounded-lg bg-intel-surface border border-intel-border p-8 shadow-modal space-y-6 animate-slide-down">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-10 h-10 rounded-md bg-intel-raised border border-intel-border flex items-center justify-center text-intel-accent shadow-subtle">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-intel-text tracking-tight font-mono">
              Reset Password
            </h1>
            <p className="text-sm text-intel-text-secondary mt-1">
              Enter your account email to receive recovery instructions
            </p>
          </div>
        </div>

        {!isConfigured && (
          <div className="p-3.5 rounded-md bg-intel-warning/10 border border-intel-warning/20 text-xs text-intel-warning flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block mb-0.5">Configuration Notice</span>
              Supabase Auth is not configured in this environment. Password recovery requires active Supabase SMTP settings.
            </div>
          </div>
        )}

        {isSent ? (
          <div className="p-5 rounded-md bg-intel-success/10 border border-intel-success/20 text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-intel-success mx-auto" />
            <div className="text-sm font-semibold text-intel-success">Recovery email dispatched</div>
            <p className="text-xs text-intel-text-secondary leading-relaxed">
              If an account with <span className="font-mono text-intel-text">{email}</span> exists, you will receive a secure password reset link.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs text-intel-accent hover:underline pt-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to sign in</span>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-md bg-intel-error/10 border border-intel-error/20 text-xs text-intel-error flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-intel-text">Account Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@company.com"
                icon={<Mail className="w-4 h-4" />}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full text-xs h-9"
              isLoading={isLoading}
              disabled={!isConfigured}
            >
              Send Reset Instructions
            </Button>
          </form>
        )}

        <div className="text-center pt-2 text-xs">
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 text-intel-text-secondary hover:text-intel-text transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to sign in</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
