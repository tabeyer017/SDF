import { radarRanges, contactTypes, armamentTypes, countermeasureTypes, armamentLabel, shipTypes, shipFiveViews, shuttleTypes, crewDoctrine, trainingContacts, contactDistance, contactSpeed, contactClosureRate, contactsInRange, rangeRings, projectContact, projectVelocity, selectTargets, prioritizeTargets, restoreTargetPriorities, MAX_TARGET_PRIORITY, observeContact, IFF_RANGE_KM, IFF_IDENTIFICATION_CHANCE } from './tactical-model.mjs';
import { mountManeuverControls, flightReadout } from './sector-console.mjs';
import { mountWeaponsConsole } from './combat-console.mjs';
import {playerShipName,shipNamingConventions} from './ship-names.mjs';
import { weapons, recentInterceptions, supportStatus, condition, radarEmitting, jammerEmitting } from './combat-model.mjs';
import { relativeContact, isHardTurn } from './sector-model.mjs';
import { friendlyCommands } from './communications-model.mjs';

export function expandRadarRounds(shots){
  return shots.flatMap(shot=>{
    if(weapons[shot.weapon].missile)return [shot];
    const count=Math.max(1,Math.round(shot.damage/weapons[shot.weapon].damage));
    return Array.from({length:count},(_,index)=>({...shot,roundIndex:index,roundCount:count}));
  });
}
export function radarDamageSummary(contact,ship){
  if(!contact?.identified||contact.type!=='enemy'||contact.stale||!ship)return [];
  return shipDamageSummary(ship);
}
export function shipDamageSummary(ship){
  if(!ship)return [];
  const groups=[
    ['Hull',[ship.systems.hull]],
    ['Weapons',ship.mounts.map(m=>ship.systems[m.id])],
    ['Sensors',[ship.systems.sensors]],
    ['Engines',Object.entries(ship.systems).filter(([id])=>id.startsWith('engine-')).map(([,system])=>system)]
  ];
  return groups.map(([label,systems])=>{
    const valid=systems.filter(system=>system&&system.max>0);
    if(!valid.length)return {label,percent:null,status:'unknown'};
    const combined=valid.reduce((total,system)=>({hp:total.hp+Math.max(0,Math.min(system.max,system.hp)),max:total.max+system.max}),{hp:0,max:0});
    return {label,percent:Math.round(combined.hp/combined.max*100),status:condition(combined)===1?'healthy':condition(combined)===.7?'damaged':'critical'};
  });
}

