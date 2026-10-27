import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 2250);
const allowed = new Set(['index.html', 'styles.css', 'viewport.css', 'bridge.css', 'app.js', 'navigation.mjs', 'settlements.mjs', 'mining.mjs', 'bridge.mjs', 'bridge-model.mjs']);
http.createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.replace(/^\//, '') || 'index.html';
  if (!allowed.has(name)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await readFile(path.join(root, name));
    res.writeHead(200, { 'Content-Type': `${types[path.extname(name)] || 'text/plain'}; charset=utf-8`, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`SDF strategic command ready: http://127.0.0.1:${port}`));
