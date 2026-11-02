import { radarRanges, contactTypes, armamentTypes, countermeasureTypes, armamentLabel, shipTypes, shuttleTypes, crewDoctrine, trainingContacts, contactDistance, contactSpeed, contactClosureRate, contactsInRange, rangeRings, projectContact, projectVelocity, selectTargets, prioritizeTargets, restoreTargetPriorities, MAX_TARGET_PRIORITY, observeContact, IFF_RANGE_KM, IFF_IDENTIFICATION_CHANCE } from './tactical-model.mjs';
import { mountManeuverControls, flightReadout } from './sector-console.mjs';
import { mountWeaponsConsole } from './combat-console.mjs';
import { weapons } from './combat-model.mjs';

export function mountTactical({ root, range, onRangeChange, onChange=()=>{}, flight, onNavigate }) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, className, text) => { const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const svg = (tag, attrs = {}, text) => { const node = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };
  const compact = matchMedia('(max-width: 800px)');
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
  let lockedIds = [], priorities = {}, activeId = null, mode = 'radar', hoverMarker = null, pendingLock=null;
  const orderedLocks=()=>[...lockedIds].sort((a,b)=>priorities[a]-priorities[b]);
  const lockedContacts=()=>orderedLocks().map(id=>contacts.find(c=>c.id===id)).filter(Boolean);
  const radarLabel=target=>`Lock ${target.trackLabel}${priorities[target.id]?`, priority ${priorities[target.id]}`:''}, ${contactTypes[target.type].label}, ${contactDistance(target).toFixed(1)} KM, ${speedText(target)}, ${closureReadout(target).text}, ${zText(target)}`;

  const heading = el('div', 'tactical-heading');
  const title = el('div', ''); title.append(el('span', 'tactical-eyebrow', 'TACTICAL / WEAPONS CONTROL'));
  const headingActions = el('div', 'tactical-heading-actions');
  const catalogButton = el('button', 'armament-catalog-trigger', 'Armament catalog ↗');
  headingActions.append(catalogButton, el('span', 'tactical-posture', 'MANUAL FIRE CONTROL'));heading.append(title, headingActions);
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
  const radarTab = el('button', '', 'Radar'); radarTab.setAttribute('aria-controls', 'tactical-radar-area');
  const targetTab = el('button', '', 'Target details'); targetTab.setAttribute('aria-controls', 'tactical-target-panel');
  const combatTab = el('button', '', 'Combat'); combatTab.setAttribute('aria-controls', 'tactical-combat-panel');
  radarTab.onclick = () => setMode('radar'); targetTab.onclick = () => setMode('target'); combatTab.onclick = () => setMode('combat'); tabs.append(radarTab, targetTab, combatTab);
  const workspace = el('div', 'tactical-workspace');
  const radarArea = el('div', 'tactical-radar-area'); radarArea.id = 'tactical-radar-area';
  const screens = el('div', 'radar-screens');
  const card = el('section', 'radar-card'); card.setAttribute('aria-label', 'Tactical radar, top view');
  const caption = el('div', 'radar-caption'); caption.append(el('h3', '', 'TACTICAL RADAR'), el('span', '', 'TOP VIEW · X / Y · HOVER FOR ELEVATION'));
  const chart = svg('svg', { viewBox: '-165 -165 330 330', role: 'group', 'aria-label': 'Tactical radar: X starboard, Y forward; hover or focus a contact for elevation' });
  card.append(caption, chart); screens.append(card);
  const charts = [{ view:'top', chart }];
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
  const hint = el('span', 'radar-interaction-hint', 'Click to lock & set priority · Ctrl + click: add / remove · 1 = highest'); selection.append(label, hint);
  toolbar.insertBefore(selection, sensorStatus);
  radarArea.append(screens, legend);

  const targetPanel = el('aside', 'tactical-target-panel'); targetPanel.id = 'tactical-target-panel'; targetPanel.setAttribute('aria-label', 'Locked target ship details');
  const combatPanel = el('aside', 'tactical-combat-panel'); combatPanel.id = 'tactical-combat-panel'; combatPanel.setAttribute('aria-label', 'Combat controls');
  const note = el('div', 'tactical-note');const flightStatus=el('span','','');note.append(flightStatus, el('span', '', 'LOCAL COMBAT · PROVISIONAL PERFORMANCE · CONSTANT PROJECTILE DAMAGE'));
  workspace.append(targetPanel, radarArea, combatPanel);
  const tooltip = el('div', 'radar-tooltip'); tooltip.id = 'radar-track-tooltip'; tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true;
  root.append(heading, toolbar, tabs, workspace, note, tooltip);
  const priorityDialog=el('dialog','target-priority-dialog');priorityDialog.id='target-priority-dialog';priorityDialog.setAttribute('aria-labelledby','target-priority-title');
  priorityDialog.append(el('span','tactical-eyebrow','TACTICAL / TARGET PRIORITY'));
  const priorityTitle=el('h2','','Set target priority');priorityTitle.id='target-priority-title';
  const priorityContext=el('p',''),priorityForm=el('form','target-priority-form'),priorityLabel=el('label','bridge-setting'),priorityInput=el('select','');priorityInput.id='target-priority-value';priorityInput.setAttribute('aria-label','Target priority');priorityInput.required=true;priorityLabel.append(el('span','','Priority · 1 is highest'),priorityInput);
  const priorityUsed=el('p','combat-note'),priorityError=el('p','target-priority-error');priorityError.setAttribute('role','alert');
  const priorityActions=el('div','target-priority-actions'),priorityConfirm=el('button','primary-button','Confirm priority'),priorityCancel=el('button','secondary-button','Cancel');priorityConfirm.type='submit';priorityCancel.type='button';priorityCancel.onclick=()=>priorityDialog.close();priorityActions.append(priorityConfirm,priorityCancel);
  priorityForm.append(priorityLabel,priorityUsed,priorityError,priorityActions);priorityDialog.append(priorityTitle,priorityContext,priorityForm);document.body.append(priorityDialog);
  priorityDialog.addEventListener('close',()=>{pendingLock=null;picker.value=activeId||'';});
  priorityForm.onsubmit=event=>{
    event.preventDefault();if(!pendingLock)return;
    const draft=pendingLock,priority=Number(priorityInput.value);
    if(!draft.edit&&!contactsInRange(contacts.filter(c=>!c.stale),range).some(c=>c.id===draft.id)){priorityError.textContent='This ship is no longer in radar coverage. Cancel and choose another track.';return;}
    let next;
    try{next=draft.edit?{lockedIds:[...lockedIds],priorities:restoreTargetPriorities(lockedIds,{...priorities,[draft.id]:priority})}:prioritizeTargets(lockedIds,priorities,draft.id,priority,draft.toggle);}
    catch(error){priorityError.textContent=error.message;return;}
    lockedIds=next.lockedIds;priorities=next.priorities;activeId=draft.id;priorityDialog.close();finishLock(draft.id,draft.sourceView,draft.toggle,draft.quick);
  };
  // Numbered symbols have a fixed readable size, independent of chart scale.
  function markerScale(chart,numbered=false){
    const bounds=chart.getBoundingClientRect(),scale=Math.min(bounds.width/330,bounds.height/330);
    if(numbered)return scale>0?1.25/scale:1;
    const legendWidth=legend.querySelector('svg').getBoundingClientRect().width;
    return scale>0&&legendWidth>0?(legendWidth*6/20)/(4.5*scale):1;
  }
  const chartResize=new ResizeObserver(()=>{for(const {chart} of charts)for(const marker of chart.querySelectorAll('.radar-contact-glyph'))marker.setAttribute('transform',`scale(${markerScale(chart,marker.classList.contains('numbered'))})`);});
  for(const {chart} of charts)chartResize.observe(chart);
  const weaponControls=flight?.combat?mountWeaponsConsole({flight}):null;

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
    const item=el('li','');item.dataset.armament=id;const spec=weapons[id];item.append(el('strong','',weapon.name),el('span','',`${weapon.category} · ${spec.range} km · ${spec.rpm} rounds/min/barrel · ${spec.damage} damage/round`),el('small','',spec.guidance));catalogList.append(item);
  }
  function loadoutList(ship){
    const list=el('ul','ship-armament-list');
    for(const id of ship.loadout){const item=el('li','');item.append(el('span','',armamentLabel(ship,id)));const fit=ship.fitting?.[id];if(fit?.configuration||fit?.location)item.append(el('small','', [fit.configuration,fit.location].filter(Boolean).join(' · ')));list.append(item);}return list;
  }
  function countermeasureList(ship){if(!Array.isArray(ship.countermeasures))return el('p','ship-facility-summary','Not specified');const list=el('ul','ship-armament-list');for(const id of ship.countermeasures)list.append(el('li','',countermeasureTypes[id].name));return list;}
  function hangarText(ship){
    const h=ship.hangar;if(!h||typeof h!=='object')return 'Not specified';
    const parts=[];
    if(Number.isInteger(h.bays))parts.push(`${h.bays} shuttle bay${h.bays===1?'':'s'}`);
    if(Number.isInteger(h.shuttles))parts.push(`${h.shuttles} shuttle${h.shuttles===1?'':'s'}`);
    if(Number.isInteger(h.assaultShuttles))parts.push(`${h.assaultShuttles} assault shuttles`);
    const capacity=shuttleTypes[h.assaultShuttles?'assault-shuttle':'shuttle'].troopCapacity;
    return `${parts.join(' · ')}. Each craft carries ${capacity} marines / raiders, excluding flight crew.`;
  }
  function boardingText(ship){const b=ship.boarding;return b?`${b.personnel} ${b.unit.toLowerCase()}${b.platoons?` · ${b.platoons} ${b.platoons===1?'platoon':'platoons'}`:''}, including up to ${Math.floor(b.personnel*crewDoctrine.maxAndroidFraction)} androids (30% maximum). Boarding, ship seizure, and defense of their ship.`:'Not specified';}
  function crewText(ship){return `${crewDoctrine.automation} ${ship.crew?.androids==='included'?crewDoctrine.androids:'Android complement not specified.'}`;}
  const fitPicker=el('label','bridge-setting armament-fit-picker');fitPicker.append(el('span','','SHIP CLASS SPECIFICATION'));
  const fitSelect=el('select','');fitSelect.setAttribute('aria-label','Ship class specification');
  for(const [id,ship] of Object.entries(shipTypes))if(ship.fitConfirmed||ship.boarding)fitSelect.append(Object.assign(el('option','',ship.label),{value:id}));fitSelect.value='sdf-frigate';fitPicker.append(fitSelect);
  const ownFit=el('section','armament-own-fit');
  function renderClassFit(){const id=fitSelect.value,ship=shipTypes[id];ownFit.replaceChildren(el('span','tactical-eyebrow',id==='sdf-frigate'?'YOUR SHIP · SDF WAYFARER':'SHIP CLASS REFERENCE'),el('h3','',ship.label),loadoutList(ship),el('h4','','COUNTERMEASURES'),countermeasureList(ship),el('h4','','SHUTTLE FACILITIES'),el('p','ship-facility-summary',hangarText(ship)),el('h4','','BOARDING / DEFENSE FORCE'),el('p','ship-facility-summary',boardingText(ship)),el('h4','','CREW / AUTOMATION'),el('p','ship-facility-summary',crewText(ship)),el('h4','','ENGINES'),el('p','ship-facility-summary',ship.engines),el('p','target-fit-note',ship.fitConfirmed?'Confirmed equipment, boarding complement, and engine counts · provisional engine models and EPD rating.':'Confirmed raider and assault shuttle counts · other fittings and engine models provisional.'));}
  fitSelect.onchange=renderClassFit;renderClassFit();
  catalogDialog.append(catalogHeader,catalogList,fitPicker,ownFit);document.body.append(catalogDialog);
  const openCatalog=()=>{hideTooltip();catalogDialog.showModal();};
  catalogButton.type='button';catalogButton.setAttribute('aria-haspopup','dialog');catalogButton.setAttribute('aria-controls',catalogDialog.id);catalogButton.onclick=openCatalog;
  catalogDialog.onclick=event=>{if(event.target!==catalogDialog)return;const box=catalogDialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)catalogDialog.close();};
  function catalogLink(){const button=el('button','armament-catalog-link','View armament catalog ↗');button.type='button';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',catalogDialog.id);button.onclick=openCatalog;return button;}

  function setMode(value) {
    mode = value; workspace.dataset.mode = mode;
    radarTab.setAttribute('aria-pressed', String(mode === 'radar')); targetTab.setAttribute('aria-pressed', String(mode === 'target')); combatTab.setAttribute('aria-pressed', String(mode === 'combat'));
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
    if(priorityDialog.open||weaponControls?.isQuickFireOpen())return;
    hideTooltip(); hoverMarker = marker; marker.setAttribute('aria-describedby', tooltip.id);
    const closure = closureReadout(contact);
    tooltip.replaceChildren(el('strong', '', `${contact.trackLabel} · ${contactTypes[contact.type].label}`), el('span', '', `Distance ${contactDistance(contact).toFixed(1)} KM`), el('span', '', `Speed ${speedText(contact)}`), el('span', `radar-closure ${closure.className}`, closure.text), el('span', signClass(contact.z), zText(contact)), el('span', signClass(contact.y), yText(contact)), el('span', '', `IFF: ${contact.iffStatus}`));
    if(priorities[contact.id])tooltip.append(el('span','',`Priority ${priorities[contact.id]} · 1 is highest`));
    tooltip.hidden = false;
    const bounds = marker.getBoundingClientRect(); positionTooltip(event?.clientX ?? bounds.right, event?.clientY ?? bounds.top);
  }
  const hideWhenInactive = () => { if (root.parentElement.dataset.station !== 'tactical' || document.body.dataset.screen !== 'bridge') { hideTooltip(); weaponControls?.closeQuickFire();if(priorityDialog.open)priorityDialog.close(); } };
  const observer = new MutationObserver(hideWhenInactive);
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-screen'] });
  observer.observe(root.parentElement, { attributes: true, attributeFilter: ['data-station'] });
  window.addEventListener('resize', hideTooltip);
  root.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });

  function lock(id, sourceView, toggle = false) {
    weaponControls?.closeQuickFire();
    if(!lockedIds.includes(id)){askPriority(id,{sourceView,toggle});return;}
    const next=prioritizeTargets(lockedIds,priorities,id,priorities[id],toggle);lockedIds=next.lockedIds;priorities=next.priorities;
    activeId = lockedIds.includes(id) ? id : lockedIds.at(-1) || null;
    finishLock(id,sourceView,toggle);
  }
  function askPriority(id,{sourceView,toggle=false,quick=null,edit=false}={}){
    const target=contacts.find(c=>c.id===id);if(!target)return;
    hideTooltip();weaponControls?.closeQuickFire();
    const retained=(edit?lockedIds:selectTargets(lockedIds,id,toggle)).filter(key=>key!==id),used=new Set(retained.map(key=>priorities[key]));
    priorityInput.replaceChildren(...Array.from({length:MAX_TARGET_PRIORITY},(_,index)=>{
      const value=index+1,owner=retained.find(key=>priorities[key]===value),option=el('option','',`${value}${value===1?' · highest':''}${owner?` · ${contacts.find(c=>c.id===owner)?.trackLabel||owner} (in use)`:''}`);option.value=String(value);option.disabled=used.has(value);return option;
    }));
    priorityInput.value=String(edit?priorities[id]:Array.from({length:MAX_TARGET_PRIORITY},(_,i)=>i+1).find(value=>!used.has(value)));
    priorityContext.textContent=`${target.trackLabel} · ${contactTypes[target.type].label}. ${!edit&&!toggle&&lockedIds.some(key=>key!==id)?'Confirming releases the other target locks. ':''}Each locked ship must have a different priority.`;
    priorityUsed.textContent=retained.length?`In use: ${[...retained].sort((a,b)=>priorities[a]-priorities[b]).map(key=>`${priorities[key]} · ${contacts.find(c=>c.id===key)?.trackLabel||key}`).join(', ')}`:'All priority numbers are available.';
    priorityError.textContent='';pendingLock={id,sourceView,toggle,quick,edit};priorityDialog.showModal();priorityInput.focus();
  }
  function finishLock(id,sourceView,toggle,quick=null){
    render();
    onChange();
    if(quick){hideTooltip();weaponControls?.openQuickFire(id,quick.x,quick.y);return;}
    if (compact.matches && !toggle) { setMode('target'); targetPanel.querySelector('h3').focus({ preventScroll: true }); }
    else if (sourceView) charts.find(item => item.view === sourceView).chart.querySelector(`.radar-track[data-track="${id}"]`)?.focus({ preventScroll: true });
  }
  function openQuickFire(id,event,marker){
    if(!weaponControls)return;event.preventDefault();
    const bounds=marker.getBoundingClientRect(),x=event.clientX||bounds.right,y=event.clientY||bounds.top;
    if(!lockedIds.includes(id)){askPriority(id,{toggle:true,quick:{x,y}});return;}
    activeId=id;finishLock(id,undefined,true,{x,y});
  }
  function detailRow(label, value, className = '') {
    const row = el('div', ''); row.append(el('dt', '', label), el('dd', className, value)); return row;
  }
  function renderTarget(contact, visible) {
    combatPanel.replaceChildren();
    if(weaponControls){combatPanel.append(weaponControls.root);weaponControls.refresh(contact||null,lockedContacts());}
    else combatPanel.append(el('h3','combat-panel-title','COMBAT CONTROLS'),el('p','target-empty','Flight controls unavailable in this training snapshot.'));
    const inRange = visible.includes(contact);
    const status = el('div', `target-lock-status${contact ? ' locked' : ''}`); status.setAttribute('role', 'status');
    status.textContent = contact ? `${lockedIds.length} TARGET${lockedIds.length === 1 ? '' : 'S'} LOCKED · PRIORITY ${priorities[contact.id]}${contact.stale?' · SENSOR LOST / LAST KNOWN':inRange ? '' : ' · OUT OF RANGE'}` : 'FIRE CONTROL / STANDBY';
    const name = el('h3', '', contact ? contact.name : 'No target locked'); name.tabIndex = -1;
    if (!contact) {
      targetPanel.replaceChildren(status, name, el('p', 'target-empty', 'Click a radar contact and choose its priority. 1 is highest. Ctrl + left-click adds or removes targets. Ship details appear here.'), el('div', 'target-empty-reticle', '⌖'), el('p', 'target-fit-note', '12 ship types in the training catalog. Radar detects contacts within 200 km.'),catalogLink());
      if(weaponControls)combatPanel.append(weaponControls.settings);return;
    }
    const lockedList = el('div', 'target-lock-list'); lockedList.setAttribute('role', 'group'); lockedList.setAttribute('aria-label', 'Locked targets');
    for (const id of orderedLocks()) {
      const target = contacts.find(item => item.id === id);
      const button = el('button', '', `${priorities[id]} · ${target.trackLabel}${visible.includes(target) ? '' : ' ↗'}`);
      button.setAttribute('aria-label', `Inspect locked target ${target.trackLabel}, priority ${priorities[id]}, ${target.name}${visible.includes(target) ? '' : ', outside range'}`);
      button.setAttribute('aria-pressed', String(id === activeId));
      button.onclick = event => {if(event.ctrlKey)lock(id,undefined,true);else{activeId=id;finishLock(id,undefined,true);}}; lockedList.append(button);
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
    const telemetry = el('dl', 'target-telemetry'); telemetry.append(detailRow('Distance', `${contactDistance(contact).toFixed(1)} KM`), detailRow('Relative speed', speedText(contact)), detailRow('Elevation', zText(contact), signClass(contact.z)), detailRow('Fore / aft', yText(contact), signClass(contact.y)),detailRow('Closure rate',closureReadout(contact).text,closureReadout(contact).className));
    const armaments = el('section', 'target-equipment target-armaments');armaments.setAttribute('aria-label','Ship armaments');armaments.append(el('h4', '', 'ARMAMENTS'));
    if(contact.identified&&ship.loadout)armaments.append(loadoutList(ship),el('p','target-fit-note',ship.fitConfirmed?'Confirmed class fitting.':'Provisional fitting · quantities pending.'));
    else armaments.append(el('p','','Unknown'));
    armaments.append(catalogLink());
    const countermeasures=el('section','target-equipment');countermeasures.setAttribute('aria-label','Ship countermeasures');countermeasures.append(el('h4','','COUNTERMEASURES'));
    if(contact.identified&&Array.isArray(ship.countermeasures))countermeasures.append(countermeasureList(ship));else countermeasures.append(el('p','',contact.identified?'Not specified':'Unknown'));
    const hangar=el('section','target-equipment');hangar.setAttribute('aria-label','Ship shuttle facilities');hangar.append(el('h4','','SHUTTLE FACILITIES'),el('p','',contact.identified?hangarText(ship):'Unknown'));
    const boarding=el('section','target-equipment');boarding.setAttribute('aria-label','Ship boarding and defense force');boarding.append(el('h4','','BOARDING / DEFENSE FORCE'),el('p','',contact.identified?boardingText(ship):'Unknown'));
    const crew=el('section','target-equipment');crew.setAttribute('aria-label','Ship crew and automation');crew.append(el('h4','','CREW / AUTOMATION'),el('p','',contact.identified?crewText(ship):'Unknown'));
    const engines = el('section', 'target-equipment'); engines.append(el('h4', '', 'ENGINES'), el('p', '', ship.engines));
    const changePriority=el('button','target-priority-change',`Change priority · ${priorities[contact.id]}`);changePriority.setAttribute('aria-label','Change target priority');changePriority.onclick=()=>askPriority(contact.id,{edit:true});
    const release = el('button', 'target-release', 'Release all target locks'); release.onclick = () => { lockedIds = [];priorities={}; activeId = null; render();onChange(); setMode('radar'); picker.focus({ preventScroll: true }); };
    targetPanel.replaceChildren(status, lockedList, name, shipClass, changePriority, release, telemetry, identity, armaments, countermeasures, hangar, boarding, crew, engines, el('p', 'target-fit-note', contact.identified ? ship.fitConfirmed?'CONFIRMED EQUIPMENT & ENGINE COUNTS · PROVISIONAL ENGINE MODELS & SIZE':ship.boarding?'CONFIRMED RAIDERS & ASSAULT SHUTTLES · OTHER FITTINGS PROVISIONAL':'TRAINING DATA · PROVISIONAL SHIP FIT & SIZE' : 'Identity, type, size, and equipment unconfirmed.'));
    if(weaponControls)targetPanel.insertBefore(weaponControls.targetDetails,release);
    if(flight){const maneuvers=mountManeuverControls({flight,targetId:contact.id,onNavigate});combatPanel.append(maneuvers);maneuvers.querySelector('button[type="submit"]').disabled=!inRange||flight.inTransit();}
    if(weaponControls)combatPanel.append(weaponControls.settings);
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
      option.textContent = `${priorities[target.id]?`${priorities[target.id]} · `:''}${target.trackLabel} · ${target.ship.label}${visible.includes(target) ? '' : ' · Outside range'}`;
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
      for (const [x, y, text] of [[0,-154,view === 'top' ? '+Y / FORE' : '+Z / ABOVE'],[0,160,view === 'top' ? '−Y / AFT' : '−Z / BELOW'],[-155,4,'−X'],[155,4,'+X']]) chart.append(svg('text', { x, y, 'text-anchor': 'middle', class: 'radar-axis-label' }, text));
      // Draw direction lines first so symbols remain readable over every vector.
      for (const target of visible) {
        const point = projectContact(target, view, range), direction = projectVelocity(target, view);
        if (!direction) continue;
        const vector = svg('g', { transform: `translate(${point.x} ${point.y})`, class: 'radar-direction', 'aria-hidden': 'true', 'data-track':target.id });
        const ux = direction.x / 26, uy = direction.y / 26;
        vector.append(svg('path', { d: `M${ux * 8} ${uy * 8}L${direction.x} ${direction.y}M${direction.x - ux * 5 - uy * 3} ${direction.y - uy * 5 + ux * 3}L${direction.x} ${direction.y}L${direction.x - ux * 5 + uy * 3} ${direction.y - uy * 5 - ux * 3}`, stroke: contactTypes[target.type].color }));
        chart.append(vector);
      }
      for (const target of [...visible].sort((a,b)=>Number(!!priorities[a.id])-Number(!!priorities[b.id])||(priorities[b.id]||0)-(priorities[a.id]||0))) {
        const point = projectContact(target, view, range), isLocked = lockedIds.includes(target.id);
        const marker = svg('g', { transform: `translate(${point.x} ${point.y})`, class: `radar-track${isLocked ? ' selected' : ''}${target.id === activeId ? ' active-target' : ''}`, role: 'button', tabindex: 0, 'aria-pressed': String(isLocked), 'aria-label':radarLabel(target) });
        const scale=markerScale(chart,isLocked),glyph=svg('g',{class:`radar-contact-glyph${isLocked?' numbered':''}`,transform:`scale(${scale})`});
        glyph.append(svg('circle', { r: isLocked?18:14, class: 'radar-track-hit' }), svg('path', { d: isLocked?'M-9-16H-16V-9M9-16H16V-9M-16 9V16H-9M16 9V16H9':'M-4.5-9H-9V-4.5M4.5-9H9V-4.5M-9 4.5V9H-4.5M9 4.5V9H4.5', class: 'radar-selection' }), symbol(target.type,isLocked?12:4.5));
        if(isLocked){marker.dataset.priority=String(priorities[target.id]);glyph.append(svg('text',{x:0,y:target.type==='neutral'?4:0,class:'radar-priority-number','aria-hidden':'true'},String(priorities[target.id])));}marker.append(glyph);
        // Keep labels outside the button bounds so long track IDs never move its click center.
        const offset=isLocked?18*scale:12;
        const trackLabel = svg('text', { x: point.x + (point.x > 110 ? -offset : offset), y: point.y - offset, 'text-anchor': point.x > 110 ? 'end' : 'start', class: 'radar-track-label' }, target.trackLabel);
        trackLabel.dataset.track=target.id;
        marker.dataset.track = target.id;
        marker.onclick = event => { if (event.button === 0) lock(target.id, view, event.ctrlKey); };
        marker.oncontextmenu=event=>openQuickFire(target.id,event,marker);
        marker.setAttribute('aria-haspopup','dialog');
        marker.onpointerenter = event => { if (event.pointerType !== 'touch') showTooltip(contacts.find(c=>c.id===target.id)||target, marker, event); };
        marker.onpointermove = event => { if (hoverMarker === marker) positionTooltip(event.clientX, event.clientY); };
        marker.onpointerleave = hideTooltip;
        marker.onfocus = () => showTooltip(contacts.find(c=>c.id===target.id)||target, marker); marker.onblur = hideTooltip;
        marker.onkeydown = event => { if (event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)openQuickFire(target.id,event,marker);else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); lock(target.id, view, event.ctrlKey); } }; chart.append(marker, trackLabel);
      }
      const ship = svg('g', { class: 'radar-own-ship', 'aria-label': 'Our ship at origin' });
      ship.append(svg('circle', { r: 9 }), svg('path', { d: view === 'top' ? 'M0-6 4 4 0 2-4 4Z' : 'M-6 2-3-3H3L6 2H-6M-9 0H9' })); chart.append(ship);
    }
  }
  let signature='';
  function refresh(){
    if(flight)contacts=flight.contacts();
    if(weaponControls)weaponControls.refresh(contacts.find(c=>c.id===activeId)||null,lockedContacts());
    // Retain locked tracks as stale sensor records without exposing unseen motion.
    if(flight)for(const id of lockedIds)if(!contacts.some(c=>c.id===id)&&flight.sector.memory[id])contacts.push({...flight.sector.memory[id].observed,stale:true});
    const visible=contactsInRange(contacts.filter(c=>!c.stale),range),currentSignature=contacts.map(c=>`${c.id}:${c.identified}:${c.stale||false}`).join('|')+`/${visible.map(c=>c.id).join(',')}`;
    flightStatus.textContent=flight?`${flight.inTransit()?'EPD IN TRANSIT · LOCAL FLIGHT SUSPENDED':flightReadout(flight)}${flight.sector.running?'':' · PAUSED'}`:'TRAINING SNAPSHOT';
    if(currentSignature!==signature){signature=currentSignature;const scroll=targetPanel.scrollTop,combatScroll=combatPanel.scrollTop;render();targetPanel.scrollTop=scroll;combatPanel.scrollTop=combatScroll;return;}
    for(const {chart,view} of charts){
      for(const marker of chart.querySelectorAll('.radar-track')){
        const target=contacts.find(c=>c.id===marker.dataset.track);if(!target)continue;
        const point=projectContact(target,view,range);marker.setAttribute('transform',`translate(${point.x} ${point.y})`);
        marker.setAttribute('aria-label',radarLabel(target));
        const offset=priorities[target.id]?18*markerScale(chart,true):12;
        const label=chart.querySelector(`.radar-track-label[data-track="${target.id}"]`);label.setAttribute('x',point.x+(point.x>110?-offset:offset));label.setAttribute('y',point.y-offset);label.setAttribute('text-anchor',point.x>110?'end':'start');
        const direction=projectVelocity(target,view),vector=chart.querySelector(`.radar-direction[data-track="${target.id}"]`);
        if(vector&&direction){vector.setAttribute('transform',`translate(${point.x} ${point.y})`);const ux=direction.x/26,uy=direction.y/26;vector.firstElementChild.setAttribute('d',`M${ux*8} ${uy*8}L${direction.x} ${direction.y}M${direction.x-ux*5-uy*3} ${direction.y-uy*5+ux*3}L${direction.x} ${direction.y}L${direction.x-ux*5+uy*3} ${direction.y-uy*5-ux*3}`);vector.style.display='';}else if(vector)vector.style.display='none';
      }
    }
    const active=contacts.find(c=>c.id===activeId);
    if(active){
      const values=[`${contactDistance(active).toFixed(1)} KM`,speedText(active),zText(active),yText(active),closureReadout(active).text];
      targetPanel.querySelectorAll('.target-telemetry dd').forEach((dd,i)=>{dd.textContent=values[i];if(i===2)dd.className=signClass(active.z);if(i===3)dd.className=signClass(active.y);if(i===4)dd.className=closureReadout(active).className;});
      const execute=combatPanel.querySelector('button[type="submit"]');if(execute)execute.disabled=!!active.stale||flight?.inTransit();
    }
    if(hoverMarker&&!tooltip.hidden){const target=contacts.find(c=>c.id===hoverMarker.dataset.track);if(target)showTooltip(target,hoverMarker);}
  }
  setMode('radar'); render();refresh();
  return {refresh,
    exportState:()=>({lockedIds:[...lockedIds],activeId,priorities:{...priorities}}),
    restoreState(saved,savedRange=range){weaponControls?.closeQuickFire();if(priorityDialog.open)priorityDialog.close();lockedIds=[...saved.lockedIds];priorities=restoreTargetPriorities(lockedIds,saved.priorities);activeId=saved.activeId;range=savedRange;signature='';hideTooltip();render();refresh();},
    reset(){weaponControls?.closeQuickFire();if(priorityDialog.open)priorityDialog.close();lockedIds=[];priorities={};activeId=null;signature='';refresh();}};
}