export function mountTactical({ root, range, onRangeChange, onChange=()=>{}, flight, onNavigate }) {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, className, text) => { const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const svg = (tag, attrs = {}, text) => { const node = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (text !== undefined) node.textContent = text; return node; };
  const directionLineEnd = 8 + (26 - 8) * 0.75;
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
  let lockedIds = [], priorities = {}, activeId = null, hoverMarker = null, pendingLock=null;
  const orderedLocks=()=>[...lockedIds].sort((a,b)=>priorities[a]-priorities[b]);
  const lockedContacts=()=>orderedLocks().map(id=>contacts.find(c=>c.id===id)).filter(Boolean);
  const radarLabel=target=>`Lock ${target.trackLabel}${priorities[target.id]?`, priority ${priorities[target.id]}`:''}, ${contactTypes[target.type].label}, ${target.identified?`${target.ship.label}, ${target.name}, `:''}${contactDistance(target).toFixed(1)} KM, ${speedText(target)}, ${closureReadout(target).text}, ${zText(target)}${target.trackingStatus?`, ${target.trackingStatus}`:''}${target.behavior==='retreating'?', DISENGAGING':target.behavior==='surrendered'?', SURRENDERED':''}`;

  const heading = el('div', 'tactical-heading');
  const title = el('div', ''); title.append(el('span', 'tactical-eyebrow', 'TACTICAL / WEAPONS CONTROL'));
  const rangeButtons=[];
  const sensorStatus = el('div', 'radar-sensor-status');
  const count = el('span', 'radar-count'); count.setAttribute('role', 'status');
  const ewReadout=el('span','radar-iff-status');ewReadout.setAttribute('role','status');sensorStatus.append(ewReadout);
  sensorStatus.append(count, el('span', 'radar-iff-status', `IFF · ${IFF_RANGE_KM} KM · ~${IFF_IDENTIFICATION_CHANCE * 100}% IDENTIFICATION`));heading.append(title,sensorStatus);

  const workspace = el('div', 'tactical-workspace');
  const charts=[];
  function projectileSymbol(missile,color){
    return missile?svg('path',{d:'M5 0L-3-1.5V1.5Z',fill:color,stroke:color,'stroke-width':.35}):svg('circle',{r:1.8,fill:color});
  }
  function symbol(type, size = 6) {
    const attrs = { fill: contactTypes[type].color, stroke: contactTypes[type].color, 'stroke-width': 1.4 };
    if (type === 'unknown') return svg('path', { ...attrs, d: `M0 ${-size} ${size} 0 0 ${size} ${-size} 0Z` });
    if (type === 'neutral') return svg('path', { ...attrs, d: `M0 ${-size} ${size} ${size} ${-size} ${size}Z` });
    if (type === 'friendly') return svg('circle', { ...attrs, r: size });
    return svg('rect', { ...attrs, x: -size, y: -size, width: size * 2, height: size * 2 });
  }
  function changeRange(value){
    if(value===range)return;
    range=value;hideTooltip();onRangeChange(value);render();
  }
  function createRadar(id){
    const radarArea = el('div', 'tactical-radar-area'); radarArea.id = `tactical-${id}-radar`;
    const screens = el('div', 'radar-screens');
    const card = el('section', 'radar-card'); card.setAttribute('aria-label', 'Tactical radar, top view');
    const caption = el('div', 'radar-caption'); caption.append(el('h3', '', 'TACTICAL RADAR'), el('span', '', 'TOP VIEW · X / Y · HOVER FOR ELEVATION'));
    const chart = svg('svg', { viewBox: '-165 -165 330 330', role: 'group', 'aria-label': 'Tactical radar: X starboard, Y forward; hover or focus a contact for elevation' });
    card.append(caption, chart); screens.append(card);
    const radar={id,view:'top',chart,area:radarArea};charts.push(radar);
    let radarPan={x:0,y:0},radarZoom=1,radarDrag=null,suppressRadarClick=false;
    function updateRadarView(){
      const size=330/radarZoom;
      chart.setAttribute('viewBox',`${-size/2-radarPan.x} ${-size/2-radarPan.y} ${size} ${size}`);
    }
    radar.center=()=>{radarPan={x:0,y:0};updateRadarView();};
    radar.reset=()=>{radarZoom=1;radarPan={x:0,y:0};hideTooltip();updateRadarView();};
    const rangeGroup=el('div','radar-range radar-local-controls');rangeGroup.setAttribute('role','group');rangeGroup.setAttribute('aria-label','Radar range');rangeGroup.append(el('span','','RANGE · KM'));
    for(const value of radarRanges){
      const button=el('button','',String(value));button.type='button';button.setAttribute('aria-label',`Radar range ${value} km`);button.onclick=()=>changeRange(value);rangeGroup.append(button);rangeButtons.push({button,value});
    }
    const center=el('button','','Center');center.type='button';center.setAttribute('aria-label','Center radar on own ship');center.onclick=radar.center;
    const reset=el('button','','Reset zoom');reset.type='button';reset.setAttribute('aria-label','Reset radar zoom');reset.onclick=radar.reset;rangeGroup.append(center,reset);
    chart.style.touchAction='none';
    chart.style.cursor='grab';
    chart.addEventListener('wheel',event=>{
      event.preventDefault();
      if(!event.deltaY)return;
      const matrix=chart.getScreenCTM();
      if(!matrix)return;
      const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?chart.clientHeight:1);
      const next=Math.max(1,Math.min(12,radarZoom*Math.exp(-Math.max(-300,Math.min(300,delta))*.002)));
      const ratio=radarZoom/next;
      radarPan={x:radarPan.x+(point.x+radarPan.x)*(ratio-1),y:radarPan.y+(point.y+radarPan.y)*(ratio-1)};
      radarZoom=next;hideTooltip();updateRadarView();
    },{passive:false});
    chart.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      suppressRadarClick=false;
      radarDrag={id:event.pointerId,x:event.clientX,y:event.clientY,pan:{...radarPan},moved:false};
    });
    chart.addEventListener('pointermove',event=>{
      if(!radarDrag||radarDrag.id!==event.pointerId)return;
      const dx=event.clientX-radarDrag.x,dy=event.clientY-radarDrag.y;
      if(!radarDrag.moved&&Math.hypot(dx,dy)<=5)return;
      radarDrag.moved=true;suppressRadarClick=true;hideTooltip();chart.setPointerCapture(event.pointerId);chart.style.cursor='grabbing';
      const matrix=chart.getScreenCTM();
      if(matrix){radarPan={x:radarDrag.pan.x+dx/matrix.a,y:radarDrag.pan.y+dy/matrix.d};updateRadarView();}
    });
    const endRadarDrag=event=>{
      if(!radarDrag||radarDrag.id!==event.pointerId)return;
      radarDrag=null;chart.style.cursor='grab';
      if(chart.hasPointerCapture(event.pointerId))chart.releasePointerCapture(event.pointerId);
    };
    window.addEventListener('pointerup',endRadarDrag);window.addEventListener('pointercancel',endRadarDrag);
    chart.addEventListener('click',event=>{if(suppressRadarClick){event.preventDefault();event.stopImmediatePropagation();suppressRadarClick=false;}},true);
    chart.setAttribute('aria-label','Tactical radar: drag to pan, scroll to zoom; range buttons set coverage; X starboard, Y forward; hover or focus a contact for elevation');
    caption.lastElementChild.textContent='DRAG TO PAN · SCROLL TO ZOOM';
    const legend = el('div', 'radar-legend'); legend.setAttribute('aria-label', 'Target classifications and weapon fire: triangles are missiles, dots are cannon rounds');
    for (const [type, info] of Object.entries(contactTypes)) {
      const item = el('span', ''); const icon = svg('svg', { viewBox: '-10 -10 20 20', 'aria-hidden': 'true' }); icon.append(symbol(type)); item.append(icon, document.createTextNode(info.label)); legend.append(item);
    }
    for(const [label,color] of [['Outgoing fire','#7cffff'],['Hostile / incoming fire',contactTypes.enemy.color],['Friendly fire',contactTypes.friendly.color],['Other fire','#ffd166']]){
      const item=el('span',''),icon=svg('svg',{viewBox:'-12 -8 24 16',class:'radar-fire-key','aria-hidden':'true'});
      item.title='Triangle: missile · dot: cannon round';
      const missile=projectileSymbol(true,color);missile.setAttribute('transform','translate(-5 0)');icon.append(missile);
      const cannon=projectileSymbol(false,color);cannon.setAttribute('cx',7);icon.append(cannon);
      item.append(icon,document.createTextNode(label));legend.append(item);
    }
    const encounterReport=el('p','tactical-encounter');encounterReport.setAttribute('role','status');
    radarArea.append(rangeGroup,encounterReport,screens,legend);
    Object.assign(radar,{legend,encounterReport});return radar;
  }
  function createTargetPicker(id){
    const selection=el('div','tactical-contact target-picker-controls');
    const label=el('label','radar-contact-picker');label.append(el('span','','LOCK TARGET'));
    const picker=el('select','');picker.id=`tactical-${id}-target-picker`;picker.setAttribute('aria-label','Lock radar track');picker.onchange=()=>{if(picker.value)lock(picker.value);};label.append(picker);
    const hint=el('span','radar-interaction-hint','Select a track to lock and set priority · 1 = highest');selection.append(label,hint);
    return {selection,picker};
  }
  function refreshEncounterReport(){
    const sector=flight?.sector,event=sector?.encounter;
    const text=event?`${sector.location} · ${event.title} · ${event.summary}`:`${sector?.location||'Earth'} · Training encounter`;
    for(const {encounterReport} of charts)if(encounterReport.textContent!==text)encounterReport.textContent=text;
  }

  const displayGroups={
    left:[['radar','Radar'],['targets','Targets / Tracking'],['ship','Ship info'],['systems','Systems']],
    right:[['weapons','Weapons'],['defense','Defense'],['maneuver','Maneuver'],['settings','Settings']]
  };
  function displayIcon(key){
    const icon=svg('svg',{class:'mfd-button-icon',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.6,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'});
    const paths={
      radar:'M12 12 20 4M21 12a9 9 0 1 1-9-9M17 12a5 5 0 1 1-5-5',
      targets:'M12 2v4m0 12v4M2 12h4m12 0h4M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
      ship:'m12 2 6 17-6-3-6 3 6-17Zm0 7v7M8 22h8',
      systems:'M4 5h16v6H4zM4 15h16v6H4zM7 8h.01M7 18h.01M11 8h6m-6 10h6',
      weapons:'M9 17V8c0-3 3-6 3-6s3 3 3 6v9M9 17h6v4H9zM9 9h6M5 19v-4l4-4m10 8v-4l-4-4',
      defense:'m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Zm-4 10 3 3 5-6',
      maneuver:'M4 21v-8a5 5 0 0 1 5-5h11m-5-5 5 5-5 5',
      settings:'M4 7h7m4 0h5M4 17h3m4 0h9M11 4v6M7 14v6'
    };
    icon.append(svg('path',{d:paths[key]}));return icon;
  }
  function createMfd(id,label){
    const targetPanel = el('aside', 'tactical-target-panel'); targetPanel.id = `tactical-${id}-target-panel`; targetPanel.setAttribute('aria-label', `${label} target details`);
    const combatPanel = el('aside', 'tactical-combat-panel'); combatPanel.id = `tactical-${id}-combat-panel`; combatPanel.setAttribute('aria-label', `${label} combat controls`);
    const displayPanes={left:{},right:{}},displayButtons=new Map();
    const controlUnit=el('section','tactical-control-unit');controlUnit.dataset.mfd=id;controlUnit.setAttribute('aria-label',label);
    const displayScreen=el('section','tactical-mfd-screen');displayScreen.id=`tactical-${id}-screen`;displayScreen.setAttribute('aria-labelledby',`tactical-${id}-title`);
    const displayHeader=el('header','tactical-mfd-header'),displayHeading=el('div','');
    const displayContext=el('span','tactical-eyebrow'),displayTitle=el('h2','');displayTitle.id=`tactical-${id}-title`;displayHeading.append(displayContext,displayTitle);
    const displayIndex=el('span','mfd-screen-index');displayIndex.setAttribute('aria-hidden','true');
    displayHeader.append(displayHeading,displayIndex);displayScreen.append(displayHeader,targetPanel,combatPanel);
    const mfd={id,label,targetPanel,combatPanel,displayPanes,displayButtons,displayScreen,displayContext,displayTitle,displayIndex,controlUnit};
    function displayRail(side){
      const rail=el('aside','tactical-mfd-rail');rail.dataset.side=side;rail.setAttribute('aria-label',`${label} ${side==='left'?'sensor and target':'combat'} display controls`);
      for(const [key,label] of displayGroups[side]){
        const pane=el('section','tactical-mfd-pane');pane.id=`tactical-${id}-display-${key}`;pane.hidden=true;pane.setAttribute('role','region');pane.setAttribute('aria-labelledby',`tactical-${id}-button-${key}`);displayPanes[side][key]=pane;
        if(key==='radar'){pane.classList.add('tactical-mfd-radar');mfd.radar=createRadar(id);pane.append(mfd.radar.area);displayScreen.append(pane);}
        else (side==='left'?targetPanel:combatPanel).append(pane);
        const button=el('button','tactical-mfd-button');button.id=`tactical-${id}-button-${key}`;button.type='button';
        const hoverLabel=el('span','mfd-button-tooltip',label);hoverLabel.id=`tactical-${id}-label-${key}`;hoverLabel.setAttribute('role','tooltip');
        button.append(el('span','mfd-button-index',String(displayButtons.size+1).padStart(2,'0')),displayIcon(key),hoverLabel);
        button.setAttribute('aria-label',`Open ${label.toLowerCase()} display`);button.setAttribute('aria-controls',pane.id);button.setAttribute('aria-pressed','false');
        button.setAttribute('aria-describedby',hoverLabel.id);
        button.onclick=()=>openDisplay(mfd,side,key);displayButtons.set(`${side}-${key}`,button);rail.append(button);
      }
      return rail;
    }
    const leftRail=displayRail('left'),rightRail=displayRail('right');
    const targetPicker=createTargetPicker(id);mfd.picker=targetPicker.picker;mfd.targetDetails=el('section','target-tracking-details');
    displayPanes.left.targets.append(targetPicker.selection,mfd.targetDetails);
    controlUnit.append(leftRail,displayScreen,rightRail);workspace.append(controlUnit);
    controlUnit.addEventListener('pointerdown',()=>{weaponControls=mfd.weaponControls;});
    controlUnit.addEventListener('focusin',()=>{weaponControls=mfd.weaponControls;});
    return mfd;
  }
  const displays=[createMfd('left','Left MFD'),createMfd('right','Right MFD')];
  function closeQuickFireControls(){for(const mfd of displays)mfd.weaponControls?.closeQuickFire();}
  function quickFireIsOpen(){return displays.some(mfd=>mfd.weaponControls?.isQuickFireOpen());}
  function openDisplay(mfd,side,key){
    const {displayScreen,displayContext,displayTitle,displayIndex,displayButtons,displayPanes,targetPanel,combatPanel}=mfd;
    hideTooltip();closeQuickFireControls();closeFriendlyPopup();
    if(maneuverPopup.matches(':popover-open'))maneuverPopup.hidePopover();
    const changed=displayScreen.dataset.display!==key;
    displayScreen.dataset.display=key;
    displayContext.textContent=mfd.label.toUpperCase();displayTitle.textContent=displayGroups[side].find(([id])=>id===key)[1];
    displayIndex.textContent=`${displayButtons.get(`${side}-${key}`).firstElementChild.textContent} / 08`;
    targetPanel.hidden=side!=='left'||key==='radar';combatPanel.hidden=side!=='right';
    for(const [group,panes] of Object.entries(displayPanes))for(const [id,pane] of Object.entries(panes))pane.hidden=group!==side||id!==key;
    for(const [id,button] of displayButtons)button.setAttribute('aria-pressed',String(id===`${side}-${key}`));
    if(changed){targetPanel.scrollTop=0;combatPanel.scrollTop=0;}
  }
  const note = el('div', 'tactical-note');const flightStatus=el('span','','');note.append(flightStatus, el('span', '', 'LOCAL COMBAT · PROVISIONAL PERFORMANCE · CONSTANT PROJECTILE DAMAGE'));
  const tooltip = el('div', 'radar-tooltip'); tooltip.id = 'radar-track-tooltip'; tooltip.setAttribute('role', 'tooltip'); tooltip.hidden = true;
  root.append(heading,workspace,note,tooltip);
  const priorityDialog=el('dialog','target-priority-dialog');priorityDialog.id='target-priority-dialog';priorityDialog.setAttribute('aria-labelledby','target-priority-title');
  priorityDialog.append(el('span','tactical-eyebrow','TACTICAL / TARGET PRIORITY'));
  const priorityTitle=el('h2','','Set target priority');priorityTitle.id='target-priority-title';
  const priorityContext=el('p',''),priorityForm=el('form','target-priority-form'),priorityLabel=el('label','bridge-setting'),priorityInput=el('select','');priorityInput.id='target-priority-value';priorityInput.setAttribute('aria-label','Target priority');priorityInput.required=true;priorityLabel.append(el('span','','Priority · 1 is highest'),priorityInput);
  const priorityUsed=el('p','combat-note'),priorityError=el('p','target-priority-error');priorityError.setAttribute('role','alert');
  const priorityActions=el('div','target-priority-actions'),priorityConfirm=el('button','primary-button','Confirm priority'),priorityCancel=el('button','secondary-button','Cancel');priorityConfirm.type='submit';priorityCancel.type='button';priorityCancel.onclick=()=>priorityDialog.close();priorityActions.append(priorityConfirm,priorityCancel);
  priorityForm.append(priorityLabel,priorityUsed,priorityError,priorityActions);priorityDialog.append(priorityTitle,priorityContext,priorityForm);document.body.append(priorityDialog);
  priorityDialog.addEventListener('close',()=>{pendingLock=null;for(const mfd of displays)mfd.picker.value=activeId||'';});
  priorityForm.onsubmit=event=>{
    event.preventDefault();if(!pendingLock)return;
    const draft=pendingLock,priority=Number(priorityInput.value);
    if(!draft.edit&&!contactsInRange(contacts.filter(c=>!c.stale),range).some(c=>c.id===draft.id)){priorityError.textContent='This ship is no longer in radar coverage. Cancel and choose another track.';return;}
    let next;
    try{next=draft.edit?{lockedIds:[...lockedIds],priorities:restoreTargetPriorities(lockedIds,{...priorities,[draft.id]:priority})}:prioritizeTargets(lockedIds,priorities,draft.id,priority,draft.toggle);}
    catch(error){priorityError.textContent=error.message;return;}
    lockedIds=next.lockedIds;priorities=next.priorities;activeId=draft.id;priorityDialog.close();finishLock(draft.id,draft.sourceView,draft.toggle,draft.quick);
  };
  // All contact symbols keep the same size when locked or unlocked.
  function markerScale(chart){
    const bounds=chart.getBoundingClientRect(),scale=Math.min(bounds.width/330,bounds.height/330);
    const legendWidth=chart.closest('.tactical-radar-area').querySelector('.radar-legend svg').getBoundingClientRect().width;
    return scale>0&&legendWidth>0?(legendWidth*6/20)/(4.5*scale):1;
  }
  const chartResize=new ResizeObserver(()=>{for(const {chart} of charts)for(const marker of chart.querySelectorAll('.radar-contact-glyph'))marker.setAttribute('transform',`scale(${markerScale(chart)})`);});
  for(const {chart} of charts)chartResize.observe(chart);
  for(const mfd of displays){
    mfd.weaponControls=flight?.combat?mountWeaponsConsole({flight,idPrefix:`tactical-${mfd.id}`,onSelectionChange:selection=>{
      for(const other of displays)if(other!==mfd)other.weaponControls?.restoreSelection(selection);
    }}):null;
    const controls=mfd.weaponControls,panes=mfd.displayPanes.right;
    if(controls){panes.weapons.append(controls.root);panes.defense.append(controls.defense);panes.settings.append(controls.settings);}
    else for(const pane of Object.values(panes))pane.append(el('p','target-empty','Flight controls unavailable in this training snapshot.'));
  }
  let weaponControls=displays[0].weaponControls;

  const maneuverPopup=el('section','radar-maneuver-popup');maneuverPopup.id='radar-maneuver-popup';maneuverPopup.popover='auto';maneuverPopup.setAttribute('role','dialog');maneuverPopup.setAttribute('aria-labelledby','radar-maneuver-title');
  const maneuverHeader=el('header','quick-fire-heading'),maneuverTitle=el('h3','',`${playerShipName(flight?.combat).toUpperCase()} · COMBAT MANEUVER`);maneuverTitle.id='radar-maneuver-title';
  const closeManeuver=el('button','','×');closeManeuver.type='button';closeManeuver.setAttribute('aria-label','Close combat maneuver');closeManeuver.onclick=()=>maneuverPopup.hidePopover();maneuverHeader.append(maneuverTitle,closeManeuver);
  const maneuverTarget=el('p','combat-note'),maneuverBody=el('div',''),maneuverStatus=el('p','combat-note');maneuverStatus.setAttribute('role','status');
  maneuverPopup.append(maneuverHeader,maneuverTarget,maneuverBody,maneuverStatus);root.append(maneuverPopup);
  let maneuverTargetId;
  function maneuverUnavailable(mode=maneuverBody.querySelector('select')?.value){
    const target=contacts.find(c=>c.id===activeId&&lockedIds.includes(c.id));
    if(!flight)return 'Local flight controls are unavailable.';
    if(flight.inTransit())return 'Combat maneuvers are unavailable during EPD transit.';
    if(isHardTurn(mode))return '';
    if(!target)return 'Lock a radar contact to choose a maneuver target.';
    if(target.stale||!contactsInRange(contacts.filter(c=>!c.stale),range).includes(target))return 'Target is outside radar coverage. Choose a live contact.';
    return '';
  }
  function refreshManeuverPopup(){
    if(!maneuverPopup.matches(':popover-open'))return;
    const target=contacts.find(c=>c.id===activeId&&lockedIds.includes(c.id));
    maneuverTarget.textContent=target?`TARGET · ${target.trackLabel} · ${target.name}`:'NO TARGET LOCKED';
    if(maneuverTargetId!==(target?.id??null)){
      maneuverTargetId=target?.id??null;maneuverBody.replaceChildren();
      if(flight){
        const controls=mountManeuverControls({flight,targetId:target?.id,canExecute:mode=>!maneuverUnavailable(mode),onNavigate:()=>{maneuverPopup.hidePopover();onNavigate();}});
        controls.querySelector('select').addEventListener('change',refreshManeuverPopup);
        controls.querySelector('form').addEventListener('submit',event=>{
          if(maneuverUnavailable()){event.preventDefault();event.stopImmediatePropagation();refreshManeuverPopup();return;}
        },true);
        controls.querySelector('form').addEventListener('submit',()=>{onChange();refreshManeuverPopup();});maneuverBody.append(controls);
      }
    }
    const unavailable=maneuverUnavailable(),execute=maneuverBody.querySelector('button[type="submit"]');
    if(execute)execute.disabled=!!unavailable;
    const bearing=flight?(Math.atan2(flight.sector.facing.x,flight.sector.facing.y)*180/Math.PI+360)%360:0;
    maneuverStatus.textContent=unavailable||`${flightReadout(flight)} · Bow ${bearing.toFixed(0)}°`;
  }
  function openManeuverPopup(event,marker){
    event.preventDefault();hideTooltip();weaponControls?.closeQuickFire();
    maneuverPopup.showPopover();refreshManeuverPopup();
    const anchor=marker.getBoundingClientRect(),box=maneuverPopup.getBoundingClientRect();
    maneuverPopup.style.left=`${Math.max(10,Math.min((event.clientX||anchor.right)+10,innerWidth-box.width-10))}px`;
    maneuverPopup.style.top=`${Math.max(10,Math.min((event.clientY||anchor.top)+10,innerHeight-box.height-10))}px`;
    (maneuverBody.querySelector('select')||closeManeuver).focus({preventScroll:true});
  }
  window.addEventListener('resize',()=>{if(maneuverPopup.matches(':popover-open'))maneuverPopup.hidePopover();});

  const friendlyPopup=el('section','radar-maneuver-popup radar-friendly-popup');friendlyPopup.id='radar-friendly-popup';friendlyPopup.popover='auto';friendlyPopup.setAttribute('role','dialog');friendlyPopup.setAttribute('aria-labelledby','radar-friendly-title');
  const friendlyHeader=el('header','quick-fire-heading'),friendlyTitle=el('h3','','SDF SHIP COMMANDS');friendlyTitle.id='radar-friendly-title';
  const closeFriendly=el('button','','×');closeFriendly.type='button';closeFriendly.setAttribute('aria-label','Close friendly ship commands');closeFriendly.onclick=()=>friendlyPopup.hidePopover();friendlyHeader.append(friendlyTitle,closeFriendly);
  const friendlyName=el('p','friendly-ship-name'),friendlyContext=el('p','combat-note'),friendlyActions=el('div','friendly-command-actions'),friendlyReply=el('p','friendly-command-reply');friendlyReply.setAttribute('role','status');
  let friendlyShipId=null;
  for(const command of friendlyCommands){
    const control=el('button','bridge-action',command.label);control.type='button';
    control.onclick=()=>{
      const result=flight?.requestFriendly?.(friendlyShipId,command.id,orderedLocks());
      friendlyReply.textContent=result?(result.response||result.message):'Ship communications are unavailable.';
      friendlyReply.dataset.result=result?.accepted===false?'refused':result?.ok?'received':'unavailable';refreshFriendlyPopup();
    };friendlyActions.append(control);
  }
  friendlyPopup.append(friendlyHeader,friendlyName,friendlyContext,friendlyActions,el('p','target-fit-note','Requests depend on ship readiness, communications, weapons range, and confirmed threats. Accepted orders provide fire support; ships keep their present course.'),friendlyReply);root.append(friendlyPopup);
  function closeFriendlyPopup(){if(friendlyPopup.matches(':popover-open'))friendlyPopup.hidePopover();friendlyShipId=null;}
  function refreshFriendlyPopup(){
    if(!friendlyPopup.matches(':popover-open'))return;
    const contact=contactsInRange(contacts.filter(c=>!c.stale),range).find(c=>c.id===friendlyShipId&&c.type==='friendly');
    if(!contact){closeFriendlyPopup();return;}
    friendlyName.textContent=`${contact.trackLabel} · ${contact.name}`;
    const unavailable=flight?.friendlyLink?.(friendlyShipId)??(!flight?.requestFriendly?'Ship communications are unavailable.':null);
    const order=flight?.combat.alliedOrders?.[friendlyShipId],targets=lockedContacts().filter(c=>!c.stale&&c.type==='enemy'&&contactDistance(c)<=range);
    friendlyContext.textContent=unavailable||`${targets.length} locked hostile target${targets.length===1?'':'s'} available. ${order?`Supporting ${order.targetIds.length} transmitted target${order.targetIds.length===1?'':'s'}.`:'No support order active.'}`;
    for(const control of friendlyActions.children)control.disabled=!!unavailable;
  }
  function openFriendlyPopup(id,event,marker){
    event.preventDefault();hideTooltip();weaponControls?.closeQuickFire();friendlyShipId=id;friendlyReply.textContent='Choose a request. This ship will reply on its Comms channel.';delete friendlyReply.dataset.result;
    friendlyPopup.showPopover();refreshFriendlyPopup();
    if(!friendlyPopup.matches(':popover-open'))return;
    const anchor=marker.getBoundingClientRect(),box=friendlyPopup.getBoundingClientRect();
    friendlyPopup.style.left=`${Math.max(10,Math.min((event.clientX||anchor.right)+10,innerWidth-box.width-10))}px`;
    friendlyPopup.style.top=`${Math.max(10,Math.min((event.clientY||anchor.top)+10,innerHeight-box.height-10))}px`;
    (friendlyActions.querySelector('button:not(:disabled)')||closeFriendly).focus({preventScroll:true});
  }
  window.addEventListener('resize',closeFriendlyPopup);

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
  const catalogList=el('section','armament-catalog-comparison');
  const catalogNote=el('p','armament-catalog-note','Damage is per round or missile, before armor. Fire rate is per barrel; pauses, ammunition, and targeting affect actual output.');catalogNote.id='armament-catalog-note';
  const catalogScroll=el('div','armament-table-scroll');catalogScroll.tabIndex=0;catalogScroll.setAttribute('role','region');catalogScroll.setAttribute('aria-label','Weapon comparison table');
  const catalogTable=el('table','armament-catalog-table');catalogTable.setAttribute('aria-describedby',catalogNote.id);
  catalogTable.append(el('caption','','Weapon performance comparison'));
  const catalogHead=el('thead',''),catalogHeadRow=el('tr','');
  for(const [label,unit] of [['Weapon',''],['Damage','per round / missile'],['Range','km'],['Fire rate','rounds/min/barrel'],['Guidance / targeting',''],['Ammunition feed','']]){
    const cell=el('th','',label);cell.scope='col';if(unit)cell.append(el('small','',unit));catalogHeadRow.append(cell);
  }
  catalogHead.append(catalogHeadRow);const catalogBody=el('tbody','');catalogTable.append(catalogHead,catalogBody);
  for(const [id,weapon] of Object.entries(armamentTypes)){
    const item=el('tr','');item.dataset.armament=id;const spec=weapons[id];
    const name=el('th','',weapon.name);name.scope='row';name.append(el('small','',weapon.category));
    item.append(name,el('td','armament-damage',String(spec.damage)),el('td','armament-number',String(spec.range)),el('td','armament-number',spec.rpm.toLocaleString('en-US')),el('td','',spec.guidance),el('td','',spec.feed||'Not specified'));
    catalogBody.append(item);
  }
  catalogScroll.append(catalogTable);catalogList.append(catalogNote,catalogScroll);
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
    if(Number.isInteger(h.repairShuttles)){
      parts.push(`${h.repairShuttles} repair shuttles`);
      if(h.launchLanes)parts.push(`Launch lanes: ${h.launchLanes.aft} aft, ${h.launchLanes.port} port, ${h.launchLanes.starboard} starboard`);
      return `${parts.join(' · ')}. Rear-facing hangar for repair and resupply operations.`;
    }
    const capacity=shuttleTypes[h.assaultShuttles?'assault-shuttle':'shuttle'].troopCapacity;
    return `${parts.join(' · ')}. Each craft carries ${capacity} marines / raiders, excluding flight crew.`;
  }
  function boardingText(ship){const b=ship.boarding;return b?`${b.personnel} ${b.unit.toLowerCase()}${b.platoons?` · ${b.platoons} ${b.platoons===1?'platoon':'platoons'}`:''}, including up to ${Math.floor(b.personnel*crewDoctrine.maxAndroidFraction)} androids (30% maximum). Boarding, ship seizure, and defense of their ship.`:'Not specified';}
  function crewText(ship){return `${crewDoctrine.automation} ${ship.crew?.androids==='included'?crewDoctrine.androids:'Android complement not specified.'}`;}
  const fitPicker=el('label','bridge-setting armament-fit-picker');fitPicker.append(el('span','','SHIP CLASS SPECIFICATION'));
  const fitSelect=el('select','');fitSelect.setAttribute('aria-label','Ship class specification');
  for(const [id,ship] of Object.entries(shipTypes))if(ship.fitConfirmed||ship.boarding)fitSelect.append(Object.assign(el('option','',ship.label),{value:id}));fitSelect.value='sdf-frigate';fitPicker.append(fitSelect);
  const ownFit=el('section','armament-own-fit');
  function renderClassFit(){
    const id=fitSelect.value,ship=shipTypes[id];
    ownFit.replaceChildren(el('span','tactical-eyebrow',id===flight?.combat.own.classId?'YOUR SHIP · '+playerShipName(flight.combat).toUpperCase():'SHIP CLASS REFERENCE'),el('h3','',ship.label));
    if(shipFiveViews[id]){
      const reference=el('button','armament-catalog-link','View five-view reference ↗');reference.type='button';
      reference.setAttribute('aria-haspopup','dialog');reference.setAttribute('aria-controls',shipDialog.id);
      reference.onclick=()=>openShipReference({identified:true,ship:{...ship,image:shipFiveViews[id]}});ownFit.append(reference);
    }
    ownFit.append(el('p','combat-note',shipNamingConventions[id]?'UNE naming: '+shipNamingConventions[id].category:''),loadoutList(ship),el('h4','','COUNTERMEASURES'),countermeasureList(ship),el('h4','','SHUTTLE FACILITIES'),el('p','ship-facility-summary',hangarText(ship)),el('h4','','BOARDING / DEFENSE FORCE'),el('p','ship-facility-summary',boardingText(ship)),el('h4','','CREW / AUTOMATION'),el('p','ship-facility-summary',crewText(ship)),el('h4','','ENGINES'),el('p','ship-facility-summary',ship.engines),el('p','target-fit-note',ship.fitConfirmed?'Confirmed class equipment and engine counts · unspecified equipment and performance remain provisional.':'Confirmed raider and assault shuttle counts · other fittings and engine models provisional.'));
  }
  fitSelect.onchange=renderClassFit;renderClassFit();
  catalogDialog.append(catalogHeader,catalogList,fitPicker,ownFit);document.body.append(catalogDialog);
  const openCatalog=()=>{hideTooltip();renderClassFit();catalogDialog.showModal();};
  for(const mfd of displays){
    const catalogButton=el('button','armament-catalog-trigger','Armament catalog ↗');catalogButton.type='button';catalogButton.setAttribute('aria-haspopup','dialog');catalogButton.setAttribute('aria-controls',catalogDialog.id);catalogButton.onclick=openCatalog;mfd.displayPanes.right.settings.prepend(catalogButton);
  }
  catalogDialog.onclick=event=>{if(event.target!==catalogDialog)return;const box=catalogDialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)catalogDialog.close();};
  function catalogLink(){const button=el('button','armament-catalog-link','View armament catalog ↗');button.type='button';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',catalogDialog.id);button.onclick=openCatalog;return button;}

  function hideTooltip() {
    tooltip.hidden = true; hoverMarker?.removeAttribute('aria-describedby'); hoverMarker = null;
  }
  function positionTooltip(x, y) {
    const box = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - box.width - 8))}px`;
    tooltip.style.top = `${Math.max(8, y + 14 + box.height > innerHeight - 8 ? y - box.height - 12 : y + 14)}px`;
  }
  function appendDamageSummary(damage,label){
    if(damage.length){
      const summary=el('section','radar-damage-summary');summary.setAttribute('aria-label',label);summary.append(el('span','radar-damage-title','INTEGRITY REMAINING'));
      const grid=el('div','radar-damage-grid');
      for(const {label,percent,status} of damage){
        const row=el('div','radar-damage-row'),value=el('span',`target-integrity-value is-${status}`,percent===null?'—':`${percent}%`);
        value.setAttribute('aria-label',`${label}: ${percent===null?'unknown':`${percent}% integrity remaining`}`);row.append(el('span','',label),value);grid.append(row);
      }
      summary.append(grid);tooltip.append(summary);
    }
  }
  function showOwnTooltip(marker,event){
    const ship=flight?.combat?.own;
    if(!ship||priorityDialog.open||quickFireIsOpen()||maneuverPopup.matches(':popover-open'))return;
    hideTooltip();hoverMarker=marker;marker.setAttribute('aria-describedby',tooltip.id);
    tooltip.replaceChildren(el('strong','',`${playerShipName(flight.combat).toUpperCase()} · OUR SHIP`),el('span','',shipTypes[ship.classId]?.label||'Our ship'),el('span','',`Speed ${speedText(flight.sector.own)}`),el('span','',`Radar ${radarEmitting(ship)?'EMITTING':'SILENT / OFFLINE'}`),el('span','',`Jammer ${ship.jammerMode==='auto'?'AUTO · ':''}${jammerEmitting(ship)?'EMITTING':'SILENT / OFFLINE'}`));
    appendDamageSummary(shipDamageSummary(ship),'Our ship integrity');
    tooltip.append(el('span','','Right-click for combat maneuvers'));
    tooltip.hidden=false;const bounds=marker.getBoundingClientRect();positionTooltip(event?.clientX??bounds.right,event?.clientY??bounds.top);
  }
  function showTooltip(contact, marker, event) {
    if(priorityDialog.open||quickFireIsOpen())return;
    hideTooltip(); hoverMarker = marker; marker.setAttribute('aria-describedby', tooltip.id);
    const closure = closureReadout(contact);
    const classification=`${contact.trackLabel} · ${contactTypes[contact.type].label}`;
    const identity=contact.identified?[el('strong','',contact.name),el('span','',contact.ship.label),el('span','',classification)]:[el('strong','',classification)];
    tooltip.replaceChildren(...identity, el('span', '', `Distance ${contactDistance(contact).toFixed(1)} KM`), el('span', '', `Speed ${speedText(contact)}`), el('span', `radar-closure ${closure.className}`, closure.text), el('span', signClass(contact.z), zText(contact)), el('span', signClass(contact.y), yText(contact)), el('span', '', `IFF: ${contact.iffStatus}`));
    if(contact.trackingStatus)tooltip.append(el('span','',`${contact.jammerEmitting?'JAMMER EMISSION · ':''}${contact.trackingStatus} · ${Math.round(contact.trackingQuality*100)}% track quality`));
    appendDamageSummary(radarDamageSummary(contact,flight?.combat.contacts[contact.id]),'Enemy ship integrity');
    if(contact.behavior)tooltip.append(el('span','',contact.behavior==='retreating'?'DISENGAGING · accelerating away':'SURRENDERED · weapons secured'));
    if(priorities[contact.id])tooltip.append(el('span','',`Priority ${priorities[contact.id]} · 1 is highest`));
    tooltip.hidden = false;
    const bounds = marker.getBoundingClientRect(); positionTooltip(event?.clientX ?? bounds.right, event?.clientY ?? bounds.top);
  }
  const hideWhenInactive = () => { if (root.parentElement.dataset.station !== 'tactical' || document.body.dataset.screen !== 'bridge') { hideTooltip();closeQuickFireControls();closeFriendlyPopup();if(maneuverPopup.matches(':popover-open'))maneuverPopup.hidePopover();if(priorityDialog.open)priorityDialog.close(); } };
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
    if(sourceView)charts.find(item=>item.id===sourceView)?.chart.querySelector(`.radar-track[data-track="${id}"]`)?.focus({preventScroll:true});
  }
  function openQuickFire(id,event,marker){
    if(contacts.find(c=>c.id===id)?.type==='friendly'){openFriendlyPopup(id,event,marker);return;}
    if(!weaponControls)return;event.preventDefault();
    const bounds=marker.getBoundingClientRect(),x=event.clientX||bounds.right,y=event.clientY||bounds.top;
    if(!lockedIds.includes(id)){askPriority(id,{toggle:true,quick:{x,y}});return;}
    activeId=id;finishLock(id,undefined,true,{x,y});
  }
  function detailRow(label, value, className = '') {
    const row = el('div', ''); row.append(el('dt', '', label), el('dd', className, value)); return row;
  }
  function renderTarget(contact, visible, mfd) {
    const {displayPanes,weaponControls}=mfd;
    if(weaponControls)weaponControls.refresh(contact||null,lockedContacts());
    if(flight){
      const maneuvers=mountManeuverControls({flight,targetId:contact?.id,onNavigate,canExecute:mode=>isHardTurn(mode)||contactsInRange(contacts.filter(c=>!c.stale),range).some(c=>c.id===contact?.id)});
      displayPanes.right.maneuver.replaceChildren(maneuvers);
    }
    const inRange = visible.includes(contact);
    const status = el('div', `target-lock-status${contact ? ' locked' : ''}`); status.setAttribute('role', 'status');
    status.textContent = contact ? `${lockedIds.length} TARGET${lockedIds.length === 1 ? '' : 'S'} LOCKED · PRIORITY ${priorities[contact.id]}${contact.stale?' · SENSOR LOST / LAST KNOWN':inRange ? '' : ' · OUT OF RANGE'}` : 'FIRE CONTROL / STANDBY';
    const name = el('h3', '', contact ? contact.name : 'No target locked'); name.tabIndex = -1;
    if (!contact) {
      mfd.targetDetails.replaceChildren(status,name,el('p','target-empty','Select a track above or click a radar contact to choose its priority. Ctrl + left-click adds or removes targets.'),el('div','target-empty-reticle','⌖'),el('p','target-fit-note',flight?.sector.encounter?`${contacts.length} local ship contacts. Radar detects traffic within sensor coverage; use a wider radar range to inspect the sector.`:'12 ship types in the training catalog. Radar detects contacts within 200 km.'),catalogLink());
      for(const key of ['ship','systems'])displayPanes.left[key].replaceChildren(el('h3','','No target locked'),el('p','target-empty','Select a radar contact to view its '+(key==='ship'?'ship information':'systems and facilities')+'.'));
      displayPanes.left.ship.append(catalogLink());
      if(weaponControls)displayPanes.left.systems.append(weaponControls.targetDetails);
      return;
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
    const release = el('button', 'target-release', 'Release all target locks'); release.onclick = () => { lockedIds = [];priorities={}; activeId = null; render();onChange(); hideTooltip(); mfd.picker.focus({ preventScroll: true }); };
    mfd.targetDetails.replaceChildren(status,lockedList,name,telemetry,changePriority,release);
    displayPanes.left.ship.replaceChildren(shipClass,identity,armaments,countermeasures,engines,el('p','target-fit-note',contact.identified?ship.fitConfirmed?'CONFIRMED EQUIPMENT & ENGINE COUNTS · PROVISIONAL ENGINE MODELS & SIZE':ship.boarding?'CONFIRMED RAIDERS & ASSAULT SHUTTLES · OTHER FITTINGS PROVISIONAL':'TRAINING DATA · PROVISIONAL SHIP FIT & SIZE':'Identity, type, size, and equipment unconfirmed.'));
    displayPanes.left.systems.replaceChildren();
    if(weaponControls)displayPanes.left.systems.append(weaponControls.targetDetails);
    displayPanes.left.systems.append(hangar,boarding,crew);
  }

  function renderProjectiles(chart,view){
    let layer=chart.querySelector('.radar-projectiles');
    if(!layer){layer=svg('g',{class:'radar-projectiles','pointer-events':'none','aria-label':'Weapon fire in flight'});chart.append(layer);}
    const markers=[];
    const visibleShots=(flight?.combat.shots??[]).filter(shot=>contactDistance(relativeContact(flight.sector,shot))<=range);
    for(const shot of expandRadarRounds(visibleShots)){
      const relative=relativeContact(flight.sector,shot);
      if(contactDistance(relative)>range)continue;
      const point=projectContact(relative,view,range),direction=projectVelocity(relative,view,1)||{x:0,y:-1};
      const missile=!!weapons[shot.weapon]?.missile;
      if(!missile){
        // Separate simultaneous barrels/burst rounds so each dot stays visible.
        const offset=(shot.roundIndex-(shot.roundCount-1)/2)*2.5;
        point.x-=direction.y*offset;point.y+=direction.x*offset;
      }
      const outgoing=shot.sourceId==='own',incoming=shot.targetId==='own';
      const sourceTrack=contacts.find(c=>c.id===shot.sourceId)||flight.sector.memory[shot.sourceId]?.observed;
      const hostile=sourceTrack?.type==='enemy'||flight.combat.hostiles.includes(shot.sourceId);
      const friendly=sourceTrack?.type==='friendly'&&!hostile;
      if(missile){
        // Separate the launcher from the ship glyph, blending into the live
        // flight track as the missile clears the ship's starboard side.
        const source=outgoing?flight.sector.own:flight.sector.contacts.find(c=>c.id===shot.sourceId);
        if(source){
          const clearance=Math.hypot(shot.x-source.x,shot.y-source.y,shot.z-source.z)*148/range;
          point.x+=6*Math.exp(-clearance/8);
        }
      }
      const color=outgoing?'#7cffff':incoming||hostile?contactTypes.enemy.color:friendly?contactTypes.friendly.color:'#ffd166';
      const marker=svg('g',{class:`radar-projectile ${missile?'missile':'cannon'} ${outgoing?'outgoing':incoming?'incoming':hostile?'hostile':friendly?'friendly':'other'}`,'data-shot':shot.id,transform:`translate(${point.x} ${point.y}) rotate(${Math.atan2(direction.y,direction.x)*180/Math.PI})`});
      marker.append(svg('title',{},`${outgoing?'Outgoing':incoming?'Incoming':hostile?'Hostile':friendly?'Friendly':'Other'} ${missile?'missile':'cannon round'} · ${armamentTypes[shot.weapon]?.name??shot.weapon} · ${contactDistance(relative).toFixed(1)} km`));
      marker.append(projectileSymbol(missile,color));
      markers.push(marker);
    }
    const tender=flight?.combat.support;
    if(tender&&contactDistance(relativeContact(flight.sector,tender))<=range){
      const relative=relativeContact(flight.sector,tender),point=projectContact(relative,view,range),marker=svg('g',{class:'radar-support-tender',transform:`translate(${point.x} ${point.y})`,'aria-label':`Resupply / repair tender · ${tender.phase}`});
      marker.append(svg('title',{},supportStatus(flight.combat,flight.sector)),svg('circle',{r:5,fill:contactTypes.friendly.color}),svg('path',{d:'M-3 0H3M0-3V3',stroke:'#091a21','stroke-width':1.3}),svg('text',{x:9,y:-7,fill:contactTypes.friendly.color,'font-size':11},'TENDER'));markers.push(marker);
    }
    if(flight)for(const event of recentInterceptions(flight.combat)){
      const own=event.shipId==='own',ship=own?flight.sector.own:flight.sector.contacts.find(c=>c.id===event.shipId);
      if(!ship)continue;
      const relative=relativeContact(flight.sector,ship);
      if(!own&&!contactsInRange(contacts.filter(c=>!c.stale),range).some(c=>c.id===event.shipId))continue;
      const point=projectContact(relative,view,range);
      const flash=svg('text',{x:point.x+11,y:point.y-7,fill:'#fff5ce','font-size':14,'font-weight':'bold','aria-label':'Missile shot down'},'*');
      markers.push(flash);
      // Also expire while paused, when the simulation stops refreshing.
      setTimeout(()=>flash.remove(),Math.max(0,event.expires-performance.now()));
    }
    layer.replaceChildren(...markers);
  }

  function render() {
    hideTooltip();
    refreshEncounterReport();
    const visible = contactsInRange(contacts.filter(c=>!c.stale), range);
    const contact = contacts.find(item => item.id === activeId);
    for(const {button,value} of rangeButtons)button.setAttribute('aria-pressed',String(value===range));
    count.textContent = `${visible.length} IN RANGE / ${contacts.length - visible.length} OUTSIDE`;
    for(const {picker} of displays){
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose a track to lock'; placeholder.disabled = true;
      picker.replaceChildren(placeholder, ...contacts.map(target => {
        const option = document.createElement('option'); option.value = target.id;
        option.textContent = `${priorities[target.id]?`${priorities[target.id]} · `:''}${target.trackLabel} · ${target.ship.label}${visible.includes(target) ? '' : ' · Outside range'}`;
        option.disabled = !visible.includes(target); return option;
      })); picker.value = activeId || '';
    }
    for(const mfd of displays)renderTarget(contact,visible,mfd);
    refreshManeuverPopup();
    refreshFriendlyPopup();
    for (const { view, chart, id:radarId } of charts) {
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
        vector.append(svg('path', { d: `M${ux * 8} ${uy * 8}L${ux * directionLineEnd} ${uy * directionLineEnd}`, stroke: contactTypes[target.type].color }));
        chart.append(vector);
      }
      for (const target of [...visible].sort((a,b)=>Number(!!priorities[a.id])-Number(!!priorities[b.id])||(priorities[b.id]||0)-(priorities[a.id]||0))) {
        const point = projectContact(target, view, range), isLocked = lockedIds.includes(target.id);
        const marker = svg('g', { transform: `translate(${point.x} ${point.y})`, class: `radar-track${isLocked ? ' selected' : ''}${target.id === activeId ? ' active-target' : ''}`, role: 'button', tabindex: 0, 'aria-pressed': String(isLocked), 'aria-label':radarLabel(target) });
        const scale=markerScale(chart),glyph=svg('g',{class:`radar-contact-glyph${isLocked?' numbered':''}`,transform:`scale(${scale})`});
        glyph.append(svg('circle', { r: 14, class: 'radar-track-hit' }), svg('path', { d: 'M-4.5-9H-9V-4.5M4.5-9H9V-4.5M-9 4.5V9H-4.5M9 4.5V9H4.5', class: 'radar-selection' }), symbol(target.type,4.5));
        if(target.jammerEmitting)glyph.append(svg('circle',{r:11,fill:'none',stroke:'#e7b85e','stroke-width':1,'stroke-dasharray':'2 2','aria-hidden':'true'}));
        if(isLocked){marker.dataset.priority=String(priorities[target.id]);glyph.append(svg('text',{x:0,y:target.type==='neutral'?1.5:0,class:'radar-priority-number','aria-hidden':'true'},String(priorities[target.id])));}marker.append(glyph);
        marker.dataset.track = target.id;
        marker.onclick = event => { if (event.button === 0) lock(target.id, radarId, event.ctrlKey); };
        marker.oncontextmenu=event=>openQuickFire(target.id,event,marker);
        marker.setAttribute('aria-haspopup','dialog');
        marker.onpointerenter = event => { if (event.pointerType !== 'touch') showTooltip(contacts.find(c=>c.id===target.id)||target, marker, event); };
        marker.onpointermove = event => { if (hoverMarker === marker) positionTooltip(event.clientX, event.clientY); };
        marker.onpointerleave = hideTooltip;
        marker.onfocus = () => showTooltip(contacts.find(c=>c.id===target.id)||target, marker); marker.onblur = hideTooltip;
        marker.onkeydown = event => { if (event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey)openQuickFire(target.id,event,marker);else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); lock(target.id, radarId, event.ctrlKey); } }; chart.append(marker);
      }
      const ship = svg('g', { class: 'radar-own-ship', role:'button', tabindex:0, 'aria-label': 'Our ship at origin · Combat maneuver', 'aria-haspopup':'dialog', 'aria-controls':maneuverPopup.id });
      ship.dataset.track='own';
      ship.onpointerenter=event=>{if(event.pointerType!=='touch')showOwnTooltip(ship,event);};
      ship.onpointermove=event=>{if(hoverMarker===ship)positionTooltip(event.clientX,event.clientY);};
      ship.onpointerleave=hideTooltip;ship.onfocus=()=>showOwnTooltip(ship);ship.onblur=hideTooltip;
      ship.oncontextmenu=event=>openManeuverPopup(event,ship);
      ship.onkeydown=event=>{if(['Enter',' ','ContextMenu'].includes(event.key)||event.key==='F10'&&event.shiftKey)openManeuverPopup(event,ship);};
      ship.append(svg('circle',{r:14,class:'radar-own-hit'}),svg('circle', { r: 9 }), svg('path', { d: view === 'top' ? 'M0-6 4 4 0 2-4 4Z' : 'M-6 2-3-3H3L6 2H-6M-9 0H9' })); chart.append(ship);
      renderProjectiles(chart,view);
    }
  }
  let signature='';
  function refresh(){
    maneuverTitle.textContent=`${playerShipName(flight?.combat).toUpperCase()} · COMBAT MANEUVER`;
    if(flight)contacts=flight.contacts();
    const emitting=contacts.filter(contact=>contact.jammerEmitting&&!contact.stale),lost=emitting.filter(contact=>contact.precisionTrack===false);
    ewReadout.textContent=emitting.length?`${emitting.length} JAMMER EMISSION${emitting.length===1?'':'S'} · ${lost.length} PRECISION TRACK${lost.length===1?'':'S'} LOST`:'NO JAMMER EMISSIONS';
    refreshEncounterReport();
    for(const mfd of displays)mfd.weaponControls?.refresh(contacts.find(c=>c.id===activeId)||null,lockedContacts());
    // Retain locked tracks as stale sensor records without exposing unseen motion.
    if(flight)for(const id of lockedIds)if(!contacts.some(c=>c.id===id)&&flight.sector.memory[id])contacts.push({...flight.sector.memory[id].observed,stale:true});
    refreshManeuverPopup();
    refreshFriendlyPopup();
    const visible=contactsInRange(contacts.filter(c=>!c.stale),range),currentSignature=contacts.map(c=>`${c.id}:${c.identified}:${c.stale||false}:${c.jammerEmitting}:${c.trackingStatus}:${c.behavior}`).join('|')+`/${visible.map(c=>c.id).join(',')}`;
    flightStatus.textContent=flight?`${flight.inTransit()?'EPD IN TRANSIT · LOCAL FLIGHT SUSPENDED':flightReadout(flight)}${flight.sector.running?'':' · PAUSED'}`:'TRAINING SNAPSHOT';
    if(currentSignature!==signature){
      signature=currentSignature;const scrolls=displays.map(mfd=>[mfd.targetPanel.scrollTop,mfd.combatPanel.scrollTop]);render();
      displays.forEach((mfd,i)=>{mfd.targetPanel.scrollTop=scrolls[i][0];mfd.combatPanel.scrollTop=scrolls[i][1];});return;
    }
    for(const {chart,view} of charts){
      renderProjectiles(chart,view);
      for(const marker of chart.querySelectorAll('.radar-track')){
        const target=contacts.find(c=>c.id===marker.dataset.track);if(!target)continue;
        const point=projectContact(target,view,range);marker.setAttribute('transform',`translate(${point.x} ${point.y})`);
        marker.setAttribute('aria-label',radarLabel(target));
        const direction=projectVelocity(target,view),vector=chart.querySelector(`.radar-direction[data-track="${target.id}"]`);
        if(vector&&direction){vector.setAttribute('transform',`translate(${point.x} ${point.y})`);const ux=direction.x/26,uy=direction.y/26;vector.firstElementChild.setAttribute('d',`M${ux*8} ${uy*8}L${ux*directionLineEnd} ${uy*directionLineEnd}`);vector.style.display='';}else if(vector)vector.style.display='none';
      }
    }
    const active=contacts.find(c=>c.id===activeId);
    if(active){
      const values=[`${contactDistance(active).toFixed(1)} KM`,speedText(active),zText(active),yText(active),closureReadout(active).text];
      for(const {targetPanel,combatPanel} of displays){
        targetPanel.querySelectorAll('.target-telemetry dd').forEach((dd,i)=>{dd.textContent=values[i];if(i===2)dd.className=signClass(active.z);if(i===3)dd.className=signClass(active.y);if(i===4)dd.className=closureReadout(active).className;});
        const execute=combatPanel.querySelector('button[type="submit"]');if(execute)execute.disabled=flight?.inTransit()||!isHardTurn(combatPanel.querySelector('.combat-maneuvers select')?.value)&&(!!active.stale||contactDistance(active)>range);
      }
    }
    if(hoverMarker&&!tooltip.hidden){
      if(hoverMarker.dataset.track==='own')showOwnTooltip(hoverMarker);
      else {const target=contacts.find(c=>c.id===hoverMarker.dataset.track);if(target)showTooltip(target,hoverMarker);}
    }
  }
  openDisplay(displays[0],'left','radar');openDisplay(displays[1],'left','targets');render();refresh();
  return {refresh,refreshProjectiles:()=>{for(const {chart,view} of charts)renderProjectiles(chart,view);},
    exportState:()=>({lockedIds:[...lockedIds],activeId,priorities:{...priorities}}),
    restoreState(saved,savedRange=range){closeQuickFireControls();closeFriendlyPopup();if(maneuverPopup.matches(':popover-open'))maneuverPopup.hidePopover();if(priorityDialog.open)priorityDialog.close();lockedIds=[...saved.lockedIds];priorities=restoreTargetPriorities(lockedIds,saved.priorities);activeId=saved.activeId;range=savedRange;signature='';hideTooltip();render();refresh();},
    reset(){closeQuickFireControls();closeFriendlyPopup();if(maneuverPopup.matches(':popover-open'))maneuverPopup.hidePopover();if(priorityDialog.open)priorityDialog.close();lockedIds=[];priorities={};activeId=null;signature='';refresh();}};
}
