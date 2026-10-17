/**
 * Production Ingestion Pipeline with Voyage Code 4 (512-d) Embeddings
 * Robust file discovery, content secret filtering, AST code chunking,
 * SHA-256 deduplication, checkpointing, and non-destructive staged updates.
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { extractCodeAwareChunks, INDEX_VERSION, isFileIgnored } from '../services/chunker';
import {
  validateServerSupabaseConfig,
  sanitizeErrorMessage,
  getCorsHeaders,
  isConfiguredKey,
  diagnoseSupabaseAuthError,
} from './config';
import { embedDocuments, isVoyageConfigured } from './embeddings/voyage';

export { INDEX_VERSION, isFileIgnored };

// Strict exclusion patterns for ingestion
export const IGNORED_PATH_PATTERNS = [
  /node_modules/,
  /\.git(\/|\\|$)/,
  /\.env(\.|$|_|-|[a-z0-9]|$)/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /credentials\.json/i,
  /dist(\/|\\|$)/,
  /build(\/|\\|$)/,
  /coverage(\/|\\|$)/,
  /\.DS_Store/,
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.(png|jpe?g|gif|svg|ico|pdf|zip|tar|gz|woff2?|eot|ttf|mp4|webm|exe|bin|dll|so|dylib)$/i,
];

// Content-level secret detection
export const SECRET_CONTENT_PATTERNS = [
  /-----BEGIN (?:RSA|OPENSSH|DSA|EC|PGP)? PRIVATE KEY-----/,
  /(?:api[_-]?key|access[_-]?token|secret[_-]?key)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i,
  /ghp_[A-Za-z0-9_]{36}/,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/,
];

export const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  md: 'markdown',
  json: 'json',
  html: 'html',
  css: 'css',
  sql: 'sql',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
};

/**
 * Detects whether content contains actual NUL characters (\u0000) or binary data
 */
export function isBinaryOrNonTextContent(content: string): { isBinary: boolean; reason?: string } {
  if (content.includes('\0')) {
    return { isBinary: true, reason: 'Actual NUL byte (\\u0000) detected' };
  }

  const sampleLength = Math.min(content.length, 8192);
  if (sampleLength === 0) {
    return { isBinary: false };
  }

  let controlCharCount = 0;
  for (let i = 0; i < sampleLength; i++) {
    const code = content.charCodeAt(i);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) {
      controlCharCount++;
    }
  }

  if (controlCharCount / sampleLength > 0.02) {
    return {
      isBinary: true,
      reason: `Binary content detected (${controlCharCount} control characters in first ${sampleLength} chars)`,
    };
  }

  return { isBinary: false };
}

export function isSafeForIndexing(path: string, content: string): { safe: boolean; reason?: string } {
  if (IGNORED_PATH_PATTERNS.some((p) => p.test(path))) {
    return { safe: false, reason: 'Excluded sensitive file path' };
  }
  if (content) {
    const binaryCheck = isBinaryOrNonTextContent(content);
    if (binaryCheck.isBinary) {
      return { safe: false, reason: binaryCheck.reason };
    }
    if (content.length > 250000) {
      return { safe: false, reason: 'Oversized file (>250KB)' };
    }
    for (const pattern of SECRET_CONTENT_PATTERNS) {
      if (pattern.test(content)) {
        return { safe: false, reason: 'Potential secret/credential detected in content' };
      }
    }
  }
  return { safe: true };
}

/**
 * Bounded concurrency executor that processes items in batches of size `limit`.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    const batchResults = await Promise.all(
      batch.map((item, idx) => task(item, i + idx))
    );
    results.push(...batchResults);
  }
  return results;
}

/**
 * Detects if a Gemini error indicates daily quota exhaustion.
 */
export function isDailyQuotaExhaustion(err: any): boolean {
  if (!err) return false;
  if (err.isDailyQuota) return true;
  const msg = (err.message || '').toLowerCase();
  const status = err.status || err.statusCode;
  const details = JSON.stringify(err.errorDetails || err.details || '').toLowerCase();

  const isDaily =
    msg.includes('perday') ||
    msg.includes('per day') ||
    msg.includes('daily') ||
    msg.includes('requests per day') ||
    msg.includes('embedcontentrequestsperday') ||
    msg.includes('generatecontentrequestsperday') ||
    msg.includes('free tier') ||
    msg.includes('daily limit') ||
    details.includes('requestsperday') ||
    details.includes('daily') ||
    details.includes('quotafailure') ||
    details.includes('ratelimitexceeded') ||
    (msg.includes('limit: 0') && (msg.includes('quota') || msg.includes('exhausted')));

  return (status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('exhausted')) && isDaily;
}

/**
 * Extracts retry delay in milliseconds from rate limit responses.
 */
