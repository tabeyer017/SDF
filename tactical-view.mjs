import { armamentTypes } from './tactical-model.mjs';
import { contactSymbol, contactGlyphScale, createRadarLegend, createShuttleTrackLayer } from './radar-symbol.mjs';
import { HUD_RANGE_KM, projectTacticalView, tacticalViewKeys, bridgeCombatActive, tacticalProjectiles, relativeShuttleTracks } from './tactical-view-model.mjs';
import { projectileStyles, burnThroughError, canEngageTarget, shipPerformance } from './combat-model.mjs';

const svg = (tag, attrs = {}, text) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
};
const el = (tag, className, text) => {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function createTacticalViewSurface({ direction, onHover, onLeave, onLock, onContextMenu, getLockState, contactLabel }) {
  const horizon = 180;
  const root = svg('svg', { viewBox: '0 0 640 360', class: 'tactical-view-surface', role: 'group', 'aria-label': `${direction} HUD · Heads Up Display` });
  root.append(svg('rect', { x: 1, y: 1, width: 638, height: 358, rx: 5, fill: '#07131d', stroke: '#6b99a9', 'stroke-width': 2 }));
  const label = svg('text', { x: 20, y: 28, class: 'tactical-view-label' }, direction.toUpperCase());
  const readout = svg('text', { x: 620, y: 28, 'text-anchor': 'end', class: 'tactical-view-readout' });
  root.append(label, readout);
  const grid = svg('g', { 'aria-hidden': 'true', fill: 'none', stroke: '#284555', 'stroke-width': 1 });
  grid.append(svg('path', { d: `M32 ${horizon}H288M352 ${horizon}H608`, stroke: '#78a7b7', 'stroke-dasharray': '9 7' }));
  for (const degree of [-60, -30, 30, 60]) {
    const y = 180 - degree / 90 * 128;
    grid.append(svg('path', { d: `M272 ${y}H368M320 ${y - 4}V${y + 4}` }), svg('text', { x: 376, y: y + 4, stroke: 'none', fill: '#7898a9', class: 'tactical-view-tick' }, `${degree > 0 ? '+' : ''}${degree}°`));
  }
  for (const x of [32, 176, 464, 608]) grid.append(svg('path', { d: `M${x} ${horizon - 6}V${horizon + 6}` }));
  root.append(grid);
  const reticle=svg('g', { class: 'tactical-view-crosshair', transform: `translate(320 ${horizon})`, fill: 'none', 'aria-hidden': 'true', 'pointer-events': 'none' });
  reticle.append(
    svg('path', { d: 'M-26 0H-7M7 0H26M0-22V-7M0 7V22', stroke: '#d4edf2', 'stroke-width': 2 }),
    svg('path', { d: 'M-21-4V4M21-4V4M-4-17H4M-4 17H4', stroke: '#83b5c5', 'stroke-width': 1 })
  );
  root.append(reticle);
  const fire = svg('g', { class: 'tactical-view-projectiles', 'pointer-events': 'none', 'aria-label': 'Weapon fire in flight' });
  const tracks = svg('g', { class: 'tactical-view-tracks' }),shuttles=createShuttleTrackLayer('hud-contact-glyph'); root.append(fire, tracks, shuttles.root);
  for (const [x, anchor, text] of [[20, 'start', '−45°'], [320, 'middle', 'SHIP PLANE'], [620, 'end', '+45°']]) root.append(svg('text', { x, y: 338, 'text-anchor': anchor, class: 'tactical-view-readout' }, text));
  const empty = svg('text', { x: 320, y: 294, 'text-anchor': 'middle', class: 'tactical-view-readout' }, 'NO CONTACTS IN THIS VIEW'); root.append(empty);
  const markers = new Map();
  const projectileMarkers = new Map();
  let contactCount = 0, projectileCount = 0, shuttleCount = 0;
  const updateEmpty = () => empty.setAttribute('visibility', contactCount || projectileCount || shuttleCount ? 'hidden' : 'visible');
  // Keep SVG text and inspection targets readable when the popup is narrow.
  const resize = new ResizeObserver(() => {
    const bounds = root.getBoundingClientRect(), scale = Math.min(bounds.width / 640, bounds.height / 360);
    if (scale <= 0) return;
    root.style.setProperty('--tactical-view-font', `${Math.max(11, 11 / scale)}px`);
    root.style.setProperty('--tactical-view-symbol-scale', Math.max(1, 1 / scale));
    root.style.setProperty('--hud-contact-scale', contactGlyphScale(scale));
  });
  resize.observe(root);
  return { root, refresh(contacts, range, nextDirection = direction) {
    direction = nextDirection; label.textContent = direction.toUpperCase();
    root.setAttribute('aria-label', `${direction} HUD · Heads Up Display`);
    const {lockedIds, priorities, activeId} = getLockState();
    const visible = new Set();
    for (const contact of contacts) {
      const point = projectTacticalView(contact, direction, range); if (!point) continue;
      visible.add(contact.id);
      let marker = markers.get(contact.id);
      if (!marker) {
        marker = svg('g', { class: 'tactical-view-contact', tabindex: 0, role: 'button', 'aria-haspopup': 'dialog', 'data-track': contact.id });
        marker.append(svg('circle', { r: 14, fill: 'transparent' }));
        const icon = svg('g', { class: 'tactical-view-glyph hud-contact-glyph' }); marker.append(icon);
        marker.onpointerenter = event => onHover(marker.contact, marker, event);
        marker.onpointermove = event => onHover(marker.contact, marker, event);
        marker.onpointerleave = onLeave; marker.onfocus = () => onHover(marker.contact, marker); marker.onblur = onLeave;
        marker.onclick = event => { if(event.button === 0) {event.stopPropagation(); onLock(marker.contact.id, event.ctrlKey);} };
        marker.oncontextmenu = event => onContextMenu(marker.contact.id, event, marker);
        marker.onkeydown = event => {
          if(event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) onContextMenu(marker.contact.id, event, marker);
          else if(event.key === 'Enter' || event.key === ' ') {event.preventDefault(); onLock(marker.contact.id, event.ctrlKey);}
        };
        tracks.append(marker); markers.set(contact.id, marker);
      }
      marker.contact = contact;
      const locked = lockedIds.includes(contact.id), priority = priorities[contact.id], signature = `${contact.type}:${locked ? priority : ''}`;
      if (marker.dataset.signature !== signature) {
        const glyph = marker.querySelector('.tactical-view-glyph');
        glyph.replaceChildren(contactSymbol(contact.type, 4.5));
        if(locked) glyph.append(svg('path', {d:'M-4.5-9H-9V-4.5M4.5-9H9V-4.5M-9 4.5V9H-4.5M9 4.5V9H4.5', fill:'none', stroke:'#f3dfaa', 'stroke-width':1.5}),svg('text',{x:0,y:contact.type==='neutral'?1.5:0,'text-anchor':'middle','dominant-baseline':'central',class:'hud-priority-number','aria-hidden':'true'},String(priority)));
        marker.dataset.signature = signature;
      }
      marker.classList.toggle('selected', locked); marker.classList.toggle('active-target', contact.id === activeId);
      marker.setAttribute('aria-pressed', String(locked));
      marker.setAttribute('transform', `translate(${point.x} ${point.y})`);
      marker.setAttribute('aria-label', contactLabel(contact));
    }
    for (const [id, marker] of markers) if (!visible.has(id)) { onLeave(marker); marker.remove(); markers.delete(id); }
    readout.textContent = `${range} KM · ${visible.size} TRACK${visible.size === 1 ? '' : 'S'}`;
    contactCount = visible.size; updateEmpty();
  }, refreshShuttles(tracks,range) {
    const visible = [];
    for(const track of tracks){const point=projectTacticalView(track,direction,range);if(point)visible.push({...track,...point});}
    shuttles.update(visible);shuttleCount=visible.length;updateEmpty();
  }, refreshProjectiles(projectiles) {
    const visible = new Set();
    for (const projectile of projectiles) {
      visible.add(projectile.id);
      const style = projectileStyles[projectile.affiliation];
      let marker = projectileMarkers.get(projectile.id);
      if (!marker) {
        marker = svg('g', {'data-shot': projectile.shotId});
        const glyph = svg('g', {class: 'tactical-view-glyph'}), depth = svg('g', {class: 'tactical-view-projectile-depth'});
        depth.append(projectile.missile ? svg('path', {class: 'tactical-view-fire-symbol', d: 'M7 0L-4-3V3Z'}) : svg('circle', {class: 'tactical-view-fire-symbol', r: 2.2}));
        glyph.append(depth); marker.append(svg('title'), glyph); fire.append(marker); projectileMarkers.set(projectile.id, marker);
      }
      marker.setAttribute('class', `tactical-view-projectile ${projectile.affiliation} ${projectile.missile ? 'missile' : 'cannon'}`);
      marker.setAttribute('transform', `translate(${projectile.x} ${projectile.y}) rotate(${projectile.angle})`);
      marker.querySelector('title').textContent = `${style.title} ${projectile.missile ? 'missile' : 'cannon round'} · ${armamentTypes[projectile.weapon]?.name ?? projectile.weapon} · ${projectile.distance.toFixed(1)} km`;
      marker.querySelector('.tactical-view-projectile-depth').setAttribute('transform', `scale(${projectile.scale})`);
      marker.querySelector('.tactical-view-fire-symbol').setAttribute('fill', style.color);
    }
    for (const [id, marker] of projectileMarkers) if (!visible.has(id)) { marker.remove(); projectileMarkers.delete(id); }
    projectileCount = projectiles.length; updateEmpty();
  } };
}

export function mountHud({root, flight, getContacts, getLockState, onLock, onHover, onLeave, onContextMenu, contactLabel}) {
  root.setAttribute('aria-label', 'HUD · Heads Up Display'); root.tabIndex = 0;
  let direction = 'forward';
  const nav = el('nav', 'tactical-view-nav'); nav.setAttribute('aria-label', 'HUD viewing direction');
  const surface = createTacticalViewSurface({direction, onHover, onLeave, onLock, onContextMenu, getLockState, contactLabel});
  const buttons = new Map();
  function choose(value) {direction = value; onLeave(); refresh();}
  for (const [view, key] of [['forward', '↑'], ['port', '←'], ['starboard', '→'], ['rear', '↓']]) {
    const button = el('button', '', `${key} ${view[0].toUpperCase()}${view.slice(1)}`); button.type = 'button'; button.onclick = () => choose(view); buttons.set(view, button); nav.append(button);
  }
  const status = el('p', 'tactical-view-status');
  const legend = createRadarLegend({className:'tactical-view-legend'});
  root.append(nav, status, surface.root, legend);
  root.addEventListener('keydown', event => {
    if(event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.target.closest('input,textarea,select,[role="textbox"],[contenteditable="true"]')) return;
    if(tacticalViewKeys[event.key]) {event.preventDefault(); choose(tacticalViewKeys[event.key]);}
  });
  const inTransit = () => !!flight?.inTransit();
  function refresh() {
    if(root.hidden) return;
    surface.refresh(inTransit() ? [] : getContacts(), HUD_RANGE_KM, direction);
    for(const [value, button] of buttons) button.setAttribute('aria-pressed', String(value === direction));
    status.textContent = inTransit() ? 'EPD TRANSIT · LOCAL HUD UNAVAILABLE' : `${direction.toUpperCase()} · HUD / HEADS UP DISPLAY`;
    refreshFlightTracks();
  }
  function refreshFlightTracks() {
    if(root.hidden) return;
    const transit = inTransit(), combat = flight?.combat, sector = flight?.sector;
    surface.refreshProjectiles(!transit && combat ? tacticalProjectiles(combat, sector, direction, HUD_RANGE_KM) : []);
    surface.refreshShuttles(!transit && combat ? relativeShuttleTracks(combat, sector, HUD_RANGE_KM) : [], HUD_RANGE_KM);
  }
  return {refresh, refreshFlightTracks, setDirection: choose, focusContact(id) {surface.root.querySelector(`[data-track="${id}"]`)?.focus({preventScroll:true});}};
}

export function mountTacticalView({flight, deck, targeting, acknowledgments}) {
  const dialog = el('dialog', 'tactical-view-dialog'); dialog.id = 'tactical-view-dialog'; dialog.setAttribute('aria-labelledby', 'tactical-view-title');
  const header = el('div', 'tactical-view-header'), title = el('h2', '', 'Captain’s Command View'); title.id = 'tactical-view-title';
  const close = el('button', 'tactical-view-close', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close HUD'); close.onclick = () => dialog.close(); header.append(title, close);
  const hudRoot = el('section', 'tactical-popup-hud');
  const hud = mountHud({root:hudRoot, flight, ...targeting, onLock:targeting.lock});
  const readiness = el('div', 'tactical-view-readiness');
  acknowledgments.mount(readiness);
  const commands=el('div','tactical-view-command-bar');
  commands.setAttribute('role','group');
  commands.setAttribute('aria-label','Captain’s commands');
  function command(label,action){
    const control=el('button','bridge-action',label);
    control.type='button';control.onclick=action;commands.append(control);
    return control;
  }
  function engageableTargets(){
    const {lockedIds,priorities}=targeting.getLockState();
    if(!lockedIds.length)return [];
    return targeting.getContacts().filter(contact=>lockedIds.includes(contact.id)&&!contact.stale&&canEngageTarget(flight.combat,contact.id))
      .sort((a,b)=>priorities[a.id]-priorities[b.id]).map(contact=>contact.id);
  }
  const engage=command('Engage Targets',()=>flight.engageTargets('engage',engageableTargets()));
  const cease=command('Cease Fire',()=>flight.ceaseFire());
  const chaff=command('Chaff',()=>flight.deployCountermeasures('chaff'));
  const flares=command('Flare',()=>flight.deployCountermeasures('flares'));
  const burn=command('Burn-Through',()=>flight.burnThrough());
  const port=command('Hard a Port',()=>flight.command('port'));
  const starboard=command('Hard a Starboard',()=>flight.command('starboard'));
  function refreshCommands(){
    const combat=flight.combat,ship=combat.own,performance=shipPerformance(ship);
    const local=!flight.inTransit(),free=local&&!combat.docked&&combat.service?.provider!=='tender';
    engage.disabled=!free||!performance.weapons||!performance.sensors||ship.surrendered||!engageableTargets().length;
    cease.disabled=!combat.engagement&&!combat.firing?.length&&!ship.mounts.some(mount=>mount.burst);
    for(const [control,type,label] of [[chaff,'chaff','Chaff'],[flares,'flares','Flare']]){
      const charges=ship.ammo[type]??0;
      control.disabled=!local||!performance.power||ship.surrendered||!charges;
      control.textContent=`${label} · ${charges}`;
    }
    const burnError=burnThroughError(combat);
    burn.disabled=!local||!!burnError;
    burn.title=burnError??'Pulse radar to restore tracking through jamming';
    port.disabled=starboard.disabled=!free||!performance.engines;
  }
  dialog.append(header, readiness, hudRoot, commands); document.body.append(dialog);
  const tooltipHome = targeting.tooltip.parentElement;
  targeting.subscribe(() => {if(dialog.open) {hud.refresh();refreshCommands();}});
  dialog.onclose = () => {targeting.onLeave(); tooltipHome.append(targeting.tooltip);};
  function open(view) {
    targeting.onLeave(); if(!dialog.open) dialog.showModal(); dialog.append(targeting.tooltip);
    if(view) hud.setDirection(view); hud.refresh();refreshCommands();hudRoot.focus({preventScroll:true});
  }
  window.addEventListener('keydown', event => {
    if(event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    if(event.target instanceof Element && (event.target.closest('input,textarea,select,[role="textbox"]') || event.target.isContentEditable)) return;
    if(document.body.dataset.menu === 'open' || document.querySelector('dialog[open]:not(#tactical-view-dialog)')) return;
    if(event.key.toLowerCase() === 'v') {event.preventDefault(); if(dialog.open) dialog.close(); else open();}
  });
  function refresh() {
    const active = !flight.inTransit() && bridgeCombatActive(flight.combat, flight.sector);
    deck.classList.toggle('blast-shields-down', active); deck.setAttribute('data-blast-shields', active ? 'down' : 'up');
    const scene = document.getElementById('bridge-main-display');
    if(active) scene.textContent = 'COMBAT · BLAST SHIELDS DOWN · HUD ONLINE';
    else if(scene?.textContent.startsWith('COMBAT ·')) scene.textContent = 'SOL SYSTEM / PATROL WATCH';
    if(dialog.open) {hud.refresh();refreshCommands();}
  }
  return {open, refresh, refreshFlightTracks() {if(dialog.open) hud.refreshFlightTracks();}};
}
