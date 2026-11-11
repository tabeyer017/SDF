import path from 'node:path';
import { shipFiveViews } from './tactical-model.mjs';

export const gameManual = 'docs/SDF-Game-Manual.pdf';
export const gameAssets = new Set([
  'index.html', 'styles.css', 'viewport.css', 'bridge.css', 'start-screen.css',
  'app.js', 'navigation.mjs', 'settlements.mjs', 'mining.mjs', 'bridge.mjs',
  'bridge-model.mjs', 'bridge-deck.mjs', 'tactical.mjs', 'tactical-model.mjs',
  'tactical-view.mjs', 'tactical-view-model.mjs', 'radar-symbol.mjs', 'sector-model.mjs',
  'sector-console.mjs', 'sector-bodies.mjs', 'encounter-model.mjs', 'save-game.mjs',
  'save-ui.mjs', 'combat-model.mjs', 'combat-console.mjs', 'combat-save.mjs',
  'boarding-model.mjs', 'communications-model.mjs', 'communications-console.mjs',
  'start-menu.mjs', 'ship-names.mjs', 'images/sdf-frigate-side-view-transparent.png',
  'fonts.css',
  'fonts/barlow-condensed-latin-400-normal.woff2',
  'fonts/barlow-condensed-latin-500-normal.woff2',
  'fonts/barlow-condensed-latin-600-normal.woff2',
  'fonts/barlow-condensed-latin-700-normal.woff2',
  'fonts/dm-sans-latin-400-normal.woff2',
  'fonts/dm-sans-latin-500-normal.woff2',
  'fonts/dm-sans-latin-600-normal.woff2',
  'fonts/dm-sans-latin-700-normal.woff2',
  'fonts/ibm-plex-mono-latin-400-normal.woff2',
  'fonts/ibm-plex-mono-latin-500-normal.woff2',
  gameManual, ...Object.values(shipFiveViews)
]);

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf',
  '.woff2': 'font/woff2'
};

export function gameAssetName(pathname) {
  const name = pathname.slice(1) || 'index.html';
  return gameAssets.has(name) ? name : null;
}

export function gameContentType(name) {
  return contentTypes[path.extname(name)] ?? 'application/octet-stream';
}
