/**
 * Dedicated Voyage AI Code 4 Embedding Provider
 * Implements 512-dimensional code and query embeddings with bounded retries,
 * rate limit handling, input batching, and strict vector validation.
 */

import { sanitizeErrorMessage, isConfiguredKey } from '../config';

export const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
export const DEFAULT_MODEL = 'voyage-code-4';
export const DEFAULT_DIMENSION = 512;
export const DEFAULT_BATCH_SIZE = 16;

export interface VoyageEmbeddingOptions {
  model?: string;
  dimension?: number;
  batchSize?: number;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface VoyageApiData {
  object: string;
  embedding: number[];
  index: number;
}

export interface VoyageApiResponse {
  object: string;
  data: VoyageApiData[];
  model: string;
  usage?: {
    total_tokens: number;
  };
}

/**
 * Checks if Voyage AI is properly configured in the server environment.
 */
export function isVoyageConfigured(): boolean {
  return isConfiguredKey(process.env.VOYAGE_API_KEY);
}

/**
 * Parses the Retry-After header or rate limit message from an error response.
 */
export function parseVoyageRetryAfterMs(headers?: Headers, errorBody?: string): number | null {
  if (headers?.has('retry-after')) {
    const retryAfter = headers.get('retry-after');
    if (retryAfter) {
      const seconds = parseFloat(retryAfter);
      if (!isNaN(seconds) && seconds > 0) {
        return Math.min(Math.round(seconds * 1000), 60000); // Bound to max 60s
      }
    }
  }

  if (errorBody) {
    const secMatch = errorBody.match(/retry\s+(?:in|after)\s+([0-9]+(?:\.[0-9]+)?)\s*s/i);
    if (secMatch) {
      const parsed = parseFloat(secMatch[1]);
      if (!isNaN(parsed) && parsed > 0) {
        return Math.min(Math.round(parsed * 1000), 60000);
      }
    }
  }

  return null;
}

/**
 * Validates that an embedding vector is non-null, finite, and matches expected dimensions.
 */
export function validateVector(vector: number[], expectedDimension = DEFAULT_DIMENSION): void {
  if (!Array.isArray(vector)) {
    throw new Error(`Embedding result is not an array: received ${typeof vector}`);
  }
  if (vector.length !== expectedDimension) {
    throw new Error(
      `Embedding dimension mismatch: expected ${expectedDimension}, received ${vector.length}`
    );
  }
  for (let i = 0; i < vector.length; i++) {
    const val = vector[i];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      throw new Error(`Embedding vector contains non-finite numeric value at index ${i}: ${val}`);
    }
  }
}

/**
 * Core function to embed a single batch of texts using Voyage API with exponential backoff.
 */
