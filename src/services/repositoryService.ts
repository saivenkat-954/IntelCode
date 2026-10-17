import {
  Repository,
  FileItem,
  CodeChunk,
  CommitItem,
  PullRequestItem,
  IssueItem,
  DocumentItem,
  IndexingJob,
} from '@/types';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { extractCodeAwareChunks, isFileIgnored } from '@/services/chunker';

// Designated isolated synthetic demo repository
export const DEMO_REPO_ID = '00000000-demo-repo-0000-000000000001';

const DEMO_BENCHMARK_REPO: Repository = {
  id: DEMO_REPO_ID,
  user_id: '00000000-0000-0000-0000-000000000001',
  github_repo_id: 98451201,
  owner: 'acme-org',
  name: 'intel-gateway',
  full_name: 'acme-org/intel-gateway',
  default_branch: 'main',
  description: 'High-throughput edge API gateway with resilient retry services, JWT auth rotation, and distributed Redis rate limiting (Benchmark dataset).',
  language: 'TypeScript',
  is_private: false,
  files_count: 5,
  chunks_count: 14,
  status: 'ready',
  last_indexed_at: new Date(Date.now() - 3600000 * 2).toISOString(),
  created_at: new Date(Date.now() - 86400000 * 14).toISOString(),
  updated_at: new Date(Date.now() - 3600000 * 2).toISOString(),
};

const DEMO_FILES: FileItem[] = [
  {
    id: 'f-demo-1',
    repository_id: DEMO_REPO_ID,
    path: 'src/payment/retry.ts',
    language: 'typescript',
    sha: '7a81d2f83c1',
    size: 1380,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    content: `import { Logger } from '../utils/logger';
import { PaymentProviderError } from '../errors';

export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  backoffFactor: number;
}

export class RetryService {
  private logger = new Logger('RetryService');
  private defaultOptions: RetryOptions = {
    maxRetries: 3,
    initialDelayMs: 200,
    backoffFactor: 2,
  };

  /**
   * Executes payment transactions with exponential backoff.
   * Handles intermittent 503 Provider Unavailable errors.
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options?: Partial<RetryOptions>
  ): Promise<T> {
    const config = { ...this.defaultOptions, ...options };
    let attempt = 0;
    let delay = config.initialDelayMs;

    while (attempt < config.maxRetries) {
      try {
        attempt++;
        return await operation();
      } catch (err: unknown) {
        const isRetryable = err instanceof PaymentProviderError && err.statusCode === 503;
        if (!isRetryable || attempt >= config.maxRetries) {
          this.logger.error(\`Failed after \${attempt} attempts\`, { error: err });
          throw err;
        }

        this.logger.warn(\`Attempt \${attempt} failed with 503. Retrying in \${delay}ms...\`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= config.backoffFactor;
      }
    }

    throw new Error('Unexpected retry loop termination');
  }
}`,
  },
  {
    id: 'f-demo-2',
    repository_id: DEMO_REPO_ID,
    path: 'src/auth/session.ts',
    language: 'typescript',
    sha: 'c9103a89e1b',
    size: 940,
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 9).toISOString(),
    content: `import { verifyJwt, signJwt } from './jwt';
import { redisClient } from '../config/redis';

export interface SessionPayload {
  userId: string;
  role: string;
  exp: number;
}

/**
 * Handles sliding-window token rotation and blacklisting
 */
export async function refreshToken(currentToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const decoded = await verifyJwt<SessionPayload>(currentToken);
  const isBlacklisted = await redisClient.get(\`blacklist:\${decoded.userId}:\${currentToken}\`);
  
  if (isBlacklisted) {
    throw new Error('Revoked session token detected');
  }

  // Sliding window refresh
  const newAccessToken = signJwt({ userId: decoded.userId, role: decoded.role }, '15m');
  const newRefreshToken = signJwt({ userId: decoded.userId, role: decoded.role }, '7d');

  await redisClient.setex(\`session:\${decoded.userId}\`, 604800, newRefreshToken);
  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}`,
  },
  {
    id: 'f-demo-3',
    repository_id: DEMO_REPO_ID,
    path: 'src/config/redis.ts',
    language: 'typescript',
    sha: 'b249e0112fa',
    size: 420,
    created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    content: `import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});`,
  },
  {
    id: 'f-demo-4',
    repository_id: DEMO_REPO_ID,
    path: 'src/middleware/rate-limiter.ts',
    language: 'typescript',
    sha: 'b249e0112fb',
    size: 850,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    content: `import { redisClient } from '../config/redis';

export async function rateLimitMiddleware(req: any, res: any, next: any) {
  const ip = req.ip || '127.0.0.1';
  const key = \`ratelimit:\${ip}\`;
  
  const current = await redisClient.incr(key);
  if (current === 1) {
    await redisClient.expire(key, 60);
  }
  
  if (current > 100) {
    return res.status(429).json({ error: 'Too many requests. Rate limit exceeded.' });
  }
  next();
}`,
  },
  {
    id: 'f-demo-index',
    repository_id: DEMO_REPO_ID,
    path: 'src/index.ts',
    language: 'typescript',
    sha: 'd1983ba29c1',
    size: 520,
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    content: `import { RetryService } from './payment/retry';
import { rateLimitMiddleware } from './middleware/rate-limiter';
import { refreshToken } from './auth/session';

export const paymentRetry = new RetryService();
export { rateLimitMiddleware, refreshToken };
`,
  },
  {
    id: 'f-demo-5',
    repository_id: DEMO_REPO_ID,
    path: 'README.md',
    language: 'markdown',
    sha: 'f01489e11a',
    size: 1540,
    created_at: new Date(Date.now() - 86400000 * 14).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    content: `# Intel Gateway (Demo Benchmark)

The edge gateway orchestrating microservices across acme-org.

## Key Capabilities
- **Resilient Upstream Retries:** Catches transient HTTP 503 Provider errors with exponential backoff.
- **JWT Session Rotation:** Distributed sliding-window JWT authentication with Redis blacklist support.
- **Distributed Rate Limiting:** Sliding-window token buckets synchronized via Redis clusters.

## Architecture
See \`docs/ARCHITECTURE.md\` for complete component boundaries and telemetry specifications.`,
  },
];

