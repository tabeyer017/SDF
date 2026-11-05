import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shipFiveViews } from './tactical-model.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png' };
const port = Number(process.env.PORT || 2250);
const allowed = new Set(['index.html', 'styles.css', 'viewport.css', 'bridge.css', 'app.js', 'navigation.mjs', 'settlements.mjs', 'mining.mjs', 'bridge.mjs', 'bridge-model.mjs', 'tactical.mjs', 'tactical-model.mjs', 'sector-model.mjs', 'sector-console.mjs']);
allowed.add('encounter-model.mjs');
allowed.add('sector-bodies.mjs');
allowed.add('save-game.mjs');
allowed.add('save-ui.mjs');
allowed.add('combat-model.mjs');
allowed.add('combat-console.mjs');
allowed.add('combat-save.mjs');
allowed.add('communications-model.mjs');
allowed.add('communications-console.mjs');
allowed.add('start-screen.css');
allowed.add('start-menu.mjs');
for (const image of Object.values(shipFiveViews)) allowed.add(image);
allowed.add('images/sdf-frigate-angled.png');
http.createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.replace(/^\//, '') || 'index.html';
  if (!allowed.has(name)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await readFile(path.join(root, name));
    const extension = path.extname(name);
    res.writeHead(200, { 'Content-Type': `${types[extension] || 'text/plain'}${extension === '.png' ? '' : '; charset=utf-8'}`, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`SDF strategic command ready: http://127.0.0.1:${port}`));