async function callVoyageApiWithRetry(
  texts: string[],
  inputType: 'document' | 'query',
  options: VoyageEmbeddingOptions = {}
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!isConfiguredKey(apiKey)) {
    throw new Error(
      'Voyage AI API key is not configured. Please set VOYAGE_API_KEY in server environment variables.'
    );
  }

  const model = options.model || process.env.VOYAGE_EMBEDDING_MODEL || DEFAULT_MODEL;
  const dimension = options.dimension || parseInt(process.env.VOYAGE_EMBEDDING_DIMENSION || '512', 10) || DEFAULT_DIMENSION;
  const maxRetries = options.maxRetries ?? 3;
  const timeoutMs = options.timeoutMs ?? 30000;

  // Clean and prepare texts (skip completely empty strings by substituting placeholder)
  const preparedTexts = texts.map((t) => {
    const trimmed = (t || '').trim();
    return trimmed.length > 0 ? trimmed : '// empty';
  });

  let attempt = 0;
  let delayMs = 1000;

  while (attempt <= maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(VOYAGE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey!.trim()}`,
          'User-Agent': 'IntelCode-Voyage/1.0',
        },
        body: JSON.stringify({
          model,
          input: preparedTexts,
          input_type: inputType,
          output_dimension: dimension,
          truncation: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Check HTTP status
      if (response.ok) {
        const result: VoyageApiResponse = await response.json();
        if (!result || !Array.isArray(result.data)) {
          throw new Error('Voyage API response missing data array.');
        }

        // Map embeddings to input positions using item.index
        const mappedVectors: number[][] = new Array(preparedTexts.length);
        for (const item of result.data) {
          if (typeof item.index === 'number' && item.index >= 0 && item.index < preparedTexts.length) {
            validateVector(item.embedding, dimension);
            mappedVectors[item.index] = item.embedding;
          }
        }

        // Ensure every text was embedded
        for (let i = 0; i < preparedTexts.length; i++) {
          if (!mappedVectors[i]) {
            throw new Error(`Voyage API did not return an embedding for input index ${i}`);
          }
        }

        return mappedVectors;
      }

      // Handle HTTP error responses
      const errorText = await response.text();
      const status = response.status;

      // 401 Unauthorized, 403 Forbidden: Do NOT retry
      if (status === 401 || status === 403) {
        throw new Error(`Voyage AI Authentication Error (${status}): ${sanitizeErrorMessage(errorText)}`);
      }

      // 400 Bad Request: Invalid model, dimension, or oversized input - Do NOT retry
      if (status === 400) {
        throw new Error(`Voyage AI Bad Request (${status}): ${sanitizeErrorMessage(errorText)}`);
      }

      // 429 Rate Limit: Respect Retry-After
      if (status === 429) {
        if (attempt > maxRetries) {
          throw new Error(`Voyage AI Rate Limit exceeded after ${maxRetries} attempts: ${sanitizeErrorMessage(errorText)}`);
        }
        const retryAfterMs = parseVoyageRetryAfterMs(response.headers, errorText);
        const waitTime = retryAfterMs || delayMs + Math.floor(Math.random() * 500);
        await new Promise((res) => setTimeout(res, waitTime));
        delayMs = Math.min(delayMs * 2, 10000);
        continue;
      }

      // 500, 502, 503, 504: Transient upstream errors, retry with backoff and jitter
      if (status >= 500 && status < 600) {
        if (attempt > maxRetries) {
          throw new Error(`Voyage AI Server Error (${status}) after ${maxRetries} attempts: ${sanitizeErrorMessage(errorText)}`);
        }
        const jitter = Math.floor(Math.random() * 300);
        await new Promise((res) => setTimeout(res, delayMs + jitter));
        delayMs = Math.min(delayMs * 2, 8000);
        continue;
      }

      // Any other unexpected status code
      throw new Error(`Voyage AI Error (${status}): ${sanitizeErrorMessage(errorText)}`);
    } catch (err: any) {
      clearTimeout(timer);

      // Handle AbortError / Timeout
      if (err.name === 'AbortError') {
        if (attempt > maxRetries) {
          throw new Error(`Voyage AI request timed out after ${timeoutMs}ms and ${maxRetries} retries.`);
        }
        await new Promise((res) => setTimeout(res, delayMs));
        delayMs = Math.min(delayMs * 2, 8000);
        continue;
      }

      // Re-throw if authentication or bad request error
      if (
        err.message?.includes('Authentication Error') ||
        err.message?.includes('Bad Request') ||
        err.message?.includes('dimension mismatch')
      ) {
        throw err;
      }

      // If retry limit reached, throw
      if (attempt > maxRetries) {
        throw new Error(
          `Voyage AI embedding failed after ${maxRetries} attempts: ${sanitizeErrorMessage(err.message || String(err))}`
        );
      }

      // Retry transient network errors
      const jitter = Math.floor(Math.random() * 300);
      await new Promise((res) => setTimeout(res, delayMs + jitter));
      delayMs = Math.min(delayMs * 2, 8000);
    }
  }

  throw new Error('Voyage AI embedding unexpectedly exited retry loop.');
}

/**
 * Embeds an arbitrary list of texts using Voyage AI by chunking into bounded batches.
 * Default batch size: 16 texts per request (configurable via VOYAGE_BATCH_SIZE).
 */
export async function embedVoyageTexts(
  texts: string[],
  inputType: 'document' | 'query',
  options: VoyageEmbeddingOptions = {}
): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    return [];
  }

  const batchSize =
    options.batchSize ||
    parseInt(process.env.VOYAGE_BATCH_SIZE || '16', 10) ||
    DEFAULT_BATCH_SIZE;

  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const chunk = texts.slice(i, i + batchSize);
    const batchEmbeddings = await callVoyageApiWithRetry(chunk, inputType, options);
    results.push(...batchEmbeddings);
  }

  return results;
}

/**
 * Embeds repository document code segments using input_type: "document" and 512 dimensions.
 */
export async function embedDocuments(
  codeTexts: string[],
  options?: VoyageEmbeddingOptions
): Promise<number[][]> {
  return embedVoyageTexts(codeTexts, 'document', options);
}

/**
 * Embeds a single user search question using input_type: "query" and 512 dimensions.
 */
export async function embedQuery(
  query: string,
  options?: VoyageEmbeddingOptions
): Promise<number[]> {
  const [vector] = await embedVoyageTexts([query], 'query', options);
  return vector;
}
