import { app, BrowserWindow, dialog, Menu, protocol, session } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gameAssetName, gameContentType, gameManual } from '../web-assets.mjs';
import { shipFiveViews } from '../tactical-model.mjs';

const scheme = 'sdf';
const host = 'game';
const gameUrl = `${scheme}://${host}/`;
const referenceAssets = new Set([gameManual, ...Object.values(shipFiveViews)]);
const rendererPreferences = { contextIsolation: true, nodeIntegration: false, sandbox: true };
const gamePolicy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const profile = app.commandLine.getSwitchValue('user-data-dir');
app.setPath('userData', profile ? path.resolve(profile) : path.join(app.getPath('appData'), 'Sol Defense Force'));

protocol.registerSchemesAsPrivileged([
  { scheme, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

function assetForUrl(value) {
  const url = new URL(value);
  if (url.protocol !== `${scheme}:` || url.host !== host || url.username || url.password) return null;
  return gameAssetName(url.pathname);
}

async function serveGame(request) {
  const name = assetForUrl(request.url);
  if (!name || request.method !== 'GET') return new Response('Not found', { status: 404 });
  const headers = { 'Content-Type': gameContentType(name), 'X-Content-Type-Options': 'nosniff' };
  if (name === 'index.html') headers['Content-Security-Policy'] = gamePolicy;
  try {
    return new Response(await readFile(path.join(app.getAppPath(), name)), { headers });
  } catch (error) {
    console.error(`Could not load SDF asset ${name}`, error);
    return new Response('Not found', { status: 404 });
  }
}

function preventNavigation(contents) {
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-redirect', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
}

let mainWindow;
async function openReference(name) {
  const window = new BrowserWindow({
    parent: mainWindow, width: 1100, height: 800, backgroundColor: '#101e29',
    webPreferences: { ...rendererPreferences, plugins: name === gameManual }
  });
  preventNavigation(window.webContents);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    await window.loadURL(new URL(name, gameUrl).href);
  } catch (error) {
    if (window.isDestroyed()) return;
    window.close();
    dialog.showErrorBox('Could not open SDF reference', error.message);
  }
}

async function openGame() {
  mainWindow = new BrowserWindow({
    title: 'Sol Defense Force Beta', width: 1452, height: 920, minWidth: 640, minHeight: 480,
    backgroundColor: '#080e17', show: false, webPreferences: rendererPreferences
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.once('closed', () => { mainWindow = null; });
  preventNavigation(mainWindow.webContents);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const name = assetForUrl(url);
    if (referenceAssets.has(name)) void openReference(name);
    return { action: 'deny' };
  });
  await mainWindow.loadURL(gameUrl);
}

function configureMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'close' }, { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }
    ] },
    { label: 'Help', submenu: [
      { label: 'Game Manual', click: () => void openReference(gameManual) },
      { label: 'About Sol Defense Force', click: () => dialog.showMessageBox(mainWindow, {
        type: 'info', title: 'Sol Defense Force', message: `Sol Defense Force ${app.getVersion()}`,
        detail: 'Private beta. Patrol progress autosaves on this device.'
      }) }
    ] }
  ]));
}

function startupFailed(error) {
  dialog.showErrorBox('Sol Defense Force could not start', error.message);
  app.exit(1);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.sdf.sol-defense-force');
    configureMenu();
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.on('will-download', (_event, item) => {
      const name = path.basename(item.getFilename());
      if (!/^sdf-save-[\dTZ-]+\.json$/.test(name)) return;
      item.setSaveDialogOptions({
        title: 'Export SDF patrol', defaultPath: path.join(app.getPath('downloads'), name),
        filters: [{ name: 'SDF patrol backup', extensions: ['json'] }]
      });
    });
    protocol.handle(scheme, serveGame);
    await openGame();
  }).catch(startupFailed);
}