const DEMO_COMMITS: CommitItem[] = [
  {
    id: 'c-demo-1',
    repository_id: DEMO_REPO_ID,
    sha: '7a81d2f',
    message: 'Fix payment retry logic: increase max attempts from 2 to 3',
    author: 'sarah.dev',
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    changed_files: ['src/payment/retry.ts'],
    diff: `--- a/src/payment/retry.ts
+++ b/src/payment/retry.ts
@@ -14,3 +14,3 @@
-    maxRetries: 2,
+    maxRetries: 3,`,
  },
  {
    id: 'c-demo-2',
    repository_id: DEMO_REPO_ID,
    sha: 'b249e01',
    message: 'Introduce Redis distributed rate limiter and connection pooling',
    author: 'alex.chen',
    timestamp: new Date(Date.now() - 86400000 * 5).toISOString(),
    changed_files: ['src/config/redis.ts', 'src/middleware/rate-limiter.ts'],
    diff: `--- /dev/null
+++ b/src/config/redis.ts
@@ -0,0 +1,9 @@
+import Redis from 'ioredis';`,
  },
  {
    id: 'c-demo-3',
    repository_id: DEMO_REPO_ID,
    sha: 'c9103a8',
    message: 'Add sliding window JWT session refresh and revocation blacklist',
    author: 'marcus.eng',
    timestamp: new Date(Date.now() - 86400000 * 9).toISOString(),
    changed_files: ['src/auth/session.ts'],
    diff: `--- a/src/auth/session.ts
+++ b/src/auth/session.ts`,
  },
  {
    id: 'c-demo-4',
    repository_id: DEMO_REPO_ID,
    sha: 'f01489e',
    message: 'Initial service skeleton and HTTP server setup',
    author: 'alex.chen',
    timestamp: new Date(Date.now() - 86400000 * 14).toISOString(),
    changed_files: ['package.json', 'README.md', 'src/index.ts'],
  },
];

