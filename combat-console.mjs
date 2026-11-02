import { armamentTypes } from './tactical-model.mjs';
import { weapons,weaponAimOptions,aimPointState,nextAimPoint,canFire,condition,stationSupport,radarEmitting,jammerEmitting } from './combat-model.mjs';
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
function weaponActionIcon(repeat,name,fn,quick=false){
  const label=repeat?'Start Firing':'Fire Once / Burst';
  return actionIcon(label,fn,repeat?repeatIconPath:fireIconPath,`${quick?'Quick ':''}${label} · ${name}`);
}
function select(label,choices,fn){const wrap=el('label','bridge-setting');wrap.append(el('span','',label));const input=el('select','');input.setAttribute('aria-label',label);for(const [value,name] of choices)input.append(Object.assign(el('option','',name),{value}));input.onchange=()=>fn(input.value);wrap.append(input);return {wrap,input};}
const hp=s=>`${Math.ceil(s.hp)} / ${s.max}`;
const state=s=>s.hp===0?'OFFLINE':condition(s)===1?'Operational':condition(s)===.7?'Degraded':'Critical';
const integrityPercent=s=>Math.round(Math.max(0,Math.min(1,s.hp/s.max))*100);
const integrityStatus=s=>condition(s)===1?'healthy':condition(s)===.7?'damaged':'critical';

