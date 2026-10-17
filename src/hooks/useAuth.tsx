import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  isDemo?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  isConfigured: boolean;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  signInWithGitHub: () => Promise<{ error: Error | null }>;
  refreshSession: () => Promise<{ session: Session | null; error: Error | null }>;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_STORAGE_KEY = 'intelcode_demo_mode_active';

const SYNTHETIC_DEMO_USER: AuthUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'alex.chen@intelcode.dev',
  full_name: 'Alex Chen (Demo Workspace)',
  avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
  isDemo: true,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    return localStorage.getItem(DEMO_STORAGE_KEY) === 'true';
  });

  const clearError = useCallback(() => setError(null), []);

  const enterDemoMode = useCallback(() => {
    localStorage.setItem(DEMO_STORAGE_KEY, 'true');
    setIsDemoMode(true);
    setUser(SYNTHETIC_DEMO_USER);
    setError(null);
  }, []);

  const exitDemoMode = useCallback(() => {
    localStorage.removeItem(DEMO_STORAGE_KEY);
    setIsDemoMode(false);
    setUser(null);
    setSession(null);
    setError(null);
  }, []);

  useEffect(() => {
    // Check if explicitly in demo mode
    if (localStorage.getItem(DEMO_STORAGE_KEY) === 'true') {
      setUser(SYNTHETIC_DEMO_USER);
      setIsDemoMode(true);
      setLoading(false);
      return;
    }

    if (!isSupabaseConfigured) {
      // If Supabase is unconfigured and user did not explicitly enter demo mode,
      // do NOT create a fake user. Keep user null so login prompts for configuration.
      setUser(null);
      setSession(null);
      setLoading(false);
      return;
    }

    // Real Supabase Auth initialization
    supabase.auth.getSession().then(({ data: { session: currentSession }, error: sessionError }) => {
      if (sessionError) {
        setError(sessionError.message);
      }
      setSession(currentSession);
      if (currentSession?.user) {
        setUser({
          id: currentSession.user.id,
          email: currentSession.user.email || '',
          full_name: currentSession.user.user_metadata?.full_name || currentSession.user.email?.split('@')[0] || 'Developer',
          avatar_url: currentSession.user.user_metadata?.avatar_url,
          isDemo: false,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        setUser({
          id: newSession.user.id,
          email: newSession.user.email || '',
          full_name: newSession.user.user_metadata?.full_name || newSession.user.email?.split('@')[0] || 'Developer',
          avatar_url: newSession.user.user_metadata?.avatar_url,
          isDemo: false,
        });
      } else if (!localStorage.getItem(DEMO_STORAGE_KEY)) {
        setUser(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setError(null);

    if (!isSupabaseConfigured) {
      const err = new Error(
        'Supabase authentication is not configured. Please supply valid VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file, or use "Explore Demo Workspace".'
      );
      setError(err.message);
      return { error: err };
    }

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      return { error: signInError };
    }

    if (data.user) {
      exitDemoMode();
      setUser({
        id: data.user.id,
        email: data.user.email || '',
        full_name: data.user.user_metadata?.full_name || data.user.email?.split('@')[0] || 'Developer',
        avatar_url: data.user.user_metadata?.avatar_url,
        isDemo: false,
      });
    }

    return { error: null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    setError(null);

    if (!isSupabaseConfigured) {
      const err = new Error(
        'Supabase authentication is not configured. Please supply valid VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment to create real accounts.'
      );
      setError(err.message);
      return { error: err };
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      return { error: signUpError };
    }

    if (data.user) {
      exitDemoMode();
      setUser({
        id: data.user.id,
        email: data.user.email || '',
        full_name: fullName,
        isDemo: false,
      });
    }

    return { error: null };
  };

  const signOut = async () => {
    exitDemoMode();
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
  };

  const resetPassword = async (email: string) => {
    setError(null);

    if (!isSupabaseConfigured) {
      const err = new Error(
        'Supabase authentication is not configured. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable password recovery emails.'
      );
      setError(err.message);
      return { error: err };
    }

    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (resetErr) {
      setError(resetErr.message);
      return { error: resetErr };
    }

    return { error: null };
  };

  const signInWithGitHub = async () => {
    setError(null);

    if (!isSupabaseConfigured) {
      const err = new Error(
        'GitHub authentication requires Supabase to be configured with GitHub OAuth credentials.'
      );
      setError(err.message);
      return { error: err };
    }

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
        scopes: 'repo read:user user:email',
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      return { error: oauthError };
    }

    return { error: null };
  };

  const refreshSession = useCallback(async () => {
    setError(null);

    if (!isSupabaseConfigured) {
      const err = new Error('Supabase authentication is not configured.');
      setError(err.message);
      return { session: null, error: err };
    }

    try {
      const { data, error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) {
        setError(refreshErr.message);
        return { session: null, error: refreshErr };
      }

      setSession(data.session);
      if (data.session?.user) {
        setUser({
          id: data.session.user.id,
          email: data.session.user.email || '',
          full_name:
            data.session.user.user_metadata?.full_name ||
            data.session.user.email?.split('@')[0] ||
            'Developer',
          avatar_url: data.session.user.user_metadata?.avatar_url,
          isDemo: false,
        });
      }
      return { session: data.session, error: null };
    } catch (err: any) {
      const errorObj = err instanceof Error ? err : new Error(String(err));
      setError(errorObj.message);
      return { session: null, error: errorObj };
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        error,
        isConfigured: isSupabaseConfigured,
        isDemoMode,
        signIn,
        signUp,
        signOut,
        resetPassword,
        signInWithGitHub,
        refreshSession,
        enterDemoMode,
        exitDemoMode,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