const DEMO_PRS: PullRequestItem[] = [
  {
    id: 'pr-demo-184',
    repository_id: DEMO_REPO_ID,
    github_number: 184,
    title: 'Payment retry logic and circuit breaker for upstream 503s',
    description: 'Addresses intermittent 503 responses observed from the payment gateway provider. Wraps calls in RetryService with exponential backoff.',
    author: 'sarah.dev',
    state: 'merged',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    merged_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    diff: `Added RetryService with 3 retries and exponential delay backoff.`,
  },
  {
    id: 'pr-demo-192',
    repository_id: DEMO_REPO_ID,
    github_number: 192,
    title: 'Redis cluster integration for distributed session state',
    description: 'Migrates in-memory session tokens to distributed Redis store to allow multi-replica container scaling.',
    author: 'alex.chen',
    state: 'merged',
    created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    merged_at: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
];

const DEMO_ISSUES: IssueItem[] = [
  {
    id: 'iss-demo-179',
    repository_id: DEMO_REPO_ID,
    github_number: 179,
    title: 'Upstream payment provider returns intermittent 503 errors during traffic spikes',
    body: 'Customers reported checkout failures during high-traffic events. The upstream provider confirmed intermittent 503s requiring retry handling.',
    author: 'sarah.dev',
    state: 'closed',
    labels: ['bug', 'critical', 'payment'],
    created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
    closed_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: 'iss-demo-190',
    repository_id: DEMO_REPO_ID,
    github_number: 190,
    title: 'Token refresh race condition when two requests expire simultaneously',
    body: 'Concurrent client requests triggered dual token rotation, revoking valid sessions.',
    author: 'marcus.eng',
    state: 'closed',
    labels: ['security', 'auth'],
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    closed_at: new Date(Date.now() - 86400000 * 8).toISOString(),
  },
];

const DEMO_DOCS: DocumentItem[] = [
  {
    id: 'doc-demo-1',
    repository_id: DEMO_REPO_ID,
    path: 'docs/ARCHITECTURE.md',
    title: 'Architecture & System Topology',
    created_at: new Date(Date.now() - 86400000 * 12).toISOString(),
    content: `# Intel Gateway Architecture

The gateway serves as the ingress point for client requests across acme-org.

## Core Responsibilities
1. **JWT Authentication & Token Rotation:** Validates signatures and performs atomic refresh via \`src/auth/session.ts\`.
2. **Resilience & Retry Patterns:** Protects downstream consumers by executing payment provider calls through \`RetryService\` (\`src/payment/retry.ts\`) with exponential backoff.
3. **Distributed Rate Limiting:** Enforces quotas with token buckets in Redis (\`src/middleware/rate-limiter.ts\`).

## Resiliency Guarantees
- Retries are ONLY triggered on retryable HTTP 503 statuses.
- Exponential backoff avoids thundering herd problems against provider endpoints.`,
  },
];

/**
 * Fetches an endpoint and validates that it returns a valid JSON response structure.
 * Rejects unexpected HTML fallback or malformed payloads.
 */
export async function fetchAndValidateJson(url: string, options: RequestInit): Promise<any> {
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const rawText = await res.text().catch(() => '');
    const isHtml = rawText.includes('<!DOCTYPE html>') || rawText.includes('<html');
    if (isHtml) {
      throw new Error(
        `Serverless API routing error: Received HTML instead of JSON from "${url}". Ensure serverless API handlers or dev server is running.`
      );
    }
    throw new Error(`Unexpected response content-type "${contentType}" from "${url}". Expected application/json.`);
  }

  let data: any;
  try {
    data = await res.json();
  } catch (err: any) {
    throw new Error(`Malformed JSON response from "${url}": ${err.message}`);
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || `Request failed with HTTP status ${res.status}`;
    const err: any = new Error(errorMsg);
    err.status = res.status;
    err.statusCode = res.status;
    err.data = data;
    throw err;
  }

  if (!data || typeof data !== 'object') {
    throw new Error(`Invalid response structure received from "${url}". Expected an object.`);
  }

  return data;
}

/**
 * Executes an authenticated request to /api/ingest with:
 * 1. Verification of the current Supabase session and access_token in Authorization Bearer.
 * 2. Proactive refresh of expired sessions via Supabase refreshSession().
 * 3. Automatic session refresh and retry at most once if /api/ingest returns HTTP 401.
 * 4. Clear guidance to sign in again if authentication still fails.
 */
export async function postIngestWithSessionRetry(
  payload: any,
  currentToken?: string,
  githubToken?: string | null
): Promise<{ data: any; updatedToken?: string }> {
  let activeToken = currentToken;

  // 1 & 2: Obtain valid session or proactively refresh if expired
  if (!activeToken && isSupabaseConfigured) {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      const nowSec = Math.floor(Date.now() / 1000);
      const isExpired = session?.expires_at ? session.expires_at <= nowSec : false;

      if (isExpired && session?.refresh_token) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
          refresh_token: session.refresh_token,
        });
        if (!refreshError && refreshData?.session?.access_token) {
          activeToken = refreshData.session.access_token;
        }
      } else {
        activeToken = session?.access_token;
      }
    } catch (sessionErr) {
      console.warn('[RepositoryService] Error obtaining session before ingest:', sessionErr);
    }
  }

  if (!activeToken) {
    throw new Error('User authentication session is missing or expired. Please sign in again.');
  }

  const sendRequest = async (token: string) => {
    return await fetchAndValidateJson('/api/ingest', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(githubToken ? { 'x-github-token': githubToken } : {}),
      },
      body: JSON.stringify(payload),
    });
  };

  try {
    const data = await sendRequest(activeToken);
    return { data, updatedToken: activeToken };
  } catch (err: any) {
    const is401 =
      err?.status === 401 ||
      err?.statusCode === 401 ||
      err?.message?.includes('401') ||
      err?.message?.includes('Invalid or expired user authentication session') ||
      err?.message?.includes('Authentication required');

    if (!is401) {
      throw err;
    }

    // Requirement 3: Refresh expired session using Supabase's supported refreshSession() method
    let refreshedToken: string | null = null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentSession = sessionData?.session;
      const refreshResult = currentSession?.refresh_token
        ? await supabase.auth.refreshSession({ refresh_token: currentSession.refresh_token })
        : await supabase.auth.refreshSession();

      if (!refreshResult.error && refreshResult.data?.session?.access_token) {
        refreshedToken = refreshResult.data.session.access_token;
      }
    } catch (refreshErr) {
      console.warn('[RepositoryService] Session refresh on 401 failed:', refreshErr);
    }

    if (!refreshedToken) {
      throw new Error('Your authentication session has expired or is invalid. Please sign in again.');
    }

    // Retry request exactly once with new token
    try {
      const retryData = await sendRequest(refreshedToken);
      return { data: retryData, updatedToken: refreshedToken };
    } catch (retryErr: any) {
      const isRetry401 =
        retryErr?.status === 401 ||
        retryErr?.statusCode === 401 ||
        retryErr?.message?.includes('401') ||
        retryErr?.message?.includes('Invalid or expired user authentication session') ||
        retryErr?.message?.includes('Authentication required');

      if (isRetry401) {
        throw new Error('Authentication session could not be renewed. Please sign in again.');
      }
      throw retryErr;
    }
  }
}


