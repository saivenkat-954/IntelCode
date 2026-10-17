/**
 * Server-Side Supabase Client & Authorization Helpers
 * Enforces strict validation: privileged operations must use SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateServerSupabaseConfig } from './config';

/**
 * Creates an authorized server-side Supabase client with the service role key.
 * Throws an explicit error if credentials are unconfigured or invalid.
 */
export function getServerSupabaseClient(): SupabaseClient {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  const validation = validateServerSupabaseConfig(serviceKey, supabaseUrl, anonKey);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid Supabase server configuration.');
  }

  return createClient(supabaseUrl!, serviceKey!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
}

/**
 * Extracts and verifies the calling user from the Authorization Bearer header.
 */
export async function verifyUserToken(
  authHeader?: string,
  client?: SupabaseClient
): Promise<AuthUser | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  if (!token) return null;

  const supabase = client || getServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

/**
 * Verifies that a user has permission to access or modify a repository.
 * Returns repository record if accessible, null otherwise.
 */
export async function verifyRepositoryAccess(
  supabase: SupabaseClient,
  repositoryId: string,
  userId?: string
): Promise<{ accessible: boolean; repo: any | null; reason?: string }> {
  const { data: repo, error } = await supabase
    .from('repositories')
    .select('id, user_id, owner, name, full_name, is_private, default_branch, status, files_count, chunks_count')
    .eq('id', repositoryId)
    .maybeSingle();

  if (error || !repo) {
    return { accessible: false, repo: null, reason: 'Repository not found.' };
  }

  // If repository is public, read access is granted
  if (!repo.is_private && !userId) {
    return { accessible: true, repo };
  }

  // If private or user is checking write/member permission
  if (!userId) {
    return { accessible: false, repo: null, reason: 'Authentication required for private repository.' };
  }

  // Owner check
  if (repo.user_id === userId) {
    return { accessible: true, repo };
  }

  // Collaborator check in repository_members
  const { data: member } = await supabase
    .from('repository_members')
    .select('id, role')
    .eq('repository_id', repositoryId)
    .eq('user_id', userId)
    .maybeSingle();

  if (member) {
    return { accessible: true, repo };
  }

  return { accessible: false, repo: null, reason: 'Access denied: You are not a member of this repository.' };
}
