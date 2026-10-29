import { radarRanges, contactTypes, armamentTypes, countermeasureTypes, armamentLabel, shipTypes, trainingContacts, contactDistance, contactSpeed, contactClosureRate, contactsInRange, rangeRings, projectContact, projectVelocity, selectTargets, observeContact, IFF_RANGE_KM, IFF_IDENTIFICATION_CHANCE } from './tactical-model.mjs';
import { mountManeuverControls, flightReadout } from './sector-console.mjs';

export function mountTactical({ root, range, onRangeChange, flight, onNavigate }) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, className, text) => { const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const svg = (tag, attrs = {}, text) => { const node = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };
  const compact = matchMedia('(max-width: 650px)');
  let contacts = flight ? flight.contacts() : trainingContacts.map(observeContact);
  const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Number(Math.abs(value).toFixed(1))}`;
  const signClass = value => value > 0 ? 'positive' : value < 0 ? 'negative' : 'zero';
  const zText = contact => `Z ${signed(contact.z)} km · ${contact.z === 0 ? 'Same plane' : contact.z > 0 ? 'Above' : 'Below'}`;
  const yText = contact => `Y ${signed(contact.y)} km · ${contact.y === 0 ? 'Alongside' : contact.y > 0 ? 'In front' : 'Behind'}`;
  const speedText = contact => `${Math.round(contactSpeed(contact)).toLocaleString('en-US')} KPH`;
  function closureReadout(contact) {
    const rate = contactClosureRate(contact);
    if (rate === null) return { text: 'Vc — · Co-located', className: 'zero' };
    const rounded = Math.round(rate);
    const direction = rounded > 0 ? 'Closing' : rounded < 0 ? 'Opening' : 'Steady range';
    const value = `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded).toLocaleString('en-US')}`;
    return { text: `Vc ${value} KPH · ${direction}`, className: signClass(rounded) };
  }
  let lockedIds = [], activeId = null, mode = 'radar', hoverMarker = null;

  const heading = el('div', 'tactical-heading');
  const title = el('div', ''); title.append(el('span', 'tactical-eyebrow', 'TACTICAL / WEAPONS CONTROL'), el('h2', '', 'Local contact picture'));
  const headingActions = el('div', 'tactical-heading-actions');
  const catalogButton = el('button', 'armament-catalog-trigger', 'Armament catalog ↗');
  headingActions.append(catalogButton, el('span', 'tactical-posture', 'WEAPONS SAFED'));heading.append(title, headingActions);
  const toolbar = el('div', 'tactical-toolbar');
  const rangeGroup = el('div', 'radar-range'); rangeGroup.setAttribute('role', 'group'); rangeGroup.setAttribute('aria-label', 'Radar range');
  rangeGroup.append(el('span', '', 'RANGE · KM'));
  const rangeButtons = radarRanges.map(value => {
    const button = el('button', '', String(value)); button.type = 'button'; button.setAttribute('aria-label', `Radar range ${value} km`);
    button.onclick = () => { range = value; onRangeChange(value); render(); }; rangeGroup.append(button); return button;
  });
  const sensorStatus = el('div', 'radar-sensor-status');
  const count = el('span', 'radar-count'); count.setAttribute('role', 'status');
  sensorStatus.append(count, el('span', 'radar-iff-status', `IFF · ${IFF_RANGE_KM} KM · ~${IFF_IDENTIFICATION_CHANCE * 100}% IDENTIFICATION`)); toolbar.append(rangeGroup, sensorStatus);

  const tabs = el('div', 'tactical-layout-tabs'); tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', 'Tactical views');
  const radarTab = el('button', '', 'Radar screens'); radarTab.setAttribute('aria-controls', 'tactical-radar-area');
  const targetTab = el('button', '', 'Target details'); targetTab.setAttribute('aria-controls', 'tactical-target-panel');
  radarTab.onclick = () => setMode('radar'); targetTab.onclick = () => setMode('target'); tabs.append(radarTab, targetTab);
  const workspace = el('div', 'tactical-workspace');
  const radarArea = el('div', 'tactical-radar-area'); radarArea.id = 'tactical-radar-area';
  const screens = el('div', 'radar-screens');
  const charts = ['top', 'rear'].map(view => {
    const card = el('section', 'radar-card'); card.setAttribute('aria-label', `${view === 'top' ? 'Top' : 'Rear'} radar screen`);
    const caption = el('div', 'radar-caption'); caption.append(el('h3', '', view === 'top' ? '01 / TOP VIEW' : '02 / REAR VIEW'), el('span', '', view === 'top' ? 'X / Y · HORIZONTAL' : 'X / Z · ELEVATION'));
    const chart = svg('svg', { viewBox: '-200 -200 400 400', role: 'group', 'aria-label': view === 'top' ? 'Top radar: X starboard, Y forward' : 'Rear radar looking forward: X starboard, Z above' });
    card.append(caption, chart); screens.append(card); return { view, chart };
  });
  const legend = el('div', 'radar-legend'); legend.setAttribute('aria-label', 'Target classifications');
  function symbol(type, size = 6) {
    const attrs = { fill: contactTypes[type].color, stroke: contactTypes[type].color, 'stroke-width': 1.4 };
    if (type === 'unknown') return svg('path', { ...attrs, d: `M0 ${-size} ${size} 0 0 ${size} ${-size} 0Z` });
    if (type === 'neutral') return svg('path', { ...attrs, d: `M0 ${-size} ${size} ${size} ${-size} ${size}Z` });
    if (type === 'friendly') return svg('circle', { ...attrs, r: size });
    return svg('rect', { ...attrs, x: -size, y: -size, width: size * 2, height: size * 2 });
  }
  for (const [type, info] of Object.entries(contactTypes)) {
    const item = el('span', ''); const icon = svg('svg', { viewBox: '-10 -10 20 20', 'aria-hidden': 'true' }); icon.append(symbol(type)); item.append(icon, document.createTextNode(info.label)); legend.append(item);
  }
  const selection = el('div', 'tactical-contact');
  const label = el('label', 'radar-contact-picker'); label.append(el('span', '', 'LOCK TARGET'));
  const picker = el('select', ''); picker.setAttribute('aria-label', 'Lock radar track'); picker.onchange = () => { if (picker.value) lock(picker.value); }; label.append(picker);
  const hint = el('span', 'radar-interaction-hint', 'Left-click: one target · Ctrl + left-click: add / remove'); selection.append(label, hint);
  radarArea.append(screens, legend, selection);

  const targetPanel = el('aside', 'tactical-target-panel'); targetPanel.id = 'tactical-target-panel'; targetPanel.setAttribute('aria-label', 'Locked target ship details');
  const note = el('div', 'tactical-note');const flightStatus=el('span','','');note.append(flightStatus, el('span', '', 'LOCAL SIMULATION · FICTIONAL SHIP FITS · WEAPONS SAFED'));
  workspace.append(radarArea, targetPanel);
  const tooltip = el('div', 'radar-tooltip'); tooltip.id = 'radar-track-tooltip'; tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true;
  root.append(heading, toolbar, tabs, workspace, note, tooltip);

  const shipDialog = el('dialog', 'ship-reference-dialog');
  shipDialog.id = 'ship-reference-dialog'; shipDialog.setAttribute('aria-labelledby', 'ship-reference-title');
  const referenceHeader = el('div', 'ship-reference-header');
  const referenceHeading = el('div', ''); referenceHeading.append(el('span', 'tactical-eyebrow', 'SHIP REFERENCE / FIVE VIEWS'));
  const referenceTitle = el('h2', ''); referenceTitle.id = 'ship-reference-title'; referenceHeading.append(referenceTitle);
  const closeReference = el('button', 'ship-reference-close', '×'); closeReference.type = 'button'; closeReference.setAttribute('aria-label', 'Close ship reference'); closeReference.autofocus = true;
  closeReference.onclick = () => shipDialog.close(); referenceHeader.append(referenceHeading, closeReference);
  const referenceFigure = el('figure', 'ship-reference-figure');
  const imageStage = el('div', 'ship-reference-stage');
  const referenceImage = el('img', 'ship-reference-image'); referenceImage.decoding = 'async'; referenceImage.hidden = true;
  const referenceStatus = el('p', 'ship-reference-status', 'Loading ship reference…'); referenceStatus.setAttribute('role', 'status');
  referenceImage.onload = () => { referenceImage.hidden = false; referenceStatus.hidden = true; };
  referenceImage.onerror = () => { referenceImage.hidden = true; referenceStatus.hidden = false; referenceStatus.textContent = 'Ship reference image could not be loaded.'; };
  imageStage.append(referenceImage, referenceStatus);
  const referenceCaption = el('figcaption', 'ship-reference-caption');
  const fullSize = el('a', '', 'Full-size image ↗'); fullSize.target = '_blank'; fullSize.rel = 'noopener';
  referenceCaption.append(el('span', '', 'TOP · SIDE · BOTTOM · FRONT · REAR'), fullSize);
  referenceFigure.append(imageStage, referenceCaption); shipDialog.append(referenceHeader, referenceFigure); document.body.append(shipDialog);
  shipDialog.onclick = event => {
    if (event.target !== shipDialog) return;
    const bounds = shipDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) shipDialog.close();
  };
  function openShipReference(contact) {
    if (!contact.identified || !contact.ship.image) return;
    hideTooltip(); referenceTitle.textContent = contact.ship.label;
    referenceImage.hidden = true; referenceStatus.hidden = false; referenceStatus.textContent = 'Loading ship reference…';
    referenceImage.alt = `${contact.ship.label}: top, side, bottom, front, and rear views`;
    referenceImage.src = contact.ship.image; fullSize.href = contact.ship.image;
    shipDialog.showModal();
  }

  const catalogDialog = el('dialog', 'armament-catalog-dialog');catalogDialog.id='armament-catalog-dialog';catalogDialog.setAttribute('aria-labelledby','armament-catalog-title');
  const catalogHeader=el('div','ship-reference-header'),catalogTitle=el('div','');catalogTitle.append(el('span','tactical-eyebrow','TACTICAL / ARMAMENTS'));
  const catalogName=el('h2','','Armament catalog');catalogName.id='armament-catalog-title';catalogTitle.append(catalogName);
  const catalogClose=el('button','ship-reference-close','×');catalogClose.type='button';catalogClose.autofocus=true;catalogClose.setAttribute('aria-label','Close armament catalog');catalogClose.onclick=()=>catalogDialog.close();catalogHeader.append(catalogTitle,catalogClose);
  const catalogList=el('ul','armament-catalog-list');
  for(const [id,weapon] of Object.entries(armamentTypes)){
    const item=el('li','');item.dataset.armament=id;item.append(el('strong','',weapon.name),el('span','',weapon.category));catalogList.append(item);
  }
  function loadoutList(ship){
    const list=el('ul','ship-armament-list');
    for(const id of ship.loadout){const item=el('li','');item.append(el('span','',armamentLabel(ship,id)));const fit=ship.fitting?.[id];if(fit?.configuration||fit?.location)item.append(el('small','', [fit.configuration,fit.location].filter(Boolean).join(' · ')));list.append(item);}return list;
  }
  function countermeasureList(ship){const list=el('ul','ship-armament-list');for(const id of ship.countermeasures)list.append(el('li','',countermeasureTypes[id].name));return list;}
  function hangarText(ship){return ship.hangar&&typeof ship.hangar==='object'?`${ship.hangar.bays} shuttle bay${ship.hangar.bays===1?'':'s'} · ${ship.hangar.shuttles} shuttle${ship.hangar.shuttles===1?'':'s'}`:'Not specified';}
  const fitPicker=el('label','bridge-setting armament-fit-picker');fitPicker.append(el('span','','SHIP CLASS SPECIFICATION'));
  const fitSelect=el('select','');fitSelect.setAttribute('aria-label','Ship class specification');
  for(const [id,ship] of Object.entries(shipTypes))if(ship.fitConfirmed)fitSelect.append(Object.assign(el('option','',ship.label),{value:id}));fitPicker.append(fitSelect);
  const ownFit=el('section','armament-own-fit');
  function renderClassFit(){const id=fitSelect.value,ship=shipTypes[id];ownFit.replaceChildren(el('span','tactical-eyebrow',id==='sdf-frigate'?'YOUR SHIP · SDF WAYFARER':'SHIP CLASS REFERENCE'),el('h3','',ship.label),loadoutList(ship),el('h4','','COUNTERMEASURES'),countermeasureList(ship),el('h4','','SHUTTLE FACILITIES'),el('p','ship-facility-summary',hangarText(ship)),el('h4','','ENGINES'),el('p','ship-facility-summary',ship.engines),el('p','target-fit-note','Confirmed equipment and engine counts · provisional engine models and EPD rating.'));}
  fitSelect.onchange=renderClassFit;renderClassFit();
  catalogDialog.append(catalogHeader,catalogList,fitPicker,ownFit);document.body.append(catalogDialog);
  const openCatalog=()=>{hideTooltip();catalogDialog.showModal();};
  catalogButton.type='button';catalogButton.setAttribute('aria-haspopup','dialog');catalogButton.setAttribute('aria-controls',catalogDialog.id);catalogButton.onclick=openCatalog;
  catalogDialog.onclick=event=>{if(event.target!==catalogDialog)return;const box=catalogDialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)catalogDialog.close();};
  function catalogLink(){const button=el('button','armament-catalog-link','View armament catalog ↗');button.type='button';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',catalogDialog.id);button.onclick=openCatalog;return button;}

  function setMode(value) {
    mode = value; workspace.dataset.mode = mode;
    radarTab.setAttribute('aria-pressed', String(mode === 'radar')); targetTab.setAttribute('aria-pressed', String(mode === 'target'));
    hideTooltip();
  }
  function hideTooltip() {
    tooltip.hidden = true; hoverMarker?.removeAttribute('aria-describedby'); hoverMarker = null;
  }
  function positionTooltip(x, y) {
    const box = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - box.width - 8))}px`;
    tooltip.style.top = `${Math.max(8, y + 14 + box.height > innerHeight - 8 ? y - box.height - 12 : y + 14)}px`;
  }
  function showTooltip(contact, marker, event) {
    hideTooltip(); hoverMarker = marker; marker.setAttribute('aria-describedby', tooltip.id);
    const closure = closureReadout(contact);
    tooltip.replaceChildren(el('strong', '', `${contact.trackLabel} · ${contactTypes[contact.type].label}`), el('span', '', `Distance ${contactDistance(contact).toFixed(1)} KM`), el('span', '', `Speed ${speedText(contact)}`), el('span', `radar-closure ${closure.className}`, closure.text), el('span', signClass(contact.z), zText(contact)), el('span', signClass(contact.y), yText(contact)), el('span', '', `IFF: ${contact.iffStatus}`));
    tooltip.hidden = false;
    const bounds = marker.getBoundingClientRect(); positionTooltip(event?.clientX ?? bounds.right, event?.clientY ?? bounds.top);
  }
  const hideWhenInactive = () => { if (root.parentElement.dataset.station !== 'tactical' || document.body.dataset.screen !== 'bridge') hideTooltip(); };
  const observer = new MutationObserver(hideWhenInactive);
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
  observer.observe(root.parentElement, { attributes: true, attributeFilter: ['data-station'] });
  window.addEventListener('resize', hideTooltip);
  root.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });

  function lock(id, sourceView, toggle = false) {
    lockedIds = selectTargets(lockedIds, id, toggle);
    activeId = lockedIds.includes(id) ? id : lockedIds.at(-1) || null;
    render();
    if (compact.matches && !toggle) { setMode('target'); targetPanel.querySelector('h3').focus({ preventScroll: true }); }
    else if (sourceView) charts.find(item => item.view === sourceView).chart.querySelector(`.radar-track[data-track="${id}"]`)?.focus({ preventScroll: true });
  }
  function detailRow(label, value, className = '') {
    const row = el('div', ''); row.append(el('dt', '', label), el('dd', className, value)); return row;
  }
  function renderTarget(contact, visible) {
    const inRange = visible.includes(contact);
    const status = el('div', `target-lock-status${contact ? ' locked' : ''}`); status.setAttribute('role', 'status');
    status.textContent = contact ? `${lockedIds.length} TARGET${lockedIds.length === 1 ? '' : 'S'} LOCKED${contact.stale?' · SENSOR LOST / LAST KNOWN':inRange ? '' : ' · OUT OF RANGE'}` : 'FIRE CONTROL / STANDBY';
    const name = el('h3', '', contact ? contact.name : 'No target locked'); name.tabIndex = -1;
    if (!contact) {
      targetPanel.replaceChildren(status, name, el('p', 'target-empty', 'Click a radar contact to lock it. Ctrl + left-click adds or removes targets. Ship details appear here.'), el('div', 'target-empty-reticle', '⌖'), el('p', 'target-fit-note', '12 ship types in the training catalog. Radar detects contacts within 200 km.'),catalogLink());
      return;
    }
    const lockedList = el('div', 'target-lock-list'); lockedList.setAttribute('role', 'group'); lockedList.setAttribute('aria-label', 'Locked targets');
    for (const id of lockedIds) {
      const target = contacts.find(item => item.id === id);
      const button = el('button', '', `${target.trackLabel}${visible.includes(target) ? '' : ' ↗'}`);
      button.setAttribute('aria-label', `Inspect locked target ${target.trackLabel}, ${target.name}${visible.includes(target) ? '' : ', outside range'}`);
      button.setAttribute('aria-pressed', String(id === activeId));
      button.onclick = event => lock(id, undefined, event.ctrlKey); lockedList.append(button);
    }
    const ship = contact.ship;
    const shipClass = el(contact.identified && ship.image ? 'button' : 'p', 'target-ship-class', ship.label);
    if (contact.identified && ship.image) {
      shipClass.type = 'button'; shipClass.classList.add('target-ship-reference');
      shipClass.setAttribute('aria-label', `View five views of ${ship.label}`);
      shipClass.setAttribute('aria-haspopup', 'dialog'); shipClass.setAttribute('aria-controls', shipDialog.id);
      shipClass.append(el('span', 'ship-reference-indicator', ' ↗'));
      shipClass.onclick = () => openShipReference(contact);
    }
    const identity = el('dl', 'target-identity'); identity.append(detailRow('Track', contact.trackLabel), detailRow('IFF', contact.iffStatus), detailRow('Registry', contact.registry), detailRow('Classification', contactTypes[contact.type].label), detailRow('Size class', ship.size), detailRow('Affiliation', ship.faction), detailRow('Role', ship.role));
    const telemetry = el('dl', 'target-telemetry'); telemetry.append(detailRow('Distance from our ship', `${contactDistance(contact).toFixed(1)} KM`), detailRow('Relative speed', speedText(contact)), detailRow('Elevation', zText(contact), signClass(contact.z)), detailRow('Fore / aft', yText(contact), signClass(contact.y)),detailRow('Closure rate',closureReadout(contact).text,closureReadout(contact).className));
    const armaments = el('section', 'target-equipment target-armaments');armaments.setAttribute('aria-label','Ship armaments');armaments.append(el('h4', '', 'ARMAMENTS'));
    if(contact.identified&&ship.loadout)armaments.append(loadoutList(ship),el('p','target-fit-note',ship.fitConfirmed?'Confirmed class fitting.':'Provisional fitting · quantities pending.'));
    else armaments.append(el('p','','Unknown'));
    armaments.append(catalogLink());
    const countermeasures=el('section','target-equipment');countermeasures.setAttribute('aria-label','Ship countermeasures');countermeasures.append(el('h4','','COUNTERMEASURES'));
    if(contact.identified&&Array.isArray(ship.countermeasures))countermeasures.append(countermeasureList(ship));else countermeasures.append(el('p','',contact.identified?'Not specified':'Unknown'));
    const hangar=el('section','target-equipment');hangar.setAttribute('aria-label','Ship shuttle facilities');hangar.append(el('h4','','SHUTTLE FACILITIES'),el('p','',contact.identified?hangarText(ship):'Unknown'));
    const engines = el('section', 'target-equipment'); engines.append(el('h4', '', 'ENGINES'), el('p', '', ship.engines));
    const release = el('button', 'target-release', 'Release all target locks'); release.onclick = () => { lockedIds = []; activeId = null; render(); setMode('radar'); picker.focus({ preventScroll: true }); };
    targetPanel.replaceChildren(status, lockedList, name, shipClass, identity, telemetry, armaments, countermeasures, hangar, engines, el('p', 'target-fit-note', contact.identified ? ship.fitConfirmed?'CONFIRMED EQUIPMENT & ENGINE COUNTS · PROVISIONAL ENGINE MODELS & SIZE':'TRAINING DATA · PROVISIONAL SHIP FIT & SIZE' : 'Identity, type, size, and equipment unconfirmed.'), release);
    if(flight){const maneuvers=mountManeuverControls({flight,targetId:contact.id,onNavigate});targetPanel.insertBefore(maneuvers,identity);maneuvers.querySelector('button[type="submit"]').disabled=!inRange||flight.inTransit();}
  }

  function render() {
    hideTooltip();
    const visible = contactsInRange(contacts.filter(c=>!c.stale), range);
    const contact = contacts.find(item => item.id === activeId);
    rangeButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(radarRanges[index] === range)));
    count.textContent = `${visible.length} IN RANGE / ${contacts.length - visible.length} OUTSIDE`;
    const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose a track to lock'; placeholder.disabled = true;
    picker.replaceChildren(placeholder, ...contacts.map(target => {
      const option = document.createElement('option'); option.value = target.id;
      option.textContent = `${target.trackLabel} · ${target.ship.label}${visible.includes(target) ? '' : ' · Outside range'}`;
      option.disabled = !visible.includes(target); return option;
    })); picker.value = activeId || '';
    renderTarget(contact, visible);
    for (const { view, chart } of charts) {
      chart.replaceChildren(svg('circle', { r: 148, class: 'radar-field' }));
      for (const distance of rangeRings(range)) {
        const radius = distance / range * 148;
        chart.append(svg('circle', { r: radius, class: 'radar-ring' }), svg('text', { x: 5, y: -radius + 13, class: 'radar-ring-label' }, `${distance} km`));
      }
      chart.append(svg('path', { d: 'M-148 0H148M0-148V148', class: 'radar-axis' }));
      for (const [x, y, text] of [[0,-173,view === 'top' ? '+Y / FORE' : '+Z / ABOVE'],[0,180,view === 'top' ? '−Y / AFT' : '−Z / BELOW'],[-172,4,'−X'],[172,4,'+X']]) chart.append(svg('text', { x, y, 'text-anchor': 'middle', class: 'radar-axis-label' }, text));
      // Draw direction lines first so symbols remain readable over every vector.
      for (const target of visible) {
        const point = projectContact(target, view, range), direction = projectVelocity(target, view);
        if (!direction) continue;
        const vector = svg('g', { transform: `translate(${point.x} ${point.y})`, class: 'radar-direction', 'aria-hidden': 'true', 'data-track':target.id });
        const ux = direction.x / 26, uy = direction.y / 26;
        vector.append(svg('path', { d: `M${ux * 8} ${uy * 8}L${direction.x} ${direction.y}M${direction.x - ux * 5 - uy * 3} ${direction.y - uy * 5 + ux * 3}L${direction.x} ${direction.y}L${direction.x - ux * 5 + uy * 3} ${direction.y - uy * 5 - ux * 3}`, stroke: contactTypes[target.type].color }));
        chart.append(vector);
      }
      for (const target of visible) {
        const point = projectContact(target, view, range), isLocked = lockedIds.includes(target.id);
        const marker = svg('g', { transform: `translate(${point.x} ${point.y})`, class: `radar-track${isLocked ? ' selected' : ''}${target.id === activeId ? ' active-target' : ''}`, role: 'button', tabindex: 0, 'aria-pressed': String(isLocked), 'aria-label': `Lock ${target.trackLabel}, ${contactTypes[target.type].label}, ${contactDistance(target).toFixed(1)} KM, ${speedText(target)}, ${closureReadout(target).text}, ${zText(target)}` });
        marker.append(svg('circle', { r: 14, class: 'radar-track-hit' }), svg('path', { d: 'M-6-12H-12V-6M6-12H12V-6M-12 6V12H-6M12 6V12H6', class: 'radar-selection' }), symbol(target.type));
        // Keep labels outside the button bounds so long track IDs never move its click center.
        const trackLabel = svg('text', { x: point.x + (point.x > 110 ? -12 : 12), y: point.y - 12, 'text-anchor': point.x > 110 ? 'end' : 'start', class: 'radar-track-label' }, target.trackLabel);
        trackLabel.dataset.track=target.id;
        marker.dataset.track = target.id;
        marker.onclick = event => { if (event.button === 0) lock(target.id, view, event.ctrlKey); };
        marker.onpointerenter = event => { if (event.pointerType !== 'touch') showTooltip(contacts.find(c=>c.id===target.id)||target, marker, event); };
        marker.onpointermove = event => { if (hoverMarker === marker) positionTooltip(event.clientX, event.clientY); };
        marker.onpointerleave = hideTooltip;
        marker.onfocus = () => showTooltip(contacts.find(c=>c.id===target.id)||target, marker); marker.onblur = hideTooltip;
        marker.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); lock(target.id, view, event.ctrlKey); } }; chart.append(marker, trackLabel);
      }
      const ship = svg('g', { class: 'radar-own-ship', 'aria-label': 'Our ship at origin' });
      ship.append(svg('circle', { r: 9 }), svg('path', { d: view === 'top' ? 'M0-6 4 4 0 2-4 4Z' : 'M-6 2-3-3H3L6 2H-6M-9 0H9' })); chart.append(ship);
    }
  }
  let signature='';
  function refresh(){
    if(flight)contacts=flight.contacts();
    // Retain locked tracks as stale sensor records without exposing unseen motion.
    if(flight)for(const id of lockedIds)if(!contacts.some(c=>c.id===id)&&flight.sector.memory[id])contacts.push({...flight.sector.memory[id].observed,stale:true});
    const visible=contactsInRange(contacts.filter(c=>!c.stale),range),currentSignature=contacts.map(c=>`${c.id}:${c.identified}:${c.stale||false}`).join('|')+`/${visible.map(c=>c.id).join(',')}`;
    flightStatus.textContent=flight?`${flight.inTransit()?'EPD IN TRANSIT · LOCAL FLIGHT SUSPENDED':flightReadout(flight)}${flight.sector.running?'':' · PAUSED'}`:'TRAINING SNAPSHOT';
    if(currentSignature!==signature){signature=currentSignature;const scroll=targetPanel.scrollTop;render();targetPanel.scrollTop=scroll;return;}
    for(const {chart,view} of charts){
      for(const marker of chart.querySelectorAll('.radar-track')){
        const target=contacts.find(c=>c.id===marker.dataset.track);if(!target)continue;
        const point=projectContact(target,view,range);marker.setAttribute('transform',`translate(${point.x} ${point.y})`);
        marker.setAttribute('aria-label',`Lock ${target.trackLabel}, ${contactTypes[target.type].label}, ${contactDistance(target).toFixed(1)} KM, ${speedText(target)}, ${closureReadout(target).text}, ${zText(target)}`);
        const label=chart.querySelector(`.radar-track-label[data-track="${target.id}"]`);label.setAttribute('x',point.x+(point.x>110?-12:12));label.setAttribute('y',point.y-12);label.setAttribute('text-anchor',point.x>110?'end':'start');
        const direction=projectVelocity(target,view),vector=chart.querySelector(`.radar-direction[data-track="${target.id}"]`);
        if(vector&&direction){vector.setAttribute('transform',`translate(${point.x} ${point.y})`);const ux=direction.x/26,uy=direction.y/26;vector.firstElementChild.setAttribute('d',`M${ux*8} ${uy*8}L${direction.x} ${direction.y}M${direction.x-ux*5-uy*3} ${direction.y-uy*5+ux*3}L${direction.x} ${direction.y}L${direction.x-ux*5+uy*3} ${direction.y-uy*5-ux*3}`);vector.style.display='';}else if(vector)vector.style.display='none';
      }
    }
    const active=contacts.find(c=>c.id===activeId);
    if(active){
      const values=[`${contactDistance(active).toFixed(1)} KM`,speedText(active),zText(active),yText(active),closureReadout(active).text];
      targetPanel.querySelectorAll('.target-telemetry dd').forEach((dd,i)=>{dd.textContent=values[i];if(i===2)dd.className=signClass(active.z);if(i===3)dd.className=signClass(active.y);if(i===4)dd.className=closureReadout(active).className;});
      const execute=targetPanel.querySelector('button[type="submit"]');if(execute)execute.disabled=!!active.stale||flight?.inTransit();
    }
    if(hoverMarker&&!tooltip.hidden){const target=contacts.find(c=>c.id===hoverMarker.dataset.track);if(target)showTooltip(target,hoverMarker);}
  }
  setMode('radar'); render();refresh();
  return {refresh,reset(){lockedIds=[];activeId=null;signature='';refresh();}};
}