interface CustomDemoStore {
  repo: Repository;
  files: FileItem[];
  chunks: CodeChunk[];
  commits: CommitItem[];
  prs: PullRequestItem[];
  issues: IssueItem[];
}

const CUSTOM_DEMO_STORE = new Map<string, CustomDemoStore>();

const EXT_TO_LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  css: 'css',
  html: 'html',
  json: 'json',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
};

function loadCustomDemoStore(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('intelcode_custom_repos_v1');
    if (raw) {
      const parsed: Record<string, CustomDemoStore> = JSON.parse(raw);
      Object.entries(parsed).forEach(([k, v]) => CUSTOM_DEMO_STORE.set(k, v));
    }
  } catch {
    // Ignore storage parse errors
  }
}

function saveCustomDemoStore(): void {
  if (typeof window === 'undefined') return;
  try {
    const obj: Record<string, CustomDemoStore> = {};
    CUSTOM_DEMO_STORE.forEach((v, k) => {
      obj[k] = v;
    });
    localStorage.setItem('intelcode_custom_repos_v1', JSON.stringify(obj));
  } catch {
    // Ignore storage errors
  }
}

export const repositoryService = {
  /**
   * Retrieves all repositories accessible by the current authenticated user.
   */
  async getRepositories(explicitDemoMode?: boolean): Promise<Repository[]> {
    loadCustomDemoStore();
    const customRepos = Array.from(CUSTOM_DEMO_STORE.values()).map((s) => s.repo);

    const isDemo =
      explicitDemoMode ??
      (typeof window !== 'undefined' && localStorage.getItem('intelcode_demo_mode_active') === 'true');

    if (isDemo) {
      return [DEMO_BENCHMARK_REPO, ...customRepos];
    }

    if (!isSupabaseConfigured) {
      return customRepos;
    }

    const { data, error } = await supabase
      .from('repositories')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205') {
        console.warn('Repositories table not found in schema cache. Database migration pending.');
        return customRepos;
      }
      console.error('Failed to load repositories from database:', error);
      throw new Error(`Failed to load repositories: ${error.message}`);
    }

    return [...((data as Repository[]) || []), ...customRepos];
  },

  /**
   * Retrieves a specific repository by UUID.
   * Returns null if not found. NEVER substitutes another repository!
   */
  async getRepository(id: string, isDemoMode = false): Promise<Repository | null> {
    loadCustomDemoStore();
    if (CUSTOM_DEMO_STORE.has(id)) {
      return CUSTOM_DEMO_STORE.get(id)!.repo;
    }

    if (id === DEMO_REPO_ID || (isDemoMode && id === 'demo')) {
      return DEMO_BENCHMARK_REPO;
    }

    if (!isSupabaseConfigured) {
      return null;
    }

    const { data, error } = await supabase
      .from('repositories')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST205' || error.code === 'PGRST116') {
        return null;
      }
      console.error(`Error fetching repository ${id}:`, error);
      throw new Error(`Repository query error: ${error.message}`);
    }

    return (data as Repository) || null;
  },

  /**
   * Retrieves files strictly belonging to the specified repository.
   */
  async getFiles(repositoryId: string): Promise<FileItem[]> {
    loadCustomDemoStore();
    if (CUSTOM_DEMO_STORE.has(repositoryId)) {
      return CUSTOM_DEMO_STORE.get(repositoryId)!.files;
    }

    if (repositoryId === DEMO_REPO_ID) {
      return DEMO_FILES;
    }

    if (!isSupabaseConfigured) {
      return [];
    }

    const { data, error } = await supabase
      .from('files')
      .select('*')
      .eq('repository_id', repositoryId)
      .order('path', { ascending: true });

    if (error) {
      if (error.code === 'PGRST205') {
        return [];
      }
      console.error(`Failed to fetch files for repository ${repositoryId}:`, error);
      throw new Error(`File retrieval failed: ${error.message}`);
    }

    return (data as FileItem[]) || [];
  },

  /**
   * Retrieves commits strictly belonging to the specified repository.
   */
  async getCommits(repositoryId: string): Promise<CommitItem[]> {
    loadCustomDemoStore();
    if (CUSTOM_DEMO_STORE.has(repositoryId)) {
      return CUSTOM_DEMO_STORE.get(repositoryId)!.commits;
    }

    if (repositoryId === DEMO_REPO_ID) {
      return DEMO_COMMITS;
    }

    if (!isSupabaseConfigured) {
      return [];
    }

    const { data, error } = await supabase
      .from('commits')
      .select('*')
      .eq('repository_id', repositoryId)
      .order('timestamp', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205') {
        return [];
      }
      console.error(`Failed to fetch commits for repository ${repositoryId}:`, error);
      throw new Error(`Commits retrieval failed: ${error.message}`);
    }

    return (data as CommitItem[]) || [];
  },

  /**
   * Retrieves pull requests strictly belonging to the specified repository.
   */
  async getPullRequests(repositoryId: string): Promise<PullRequestItem[]> {
    loadCustomDemoStore();
    if (CUSTOM_DEMO_STORE.has(repositoryId)) {
      return CUSTOM_DEMO_STORE.get(repositoryId)!.prs;
    }

    if (repositoryId === DEMO_REPO_ID) {
      return DEMO_PRS;
    }

    if (!isSupabaseConfigured) {
      return [];
    }

    const { data, error } = await supabase
      .from('pull_requests')
      .select('*')
      .eq('repository_id', repositoryId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205') {
        return [];
      }
      console.error(`Failed to fetch PRs for repository ${repositoryId}:`, error);
      throw new Error(`Pull requests retrieval failed: ${error.message}`);
    }

    return (data as PullRequestItem[]) || [];
  },

  /**
   * Retrieves issues strictly belonging to the specified repository.
   */
  async getIssues(repositoryId: string): Promise<IssueItem[]> {
    loadCustomDemoStore();
    if (CUSTOM_DEMO_STORE.has(repositoryId)) {
      return CUSTOM_DEMO_STORE.get(repositoryId)!.issues;
    }

    if (repositoryId === DEMO_REPO_ID) {
      return DEMO_ISSUES;
    }

    if (!isSupabaseConfigured) {
      return [];
    }

    const { data, error } = await supabase
      .from('issues')
      .select('*')
      .eq('repository_id', repositoryId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205') {
        return [];
      }
      console.error(`Failed to fetch issues for repository ${repositoryId}:`, error);
      throw new Error(`Issues retrieval failed: ${error.message}`);
    }

    return (data as IssueItem[]) || [];
  },

  /**
   * Retrieves documentation items strictly belonging to the specified repository.
   */
  async getDocuments(repositoryId: string): Promise<DocumentItem[]> {
    loadCustomDemoStore();
    if (CUSTOM_DEMO_STORE.has(repositoryId)) {
      return CUSTOM_DEMO_STORE.get(repositoryId)!.files
        .filter((f) => f.path.endsWith('.md'))
        .map((f, i) => ({
          id: `doc-${f.id}-${i}`,
          repository_id: repositoryId,
          title: f.path.split('/').pop() || f.path,
          path: f.path,
          content: f.content,
          created_at: f.created_at,
          updated_at: f.updated_at,
        }));
    }

    if (repositoryId === DEMO_REPO_ID) {
      return DEMO_DOCS;
    }

    if (!isSupabaseConfigured) {
      return [];
    }

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('repository_id', repositoryId)
      .order('path', { ascending: true });

    if (error) {
      if (error.code === 'PGRST205') {
        return [];
      }
      console.error(`Failed to fetch documents for repository ${repositoryId}:`, error);
      throw new Error(`Documents retrieval failed: ${error.message}`);
    }

    return (data as DocumentItem[]) || [];
  },

  /**
   * Retrieves the most recent indexing job for a repository.
   */
  async getLatestIndexingJob(repositoryId: string): Promise<IndexingJob | null> {
    loadCustomDemoStore();
    if (CUSTOM_DEMO_STORE.has(repositoryId)) {
      const s = CUSTOM_DEMO_STORE.get(repositoryId)!;
      return {
        id: `job-${repositoryId}`,
        repository_id: repositoryId,
        status: 'completed',
        progress: 100,
        files_processed: s.files.length,
        chunks_created: s.chunks.length,
        created_at: s.repo.created_at,
        updated_at: s.repo.updated_at,
      };
    }

    if (repositoryId === DEMO_REPO_ID) {
      return {
        id: 'job-demo',
        repository_id: DEMO_REPO_ID,
        status: 'completed',
        progress: 100,
        files_processed: DEMO_FILES.length,
        chunks_created: 14,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    if (!isSupabaseConfigured) return null;

    const { data, error } = await supabase
      .from('indexing_jobs')
      .select('*')
      .eq('repository_id', repositoryId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn(`Failed to fetch latest indexing job for ${repositoryId}:`, error.message);
      return null;
    }

    return data as IndexingJob | null;
  },

  /**
   * Triggers a real reindex via the server-side ingestion endpoint.
   * Preserves previous valid index if reindexing fails.
   */
  async triggerReindex(repositoryId: string, fullName?: string): Promise<IndexingJob> {
    if (repositoryId === DEMO_REPO_ID) {
      return {
        id: 'job-demo-completed',
        repository_id: DEMO_REPO_ID,
        status: 'completed',
        progress: 100,
        files_processed: DEMO_FILES.length,
        chunks_created: 14,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    const currentRepo = await this.getRepository(repositoryId);

    // Requirement 1: Confirm frontend obtains current Supabase session and valid access_token
    let token: string | undefined;
    if (isSupabaseConfigured) {
      const { data: sessionData } = await supabase.auth.getSession();
      let session = sessionData?.session;
      const nowSec = Math.floor(Date.now() / 1000);
      const isExpired = session?.expires_at ? session.expires_at <= nowSec : false;

      // Requirement 2: Proactively refresh expired session
      if (isExpired && session?.refresh_token) {
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession({
          refresh_token: session.refresh_token,
        });
        if (!refreshError && refreshData?.session?.access_token) {
          session = refreshData.session;
        }
      }

      token = session?.access_token;
      if (!token) {
        throw new Error('User authentication session is missing or expired. Please sign in again.');
      }
    }

    const githubToken = typeof window !== 'undefined' ? localStorage.getItem('intelcode_github_token') : null;

    // Set repository to indexing in database
    await supabase
      .from('repositories')
      .update({ status: 'indexing', updated_at: new Date().toISOString() })
      .eq('id', repositoryId);

    try {
      let hasMore = true;
      let cursor: string | null = null;
      let activeJobId: string | undefined = undefined;
      let lastResult: any = null;

      while (hasMore) {
        const payload: any = {
          action: 'reindex',
          repositoryId,
          fullName: fullName || currentRepo?.full_name,
          jobId: activeJobId,
          cursor,
          batchLimit: 100,
        };

        const { data: ingestData, updatedToken } = await postIngestWithSessionRetry(
          payload,
          token,
          githubToken
        );

        if (updatedToken) {
          token = updatedToken;
        }

        if (ingestData.jobId) {
          activeJobId = ingestData.jobId;
        }

        lastResult = ingestData;

        if (ingestData.has_more && ingestData.next_cursor) {
          cursor = ingestData.next_cursor;
        } else {
          hasMore = false;
        }
      }

      if (!lastResult || !lastResult.success) {
        throw new Error(lastResult?.error || 'Reindexing failed to complete successfully.');
      }

      return (
        lastResult?.job || {
          id: activeJobId || 'completed',
          repository_id: repositoryId,
          status: 'completed',
          progress: 100,
          files_processed: lastResult.files_count ?? 0,
          chunks_created: lastResult.chunks_count ?? 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      );
    } catch (reindexErr: any) {
      console.error('Reindexing error:', reindexErr);
      const sanitizedError = reindexErr?.message || 'Reindexing encountered an error.';

      // Preserve previously valid index if one existed!
      const hadValidIndex = currentRepo && currentRepo.status === 'ready' && currentRepo.files_count > 0;

      if (hadValidIndex) {
        // Restore repository to 'ready' to preserve working index for search
        await supabase
          .from('repositories')
          .update({ status: 'ready', updated_at: new Date().toISOString() })
          .eq('id', repositoryId);
      } else {
        await supabase
          .from('repositories')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', repositoryId);
      }

      // Persist failed indexing job record for inspection
      await supabase.from('indexing_jobs').insert({
        repository_id: repositoryId,
        status: 'failed',
        error: sanitizedError,
        progress: 0,
      });

      throw new Error(sanitizedError);
    }
  },

  /**
   * Imports a new repository into the database for the authenticated user.
   * If in Demo Mode or unauthenticated, imports and indexes directly via GitHub API and AST chunker.
   */
  async importRepository(repoData: {
    owner: string;
    name: string;
    description?: string;
    language?: string;
    isPrivate?: boolean;
    githubRepoId?: number;
  }): Promise<Repository> {
    let session = isSupabaseConfigured ? (await supabase.auth.getSession()).data.session : null;

    if (session && isSupabaseConfigured) {
      const nowSec = Math.floor(Date.now() / 1000);
      const isExpired = session.expires_at ? session.expires_at <= nowSec : false;
      if (isExpired && session.refresh_token) {
        const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession({
          refresh_token: session.refresh_token,
        });
        if (!refreshErr && refreshData?.session) {
          session = refreshData.session;
        }
      }
    }

    if (!session?.user) {
      return await this.importDemoRepository(repoData);
    }

    const newRecord = {
      user_id: session.user.id,
      owner: repoData.owner,
      name: repoData.name,
      full_name: `${repoData.owner}/${repoData.name}`,
      default_branch: 'main',
      description: repoData.description || null,
      language: repoData.language || 'TypeScript',
      is_private: Boolean(repoData.isPrivate),
      github_repo_id: repoData.githubRepoId || null,
      status: 'indexing',
      files_count: 0,
      chunks_count: 0,
    };

    const { data, error } = await supabase
      .from('repositories')
      .insert(newRecord)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to create repository record: ${error.message}`);
    }

    const createdRepo = data as Repository;
    const githubToken = typeof window !== 'undefined' ? localStorage.getItem('intelcode_github_token') : null;

    try {
      let hasMore = true;
      let cursor: string | null = null;
      let activeJobId: string | undefined = undefined;
      let lastResult: any = null;
      let token = session.access_token;

      while (hasMore) {
        const payload: any = {
          action: 'start_ingestion',
          repositoryId: createdRepo.id,
          fullName: createdRepo.full_name,
          jobId: activeJobId,
          cursor,
          batchLimit: 100,
        };

        const { data: ingestData, updatedToken } = await postIngestWithSessionRetry(
          payload,
          token,
          githubToken
        );

        if (updatedToken) {
          token = updatedToken;
        }

        if (ingestData.jobId) {
          activeJobId = ingestData.jobId;
        }

        lastResult = ingestData;

        if (ingestData.has_more && ingestData.next_cursor) {
          cursor = ingestData.next_cursor;
        } else {
          hasMore = false;
        }
      }

      if (!lastResult || !lastResult.success) {
        throw new Error(lastResult?.error || 'Indexing pipeline did not return success.');
      }

      createdRepo.status = 'ready';
      createdRepo.files_count = lastResult.files_count ?? 0;
      createdRepo.chunks_count = lastResult.chunks_count ?? 0;
      createdRepo.last_indexed_at = new Date().toISOString();

      return createdRepo;
    } catch (ingestErr: any) {
      console.error('Import repository ingestion error:', ingestErr);
      const sanitizedError = ingestErr?.message || 'Repository ingestion failed.';

      // Persist failed state to database so repository is never stuck in 'indexing'
      await supabase
        .from('repositories')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', createdRepo.id);

      // Record failed indexing job for UI inspection
      await supabase.from('indexing_jobs').insert({
        repository_id: createdRepo.id,
        status: 'failed',
        error: sanitizedError,
        progress: 0,
      });

      createdRepo.status = 'failed';
      throw new Error(sanitizedError);
    }
  },

  /**
   * Imports a public repository directly from GitHub into the client workspace.
   * Performs real Git tree traversal, blob downloading, and AST chunking.
   */
  async importDemoRepository(repoData: {
    owner: string;
    name: string;
    description?: string;
    language?: string;
    isPrivate?: boolean;
    githubRepoId?: number;
  }): Promise<Repository> {
    const fullName = `${repoData.owner}/${repoData.name}`;
    const id = `repo-${repoData.owner}-${repoData.name}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-');

    let defaultBranch = 'main';
    let repoDesc = repoData.description || '';
    let repoLang = repoData.language || 'TypeScript';

    try {
      const ghRes = await fetch(`https://api.github.com/repos/${repoData.owner}/${repoData.name}`, {
        headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'IntelCode-App' },
      });
      if (ghRes.ok) {
        const d = await ghRes.json();
        defaultBranch = d.default_branch || 'main';
        if (d.description) repoDesc = d.description;
        if (d.language) repoLang = d.language;
      }
    } catch {
      // Ignore
    }

    const files: FileItem[] = [];
    const chunks: CodeChunk[] = [];

    try {
      const treeRes = await fetch(
        `https://api.github.com/repos/${repoData.owner}/${repoData.name}/git/trees/${defaultBranch}?recursive=1`,
        { headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'IntelCode-App' } }
      );
      if (treeRes.ok) {
        const treeData = await treeRes.json();
        const tree = Array.isArray(treeData.tree) ? treeData.tree : [];
        const eligible = tree.filter(
          (t: any) =>
            t.type === 'blob' &&
            !isFileIgnored(t.path) &&
            (!t.size || t.size <= 250000)
        );

        for (let i = 0; i < eligible.length; i++) {
          const item = eligible[i];
          try {
            const rawRes = await fetch(
              `https://raw.githubusercontent.com/${repoData.owner}/${repoData.name}/${defaultBranch}/${item.path}`,
              { headers: { 'User-Agent': 'IntelCode-App' } }
            );
            if (rawRes.ok) {
              const content = await rawRes.text();
              const ext = item.path.split('.').pop()?.toLowerCase() || '';
              const lang = EXT_TO_LANG_MAP[ext] || repoLang.toLowerCase() || 'text';

              const fileRecord: FileItem = {
                id: `f-${id}-${i}`,
                repository_id: id,
                path: item.path,
                language: lang,
                sha: item.sha || 'sha-' + i,
                size: content.length,
                content,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              files.push(fileRecord);

              const extracted = extractCodeAwareChunks(item.path, content, lang);
              extracted.forEach((c, cIdx) => {
                chunks.push({
                  id: `chunk-${id}-${i}-${cIdx}`,
                  repository_id: id,
                  file_id: fileRecord.id,
                  file_path: c.filePath,
                  symbol_name: c.symbolName,
                  symbol_type: c.symbolType,
                  start_line: c.startLine,
                  end_line: c.endLine,
                  content: c.content,
                  language: c.language,
                  created_at: new Date().toISOString(),
                });
              });
            }
          } catch {
            // continue
          }
        }
      }
    } catch {
      // continue
    }

    const commits: CommitItem[] = [];
    try {
      const commitRes = await fetch(
        `https://api.github.com/repos/${repoData.owner}/${repoData.name}/commits?per_page=10`,
        { headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'IntelCode-App' } }
      );
      if (commitRes.ok) {
        const commitData = await commitRes.json();
        if (Array.isArray(commitData)) {
          commitData.forEach((c: any, idx: number) => {
            commits.push({
              id: `c-${id}-${idx}`,
              repository_id: id,
              sha: c.sha ? c.sha.slice(0, 7) : 'commit-' + idx,
              message: c.commit?.message?.split('\n')[0] || 'Update repository',
              author: c.commit?.author?.name || c.author?.login || 'Developer',
              timestamp: c.commit?.author?.date || new Date().toISOString(),
              changed_files: [],
            });
          });
        }
      }
    } catch {
      // continue
    }

    const prs: PullRequestItem[] = [];
    const issues: IssueItem[] = [];
    try {
      const issuesRes = await fetch(
        `https://api.github.com/repos/${repoData.owner}/${repoData.name}/issues?state=all&per_page=10`,
        { headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'IntelCode-App' } }
      );
      if (issuesRes.ok) {
        const issuesData = await issuesRes.json();
        if (Array.isArray(issuesData)) {
          issuesData.forEach((iss: any, idx: number) => {
            if (iss.pull_request) {
              prs.push({
                id: `pr-${id}-${idx}`,
                repository_id: id,
                github_number: iss.number,
                title: iss.title,
                description: iss.body || '',
                state: iss.state === 'closed' ? 'merged' : 'open',
                author: iss.user?.login || 'contributor',
                created_at: iss.created_at,
              });
            } else {
              issues.push({
                id: `iss-${id}-${idx}`,
                repository_id: id,
                github_number: iss.number,
                title: iss.title,
                body: iss.body || '',
                state: iss.state as any,
                author: iss.user?.login || 'user',
                labels: [],
                created_at: iss.created_at,
              });
            }
          });
        }
      }
    } catch {
      // continue
    }

    const createdRepo: Repository = {
      id,
      user_id: '00000000-0000-0000-0000-000000000001',
      github_repo_id: repoData.githubRepoId || 100000 + Math.floor(Math.random() * 900000),
      owner: repoData.owner,
      name: repoData.name,
      full_name: fullName,
      default_branch: defaultBranch,
      description: repoDesc || 'Imported GitHub repository',
      language: repoLang,
      is_private: Boolean(repoData.isPrivate),
      files_count: files.length,
      chunks_count: chunks.length,
      status: 'ready',
      last_indexed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    CUSTOM_DEMO_STORE.set(id, { repo: createdRepo, files, chunks, commits, prs, issues });
    saveCustomDemoStore();
    return createdRepo;
  },

  /**
   * Deletes a repository and all its associated data.
   */
  async deleteRepository(repositoryId: string): Promise<void> {
    loadCustomDemoStore();
    if (CUSTOM_DEMO_STORE.has(repositoryId)) {
      CUSTOM_DEMO_STORE.delete(repositoryId);
      saveCustomDemoStore();
      return;
    }

    if (repositoryId === DEMO_REPO_ID) {
      throw new Error('The benchmark demo repository is protected and cannot be deleted.');
    }

    if (!isSupabaseConfigured) {
      throw new Error(
        'Database connection required: configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to delete repositories.'
      );
    }

    const { error } = await supabase
      .from('repositories')
      .delete()
      .eq('id', repositoryId);

    if (error) {
      console.error(`Failed to delete repository ${repositoryId}:`, error);
      throw new Error(`Failed to delete repository: ${error.message}`);
    }
  },

  postIngestWithSessionRetry,
};

