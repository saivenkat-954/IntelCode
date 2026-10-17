import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handler as healthHandler } from '../api/health';
import { handler as githubHandler } from '../api/github';
import { handler as embeddingsHandler } from '../api/embeddings';
import { handler as searchHandler } from '../api/search';
import { handler as chatHandler } from '../api/chat';
import { createVercelHandler } from '../src/server/adapter';

// Mock Supabase client for unit test isolation
vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({ data: [{ id: 'mock-repo-1' }], error: null }),
        })),
      })),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'mock-user-123' } }, error: null }),
      },
    })),
  };
});

describe('Vercel Serverless Function Endpoints', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.VITE_SUPABASE_URL = 'https://mock-proj.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_mock_anon_key_valid_12345';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_mock_service_role_key_valid_12345';
    process.env.VOYAGE_API_KEY = 'pa-mock-valid-key-12345';
    process.env.VOYAGE_EMBEDDING_MODEL = 'voyage-code-4';
    process.env.VOYAGE_EMBEDDING_DIMENSION = '512';
    process.env.GEMINI_API_KEY = 'mock_gemini_api_key_for_tests';
    process.env.GEMINI_MODEL = 'gemini-2.5-flash';
    process.env.GITHUB_CLIENT_ID = 'mock_client_id_123';
    process.env.GITHUB_CLIENT_SECRET = 'mock_client_secret_456';
    process.env.APP_URL = 'http://localhost:5173';
  });

  afterEach(() => {
    process.env = { ...origEnv };
    vi.restoreAllMocks();
  });

  describe('1. Health Endpoint (/api/health)', () => {
    it('returns sanitized health status reporting Voyage Code 4 and service connections without leaking secrets', async () => {
      const event = {
        httpMethod: 'GET',
        headers: { origin: 'http://localhost:5173' },
      };

      const res = await healthHandler(event);
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.status).toBe('ok');
      expect(body.platform).toBe('Vercel Serverless');
      expect(body.embeddings.provider).toBe('Voyage AI');
      expect(body.embeddings.model).toBe('voyage-code-4');
      expect(body.embeddings.dimensions).toBe(512);
      expect(body.embeddings.configured).toBe(true);

      // Verify no secret values appear in the response payload
      const rawText = JSON.stringify(body);
      expect(rawText).not.toContain('sb_secret_mock_service_role_key_valid_12345');
      expect(rawText).not.toContain('pa-mock-valid-key-12345');
      expect(rawText).not.toContain('mock_client_secret_456');
    });

    it('handles OPTIONS preflight with 204 status and CORS headers', async () => {
      const event = {
        httpMethod: 'OPTIONS',
        headers: { origin: 'http://localhost:5173' },
      };

      const res = await healthHandler(event);
      expect(res.statusCode).toBe(204);
      expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    });
  });

  describe('2. GitHub Endpoint (/api/github)', () => {
    it('returns safe public configuration without exposing client secret', async () => {
      const event = {
        httpMethod: 'GET',
        queryStringParameters: { action: 'config' },
        headers: { origin: 'http://localhost:5173' },
      };

      const res = await githubHandler(event);
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body);
      expect(body.configured).toBe(true);
      expect(body.clientId).toBe('mock_client_id_123');
      expect(body.clientSecret).toBeUndefined();
    });

    it('rejects exchange without authorization code with 400', async () => {
      const event = {
        httpMethod: 'POST',
        headers: { origin: 'http://localhost:5173' },
        body: JSON.stringify({ action: 'exchange' }),
      };

      const res = await githubHandler(event);
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Authorization code is required');
    });
  });

  describe('3. Embeddings Endpoint (/api/embeddings)', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ input: ['const x = 1;'] }),
      };

      const res = await embeddingsHandler(event);
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Authentication required');
    });

    it('rejects oversized requests exceeding 250KB with 413', async () => {
      const hugeBody = 'x'.repeat(260000);
      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer mock-jwt' },
        body: hugeBody,
      };

      const res = await embeddingsHandler(event);
      expect(res.statusCode).toBe(413);
      expect(JSON.parse(res.body).error).toContain('exceeds size limit');
    });
  });

  describe('4. Chat Endpoint (/api/chat)', () => {
    it('rejects queries missing required parameters with 400', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ query: '' }),
      };

      const res = await chatHandler(event);
      expect(res.statusCode).toBe(400);
    });

    it('rejects oversized queries exceeding 2,000 characters with 400', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({
          query: 'q'.repeat(2500),
          repositoryId: '00000000-demo-repo-0001',
        }),
      };

      const res = await chatHandler(event);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('exceeds maximum allowed length');
    });
  });

  describe('5. Vercel Function Adapter (createVercelHandler)', () => {
    it('adapts event-based handlers to Node.js VercelRequest & VercelResponse format', async () => {
      const mockEventHandler = vi.fn(async (event: any) => ({
        statusCode: 200,
        headers: { 'X-Custom-Header': 'IntelCode' },
        body: JSON.stringify({ receivedMethod: event.httpMethod, queryVal: event.queryStringParameters.test }),
      }));

      const vercelFn = createVercelHandler(mockEventHandler);

      let capturedStatus = 0;
      let capturedJson: any = null;
      const headersMap: Record<string, string> = {};

      const req: any = {
        method: 'POST',
        url: '/api/test?test=hello',
        query: { test: 'hello' },
        headers: { 'user-agent': 'Vercel-Test' },
        body: { greeting: 'world' },
      };

      const res: any = {
        status(code: number) {
          capturedStatus = code;
          return res;
        },
        setHeader(name: string, val: string) {
          headersMap[name] = val;
          return res;
        },
        json(data: any) {
          capturedJson = data;
          return res;
        },
        send(data: any) {
          capturedJson = data;
          return res;
        },
        end() {
          return res;
        },
      };

      await vercelFn(req, res);

      expect(mockEventHandler).toHaveBeenCalledTimes(1);
      expect(capturedStatus).toBe(200);
      expect(headersMap['X-Custom-Header']).toBe('IntelCode');
      expect(capturedJson.receivedMethod).toBe('POST');
      expect(capturedJson.queryVal).toBe('hello');
    });
  });
});
