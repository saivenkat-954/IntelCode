import {
  handler,
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
  diagnoseSupabaseAuthError,
  fetchGitHubBlobContent,
  INDEX_VERSION,
  IGNORED_PATH_PATTERNS,
  SECRET_CONTENT_PATTERNS,
  EXT_TO_LANG,
} from '../src/server/ingest';
import { createVercelHandler } from '../src/server/adapter';

export {
  handler,
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
  diagnoseSupabaseAuthError,
  fetchGitHubBlobContent,
  INDEX_VERSION,
  IGNORED_PATH_PATTERNS,
  SECRET_CONTENT_PATTERNS,
  EXT_TO_LANG,
};

export default createVercelHandler(handler);