export function mountWeaponsConsole({flight}){
  const root=el('section','weapons-control');root.setAttribute('aria-label','Weapon fire control');
  root.append(el('h4','','FIRE CONTROL'));
  let target=null,lockedTargets=[],combatState=null;
  const own=()=>flight.combat.own;
  const rows=new Map(),list=el('fieldset','weapon-mount-list');list.append(el('legend','','WEAPONS · SELECT ONE OR MORE'));
  function syncOptions(input,choices){
    if(input.options.length===choices.length&&choices.every(([value,name],i)=>input.options[i].value===value&&input.options[i].textContent===name))return;
    const previous=input.value;input.replaceChildren(...choices.map(([value,name])=>Object.assign(el('option','',name),{value})));
    if(choices.some(([value])=>value===previous))input.value=previous;
  }
  for(const [i,m] of own().mounts.entries()){
    const name=`${armamentTypes[m.weapon].name} · ${m.id.split('-').at(-1)}`;
    const row=el('div','weapon-mount-row'),label=el('label','weapon-mount-choice'),check=el('input','');check.type='checkbox';check.checked=i===0;check.setAttribute('aria-label',`Select ${name}`);
    label.append(check,el('span','',name));
    const status=el('p','weapon-mount-status'),details=el('details','weapon-targeting');details.name='weapon-targeting';details.open=i===0;
    const summary=el('summary','','Targeting');details.append(summary);
    const assigned=select(`Target · ${name}`,[],()=>refresh()),component=select(`Aim at system · ${name}`,weaponAimOptions(m.weapon),()=>refresh()),threat=select(`AA missile target · ${name}`,[],()=>refresh());
    assigned.wrap.firstElementChild.textContent='Target';component.wrap.firstElementChild.textContent='Aim at system';threat.wrap.firstElementChild.textContent='AA missile target';
    const protection=el('p','combat-note aim-protection-note'),info=el('p','combat-note');details.append(assigned.wrap,component.wrap,protection,threat.wrap,info);row.append(label,status,details);list.append(row);
    const singleActions=el('div','combat-actions combat-fire-actions weapon-single-actions');
    const singleFire=weaponActionIcon(false,name,()=>fireMount(rows.get(m.id))),singleContinuous=weaponActionIcon(true,name,()=>fireMount(rows.get(m.id),true));
    singleActions.append(singleFire,singleContinuous);const mountHeading=el('div','weapon-mount-heading');mountHeading.append(label,singleActions);row.prepend(mountHeading);
    rows.set(m.id,{m,name,check,status,details,summary,assigned,component,threat,protection,info,singleFire,singleContinuous});
    check.onchange=()=>setMountSelected(rows.get(m.id),check.checked);
  }
  const selectedRows=()=>[...rows.values()].filter(row=>row.check.checked);
  const shipTarget=row=>row.assigned.input.value?lockedTargets.find(contact=>contact.id===row.assigned.input.value):target;
  const order=row=>({mountId:row.m.id,targetId:row.component.input.value==='incoming'?row.threat.input.value:shipTarget(row)?.stale?undefined:shipTarget(row)?.id,component:row.component.input.value==='incoming'?'hull':row.component.input.value});
  const orders=()=>selectedRows().map(order);
  function setMountSelected(row,checked){
    row.check.checked=checked;
    if(checked){for(const other of rows.values())other.details.open=other===row;}
    else flight.ceaseFire([row.m.id]);
    refresh();
  }
  function ceaseAllWeapons(){for(const row of rows.values())row.check.checked=false;flight.ceaseFire();refresh();}
  function fireMount(row,continuous=false){row.check.checked=true;refresh();(continuous?flight.startFire:flight.fire)([order(row)]);}
  const readiness=el('p','combat-note weapon-readiness'),ownStatus=el('p','combat-readout'),targetStatus=el('p','combat-readout');
  readiness.setAttribute('role','status');
  const targetSystems=el('details','target-damage');targetSystems.append(el('summary','','Target system integrity'));const targetSystemList=el('ul','target-integrity-list');targetSystems.append(targetSystemList);
  const radar=button('',()=>flight.toggleEmitter('radar')),jammer=button('',()=>flight.toggleEmitter('jammer')),ciws=button('',()=>flight.toggleEmitter('ciwsAuto'));
  const fire=actionIcon('Fire Once / Burst',()=>flight.fire(orders()),fireIconPath);
  const continuous=actionIcon('Start Firing',()=>flight.startFire(orders()),repeatIconPath);
  const ceaseAll=actionIcon('Cease All Fire',ceaseAllWeapons,'M8 3h13v13M3 8h13v13H3zM6 11l7 7M13 11l-7 7');
  const clock=button('',()=>flight.toggle());
  const speed=select('Combat / local simulation speed',[[1,'1×'],[10,'10×'],[60,'60×']],value=>flight.setRate(Number(value)));
  const actions=el('div','combat-actions combat-fire-actions weapon-command-actions');actions.append(fire,continuous,ceaseAll);
  const commandBar=el('div','weapon-command-bar');commandBar.append(readiness,actions,clock);
  const selection=el('div','weapon-selection-actions');selection.append(button('Select all',()=>{for(const row of rows.values())row.check.checked=true;refresh();}),button('Clear selection',ceaseAllWeapons));
  const emitters=el('div','combat-actions');emitters.append(radar,jammer,ciws);
  const events=el('ol','combat-events');events.setAttribute('aria-label','Combat events');
  const targetDetails=el('section','target-combat-details');targetDetails.setAttribute('aria-label','Target combat status');targetDetails.append(targetStatus,targetSystems);
  const settings=el('details','combat-settings');settings.append(el('summary','','Combat settings'),emitters,speed.wrap,events);
  root.append(ownStatus,commandBar,selection,list);
  const quick=el('section','radar-fire-popup');quick.popover='auto';quick.setAttribute('role','dialog');quick.setAttribute('aria-labelledby','quick-fire-title');
  const quickHeader=el('header','quick-fire-heading'),quickTitle=el('h3','');quickTitle.id='quick-fire-title';
  const closeQuick=button('×',()=>closeQuickFire());closeQuick.setAttribute('aria-label','Close quick fire control');quickHeader.append(quickTitle,closeQuick);
  const quickList=el('fieldset','quick-fire-list');quickList.append(el('legend','','WEAPONS / AIM AT SYSTEM'));
  const quickRows=new Map();let quickTargetId=null,quickAnchor=null;
  for(const [id,row] of rows){
    const entry=el('div','quick-fire-row'),choice=el('label','weapon-mount-choice'),check=el('input','');check.type='checkbox';check.setAttribute('aria-label',`Quick select ${row.name}`);choice.append(check,el('span','',row.name));
    const aim=el('select','');aim.setAttribute('aria-label',`Quick aim at system · ${row.name}`);
    const status=el('p','weapon-mount-status'),singleActions=el('div','combat-actions combat-fire-actions quick-weapon-actions');
    const singleFire=weaponActionIcon(false,row.name,()=>fireMount(row),true),singleContinuous=weaponActionIcon(true,row.name,()=>fireMount(row,true),true);
    singleActions.append(singleFire,singleContinuous);
    entry.append(choice,aim,status,singleActions);quickList.append(entry);quickRows.set(id,{check,aim,status,singleFire,singleContinuous});
    check.onchange=()=>setMountSelected(row,check.checked);
    aim.onchange=()=>{row.component.input.value=aim.value;refresh();};
  }
  const quickStatus=el('p','combat-note weapon-readiness');quickStatus.setAttribute('role','status');
  const quickCeaseAll=button('Cease All Fire',ceaseAllWeapons);quickCeaseAll.title='Cease All Fire · uncheck all weapons';quickCeaseAll.setAttribute('aria-label','Quick Cease All Fire');
  const quickFooter=el('footer','quick-fire-footer');quickFooter.append(quickStatus,quickCeaseAll);quick.append(quickHeader,quickList,quickFooter);document.body.append(quick);
  quick.oncontextmenu=event=>event.preventDefault();
  function closeQuickFire(){if(quick.matches(':popover-open'))quick.hidePopover();quickTargetId=null;quickAnchor=null;}
  function positionQuickFire(){
    if(!quickAnchor||!quick.matches(':popover-open'))return;
    const box=quick.getBoundingClientRect();quick.style.left=`${Math.max(10,Math.min(quickAnchor.x+10,innerWidth-box.width-10))}px`;quick.style.top=`${Math.max(10,Math.min(quickAnchor.y+10,innerHeight-box.height-10))}px`;
  }
  function openQuickFire(id,x,y){
    closeQuickFire();const contact=lockedTargets.find(contact=>contact.id===id);if(!contact||contact.stale)return;
    quickTargetId=id;quickAnchor={x,y};
    // Both surfaces edit the same mount controls; opening assigns the clicked ship.
    for(const row of rows.values()){
      row.assigned.input.value=id;
      if(row.component.input.value==='incoming')row.component.input.value=weaponAimOptions(row.m.weapon)[0][0];
    }
    refresh();quick.showPopover();positionQuickFire();
    quickRows.values().next().value.check.focus({preventScroll:true});
  }
  quick.addEventListener('toggle',event=>{if(event.newState==='closed')quickTargetId=null;});
  window.addEventListener('resize',closeQuickFire);
  function refresh(nextTarget=target,nextLocks=lockedTargets){
    target=nextTarget;lockedTargets=nextLocks;const c=flight.combat,s=own(),incoming=c.shots.filter(p=>p.targetId==='own'&&weapons[p.weapon].missile);
    if(combatState!==c){
      combatState=c;const active=c.firing||[];let expanded=false;
      for(const [i,row] of [...rows.values()].entries()){
        const assignment=active.find(f=>f.mountId===row.m.id);row.check.checked=active.length?!!assignment:i===0;
        syncOptions(row.assigned.input,assignment?[[assignment.targetId,'Assigned target']]:[['','Active radar target']]);
        row.component.input.value=assignment?.targetId.startsWith('shot:')&&row.m.weapon==='gp-missiles'?'incoming':assignment?.component||weaponAimOptions(row.m.weapon)[0][0];
        if(!row.component.input.value)row.component.input.value=weaponAimOptions(row.m.weapon)[0][0];
        if(assignment?.targetId.startsWith('shot:'))syncOptions(row.threat.input,[[assignment.targetId,assignment.targetId]]);
        row.details.open=row.check.checked&&!expanded;if(row.details.open)expanded=true;
      }
    }
    let ready=0,queueable=0;
    for(const row of rows.values()){
      const {m,assigned,component,threat}=row,spec=weapons[m.weapon],choices=[['',`Active radar target · ${target?.trackLabel||'none'}`],...lockedTargets.map(contact=>[contact.id,`${contact.trackLabel} · ${contact.name}`])];
      if(assigned.input.value&&!lockedTargets.some(contact=>contact.id===assigned.input.value))choices.push([assigned.input.value,'Target no longer locked']);
      syncOptions(assigned.input,choices);syncOptions(threat.input,incoming.map(shot=>[shot.id,`${shot.id} · ${armamentTypes[shot.weapon].name}`]));
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
      row.singleFire.disabled=flight.inTransit()||!!error;row.singleContinuous.disabled=flight.inTransit()||!!startError;
      if(row.check.checked&&!flight.inTransit()){if(!error)ready++;if(!startError)queueable++;}
      const active=(c.firing||[]).find(f=>f.mountId===m.id),activeTarget=active&&(lockedTargets.find(contact=>contact.id===active.targetId)?.trackLabel||active.targetId);
      row.status.textContent=`${spec.range} km · ${s.ammo[m.weapon]} remaining · ${flight.inTransit()?'EPD transit':error||'Ready'}${active?` · FIRING ${activeTarget} / ${active.component}`:''}`;
      const aimName=component.input.selectedOptions[0]?.textContent;
      row.summary.textContent=`Targeting · ${component.input.value==='incoming'?threat.input.value||'no incoming missile':shipTarget(row)?.trackLabel||'no target'} · ${aimName}`;
      row.info.textContent=`${spec.rpm} rounds/min per barrel · ${spec.damage} damage/round · ${spec.guidance}`;
    }
    ownStatus.textContent=`WAYFARER · Hull ${hp(s.systems.hull)} · ${incoming.length} incoming missiles`;
    const enemy=target&&!target.stale?c.contacts[target.id]:null;
    targetStatus.textContent=enemy?`${enemy.surrendered?'SURRENDERED · ':''}${target.identified?`Target hull ${hp(enemy.systems.hull)} · `:''}Radar ${radarEmitting(enemy)?'emitting':'silent'} · Jammer ${jammerEmitting(enemy)?'emitting':'silent'}`:'Select a live radar track to engage a ship.';
    targetSystems.hidden=!enemy||!target.identified;
    targetSystemList.replaceChildren(...(enemy&&target.identified?Object.values(enemy.systems).map(system=>{
      const status=integrityStatus(system),percent=integrityPercent(system);
      const row=el('li','target-integrity-row'),value=el('span',`target-integrity-value is-${status}`,`${percent}%`);
      row.title=`${system.name} · ${hp(system)} · ${state(system)}`;
      value.setAttribute('aria-label',`${percent}% integrity remaining · ${state(system)}`);
      row.append(el('span','target-integrity-name',system.name),value);return row;
    }):[]));
    readiness.textContent=`${selectedRows().length} selected · ${ready} ready · ${(c.firing||[]).length} firing`;
    fire.disabled=ready===0;continuous.disabled=queueable===0;ceaseAll.disabled=!c.firing&&selectedRows().length===0;
    clock.textContent=flight.sector.running?'Pause local simulation':'Run local simulation';clock.disabled=flight.inTransit();speed.input.value=String(flight.sector.rate);
    radar.textContent=`Ship radar: ${s.radar?'ON':'SILENT'}`;jammer.textContent=`Radar jammer: ${s.jammer?'ON':'OFF'}`;ciws.textContent=`Independent CIWS: ${s.ciwsAuto?'AUTO':'OFF'}`;
    radar.disabled=s.systems.sensors.hp<=0;jammer.disabled=s.systems.jammer.hp<=0;
    events.replaceChildren(...c.log.slice(0,5).map(message=>el('li','',message)));
    if(quickTargetId){
      const contact=lockedTargets.find(contact=>contact.id===quickTargetId);
      if(!contact||contact.stale){closeQuickFire();return;}
      quickTitle.textContent=`${contact.trackLabel} · ${contact.name} · FIRE CONTROL`;
      for(const [id,row] of rows){
        const view=quickRows.get(id),options=Array.from(row.component.input.options).filter(option=>option.value!=='incoming');
        view.check.checked=row.check.checked;syncOptions(view.aim,options.map(option=>[option.value,option.textContent]));
        for(const option of view.aim.options){const source=options.find(source=>source.value===option.value);option.disabled=source.disabled;option.className=source.className;}
        view.aim.value=row.component.input.value;view.status.textContent=row.status.textContent;
        view.singleFire.disabled=row.singleFire.disabled;view.singleContinuous.disabled=row.singleContinuous.disabled;
      }
      quickStatus.textContent=readiness.textContent;
      quickCeaseAll.disabled=ceaseAll.disabled;
      positionQuickFire();
    }
  }
  return {root,settings,targetDetails,refresh,openQuickFire,closeQuickFire,isQuickFireOpen:()=>quick.matches(':popover-open')};
}

