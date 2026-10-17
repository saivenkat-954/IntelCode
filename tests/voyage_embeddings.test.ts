import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  embedVoyageTexts,
  embedDocuments,
  embedQuery,
  validateVector,
  parseVoyageRetryAfterMs,
  isVoyageConfigured,
  DEFAULT_MODEL,
  DEFAULT_DIMENSION,
  VOYAGE_API_URL,
} from '../src/server/embeddings/voyage';

describe('Voyage Code 4 Embedding Provider Tests', () => {
  const origEnv = { ...process.env };
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.VOYAGE_API_KEY = 'pa-mock-valid-voyage-api-key-12345';
    process.env.VOYAGE_EMBEDDING_MODEL = 'voyage-code-4';
    process.env.VOYAGE_EMBEDDING_DIMENSION = '512';
    process.env.VOYAGE_BATCH_SIZE = '16';
  });

  afterEach(() => {
    process.env = { ...origEnv };
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  // Helper to create a valid 512-dimensional vector
  function create512Vector(seed = 0): number[] {
    return Array.from({ length: 512 }, (_, i) => parseFloat(((i + seed) * 0.001).toFixed(6)));
  }

  describe('Configuration & Initialization', () => {
    it('detects when VOYAGE_API_KEY is configured with a valid key', () => {
      expect(isVoyageConfigured()).toBe(true);
    });

    it('rejects unconfigured, empty, or placeholder keys', () => {
      process.env.VOYAGE_API_KEY = '';
      expect(isVoyageConfigured()).toBe(false);

      process.env.VOYAGE_API_KEY = 'your_voyage_api_key';
      expect(isVoyageConfigured()).toBe(false);

      delete process.env.VOYAGE_API_KEY;
      expect(isVoyageConfigured()).toBe(false);
    });

    it('throws explicit error when calling embedding without configured API key', async () => {
      delete process.env.VOYAGE_API_KEY;
      await expect(embedDocuments(['function hello() {}'])).rejects.toThrow(
        /Voyage AI API key is not configured/
      );
    });
  });

  describe('Vector Validation', () => {
    it('accepts valid 512-dimensional finite numeric vectors', () => {
      const vec = create512Vector();
      expect(() => validateVector(vec, 512)).not.toThrow();
    });

    it('rejects vectors with dimension mismatch (e.g. 768 or 256 instead of 512)', () => {
      const vec768 = Array.from({ length: 768 }, () => 0.1);
      expect(() => validateVector(vec768, 512)).toThrow(/Embedding dimension mismatch: expected 512, received 768/);

      const vec256 = Array.from({ length: 256 }, () => 0.1);
      expect(() => validateVector(vec256, 512)).toThrow(/Embedding dimension mismatch: expected 512, received 256/);
    });

    it('rejects vectors containing NaN or Infinite values', () => {
      const nanVec = create512Vector();
      nanVec[10] = NaN;
      expect(() => validateVector(nanVec, 512)).toThrow(/non-finite numeric value/);

      const infVec = create512Vector();
      infVec[50] = Infinity;
      expect(() => validateVector(infVec, 512)).toThrow(/non-finite numeric value/);
    });
  });

  describe('Document & Query Embeddings Contract', () => {
    it('sends input_type: "document" and output_dimension: 512 for code chunks', async () => {
      let capturedPayload: any = null;
      let capturedHeaders: any = null;

      globalThis.fetch = vi.fn(async (url: any, init: any) => {
        expect(url).toBe(VOYAGE_API_URL);
        capturedPayload = JSON.parse(init.body);
        capturedHeaders = init.headers;

        return {
          ok: true,
          status: 200,
          json: async () => ({
            object: 'list',
            data: [
              { object: 'embedding', index: 0, embedding: create512Vector(1) },
              { object: 'embedding', index: 1, embedding: create512Vector(2) },
            ],
            model: 'voyage-code-4',
            usage: { total_tokens: 42 },
          }),
        } as any;
      });

      const vectors = await embedDocuments([
        'export function add(a: number, b: number) { return a + b; }',
        'export class AuthService {}',
      ]);

      expect(vectors.length).toBe(2);
      expect(vectors[0].length).toBe(512);
      expect(vectors[1].length).toBe(512);

      // Verify exact Voyage Code 4 payload parameters
      expect(capturedPayload.model).toBe('voyage-code-4');
      expect(capturedPayload.input_type).toBe('document');
      expect(capturedPayload.output_dimension).toBe(512);
      expect(capturedPayload.truncation).toBe(false);
      expect(capturedHeaders.Authorization).toBe('Bearer pa-mock-valid-voyage-api-key-12345');
    });

    it('sends input_type: "query" and output_dimension: 512 for search questions', async () => {
      let capturedPayload: any = null;

      globalThis.fetch = vi.fn(async (_url: any, init: any) => {
        capturedPayload = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            object: 'list',
            data: [{ object: 'embedding', index: 0, embedding: create512Vector(99) }],
            model: 'voyage-code-4',
          }),
        } as any;
      });

      const vector = await embedQuery('Where is authentication token validated?');

      expect(vector.length).toBe(512);
      expect(capturedPayload.model).toBe('voyage-code-4');
      expect(capturedPayload.input_type).toBe('query');
      expect(capturedPayload.output_dimension).toBe(512);
    });

    it('correctly maps response embeddings to input chunks by response index', async () => {
      // Return response out of order: index 1 first, then index 0
      globalThis.fetch = vi.fn(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            object: 'list',
            data: [
              { object: 'embedding', index: 1, embedding: create512Vector(200) },
              { object: 'embedding', index: 0, embedding: create512Vector(100) },
            ],
            model: 'voyage-code-4',
          }),
        } as any;
      });

      const vectors = await embedVoyageTexts(['first text', 'second text'], 'document');

      expect(vectors.length).toBe(2);
      // Index 0 must match seed 100, index 1 must match seed 200
      expect(vectors[0][0]).toBeCloseTo(0.1);
      expect(vectors[1][0]).toBeCloseTo(0.2);
    });
  });

  describe('Retry Behavior, Rate Limiting & Error Sanitization', () => {
    it('fails fast on 401 Unauthorized without wasteful retries', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        return {
          ok: false,
          status: 401,
          text: async () => 'Invalid API key provided: pa-secret-12345',
        } as any;
      });

      await expect(embedDocuments(['const a = 1;'])).rejects.toThrow(/Voyage AI Authentication Error \(401\)/);
      expect(callCount).toBe(1);
    });

    it('fails fast on 403 Forbidden without wasteful retries', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        return {
          ok: false,
          status: 403,
          text: async () => 'Account suspended or model access restricted',
        } as any;
      });

      await expect(embedDocuments(['const a = 1;'])).rejects.toThrow(/Voyage AI Authentication Error \(403\)/);
      expect(callCount).toBe(1);
    });

    it('respects Retry-After header and retries on 429 rate limit', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn(async () => {
        callCount++;
        if (callCount === 1) {
          const headers = new Headers();
          headers.set('retry-after', '0.05'); // 50ms
          return {
            ok: false,
            status: 429,
            headers,
            text: async () => 'Rate limit exceeded: retry in 0.05s',
          } as any;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({
            object: 'list',
            data: [{ object: 'embedding', index: 0, embedding: create512Vector(1) }],
            model: 'voyage-code-4',
          }),
        } as any;
      });

      const vectors = await embedDocuments(['const x = 10;'], { maxRetries: 2 });
      expect(callCount).toBe(2);
      expect(vectors.length).toBe(1);
      expect(vectors[0].length).toBe(512);
    });

    it('sanitizes API keys and secrets from error messages', async () => {
      globalThis.fetch = vi.fn(async () => {
        return {
          ok: false,
          status: 500,
          text: async () => 'Internal server error with key pa-1234567890abcdef1234567890 and Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc',
        } as any;
      });

      try {
        await embedDocuments(['test code'], { maxRetries: 0 });
        expect.unreachable('Should have thrown');
      } catch (err: any) {
        expect(err.message).not.toContain('pa-1234567890abcdef1234567890');
        expect(err.message).toContain('pa-[REDACTED]');
        expect(err.message).toContain('[JWT_REDACTED]');
      }
    });

    it('handles empty input gracefully by returning empty array', async () => {
      const results = await embedDocuments([]);
      expect(results).toEqual([]);
    });
  });
});
