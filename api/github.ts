import { handleGitHubAction } from '../src/server/github';
import { getCorsHeaders } from '../src/server/config';
import { createVercelHandler } from '../src/server/adapter';

export const handler = async (event: any) => {
  const requestOrigin = event.headers?.origin || event.headers?.Origin;
  const headers = getCorsHeaders(requestOrigin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  let action: string | undefined;
  let code: string | undefined;
  let state: string | undefined;
  let accessToken: string | undefined;
  let owner: string | undefined;
  let repo: string | undefined;

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    accessToken = authHeader.split(' ')[1];
  }

  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    action = params.action;
    code = params.code;
    state = params.state;
    accessToken = accessToken || params.token || params.accessToken;
    owner = params.owner;
    repo = params.repo;
  } else if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      action = body.action;
      code = body.code;
      state = body.state;
      accessToken = accessToken || body.accessToken;
      owner = body.owner;
      repo = body.repo;
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Malformed JSON in request body.' }),
      };
    }
  } else {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed. Use GET or POST.' }),
    };
  }

  const result = await handleGitHubAction({
    action: action as any,
    code,
    state,
    accessToken,
    owner,
    repo,
  });

  return {
    statusCode: result.statusCode,
    headers,
    body: JSON.stringify(result.data),
  };
};

export default createVercelHandler(handler);
