import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// State container for mock Supabase database
interface DbState {
  repositories: any[];
  repository_members: any[];
  indexing_jobs: any[];
  files: any[];
  chunks: any[];
  github_connections: any[];
  commits: any[];
  pull_requests: any[];
  issues: any[];
}

let dbState: DbState;
let mockGeminiBatchEmbedFn: any;
let mockGeminiEmbedContentFn: any;
let mockGitHubFetchFn: any;

function createMockTableQuery(table: keyof DbState) {
  const filters: Array<(row: any) => boolean> = [];
  let isCountHead = false;
  let isCountExact = false;
  let limitCount: number | null = null;
  let sortField: string | null = null;
  let sortAsc = true;
  let operation: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  let operationData: any = null;
  let operationOpts: any = null;

  const builder: any = {
    select(_fields = '*', opts?: { count?: string; head?: boolean }) {
      if (operation === 'select') {
        if (opts?.count === 'exact') isCountExact = true;
        if (opts?.head) isCountHead = true;
      }
      return builder;
    },
    eq(field: string, val: any) {
      filters.push((row) => row[field] === val);
      return builder;
    },
    in(field: string, vals: any[]) {
      filters.push((row) => vals.includes(row[field]));
      return builder;
    },
    is(field: string, val: any) {
      filters.push((row) => row[field] === val);
      return builder;
    },
    order(field: string, opts?: { ascending?: boolean }) {
      sortField = field;
      sortAsc = opts?.ascending !== false;
      return builder;
    },
    limit(n: number) {
      limitCount = n;
      return builder;
    },
    insert(rows: any | any[]) {
      operation = 'insert';
      operationData = rows;
      return builder;
    },
    upsert(rows: any | any[], opts?: { onConflict?: string }) {
      operation = 'upsert';
      operationData = rows;
      operationOpts = opts;
      return builder;
    },
    update(updates: any) {
      operation = 'update';
      operationData = updates;
      return builder;
    },
    delete() {
      operation = 'delete';
      return builder;
    },
    async single() {
      const res = await builder.execute();
      if (res.error) return { data: null, error: res.error };
      if (!res.data || res.data.length === 0) return { data: null, error: new Error('No rows found') };
      return { data: res.data[0], error: null };
    },
    async maybeSingle() {
      const res = await builder.execute();
      if (res.error) return { data: null, error: res.error };
      if (!res.data || res.data.length === 0) return { data: null, error: null };
      return { data: res.data[0], error: null };
    },
    execute() {
      if (operation === 'insert') {
        const toInsert = Array.isArray(operationData) ? operationData : [operationData];
        const inserted = toInsert.map((r: any) => {
          const row = { id: r.id || `id_${Math.random().toString(36).substring(2, 9)}`, ...r };
          dbState[table].push(row);
          return row;
        });
        return { data: inserted, error: null };
      }

      if (operation === 'upsert') {
        const toUpsert = Array.isArray(operationData) ? operationData : [operationData];
        const conflictKeys = operationOpts?.onConflict
          ? operationOpts.onConflict.split(',').map((s: string) => s.trim())
          : ['id'];
        const upserted: any[] = [];
        for (const item of toUpsert) {
          const existingIdx = dbState[table].findIndex((r: any) =>
            conflictKeys.every((k: string) => r[k] === item[k])
          );
          if (existingIdx >= 0) {
            dbState[table][existingIdx] = { ...dbState[table][existingIdx], ...item };
            upserted.push(dbState[table][existingIdx]);
          } else {
            const newRow = {
              id: item.id || `id_${Math.random().toString(36).substring(2, 9)}`,
              ...item,
            };
            dbState[table].push(newRow);
            upserted.push(newRow);
          }
        }
        return { data: upserted, error: null };
      }

      if (operation === 'update') {
        const matched = dbState[table].filter((row: any) => filters.every((fn) => fn(row)));
        for (const row of matched) {
          Object.assign(row, operationData);
        }
        return { data: matched, error: null };
      }

      if (operation === 'delete') {
        dbState[table] = dbState[table].filter((row: any) => !filters.every((fn) => fn(row)));
        return { data: null, error: null };
      }

      // SELECT
      let result = dbState[table].filter((row: any) => filters.every((fn) => fn(row)));
      if (sortField) {
        result = [...result].sort((a: any, b: any) => {
          if (a[sortField!] < b[sortField!]) return sortAsc ? -1 : 1;
          if (a[sortField!] > b[sortField!]) return sortAsc ? 1 : -1;
          return 0;
        });
      }
      if (limitCount !== null) {
        result = result.slice(0, limitCount);
      }
      const count = result.length;
      const data = isCountHead ? null : result;
      return { data, count, error: null };
    },
    then(resolve: any, reject?: any) {
      try {
        const res = builder.execute();
        return resolve(res);
      } catch (err) {
        if (reject) return reject(err);
        throw err;
      }
    },
  };

  return builder;
}

