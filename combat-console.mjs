import { armamentTypes,shipTypes,shuttleTypes } from './tactical-model.mjs';
import { boardingBalance,boardingLaunchError,shuttleStatus } from './boarding-model.mjs';
import {playerShipName} from './ship-names.mjs';
import {powerChannels,redistributePower} from './bridge-model.mjs';
import { diagramAimCategory,renderShipDiagram } from './ship-diagrams.mjs';
import { weapons,weaponAimOptions,aimPointState,nextAimPoint,canFire,condition,stationSupport,radarEmitting,jammerEmitting,supportStatus,salvoWeights,engagementDoctrines,weaponBattery,batteryMounts,batteryFireOrders,trackingSolution,burnThroughError,burnThroughDuration,radarBurnThrough,shipPerformance } from './combat-model.mjs';
const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const button=(text,fn)=>{const n=el('button','bridge-action',text);n.type='button';n.onclick=fn;return n;};
const fireIconPath='M9 18V8c0-3 3-6 3-6s3 3 3 6v10M8 18h8v4H8zM9 8h6M9 15h6';
const repeatIconPath='m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3';
function actionIcon(label,fn,pathData,accessibleLabel=label){
  const action=button('',fn);action.classList.add('weapon-action-icon');action.title=label;
  action.setAttribute('aria-label',accessibleLabel);
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':1.7,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))icon.setAttribute(key,value);
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',pathData);
  icon.append(path);action.append(icon);return action;
}
function weaponActionIcon(repeat,name,fn){
  const label=repeat?'Start Firing':'Fire';
  return actionIcon(label,fn,repeat?repeatIconPath:fireIconPath,`${label} · ${name}`);
}
function select(label,choices,fn){const wrap=el('label','bridge-setting');wrap.append(el('span','',label));const input=el('select','');input.setAttribute('aria-label',label);for(const [value,name] of choices)input.append(Object.assign(el('option','',name),{value}));input.onchange=()=>fn(input.value);wrap.append(input);return {wrap,input};}
const hp=s=>`${Math.ceil(s.hp)} / ${s.max}`;
const state=s=>s.hp===0?'OFFLINE':condition(s)===1?'Operational':condition(s)===.7?'Degraded':'Critical';
const integrityPercent=s=>Math.round(Math.max(0,Math.min(1,s.hp/s.max))*100);
const integrityStatus=s=>condition(s)===1?'healthy':condition(s)===.7?'damaged':'critical';
const batteryNames={'main-guns':'Main Guns','vls-missiles':'VLS Missiles','point-defense':'Point Defense'};
const batteryAmmoNames={'mp-missiles':'MP','as-missiles':'AS','gp-missiles':'GP','ciws-30':'30 mm CIWS'};
const mountGeometry={
  fore:{label:'Fore',guidance:'Fore turret covers up to 135° to either side of the bow.'},
  aft:{label:'Aft',guidance:'Aft turret covers targets at least 45° off the bow.'},
  dorsal:{label:'Dorsal',guidance:'Targets more than 1 km below the launcher require 6 km of range and add 2 s to the firing cycle.'},
  ventral:{label:'Ventral',guidance:'Targets more than 1 km above the launcher require 6 km of range and add 2 s to the firing cycle.'},
  port:{label:'Port'},
  starboard:{label:'Starboard'}
};
const salvoSummary=({cannonBurstSize,missileVolleySize})=>`${cannonBurstSize} cannon rounds per mount · ${missileVolleySize} missile${missileVolleySize===1?'':'s'} per launcher`;
const batteryCommands=[
  {id:'main-guns',label:'Fire Main Guns',shortLabel:'Gun Burst',aim:'Hull'},
  {id:'mp-missiles',label:'Fire MP Salvo',shortLabel:'MP Salvo',aim:'Emitting jammer, then weapons or engines'},
  {id:'as-missiles',label:'Fire AS Strike',shortLabel:'AS Strike',aim:'Hull'}
];

