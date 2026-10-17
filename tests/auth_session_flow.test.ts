import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateServerSupabaseConfig,
  diagnoseSupabaseAuthError,
  extractProjectRefFromUrl,
  extractProjectRefFromJwt,
} from '../src/server/config';
import { handler as ingestHandler } from '../src/server/ingest';
import { postIngestWithSessionRetry } from '../src/services/repositoryService';
import { supabase } from '../src/lib/supabase';

// Helper to build a mock JWT with specific payload
function makeMockJwt(payload: Record<string, any>, signature = 'mock_signature'): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  return `${header}.${body}.${signature}`;
}

describe('Authentication Flow, Session Refresh & Diagnostics Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Server Configuration & Project Mismatch Verification (Requirement 4)', () => {
    const validUrl = 'https://nqnhzdyktdqtekpgvvor.supabase.co';
    const validServiceKey = makeMockJwt({
      iss: 'supabase',
      ref: 'nqnhzdyktdqtekpgvvor',
      role: 'service_role',
    });
    const validAnonKey = makeMockJwt({
      iss: 'supabase',
      ref: 'nqnhzdyktdqtekpgvvor',
      role: 'anon',
    });

    it('extracts project ref correctly from standard and variant Supabase URLs', () => {
      expect(extractProjectRefFromUrl('https://myproject.supabase.co')).toBe('myproject');
      expect(extractProjectRefFromUrl('https://eu-west.supabase.in')).toBe('eu-west');
      expect(extractProjectRefFromUrl('https://test-ref-123.supabase.net')).toBe('test-ref-123');
      expect(extractProjectRefFromUrl('invalid-url')).toBeNull();
      expect(extractProjectRefFromUrl(undefined)).toBeNull();
    });

    it('extracts project ref correctly from valid JWT payloads', () => {
      const jwt = makeMockJwt({ ref: 'proj-abc-123', role: 'service_role' });
      expect(extractProjectRefFromJwt(jwt)).toBe('proj-abc-123');
      expect(extractProjectRefFromJwt('not-a-jwt')).toBeNull();
      expect(extractProjectRefFromJwt(undefined)).toBeNull();
    });

    it('validates matching project configurations successfully', () => {
      const result = validateServerSupabaseConfig(validServiceKey, validUrl, validAnonKey);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('detects and rejects malformed JWTs with extra segments (e.g. duplicated keys)', () => {
      // 5-segment malformed key from duplicate pasting
      const malformedKey = `${validServiceKey}.${validServiceKey}`;
      const result = validateServerSupabaseConfig(malformedKey, validUrl, validAnonKey);

      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.error).toContain('malformed JWT');
      expect(result.error).toContain('expected 3 segments');
      // Must not leak key value
      expect(result.error).not.toContain(validServiceKey);
    });

    it('detects project mismatch between SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL', () => {
      const mismatchServiceKey = makeMockJwt({
        iss: 'supabase',
        ref: 'other-project-ref',
        role: 'service_role',
      });

      const result = validateServerSupabaseConfig(mismatchServiceKey, validUrl, validAnonKey);
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.error).toContain('Project mismatch detected');
      expect(result.error).toContain('SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL');
      // Must never log or display key values
      expect(result.error).not.toContain(mismatchServiceKey);
      expect(result.error).not.toContain(validUrl);
    });

    it('detects project mismatch between VITE_SUPABASE_ANON_KEY and VITE_SUPABASE_URL', () => {
      const mismatchAnonKey = makeMockJwt({
        iss: 'supabase',
        ref: 'wrong-anon-project',
        role: 'anon',
      });

      const result = validateServerSupabaseConfig(validServiceKey, validUrl, mismatchAnonKey);
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.error).toContain('Project mismatch detected');
      expect(result.error).toContain('VITE_SUPABASE_ANON_KEY and VITE_SUPABASE_URL');
    });

    it('detects project mismatch between SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_ANON_KEY', () => {
      const otherServiceKey = makeMockJwt({
        iss: 'supabase',
        ref: 'project-alpha',
        role: 'service_role',
      });
      const otherAnonKey = makeMockJwt({
        iss: 'supabase',
        ref: 'project-beta',
        role: 'anon',
      });

      // When URL uses custom domain or self-hosted endpoint where project ref is absent from hostname
      const result = validateServerSupabaseConfig(
        otherServiceKey,
        'https://api.mycompany.internal',
        otherAnonKey
      );
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.error).toContain('Project mismatch detected');
      expect(result.error).toContain('SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_ANON_KEY');
    });
  });

  describe('2. Server Authentication Diagnostics (Requirement 5)', () => {
    const serverUrl = 'https://nqnhzdyktdqtekpgvvor.supabase.co';
    const serviceKey = makeMockJwt({ ref: 'nqnhzdyktdqtekpgvvor', role: 'service_role' });

    it('distinguishes "Invalid API key" server credential error from invalid user token', () => {
      const authError = {
        name: 'AuthApiError',
        message: 'Invalid API key',
        status: 401,
      };

      const result = diagnoseSupabaseAuthError(authError, 'some-user-jwt', serverUrl, serviceKey);
      expect(result.statusCode).toBe(503);
      expect(result.code).toBe('SERVER_CREDENTIAL_ERROR');
      expect(result.authCode).toBe('invalid_api_key');
      expect(result.error).toContain('Server authentication configuration error');
      expect(result.error).toContain('Service role credentials were rejected by Supabase');
    });

    it('distinguishes project mismatch between user token and server project', () => {
      const userTokenOtherProject = makeMockJwt({
        ref: 'different-project-ref',
        role: 'authenticated',
      });

      const authError = {
        name: 'AuthApiError',
        message: 'invalid JWT',
        code: 'bad_jwt',
        status: 403,
      };

      const result = diagnoseSupabaseAuthError(authError, userTokenOtherProject, serverUrl, serviceKey);
      expect(result.statusCode).toBe(401);
      expect(result.code).toBe('PROJECT_MISMATCH');
      expect(result.authCode).toBe('project_mismatch');
      expect(result.error).toContain('User token project mismatch with server configuration');
    });

    it('identifies upstream Supabase 5xx service outages as 503', () => {
      const authError = {
        name: 'AuthApiError',
        message: 'Bad gateway',
        status: 502,
        code: 'unexpected_failure',
      };

      const result = diagnoseSupabaseAuthError(authError, 'some-user-jwt', serverUrl, serviceKey);
      expect(result.statusCode).toBe(503);
      expect(result.code).toBe('AUTH_SERVICE_UNAVAILABLE');
      expect(result.error).toContain('temporarily unavailable');
    });

    it('correctly diagnoses genuine expired or invalid user token as 401', () => {
      const authError = {
        name: 'AuthApiError',
        message: 'JWT expired',
        status: 401,
        code: 'session_expired',
      };

      const sameProjectToken = makeMockJwt({
        ref: 'nqnhzdyktdqtekpgvvor',
        role: 'authenticated',
      });

      const result = diagnoseSupabaseAuthError(authError, sameProjectToken, serverUrl, serviceKey);
      expect(result.statusCode).toBe(401);
      expect(result.code).toBe('INVALID_OR_EXPIRED_SESSION');
      expect(result.authCode).toBe('session_expired');
      expect(result.error).toBe('Invalid or expired user authentication session.');
    });
  });

  describe('3. Ingest Handler Authentication Rejection (Missing & Expired Tokens)', () => {
    it('rejects requests missing Bearer token with HTTP 401', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ repositoryId: 'test-repo' }),
      };

      const res = await ingestHandler(event);
      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.body);
      expect(data.error).toContain('Authentication required');
    });

    it('rejects requests with malformed Authorization header with HTTP 401', async () => {
      const event = {
        httpMethod: 'POST',
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
        body: JSON.stringify({ repositoryId: 'test-repo' }),
      };

      const res = await ingestHandler(event);
      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.body);
      expect(data.error).toContain('Authentication required');
    });
  });

  describe('4. Frontend Session Management & Refresh Logic (Requirements 1, 2, 3)', () => {
    it('throws error telling user to sign in again when session is missing and unconfigured', async () => {
      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: null },
        error: null,
      });

      await expect(
        postIngestWithSessionRetry({ action: 'reindex', repositoryId: 'repo-1' })
      ).rejects.toThrow('User authentication session is missing or expired. Please sign in again.');
    });

    it('proactively refreshes an expired session when refresh token is available', async () => {
      const originalFetch = global.fetch;
      let requestedHeaders: any = null;

      // Mock expired session: expires_at is 100 seconds ago
      const expiredSession: any = {
        access_token: 'expired-access-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) - 100,
        user: { id: 'user-1' },
      };

      const refreshedSession: any = {
        access_token: 'new-refreshed-access-token',
        refresh_token: 'next-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'user-1' },
      };

      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: expiredSession },
        error: null,
      });

      const refreshSpy = vi.spyOn(supabase.auth, 'refreshSession').mockResolvedValue({
        data: { session: refreshedSession, user: refreshedSession.user },
        error: null,
      });

      global.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
        requestedHeaders = opts?.headers;
        return {
          ok: true,
          status: 200,
          headers: {
            get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
          },
          json: async () => ({ success: true, jobId: 'job-123' }),
        };
      }) as any;

      const result = await postIngestWithSessionRetry({ action: 'reindex', repositoryId: 'repo-1' });

      expect(refreshSpy).toHaveBeenCalledWith({ refresh_token: 'valid-refresh-token' });
      expect(result.updatedToken).toBe('new-refreshed-access-token');
      expect(requestedHeaders?.Authorization).toBe('Bearer new-refreshed-access-token');
      expect(result.data.success).toBe(true);

      global.fetch = originalFetch;
    });

    it('automatically refreshes session and retries request once when /api/ingest returns HTTP 401', async () => {
      const originalFetch = global.fetch;
      let attempt = 0;
      const capturedTokens: string[] = [];

      const initialSession: any = {
        access_token: 'stale-access-token',
        refresh_token: 'valid-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 1000,
        user: { id: 'user-1' },
      };

      const renewedSession: any = {
        access_token: 'renewed-access-token',
        refresh_token: 'new-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'user-1' },
      };

      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session: initialSession },
        error: null,
      });

      const refreshSpy = vi.spyOn(supabase.auth, 'refreshSession').mockResolvedValue({
        data: { session: renewedSession, user: renewedSession.user },
        error: null,
      });

      global.fetch = vi.fn().mockImplementation(async (_url: string, opts: any) => {
        attempt++;
        const authHeader = opts?.headers?.Authorization || '';
        capturedTokens.push(authHeader.replace('Bearer ', ''));

        if (attempt === 1) {
          // First attempt returns 401
          return {
            ok: false,
            status: 401,
            headers: {
              get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
            },
            json: async () => ({
              error: 'Invalid or expired user authentication session.',
              code: 'INVALID_OR_EXPIRED_SESSION',
            }),
          };
        }

        // Retry attempt succeeds
        return {
          ok: true,
          status: 200,
          headers: {
            get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
          },
          json: async () => ({ success: true, jobId: 'job-retried-ok' }),
        };
      }) as any;

      const result = await postIngestWithSessionRetry(
        { action: 'reindex', repositoryId: 'repo-1' },
        'stale-access-token'
      );

      expect(attempt).toBe(2);
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(capturedTokens[0]).toBe('stale-access-token');
      expect(capturedTokens[1]).toBe('renewed-access-token');
      expect(result.updatedToken).toBe('renewed-access-token');
      expect(result.data.success).toBe(true);

      global.fetch = originalFetch;
    });

    it('tells user to sign in again when session refresh fails after HTTP 401', async () => {
      const originalFetch = global.fetch;

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: {
          get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
        },
        json: async () => ({
          error: 'Invalid or expired user authentication session.',
          code: 'INVALID_OR_EXPIRED_SESSION',
        }),
      } as any);

      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: {
          session: {
            access_token: 'revoked-token',
            refresh_token: 'expired-refresh-token',
            expires_at: 0,
            user: { id: 'user-1' },
          } as any,
        },
        error: null,
      });

      // Refresh fails (e.g. refresh token revoked or expired)
      vi.spyOn(supabase.auth, 'refreshSession').mockResolvedValue({
        data: { session: null, user: null },
        error: new Error('Refresh token not found') as any,
      });

      await expect(
        postIngestWithSessionRetry({ action: 'reindex', repositoryId: 'repo-1' }, 'revoked-token')
      ).rejects.toThrow('Your authentication session has expired or is invalid. Please sign in again.');

      global.fetch = originalFetch;
    });

    it('retries at most once and tells user to sign in again if retry also fails with HTTP 401', async () => {
      const originalFetch = global.fetch;
      let attempt = 0;

      const session: any = {
        access_token: 'bad-token-1',
        refresh_token: 'refresh-token',
        expires_at: 9999999999,
        user: { id: 'user-1' },
      };

      vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
        data: { session },
        error: null,
      });

      vi.spyOn(supabase.auth, 'refreshSession').mockResolvedValue({
        data: {
          session: { ...session, access_token: 'bad-token-2' },
          user: session.user,
        },
        error: null,
      });

      // Both initial and retried request return 401
      global.fetch = vi.fn().mockImplementation(async () => {
        attempt++;
        return {
          ok: false,
          status: 401,
          headers: {
            get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null),
          },
          json: async () => ({
            error: 'Invalid or expired user authentication session.',
            code: 'INVALID_OR_EXPIRED_SESSION',
          }),
        };
      }) as any;

      await expect(
        postIngestWithSessionRetry({ action: 'reindex', repositoryId: 'repo-1' }, 'bad-token-1')
      ).rejects.toThrow('Authentication session could not be renewed. Please sign in again.');

      // Must have stopped after exactly 2 attempts (initial + 1 retry)
      expect(attempt).toBe(2);

      global.fetch = originalFetch;
    });
  });
});
