import { createClient } from '@supabase/supabase-js';
import {
  validateServerSupabaseConfig,
  getCorsHeaders,
  diagnoseSupabaseAuthError,
} from '../src/server/config';
import {
  embedVoyageTexts,
  isVoyageConfigured,
  DEFAULT_MODEL,
  DEFAULT_DIMENSION,
} from '../src/server/embeddings/voyage';
import { createVercelHandler } from '../src/server/adapter';

// In-memory sliding window rate limiter
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(key: string, limit = 60, windowMs = 60000): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(key) || [];
  const validTimestamps = timestamps.filter((t) => now - t < windowMs);

  if (validTimestamps.length >= limit) {
    rateLimitMap.set(key, validTimestamps);
    return false;
  }

  validTimestamps.push(now);
  rateLimitMap.set(key, validTimestamps);
  return true;
}

export const handler = async (event: any) => {
  const requestOrigin = event.headers?.origin || event.headers?.Origin;
  const headers = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed. Use POST.' }),
    };
  }

  // Request size limit: Max 250KB body
  const bodyRaw = event.body || '';
  if (bodyRaw.length > 250000) {
    return {
      statusCode: 413,
      headers,
      body: JSON.stringify({ error: 'Request body exceeds size limit (250KB maximum).' }),
    };
  }

  // 1. Enforce genuine Supabase authentication
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Authentication required. Missing Bearer token.' }),
    };
  }

  const token = authHeader.split(' ')[1];
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  const configValidation = validateServerSupabaseConfig(serviceKey, supabaseUrl, anonKey);
  if (!configValidation.valid) {
    return {
      statusCode: configValidation.statusCode || 503,
      headers,
      body: JSON.stringify({ error: configValidation.error, code: 'SERVER_CONFIG_ERROR' }),
    };
  }

  const supabase = createClient(supabaseUrl!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    const diagnostic = diagnoseSupabaseAuthError(authError, token, supabaseUrl, serviceKey);
    return {
      statusCode: diagnostic.statusCode,
      headers,
      body: JSON.stringify({
        error: diagnostic.error,
        code: diagnostic.code,
        authCode: diagnostic.authCode,
      }),
    };
  }

  // 2. Rate limiting per user
  const clientKey = user.id || event.headers?.['x-forwarded-for'] || 'anonymous';
  if (!checkRateLimit(clientKey, 60, 60000)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'Rate limit exceeded: Maximum 60 embedding requests per minute.' }),
    };
  }

  // 3. Voyage AI Configuration check
  if (!isVoyageConfigured()) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'Voyage AI embedding generation requires a valid VOYAGE_API_KEY in server environment variables.',
      }),
    };
  }

  try {
    const { input, texts, inputType = 'document', model, dimension } = JSON.parse(bodyRaw);
    const rawInputs = input || texts;

    if (!rawInputs || (Array.isArray(rawInputs) && rawInputs.length === 0)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'input or texts array is required.' }),
      };
    }

    const inputArray: string[] = Array.isArray(rawInputs) ? rawInputs : [rawInputs];

    if (inputArray.length > 50) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Batch size exceeds limit: maximum 50 texts per request.' }),
      };
    }

    for (const text of inputArray) {
      if (typeof text !== 'string' || text.length > 8000) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Each text item must be a string not exceeding 8,000 characters.' }),
        };
      }
    }

    const resolvedInputType = inputType === 'query' ? 'query' : 'document';
    const vectors = await embedVoyageTexts(inputArray, resolvedInputType, {
      model,
      dimension,
    });

    const targetDimension = dimension || parseInt(process.env.VOYAGE_EMBEDDING_DIMENSION || '512', 10) || DEFAULT_DIMENSION;
    const targetModel = model || process.env.VOYAGE_EMBEDDING_MODEL || DEFAULT_MODEL;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        embeddings: vectors,
        model: targetModel,
        dimensions: targetDimension,
        inputType: resolvedInputType,
        count: vectors.length,
      }),
    };
  } catch (err: any) {
    console.error('Error generating Voyage embeddings:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Failed to generate embeddings.' }),
    };
  }
};

export default createVercelHandler(handler);
