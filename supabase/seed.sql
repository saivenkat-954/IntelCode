-- ==============================================================================
-- INTELCODE SEED DATA (Synthetic Enterprise Service: acme-org/intel-gateway)
-- ==============================================================================

-- Demo User & Repo
DO $$
DECLARE
  demo_user_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  repo_id UUID := '11111111-1111-1111-1111-111111111111'::uuid;
  f_retry_id UUID := '22222222-2222-2222-2222-222222222221'::uuid;
  f_auth_id UUID := '22222222-2222-2222-2222-222222222222'::uuid;
  f_redis_id UUID := '22222222-2222-2222-2222-222222222223'::uuid;
BEGIN
  -- Insert Repository
  INSERT INTO public.repositories (
    id, user_id, github_repo_id, owner, name, full_name, default_branch,
    description, language, is_private, files_count, chunks_count, status, last_indexed_at
  ) VALUES (
    repo_id, demo_user_id, 98451201, 'acme-org', 'intel-gateway', 'acme-org/intel-gateway', 'main',
    'High-throughput API gateway with resilient retry services, JWT auth, and distributed Redis rate limiting.',
    'TypeScript', false, 18, 46, 'ready', now()
  ) ON CONFLICT (id) DO NOTHING;

  -- Insert Files
  INSERT INTO public.files (id, repository_id, path, language, sha, content, size)
  VALUES
  (
    f_retry_id, repo_id, 'src/payment/retry.ts', 'TypeScript', '7a81d2f83c1',
$CODE$import { Logger } from '../utils/logger';
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
          this.logger.error(`Failed after ${attempt} attempts`, { error: err });
          throw err;
        }

        this.logger.warn(`Attempt ${attempt} failed with 503. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= config.backoffFactor;
      }
    }

    throw new Error('Unexpected retry loop termination');
  }
}
$CODE$,
    1240
  ),
  (
    f_auth_id, repo_id, 'src/auth/session.ts', 'TypeScript', 'c9103a89e1b',
$CODE$import { verifyJwt, signJwt } from './jwt';
import { redisClient } from '../config/redis';

export interface SessionPayload {
  userId: string;
  role: string;
  exp: number;
}

export async function refreshToken(currentToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const decoded = await verifyJwt<SessionPayload>(currentToken);
  const isBlacklisted = await redisClient.get(`blacklist:${decoded.userId}:${currentToken}`);
  
  if (isBlacklisted) {
    throw new Error('Revoked session token detected');
  }

  // Sliding window refresh
  const newAccessToken = signJwt({ userId: decoded.userId, role: decoded.role }, '15m');
  const newRefreshToken = signJwt({ userId: decoded.userId, role: decoded.role }, '7d');

  await redisClient.setex(`session:${decoded.userId}`, 604800, newRefreshToken);
  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}
$CODE$,
    890
  ),
  (
    f_redis_id, repo_id, 'src/config/redis.ts', 'TypeScript', 'b249e0112fa',
$CODE$import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});
$CODE$,
    310
  ) ON CONFLICT (id) DO NOTHING;

  -- Insert Commits
  INSERT INTO public.commits (repository_id, sha, message, author, timestamp, diff, changed_files)
  VALUES
  (
    repo_id, '7a81d2f',
    'Fix payment retry logic: increase max attempts from 2 to 3',
    'sarah.dev', now() - interval '2 days',
    '--- a/src/payment/retry.ts\n+++ b/src/payment/retry.ts\n@@ -14,3 +14,3 @@\n-    maxRetries: 2,\n+    maxRetries: 3,',
    '["src/payment/retry.ts"]'::jsonb
  ),
  (
    repo_id, 'b249e01',
    'Introduce Redis distributed rate limiter and connection pooling',
    'alex.chen', now() - interval '5 days',
    '--- /dev/null\n+++ b/src/config/redis.ts\n@@ -0,0 +1,9 @@\n+import Redis from "ioredis";',
    '["src/config/redis.ts", "src/middleware/rate-limiter.ts"]'::jsonb
  ),
  (
    repo_id, 'c9103a8',
    'Add sliding window JWT session refresh and revocation blacklist',
    'marcus.eng', now() - interval '9 days',
    '--- a/src/auth/session.ts\n+++ b/src/auth/session.ts',
    '["src/auth/session.ts"]'::jsonb
  ) ON CONFLICT (repository_id, sha) DO NOTHING;

  -- Insert Pull Requests
  INSERT INTO public.pull_requests (repository_id, github_number, title, description, author, state, diff, created_at, merged_at)
  VALUES
  (
    repo_id, 184,
    'Payment retry logic and circuit breaker for upstream 503s',
    'Addresses intermittent 503 responses observed from the payment gateway provider. Wraps calls in RetryService with exponential backoff.',
    'sarah.dev', 'merged',
    'Added RetryService in src/payment/retry.ts and tests.',
    now() - interval '3 days', now() - interval '2 days'
  ),
  (
    repo_id, 192,
    'Redis cluster integration for distributed session state',
    'Migrates in-memory session tokens to distributed Redis store to allow multi-replica container scaling.',
    'alex.chen', 'merged',
    'Integrated ioredis with fallback connection management.',
    now() - interval '6 days', now() - interval '5 days'
  ) ON CONFLICT (repository_id, github_number) DO NOTHING;

  -- Insert Issues
  INSERT INTO public.issues (repository_id, github_number, title, body, author, state, labels, created_at, closed_at)
  VALUES
  (
    repo_id, 179,
    'Upstream payment provider returns intermittent 503 errors during traffic spikes',
    'Customers reported checkout failures during high-traffic events. The upstream provider confirmed intermittent 503s requiring retry handling.',
    'sarah.dev', 'closed',
    '["bug", "critical", "payment"]'::jsonb,
    now() - interval '4 days', now() - interval '2 days'
  ),
  (
    repo_id, 190,
    'Token refresh race condition when two requests expire simultaneously',
    'Concurrent client requests triggered dual token rotation, revoking valid sessions.',
    'marcus.eng', 'closed',
    '["security", "auth"]'::jsonb,
    now() - interval '10 days', now() - interval '8 days'
  ) ON CONFLICT (repository_id, github_number) DO NOTHING;

  -- Insert Documents
  INSERT INTO public.documents (repository_id, path, title, content, metadata)
  VALUES
  (
    repo_id, 'docs/ARCHITECTURE.md', 'Architecture & System Topology',
    '# Intel Gateway Architecture\n\nThe gateway manages routing, JWT authentication, and resilient upstream communication.\n\n## Resiliency Patterns\nAll third-party payment requests must flow through RetryService (src/payment/retry.ts) using exponential backoff to handle transient 503 errors.\n\n## State Management\nShared state (rate limits and token blacklists) is synchronized via Redis clusters.',
    '{"type": "architecture", "author": "core-team"}'::jsonb
  ) ON CONFLICT (repository_id, path) DO NOTHING;

END $$;