export function parseRetryDelayMs(err: any): number | null {
  if (!err) return null;

  if (Array.isArray(err.errorDetails)) {
    for (const d of err.errorDetails) {
      if (d?.retryDelay && typeof d.retryDelay === 'string') {
        const match = d.retryDelay.match(/^([0-9]+(?:\.[0-9]+)?)\s*s$/i);
        if (match) {
          return Math.round(parseFloat(match[1]) * 1000);
        }
      }
    }
  }

  const msg = err.message || '';
  const secMatch = msg.match(/(?:retry\s+in|retry\s+after|wait)\s+([0-9]+(?:\.[0-9]+)?)\s*s\b/i);
  if (secMatch) {
    return Math.round(parseFloat(secMatch[1]) * 1000);
  }

  const msMatch = msg.match(/(?:retry\s+in|retry\s+after|wait)\s+([0-9]+)\s*ms\b/i);
  if (msMatch) {
    return parseInt(msMatch[1], 10);
  }

  return null;
}

/**
 * Generates embeddings for a batch of chunk texts using model or Gemini batchEmbedContents.
 */
export async function embedChunksBatchWithRetry(
  model: any,
  contents: string[],
  maxRetries = 3,
  initialDelayMs = 1500
): Promise<number[][]> {
  if (contents.length === 0) return [];

  let attempt = 0;
  let delay = initialDelayMs;

  const requests = contents.map((text) => ({
    content: { role: 'user', parts: [{ text: text.slice(0, 8000) }] },
    outputDimensionality: 768,
  }));

  while (attempt < maxRetries) {
    try {
      attempt++;

      if (typeof model?.batchEmbedContents === 'function') {
        const res = await model.batchEmbedContents({ requests });
        const embeddings = res?.embeddings;
        if (!Array.isArray(embeddings) || embeddings.length !== contents.length) {
          throw new Error(
            `Batch embedding output length mismatch: expected ${contents.length}, received ${embeddings?.length || 0}`
          );
        }

        const vectors: number[][] = [];
        for (let i = 0; i < embeddings.length; i++) {
          const vals = embeddings[i]?.values;
          if (!vals || vals.length !== 768) {
            throw new Error(
              `Embedding output invalid or unexpected dimension at index ${i}: ${vals?.length || 0} (expected 768)`
            );
          }
          vectors.push(vals);
        }
        return vectors;
      } else {
        const vectors: number[][] = [];
        for (let i = 0; i < requests.length; i++) {
          const res = await model.embedContent(requests[i]);
          const vals = res?.embedding?.values;
          if (!vals || vals.length !== 768) {
            throw new Error(
              `Embedding output invalid or unexpected dimension: ${vals?.length || 0} (expected 768)`
            );
          }
          vectors.push(vals);
        }
        return vectors;
      }
    } catch (err: any) {
      if (isDailyQuotaExhaustion(err)) {
        throw new Error(
          `Gemini API daily quota exhausted: ${sanitizeErrorMessage(err.message || 'RequestsPerDay quota exceeded')}. Resuming will be available once the daily quota resets.`
        );
      }

      const isRetryable =
        err?.status === 429 ||
        err?.status === 503 ||
        err?.status === 500 ||
        err?.message?.includes('429') ||
        err?.message?.includes('503') ||
        err?.message?.includes('Resource has been exhausted') ||
        err?.message?.includes('Quota exceeded') ||
        err?.message?.includes('overloaded');

      if (attempt >= maxRetries || !isRetryable) {
        throw new Error(
          `Embedding failed after ${attempt} attempts: ${sanitizeErrorMessage(err.message)}`
        );
      }

      const retryDelayMs = parseRetryDelayMs(err);
      if (retryDelayMs !== null && retryDelayMs > 15000) {
        throw new Error(
          `Gemini rate limit cooldown active: please retry in ${Math.ceil(retryDelayMs / 1000)}s. Indexing progress has been safely saved and can be resumed.`
        );
      }

      const waitTime = retryDelayMs !== null ? retryDelayMs + 250 : delay;
      const jitter = Math.floor(Math.random() * 400);
      await new Promise((resolve) => setTimeout(resolve, waitTime + jitter));
      delay *= 2;
    }
  }

  throw new Error('Unexpected embedding retry termination');
}

export async function embedChunkWithRetry(
  model: any,
  content: string,
  maxRetries = 3,
  initialDelayMs = 1500
): Promise<number[]> {
  const [vector] = await embedChunksBatchWithRetry(model, [content], maxRetries, initialDelayMs);
  return vector;
}

async function decodeResponseText(res: Response | any): Promise<string> {
  if (typeof res.arrayBuffer === 'function') {
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(buffer);
    }
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(buffer);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  }

  return await res.text();
}

/**
 * Safely upserts file records in batches with individual fallback on failure.
 */
