import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { parseSave, SAVE_STORAGE_KEY } from '../save-game.mjs';
import { createSector } from '../sector-model.mjs';
import { createCombat } from '../combat-model.mjs';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
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
  await page.keyboard.press('b');
  const deck = page.locator('#bridge-deck');
  await deck.waitFor();
  assert.equal(await deck.getAttribute('viewBox'), '30 -42 940 700');
  assert.equal(await deck.locator('.bridge-deck-station[role="button"][tabindex="0"][aria-describedby]').count(), 5);
  assert.equal(await deck.locator('.bridge-tactical-screen[role="button"][tabindex="0"]').count(), 3);
  assert.equal(await deck.locator('.bridge-perspective-label:visible').count(), 0);
  const commsStation = deck.locator('.bridge-deck-station[data-bridge-area="communications"]');
  const commsLabel = deck.locator('.bridge-perspective-label[data-bridge-area="communications"]');
  await commsStation.dispatchEvent('pointerenter');
  await commsLabel.waitFor();
  assert.equal(await commsLabel.textContent(), 'COMMUNICATIONS');
  assert.equal(await commsLabel.locator('circle').count(), 0);
  await commsStation.dispatchEvent('pointerleave');
  await commsLabel.waitFor({ state: 'hidden' });
  await page.keyboard.press('Tab');
  await commsStation.focus();
  await commsLabel.waitFor();
  await commsStation.blur();
  await commsLabel.waitFor({ state: 'hidden' });
  const commanderChair = deck.getByRole('button', { name: 'Open Bridge Command' });
  await commanderChair.click();
  await page.locator('#briefing-dialog[open] #briefing-mission').waitFor();
  await page.keyboard.press('Escape');
  await commanderChair.press('Enter');
  await page.locator('#briefing-dialog[open] #briefing-mission').waitFor();
  await page.keyboard.press('Escape');
  const overhead = () => deck.locator('.bridge-overhead-lights').evaluate(light => getComputedStyle(light).color);
  assert.equal(await overhead(), 'rgb(159, 223, 237)');
  await page.locator('.bridge-deck-footer').getByRole('button', { name: 'Battle Stations' }).click();
  assert.equal(await deck.evaluate(svg => svg.classList.contains('heightened-watch')), true);
  assert.equal(await overhead(), 'rgb(255, 208, 139)');
  await page.locator('#bridge-station-detail').getByRole('button', { name: 'Return to routine watch' }).click();
  assert.equal(await overhead(), 'rgb(159, 223, 237)');
  const forwardMonitor = deck.getByRole('button', { name: 'Open forward HUD' });
  await forwardMonitor.press('Enter');
  await page.locator('#tactical-view-dialog[open]').waitFor();
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  await page.getByRole('heading', { name: 'Flight Control', exact: true }).waitFor();
  await page.locator('.planet-item[data-id="mars"]').click();
  await page.locator('#add-waypoint').click();
  await page.locator('#engage-button').click();
  await page.waitForFunction(() => document.querySelector('#watch-location').textContent === 'Mars');
  await page.keyboard.press('t');
  await page.getByRole('heading', { name: 'Tactical / Security', exact: true }).waitFor();
  await page.keyboard.press('v');
  const hud = page.locator('#tactical-view-dialog[open]');
  await hud.waitFor();
  await hud.locator('.tactical-view-crosshair[transform="translate(320 180)"] >> visible=true').waitFor();
  await hud.getByText('SHIP PLANE', { exact: true }).filter({ visible: true }).waitFor();
  const commands = hud.getByRole('group', { name: 'Captain’s commands' });
  assert.equal(await commands.getByRole('button', { name: 'Engage Targets' }).isDisabled(), true);
  assert.equal(await commands.getByRole('button', { name: 'Cease Fire' }).isDisabled(), true);
  await commands.getByRole('button', { name: 'Chaff · 30' }).click();
  await commands.getByRole('button', { name: 'Chaff · 29' }).waitFor();
  await commands.getByRole('button', { name: 'Hard a Starboard' }).click();
  await hud.getByRole('button', { name: 'Battle Stations' }).click();
  await hud.getByRole('status', { name: 'Station Officer Acknowledgment Ticker' }).waitFor();
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
  assert.equal(exported.bridge.settings.watch, 'heightened');
  assert.equal(exported.bridge.combat.own.radar, true);
  assert.equal(exported.bridge.combat.own.ciwsAuto, true);
  assert.equal(exported.bridge.combat.own.jammerMode, 'auto');
  assert.equal(exported.bridge.combat.own.ammo.chaff, 29);
  assert.ok(exported.bridge.sector.facing.x > .6, 'Hard a Starboard turns the bow from sector north');
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

  // Give fire control two live contacts in range so the popup's scope is observable.
  await page.locator('#menu-button').click();
  await page.locator('#new-mission').click();
  await page.locator('#launch-mission').click();
  const patrol = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), SAVE_STORAGE_KEY);
  assert.match(await page.locator('.start-footer').textContent(), /PHASE 02.*v0\.2/);
  const sector = createSector();
  Object.assign(sector.contacts.find(contact => contact.id === 'E-04'), { x: 0, y: 15, z: 0, vx: 0, vy: 0, vz: 0 });
  Object.assign(sector.contacts.find(contact => contact.id === 'E-06'), { x: 0, y: 22, z: 0, vx: 0, vy: 0, vz: 0 });
  Object.assign(sector.contacts.find(contact => contact.id === 'U-01'), { x: 6, y: 2, z: 0, vx: 0, vy: 0, vz: 0 });
  Object.assign(patrol.bridge, { sector, combat: createCombat(sector.contacts) });
  patrol.bridge.combat.contacts['U-01'].breach = true;
  patrol.bridge.combat.own.autoRepair = false;
  patrol.bridge.combat.own.systems['engine-1'].hp = 40;
  await page.locator('#saves-button').click();
  await page.locator('#save-file').setInputFiles({
    name: 'fire-control.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(patrol))
  });
  await page.locator('#load-save').click();
  const savedCombat = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).bridge.combat, SAVE_STORAGE_KEY);
  await page.keyboard.press('e');
  const engineeringDiagram = page.getByRole('region', { name: 'Ship damage diagram' });
  const engineMarker = engineeringDiagram.locator('button[data-system-id="engine-1"]');
  await engineMarker.focus();
  assert.match(await engineMarker.getAttribute('aria-label'), /40 \/ 120 HP · critical/);
  await engineMarker.press('Enter');
  assert.ok((await savedCombat()).own.jobs.some(job => job.systemId === 'engine-1'));
  await engineMarker.press('Enter');
  assert.ok((await savedCombat()).own.repairHolds.includes('engine-1'));
  assert.equal(await engineMarker.evaluate(marker => marker === document.activeElement), true);
  await page.keyboard.press('t');
  await page.locator('#tactical-right-button-weapons').click();
  await page.locator('#tactical-left-button-radar').click();
  const fireControl = page.locator('#tactical-right-display-weapons');
  const doctrine = fireControl.getByRole('group', { name: 'Engagement Doctrine' });
  const salvos = fireControl.getByRole('group', { name: 'Salvo Weight' });
  const battery = fireControl.getByRole('group', { name: 'Battery Quick-Fire' });
  const manualMounts = fireControl.locator('details.manual-mount-override');
  assert.equal(await manualMounts.evaluate(details => details.open), false);
  await manualMounts.getByText('Individual Mounts (Manual)').click();
  await manualMounts.getByRole('checkbox', { name: /Select .*Autocannon/ }).first().waitFor();
  await manualMounts.getByText('Individual Mounts (Manual)').click();
  for (const [label, missiles, rounds] of [['Light', 1, 1], ['Standard', 5, 5], ['Heavy', 10, 20]]) {
    const control = salvos.getByRole('button', { name: label });
    await control.click();
    const combat = await savedCombat();
    assert.equal(combat.missileVolleySize, missiles);
    assert.equal(combat.cannonBurstSize, rounds);
    assert.equal(await control.getAttribute('aria-pressed'), 'true');
  }
  await page.getByRole('button', { name: 'Radar range 100 km' }).click();
  const radar = page.locator('#tactical-left-display-radar');
  const firstTrack = radar.locator('.radar-track[data-track="E-04"]');
  await firstTrack.dispatchEvent('click', { button: 0 });
  await page.locator('#tactical-right-button-defense').click();
  const targetDiagram = page.locator('#tactical-right-display-defense').getByRole('region', { name: 'Target damage diagram' });
  const ciwsMarker = targetDiagram.locator('button[data-system-id="ciws-30-1"]');
  await ciwsMarker.click();
  assert.match(await targetDiagram.getByRole('status').textContent(), /CIWS mounts assigned to 1 of 1 selected mounts/);
  assert.equal(await ciwsMarker.getAttribute('aria-pressed'), 'true');
  await page.locator('#tactical-right-button-weapons').click();
  await manualMounts.getByText('Individual Mounts (Manual)').click();
  assert.equal(await manualMounts.getByRole('combobox', { name: /Aim at system · 120 mm Autocannon/ }).first().inputValue(), 'ciws');
  await manualMounts.getByText('Individual Mounts (Manual)').click();
  const continuous = battery.getByRole('button', { name: 'Continuous · Main Guns' });
  await continuous.click();
  assert.equal(await continuous.getAttribute('aria-pressed'), 'true');
  assert.ok((await savedCombat()).firing.every(order => order.targetId === 'E-04' && order.component === 'hull'));
  await continuous.click();
  assert.equal((await savedCombat()).firing, null);
  await radar.locator('.radar-track[data-track="E-06"]').dispatchEvent('contextmenu', { clientX: 240, clientY: 300 });
  await page.getByRole('button', { name: 'Confirm priority' }).click();
  const quick = page.locator('.radar-fire-popup:popover-open');
  for (const [label, weapon] of [['MP Salvo', 'mp-missiles'], ['AS Strike', 'as-missiles']]) {
    const before = (await savedCombat()).own.ammo[weapon];
    await quick.getByRole('button', { name: label, exact: true }).click();
    assert.equal((await savedCombat()).own.ammo[weapon], before - 10);
  }
  await quick.getByRole('button', { name: 'Disable', exact: true }).click();
  const boarding = await savedCombat();
  assert.equal(boarding.engagement.objective, 'boarding');
  assert.deepEqual(boarding.engagement.targetIds, ['E-06']);
  assert.ok(boarding.firing.every(order => !order.mountId.startsWith('as-missiles')));
  await quick.getByRole('button', { name: 'Cease All Fire' }).click();
  assert.equal((await savedCombat()).engagement ?? null, null);
  await quick.getByRole('button', { name: 'Engage', exact: true }).click();
  assert.equal((await savedCombat()).engagement.objective, 'engage');
  assert.deepEqual((await savedCombat()).engagement.targetIds, ['E-06']);
  await quick.getByRole('button', { name: 'Cease All Fire' }).click();
  await quick.getByRole('button', { name: 'Close quick fire control' }).click();
  await doctrine.getByRole('button', { name: 'Defang', exact: true }).click();
  assert.equal((await savedCombat()).engagement.objective, 'defang');
  await fireControl.getByRole('button', { name: 'Cease All Fire' }).click();

  await page.keyboard.press('c');
  const comms = page.getByRole('region', { name: 'Communications console' });
  const channels = comms.getByRole('complementary', { name: 'Channels' });
  const feed = comms.getByRole('region', { name: 'Dispatch & Hail Feed' });
  const hail = feed.getByRole('region', { name: 'Quick Hail' });
  const channel = id => channels.locator(`[data-channel-id="${id}"]`);
  const savedBridge = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)).bridge, SAVE_STORAGE_KEY);
  const paneLayout = () => comms.locator('.comms-workspace').evaluate(workspace => {
    const panes = Array.from(workspace.children, pane => pane.getBoundingClientRect());
    return {
      columns: new Set(panes.map(pane => pane.left)).size,
      overflows: workspace.scrollWidth > workspace.clientWidth,
      overlaps: panes.some((pane, i) => panes.slice(i + 1).some(other =>
        pane.left < other.right && other.left < pane.right && pane.top < other.bottom && other.top < pane.bottom))
    };
  });
  await comms.waitFor();
  assert.deepEqual(await paneLayout(), { columns: 2, overflows: false, overlaps: false });
  assert.equal(await comms.getByRole('region', { name: 'Shuttle Ops' }).count(), 0);
  assert.equal(await channels.locator('button.comms-recipient').first().getAttribute('data-channel-id'), 'hq');
  await hail.getByRole('button', { name: 'Request Orders', exact: true }).waitFor();
  await hail.getByRole('button', { name: 'Request Repair Tender', exact: true }).waitFor();
  await channels.getByRole('button', { name: 'Unread', exact: true }).click();
  const distress = channel('ship:0:U-01');
  assert.match(await distress.textContent(), /TRK-01.*Distress.*unread/);
  await channels.getByRole('button', { name: 'Ships', exact: true }).click();
  assert.equal(await channels.locator('.comms-channel-list button').first().getAttribute('data-channel-id'), 'ship:0:U-01');
  await distress.click();
  await hail.getByRole('button', { name: 'Offer Assistance', exact: true }).click();
  await feed.getByText('Re: Offer assistance', { exact: true }).waitFor();
  assert.ok(await feed.locator('.comms-message-meta time').count() >= 2);
  await feed.getByLabel('Custom transmission').fill('Keep your repair team on standby.');
  await feed.getByRole('button', { name: 'Transmit', exact: true }).click();
  await feed.getByText(/Keep your repair team on standby/).waitFor();
  await channel('ship:0:E-04').click();
  await hail.getByRole('button', { name: 'Demand Surrender', exact: true }).waitFor();
  await hail.getByRole('button', { name: 'Propose Cease-Fire', exact: true }).waitFor();
  await channel('ship:0:F-03').click();
  await hail.getByRole('button', { name: 'Request Fire Support', exact: true }).waitFor();
  await channels.getByRole('button', { name: 'Stations', exact: true }).click();
  await channel('moon-station').click();
  await hail.getByRole('button', { name: 'Request Repair Tender', exact: true }).waitFor();

  await page.keyboard.press('t');
  await page.locator('#tactical-right-button-defense').click();
  const shuttles = page.locator('#tactical-right-display-defense').getByRole('region', { name: 'Shuttle Ops' });
  assert.equal(await shuttles.getByLabel('Shuttle target').inputValue(), 'E-06');
  await shuttles.getByLabel('Shuttle target').selectOption('U-01');
  assert.equal((await savedBridge()).tactical.activeId, 'U-01');
  const firstShuttle = shuttles.getByRole('region', { name: 'Shuttle 1' });
  await firstShuttle.getByRole('button', { name: 'Assist Crew', exact: true }).click();
  const launched = (await savedCombat()).boarding.shuttles[0];
  assert.equal(launched.status, 'outbound');
  assert.equal(launched.targetId, 'U-01');
  assert.equal(launched.order, 'assist');
  await firstShuttle.getByText(/km to target/).waitFor();
  await page.keyboard.press('b');
  await page.locator('#dismiss-communication-alert').click();
  await page.locator('#command-shuttles').getByRole('button', { name: /Shuttle 1/ }).click();
  await shuttles.getByRole('heading', { name: 'Shuttle Ops' }).waitFor();
  await firstShuttle.getByRole('button', { name: 'Recall shuttle 1' }).click();
  assert.ok(['returning', 'ready'].includes((await savedCombat()).boarding.shuttles[0].status));
  await shuttles.getByRole('region', { name: 'Shuttle 2' }).getByRole('button', { name: 'Explore / Search', exact: true }).waitFor();
  await page.keyboard.press('c');
  await desktop.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(430, 820));
  await page.waitForFunction(() => innerWidth < 780);
  assert.deepEqual(await paneLayout(), { columns: 1, overflows: false, overlaps: false });
  await channels.getByRole('button', { name: 'All', exact: true }).click();
  await channel('hq').click();
  await hail.getByRole('button', { name: 'Request Orders', exact: true }).click();
  const dispatch = (await savedBridge()).communications;
  const assignment = dispatch.messages.find(message => message.id === dispatch.mission.id);
  await channel(assignment.channelId).click();
  await feed.getByRole('button', { name: 'Show on System Map', exact: true }).click();
  await page.locator('#bridge-console[data-station="system-map"]').waitFor();
  assert.equal(await page.locator('#destination-name').textContent(), dispatch.mission.destination.name);
  assert.deepEqual(errors, []);
  console.log('Desktop smoke passed: offline assets, EPD arrival, HUD crosshair, Tactical fire control and Shuttle Ops, responsive Comms, and saves.');
} finally {
  await desktop?.close();
  if (path.dirname(await realpath(scratch)) === testRoot) await rm(scratch, { recursive: true, maxRetries: 4, retryDelay: 100 });
}
