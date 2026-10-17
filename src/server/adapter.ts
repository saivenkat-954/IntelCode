/**
 * Vercel Serverless Function Adapter
 * Adapts unified event handlers to Vercel Node.js Request/Response format.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export interface EventHandlerResult {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

export type EventHandler = (event: {
  httpMethod: string;
  headers: Record<string, any>;
  rawUrl: string;
  path: string;
  queryStringParameters: Record<string, string>;
  body: string | null;
}) => Promise<EventHandlerResult>;

/**
 * Creates a standard Vercel serverless function default export from an event handler.
 */
export function createVercelHandler(handler: EventHandler) {
  return async function vercelFunction(req: VercelRequest, res: VercelResponse) {
    try {
      // Normalize body to string for event handler
      let bodyString: string | null = null;
      if (typeof req.body === 'string') {
        bodyString = req.body;
      } else if (req.body && typeof req.body === 'object') {
        bodyString = JSON.stringify(req.body);
      }

      // Normalize query parameters
      const queryParams: Record<string, string> = {};
      if (req.query && typeof req.query === 'object') {
        for (const [key, val] of Object.entries(req.query)) {
          queryParams[key] = Array.isArray(val) ? val[0] : String(val);
        }
      }

      const event = {
        httpMethod: req.method || 'GET',
        headers: req.headers || {},
        rawUrl: req.url || '',
        path: (req.url || '').split('?')[0],
        queryStringParameters: queryParams,
        body: bodyString,
      };

      const result = await handler(event);

      // Set headers
      if (result.headers) {
        for (const [headerKey, headerVal] of Object.entries(result.headers)) {
          res.setHeader(headerKey, headerVal);
        }
      }

      const statusCode = result.statusCode || 200;
      res.status(statusCode);

      if (result.body) {
        try {
          const parsed = JSON.parse(result.body);
          return res.json(parsed);
        } catch {
          return res.send(result.body);
        }
      }

      return res.end();
    } catch (err: any) {
      console.error('Error executing Vercel serverless function:', err);
      return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  };
}