function getMockSupabaseClient() {
  return {
    auth: {
      async getUser(token: string) {
        if (token && token.startsWith('mock-user-token')) {
          return { data: { user: { id: 'test-user-id-123' } }, error: null };
        }
        return { data: { user: null }, error: new Error('Invalid token') };
      },
    },
    from(table: keyof DbState) {
      return createMockTableQuery(table);
    },
  };
}

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: vi.fn(() => getMockSupabaseClient()),
  };
});

// Mock @google/generative-ai
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class MockGoogleGenerativeAI {
      constructor(public apiKey: string) {}
      getGenerativeModel(_opts: any) {
        return {
          batchEmbedContents: (params: any) => mockGeminiBatchEmbedFn(params),
          embedContent: (params: any) => mockGeminiEmbedContentFn(params),
        };
      }
    },
  };
});

// Import the production handler and index version under test
import { handler as ingestHandler, INDEX_VERSION } from '../src/server/ingest';

describe('Production Ingest Handler Integration Tests', () => {
  const origEnv = { ...process.env };
  const origFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset Database State
    dbState = {
      repositories: [
        {
          id: 'repo-100',
          owner: 'intel-org',
          name: 'project-core',
          default_branch: 'main',
          user_id: 'test-user-id-123',
          status: 'indexing',
          files_count: 0,
          chunks_count: 0,
        },
      ],
      repository_members: [],
      indexing_jobs: [],
      files: [],
      chunks: [],
      github_connections: [
        {
          user_id: 'test-user-id-123',
          access_token: 'mock_github_access_token',
        },
      ],
      commits: [],
      pull_requests: [],
      issues: [],
    };

    // Configure Valid Server Environment Variables
    process.env.VITE_SUPABASE_URL = 'https://intel-proj.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_genuine_server_role_key_for_privileged_ops_123';
    process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_genuine_anon_key_for_client_browsers_456';
    process.env.GEMINI_API_KEY = 'mock_gemini_api_key_for_tests';
    process.env.GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
    delete process.env.VOYAGE_API_KEY;

    // Default Mock Gemini Implementation: 768-dimensional embeddings
    mockGeminiBatchEmbedFn = vi.fn(async ({ requests }) => {
      return {
        embeddings: requests.map(() => ({
          values: new Array(768).fill(0.0123),
        })),
      };
    });

    mockGeminiEmbedContentFn = vi.fn(async () => {
      return {
        embedding: {
          values: new Array(768).fill(0.0123),
        },
      };
    });

    // Default Mock GitHub Fetch Implementation
    mockGitHubFetchFn = vi.fn(async (url: string | URL) => {
      const urlStr = url.toString();

      // Tree API
      if (urlStr.includes('/git/trees/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tree: [
              { type: 'blob', path: 'src/index.ts', sha: 'sha_index_v1', size: 120 },
              { type: 'blob', path: 'src/utils.ts', sha: 'sha_utils_v1', size: 80 },
            ],
          }),
        };
      }

      // Blob / Raw content API
      if (urlStr.includes('/git/blobs/') || urlStr.includes('raw.githubusercontent.com')) {
        if (urlStr.includes('sha_index_v1') || urlStr.includes('src/index.ts')) {
          return {
            ok: true,
            status: 200,
            text: async () => `export function main() {\n  return "intelcode-ready";\n}`,
          };
        }
        if (urlStr.includes('sha_utils_v1') || urlStr.includes('src/utils.ts')) {
          return {
            ok: true,
            status: 200,
            text: async () => `export function add(a: number, b: number): number {\n  return a + b;\n}`,
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () => `// file content`,
        };
      }

      // Commits, PRs, Issues
      if (urlStr.includes('/commits') || urlStr.includes('/pulls') || urlStr.includes('/issues')) {
        return {
          ok: true,
          status: 200,
          json: async () => [],
        };
      }

      return {
        ok: false,
        status: 404,
        text: async () => 'Not found',
      };
    });

    globalThis.fetch = mockGitHubFetchFn as any;
  });

  afterEach(() => {
    process.env = { ...origEnv };
    globalThis.fetch = origFetch;
    vi.clearAllMocks();
  });

  function makeEvent(body: any = { repositoryId: 'repo-100' }) {
    return {
      httpMethod: 'POST',
      headers: {
        origin: 'http://localhost:5173',
        authorization: 'Bearer mock-user-token-valid-jwt',
      },
      body: JSON.stringify(body),
    };
  }

  // 1. Successful initial indexing
  it('1. Successfully executes initial repository indexing with code-aware chunks and 768-d embeddings', async () => {
    const event = makeEvent({ repositoryId: 'repo-100' });
    const response = await ingestHandler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.files_count).toBe(2);
    expect(body.chunks_count).toBeGreaterThan(0);

    // Verify Repository state in Database
    const repo = dbState.repositories.find((r) => r.id === 'repo-100');
    expect(repo.status).toBe('ready');
    expect(repo.files_count).toBe(2);
    expect(repo.chunks_count).toBeGreaterThan(0);
    expect(repo.last_indexed_at).toBeDefined();

    // Verify Indexing Job in Database
    const job = dbState.indexing_jobs[0];
    expect(job).toBeDefined();
    expect(job.status).toBe('completed');
    expect(job.progress).toBe(100);

    // Verify Files in Database have indexed Git SHA
    const files = dbState.files.filter((f) => f.repository_id === 'repo-100');
    expect(files.length).toBe(2);
    expect(files.find((f) => f.path === 'src/index.ts')?.sha).toBe('sha_index_v1');
    expect(files.find((f) => f.path === 'src/utils.ts')?.sha).toBe('sha_utils_v1');

    // Verify Chunks have 768-d embeddings and code-aware metadata
    const chunks = dbState.chunks.filter((c) => c.repository_id === 'repo-100');
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.embedding).toHaveLength(768);
      expect(chunk.metadata?.index_version).toBe(INDEX_VERSION);
    }
  });

  // 2. Failure midway through embedding
  it('2. Safely handles general failure midway through embedding without false ready state or corrupted index', async () => {
    // Fail during embedding
    mockGeminiBatchEmbedFn.mockRejectedValueOnce(new Error('Internal Gemini API network disconnection'));

    const event = makeEvent({ repositoryId: 'repo-100' });
    const response = await ingestHandler(event);

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Internal Gemini API network disconnection');

    // Repository must NOT be marked ready
    const repo = dbState.repositories.find((r) => r.id === 'repo-100');
    expect(repo.status).toBe('failed');
    expect(repo.status).not.toBe('ready');

    // Job must be failed
    const job = dbState.indexing_jobs[0];
    expect(job.status).toBe('failed');

    // Files must NOT have indexed SHA committed
    const filesWithSha = dbState.files.filter((f) => f.sha !== null);
    expect(filesWithSha.length).toBe(0);
  });

  // 3. Daily quota exhaustion and safe pause
  it('3. Detects daily quota exhaustion, fails fast without 4 retries, and safely pauses with checkpoint', async () => {
    const dailyQuotaErr: any = new Error(
      'Resource has been exhausted (e.g. check quota). GenerateContent/EmbedContent per day quota exceeded for project'
    );
    dailyQuotaErr.status = 429;
    mockGeminiBatchEmbedFn.mockRejectedValue(dailyQuotaErr);

    const event = makeEvent({ repositoryId: 'repo-100' });
    const response = await ingestHandler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.paused).toBe(true);
    expect(body.quota_exhausted).toBe(true);
    expect(body.can_resume).toBe(true);
    expect(body.message).toContain('daily quota reached');

    // Check Job status in DB is paused with checkpoint
    const job = dbState.indexing_jobs[0];
    expect(job.status).toBe('paused');
    expect(job.error).toContain('Gemini API daily quota exhausted');

    // Function failed fast: batchEmbedContents called only once (not repeated 4 times)
    expect(mockGeminiBatchEmbedFn).toHaveBeenCalledTimes(1);
  });

  // 4. Retry after quota reset
  it('4. Resumes after quota reset without duplicate Gemini API calls for already-embedded chunks', async () => {
    // Pre-seed Database: File 1 already has verified chunks with embeddings from prior run
    const file1Id = 'file_idx_1';
    dbState.files.push({
      id: file1Id,
      repository_id: 'repo-100',
      path: 'src/index.ts',
      sha: null, // sha is null until all chunks are complete
      language: 'typescript',
      content: 'export function main() {\n  return "intelcode-ready";\n}',
      size: 120,
    });

    dbState.chunks.push({
      id: 'chunk_idx_1',
      repository_id: 'repo-100',
      file_id: file1Id,
      start_line: 1,
      end_line: 3,
      content: 'export function main() {\n  return "intelcode-ready";\n}',
      language: 'typescript',
      symbol_name: 'main',
      symbol_type: 'function',
      metadata: { index_version: INDEX_VERSION, total_chunks: 1, chunk_index: 0 },
      embedding: new Array(768).fill(0.05), // already embedded!
    });

    const event = makeEvent({ repositoryId: 'repo-100' });
    const response = await ingestHandler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);

    // Verify Gemini was called ONLY for src/utils.ts, NOT for the already-embedded src/index.ts chunk!
    expect(mockGeminiBatchEmbedFn).toHaveBeenCalledTimes(1);
    const callArg = mockGeminiBatchEmbedFn.mock.calls[0][0];
    // Only 1 chunk needed embedding
    expect(callArg.requests.length).toBe(1);
    expect(callArg.requests[0].content.parts[0].text).toContain('export function add');

    // Final state is ready
    const repo = dbState.repositories.find((r) => r.id === 'repo-100');
    expect(repo.status).toBe('ready');
  });

  // 5. A file whose SHA matches but whose chunks are missing
  it('5. Detects and re-indexes a file whose SHA matches but whose chunk rows are missing', async () => {
    // Pre-seed Database: src/index.ts has matching SHA in files table, but 0 chunk rows exist
    dbState.files.push({
      id: 'file_idx_corrupted',
      repository_id: 'repo-100',
      path: 'src/index.ts',
      sha: 'sha_index_v1', // SHA matches GitHub tree!
      language: 'typescript',
      content: 'export function main() {\n  return "intelcode-ready";\n}',
      size: 120,
    });
    // NOTICE: dbState.chunks is empty! Missing chunks must NOT be skipped!

    const event = makeEvent({ repositoryId: 'repo-100' });
    const response = await ingestHandler(event);

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);

    // Verify that src/index.ts was NOT skipped: chunks were created and embedded!
    const indexChunks = dbState.chunks.filter((c) => c.content.includes('main'));
    expect(indexChunks.length).toBeGreaterThan(0);
    expect(indexChunks[0].embedding).toHaveLength(768);

    const repo = dbState.repositories.find((r) => r.id === 'repo-100');
    expect(repo.status).toBe('ready');
  });

  // 6. Reindex failure while a previous valid index exists
  it('6. Preserves previous valid chunks when a reindex fails midway', async () => {
    // Pre-seed Database: Repository already indexed with valid file and chunks
    const validFileId = 'file_prev_valid';
    dbState.repositories[0].status = 'ready';
    dbState.repositories[0].files_count = 1;
    dbState.repositories[0].chunks_count = 1;

    dbState.files.push({
      id: validFileId,
      repository_id: 'repo-100',
      path: 'src/index.ts',
      sha: 'sha_old_v0',
      language: 'typescript',
      content: 'export const old = 1;',
      size: 25,
    });

    const previousChunkId = 'chunk_prev_valid_1';
    dbState.chunks.push({
      id: previousChunkId,
      repository_id: 'repo-100',
      file_id: validFileId,
      start_line: 1,
      end_line: 1,
      content: 'export const old = 1;',
      language: 'typescript',
      symbol_name: 'old',
      symbol_type: 'block',
      metadata: { index_version: INDEX_VERSION, total_chunks: 1, chunk_index: 0 },
      embedding: new Array(768).fill(0.99),
    });

    // Simulate failure during reindex embedding
    mockGeminiBatchEmbedFn.mockRejectedValueOnce(new Error('Quota limit exceeded'));

    const event = makeEvent({ repositoryId: 'repo-100', action: 'reindex' });
    const response = await ingestHandler(event);

    expect(response.statusCode).toBe(500);

    // CRITICAL: Verify that the previous valid chunk was NOT deleted!
    const existingPrevChunk = dbState.chunks.find((c) => c.id === previousChunkId);
    expect(existingPrevChunk).toBeDefined();
    expect(existingPrevChunk?.content).toBe('export const old = 1;');

    // Previous file record was NOT updated with unverified new sha
    const fileRecord = dbState.files.find((f) => f.path === 'src/index.ts');
    expect(fileRecord?.sha).toBe('sha_old_v0');
  });

  // 7. Recovery across multiple batches
  it('7. Handles cursor continuation across multiple batches and defers deleted-file cleanup to final batch', async () => {
    // Add an obsolete deleted file in DB that is NOT in GitHub tree
    const obsoleteFileId = 'file_obsolete_id';
    dbState.files.push({
      id: obsoleteFileId,
      repository_id: 'repo-100',
      path: 'src/obsolete_deleted.ts',
      sha: 'sha_obsolete',
      language: 'typescript',
      size: 50,
    });

    // Run Batch 1: batchLimit = 1
    const eventBatch1 = makeEvent({ repositoryId: 'repo-100', batchLimit: 1 });
    const res1 = await ingestHandler(eventBatch1);

    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.body);
    expect(body1.has_more).toBe(true);
    expect(body1.next_cursor).toBe('src/index.ts');

    // Deleted file cleanup MUST NOT run yet!
    const obsoleteStillPresent = dbState.files.find((f) => f.id === obsoleteFileId);
    expect(obsoleteStillPresent).toBeDefined();

    // Run Batch 2: resume with cursor
    const eventBatch2 = makeEvent({
      repositoryId: 'repo-100',
      batchLimit: 1,
      cursor: body1.next_cursor,
    });
    const res2 = await ingestHandler(eventBatch2);

    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.has_more).toBe(false);
    expect(body2.success).toBe(true);

    // Now on final batch, deleted file was cleaned up!
    const obsoleteAfterFinal = dbState.files.find((f) => f.id === obsoleteFileId);
    expect(obsoleteAfterFinal).toBeUndefined();

    // Repository is ready
    const repo = dbState.repositories.find((r) => r.id === 'repo-100');
    expect(repo.status).toBe('ready');
  });

  // 8. No skipped files, duplicate chunks or false ready state
  it('8. Strictly rejects marking repository ready if any chunk has null embedding or file lacks chunks', async () => {
    // Inject an invalid chunk with null embedding into repository chunks
    dbState.chunks.push({
      id: 'chunk_null_embedding',
      repository_id: 'repo-100',
      file_id: 'other_file_id',
      start_line: 1,
      end_line: 5,
      content: 'un-embedded chunk',
      language: 'typescript',
      symbol_name: 'broken',
      symbol_type: 'block',
      embedding: null, // NULL EMBEDDING!
    });

    const event = makeEvent({ repositoryId: 'repo-100' });
    const response = await ingestHandler(event);

    // Ingestion must fail rather than declaring false ready!
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('missing vector embeddings');

    const repo = dbState.repositories.find((r) => r.id === 'repo-100');
    expect(repo.status).toBe('failed');
    expect(repo.status).not.toBe('ready');
  });

  it('8b. Strictly rejects marking repository ready if an indexed file lacks chunk rows', async () => {
    // Intercept chunk insertion to simulate missing chunk rows for a file
    const origPush = dbState.chunks.push.bind(dbState.chunks);
    dbState.chunks.push = (...items: any[]) => {
      // Omit chunks for src/utils.ts to simulate dropped/missing chunk rows
      const filtered = items.filter((item) => !item.content?.includes('add('));
      return origPush(...filtered);
    };

    const event = makeEvent({ repositoryId: 'repo-100' });
    const response = await ingestHandler(event);

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('missing chunk rows');

    const repo = dbState.repositories.find((r) => r.id === 'repo-100');
    expect(repo.status).toBe('failed');
  });

  // 9. Wrong server key and missing configuration
  it('9. Rejects publishable, identical, or placeholder server keys with 503 error', async () => {
    // 9a. Publishable key used as service role key
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_publishable_not_a_secret_key_12345';
    const resPublishable = await ingestHandler(makeEvent());
    expect(resPublishable.statusCode).toBe(503);
    expect(JSON.parse(resPublishable.body).error).toContain('cannot be a publishable anonymous key');

    // 9b. Service role key matches VITE_SUPABASE_ANON_KEY
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_matching_key_1234567890';
    process.env.VITE_SUPABASE_ANON_KEY = 'sb_secret_matching_key_1234567890';
    const resMatching = await ingestHandler(makeEvent());
    expect(resMatching.statusCode).toBe(503);
    expect(JSON.parse(resMatching.body).error).toContain('matches VITE_SUPABASE_ANON_KEY');

    // 9c. Placeholder key
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'your_supabase_service_role_key_placeholder';
    const resPlaceholder = await ingestHandler(makeEvent());
    expect(resPlaceholder.statusCode).toBe(503);
    expect(JSON.parse(resPlaceholder.body).error).toContain('unconfigured placeholder');
  });
});
