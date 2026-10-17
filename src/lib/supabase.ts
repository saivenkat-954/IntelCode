import { createClient, type Session } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function isValidKey(val?: string): boolean {
  if (!val) return false;
  const s = val.trim();
  return (
    s.length > 10 &&
    !s.includes('placeholder') &&
    !s.startsWith('your_') &&
    !s.startsWith('YOUR_') &&
    !s.includes('your-project')
  );
}

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-project') &&
  !supabaseUrl.includes('placeholder') &&
  isValidKey(supabaseAnonKey)
);

// Fallback dummy URL/key if not configured to prevent client instantiation crashes
const validUrl: string =
  isSupabaseConfigured && supabaseUrl ? supabaseUrl : 'https://placeholder-intelcode.supabase.co';
const validKey: string =
  isSupabaseConfigured && supabaseAnonKey ? supabaseAnonKey : 'placeholder-anon-key-intelcode';

export const supabase = createClient(validUrl, validKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/**
 * Safely refreshes an expired or expiring Supabase user session using the supported refreshSession() method.
 */
export async function refreshSupabaseSession(
  refreshToken?: string
): Promise<{ session: Session | null; error: Error | null }> {
  if (!isSupabaseConfigured) {
    return { session: null, error: new Error('Supabase is not configured.') };
  }

  try {
    let token = refreshToken;
    if (!token) {
      const { data: sessionData } = await supabase.auth.getSession();
      token = sessionData?.session?.refresh_token;
    }

    const { data, error } = token
      ? await supabase.auth.refreshSession({ refresh_token: token })
      : await supabase.auth.refreshSession();

    if (error) {
      return { session: null, error };
    }
    return { session: data?.session || null, error: null };
  } catch (err: any) {
    const errorObj = err instanceof Error ? err : new Error(String(err));
    return { session: null, error: errorObj };
  }
}

/**
 * Retrieves the current session, proactively refreshing it if it is expired or nearing expiry.
 */
export async function getValidSessionOrRefresh(): Promise<Session | null> {
  if (!isSupabaseConfigured) return null;

  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error || !session) {
      return null;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at ?? 0;
    const isExpiredOrStale = expiresAt > 0 && expiresAt - nowSec <= 30;

    if (isExpiredOrStale && session.refresh_token) {
      const { session: refreshed } = await refreshSupabaseSession(session.refresh_token);
      if (refreshed) {
        return refreshed;
      }
    }

    return session;
  } catch (err) {
    console.warn('[Supabase] Failed to check or refresh session:', err);
    return null;
  }
}

