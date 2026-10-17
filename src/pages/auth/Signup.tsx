import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Layers, Mail, Lock, User, CheckCircle2, AlertCircle, Info } from 'lucide-react';

export function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const { signUp, error, clearError, isConfigured } = useAuth();
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters long.');
      return;
    }

    setIsLoading(true);
    const { error: err } = await signUp(email, password, fullName);
    setIsLoading(false);

    if (!err) {
      setIsSuccess(true);
      setTimeout(() => navigate('/dashboard'), 2000);
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
              INTELCODE
            </h1>
            <p className="text-sm text-intel-text-secondary mt-1">
              Create your engineering intelligence workspace
            </p>
          </div>
        </div>

        {!isConfigured && (
          <div className="p-3.5 rounded-md bg-intel-warning/10 border border-intel-warning/20 text-xs text-intel-warning flex items-start gap-2.5">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold block mb-0.5">Configuration Required</span>
              Supabase Auth credentials must be configured in your environment to create permanent accounts.
            </div>
          </div>
        )}

        {isSuccess ? (
          <div className="p-5 rounded-md bg-intel-success/10 border border-intel-success/20 text-center space-y-3">
            <CheckCircle2 className="w-8 h-8 text-intel-success mx-auto" />
            <div className="text-sm font-semibold text-intel-success">Workspace created successfully!</div>
            <p className="text-xs text-intel-text-secondary">
              Redirecting you to your new engineering workspace...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSignUp} className="space-y-4">
            {(error || validationError) && (
              <div className="p-3 rounded-md bg-intel-error/10 border border-intel-error/20 text-xs text-intel-error flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{validationError || error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-intel-text">Full Name</label>
              <Input
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  clearError();
                }}
                placeholder="Alex Chen"
                icon={<User className="w-4 h-4" />}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-intel-text">Work Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearError();
                }}
                placeholder="alex@company.com"
                icon={<Mail className="w-4 h-4" />}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-intel-text">Password</label>
              <PasswordInput
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearError();
                }}
                placeholder="At least 8 characters"
                icon={<Lock className="w-4 h-4" />}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-intel-text">Confirm Password</label>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  clearError();
                }}
                placeholder="Confirm password"
                icon={<Lock className="w-4 h-4" />}
                autoComplete="new-password"
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full text-xs h-9 mt-2"
              isLoading={isLoading}
              disabled={!isConfigured}
            >
              Create Workspace Account
            </Button>
          </form>
        )}

        <div className="text-center pt-2 text-xs text-intel-text-secondary">
          Already have an account?{' '}
          <Link to="/login" className="text-intel-accent hover:underline font-medium">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
