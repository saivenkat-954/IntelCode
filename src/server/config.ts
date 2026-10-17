/**
 * Server Configuration, Credential Validation & Security Utilities
 * Strict server-side validation ensuring secrets are never exposed to browser bundles.
 */

export const ALLOWED_ORIGIN = process.env.APP_URL || 'http://localhost:5173';

/**
 * Returns strict CORS headers scoped to the application origin or authorized local ports.
 */
export function getCorsHeaders(requestOrigin?: string): Record<string, string> {
  const origin =
    requestOrigin &&
    (requestOrigin === ALLOWED_ORIGIN ||
      requestOrigin.startsWith('http://localhost:') ||
      requestOrigin.startsWith('http://127.0.0.1:'))
      ? requestOrigin
      : ALLOWED_ORIGIN;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-github-token',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
  };
}

/**
 * Checks whether an API key is configured with a non-placeholder value.
 */
export function isConfiguredKey(key?: string): boolean {
  if (!key) return false;
  const k = key.trim();
  return (
    k.length > 5 &&
    !k.startsWith('YOUR_') &&
    !k.startsWith('your_') &&
    !k.includes('placeholder')
  );
}

/**
 * Extracts the Supabase project reference identifier from a project URL.
 * Never logs or reveals the URL or key values.
 */
