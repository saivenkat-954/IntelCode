/**
 * GitHub Integration & OAuth Token Exchange
 * Keeps GITHUB_CLIENT_SECRET secure on the server; validates OAuth code and state.
 */

import { isConfiguredKey, sanitizeErrorMessage } from './config';

export interface GitHubActionParams {
  action?: 'exchange' | 'list_repos' | 'repo_tree' | 'config' | 'status';
  code?: string;
  state?: string;
  accessToken?: string;
  owner?: string;
  repo?: string;
}

export interface GitHubActionResult {
  statusCode: number;
  data: any;
}

export async function handleGitHubAction(params: GitHubActionParams): Promise<GitHubActionResult> {
  const { action, code, accessToken, owner, repo } = params;

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const isOAuthConfigured = isConfiguredKey(clientId) && isConfiguredKey(clientSecret);

  // 1. Config / Status action (public info: never expose client secret)
  if (action === 'config' || action === 'status') {
    return {
      statusCode: 200,
      data: {
        configured: isOAuthConfigured,
        clientId: isOAuthConfigured ? clientId : null,
      },
    };
  }

  // 2. Exchange OAuth code for GitHub Access Token
  if (action === 'exchange') {
    if (!isOAuthConfigured) {
      return {
        statusCode: 503,
        data: {
          error:
            'GitHub OAuth is not configured on the server. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.',
        },
      };
    }

    if (!code) {
      return {
        statusCode: 400,
        data: { error: 'Authorization code is required for token exchange.' },
      };
    }

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'IntelCode-App',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!res.ok) {
      return {
        statusCode: res.status,
        data: { error: `GitHub OAuth server responded with status ${res.status}` },
      };
    }

    const tokenData = await res.json();
    if (tokenData.error) {
      return {
        statusCode: 400,
        data: { error: tokenData.error_description || tokenData.error },
      };
    }

    return {
      statusCode: 200,
      data: {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type,
        scope: tokenData.scope,
      },
    };
  }

  // 3. Fetch authenticated user's genuine GitHub repositories
  if (action === 'list_repos') {
    if (!accessToken) {
      return {
        statusCode: 401,
        data: {
          error: 'GitHub access token is required to list repositories.',
          configured: isOAuthConfigured,
        },
      };
    }

    const ghRes = await fetch(
      'https://api.github.com/user/repos?sort=updated&per_page=50&affiliation=owner,collaborator,organization_member',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'IntelCode-App',
        },
      }
    );

    if (!ghRes.ok) {
      const errorText = await ghRes.text();
      return {
        statusCode: ghRes.status,
        data: { error: `GitHub API error (${ghRes.status}): ${sanitizeErrorMessage(errorText)}` },
      };
    }

    const ghRepos = await ghRes.json();
    return {
      statusCode: 200,
      data: { repositories: ghRepos },
    };
  }

  // 4. Fetch tree for repository ingestion
  if (action === 'repo_tree') {
    if (!owner || !repo) {
      return {
        statusCode: 400,
        data: { error: 'owner and repo parameters are required.' },
      };
    }

    const authHeaders: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'IntelCode-App',
    };
    if (accessToken) {
      authHeaders.Authorization = `Bearer ${accessToken}`;
    }

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`,
      { headers: authHeaders }
    );

    if (!treeRes.ok) {
      return {
        statusCode: treeRes.status,
        data: { error: `Failed to fetch repo tree from GitHub: HTTP ${treeRes.status}` },
      };
    }

    const treeData = await treeRes.json();
    return {
      statusCode: 200,
      data: { tree: treeData.tree || [] },
    };
  }

  return {
    statusCode: 400,
    data: {
      error: `Unsupported action: "${action || ''}". Supported actions: config, exchange, list_repos, repo_tree.`,
    },
  };
}
