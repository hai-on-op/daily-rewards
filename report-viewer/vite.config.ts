import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Connect } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const REPORTS_DIR = path.resolve(PROJECT_ROOT, 'reports');

function createApiMiddleware(): Connect.Router {
  const router: Connect.Router = ((req: any, res: any, next: any) => next()) as any;

  (router as any).handle = (req: any, res: any, next: any) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/api/reports') {
      try {
        if (!fs.existsSync(REPORTS_DIR)) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ files: [] }));
          return;
        }
        const files = fs.readdirSync(REPORTS_DIR)
          .filter((f: string) => f.startsWith('daily-reward-report-') && f.endsWith('.json'))
          .sort()
          .reverse();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ files }));
      } catch (err: any) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err?.message || String(err) }));
      }
      return;
    }

    if (url.pathname === '/api/report') {
      const file = url.searchParams.get('file') || '';
      const abs = path.resolve(REPORTS_DIR, file);
      if (!abs.startsWith(path.resolve(REPORTS_DIR))) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Invalid path' }));
        return;
      }
      try {
        const data = fs.readFileSync(abs, 'utf8');
        res.setHeader('Content-Type', 'application/json');
        res.end(data);
      } catch (err: any) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: err?.message || String(err) }));
      }
      return;
    }

    next();
  };

  return router;
}

export default defineConfig({
  server: {
    fs: {
      allow: [__dirname, PROJECT_ROOT, REPORTS_DIR],
    },
    port: 5176,
  },
  plugins: [
    {
      name: 'reports-api',
      configureServer(server) {
        server.middlewares.use(createApiMiddleware());
      },
    },
  ],
});
