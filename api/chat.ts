import { executeChatInvestigation } from '../src/server/chat';
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
    const body = JSON.parse(event.body || '{}');
    const { query, repositoryId } = body;

    if (!query || !repositoryId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'query and repositoryId are required parameters.' }),
      };
    }

    if (typeof query !== 'string' || query.trim().length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query must be a non-empty string.' }),
      };
    }

    if (query.length > 2000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Query exceeds maximum allowed length of 2,000 characters.' }),
      };
    }

    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    const userToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;

    const result = await executeChatInvestigation(body, userToken);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };
  } catch (err: any) {
    console.error('Error in chat endpoint:', err);
    const msg = err.message || 'Chat generation failed.';
    const statusCode = msg.includes('Access denied')
      ? 403
      : msg.includes('Authentication required')
      ? 401
      : msg.includes('not found')
      ? 404
      : msg.includes('GEMINI_API_KEY')
      ? 503
      : 500;

    return {
      statusCode,
      headers,
      body: JSON.stringify({ error: msg }),
    };
  }
};

export default createVercelHandler(handler);
