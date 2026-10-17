/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import dotenv from 'dotenv';

// Load .env variables into process.env for local serverless functions execution
dotenv.config();

/**
 * Local development middleware for Vercel API routes (/api/*).
 * Discovers and executes TypeScript handlers from the root api/ directory.
 */
function vercelApiDevPlugin() {
  return {
    name: 'vercel-api-dev-middleware',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        const url = new URL(req.url, `http://${req.headers.host || 'localhost:5173'}`);
        const cleanPath = url.pathname.replace(/^\/api\//, '');
        const functionName = cleanPath.split('/')[0].split('?')[0];

        try {
          const modPath = path.resolve(__dirname, `api/${functionName}.ts`);
          const mod = await server.ssrLoadModule(modPath);
          if (!mod || (!mod.handler && !mod.default)) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: `API route "${functionName}" not found.` }));
            return;
          }

          let body = '';
          for await (const chunk of req) {
            body += chunk;
          }

          const query: Record<string, string> = {};
          url.searchParams.forEach((val, key) => {
            query[key] = val;
          });

          const event = {
            httpMethod: req.method || 'GET',
            headers: req.headers,
            rawUrl: req.url,
            path: url.pathname,
            queryStringParameters: query,
            body: body || null,
          };

          const eventHandler = mod.handler;
          if (eventHandler) {
            const response = await eventHandler(event, {});
            res.statusCode = response.statusCode || 200;
            let contentTypeSet = false;
            if (response.headers) {
              Object.entries(response.headers).forEach(([k, v]) => {
                if (k.toLowerCase() === 'content-type') contentTypeSet = true;
                res.setHeader(k, v as string);
              });
            }
            if (!contentTypeSet) {
              res.setHeader('Content-Type', 'application/json');
            }
            res.end(response.body);
          } else if (typeof mod.default === 'function') {
            await mod.default(req, res);
          }
        } catch (err: any) {
          console.error(`Error in API endpoint "${functionName}":`, err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || 'API function execution error' }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), vercelApiDevPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    host: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
});