export async function upsertFilesWithIsolation(
  dbClient: any,
  records: Array<{
    repository_id: string;
    path: string;
    sha: string | null;
    language: string;
    content: string;
    size: number;
    updated_at: string;
  }>,
  batchSize = 50
): Promise<{
  successfulFiles: Array<{ id: string; path: string }>;
  failedFiles: Array<{ path: string; error: string }>;
}> {
  const successfulFiles: Array<{ id: string; path: string }> = [];
  const failedFiles: Array<{ path: string; error: string }> = [];

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { data, error } = await dbClient
      .from('files')
      .upsert(batch, { onConflict: 'repository_id,path' })
      .select('id, path');

    if (!error && data) {
      successfulFiles.push(...data);
    } else {
      console.warn(`[Ingest] Batch file upsert failed (${error?.message || 'unknown error'}); isolating records`);
      for (const singleRecord of batch) {
        const { data: singleData, error: singleErr } = await dbClient
          .from('files')
          .upsert([singleRecord], { onConflict: 'repository_id,path' })
          .select('id, path');

        if (singleErr || !singleData || singleData.length === 0) {
          const errMsg = singleErr?.message || 'File upsert failed';
          console.error(`[Ingest] Offending file upsert failed for path "${singleRecord.path}": ${errMsg}`);
          failedFiles.push({ path: singleRecord.path, error: errMsg });
        } else {
          successfulFiles.push(singleData[0]);
        }
      }
    }
  }

  return { successfulFiles, failedFiles };
}

/**
 * Safely inserts chunk rows in batches with individual fallback on failure.
 */
export async function insertChunksWithIsolation(
  dbClient: any,
  chunkRows: Array<{
    repository_id: string;
    file_id?: string;
    content: string;
    language: string;
    start_line: number;
    end_line: number;
    symbol_name: string;
    symbol_type: string;
    embedding?: number[];
    embedding_v4?: number[];
    embedding_model?: string;
    embedding_dimension?: number;
    chunk_hash?: string;
    metadata?: any;
  }>,
  batchSize = 50
): Promise<{
  insertedCount: number;
  failedChunks: Array<{ file_id?: string; error: string }>;
}> {
  let insertedCount = 0;
  const failedChunks: Array<{ file_id?: string; error: string }> = [];

  for (let i = 0; i < chunkRows.length; i += batchSize) {
    const batch = chunkRows.slice(i, i + batchSize);
    const { error } = await dbClient.from('chunks').insert(batch);

    if (!error) {
      insertedCount += batch.length;
    } else {
      console.warn(`[Ingest] Batch chunk insert failed (${error.message}); isolating chunks`);
      for (const singleChunk of batch) {
        const { error: singleErr } = await dbClient.from('chunks').insert([singleChunk]);
        if (singleErr) {
          console.error(
            `[Ingest] Offending chunk insert failed for file_id "${singleChunk.file_id}" [${singleChunk.start_line}-${singleChunk.end_line}]: ${singleErr.message}`
          );
          failedChunks.push({ file_id: singleChunk.file_id, error: singleErr.message });
        } else {
          insertedCount++;
        }
      }
    }
  }

  return { insertedCount, failedChunks };
}

/**
 * Safely fetches raw blob content from GitHub using token authentication when available.
 */
export async function fetchGitHubBlobContent(
  owner: string,
  repo: string,
  sha: string,
  path: string,
  defaultBranch: string,
  githubToken?: string
): Promise<string | null> {
  if (githubToken) {
    try {
      const blobRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`,
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: 'application/vnd.github.raw',
            'User-Agent': 'IntelCode-App',
          },
        }
      );
      if (blobRes.ok) {
        return await decodeResponseText(blobRes);
      }
    } catch (err) {
      console.warn(`Failed to fetch blob ${sha} via Git Blobs API:`, err);
    }
  }

  const rawHeaders: Record<string, string> = { 'User-Agent': 'IntelCode-App' };
  if (githubToken) {
    rawHeaders.Authorization = `token ${githubToken}`;
  }
  try {
    const rawRes = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${path}`,
      { headers: rawHeaders }
    );
    if (rawRes.ok) {
      return await decodeResponseText(rawRes);
    }
  } catch (err) {
    console.warn(`Failed to fetch ${path} via raw CDN:`, err);
  }

  return null;
}

export { validateServerSupabaseConfig, sanitizeErrorMessage, diagnoseSupabaseAuthError };