export function mountWeaponsConsole({flight,idPrefix='tactical',onSelectionChange=()=>{}}){
  const root=el('section','weapons-control');root.setAttribute('aria-label','Weapon fire control');
  root.append(el('h4','','FIRE CONTROL'));
  let target=null,lockedTargets=[],combatState=null,targetDiagram=null,diagramTargetId=null,selectedTargetSystem=null;
  const own=()=>flight.combat.own;
  const rows=new Map(),list=el('fieldset','weapon-mount-list');list.append(el('legend','','Select one or more mounts'));
  const mountColumns=el('div','weapon-mount-columns'),leftMounts=el('section','weapon-mount-column'),rightMounts=el('section','weapon-mount-column');
  leftMounts.setAttribute('aria-label','Main gun mounts');rightMounts.setAttribute('aria-label','Missile and point defense mounts');
  mountColumns.append(leftMounts,rightMounts);list.append(mountColumns);
  function syncOptions(input,choices){
    if(input.options.length===choices.length&&choices.every(([value,name],i)=>input.options[i].value===value&&input.options[i].textContent===name))return;
    const previous=input.value;input.replaceChildren(...choices.map(([value,name])=>Object.assign(el('option','',name),{value})));
    if(choices.some(([value])=>value===previous))input.value=previous;
  }
  for(const [i,m] of own().mounts.entries()){
    const geometry=mountGeometry[m.arc??m.vertical??m.side];
    const name=`${armamentTypes[m.weapon].name} · ${m.id.split('-').at(-1)}${geometry?` (${geometry.label})`:''}`;
    const row=el('div','weapon-mount-row'),label=el('label','weapon-mount-choice'),check=el('input','');check.type='checkbox';check.checked=i===0;check.setAttribute('aria-label',`Select ${name}`);
    label.append(check,el('span','',name));
    const status=el('p','weapon-mount-status'),details=el('details','weapon-targeting');details.name=`${idPrefix}-weapon-targeting`;details.open=i===0;
    const summary=el('summary','','Targeting');details.append(summary);
    const assigned=select(`Target · ${name}`,[],()=>refresh()),component=select(`Aim at system · ${name}`,weaponAimOptions(m.weapon),()=>refresh()),threat=select(`AA missile target · ${name}`,[],()=>refresh());
    assigned.wrap.firstElementChild.textContent='Target';component.wrap.firstElementChild.textContent='Aim at system';threat.wrap.firstElementChild.textContent='AA missile target';
    const protection=el('p','combat-note aim-protection-note'),info=el('p','combat-note');details.append(assigned.wrap,component.wrap,protection,threat.wrap,info);row.append(status,details);(weaponBattery(m.weapon)==='main-guns'?leftMounts:rightMounts).append(row);
    const singleActions=el('div','combat-actions combat-fire-actions weapon-single-actions');
    const singleFire=weaponActionIcon(false,name,()=>fireMount(rows.get(m.id))),singleContinuous=weaponActionIcon(true,name,()=>fireMount(rows.get(m.id),true));
    singleActions.append(singleFire,singleContinuous);const mountHeading=el('div','weapon-mount-heading');mountHeading.append(label,singleActions);row.prepend(mountHeading);
    rows.set(m.id,{m,geometry,check,status,details,summary,assigned,component,threat,protection,info,singleFire,singleContinuous});
    for(const control of [assigned,component,threat])control.input.onchange=()=>{if(flight.combat.engagement)flight.ceaseFire([m.id]);refresh();};
    check.onchange=()=>setMountSelected(rows.get(m.id),check.checked);
  }
  const selectedRows=()=>[...rows.values()].filter(row=>row.check.checked);
  const shipTarget=row=>row.assigned.input.value?lockedTargets.find(contact=>contact.id===row.assigned.input.value):target;
  const order=row=>({mountId:row.m.id,targetId:row.component.input.value==='incoming'?row.threat.input.value:shipTarget(row)?.stale?undefined:shipTarget(row)?.id,component:row.component.input.value==='incoming'?'hull':row.component.input.value});
  const orders=()=>selectedRows().map(order);
  function setMountSelected(row,checked){
    row.check.checked=checked;
    if(checked){for(const other of rows.values())other.details.open=other===row;}
    if(!checked||flight.combat.engagement)flight.ceaseFire([row.m.id]);
    refresh();
  }
  function ceaseAllWeapons(){for(const row of rows.values())row.check.checked=false;flight.ceaseFire();refresh();publishSelection();}
  function fireMount(row,continuous=false){row.check.checked=true;refresh();(continuous?flight.startFire:flight.fire)([order(row)]);}
  const readiness=el('p','combat-note weapon-readiness'),ownStatus=el('p','combat-readout'),targetStatus=el('p','combat-readout');
  readiness.setAttribute('role','status');
  const targetSystems=el('details','target-damage');targetSystems.append(el('summary','','Target system integrity'));const targetSystemList=el('ul','target-integrity-list');targetSystems.append(targetSystemList);
  const targetDiagramPanel=el('section','target-ship-diagram');
  targetDiagramPanel.setAttribute('aria-label','Target damage diagram');
  const diagramAimStatus=el('p','combat-note');
  diagramAimStatus.setAttribute('role','status');
  function assignDiagramAim(systemId){
    const contact=lockedTargets.find(contact=>contact.id===diagramTargetId&&!contact.stale&&contact.identified);
    const enemy=contact&&flight.combat.contacts[contact.id];
    if(!enemy)return;
    const component=diagramAimCategory(enemy,systemId);
    selectedTargetSystem=systemId;
    const selected=selectedRows();
    const available=aimPointState(enemy,component).available;
    const compatible=available?selected.filter(row=>weaponAimOptions(row.m.weapon).some(([id])=>id===component)):[];
    if(compatible.length){
      if(flight.combat.engagement)flight.ceaseFire(compatible.map(row=>row.m.id));
      for(const row of compatible){
        row.check.checked=true;
        row.assigned.input.value=contact.id;
        row.component.input.value=component;
      }
      publishSelection();
    }
    const aimName=compatible.length?weaponAimOptions(compatible[0].m.weapon).find(([id])=>id===component)[1]:'';
    diagramAimStatus.textContent=!selected.length?'Select mounts in Weapons → Individual Mounts (Manual).'
      :!available?'This aim point is unavailable.'
      :!compatible.length?'Select a mount that can target this system.'
      :`${aimName} assigned to ${compatible.length} of ${selected.length} selected mounts.`;
    refresh();
  }
  function refreshTargetDiagram(enemy,contact){
    const id=enemy&&contact?.identified&&lockedTargets.some(lock=>lock.id===contact.id)?contact.id:null;
    if(id!==diagramTargetId||targetDiagram&&enemy.classId!==targetDiagram.root.dataset.classId){
      diagramTargetId=id;
      selectedTargetSystem=null;
      diagramAimStatus.textContent='Select a marker to aim the selected mounts.';
      targetDiagram=id?renderShipDiagram({ship:enemy,interactive:true,onSelectSystem:assignDiagramAim}):null;
      targetDiagramPanel.replaceChildren(...(targetDiagram?[targetDiagram.root,diagramAimStatus]:[]));
    }
    targetDiagramPanel.hidden=!targetDiagram;
    targetDiagram?.update(enemy,selectedTargetSystem);
  }
  function defenseAction(label,callback,path){
    const button=actionIcon(label,callback,path);button.classList.add('defense-action-icon');const hint=el('span','defense-action-tooltip',label);hint.setAttribute('role','tooltip');button.append(hint);return button;
  }
  function labelDefenseAction(button,label){button.setAttribute('aria-label',label);button.title=label;button.lastElementChild.textContent=label;}
  const radar=defenseAction('Ship radar',()=>flight.toggleEmitter('radar'),'M12 12 20 4M21 12a9 9 0 1 1-9-9M17 12a5 5 0 1 1-5-5'),jammer=defenseAction('Jammer',()=>flight.cycleJammer(),'M12 10v11M8 21h8M8 6a6 6 0 0 0 0 8m8-8a6 6 0 0 1 0 8M5 3a10 10 0 0 0 0 14M19 3a10 10 0 0 1 0 14'),ciws=defenseAction('Independent CIWS',()=>flight.toggleEmitter('ciwsAuto'),'M12 2v5m0 10v5M2 12h5m10 0h5M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z');
  jammer.title='Cycle jammer use: automatic in combat → always on → silent. Emitting reveals your presence.';
  const burn=defenseAction('Radar burn-through',()=>flight.burnThrough(),'m14 2-9 12h6l-1 8 9-12h-6l1-8Z'),ewStatus=el('p','combat-note');ewStatus.setAttribute('role','status');
  const ewControls=el('div','combat-actions');ewControls.append(jammer,burn);
  const decoys=el('div','combat-actions');
  const decoyButtons=[['chaff','Chaff','chaffUntil'],['flares','Flares','flaresUntil']].map(([type,label,timer])=>{
    const control=button(label,()=>flight.deployCountermeasures(type));
    decoys.append(control);
    return {type,label,timer,control};
  });
  const fire=actionIcon('Fire',()=>flight.fire(orders()),fireIconPath);
  const continuous=actionIcon('Start Firing',()=>flight.startFire(orders()),repeatIconPath);
  const ceaseAll=button('Cease All Fire',ceaseAllWeapons);
  ceaseAll.classList.add('weapon-cease-fire');
  const selectAll=actionIcon('Select all',()=>{for(const row of rows.values())row.check.checked=true;refresh();},'M8 3h13v13M3 8h13v13H3zM6 14l3 3 4-5');
  const actions=el('div','combat-actions combat-fire-actions weapon-command-actions');actions.append(fire,continuous,selectAll);
  const commandBar=el('div','weapon-command-bar');commandBar.append(readiness,actions);
  const emitters=el('div','combat-actions');emitters.append(radar,ciws);
  const events=el('ol','combat-events');events.setAttribute('aria-label','Combat events');
  const targetDetails=el('section','target-combat-details');targetDetails.setAttribute('aria-label','Target combat status');targetDetails.append(targetStatus,targetDiagramPanel,targetSystems);
  const defense=el('section','weapons-control');defense.setAttribute('aria-label','Electronic warfare and defenses');
  defense.append(el('h4','','ELECTRONIC WARFARE / DEFENSE'),emitters,ewControls,decoys,ewStatus);
  const settings=el('details','combat-settings');settings.open=true;settings.append(el('summary','','Combat events'),events);
  function buttonGroup(label){
    const group=el('fieldset','weapon-option-group'),actions=el('div','combat-actions weapon-option-buttons'),status=el('p','combat-note');
    group.append(el('legend','',label),actions,status);
    return {group,actions,status};
  }
  function engage(objective,ids){
    if(ids.length&&ids.every(Boolean)&&!flight.inTransit())flight.engageTargets(objective,ids);
    refresh();
  }
  const doctrine=buttonGroup('Engagement Doctrine'),salvo=buttonGroup('Salvo Weight');
  const liveLockedIds=()=>lockedTargets.filter(contact=>!contact.stale).map(contact=>contact.id);
  const doctrineButtons=engagementDoctrines.map(({objective,label,aim})=>{
    const control=button(label,()=>engage(objective,liveLockedIds()));
    control.title=aim;doctrine.actions.append(control);
    return {control,objective};
  });
  const salvoButtons=salvoWeights.map(weight=>{
    const control=button(weight.label,()=>{
      flight.setMissileVolley(weight.missileVolleySize);
      flight.setCannonBurst(weight.cannonBurstSize);
      refresh();
    });
    control.title=salvoSummary(weight);salvo.actions.append(control);
    return {control,weight};
  });
  const activeTargetId=()=>target&&!target.stale?target.id:undefined;
  const currentBatteryOrders=(id,targetId,repeat)=>batteryFireOrders(flight.combat,flight.sector,id,targetId,repeat);
  function fireBattery(id,targetId){
    const orders=currentBatteryOrders(id,targetId,false);
    if(orders.length&&!flight.inTransit())flight.fire(orders);
    refresh();
  }
  function repeatingMounts(id){
    return batteryMounts(own(),id).filter(mount=>flight.combat.firing?.some(order=>order.mountId===mount.id));
  }
  function toggleBattery(id){
    const active=repeatingMounts(id);
    if(active.length)flight.ceaseFire(active.map(mount=>mount.id));
    else{
      const orders=currentBatteryOrders(id,activeTargetId(),true);
      if(orders.length&&!flight.inTransit())flight.startFire(orders);
    }
    refresh();
  }
  const batteryQuickFire=el('fieldset','weapon-option-group');
  batteryQuickFire.append(el('legend','','Battery Quick-Fire'));
  const batteryTarget=el('p','combat-note');
  const batteryButtons=batteryCommands.map(({id,label,aim})=>{
    const row=el('div','weapon-battery-actions'),fire=button(label,()=>fireBattery(id,activeTargetId()));
    const continuous=button('Continuous',()=>toggleBattery(id));
    continuous.setAttribute('aria-label',`Continuous · ${label.slice(5)}`);
    fire.title=aim;
    row.append(fire,continuous);batteryQuickFire.append(row);
    return {id,fire,continuous};
  });
  batteryQuickFire.append(batteryTarget);
  const batteries=Object.entries(batteryNames).map(([id,label])=>{
    const section=el('section','weapon-battery'),heading=el('h5','',label),status=el('p','weapon-mount-status'),ammo=el('p','combat-note');
    section.setAttribute('aria-label',label);
    const header=el('div','weapon-battery-heading');header.append(heading);
    const defense=id==='point-defense'?button('Auto CIWS',()=>flight.toggleEmitter('ciwsAuto')):null;
    if(defense)header.append(defense);
    section.append(header,ammo,status);
    return {id,section,ammo,status,defense};
  });
  const batteryList=el('div','weapon-batteries');batteryList.append(...batteries.map(battery=>battery.section));
  const manual=el('details','manual-mount-override');
  manual.open=false;
  manual.append(el('summary','','Individual Mounts (Manual)'),commandBar,list);
  const deployment=el('div','weapon-deployment');
  deployment.append(doctrine.group,ceaseAll,salvo.group,batteryQuickFire,manual,batteryList);
  root.append(ownStatus,deployment);
  const quick=el('section','radar-fire-popup');quick.popover='auto';quick.setAttribute('role','dialog');quick.setAttribute('aria-labelledby',`${idPrefix}-quick-fire-title`);
  const quickHeader=el('header','quick-fire-heading'),quickTitle=el('h3','');quickTitle.id=`${idPrefix}-quick-fire-title`;
  const closeQuick=button('×',()=>closeQuickFire());closeQuick.setAttribute('aria-label','Close quick fire control');quickHeader.append(quickTitle,closeQuick);
  let quickTargetId=null,quickAnchor=null;
  const quickEngage=button('Engage',()=>engage('engage',[quickTargetId]));
  const quickDisable=button('Disable',()=>engage('boarding',[quickTargetId]));
  const quickCeaseAll=button('Cease All Fire',ceaseAllWeapons);
  quickCeaseAll.classList.add('weapon-cease-fire');
  const quickBatteryButtons=batteryCommands.map(({id,shortLabel,aim})=>{
    const control=button(shortLabel,()=>fireBattery(id,quickTargetId));
    control.title=aim;
    return {id,control};
  });
  const quickDoctrines=el('div','combat-actions weapon-option-buttons');
  quickDoctrines.append(quickEngage,quickDisable);
  const quickActions=el('div','combat-actions weapon-option-buttons');
  quickActions.append(...quickBatteryButtons.map(({control})=>control));
  quick.append(quickHeader,quickDoctrines,quickActions,quickCeaseAll);document.body.append(quick);
  quick.oncontextmenu=event=>event.preventDefault();
  function closeQuickFire(){if(quick.matches(':popover-open'))quick.hidePopover();quickTargetId=null;quickAnchor=null;}
  function positionQuickFire(){
    if(!quickAnchor||!quick.matches(':popover-open'))return;
    const box=quick.getBoundingClientRect();quick.style.left=`${Math.max(10,Math.min(quickAnchor.x+10,innerWidth-box.width-10))}px`;quick.style.top=`${Math.max(10,Math.min(quickAnchor.y+10,innerHeight-box.height-10))}px`;
  }
  function openQuickFire(id,x,y){
    closeQuickFire();const contact=lockedTargets.find(contact=>contact.id===id);if(!contact||contact.stale)return;
    quickTargetId=id;quickAnchor={x,y};
    refresh();quick.showPopover();positionQuickFire();
    (quickEngage.disabled?closeQuick:quickEngage).focus({preventScroll:true});
  }
  quick.addEventListener('toggle',event=>{if(event.newState==='closed')quickTargetId=null;});
  window.addEventListener('resize',closeQuickFire);
  function refreshDeployment(c,firing,transit){
    const canEngage=!transit&&lockedTargets.some(contact=>!contact.stale);
    for(const {control,objective} of doctrineButtons){
      control.disabled=!canEngage;
      control.setAttribute('aria-pressed',String(c.engagement?.objective===objective));
    }
    const overrideCount=c.engagement?.overrides.length??0;
    const activeDoctrine=engagementDoctrines.find(doctrine=>doctrine.objective===c.engagement?.objective);
    doctrine.status.textContent=c.engagement
      ?`${activeDoctrine?.aim??'Automatic engagement in progress'}${overrideCount?` · ${overrideCount} manual override${overrideCount===1?'':'s'}`:''}`
      :canEngage?'Choose a doctrine to engage locked ships in priority order.':transit?'Weapons unavailable during EPD transit.':'Lock a live radar track to engage.';
    for(const {control,weight} of salvoButtons){
      const selected=c.cannonBurstSize===weight.cannonBurstSize&&c.missileVolleySize===weight.missileVolleySize;
      control.setAttribute('aria-pressed',String(selected));
    }
    salvo.status.textContent=salvoSummary(c);
    const targetId=activeTargetId();
    batteryTarget.textContent=targetId?`Target · ${target.trackLabel} · ${target.name}`:'Select a live radar track for quick-fire.';
    for(const {id,fire,continuous} of batteryButtons){
      const repeating=repeatingMounts(id).length>0;
      fire.disabled=transit||!currentBatteryOrders(id,targetId,false).length;
      continuous.disabled=!repeating&&(transit||!currentBatteryOrders(id,targetId,true).length);
      continuous.setAttribute('aria-pressed',String(repeating));
      continuous.title=repeating?'Stop continuous fire for this battery':'Start continuous fire at the active radar target';
    }
    const s=c.own;
    for(const {id,ammo,status,defense} of batteries){
      const mounts=s.mounts.filter(mount=>weaponBattery(mount.weapon)===id);
      const weaponTypes=[...new Set(mounts.map(mount=>mount.weapon))];
      ammo.textContent=weaponTypes.map(weapon=>`${batteryAmmoNames[weapon]??armamentTypes[weapon].name} · ${s.ammo[weapon]}`).join(' / ');
      const operational=mounts.filter(mount=>s.systems[mount.id].hp>0).length;
      const active=mounts.filter(mount=>firing.has(mount.id)||mount.ciwsTarget).length;
      const assignment=active?`${active} assigned or firing`:c.engagement&&id==='vls-missiles'?'On hold':'Idle';
      status.textContent=mounts.length?`${operational}/${mounts.length} mounts operational · ${assignment}`:'No mounts fitted';
      if(defense){
        defense.disabled=!mounts.length;
        defense.setAttribute('aria-pressed',String(s.ciwsAuto));
      }
    }
  }
  function refresh(nextTarget=target,nextLocks=lockedTargets){
    target=nextTarget;lockedTargets=nextLocks;const c=flight.combat,s=own(),incoming=c.shots.filter(p=>p.targetId==='own'&&weapons[p.weapon].missile);
    const transit=flight.inTransit();
    const firing=new Set([...(c.firing??[]).map(f=>f.mountId),...s.mounts.filter(m=>m.burst).map(m=>m.id)]);
    if(combatState!==c){
      selectedTargetSystem=null;
      combatState=c;const active=[...(c.firing??[]),...c.own.mounts.filter(m=>m.burst).map(m=>({mountId:m.id,...m.burst}))];let expanded=false;
      for(const [i,row] of [...rows.values()].entries()){
        const assignment=active.find(f=>f.mountId===row.m.id);row.check.checked=active.length?!!assignment:i===0;
        syncOptions(row.assigned.input,assignment?[[assignment.targetId,'Assigned target']]:[['','Active radar target']]);
        row.component.input.value=assignment?.targetId.startsWith('shot:')&&row.m.weapon==='gp-missiles'?'incoming':assignment?.component||weaponAimOptions(row.m.weapon)[0][0];
        if(!row.component.input.value)row.component.input.value=weaponAimOptions(row.m.weapon)[0][0];
        if(assignment?.targetId.startsWith('shot:'))syncOptions(row.threat.input,[[assignment.targetId,assignment.targetId]]);
        row.details.open=row.check.checked&&!expanded;if(row.details.open)expanded=true;
      }
    }
    refreshDeployment(c,firing,transit);
    let ready=0,queueable=0;
    for(const row of rows.values()){
      const {m,assigned,component,threat}=row,spec=weapons[m.weapon],choices=[['',`Active radar target · ${target?.trackLabel||'none'}`],...lockedTargets.map(contact=>[contact.id,`${contact.trackLabel} · ${contact.name}`])];
      if(assigned.input.value&&!lockedTargets.some(contact=>contact.id===assigned.input.value))choices.push([assigned.input.value,'Target no longer locked']);
      syncOptions(assigned.input,choices);syncOptions(threat.input,incoming.map(shot=>[shot.id,`${shot.id} · ${armamentTypes[shot.weapon].name}`]));
      if(c.engagement&&!c.engagement.overrides.includes(m.id)){
        const automatic=c.firing?.find(f=>f.mountId===m.id);
        row.check.checked=!!automatic;
        if(automatic){assigned.input.value=automatic.targetId;component.input.value=automatic.component;}
      }
      const contact=shipTarget(row),aimShip=contact&&!contact.stale?c.contacts[contact.id]:null,previous=component.input.value;
      const aimOptions=weaponAimOptions(m.weapon).map(([id,label])=>({id,label,...aimPointState(aimShip,id)}));
      const next=aimOptions.find(option=>option.id===previous)?.available?previous:nextAimPoint(aimShip,m.weapon,previous);
      const aimChoices=aimOptions.map(option=>[option.id,`${option.label}${option.destroyed?' · 0 · DESTROYED':option.protected?' · HULL PROTECTED':''}`]);
      if(!next)aimChoices.unshift(['','No available aim point']);
      syncOptions(component.input,aimChoices);
      for(const option of component.input.options){const aim=aimOptions.find(aim=>aim.id===option.value);option.disabled=!aim?.available;option.classList.toggle('aim-point-destroyed',!!aim?.destroyed);option.classList.toggle('aim-point-protected',!!aim?.protected&&!aim.destroyed);}
      component.input.value=next||'';
      row.protection.textContent=aimShip?.systems.hull.hp===0?'Hull at 0 · surviving internal systems exposed.':'Internal systems remain protected until hull reaches 0.';
      threat.wrap.hidden=component.input.value!=='incoming';assigned.wrap.hidden=component.input.value==='incoming';row.details.hidden=!row.check.checked;
      const configured=order(row),error=canFire(c,flight.sector,'own',m.id,configured.targetId,configured.component),startError=canFire(c,flight.sector,'own',m.id,configured.targetId,configured.component,{ignoreCooldown:true});
      row.singleFire.disabled=transit||!!error;row.singleContinuous.disabled=transit||!!startError;
      if(row.check.checked&&!transit){if(!error)ready++;if(!startError)queueable++;}
      const pending=s.mounts.find(mount=>mount.id===m.id)?.burst;
      const active=(c.firing||[]).find(f=>f.mountId===m.id)||pending,activeTarget=active&&(lockedTargets.find(contact=>contact.id===active.targetId)?.trackLabel||active.targetId);
      const integrity=m.weapon==='ciws-30'?`${state(s.systems[m.id])} · `:'';
      const bearingBlocked=startError?.includes('turret firing arc')||startError?.includes('VLS vertical blind zone');
      const fireStatus=transit?'EPD transit':bearingBlocked?`${startError} ${row.geometry.guidance}`:error||'Ready';
      row.status.textContent=`${integrity}${spec.range} km · ${s.ammo[m.weapon]} remaining · ${fireStatus}${pending?` · BURST ${pending.total-pending.remaining}/${pending.total}`:''}${active?` · FIRING ${activeTarget} / ${active.component}`:''}`;
      const aimName=component.input.selectedOptions[0]?.textContent;
      row.summary.textContent=`Targeting · ${component.input.value==='incoming'?threat.input.value||'no incoming missile':shipTarget(row)?.trackLabel||'no target'} · ${aimName}`;
      row.info.textContent=`${spec.rpm} rounds/min per barrel · ${spec.damage} damage/round · ${spec.missile?`${c.missileVolleySize}-missile volleys (or remaining stock) · `:m.weapon.startsWith('autocannon-')?`${c.cannonBurstSize} shells per mount · individual shots · Tactical adds a 2 s pause between bursts · `:''}${spec.feed?spec.feed+' · ':''}${spec.guidance}`;
    }
    ownStatus.textContent=`${playerShipName(c).toUpperCase()} · Hull ${hp(s.systems.hull)} · ${incoming.length} incoming missiles`;
    const enemy=target&&!target.stale?c.contacts[target.id]:null;
    refreshTargetDiagram(enemy,target);
    const track=enemy?trackingSolution(c,flight.sector,'own',target.id):null;
    targetStatus.textContent=enemy?`${c.boarding?.captured.includes(target.id)?'CAPTURED · ':enemy.surrendered?'SURRENDERED · ':enemy.combatResponse?.mode==='retreating'?'DISENGAGING · ':''}${target.identified?`Target hull ${hp(enemy.systems.hull)} · `:''}Radar ${radarEmitting(enemy)?'emitting':'silent'} · Jammer ${jammerEmitting(enemy)?'emitting':'silent'} · ${track.status} · ${Math.round(track.quality*100)}% track quality${enemy.combatResponse&&target.identified?` · ${enemy.combatResponse.reason}`:''}`:'Select a live radar track to engage a ship.';
    targetSystems.hidden=!enemy||!target.identified;
    targetSystemList.replaceChildren(...(enemy&&target.identified?Object.values(enemy.systems).map(system=>{
      const status=integrityStatus(system),percent=integrityPercent(system);
      const row=el('li','target-integrity-row'),value=el('span',`target-integrity-value is-${status}`,`${percent}%`);
      row.title=`${system.name} · ${hp(system)} · ${state(system)}`;
      value.setAttribute('aria-label',`${percent}% integrity remaining · ${state(system)}`);
      const label=system.name.replace(/ · autocannon-(\d+)/,' · $1 mm').replace(/ · (mp|as|gp)-missiles/i,' · $1').replace(/ · ciws-(\d+)/,' · $1 mm');
      row.append(el('span','target-integrity-name',label),value);return row;
    }):[]));
    readiness.textContent=`${selectedRows().length} selected · ${ready} ready · ${firing.size} firing`;
    fire.disabled=ready===0;continuous.disabled=queueable===0;
    ceaseAll.disabled=!c.engagement&&!firing.size&&!selectedRows().length;
    labelDefenseAction(radar,`Ship radar: ${s.radar?'ON':'SILENT'}`);labelDefenseAction(jammer,`Jammer: ${s.jammerMode==='auto'?'AUTO · ':''}${jammerEmitting(s)?'EMITTING':'SILENT'} · cycle Auto / On / Off`);labelDefenseAction(ciws,`Independent CIWS: ${s.ciwsAuto?'AUTO':'OFF'}`);
    radar.setAttribute('aria-pressed',String(s.radar));ciws.setAttribute('aria-pressed',String(s.ciwsAuto));jammer.setAttribute('aria-pressed',String(jammerEmitting(s)));
    radar.disabled=s.systems.sensors.hp<=0;jammer.disabled=s.systems.jammer.hp<=0;
    const burnError=burnThroughError(c),burnLeft=Math.ceil((s.burnThroughUntil??0)-c.time),cooling=Math.ceil((s.burnThroughReadyAt??0)-c.time);
    burn.disabled=transit||!!burnError;
    const pulse=Number(burnThroughDuration(s).toFixed(1));
    const burnHint=`${pulse} s tracking pulse · ${radarBurnThrough.cooldown} s between uses · requires active radar`;
    burn.title=burnError||burnHint;
    burn.lastElementChild.textContent=burn.title;
    for(const {type,label,timer,control} of decoyButtons){
      const remaining=Math.ceil(s[timer]-c.time);
      control.hidden=!Object.hasOwn(s.ammo,type);
      control.disabled=transit||!s.ammo[type]||!shipPerformance(s).power||s.surrendered;
      control.textContent=`Deploy ${label.toLowerCase()} · ${s.ammo[type]??0}${remaining>0?` · ${remaining} s active`:''}`;
    }
    ewStatus.textContent=`${burnLeft>0&&radarEmitting(s)?`BURN-THROUGH · ${burnLeft} s tracking pulse`:cooling>0?`Burn-through cooling · ${cooling} s`:burnError||`Burn-through ready · ${pulse} s pulse / ${radarBurnThrough.cooldown} s cooldown`}${jammerEmitting(s)?' · Jammer emission reveals your presence.':''}`;
    events.replaceChildren(...c.log.slice(0,5).map(message=>el('li','',message)));
    if(quickTargetId){
      const contact=lockedTargets.find(contact=>contact.id===quickTargetId);
      if(!contact||contact.stale){closeQuickFire();return;}
      quickTitle.textContent=`${contact.trackLabel} · ${contact.name} · FIRE CONTROL`;
      quickEngage.disabled=quickDisable.disabled=transit;
      for(const {id,control} of quickBatteryButtons)control.disabled=transit||!currentBatteryOrders(id,quickTargetId,false).length;
      quickCeaseAll.disabled=ceaseAll.disabled;
      positionQuickFire();
    }
  }
  const publishSelection=()=>onSelectionChange([...rows].map(([id,row])=>({id,selected:row.check.checked,target:row.assigned.input.value,component:row.component.input.value,threat:row.threat.input.value})));
  manual.addEventListener('change',publishSelection);
  manual.addEventListener('click',event=>{if(event.target.closest('button'))publishSelection();});
  function restoreSelection(selection){
    for(const item of selection){
      const row=rows.get(item.id);if(!row)continue;
      row.check.checked=item.selected;row.assigned.input.value=item.target;row.component.input.value=item.component;row.threat.input.value=item.threat;
    }
    refresh();
  }
  return {root,defense,settings,targetDetails,refresh,restoreSelection,openQuickFire,closeQuickFire,isQuickFireOpen:()=>quick.matches(':popover-open')};
}

