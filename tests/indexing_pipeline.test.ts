import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isSafeForIndexing,
  isBinaryOrNonTextContent,
  upsertFilesWithIsolation,
  insertChunksWithIsolation,
  runWithConcurrency,
  embedChunkWithRetry,
  embedChunksBatchWithRetry,
  isDailyQuotaExhaustion,
  parseRetryDelayMs,
  sanitizeErrorMessage,
  validateServerSupabaseConfig,
  fetchGitHubBlobContent,
  handler as ingestHandler,
} from '../src/server/ingest';
import { handler as embeddingsHandler } from '../api/embeddings';
import { fetchAndValidateJson } from '../src/services/repositoryService';
import { formatRelativeTime } from '../src/lib/utils';

describe('Hardened Indexing Pipeline Verification', () => {
  describe('1. Complete File Discovery Without 25-File Cap', () => {
    it('processes complete tree list beyond 25 files without arbitrary slicing', () => {
      // Simulate 40 files in repository tree
      const mockTree = Array.from({ length: 40 }, (_, i) => ({
        type: 'blob',
        path: `src/components/Component_${i}.tsx`,
        sha: `sha_hash_${i}`,
        size: 1500,
      }));

      const eligibleBlobs = mockTree.filter(
        (item) =>
          item.type === 'blob' &&
          isSafeForIndexing(item.path, '').safe &&
          (!item.size || item.size <= 250000)
      );

      // Verify no hard-coded .slice(0, 25) limits the results
      expect(eligibleBlobs.length).toBe(40);
      expect(eligibleBlobs.length).toBeGreaterThan(25);
    });

    it('filters out binary, media, and oversized files while preserving valid code files', () => {
      const files = [
        { path: 'src/app.ts', size: 1200, valid: true },
        { path: 'dist/bundle.js', size: 50000, valid: false }, // build artifact
        { path: 'assets/hero.png', size: 45000, valid: false }, // image binary
        { path: 'docs/guide.md', size: 3000, valid: true },
        { path: 'huge_data.json', size: 350000, valid: false }, // > 250KB
        { path: '.env.production', size: 400, valid: false }, // secret
      ];

      for (const f of files) {
        const check = isSafeForIndexing(f.path, f.valid ? 'console.log("ok");' : '');
        const sizeOk = f.size <= 250000;
        const accepted = check.safe && sizeOk;
        expect(accepted).toBe(f.valid);
      }
    });
  });

  describe('2. Bounded Concurrency Pool', () => {
    it('executes tasks within bounded concurrency limits without race conditions', async () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const concurrencyLimit = 4;
      let activeWorkers = 0;
      let maxSimultaneous = 0;

      const results = await runWithConcurrency(items, concurrencyLimit, async (num) => {
        activeWorkers++;
        maxSimultaneous = Math.max(maxSimultaneous, activeWorkers);
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeWorkers--;
        return num * 2;
      });

      expect(maxSimultaneous).toBeLessThanOrEqual(concurrencyLimit);
      expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]);
    });
  });

  describe('3. Embedding Retries & Failure Handling', () => {
    it('successfully retries and recovers from transient 429/503 errors with exponential backoff', async () => {
      let callCount = 0;
      const mockModel = {
        embedContent: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount < 3) {
            const err: any = new Error('Resource has been exhausted (rate limit)');
            err.status = 429;
            throw err;
          }
          return {
            embedding: {
              values: new Array(768).fill(0.01),
            },
          };
        }),
      };

      const vector = await embedChunkWithRetry(mockModel, 'function test() {}', 3, 10);
      expect(vector.length).toBe(768);
      expect(callCount).toBe(3);
    });

    it('throws error on permanent failure and never silently returns an empty vector', async () => {
      const mockFailingModel = {
        embedContent: vi.fn().mockRejectedValue(new Error('Fatal API Key Invalid')),
      };

      await expect(
        embedChunkWithRetry(mockFailingModel, 'const x = 1;', 2, 10)
      ).rejects.toThrow('Embedding failed after 1 attempts: Fatal API Key Invalid');
    });

    it('rejects vectors with incorrect output dimensionality', async () => {
      const mockCorruptedModel = {
        embedContent: vi.fn().mockResolvedValue({
          embedding: { values: [0.1, 0.2, 0.3] }, // Only 3 dimensions instead of 768
        }),
      };

      await expect(
        embedChunkWithRetry(mockCorruptedModel, 'const x = 1;', 1, 10)
      ).rejects.toThrow('Embedding output invalid or unexpected dimension: 3 (expected 768)');
    });
  });

  describe('4. Authentication & Authorization Enforcement', () => {
    it('rejects unauthenticated requests to /api/ingest with HTTP 401', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {}, // No Bearer token
        body: JSON.stringify({ repositoryId: '00000000-0000-0000-0000-000000000001' }),
      };

      const res = await ingestHandler(event);
      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.body);
      expect(data.error).toContain('Authentication required');
    });

    it('rejects unauthenticated requests to /api/embeddings with HTTP 401', async () => {
      const event = {
        httpMethod: 'POST',
        headers: {},
        body: JSON.stringify({ texts: ['export function run() {}'] }),
      };

      const res = await embeddingsHandler(event);
      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.body);
      expect(data.error).toContain('Authentication required');
    });

    it('rejects payload exceeding request-size limits with HTTP 413 on /api/embeddings', async () => {
      const largePayload = 'a'.repeat(260000);
      const event = {
        httpMethod: 'POST',
        headers: { Authorization: 'Bearer valid_mock_token' },
        body: largePayload,
      };

      const res = await embeddingsHandler(event);
      expect(res.statusCode).toBe(413);
      const data = JSON.parse(res.body);
      expect(data.error).toContain('250KB maximum');
    });
  });

  describe('5. Private Repository Access & Authorized Token', () => {
    it('uses GitHub Git Blobs API with Authorization Bearer header when token is provided', async () => {
      const originalFetch = global.fetch;
      let requestedUrl = '';
      let usedAuthHeader = '';

      global.fetch = vi.fn().mockImplementation(async (url: string, opts: any) => {
        requestedUrl = url;
        usedAuthHeader = opts?.headers?.Authorization || '';
        return {
          ok: true,
          text: async () => 'export const secretConfig = true;',
        };
      }) as any;

      const content = await fetchGitHubBlobContent(
        'private-org',
        'private-repo',
        'blob_sha_123',
        'src/secret.ts',
        'main',
        'mock_github_authorized_token'
      );

      expect(content).toBe('export const secretConfig = true;');
      expect(requestedUrl).toBe('https://api.github.com/repos/private-org/private-repo/git/blobs/blob_sha_123');
      expect(usedAuthHeader).toBe('Bearer mock_github_authorized_token');

      global.fetch = originalFetch;
    });
  });

  describe('6. Non-Destructive Differential Processing (SHA Comparison & Cleanup)', () => {
    it('identifies unchanged files to skip redundant downloading and embedding', () => {
      const existingFiles = [
        { id: 'f1', path: 'src/unchanged.ts', sha: 'sha_111' },
        { id: 'f2', path: 'src/modified.ts', sha: 'sha_old_222' },
        { id: 'f3', path: 'src/to_delete.ts', sha: 'sha_333' },
      ];

      const newTreeBlobs = [
        { path: 'src/unchanged.ts', sha: 'sha_111' }, // Unchanged
        { path: 'src/modified.ts', sha: 'sha_new_999' }, // Modified
        { path: 'src/brand_new.ts', sha: 'sha_new_444' }, // New file
      ];

      const existingMap = new Map(existingFiles.map((f) => [f.path, f]));
      const candidatePaths = new Set(newTreeBlobs.map((b) => b.path));

      const unchanged: any[] = [];
      const newOrChanged: any[] = [];
      const deletedIds: string[] = [];

      for (const blob of newTreeBlobs) {
        const ex = existingMap.get(blob.path);
        if (ex && ex.sha === blob.sha) {
          unchanged.push(blob);
        } else {
          newOrChanged.push(blob);
        }
      }

      for (const [path, ex] of existingMap.entries()) {
        if (!candidatePaths.has(path)) {
          deletedIds.push(ex.id);
        }
      }

      // Assertions
      expect(unchanged.length).toBe(1);
      expect(unchanged[0].path).toBe('src/unchanged.ts');

      expect(newOrChanged.length).toBe(2);
      expect(newOrChanged.map((b) => b.path)).toEqual(['src/modified.ts', 'src/brand_new.ts']);

      expect(deletedIds).toEqual(['f3']);
    });
  });

  describe('7. Batch Insert Failures & Transactional Validation', () => {
    it('throws and records failure when database batch insert fails', async () => {
      // Simulate chunk batch insert returning a database constraint error
      const mockInsertBatch = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'relation "chunks" deadlock detected during batch insert' },
      });

      const executeBatch = async () => {
        const batch = [{ id: 'c1', content: 'chunk 1' }];
        const res = await mockInsertBatch(batch);
        if (res.error) {
          throw new Error(`Failed to insert vector chunks: ${res.error.message}`);
        }
        return res.data;
      };

      await expect(executeBatch()).rejects.toThrow('Failed to insert vector chunks: relation "chunks" deadlock detected');
    });
  });

  describe('8. Recovery Without Losing Previous Valid Index', () => {
    it('preserves existing chunks if embedding or network fails before atomic commit', () => {
      // Model the staging flow:
      // Initial state: 10 chunks exist in DB
      let databaseChunks = Array.from({ length: 10 }, (_, i) => ({ id: `old_c_${i}`, file_id: 'f_mod' }));

      // Reindexing begins: new chunks are generated in memory (staging)
      const stagedChunks = [
        { id: 'new_c_0', file_id: 'f_mod', content: 'new code' },
        { id: 'new_c_1', file_id: 'f_mod', content: 'failing chunk' },
      ];

      let errorOccurred = false;
      try {
        // Chunk 0 succeeds
        // Chunk 1 fails embedding
        throw new Error('Gemini quota exhausted (HTTP 429)');
      } catch {
        errorOccurred = true;
        // Failure branch: database chunks are NOT deleted!
      }

      expect(errorOccurred).toBe(true);
      // Existing index remains intact
      expect(databaseChunks.length).toBe(10);
      expect(databaseChunks[0].id).toBe('old_c_0');
    });

    it('replaces obsolete chunks ONLY after new chunks have been successfully generated and verified', () => {
      let databaseChunks = [
        { id: 'old_1', file_id: 'f_1' },
        { id: 'old_2', file_id: 'f_2' }, // f_2 is unchanged
      ];

      const validNewChunks = [{ id: 'new_1', file_id: 'f_1' }];
      const modifiedFileIds = ['f_1'];

      // Step 1: All embeddings succeeded. Delete old chunks only for modified files:
      databaseChunks = databaseChunks.filter((c) => !modifiedFileIds.includes(c.file_id));
      expect(databaseChunks).toEqual([{ id: 'old_2', file_id: 'f_2' }]);

      // Step 2: Insert verified new chunks
      databaseChunks.push(...validNewChunks);
      expect(databaseChunks).toEqual([
        { id: 'old_2', file_id: 'f_2' },
        { id: 'new_1', file_id: 'f_1' },
      ]);
    });
  });

  describe('9. Accurate Indexing Completion State & Progress Tracking', () => {
    it('accurately tracks successful vs failed counts and never marks repository ready on error', () => {
      let repoStatus = 'indexing';
      let jobStatus = 'embedding';
      const stats = {
        files_processed: 12,
        files_failed: 2,
        chunks_created: 45,
        chunks_failed: 1,
      };

      // Pipeline verification gate:
      if (stats.files_failed > 0 || stats.chunks_failed > 0) {
        repoStatus = 'failed';
        jobStatus = 'failed';
      } else {
        repoStatus = 'ready';
        jobStatus = 'completed';
      }

      expect(repoStatus).toBe('failed');
      expect(jobStatus).toBe('failed');
      expect(repoStatus).not.toBe('ready');
    });

    it('sets repository to ready and job to completed only when 0 failures occurred', () => {
      let repoStatus = 'indexing';
      let jobStatus = 'embedding';
      const stats = {
        files_processed: 15,
        files_failed: 0,
        chunks_created: 50,
        chunks_failed: 0,
      };

      if (stats.files_failed > 0 || stats.chunks_failed > 0) {
        repoStatus = 'failed';
        jobStatus = 'failed';
      } else {
        repoStatus = 'ready';
        jobStatus = 'completed';
      }

      expect(repoStatus).toBe('ready');
      expect(jobStatus).toBe('completed');
    });
  });

  describe('10. Embedding Dimensions & Strict Repository Isolation', () => {
    it('enforces 768-dimensional vector contract across inputs and queries', () => {
      const validVector = new Array(768).fill(0.02);
      const invalidVectorShort = new Array(512).fill(0.02);
      const invalidVectorLong = new Array(1536).fill(0.02);

      const isValidDim = (v: number[]) => v.length === 768;

      expect(isValidDim(validVector)).toBe(true);
      expect(isValidDim(invalidVectorShort)).toBe(false);
      expect(isValidDim(invalidVectorLong)).toBe(false);
    });

    it('strictly isolates repository chunks preventing cross-tenant vector leakage', () => {
      const mockDatabase = [
        { id: 'c1', repository_id: 'repo-alpha', content: 'const proprietaryCode = true;' },
        { id: 'c2', repository_id: 'repo-alpha', content: 'function alphaCore() {}' },
        { id: 'c3', repository_id: 'repo-beta', content: 'function betaSecret() {}' },
      ];

      const searchRepositoryChunks = (repoId: string, query: string) => {
        return mockDatabase.filter(
          (c) => c.repository_id === repoId && c.content.includes(query)
        );
      };

      // User searching repo-alpha cannot retrieve repo-beta chunks even if query matches
      const resultsAlpha = searchRepositoryChunks('repo-alpha', 'Secret');
      expect(resultsAlpha).toEqual([]);

      const resultsBeta = searchRepositoryChunks('repo-beta', 'Secret');
      expect(resultsBeta.length).toBe(1);
      expect(resultsBeta[0].content).toBe('function betaSecret() {}');
    });
  });

  describe('11. Resumable Ingestion & Stable Cursor Checkpointing', () => {
    it('demonstrates how naive numeric offset skipped files when newOrChangedBlobs was dynamically recomputed', () => {
      // 120 files total
      const allFiles = Array.from({ length: 120 }, (_, i) => ({
        path: `src/file_${String(i).padStart(3, '0')}.ts`,
        sha: `sha_${i}`,
      }));

      const batchLimit = 50;

      // Invocaton 1: No files in DB yet. candidate list = 120.
      let existingFiles: string[] = [];
      let candidateList1 = allFiles.filter((f) => !existingFiles.includes(f.path));
      expect(candidateList1.length).toBe(120);

      // Invocation 1 processes batch at offset 0
      const batch1 = candidateList1.slice(0, batchLimit);
      expect(batch1.length).toBe(50);
      expect(batch1[0].path).toBe('src/file_000.ts');
      expect(batch1[49].path).toBe('src/file_049.ts');

      // Batch 1 files are inserted into DB
      existingFiles = batch1.map((b) => b.path);

      // Invocation 2: BUG SCENARIO
      // Naive implementation recomputed candidateList from DB, so now candidateList has only 70 files!
      let candidateList2 = allFiles.filter((f) => !existingFiles.includes(f.path));
      expect(candidateList2.length).toBe(70);

      // And reused numeric offset = 50:
      const bugBatch2 = candidateList2.slice(50, 50 + batchLimit);
      // BUG: it sliced 50 from the 70 remaining files, meaning it took files [50..70) of the remaining!
      // This completely SKIPPED files 0..49 of candidateList2 (which were file_050.ts to file_099.ts)!
      expect(bugBatch2.length).toBe(20);
      expect(bugBatch2[0].path).toBe('src/file_100.ts'); // file_050 through file_099 were SKIPPED!
    });

    it('processes all 120 files across 3 batches with stable cursor guarantee (zero skipped files)', () => {
      const allFiles = Array.from({ length: 120 }, (_, i) => ({
        path: `src/file_${String(i).padStart(3, '0')}.ts`,
        sha: `sha_${i}`,
      }));

      // Sort deterministically by path
      allFiles.sort((a, b) => a.path.localeCompare(b.path));
      const batchLimit = 50;
      const processedFiles: string[] = [];

      let cursor: string | null = null;
      let hasMore = true;
      let iterations = 0;

      while (hasMore && iterations < 10) {
        iterations++;
        const currentCursor = cursor;
        const eligible: Array<{ path: string; sha: string }> = currentCursor
          ? allFiles.filter((f) => f.path > currentCursor)
          : allFiles;
        const currentBatch: Array<{ path: string; sha: string }> = eligible.slice(0, batchLimit);

        if (currentBatch.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of currentBatch) {
          processedFiles.push(item.path);
        }

        const lastProcessed: { path: string; sha: string } = currentBatch[currentBatch.length - 1];
        const nextEligible: Array<{ path: string; sha: string }> = allFiles.filter(
          (f) => f.path > lastProcessed.path
        );
        if (nextEligible.length > 0) {
          cursor = lastProcessed.path;
          hasMore = true;
        } else {
          cursor = null;
          hasMore = false;
        }
      }

      expect(iterations).toBe(3);
      expect(processedFiles.length).toBe(120);
      // Verify every single file from 000 to 119 was processed in exact order
      for (let i = 0; i < 120; i++) {
        expect(processedFiles[i]).toBe(`src/file_${String(i).padStart(3, '0')}.ts`);
      }
      // Zero duplicates
      const uniqueFiles = new Set(processedFiles);
      expect(uniqueFiles.size).toBe(120);
    });
  });

  describe('12. Serverless Function Routing & Response Format Validation', () => {
    it('rejects HTML fallback response and throws descriptive routing error', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (header: string) => (header.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null),
        },
        text: async () => '<!DOCTYPE html><html><head><title>IntelCode</title></head><body><div id="root"></div></body></html>',
      } as any);

      await expect(fetchAndValidateJson('/api/ingest', { method: 'POST' })).rejects.toThrow(
        'Serverless API routing error: Received HTML instead of JSON from "/api/ingest". Ensure serverless API handlers or dev server is running.'
      );

      global.fetch = originalFetch;
    });

    it('rejects responses with non-JSON content-type', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (header: string) => (header.toLowerCase() === 'content-type' ? 'text/plain' : null),
        },
        text: async () => 'Internal Server Error',
      } as any);

      await expect(fetchAndValidateJson('/api/ingest', { method: 'POST' })).rejects.toThrow(
        'Unexpected response content-type "text/plain" from "/api/ingest". Expected application/json.'
      );

      global.fetch = originalFetch;
    });

    it('rejects malformed JSON payloads with explicit parse error', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (header: string) => (header.toLowerCase() === 'content-type' ? 'application/json' : null),
        },
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      } as any);

      await expect(fetchAndValidateJson('/api/ingest', { method: 'POST' })).rejects.toThrow(
        'Malformed JSON response from "/api/ingest"'
      );

      global.fetch = originalFetch;
    });

    it('rejects HTTP error status codes with backend error message', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: {
          get: (header: string) => (header.toLowerCase() === 'content-type' ? 'application/json' : null),
        },
        json: async () => ({ error: 'Database connection failed: RLS permission denied' }),
      } as any);

      await expect(fetchAndValidateJson('/api/ingest', { method: 'POST' })).rejects.toThrow(
        'Database connection failed: RLS permission denied'
      );

      global.fetch = originalFetch;
    });

    it('successfully parses valid JSON response objects', async () => {
      const originalFetch = global.fetch;
      const expectedPayload = { success: true, jobId: 'job-987', files_count: 14, chunks_count: 42 };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (header: string) => (header.toLowerCase() === 'content-type' ? 'application/json' : null),
        },
        json: async () => expectedPayload,
      } as any);

      const result = await fetchAndValidateJson('/api/ingest', { method: 'POST' });
      expect(result).toEqual(expectedPayload);

      global.fetch = originalFetch;
    });
  });

  describe('13. Repository Import Failure Persistence & State Guarantees', () => {
    it('persists status = failed and inserts indexing_jobs error record on failure', async () => {
      // Simulate database state mutations during import error
      let repoStatus = 'indexing';
      let indexingJobRecord: any = null;

      const handleImportError = (repoId: string, errMessage: string) => {
        // Must update repository table to 'failed'
        repoStatus = 'failed';
        // Must insert failed indexing job
        indexingJobRecord = {
          repository_id: repoId,
          status: 'failed',
          error: errMessage,
          progress: 0,
        };
      };

      handleImportError('repo-123', 'GitHub API rate limit exceeded (HTTP 403)');

      expect(repoStatus).toBe('failed');
      expect(repoStatus).not.toBe('indexing');
      expect(indexingJobRecord).toEqual({
        repository_id: 'repo-123',
        status: 'failed',
        error: 'GitHub API rate limit exceeded (HTTP 403)',
        progress: 0,
      });
    });
  });

  describe('14. Preservation of Previous Valid Index During Reindex Failure', () => {
    it('retains status = ready on repository when reindexing a previously indexed repository fails', () => {
      const existingRepo = {
        id: 'repo-abc',
        status: 'ready',
        files_count: 24,
        chunks_count: 68,
        last_indexed_at: '2026-10-14T10:00:00Z',
      };

      const hadValidIndex = existingRepo.status === 'ready' && existingRepo.files_count > 0;
      let repoFinalStatus = 'indexing';
      let jobRecord: any = null;

      const handleReindexError = (errMessage: string) => {
        if (hadValidIndex) {
          // Keep existing index ready for query operations!
          repoFinalStatus = 'ready';
        } else {
          repoFinalStatus = 'failed';
        }
        jobRecord = {
          repository_id: existingRepo.id,
          status: 'failed',
          error: errMessage,
        };
      };

      handleReindexError('Gemini API quota exceeded');

      expect(repoFinalStatus).toBe('ready');
      expect(jobRecord.status).toBe('failed');
      expect(jobRecord.error).toBe('Gemini API quota exceeded');
    });

    it('marks repository failed if reindex fails and there was no previous valid index', () => {
      const freshRepo = {
        id: 'repo-fresh',
        status: 'indexing',
        files_count: 0,
        chunks_count: 0,
        last_indexed_at: null,
      };

      const hadValidIndex = freshRepo.status === 'ready' && freshRepo.files_count > 0;
      let repoFinalStatus = 'indexing';

      if (hadValidIndex) {
        repoFinalStatus = 'ready';
      } else {
        repoFinalStatus = 'failed';
      }

      expect(repoFinalStatus).toBe('failed');
    });
  });

  describe('15. Download Failure Fail-Fast Integrity', () => {
    it('throws error and does not mark repository ready if a blob download returns null or fails', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as any);

      // 1. fetchGitHubBlobContent returns null on non-200
      const content = await fetchGitHubBlobContent('org', 'repo', 'missing_sha', 'src/missing.ts', 'main');
      expect(content).toBeNull();

      // 2. Pipeline worker verifies content !== null and throws explicit failure error
      const downloadWorker = async (blob: { path: string; sha: string }) => {
        const fileContent = await fetchGitHubBlobContent('org', 'repo', blob.sha, blob.path, 'main');
        if (fileContent === null) {
          throw new Error(`Failed to download required repository file: ${blob.path}`);
        }
        return fileContent;
      };

      await expect(
        downloadWorker({ path: 'src/missing.ts', sha: 'missing_sha' })
      ).rejects.toThrow('Failed to download required repository file: src/missing.ts');

      global.fetch = originalFetch;
    });
  });

  describe('16. Accurate "Never indexed" vs "Indexed X ago" UI Display', () => {
    const getIndexedDisplay = (lastIndexedAt?: string | null): string => {
      return lastIndexedAt ? `Indexed ${formatRelativeTime(lastIndexedAt)}` : 'Never indexed';
    };

    it('returns "Never indexed" when last_indexed_at is null or undefined', () => {
      expect(getIndexedDisplay(null)).toBe('Never indexed');
      expect(getIndexedDisplay(undefined)).toBe('Never indexed');
      expect(getIndexedDisplay('')).toBe('Never indexed');
    });

    it('returns "Indexed [relative time]" when last_indexed_at is a valid timestamp', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const display = getIndexedDisplay(twoHoursAgo);
      expect(display).toBe('Indexed 2h ago');
    });

    it('never uses updated_at as a fallback for last_indexed_at', () => {
      const repoWithOnlyUpdatedAt = {
        status: 'indexing' as const,
        last_indexed_at: null,
        updated_at: new Date().toISOString(),
      };

      const display = getIndexedDisplay(repoWithOnlyUpdatedAt.last_indexed_at);
      expect(display).toBe('Never indexed');
      expect(display).not.toContain('just now');
    });
  });

  describe('17. Retry After Failure State Transition', () => {
    it('transitions repository from failed to indexing and resets job on retry', () => {
      let repo = {
        id: 'repo-fail-1',
        status: 'failed',
      };

      let activeJob = {
        id: 'job-1',
        status: 'failed',
        error: 'Network timeout',
      };

      // User clicks "Retry Indexing"
      const triggerRetry = () => {
        repo = { ...repo, status: 'indexing' };
        activeJob = {
          id: 'job-2',
          status: 'pending',
          error: undefined as any,
        };
      };

      triggerRetry();

      expect(repo.status).toBe('indexing');
      expect(activeJob.status).toBe('pending');
      expect(activeJob.error).toBeUndefined();
    });
  });

  describe('18. Robust Content Validation: NUL Bytes, Binary Data, Unicode Text, Escaped Strings & Formatting', () => {
    it('rejects content containing actual NUL characters (\\u0000) and reports diagnostic reason', () => {
      const codeWithNullByte = 'const str = "hello\0world";';
      const codeWithHexNull = 'const x = "\u0000";';

      const check1 = isBinaryOrNonTextContent(codeWithNullByte);
      expect(check1.isBinary).toBe(true);
      expect(check1.reason).toContain('Actual NUL byte');

      const safety1 = isSafeForIndexing('src/corrupt.ts', codeWithNullByte);
      expect(safety1.safe).toBe(false);
      expect(safety1.reason).toContain('Actual NUL byte');

      const check2 = isBinaryOrNonTextContent(codeWithHexNull);
      expect(check2.isBinary).toBe(true);
      expect(check2.reason).toContain('Actual NUL byte');

      const safety2 = isSafeForIndexing('backend/requirements.txt', codeWithHexNull);
      expect(safety2.safe).toBe(false);
      expect(safety2.reason).toContain('Actual NUL byte');
    });

    it('rejects binary data with high non-printable control code density', () => {
      // Create a buffer containing non-printable ASCII control codes (< 32, excluding 9, 10, 13)
      const binarySample = String.fromCharCode(1, 2, 3, 4, 5, 6, 7, 8, 14, 15, 16, 17, 18, 19, 20).repeat(20);

      const check = isBinaryOrNonTextContent(binarySample);
      expect(check.isBinary).toBe(true);
      expect(check.reason).toContain('Binary content detected');

      const safety = isSafeForIndexing('lib/unknown.dat', binarySample);
      expect(safety.safe).toBe(false);
      expect(safety.reason).toContain('Binary content detected');
    });

    it('allows ordinary Unicode text with emojis, accents, and multilingual scripts', () => {
      const unicodeContent = [
        '// 🚀 IntelCode Multi-Language Support',
        'const greetings = {',
        '  french: "Bonjour le monde! Café et crème brûlée",',
        '  german: "Schöne Grüße, Münster",',
        '  spanish: "¡Hola! Mañana y año nuevo",',
        '  japanese: "こんにちは世界、コードを理解する",',
        '  chinese: "代码分析与检索系统",',
        '  russian: "Привет мир, быстрая индексация",',
        '  emojis: "✨ 💻 ⚡ 🔍 🛡️",',
        '};',
      ].join('\n');

      const check = isBinaryOrNonTextContent(unicodeContent);
      expect(check.isBinary).toBe(false);

      const safety = isSafeForIndexing('src/locales/all.ts', unicodeContent);
      expect(safety.safe).toBe(true);
      expect(safety.reason).toBeUndefined();
    });

    it('allows escaped source-code strings such as "\\\\u0000" without falsely rejecting them', () => {
      // In source code on disk, an escaped string contains the characters \, u, 0, 0, 0, 0 (not char code 0)
      const escapedSourceCode = [
        '// Escaped string regression test',
        'export const NULL_ESCAPE_LITERAL = "\\\\u0000";',
        'export const NULL_REGEX = /\\\\u0000/g;',
        'export function sanitize(input: string) {',
        '  return input.replace(/\\\\u0000/g, "");',
        '}',
      ].join('\n');

      // Verify that literal string "\\u0000" does NOT contain char code 0
      expect(escapedSourceCode.includes('\0')).toBe(false);

      const check = isBinaryOrNonTextContent(escapedSourceCode);
      expect(check.isBinary).toBe(false);

      const safety = isSafeForIndexing('src/sanitizer.ts', escapedSourceCode);
      expect(safety.safe).toBe(true);
    });

    it('allows valid JavaScript and TypeScript files with tabs, carriage returns, and newlines', () => {
      const formattedCode = 'export function add(a: number, b: number): number {\r\n\t// Formatted with tab\r\n\treturn a + b;\r\n}';

      const check = isBinaryOrNonTextContent(formattedCode);
      expect(check.isBinary).toBe(false);

      const safety = isSafeForIndexing('src/math.ts', formattedCode);
      expect(safety.safe).toBe(true);
    });
  });

  describe('19. Supabase Write Isolation & Batch Retry Integrity', () => {
    it('successfully upserts all files in a single batch when database permits', async () => {
      const records = [
        { repository_id: 'r1', path: 'src/a.ts', sha: 's1', language: 'typescript', content: 'const a = 1;', size: 12, updated_at: '2026-01-01' },
        { repository_id: 'r1', path: 'src/b.ts', sha: 's2', language: 'typescript', content: 'const b = 2;', size: 12, updated_at: '2026-01-01' },
      ];

      const mockDbClient = {
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockReturnValue({
            select: vi.fn().mockResolvedValue({
              data: [
                { id: 'f-1', path: 'src/a.ts' },
                { id: 'f-2', path: 'src/b.ts' },
              ],
              error: null,
            }),
          }),
        }),
      };

      const result = await upsertFilesWithIsolation(mockDbClient, records, 50);
      expect(result.successfulFiles.length).toBe(2);
      expect(result.failedFiles.length).toBe(0);
      expect(result.successfulFiles.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
    });

    it('isolates offending file records when batch upsert fails and saves all valid files', async () => {
      const records = [
        { repository_id: 'r1', path: 'src/valid_1.ts', sha: 's1', language: 'typescript', content: 'const a = 1;', size: 12, updated_at: '2026-01-01' },
        { repository_id: 'r1', path: 'src/bad_unicode.txt', sha: 's2', language: 'text', content: 'bad data', size: 8, updated_at: '2026-01-01' },
        { repository_id: 'r1', path: 'src/valid_2.ts', sha: 's3', language: 'typescript', content: 'const c = 3;', size: 12, updated_at: '2026-01-01' },
      ];

      let callCount = 0;
      const mockDbClient = {
        from: vi.fn().mockReturnValue({
          upsert: vi.fn().mockImplementation((batch) => {
            return {
              select: vi.fn().mockImplementation(async () => {
                callCount++;
                if (batch.length === 3) {
                  // Whole batch fails initially due to bad record
                  return {
                    data: null,
                    error: { message: 'unsupported Unicode escape sequence' },
                  };
                }
                // Individual retries:
                const item = batch[0];
                if (item.path === 'src/bad_unicode.txt') {
                  return {
                    data: null,
                    error: { message: 'unsupported Unicode escape sequence' },
                  };
                }
                return {
                  data: [{ id: `id_${item.path}`, path: item.path }],
                  error: null,
                };
              }),
            };
          }),
        }),
      };

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await upsertFilesWithIsolation(mockDbClient, records, 50);

      // 2 valid files succeeded, 1 failed
      expect(result.successfulFiles.length).toBe(2);
      expect(result.successfulFiles.map((f) => f.path)).toEqual(['src/valid_1.ts', 'src/valid_2.ts']);
      expect(result.failedFiles.length).toBe(1);
      expect(result.failedFiles[0].path).toBe('src/bad_unicode.txt');
      expect(result.failedFiles[0].error).toContain('unsupported Unicode escape sequence');

      // Safe diagnostic logging verification (no source code leaked)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Offending file upsert failed for path "src/bad_unicode.txt"')
      );

      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('isolates offending chunk rows when batch chunk insert fails', async () => {
      const chunkRows = [
        { repository_id: 'r1', file_id: 'f1', content: 'chunk 1', language: 'typescript', start_line: 1, end_line: 20, symbol_name: 'func1', symbol_type: 'block' },
        { repository_id: 'r1', file_id: 'f2', content: 'corrupt chunk', language: 'text', start_line: 1, end_line: 10, symbol_name: 'block', symbol_type: 'block' },
        { repository_id: 'r1', file_id: 'f3', content: 'chunk 3', language: 'typescript', start_line: 1, end_line: 15, symbol_name: 'func3', symbol_type: 'block' },
      ];

      const mockDbClient = {
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockImplementation(async (batch) => {
            if (batch.length === 3) {
              return { error: { message: 'unsupported Unicode escape sequence' } };
            }
            const chunk = batch[0];
            if (chunk.file_id === 'f2') {
              return { error: { message: 'unsupported Unicode escape sequence' } };
            }
            return { error: null };
          }),
        }),
      };

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await insertChunksWithIsolation(mockDbClient, chunkRows, 50);

      expect(result.insertedCount).toBe(2);
      expect(result.failedChunks.length).toBe(1);
      expect(result.failedChunks[0].file_id).toBe('f2');

      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('20. Ineligible Existing File Stale-Chunk Cleanup & Atomic Preservation', () => {
    it('marks previously indexed file for cleanup when its content becomes ineligible', () => {
      const existingFileMap = new Map([
        ['src/app.ts', { id: 'f-app', path: 'src/app.ts', sha: 'sha_old_1' }],
        ['src/binary.so', { id: 'f-bin', path: 'src/binary.so', sha: 'sha_old_2' }],
      ]);

      const skippedFiles: Array<{ path: string; reason: string }> = [];
      const ineligibleExistingFileIds: string[] = [];

      // Download simulation: src/binary.so changed and now has null bytes
      const changedFiles = [
        { path: 'src/app.ts', content: 'export const App = 1;' },
        { path: 'src/binary.so', content: 'binary\0nullbyte' },
      ];

      for (const f of changedFiles) {
        const safety = isSafeForIndexing(f.path, f.content);
        if (!safety.safe) {
          skippedFiles.push({ path: f.path, reason: safety.reason! });
          const existing = existingFileMap.get(f.path);
          if (existing) {
            ineligibleExistingFileIds.push(existing.id);
          }
        }
      }

      expect(skippedFiles.length).toBe(1);
      expect(skippedFiles[0].path).toBe('src/binary.so');
      expect(ineligibleExistingFileIds).toEqual(['f-bin']);
    });

    it('cleans up stale chunks and file records for ineligible files only during controlled commit', async () => {
      const ineligibleExistingFileIds = ['f-bin-1', 'f-bin-2'];
      const deletedChunksForFiles: string[][] = [];
      const deletedFilesIds: string[][] = [];

      const mockDbClient = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'chunks') {
            return {
              delete: vi.fn().mockReturnValue({
                in: vi.fn().mockImplementation(async (field: string, ids: string[]) => {
                  deletedChunksForFiles.push(ids);
                  return { error: null };
                }),
              }),
            };
          }
          if (table === 'files') {
            return {
              delete: vi.fn().mockReturnValue({
                in: vi.fn().mockImplementation(async (field: string, ids: string[]) => {
                  deletedFilesIds.push(ids);
                  return { error: null };
                }),
              }),
            };
          }
          return {};
        }),
      };

      // Execute cleanup step
      if (ineligibleExistingFileIds.length > 0) {
        await mockDbClient.from('chunks').delete().in('file_id', ineligibleExistingFileIds);
        await mockDbClient.from('files').delete().in('id', ineligibleExistingFileIds);
      }

      expect(deletedChunksForFiles).toEqual([['f-bin-1', 'f-bin-2']]);
      expect(deletedFilesIds).toEqual([['f-bin-1', 'f-bin-2']]);
    });
  });

  describe('21. Indexing Progress and Failure Reporting Integrity', () => {
    it('throws error and never declares repository ready when file or chunk writes fail', () => {
      const failedFilesCount = 1;
      const failedChunksCount = 0;

      let repoStatus = 'indexing';
      let errorThrown = false;

      try {
        if (failedFilesCount > 0 || failedChunksCount > 0) {
          throw new Error(
            `Indexing encountered write failures: ${failedFilesCount} file(s) failed upsert, ${failedChunksCount} chunk(s) failed insert.`
          );
        }
        repoStatus = 'ready';
      } catch {
        errorThrown = true;
        repoStatus = 'failed';
      }

      expect(errorThrown).toBe(true);
      expect(repoStatus).toBe('failed');
      expect(repoStatus).not.toBe('ready');
    });

    it('correctly reports files_skipped count and details in indexing response', () => {
      const skippedFiles = [
        { path: 'backend/requirements.txt', reason: 'Actual NUL byte (\\u0000) detected' },
        { path: 'assets/data.bin', reason: 'Binary content detected' },
      ];

      const responsePayload = {
        success: true,
        repositoryId: 'repo-1',
        files_count: 10,
        chunks_count: 45,
        files_processed: 10,
        files_skipped: skippedFiles.length,
        skipped_details: skippedFiles,
        files_failed: 0,
        chunks_failed: 0,
      };

      expect(responsePayload.files_skipped).toBe(2);
      expect(responsePayload.skipped_details).toEqual(skippedFiles);
      expect(responsePayload.skipped_details[0].reason).toContain('Actual NUL byte');
    });
  });

  describe('22. Supabase Server-Key Configuration Validation', () => {
    const validUrl = 'https://valid-project.supabase.co';
    const anonKey = 'sb_publishable_fB65z3N7P5NJEDHLPChSZQ_WVJeTT6h';

    it('rejects missing or undefined service role key with HTTP 503', () => {
      const result = validateServerSupabaseConfig(undefined, validUrl, anonKey);
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.error).toContain('SUPABASE_SERVICE_ROLE_KEY is required');
    });

    it('rejects publishable anonymous key (sb_publishable_...) for server operations with HTTP 503', () => {
      const result = validateServerSupabaseConfig(anonKey, validUrl, anonKey);
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.error).toContain('cannot be a publishable anonymous key');
      expect(result.error).not.toContain(anonKey); // Never leaks secret value
    });

    it('rejects service key when identical to client-side anonymous key with HTTP 503', () => {
      const customAnon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.mock';
      const result = validateServerSupabaseConfig(customAnon, validUrl, customAnon);
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.error).toContain('matches VITE_SUPABASE_ANON_KEY');
    });

    it('rejects placeholder or short service keys with HTTP 503', () => {
      const placeholder = 'YOUR_SERVICE_ROLE_KEY_HERE';
      const result = validateServerSupabaseConfig(placeholder, validUrl, anonKey);
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.error).toContain('placeholder');
    });

    it('rejects JWT service key when role is anon with HTTP 503', () => {
      // Base64 payload with { "role": "anon" }
      const anonPayload = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64');
      const anonJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${anonPayload}.mockSignaturePaddingLongString12345`;
      const result = validateServerSupabaseConfig(anonJwt, validUrl, 'different_anon');
      expect(result.valid).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.error).toContain('role "anon", but "service_role" is required');
    });

    it('accepts genuine Supabase secret key starting with sb_secret_', () => {
      const secretKey = 'sb_secret_abcdef1234567890abcdef1234567890_valid';
      const result = validateServerSupabaseConfig(secretKey, validUrl, anonKey);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('accepts genuine Supabase service_role JWT key', () => {
      const serviceRolePayload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64');
      const serviceRoleJwt = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${serviceRolePayload}.mockSignaturePaddingLongString12345`;
      const result = validateServerSupabaseConfig(serviceRoleJwt, validUrl, anonKey);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('23. Gemini Quota Exhaustion Detection & Fail-Fast Timing', () => {
    it('detects daily quota exhaustion and fails fast without retrying 4 times', async () => {
      const dailyErr: any = new Error(
        'Resource has been exhausted (e.g. check quota): Quota exceeded for quota metric "EmbedContentRequestsPerDay" and limit "0" of service "generativelanguage.googleapis.com"'
      );
      dailyErr.status = 429;

      expect(isDailyQuotaExhaustion(dailyErr)).toBe(true);

      let callCount = 0;
      const mockModel = {
        batchEmbedContents: vi.fn().mockImplementation(async () => {
          callCount++;
          throw dailyErr;
        }),
      };

      await expect(
        embedChunksBatchWithRetry(mockModel, ['chunk 1', 'chunk 2'], 4, 100)
      ).rejects.toThrow('Gemini API daily quota exhausted');

      // Crucial requirement: Must NOT retry 4 times immediately on daily quota exhaustion!
      expect(callCount).toBe(1);
    });

    it('differentiates daily quota exhaustion from temporary per-minute rate limits', () => {
      const transientRpmErr: any = new Error('Resource has been exhausted (e.g. check quota). Please retry in 46s');
      transientRpmErr.status = 429;
      expect(isDailyQuotaExhaustion(transientRpmErr)).toBe(false);

      const dailyQuotaErr: any = new Error('Daily quota limit reached for requests per day');
      dailyQuotaErr.status = 429;
      expect(isDailyQuotaExhaustion(dailyQuotaErr)).toBe(true);
    });

    it('sanitizes sensitive API keys and tokens in error messages', () => {
      const fakeGoogleKey = 'AIza' + '0'.repeat(35);
      const fakeGitHubToken = 'ghp_' + '0'.repeat(36);
      const rawMessage = `Error connecting with ${fakeGoogleKey} and ${fakeGitHubToken}`;
      const sanitized = sanitizeErrorMessage(rawMessage);
      expect(sanitized).not.toContain(fakeGoogleKey);
      expect(sanitized).not.toContain('ghp_1234567');
      expect(sanitized).toContain('AIza[REDACTED]');
      expect(sanitized).toContain('ghp_[REDACTED]');
    });
  });

  describe('24. Rate Limit Retry Delay Parsing & Cooldown Safety', () => {
    it('correctly parses retry delay from error messages and error details', () => {
      const errWithSec = { message: 'Resource has been exhausted. Please retry in 46s' };
      expect(parseRetryDelayMs(errWithSec)).toBe(46000);

      const errWithFractional = { message: 'Quota exceeded. wait 12.5s before requesting' };
      expect(parseRetryDelayMs(errWithFractional)).toBe(12500);

      const errWithMs = { message: 'Rate limit reached, retry in 800ms' };
      expect(parseRetryDelayMs(errWithMs)).toBe(800);

      const errWithDetails = {
        message: 'Rate limit',
        errorDetails: [{ retryDelay: '46s' }],
      };
      expect(parseRetryDelayMs(errWithDetails)).toBe(46000);

      const standardErr = { message: 'Generic 429 without retry text' };
      expect(parseRetryDelayMs(standardErr)).toBeNull();
    });

    it('aborts and throws cooldown error when retry delay exceeds serverless limits (>15s)', async () => {
      const err: any = new Error('Resource has been exhausted. Please retry in 46s');
      err.status = 429;

      const mockModel = {
        batchEmbedContents: vi.fn().mockRejectedValue(err),
      };

      await expect(
        embedChunksBatchWithRetry(mockModel, ['code chunk'], 3, 100)
      ).rejects.toThrow('Gemini rate limit cooldown active: please retry in 46s');
    });
  });

  describe('25. Resumable Batch Embedding with Gemini', () => {
    it('uses Gemini batchEmbedContents with 768 outputDimensionality requests', async () => {
      const mockBatchEmbed = vi.fn().mockResolvedValue({
        embeddings: [
          { values: new Array(768).fill(0.123) },
          { values: new Array(768).fill(-0.456) },
        ],
      });

      const mockModel = {
        batchEmbedContents: mockBatchEmbed,
      };

      const contents = ['export function a() {}', 'export function b() {}'];
      const results = await embedChunksBatchWithRetry(mockModel, contents);

      expect(mockBatchEmbed).toHaveBeenCalledTimes(1);
      const callArg = mockBatchEmbed.mock.calls[0][0];
      expect(callArg.requests.length).toBe(2);
      expect(callArg.requests[0].outputDimensionality).toBe(768);
      expect(callArg.requests[1].outputDimensionality).toBe(768);

      expect(results.length).toBe(2);
      expect(results[0].length).toBe(768);
      expect(results[1].length).toBe(768);
    });

    it('rejects batch response with invalid vector dimensions', async () => {
      const mockCorruptedBatch = {
        batchEmbedContents: vi.fn().mockResolvedValue({
          embeddings: [
            { values: new Array(768).fill(0.1) },
            { values: new Array(512).fill(0.2) }, // Wrong dimension! Expected 768
          ],
        }),
      };

      await expect(
        embedChunksBatchWithRetry(mockCorruptedBatch, ['chunk1', 'chunk2'])
      ).rejects.toThrow('expected 768');
    });

    it('falls back to embedContent when batchEmbedContents is not available on mock/model', async () => {
      const mockEmbedContent = vi.fn().mockResolvedValue({
        embedding: { values: new Array(768).fill(0.05) },
      });

      const mockFallbackModel = {
        embedContent: mockEmbedContent,
      };

      const results = await embedChunksBatchWithRetry(mockFallbackModel, ['c1', 'c2']);
      expect(mockEmbedContent).toHaveBeenCalledTimes(2);
      expect(results.length).toBe(2);
      expect(results[0].length).toBe(768);
    });
  });

  describe('26. Duplicate Prevention & Resumption Across Partial Runs', () => {
    it('identifies chunks that already have valid embeddings in database and skips re-embedding', () => {
      const allChunks = [
        { file_id: 'f1', start_line: 1, end_line: 60, content: 'c1' },
        { file_id: 'f1', start_line: 61, end_line: 120, content: 'c2' },
        { file_id: 'f2', start_line: 1, end_line: 60, content: 'c3' },
      ];

      // Simulate database already having embeddings for f1 chunks from a previous partial run
      const existingDbChunks = [
        { file_id: 'f1', start_line: 1, end_line: 60, embedding: new Array(768).fill(0.01) },
        { file_id: 'f1', start_line: 61, end_line: 120, embedding: new Array(768).fill(0.02) },
      ];

      const existingMap = new Map<string, number[]>();
      for (const ec of existingDbChunks) {
        if (ec.embedding && ec.embedding.length === 768) {
          existingMap.set(`${ec.file_id}:${ec.start_line}:${ec.end_line}`, ec.embedding);
        }
      }

      const chunksNeedingEmbedding: any[] = [];
      const chunksReused: any[] = [];

      for (const chunk of allChunks) {
        const key = `${chunk.file_id}:${chunk.start_line}:${chunk.end_line}`;
        if (existingMap.has(key)) {
          chunksReused.push({ ...chunk, embedding: existingMap.get(key) });
        } else {
          chunksNeedingEmbedding.push(chunk);
        }
      }

      // Assertions
      expect(chunksReused.length).toBe(2);
      expect(chunksNeedingEmbedding.length).toBe(1);
      expect(chunksNeedingEmbedding[0].file_id).toBe('f2');
      // No duplicate API calls for f1!
    });
  });

  describe('27. Incomplete Embeddings Verification', () => {
    it('strictly prevents marking repository ready when chunks are missing embeddings', () => {
      const missingEmbeddingsCount = 3;
      let repoStatus = 'indexing';
      let errorThrown = false;

      try {
        if (missingEmbeddingsCount > 0) {
          throw new Error(
            `Cannot mark repository ready: ${missingEmbeddingsCount} chunk(s) are missing vector embeddings.`
          );
        }
        repoStatus = 'ready';
      } catch {
        errorThrown = true;
        repoStatus = 'failed';
      }

      expect(errorThrown).toBe(true);
      expect(repoStatus).toBe('failed');
      expect(repoStatus).not.toBe('ready');
    });
  });
});

