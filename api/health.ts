import { createClient } from '@supabase/supabase-js';
import {
  validateServerSupabaseConfig,
  isConfiguredKey,
  getCorsHeaders,
} from '../src/server/config';
import { isVoyageConfigured, DEFAULT_MODEL, DEFAULT_DIMENSION } from '../src/server/embeddings/voyage';
import { createVercelHandler } from '../src/server/adapter';

export const handler = async (event: any) => {
  const requestOrigin = event.headers?.origin || event.headers?.Origin;
  const headers = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // 1. Supabase Check
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const isSupabaseUrlConfigured = Boolean(
    supabaseUrl &&
    supabaseUrl.startsWith('https://') &&
    !supabaseUrl.includes('your-project') &&
    !supabaseUrl.includes('placeholder')
  );

  const isAnonConfigured = isConfiguredKey(anonKey);
  const isServiceKeyConfigured = isConfiguredKey(serviceKey);

  let databaseReachable = false;
  let tablesExist = false;
  let databaseDetails = '';

  if (isSupabaseUrlConfigured && (isServiceKeyConfigured || isAnonConfigured)) {
    try {
      const clientKey = isServiceKeyConfigured ? serviceKey! : anonKey!;
      const supabase = createClient(supabaseUrl!, clientKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const timeoutPromise = new Promise<{ data: any; error: any }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'Database connection check timed out.' } }), 2500)
      );
      const queryPromise = supabase.from('repositories').select('id').limit(1);
      const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

      if (!error) {
        databaseReachable = true;
        tablesExist = true;
        databaseDetails = 'Schema and tables verified.';
      } else if (error.code === 'PGRST205') {
        databaseReachable = true;
        tablesExist = false;
        databaseDetails = 'Database connected, but tables not found. Run SQL migration in Supabase SQL editor.';
      } else {
        databaseReachable = false;
        databaseDetails = error.message;
      }
    } catch (e: any) {
      databaseDetails = e.message;
    }
  }

  // 2. Voyage AI Check
  const isVoyageReady = isVoyageConfigured();
  const voyageModel = process.env.VOYAGE_EMBEDDING_MODEL || DEFAULT_MODEL;
  const voyageDimension = parseInt(process.env.VOYAGE_EMBEDDING_DIMENSION || '512', 10) || DEFAULT_DIMENSION;

  // 3. Gemini Check (Answer generation)
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const isGeminiConfigured = isConfiguredKey(geminiApiKey);
  const chatModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  // 4. GitHub Check
  const githubClientId = process.env.GITHUB_CLIENT_ID;
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
  const isGitHubConfigured = isConfiguredKey(githubClientId) && isConfiguredKey(githubClientSecret);

  const serverKeyValidation = validateServerSupabaseConfig(serviceKey, supabaseUrl, anonKey);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      status: 'ok',
      platform: 'Vercel Serverless',
      timestamp: new Date().toISOString(),
      supabase: {
        configured: isSupabaseUrlConfigured && isAnonConfigured,
        url: isSupabaseUrlConfigured ? supabaseUrl : null,
        anonKeyPresent: isAnonConfigured,
        serviceKeyPresent: isServiceKeyConfigured,
        serviceKeyValid: serverKeyValidation.valid,
        serviceKeyError: serverKeyValidation.valid ? undefined : serverKeyValidation.error,
        databaseReachable,
        tablesExist,
        details: !serverKeyValidation.valid
          ? serverKeyValidation.error
          : (databaseDetails || (isSupabaseUrlConfigured ? 'Connected' : 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')),
      },
      embeddings: {
        provider: 'Voyage AI',
        configured: isVoyageReady,
        model: voyageModel,
        dimensions: voyageDimension,
        status: isVoyageReady
          ? `Ready (Voyage Code 4, ${voyageDimension}-dimensional embeddings)`
          : 'Missing VOYAGE_API_KEY in server environment',
      },
      gemini: {
        configured: isGeminiConfigured,
        chatModel,
        status: isGeminiConfigured ? `Ready (${chatModel} for grounded answers)` : 'Missing GEMINI_API_KEY in server environment',
      },
      github: {
        configured: isGitHubConfigured,
        clientId: isGitHubConfigured ? githubClientId : null,
        status: isGitHubConfigured ? 'Ready for OAuth app authorization' : 'Missing GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET',
      },
      appUrl: process.env.APP_URL || 'http://localhost:5173',
    }),
  };
};

export default createVercelHandler(handler);
