import { executeHybridRetrieval } from '../src/server/retrieval';
import { getCorsHeaders } from '../src/server/config';
import { createVercelHandler } from '../src/server/adapter';

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

  try {
    const { query, repositoryId, limit = 10, fullTextWeight, semanticWeight, rrfK } = JSON.parse(
      event.body || '{}'
    );

    if (!query || !repositoryId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'query and repositoryId are required.' }),
      };
    }

    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

    const retrievalResult = await executeHybridRetrieval(repositoryId, query, {
      limit,
      fullTextWeight,
      semanticWeight,
      rrfK,
      userToken,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        results: retrievalResult.results,
        method: retrievalResult.method,
        embeddingModel: retrievalResult.embeddingModel,
        dimensions: retrievalResult.dimensions,
      }),
    };
  } catch (err: any) {
    console.error('Error in search endpoint:', err);
    const msg = err.message || 'Search execution failed.';
    const statusCode = msg.includes('Access denied') ? 403 : msg.includes('Authentication required') ? 401 : msg.includes('not found') ? 404 : 500;

    return {
      statusCode,
      headers,
      body: JSON.stringify({ error: msg }),
    };
  }
};

export default createVercelHandler(handler);
