import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameAssetName, gameContentType } from './web-assets.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 2250);
http.createServer(async (req, res) => {
  const name = gameAssetName(new URL(req.url, 'http://localhost').pathname);
  if (!name) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await readFile(path.join(root, name));
    res.writeHead(200, { 'Content-Type': gameContentType(name), 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`SDF strategic command ready: http://127.0.0.1:${port}`));