export function mountDamageConsole({root,flight}){
  root.className='damage-console';root.setAttribute('aria-label','Engineering damage control');
  const heading=el('header','damage-heading');heading.append(el('span','tactical-eyebrow','ENGINEERING / DAMAGE CONTROL'));
  const summary=el('p','combat-readout'),status=el('p','combat-note');status.setAttribute('role','status');
  const clock=button('',()=>flight.toggle()),rate=select('Repair / local simulation speed',[[1,'1×'],[10,'10×'],[60,'60×']],value=>flight.setRate(Number(value)));
  const toolbar=el('div','combat-actions');toolbar.append(clock,rate.wrap,button('Cease all fire',()=>flight.ceaseFire()));
  const automatic=button('',()=>flight.automaticRepairs(!flight.combat.own.autoRepair));
  automatic.setAttribute('aria-label','Automatic repairs');toolbar.prepend(automatic);
  const workspace=el('div','damage-workspace'),equipment=el('div','damage-equipment'),systems=el('section','damage-systems'),weaponSystems=el('section','damage-weapons');
  systems.setAttribute('aria-label','Ship systems damage');weaponSystems.setAttribute('aria-label','Weapons damage');
  systems.append(el('h3','','SHIP SYSTEMS'));weaponSystems.append(el('h3','','WEAPONS'));
  const weaponIds=new Set(flight.combat.own.mounts.map(mount=>mount.id));
  const rows=new Map();
  for(const [id,s] of Object.entries(flight.combat.own.systems)){
    const row=el('div','damage-system'),label=el('span','',s.name),value=el('span',''),bar=el('progress','');bar.max=s.max;bar.setAttribute('aria-label',`${s.name} integrity`);
    const repair=button('Queue repair',()=>flight.repair(id));row.append(label,value,bar,repair);(weaponIds.has(id)?weaponSystems:systems).append(row);rows.set(id,{row,value,bar,repair});
  }
  const aside=el('aside','damage-controls'),queue=el('ol','repair-queue');queue.setAttribute('aria-label','Repair queue');
  const containFire=button('Isolate fire / shut down affected compartments',()=>flight.contain('fire'));
  const containBreach=button('Seal bulkheads / isolate pressure loss',()=>flight.contain('breach'));
  const docking=button('',()=>flight.dock()),service=button('Request station repairs and replenishment',()=>flight.service()),station=el('p','combat-note');
  const events=el('ol','combat-events');aside.append(el('h3','','REPAIR TEAMS'),queue,el('p','combat-note','Engineering queues repairs automatically. Cancel holds a system; queue it manually or switch Auto off/on to release holds. Manual control keeps manual orders. Repairs use spare parts and pause with simulation time. Half speed under fire. Field limits: hull 60%, equipment 75%. Destroyed systems need station replacement.'),containFire,containBreach,el('h3','','STATION SERVICE'),station,docking,service,events);
  equipment.append(systems,weaponSystems);workspace.append(equipment,aside);root.append(heading,summary,status,toolbar,workspace);
  function refresh(){
    const c=flight.combat,s=c.own;
    summary.textContent=`Hull ${integrityPercent(s.systems.hull)}% · Spares ${s.spares} / ${s.maxSpares} · ${s.teams} repair teams · ${c.docked?'DOCKED':'FREE FLIGHT'}`;
    summary.title=`Hull / structure · ${hp(s.systems.hull)} · ${state(s.systems.hull)}`;
    automatic.textContent=`Automatic repairs: ${s.autoRepair?'ON':'OFF · manual control'}`;automatic.setAttribute('aria-pressed',String(s.autoRepair));
    status.textContent=s.systems.hull.hp===0?'SHIP LOST · load a save or restart patrol.':`${s.fire?'FIRE · ':''}${s.breach?'PRESSURE LOSS · ':''}${s.breach||s.systems['life-support'].hp===0?`Emergency air ${Math.ceil(s.air)} s · `:''}${c.service?'Station service in progress':!s.spares?'Spare parts exhausted · onboard repairs stopped':`${s.jobs.length} repair jobs queued`}`;
    clock.textContent=flight.sector.running?'Pause local simulation':'Run local simulation';clock.disabled=flight.inTransit();rate.input.value=String(flight.sector.rate);
    for(const [id,r] of rows){const system=s.systems[id],cap=id==='hull'?.6:.75;
      const percent=integrityPercent(system),tooltip=`${system.name} · ${hp(system)} · ${state(system)}`;
      r.value.textContent=`${percent}%`;r.bar.value=system.hp;r.bar.max=system.max;
      r.row.className=`damage-system is-${integrityStatus(system)}`;r.row.title=tooltip;r.value.title=tooltip;r.bar.title=tooltip;
      r.bar.setAttribute('aria-valuetext',`${percent}% · ${state(system)}`);
      r.repair.textContent=s.repairHolds.includes(id)?'Repair manually · held':'Queue repair';
      r.repair.disabled=s.systems.hull.hp<=0||!!c.service||system.hp<=0||system.hp>=system.max*cap||s.spares<1||s.jobs.some(j=>j.systemId===id);
    }
    queue.replaceChildren(...s.jobs.map((j,i)=>{const li=el('li','',`${i<s.teams?'Working':'Queued'} · ${j.station?'Station':j.automatic?'Auto':'Manual'} · ${s.systems[j.systemId].name}`);if(!j.station)li.append(button('Cancel',()=>flight.cancelRepair(j.systemId)));return li;}));
    if(!s.jobs.length)queue.append(el('li','','No repair orders.'));
    containFire.disabled=!s.fire;containBreach.disabled=!s.breach;
    const support=stationSupport(flight.sector.location);
    station.textContent=support?`${support.name} · ${support.full?'Full repairs, replacement, spares and ammunition':'Basic field repairs, half-capacity spares and gun ammunition'}. Dock within 5 km of the arrival point below 10 KPH; incoming missiles prevent docking.`:'No repair station in this sector. Travel to an established station or the Mars colony.';
    docking.textContent=c.docked?'Undock':'Request docking';docking.disabled=flight.inTransit()||!support||s.systems.hull.hp===0;
    service.disabled=!c.docked||!!c.service;events.replaceChildren(...c.log.slice(0,5).map(message=>el('li','',message)));
  }
  return {refresh};
}
