import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Connect } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEBUG_DATA_DIR = process.env.VITE_DEBUG_DATA_DIR || path.resolve(PROJECT_ROOT, 'debug-data');

type DirNode = {
  type: 'dir';
  name: string;
  path: string;
  children: Array<DirNode | FileNode>;
};

type FileNode = {
  type: 'file';
  name: string;
  path: string;
  size: number;
};

function listDirectory(rootDir: string, basePath = ''): DirNode {
  const abs = path.resolve(rootDir, basePath);
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  const children: Array<DirNode | FileNode> = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relPath = path.join(basePath, entry.name);
    const fullPath = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      children.push(listDirectory(rootDir, relPath));
    } else if (entry.isFile()) {
      // Only surface JSON files
      if (!entry.name.toLowerCase().endsWith('.json')) continue;
      const stat = fs.statSync(fullPath);
      children.push({ type: 'file', name: entry.name, path: relPath, size: stat.size });
    }
  }
  return { type: 'dir', name: path.basename(basePath || rootDir), path: basePath || '', children };
}

function createApiMiddleware(): Connect.Router {
  const router: Connect.Router = ((req, res, next) => next()) as any;

  (router as any).handle = (req: any, res: any, next: any) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/list') {
      try {
        const tree = listDirectory(DEBUG_DATA_DIR);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ root: tree, base: DEBUG_DATA_DIR }));
      } catch (err: any) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err?.message || String(err) }));
      }
      return;
    }
    if (url.pathname === '/api/file') {
      const rel = url.searchParams.get('path') || '';
      const abs = path.resolve(DEBUG_DATA_DIR, rel);
      // Security: ensure the resolved path stays within DEBUG_DATA_DIR
      if (!abs.startsWith(path.resolve(DEBUG_DATA_DIR))) {
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
      // Allow serving viewer src, project root, and debug-data directory
      allow: [
        __dirname,
        PROJECT_ROOT,
        DEBUG_DATA_DIR
      ]
    },
    port: 5174
  },
  plugins: [
    {
      name: 'debug-data-api',
      configureServer(server) {
        server.middlewares.use(createApiMiddleware());
      }
    }
  ]
});


