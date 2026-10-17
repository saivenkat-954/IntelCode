/**
 * Hybrid Code Retrieval Engine
 * Unifies Voyage Code 4 (512-d) query embeddings with PostgreSQL full-text search
 * using Reciprocal Rank Fusion (RRF) and safe fallback.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseClient, verifyRepositoryAccess, verifyUserToken } from './supabase';
import { embedQuery, isVoyageConfigured } from './embeddings/voyage';

export interface RetrievedChunk {
  id: string;
  file_id: string;
  path: string;
  language: string;
  symbol_name?: string;
  symbol_type?: string;
  start_line: number;
  end_line: number;
  content: string;
  combined_score?: number;
  semantic_score?: number;
  lexical_score?: number;
}

export interface RetrievalOptions {
  limit?: number;
  semanticWeight?: number;
  fullTextWeight?: number;
  rrfK?: number;
  userToken?: string;
}

export interface RetrievalResult {
  results: RetrievedChunk[];
  method: 'hybrid_voyage_fts' | 'lexical_fts';
  embeddingModel?: string;
  dimensions?: number;
}

/**
 * Executes a verified hybrid retrieval query against a repository.
 */
export async function executeHybridRetrieval(
  repositoryId: string,
  query: string,
  options: RetrievalOptions = {},
  supabaseClient?: SupabaseClient
): Promise<RetrievalResult> {
  const supabase = supabaseClient || getServerSupabaseClient();
  const safeLimit = Math.min(Math.max(1, options.limit || 12), 30);
  const semanticWeight = options.semanticWeight ?? 0.7;
  const fullTextWeight = options.fullTextWeight ?? 0.3;
  const rrfK = options.rrfK ?? 60;

  // 1. Verify repository access permissions
  let userId: string | undefined = undefined;
  if (options.userToken) {
    const authUser = await verifyUserToken(`Bearer ${options.userToken}`, supabase);
    userId = authUser?.id;
  }

  const access = await verifyRepositoryAccess(supabase, repositoryId, userId);
  if (!access.accessible) {
    throw new Error(access.reason || 'Access denied to repository.');
  }

  // 2. Try Voyage Code 4 Vector + Lexical Search if configured
  if (isVoyageConfigured()) {
    try {
      const queryVector = await embedQuery(query);

      // Call 512-dimensional hybrid_search_chunks function in database
      const { data: hybridRows, error: rpcError } = await supabase.rpc('hybrid_search_chunks', {
        target_repo_id: repositoryId,
        query_text: query,
        query_embedding: queryVector,
        match_count: safeLimit,
        full_text_weight: fullTextWeight,
        semantic_weight: semanticWeight,
        rrf_k: rrfK,
      });

      if (!rpcError && Array.isArray(hybridRows) && hybridRows.length > 0) {
        const formatted: RetrievedChunk[] = hybridRows.map((r: any) => ({
          id: r.chunk_id || r.id,
          file_id: r.file_id,
          path: r.file_path || r.path || '',
          language: r.language || 'text',
          symbol_name: r.symbol_name || undefined,
          symbol_type: r.symbol_type || undefined,
          start_line: r.start_line || 1,
          end_line: r.end_line || 1,
          content: r.content || '',
          combined_score: r.combined_score,
          semantic_score: r.semantic_score,
          lexical_score: r.lexical_score,
        }));

        return {
          results: formatted,
          method: 'hybrid_voyage_fts',
          embeddingModel: process.env.VOYAGE_EMBEDDING_MODEL || 'voyage-code-4',
          dimensions: 512,
        };
      }
    } catch (voyageErr) {
      console.warn('Voyage hybrid search failed, falling back to lexical search:', voyageErr);
    }
  }

  // 3. Fallback to PostgreSQL Full-Text Search
  const { data: chunks, error: chunkErr } = await supabase
    .from('chunks')
    .select('id, repository_id, file_id, content, language, symbol_name, symbol_type, start_line, end_line, metadata, files!inner(path)')
    .eq('repository_id', repositoryId)
    .textSearch('fts_tokens', query, { type: 'websearch', config: 'english' })
    .limit(safeLimit);

  if (chunkErr) {
    // If textSearch syntax error, try basic ILIKE search as ultimate safeguard
    const { data: fallbackChunks } = await supabase
      .from('chunks')
      .select('id, repository_id, file_id, content, language, symbol_name, symbol_type, start_line, end_line, metadata, files!inner(path)')
      .eq('repository_id', repositoryId)
      .ilike('content', `%${query.slice(0, 50)}%`)
      .limit(safeLimit);

    const formattedFallback: RetrievedChunk[] = (fallbackChunks || []).map((c: any) => ({
      id: c.id,
      file_id: c.file_id,
      path: c.files?.path || '',
      language: c.language || 'text',
      symbol_name: c.symbol_name,
      symbol_type: c.symbol_type,
      start_line: c.start_line || 1,
      end_line: c.end_line || 1,
      content: c.content || '',
    }));

    return {
      results: formattedFallback,
      method: 'lexical_fts',
    };
  }

  const formatted: RetrievedChunk[] = (chunks || []).map((c: any) => ({
    id: c.id,
    file_id: c.file_id,
    path: c.files?.path || '',
    language: c.language || 'text',
    symbol_name: c.symbol_name,
    symbol_type: c.symbol_type,
    start_line: c.start_line || 1,
    end_line: c.end_line || 1,
    content: c.content || '',
  }));

  return {
    results: formatted,
    method: 'lexical_fts',
  };
}