/**
 * Main Ingestion Handler Function
 * Accepts standard event/request parameters and coordinates repository ingestion.
 */
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

  // 1. Strict Authentication: Require genuine Supabase JWT token
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Authentication required. Missing Bearer token in Authorization header.' }),
    };
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  // 2. Validate server-side environment configuration (including project consistency)
  const configValidation = validateServerSupabaseConfig(serviceKey, supabaseUrl, anonKey);
  if (!configValidation.valid) {
    return {
      statusCode: configValidation.statusCode || 503,
      headers,
      body: JSON.stringify({ error: configValidation.error, code: 'SERVER_CONFIG_ERROR' }),
    };
  }

  const token = authHeader.split(' ')[1];
  const supabase = createClient(supabaseUrl!, serviceKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify calling user's JWT
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    const diagnostic = diagnoseSupabaseAuthError(authError, token, supabaseUrl, serviceKey);
    console.warn('[Ingest Auth] Authentication verification failed:', {
      status: diagnostic.statusCode,
      code: diagnostic.code,
      authCode: diagnostic.authCode,
      message: sanitizeErrorMessage(authError?.message || 'No user returned'),
    });

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

  // Client-authenticated Supabase client for RLS validation
  const userClient = isConfiguredKey(anonKey)
    ? createClient(supabaseUrl!, anonKey!, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  const dbClient = userClient || supabase;

  let repositoryId: string | undefined;
  let jobId: string | undefined;

  try {
    const body = JSON.parse(event.body || '{}');
    repositoryId = body.repositoryId;
    const { fullName, cursor, batchLimit = 50 } = body;

    if (!repositoryId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'repositoryId is a required parameter.' }),
      };
    }

    const repoId: string = repositoryId;

    // 3. Authorization Check
    const { data: repo, error: repoFetchErr } = await supabase
      .from('repositories')
      .select('id, user_id, full_name, default_branch, owner, name, is_private, files_count')
      .eq('id', repositoryId)
      .maybeSingle();

    if (repoFetchErr || !repo) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Repository not found in database.' }),
      };
    }

    if (repo.user_id !== user.id) {
      const { data: member } = await supabase
        .from('repository_members')
        .select('id, role')
        .eq('repository_id', repositoryId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!member) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({
            error: 'Access denied: You do not have permission to index or modify this repository.',
          }),
        };
      }
    }

    // 4. Retrieve authorized GitHub token
    let githubToken: string | undefined =
      event.headers?.['x-github-token'] || event.headers?.['X-GitHub-Token'] || body.githubToken;

    if (!githubToken) {
      const { data: conn } = await supabase
        .from('github_connections')
        .select('access_token')
        .eq('user_id', user.id)
        .maybeSingle();

      if (conn?.access_token) {
        githubToken = conn.access_token;
      }
    }

    if (repo.is_private && !githubToken) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({
          error:
            'Private repository access requires an authorized GitHub connection. Please connect your GitHub account in Settings.',
        }),
      };
    }

    // 5. Initialize or Resume Indexing Job
    jobId = body.jobId;
    if (!jobId) {
      const { data: existingActiveJob } = await supabase
        .from('indexing_jobs')
        .select('id, status, created_at')
        .eq('repository_id', repositoryId)
        .in('status', ['pending', 'fetching', 'chunking', 'embedding'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingActiveJob) {
        const jobAgeMs = Date.now() - new Date(existingActiveJob.created_at).getTime();
        if (jobAgeMs < 180000) {
          jobId = existingActiveJob.id;
        }
      }

      if (!jobId) {
        const { data: newJob, error: jobCreateErr } = await dbClient
          .from('indexing_jobs')
          .insert({
            repository_id: repositoryId,
            status: 'fetching',
            progress: 5,
            files_processed: 0,
            chunks_created: 0,
          })
          .select('id')
          .single();

        if (jobCreateErr || !newJob) {
          throw new Error(`Failed to create indexing job: ${jobCreateErr?.message}`);
        }
        jobId = newJob.id;
      }
    }

    // Set repository status to 'indexing'
    await dbClient
      .from('repositories')
      .update({ status: 'indexing', updated_at: new Date().toISOString() })
      .eq('id', repositoryId);

    // 6. Fetch complete Git tree
    const targetRepoFullName = fullName || repo.full_name || (repo.owner && repo.name ? `${repo.owner}/${repo.name}` : '');
    const parts = targetRepoFullName ? targetRepoFullName.split('/') : [];
    const owner = repo.owner || parts[0] || '';
    const name = repo.name || parts[1] || '';
    const defaultBranch = repo.default_branch || 'main';

    const authHeaders: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'IntelCode-App',
    };
    if (githubToken) {
      authHeaders.Authorization = `Bearer ${githubToken}`;
    }

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${name}/git/trees/${defaultBranch}?recursive=1`,
      { headers: authHeaders }
    );

    if (!treeRes.ok) {
      const errText = await treeRes.text();
      const status = treeRes.status;
      const isRateLimit = status === 403 && errText.includes('rate limit');
      const errorMsg = isRateLimit
        ? 'GitHub API rate limit exceeded. Please configure an authorized GitHub personal access token in Settings.'
        : `GitHub tree discovery failed (HTTP ${status}): ${sanitizeErrorMessage(errText)}`;

      await dbClient
        .from('indexing_jobs')
        .update({ status: 'failed', error: errorMsg, updated_at: new Date().toISOString() })
        .eq('id', jobId);

      await dbClient
        .from('repositories')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', repositoryId);

      return {
        statusCode: status === 403 ? 403 : 502,
        headers,
        body: JSON.stringify({ error: errorMsg }),
      };
    }

    const treeData = await treeRes.json();
    const allTreeItems = Array.isArray(treeData.tree) ? treeData.tree : [];

    // Filter eligible blobs
    const eligibleBlobs = allTreeItems.filter(
      (item: any) =>
        item.type === 'blob' &&
        isSafeForIndexing(item.path, '').safe &&
        (!item.size || item.size <= 250000)
    );

    // 7. Load existing files and chunks
    const { data: existingFiles } = await dbClient
      .from('files')
      .select('id, path, sha, size')
      .eq('repository_id', repositoryId);

    const existingFileMap = new Map<string, any>();
    (existingFiles || []).forEach((f: any) => existingFileMap.set(f.path, f));

    const { data: existingChunks } = await dbClient
      .from('chunks')
      .select('id, file_id, start_line, end_line, content, embedding, embedding_v4, chunk_hash')
      .eq('repository_id', repositoryId);

    const existingChunksByFileId = new Map<string, any[]>();
    (existingChunks || []).forEach((c: any) => {
      const list = existingChunksByFileId.get(c.file_id) || [];
      list.push(c);
      existingChunksByFileId.set(c.file_id, list);
    });

    // Git Blob SHA differential check
    const currentGitPaths = new Set<string>();
    const filesToDownload: any[] = [];
    const unchangedFilePaths: string[] = [];

    for (const blob of eligibleBlobs) {
      currentGitPaths.add(blob.path);
      const existing = existingFileMap.get(blob.path);
      const hasChunks = Boolean(
        existing &&
        existingChunksByFileId.has(existing.id) &&
        existingChunksByFileId.get(existing.id)!.length > 0
      );
      const isUnchanged = Boolean(existing && existing.sha === blob.sha && hasChunks);

      if (isUnchanged) {
        unchangedFilePaths.push(blob.path);
      } else {
        filesToDownload.push(blob);
      }
    }

    // Prune deleted files
    const deletedFileIds: string[] = [];
    existingFileMap.forEach((f, path) => {
      if (!currentGitPaths.has(path)) {
        deletedFileIds.push(f.id);
      }
    });

    const ineligibleExistingFileIds: string[] = [];
    existingFileMap.forEach((f, path) => {
      if (currentGitPaths.has(path) && !isSafeForIndexing(path, '').safe) {
        ineligibleExistingFileIds.push(f.id);
      }
    });

    // Pagination / slicing for serverless execution limits
    let startIndex = 0;
    if (cursor) {
      const idxByPath = filesToDownload.findIndex((f) => f.path === cursor);
      if (idxByPath >= 0) {
        startIndex = idxByPath + 1;
      } else {
        startIndex = parseInt(cursor, 10) || 0;
      }
    }

    const filesSlice = filesToDownload.slice(startIndex, startIndex + batchLimit);
    const hasMore = startIndex + batchLimit < filesToDownload.length;
    const nextCursor = hasMore && filesSlice.length > 0 ? filesSlice[filesSlice.length - 1].path : null;

    // Defers deleted and ineligible file cleanup strictly to final batch
    if (!hasMore) {
      if (deletedFileIds.length > 0) {
        await supabase.from('chunks').delete().in('file_id', deletedFileIds);
        await supabase.from('files').delete().in('id', deletedFileIds);
      }

      if (ineligibleExistingFileIds.length > 0) {
        await supabase.from('chunks').delete().in('file_id', ineligibleExistingFileIds);
        await supabase.from('files').delete().in('id', ineligibleExistingFileIds);
      }
    }

    let failedFilesCount = 0;
    let failedChunksCount = 0;

    // 8. Bounded Concurrency Blob Downloads
    const downloadedFiles = await runWithConcurrency(filesSlice, 8, async (blob: any) => {
      try {
        const rawContent = await fetchGitHubBlobContent(
          owner,
          name,
          blob.sha,
          blob.path,
          defaultBranch,
          githubToken
        );

        if (rawContent === null) {
          failedFilesCount++;
          return null;
        }

        const safetyCheck = isSafeForIndexing(blob.path, rawContent);
        if (!safetyCheck.safe) {
          return null;
        }

        const ext = blob.path.split('.').pop()?.toLowerCase() || '';
        const language = EXT_TO_LANG[ext] || 'text';

        return {
          path: blob.path,
          sha: blob.sha,
          size: rawContent.length,
          content: rawContent,
          language,
        };
      } catch (err) {
        failedFilesCount++;
        return null;
      }
    });

    const validDownloadedFiles = downloadedFiles.filter((f): f is NonNullable<typeof f> => f !== null);

    // 9. Staging: Pre-register new file records
    const fileIdByPath = new Map<string, string>();
    existingFileMap.forEach((f, path) => {
      if (!deletedFileIds.includes(f.id) && !ineligibleExistingFileIds.includes(f.id)) {
        fileIdByPath.set(path, f.id);
      }
    });

    const newFilesToInsert = validDownloadedFiles
      .filter((f) => !fileIdByPath.has(f.path))
      .map((f) => ({
        repository_id: repoId,
        path: f.path,
        sha: null,
        language: f.language,
        content: f.content,
        size: f.size,
        updated_at: new Date().toISOString(),
      }));

    if (newFilesToInsert.length > 0) {
      let insertRes = await upsertFilesWithIsolation(supabase, newFilesToInsert);
      if (insertRes.failedFiles.length > 0) {
        const userClientResult = await upsertFilesWithIsolation(dbClient, newFilesToInsert);
        if (userClientResult.successfulFiles.length > insertRes.successfulFiles.length) {
          insertRes = userClientResult;
        }
      }
      insertRes.successfulFiles.forEach((f) => fileIdByPath.set(f.path, f.id));
      if (insertRes.failedFiles.length > 0) {
        failedFilesCount += insertRes.failedFiles.length;
      }
    }

    // 10. Code-Aware AST Chunking
    const fileChunksMap = new Map<string, Array<{
      file_id: string;
      tempFileKey: string;
      content: string;
      language: string;
      start_line: number;
      end_line: number;
      symbol_name: string;
      symbol_type: string;
      metadata: Record<string, any>;
      embedding_v4?: number[];
      embedding?: number[];
      chunk_hash?: string;
    }>>();

    const allPendingChunks: Array<{
      file_id: string;
      tempFileKey: string;
      content: string;
      language: string;
      start_line: number;
      end_line: number;
      symbol_name: string;
      symbol_type: string;
      metadata: Record<string, any>;
      embedding_v4?: number[];
      embedding?: number[];
      chunk_hash?: string;
    }> = [];

    const useVoyage = isVoyageConfigured();

    for (const file of validDownloadedFiles) {
      const fileId = fileIdByPath.get(file.path);
      if (!fileId) continue;

      const codeChunks = extractCodeAwareChunks(file.path, file.content, file.language);
      const chunksForFile: any[] = [];

      const existingDbChunks = existingChunksByFileId.get(fileId) || [];
      const existingEmbeddingMap = new Map<string, { v4?: number[]; legacy?: number[] }>();

      for (const ec of existingDbChunks) {
        const key = `${ec.start_line}:${ec.end_line}:${ec.content}`;
        const entry: { v4?: number[]; legacy?: number[] } = {};
        if (ec.embedding_v4 && Array.isArray(ec.embedding_v4) && ec.embedding_v4.length === 512) {
          entry.v4 = ec.embedding_v4;
        }
        if (ec.embedding && Array.isArray(ec.embedding) && ec.embedding.length === 768) {
          entry.legacy = ec.embedding;
        }
        existingEmbeddingMap.set(key, entry);
      }

      for (const cc of codeChunks) {
        const hash = crypto.createHash('sha256').update(cc.content).digest('hex');
        const chunkObj: any = {
          file_id: fileId,
          tempFileKey: file.path,
          content: cc.content,
          language: cc.language,
          start_line: cc.startLine,
          end_line: cc.endLine,
          symbol_name: cc.symbolName,
          symbol_type: cc.symbolType,
          metadata: cc.metadata || { index_version: INDEX_VERSION },
          chunk_hash: hash,
        };

        const existing = existingEmbeddingMap.get(`${cc.startLine}:${cc.endLine}:${cc.content}`);
        if (useVoyage && existing?.v4) {
          chunkObj.embedding_v4 = existing.v4;
        } else if (!useVoyage && existing?.legacy) {
          chunkObj.embedding = existing.legacy;
        }

        chunksForFile.push(chunkObj);
        allPendingChunks.push(chunkObj);
      }

      fileChunksMap.set(file.path, chunksForFile);
    }

    // 11. Batch Embedding Generation
    const chunksNeedingEmbedding = allPendingChunks.filter((c) =>
      useVoyage ? !c.embedding_v4 : !c.embedding
    );

    if (chunksNeedingEmbedding.length > 0) {
      await dbClient
        .from('indexing_jobs')
        .update({ status: 'embedding', progress: 50, updated_at: new Date().toISOString() })
        .eq('id', jobId);

      if (useVoyage) {
        // --- PRODUCTION VOYAGE CODE 4 PATH (512 dimensions) ---
        const voyageBatchSize = parseInt(process.env.VOYAGE_BATCH_SIZE || '16', 10) || 16;
        for (let i = 0; i < chunksNeedingEmbedding.length; i += voyageBatchSize) {
          const batchChunks = chunksNeedingEmbedding.slice(i, i + voyageBatchSize);
          const texts = batchChunks.map((c) => c.content);

          try {
            const vectors = await embedDocuments(texts);
            vectors.forEach((vec, idx) => {
              batchChunks[idx].embedding_v4 = vec;
            });
          } catch (voyageErr: any) {
            console.error('[Ingest] Voyage embedding batch failed:', voyageErr);
            failedChunksCount += batchChunks.length;
            throw new Error(`Embedding batch failed: ${sanitizeErrorMessage(voyageErr.message)}`);
          }
        }
      } else {
        // --- GEMINI / TEST MOCK FALLBACK PATH ---
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!isConfiguredKey(geminiApiKey)) {
          throw new Error('No embedding provider configured: missing VOYAGE_API_KEY and GEMINI_API_KEY.');
        }

        const embeddingModelName = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001';
        const genAI = new GoogleGenerativeAI(geminiApiKey!);
        const embedModel = genAI.getGenerativeModel({ model: embeddingModelName });

        const geminiBatchSize = 10;
        for (let i = 0; i < chunksNeedingEmbedding.length; i += geminiBatchSize) {
          const batchChunks = chunksNeedingEmbedding.slice(i, i + geminiBatchSize);
          const texts = batchChunks.map((c) => c.content);

          try {
            const vectors = await embedChunksBatchWithRetry(embedModel, texts);
            vectors.forEach((vec, idx) => {
              if (vec.length === 512) {
                batchChunks[idx].embedding_v4 = vec;
              } else {
                batchChunks[idx].embedding = vec;
              }
            });
          } catch (geminiErr: any) {
            const sanitizedErr = sanitizeErrorMessage(geminiErr?.message || 'Embedding failure');
            console.error('[Ingest] Embedding batch failed:', sanitizedErr);

            if (isDailyQuotaExhaustion(geminiErr)) {
              await dbClient
                .from('indexing_jobs')
                .update({
                  status: 'paused',
                  error: `Gemini API daily quota exhausted: ${sanitizedErr}. Progress has been safely saved and can be resumed after quota reset.`,
                  progress: 50,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', jobId);

              if (existingFileMap.size > 0) {
                await dbClient
                  .from('repositories')
                  .update({ status: 'ready', updated_at: new Date().toISOString() })
                  .eq('id', repositoryId);
              } else {
                await dbClient
                  .from('repositories')
                  .update({ status: 'paused', updated_at: new Date().toISOString() })
                  .eq('id', repositoryId);
              }

              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  success: false,
                  paused: true,
                  quota_exhausted: true,
                  can_resume: true,
                  repositoryId,
                  jobId,
                  cursor,
                  message:
                    'Gemini API daily quota reached. Indexing safely paused; existing index data is preserved.',
                }),
              };
            }

            failedChunksCount += batchChunks.length;
            throw new Error(`Embedding batch failed: ${sanitizedErr}`);
          }
        }
      }
    }

    // 12. Atomic Staged Replacement per File
    for (const file of validDownloadedFiles) {
      const fileId = fileIdByPath.get(file.path);
      if (!fileId) continue;

      const chunksForFile = fileChunksMap.get(file.path) || [];
      const allChunksReady =
        chunksForFile.length === 0 ||
        chunksForFile.every(
          (c) =>
            (c.embedding_v4 && Array.isArray(c.embedding_v4) && c.embedding_v4.length === 512) ||
            (c.embedding && Array.isArray(c.embedding) && c.embedding.length === 768)
        );

      if (!allChunksReady) {
        console.warn(`[Ingest] Skipping file commit for "${file.path}" because chunks lack verified embeddings.`);
        continue;
      }

      // Insert new chunks
      if (chunksForFile.length > 0) {
        const rowsToInsert = chunksForFile.map((c) => ({
          repository_id: repoId,
          file_id: fileId,
          content: c.content,
          language: c.language,
          start_line: c.start_line,
          end_line: c.end_line,
          symbol_name: c.symbol_name,
          symbol_type: c.symbol_type,
          metadata: c.metadata,
          embedding_v4: c.embedding_v4,
          embedding: c.embedding,
          embedding_model: c.embedding_v4 ? (process.env.VOYAGE_EMBEDDING_MODEL || 'voyage-code-4') : 'gemini-embedding-001',
          embedding_dimension: c.embedding_v4 ? 512 : (c.embedding ? 768 : 512),
          chunk_hash: c.chunk_hash,
        }));

        let insertRes = await insertChunksWithIsolation(supabase, rowsToInsert);
        if (insertRes.failedChunks.length > 0) {
          const userRes = await insertChunksWithIsolation(dbClient, rowsToInsert);
          if (userRes.insertedCount > insertRes.insertedCount) {
            insertRes = userRes;
          }
        }
        if (insertRes.failedChunks.length > 0) {
          failedChunksCount += insertRes.failedChunks.length;
          continue;
        }
      }

      // Delete obsolete previous chunks for this file
      const existingOldChunks = existingChunksByFileId.get(fileId) || [];
      const oldChunkIds = existingOldChunks.map((c: any) => c.id).filter(Boolean);
      if (oldChunkIds.length > 0) {
        await supabase.from('chunks').delete().in('id', oldChunkIds);
      }

      // Commit file record with new SHA
      await supabase
        .from('files')
        .update({
          sha: file.sha,
          content: file.content,
          size: file.size,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fileId);
    }

    // 13. Continuation Check
    if (hasMore) {
      await dbClient
        .from('indexing_jobs')
        .update({
          status: 'chunking',
          progress: Math.min(85, Math.round(((startIndex + batchLimit) / filesToDownload.length) * 85)),
          files_processed: (existingFiles?.length || 0) + validDownloadedFiles.length,
          chunks_created: (existingChunks?.length || 0) + allPendingChunks.length,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          has_more: true,
          next_cursor: nextCursor,
          repositoryId,
          jobId,
          files_batch: validDownloadedFiles.length,
          files_total: filesToDownload.length,
          chunks_batch: allPendingChunks.length,
        }),
      };
    }

    // 14. Verification Before Marking Ready
    const { count: finalFileCount } = await dbClient
      .from('files')
      .select('*', { count: 'exact', head: true })
      .eq('repository_id', repositoryId);

    const { count: finalChunkCount } = await dbClient
      .from('chunks')
      .select('*', { count: 'exact', head: true })
      .eq('repository_id', repositoryId);

    // Verify no chunks are missing embeddings
    const { data: allChunks } = await dbClient
      .from('chunks')
      .select('id, embedding, embedding_v4')
      .eq('repository_id', repositoryId);

    const chunksMissingEmbedding = (allChunks || []).filter(
      (c: any) => !c.embedding && !c.embedding_v4
    );

    if (chunksMissingEmbedding.length > 0) {
      throw new Error(
        `Cannot mark repository ready: ${chunksMissingEmbedding.length} chunk(s) are missing vector embeddings.`
      );
    }

    // Verify all files with size/sha have chunk rows
    const { data: allRepoFiles } = await dbClient
      .from('files')
      .select('id, path, size, sha')
      .eq('repository_id', repositoryId);

    const { data: allRepoChunks } = await dbClient
      .from('chunks')
      .select('id, file_id, metadata')
      .eq('repository_id', repositoryId);

    const chunkCountByFileId = new Map<string, number>();
    const totalExpectedByFileId = new Map<string, number>();

    (allRepoChunks || []).forEach((c: any) => {
      chunkCountByFileId.set(c.file_id, (chunkCountByFileId.get(c.file_id) || 0) + 1);
      if (c.metadata?.total_chunks) {
        totalExpectedByFileId.set(c.file_id, c.metadata.total_chunks);
      }
    });

    const incompleteFiles: string[] = [];
    for (const f of allRepoFiles || []) {
      const chunksForFile = chunkCountByFileId.get(f.id) || 0;
      if (f.sha && ((f.size && f.size > 0) || f.size === undefined)) {
        if (chunksForFile === 0) {
          incompleteFiles.push(`${f.path} (0 chunks)`);
        } else if (totalExpectedByFileId.has(f.id) && chunksForFile < totalExpectedByFileId.get(f.id)!) {
          incompleteFiles.push(`${f.path} (${chunksForFile}/${totalExpectedByFileId.get(f.id)} chunks)`);
        }
      }
    }

    if (incompleteFiles.length > 0) {
      throw new Error(
        `Cannot mark repository ready: ${incompleteFiles.length} file(s) are missing chunk rows: ${incompleteFiles.slice(0, 5).join(', ')}`
      );
    }

    const verifiedFilesCount = finalFileCount || 0;
    const verifiedChunksCount = finalChunkCount || 0;

    await dbClient
      .from('repositories')
      .update({
        status: 'ready',
        files_count: verifiedFilesCount,
        chunks_count: verifiedChunksCount,
        embedding_model: useVoyage ? (process.env.VOYAGE_EMBEDDING_MODEL || 'voyage-code-4') : 'gemini-embedding-001',
        embedding_dimension: useVoyage ? 512 : 768,
        indexing_version: INDEX_VERSION,
        last_indexed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', repositoryId);

    await dbClient
      .from('indexing_jobs')
      .update({
        status: 'completed',
        progress: 100,
        files_processed: verifiedFilesCount,
        chunks_created: verifiedChunksCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        has_more: false,
        repositoryId,
        jobId,
        files_count: verifiedFilesCount,
        chunks_count: verifiedChunksCount,
        embedding_model: useVoyage ? (process.env.VOYAGE_EMBEDDING_MODEL || 'voyage-code-4') : 'gemini-embedding-001',
        dimensions: useVoyage ? 512 : 768,
      }),
    };
  } catch (err: any) {
    console.error('Indexing pipeline error:', err);
    const sanitized = sanitizeErrorMessage(err?.message || 'Indexing failed');

    try {
      if (repositoryId) {
        await dbClient
          .from('repositories')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', repositoryId);

        if (jobId) {
          await dbClient
            .from('indexing_jobs')
            .update({ status: 'failed', error: sanitized, updated_at: new Date().toISOString() })
            .eq('id', jobId);
        }
      }
    } catch {
      // Ignore secondary db update errors
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: sanitized,
        success: false,
      }),
    };
  }
};