const missionButtons=[['capture','Capture Ship'],['assist','Assist Crew'],['explore','Explore / Search']];
export function mountShuttleOps({flight,getTargeting,onSelectTarget}){
  const root=el('section','tactical-shuttle-ops');root.setAttribute('aria-label','Shuttle Ops');
  const control=el('section','shuttle-ops-control');control.setAttribute('aria-label','Shuttle Control');
  const complement=el('p','shuttle-ops-complement'),targetSelect=el('select','');
  const launchRange=el('p','shuttle-ops-range'),feedback=el('p','shuttle-ops-feedback');
  feedback.setAttribute('role','status');
  const targetField=el('label','bridge-setting');
  targetField.append(el('span','','Shuttle target'),targetSelect);
  control.append(el('h4','','Shuttle Control'),complement,targetField,launchRange,feedback);
  const list=el('div','shuttle-ops-list');
  const heading=el('h3','','Shuttle Ops');heading.tabIndex=-1;
  root.append(heading,control,list);
  const cards=new Map();
  let targetKey='',lastCombat=null;
  const getContext=()=>({combat:flight.combat,sector:flight.sector,inTransit:flight.inTransit(),...getTargeting()});
  targetSelect.onchange=()=>{
    if(targetSelect.value&&!onSelectTarget(targetSelect.value)){
      feedback.textContent='Cannot lock this ship. Release a target lock in Tactical and try again.';
    }else feedback.textContent='';
    refresh(getContext());
  };
  function act(callback){
    const result=callback();
    feedback.textContent=result.message;
    refresh(getContext());
  }
  function createCard(number){
    const card=el('section','shuttle-ops-card'),name=`Shuttle ${number}`;
    card.setAttribute('aria-label',name);
    const phase=el('p','shuttle-ops-phase'),range=el('p','shuttle-ops-range');
    const launches=el('div','shuttle-ops-launches'),reason=el('p','shuttle-ops-range');
    const buttons=missionButtons.map(([order,label])=>{
      const launch=button(label,()=>act(()=>{
        const context=getContext();
        const target=context.contacts.find(contact=>contact.id===context.activeTargetId&&!contact.stale);
        return flight.launchShuttle(number,order,target);
      }));
      launches.append(launch);
      return {order,launch};
    });
    const recall=button('Recall',()=>act(()=>flight.recallShuttle(number)));
    recall.classList.add('shuttle-ops-recall');
    recall.setAttribute('aria-label',`Recall shuttle ${number}`);
    card.append(el('h4','',name),phase,range,launches,reason,recall);
    list.append(card);
    return {card,phase,range,launches,buttons,reason,recall};
  }
  function refresh(context=getContext()){
    const {combat,sector,inTransit}=context;
    if(lastCombat!==combat){lastCombat=combat;feedback.textContent='';}
    const shuttles=combat.boarding?.shuttles??[];
    const live=context.contacts.filter(contact=>!contact.stale);
    const target=live.find(contact=>contact.id===context.activeTargetId);
    const deployed=shuttles.filter(shuttle=>shuttle.status!=='ready').length;
    const marines=shipTypes[combat.own.classId].boarding;
    const aboard=(marines?.personnel??0)-deployed*shuttleTypes.shuttle.troopCapacity;
    complement.textContent=marines?`${aboard} of ${marines.personnel} marines aboard${marines.platoons?` · ${marines.platoons} ${marines.platoons===1?'platoon':'platoons'}`:''}`:'No marine complement assigned.';
    const options=live.map(contact=>[contact.id,`${contact.trackLabel} · ${contact.name}`]);
    const nextTargetKey=JSON.stringify(options);
    if(nextTargetKey!==targetKey||!targetSelect.options.length){
      targetKey=nextTargetKey;
      const prompt=Object.assign(el('option','','Select a live track'),{value:'',disabled:true});
      targetSelect.replaceChildren(prompt,...options.map(([value,label])=>Object.assign(el('option','',label),{value})));
    }
    targetSelect.value=target?.id??'';
    targetSelect.disabled=inTransit||!live.length||!shuttles.length;
    launchRange.textContent=!shuttles.length?'No boarding shuttles fitted.'
      :target?`${Math.hypot(target.x,target.y,target.z).toFixed(1)} km · ${boardingBalance.range} km launch limit`
      :`Select a track here or lock it in Tactical · ${boardingBalance.range} km launch limit`;
    for(const [number,{card}] of cards)if(!shuttles.some(shuttle=>shuttle.number===number)){
      card.remove();cards.delete(number);
    }
    const recallOffline=['communications','power','reactor'].some(id=>combat.own.systems[id].hp<=0);
    const recallBlock=inTransit?'Recall unavailable during EPD transit.':recallOffline?'Recall requires local communications and power.':null;
    for(const shuttle of shuttles){
      if(!cards.has(shuttle.number))cards.set(shuttle.number,createCard(shuttle.number));
      const {card,phase,range,launches,buttons,reason,recall}=cards.get(shuttle.number);
      const ready=shuttle.status==='ready',returning=shuttle.status==='returning';
      card.dataset.phase=shuttle.status;
      phase.textContent=shuttleStatus(shuttle);
      phase.title=shuttle.result;
      const destination=returning?sector.own:sector.contacts.find(contact=>contact.id===shuttle.targetId);
      range.hidden=ready||!destination;
      if(destination){
        const distance=Math.hypot(shuttle.x-destination.x,shuttle.y-destination.y,shuttle.z-destination.z);
        range.textContent=`${distance.toFixed(1)} km to ${returning?'our ship':'target'}${sector.running?'':' · Paused'}`;
      }
      launches.hidden=!ready;
      const errors=buttons.map(({order,launch})=>{
        const error=boardingLaunchError(combat,sector,shuttle.number,order,target,inTransit);
        launch.disabled=!!error;
        launch.title=error||`Launch with ${shuttleTypes.shuttle.troopCapacity} marines`;
        return error;
      });
      reason.textContent=ready?errors.find(Boolean)??'':'';
      reason.hidden=!reason.textContent;
      recall.hidden=ready;
      recall.disabled=!!recallBlock||returning;
      recall.textContent=returning?'Returning':'Recall';
      recall.title=returning?'Shuttle is already returning.':recallBlock??'Recall the shuttle and its marines.';
      if(!ready&&recallBlock&&!returning){reason.textContent=recallBlock;reason.hidden=false;}
    }
  }
  return {root,refresh,focus:()=>heading.focus()};
}

