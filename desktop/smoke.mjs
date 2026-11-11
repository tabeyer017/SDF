import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { parseSave, SAVE_STORAGE_KEY } from '../save-game.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const release = path.join(root, 'release');
await mkdir(release, { recursive: true });
const testRoot = await realpath(release);
const scratch = await mkdtemp(path.join(testRoot, '.smoke-'));
const profile = path.join(scratch, 'profile');
const backup = path.join(scratch, 'patrol.json');
const executable = process.env.SDF_EXECUTABLE;
const errors = [];
let desktop;

async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  desktop = await electron.launch({
    ...(executable ? { executablePath: path.resolve(executable) } : {}),
    args: [...(executable ? [] : [root]), `--user-data-dir=${profile}`], env, timeout: 30000
  });
  const page = await desktop.firstWindow();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/^https?:/.test(request.url())) errors.push(`Unexpected network request: ${request.url()}`);
  });
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.locator('#start-title').waitFor();
  assert.equal(page.url(), 'sdf://game/');
  return page;
}

try {
  let page = await launch();
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const preferences = await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.sandbox, true);
  const fontsLoaded = await page.evaluate(async () => {
    const fonts = ['400 13px "DM Sans"', '600 30px "Barlow Condensed"', '400 11px "IBM Plex Mono"'];
    const faces = await Promise.all(fonts.map(font => document.fonts.load(font)));
    return faces.every(family => family.length && family.every(face => face.status === 'loaded'));
  });
  assert.ok(fontsLoaded, 'All three font families load from the app bundle');

  await page.locator('#menu-how-to-play').click();
  const openedManual = desktop.waitForEvent('window');
  await page.getByRole('link', { name: 'Open game manual (PDF)' }).click();
  const manual = await openedManual;
  await manual.waitForURL('sdf://game/docs/SDF-Game-Manual.pdf');
  await manual.waitForLoadState('load');
  const pdfSignature = await page.evaluate(async () => {
    const response = await fetch('/docs/SDF-Game-Manual.pdf');
    const data = await response.arrayBuffer();
    return new TextDecoder().decode(data.slice(0, 5));
  });
  assert.equal(pdfSignature, '%PDF-');
  await manual.close();
  await page.keyboard.press('Escape');

  await page.locator('#new-mission').click();
  await page.locator('#launch-mission').click();
  await page.keyboard.press('f');
  await page.getByRole('heading', { name: 'Flight Control', exact: true }).waitFor();
  await page.locator('.planet-item[data-id="mars"]').click();
  await page.locator('#add-waypoint').click();
  await page.locator('#engage-button').click();
  await page.waitForFunction(() => document.querySelector('#watch-location').textContent === 'Mars');
  await page.keyboard.press('t');
  await page.getByRole('heading', { name: 'Tactical / Security', exact: true }).waitFor();
  await page.keyboard.press('v');
  await page.locator('#tactical-view-dialog[open]').waitFor();
  await page.keyboard.press('Escape');

  await page.locator('#saves-button').click();
  await desktop.evaluate(({ session }, destination) => {
    session.defaultSession.once('will-download', (_event, item) => {
      item.setSavePath(destination);
      item.once('done', (_event, state) => { globalThis.sdfSmokeExport = state; });
    });
  }, backup);
  await page.locator('#download-save').click();
  const deadline = Date.now() + 10000;
  let exportState;
  while (!exportState && Date.now() < deadline) {
    exportState = await desktop.evaluate(() => globalThis.sdfSmokeExport);
    if (!exportState) await delay(100);
  }
  assert.equal(exportState, 'completed', 'The native download writes a JSON backup');
  const exported = parseSave(await readFile(backup, 'utf8'));
  assert.equal(exported.navigation.location, 'Mars');
  await desktop.close();
  desktop = undefined;

  page = await launch();
  await page.locator('#continue-mission').click();
  assert.equal(await page.locator('#watch-location').textContent(), 'Mars');
  assert.equal(await page.locator('#pause-button').textContent(), 'Run');
  await page.locator('#menu-button').click();
  await page.locator('#new-mission').click();
  await page.locator('#launch-mission').click();
  assert.equal(await page.locator('#watch-location').textContent(), 'Earth');
  await page.locator('#saves-button').click();
  await page.locator('#save-file').setInputFiles(backup);
  await page.locator('#load-save').click();
  assert.equal(await page.locator('#watch-location').textContent(), 'Mars');
  const autosave = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_STORAGE_KEY);
  assert.equal(autosave.bridge.combat.own.name, exported.bridge.combat.own.name);
  assert.deepEqual(errors, []);
  console.log('Desktop smoke passed: offline assets and manual, EPD arrival, Tactical/HUD, JSON export/import, and autosave across restarts.');
} finally {
  await desktop?.close();
  if (path.dirname(await realpath(scratch)) === testRoot) await rm(scratch, { recursive: true, maxRetries: 4, retryDelay: 100 });
}