export function extractProjectRefFromUrl(url?: string): string | null {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const match = host.match(/^([a-z0-9_-]+)\.supabase\.(?:co|in|net)$/);
    if (match) {
      return match[1];
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Extracts the Supabase project reference identifier from a JWT token payload.
 * Never logs or reveals token contents.
 */
export function extractProjectRefFromJwt(jwt?: string): string | null {
  if (!jwt || typeof jwt !== 'string') return null;
  const k = jwt.trim();
  if (!k.startsWith('eyJ') || !k.includes('.')) return null;
  try {
    const parts = k.split('.');
    if (parts.length >= 2) {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = Buffer.from(base64, 'base64').toString('utf-8');
      const payload = JSON.parse(json);
      if (payload.ref && typeof payload.ref === 'string') {
        return payload.ref;
      }
      if (payload.iss && typeof payload.iss === 'string') {
        const issRef = extractProjectRefFromUrl(payload.iss);
        if (issRef) return issRef;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Strictly validates that the server environment has a genuine Supabase configuration.
 * Explicitly rejects publishable, anonymous, or placeholder keys for privileged server operations.
 * Verifies that VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY belong to the same project.
 * Never logs or displays key or secret values.
 */
export function validateServerSupabaseConfig(
  serviceKey?: string,
  supabaseUrl?: string,
  anonKey?: string
): { valid: boolean; statusCode?: number; error?: string } {
  if (
    !supabaseUrl ||
    !supabaseUrl.startsWith('https://') ||
    supabaseUrl.includes('your-project') ||
    supabaseUrl.includes('placeholder')
  ) {
    return {
      valid: false,
      statusCode: 503,
      error: 'VITE_SUPABASE_URL is missing or invalid in server environment.',
    };
  }

  if (!serviceKey || typeof serviceKey !== 'string') {
    return {
      valid: false,
      statusCode: 503,
      error:
        'SUPABASE_SERVICE_ROLE_KEY is required on the server for vector indexing and database operations.',
    };
  }

  const k = serviceKey.trim();

  if (
    k.length < 20 ||
    k.startsWith('YOUR_') ||
    k.startsWith('your_') ||
    k.includes('placeholder')
  ) {
    return {
      valid: false,
      statusCode: 503,
      error: 'SUPABASE_SERVICE_ROLE_KEY contains an unconfigured placeholder or invalid value.',
    };
  }

  // Explicitly reject publishable / anonymous keys for privileged server operations
  if (k.startsWith('sb_publishable_')) {
    return {
      valid: false,
      statusCode: 503,
      error:
        'Invalid server configuration: SUPABASE_SERVICE_ROLE_KEY cannot be a publishable anonymous key (sb_publishable_...). A genuine Supabase secret/service-role key (starting with "sb_secret_" or a service_role JWT) is required for privileged server operations.',
    };
  }

  const configuredAnon = anonKey || process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (configuredAnon && k === configuredAnon) {
    return {
      valid: false,
      statusCode: 503,
      error:
        'Invalid server configuration: SUPABASE_SERVICE_ROLE_KEY matches VITE_SUPABASE_ANON_KEY. Privileged server operations require a genuine service_role secret key, not the client-side anonymous key.',
    };
  }

  // If JWT, verify segment count and role
  if (k.startsWith('eyJ') && k.includes('.')) {
    const parts = k.split('.');
    if (parts.length !== 3) {
      return {
        valid: false,
        statusCode: 503,
        error: `Invalid server configuration: SUPABASE_SERVICE_ROLE_KEY is a malformed JWT (expected 3 segments, found ${parts.length}). Check for duplicate or concatenated keys.`,
      };
    }

    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
      if (payload.role && payload.role !== 'service_role') {
        return {
          valid: false,
          statusCode: 503,
          error: `Invalid server configuration: SUPABASE_SERVICE_ROLE_KEY JWT has role "${payload.role}", but "service_role" is required for server operations.`,
        };
      }
    } catch {
      return {
        valid: false,
        statusCode: 503,
        error: 'Invalid server configuration: SUPABASE_SERVICE_ROLE_KEY payload could not be parsed as valid JSON.',
      };
    }
  }

  // Requirement 4: Verify that VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY belong to the same Supabase project
  const urlRef = extractProjectRefFromUrl(supabaseUrl);
  const serviceKeyRef = extractProjectRefFromJwt(k);
  const anonKeyRef = extractProjectRefFromJwt(configuredAnon);

  if (urlRef && serviceKeyRef && urlRef.toLowerCase() !== serviceKeyRef.toLowerCase()) {
    return {
      valid: false,
      statusCode: 503,
      error:
        'Invalid server configuration: Project mismatch detected. SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_URL belong to different Supabase projects.',
    };
  }

  if (urlRef && anonKeyRef && urlRef.toLowerCase() !== anonKeyRef.toLowerCase()) {
    return {
      valid: false,
      statusCode: 503,
      error:
        'Invalid server configuration: Project mismatch detected. VITE_SUPABASE_ANON_KEY and VITE_SUPABASE_URL belong to different Supabase projects.',
    };
  }

  if (serviceKeyRef && anonKeyRef && serviceKeyRef.toLowerCase() !== anonKeyRef.toLowerCase()) {
    return {
      valid: false,
      statusCode: 503,
      error:
        'Invalid server configuration: Project mismatch detected. SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_ANON_KEY belong to different Supabase projects.',
    };
  }

  return { valid: true };
}

export interface AuthDiagnosticResult {
  statusCode: number;
  error: string;
  code: 'SERVER_CREDENTIAL_ERROR' | 'PROJECT_MISMATCH' | 'AUTH_SERVICE_UNAVAILABLE' | 'INVALID_OR_EXPIRED_SESSION';
  authCode?: string;
}

/**
 * Requirement 5: Diagnostic helper that analyzes Supabase authentication failure information
 * to safely distinguish an invalid user token from server credential or project mismatches.
 * Never logs or reveals secret values.
 */
export function diagnoseSupabaseAuthError(
  authError: any,
  userToken?: string,
  serverUrl?: string,
  serviceKey?: string
): AuthDiagnosticResult {
  const errorMsg = (authError?.message || '').toLowerCase();
  const authCode = authError?.code;

  // 1. Check for server credential rejection by Supabase Auth (e.g. invalid or rejected service_role key)
  const isServerCredentialError =
    errorMsg.includes('invalid api key') ||
    authCode === 'invalid_api_key' ||
    (authError?.status === 401 && errorMsg === 'invalid api key');

  if (isServerCredentialError) {
    return {
      statusCode: 503,
      code: 'SERVER_CREDENTIAL_ERROR',
      authCode: authCode || 'invalid_api_key',
      error:
        'Server authentication configuration error: Service role credentials were rejected by Supabase. Please verify server environment variables.',
    };
  }

  // 2. Check for project mismatch between user token and server project
  if (userToken) {
    const userTokenRef = extractProjectRefFromJwt(userToken);
    const serverRef = extractProjectRefFromUrl(serverUrl) || extractProjectRefFromJwt(serviceKey);
    if (userTokenRef && serverRef && userTokenRef.toLowerCase() !== serverRef.toLowerCase()) {
      return {
        statusCode: 401,
        code: 'PROJECT_MISMATCH',
        authCode: 'project_mismatch',
        error: 'Authentication failed: User token project mismatch with server configuration.',
      };
    }
  }

  // 3. Upstream Supabase service outage / 5xx error
  if (authError?.status && authError.status >= 500) {
    return {
      statusCode: 503,
      code: 'AUTH_SERVICE_UNAVAILABLE',
      authCode: authCode || 'upstream_unavailable',
      error: 'Supabase authentication service is temporarily unavailable. Please try again later.',
    };
  }

  // 4. Default: Invalid or expired user session
  const safeAuthCode =
    authCode ||
    (errorMsg.includes('expired') ? 'session_expired' : 'invalid_token');

  return {
    statusCode: 401,
    code: 'INVALID_OR_EXPIRED_SESSION',
    authCode: safeAuthCode,
    error: 'Invalid or expired user authentication session.',
  };
}

/**
 * Sanitizes error messages by redacting all API keys, tokens, and credentials.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'Unknown error';
  return message
    .replace(/pa-[0-9A-Za-z-_]{16,}/g, 'pa-[REDACTED]') // Voyage AI key format
    .replace(/AIza[0-9A-Za-z-_]{35}/g, 'AIza[REDACTED]') // Google Gemini key format
    .replace(/ghp_[0-9A-Za-z]{36}/g, 'ghp_[REDACTED]') // GitHub PAT format
    .replace(/gho_[0-9A-Za-z]{36}/g, 'gho_[REDACTED]') // GitHub OAuth token format
    .replace(/sb_[a-z]+_[A-Za-z0-9_-]{20,}/g, 'sb_[REDACTED]') // Supabase newer keys
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '[JWT_REDACTED]') // JWTs
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]');
}