export function mountDamageConsole({root,flight}){
  root.className='damage-console';root.setAttribute('aria-label','Engineering');
  const summary=el('p','combat-readout'),status=el('p','combat-note');status.setAttribute('role','status');
  const toolbar=el('div','combat-actions');
  const automatic=button('',()=>flight.automaticRepairs(!flight.combat.own.autoRepair));
  automatic.setAttribute('aria-label','Automatic repairs');toolbar.prepend(automatic);
  const allocation=el('fieldset','reactor-allocation');
  allocation.append(el('legend','','Reactor power allocation'));
  let powerPreview=null;
  const powerControls=powerChannels.map(channel=>{
    const label=el('label','reactor-channel');
    const name=channel[0].toUpperCase()+channel.slice(1);
    const slider=el('input',''),value=el('span','reactor-share');
    slider.type='range';slider.min='0';slider.max='100';slider.step='1';slider.setAttribute('aria-label',`${name} power`);
    slider.oninput=()=>{
      const ship=flight.combat.own;
      powerPreview={ship,allocation:redistributePower(ship.powerAllocation,channel,slider.valueAsNumber)};
      renderPower(powerPreview.allocation);
    };
    slider.onchange=()=>{
      const percent=slider.valueAsNumber;
      powerPreview=null;
      flight.allocatePower(channel,percent);
    };
    label.append(el('span','',name),value,slider);allocation.append(label);
    return {channel,slider,value};
  });
  function renderPower(shares){
    for(const {channel,slider,value} of powerControls){
      const share=shares[channel];
      slider.value=String(share);slider.setAttribute('aria-valuetext',`${share}%`);
      value.textContent=`${share}%`;
    }
  }
  const workspace=el('div','damage-workspace'),equipment=el('div','damage-equipment');
  const diagramPanel=el('section','engineering-ship-diagram');
  diagramPanel.setAttribute('aria-label','Ship damage diagram');
  const diagramRepairStatus=el('p','combat-note');
  diagramRepairStatus.setAttribute('role','status');
  let damageDiagram,diagramClass,diagramShip,selectedRepairSystem=null;
  function toggleDiagramRepair(id){
    const ship=flight.combat.own,system=ship.systems[id],job=ship.jobs.find(job=>job.systemId===id);
    selectedRepairSystem=id;
    if(job&&!job.station){
      flight.cancelRepair(id);
      diagramRepairStatus.textContent=`${system.name} repair held.`;
    }else if(!rows.get(id).repair.disabled&&!rows.get(id).repair.hidden){
      flight.repair(id);
      diagramRepairStatus.textContent=`${system.name} repair queued.`;
    }else{
      diagramRepairStatus.textContent=`${system.name} · ${rows.get(id).reason.textContent||'No repair needed'}.`;
    }
    refresh();
  }
  const affected=el('div','damage-systems'),empty=el('p','combat-note','No systems damaged.');
  const healthy=el('details','healthy-systems'),healthyLabel=el('summary','','Systems at full integrity'),healthyRows=el('div','damage-systems');
  healthy.append(healthyLabel,healthyRows);
  equipment.append(diagramPanel,el('h3','','DAMAGED SYSTEMS'),empty,affected,healthy);
  const rows=new Map();
  for(const [id,s] of Object.entries(flight.combat.own.systems)){
    const row=el('div','damage-system'),label=el('span','',s.name),value=el('span',''),bar=el('progress','');bar.max=s.max;bar.setAttribute('aria-label',`${s.name} integrity`);
    const repair=button('Queue repair',()=>flight.repair(id)),reason=el('span','damage-repair-status');
    row.append(label,value,bar,repair,reason);rows.set(id,{row,value,bar,repair,reason});
  }
  const aside=el('aside','damage-controls'),queueHeading=el('h3','','Repair queue · 0'),queue=el('ol','repair-queue');queue.setAttribute('aria-label','Repair queue');
  const containFire=button('Isolate fire / shut down affected compartments',()=>flight.contain('fire'));
  const containBreach=button('Seal bulkheads / isolate pressure loss',()=>flight.contain('breach'));
  const docking=button('',()=>flight.dock()),service=button('Request station repairs and replenishment',()=>flight.service()),station=el('p','combat-note');
  const tenderStatus=el('p','combat-note'),requestTender=button('Request resupply / repair ship',()=>flight.requestSupport()),cancelTender=button('Cancel tender rendezvous / service',()=>flight.cancelSupport());tenderStatus.setAttribute('role','status');
  const repairGuide=el('details','repair-guide');repairGuide.append(el('summary','','Field repair limits'),el('p','combat-note','Cancel holds a system. Queue it manually or switch automatic repairs off and on to release holds. Field repairs consume spares and work half speed under fire. Field limits are 60% hull and 75% equipment. Destroyed systems require full-service replacement.'));
  const events=el('ol','combat-events'),eventLog=el('details','damage-log');
  eventLog.append(el('summary','','Recent events'),events);
  const serviceDetails=el('details','damage-service'),serviceActions=el('div','damage-service-actions');
  serviceActions.append(el('h3','','Station service'),station,docking,service,el('h3','','Repair tender'),tenderStatus,requestTender,cancelTender);
  serviceDetails.append(el('summary','','Service & resupply'),serviceActions);
  aside.append(containFire,containBreach,queueHeading,queue,repairGuide,serviceDetails,eventLog);
  workspace.append(equipment,aside);root.append(summary,status,allocation,toolbar,workspace);
  let systemOrder='',repairQueueKey='',serviceActive=false;
  function refresh(){
    const c=flight.combat,s=c.own;
    if(diagramShip!==s){
      diagramShip=s;
      selectedRepairSystem=null;
      diagramRepairStatus.textContent='Select a marker to queue or hold a field repair.';
    }
    if(diagramClass!==s.classId){
      diagramClass=s.classId;
      damageDiagram=renderShipDiagram({ship:s,interactive:true,onSelectSystem:toggleDiagramRepair});
      diagramPanel.replaceChildren(...(damageDiagram?[damageDiagram.root,diagramRepairStatus]:[]));
    }
    diagramPanel.hidden=!damageDiagram;
    damageDiagram?.update(s,selectedRepairSystem);
    summary.textContent=`Hull ${integrityPercent(s.systems.hull)}% · Spares ${s.spares} / ${s.maxSpares} · ${s.teams} repair teams · ${c.docked?'DOCKED':'FREE FLIGHT'}`;
    summary.title=`Hull / structure · ${hp(s.systems.hull)} · ${state(s.systems.hull)}`;
    automatic.textContent=`Automatic repairs: ${s.autoRepair?'ON':'OFF · manual control'}`;automatic.setAttribute('aria-pressed',String(s.autoRepair));
    const performance=shipPerformance(s);
    if(powerPreview?.ship!==s)powerPreview=null;
    renderPower(powerPreview?.allocation??s.powerAllocation);
    const blocked=[!performance.engines&&'Local maneuvering unavailable',!performance.weapons&&'Weapons unpowered',!performance.epd&&'EPD unavailable',(!performance.power||!s.systems.communications.hp)&&'Comms offline',!performance.sensors&&'Sensors offline'].filter(Boolean);
    const warnings=[s.fire&&'Fire aboard',s.breach&&'Pressure loss',
      (s.breach||s.systems['life-support'].hp===0)&&`Emergency air ${Math.ceil(s.air)} s`,
      c.service&&`${c.service.provider==='tender'?'Repair tender':'Station'} service in progress`,
      !s.spares&&'Spare parts exhausted · onboard repairs stopped',...blocked].filter(Boolean);
    status.textContent=s.systems.hull.hp===0?'SHIP LOST · load a save or restart patrol.':warnings.join(' · ');
    status.hidden=!status.textContent;
    const damaged=[],intact=[];
    const working=new Set(s.jobs.filter(job=>job.station||s.spares>0).slice(0,s.teams).map(job=>job.systemId));
    const repairStatus=job=>!job.station&&!s.spares?'Waiting for spares':!working.has(job.systemId)?'Queued':flight.clockRunning()?'Working':'Paused';
    for(const [id,r] of rows){const system=s.systems[id],cap=id==='hull'?.6:.75;
      (system.hp<system.max?damaged:intact).push(id);
      const percent=integrityPercent(system),tooltip=`${system.name} · ${hp(system)} · ${state(system)}`;
      r.value.textContent=`${percent}%`;r.bar.value=system.hp;r.bar.max=system.max;
      r.row.className=`damage-system is-${integrityStatus(system)}`;r.row.title=tooltip;r.value.title=tooltip;r.bar.title=tooltip;
      r.bar.setAttribute('aria-valuetext',`${percent}% · ${state(system)}`);
      r.repair.textContent=s.repairHolds.includes(id)?'Repair manually · held':'Queue repair';
      const job=s.jobs.find(item=>item.systemId===id);
      const reason=job?repairStatus(job):s.systems.hull.hp<=0?'Ship lost':c.service?'Service in progress':system.hp<=0?'Requires replacement':system.hp>=system.max*cap?'Station service needed':s.spares<1?'Waiting for spares':'';
      r.repair.hidden=system.hp>=system.max||!!reason;r.repair.disabled=!!reason;
      r.reason.textContent=system.hp<system.max?reason:'';
    }
    damaged.sort((a,b)=>s.systems[a].hp/s.systems[a].max-s.systems[b].hp/s.systems[b].max);
    const nextSystemOrder=JSON.stringify([damaged,intact]);
    if(nextSystemOrder!==systemOrder){
      systemOrder=nextSystemOrder;affected.replaceChildren(...damaged.map(id=>rows.get(id).row));healthyRows.replaceChildren(...intact.map(id=>rows.get(id).row));
      empty.hidden=!!damaged.length;healthy.hidden=!intact.length;healthyLabel.textContent=`Systems at full integrity (${intact.length})`;
    }
    const queueLabels=s.jobs.map(job=>`${repairStatus(job)} · ${s.systems[job.systemId].name} · ${integrityPercent(s.systems[job.systemId])}%`);
    const nextQueueKey=JSON.stringify(s.jobs.map((job,index)=>[job.systemId,job.station,queueLabels[index]]));
    if(nextQueueKey!==repairQueueKey){
      repairQueueKey=nextQueueKey;
      queueHeading.textContent=`Repair queue · ${s.jobs.length}`;
      queue.hidden=!s.jobs.length;
      queue.replaceChildren(...s.jobs.map((job,index)=>{const li=el('li','',queueLabels[index]);if(!job.station)li.append(button('Cancel',()=>flight.cancelRepair(job.systemId)));return li;}));
    }
    containFire.hidden=containFire.disabled=!s.fire;containBreach.hidden=containBreach.disabled=!s.breach;
    const support=stationSupport(flight.sector.location);
    station.textContent=support?`${support.name} · ${support.full?'Full repairs, replacement, spares and ammunition':'Basic field repairs, half-capacity spares and gun ammunition'}. Dock within 5 km of the arrival point below 10 KPH; incoming missiles prevent docking.`:'No repair station in this sector. Travel to an established station or the Mars colony.';
    docking.textContent=c.docked?'Undock':'Request docking';docking.disabled=flight.inTransit()||!support||s.systems.hull.hp===0||c.service?.provider==='tender';
    service.disabled=!c.docked||!!c.service;tenderStatus.textContent=supportStatus(c,flight.sector);
    const active=!!c.service||!!c.support&&c.support.phase!=='complete';
    if(active&&!serviceActive)serviceDetails.open=true;
    serviceActive=active;
    const unavailable=flight.supportLink?.();requestTender.disabled=flight.inTransit()||!!unavailable||c.docked||!!c.service||!!c.support&&c.support.phase!=='complete';requestTender.title=unavailable||'';
    cancelTender.disabled=!c.support;
    eventLog.hidden=!c.log.length;
    events.replaceChildren(...c.log.slice(0,5).map(message=>el('li','',message)));
  }
  return {refresh};
}
