import { shipTypes, trainingContacts } from './tactical-model.mjs';

// Provisional game balance values; rates are per barrel, time is simulated seconds.
// Transient visual events stay out of saved simulation state.
const interceptionFlashes=new WeakMap();
function flashInterception(combat,shipId){
  const events=recentInterceptions(combat);
  events.push({shipId,expires:performance.now()+1000});interceptionFlashes.set(combat,events);
}
export function recentInterceptions(combat){
  return (interceptionFlashes.get(combat)||[]).filter(event=>event.expires>performance.now());
}
export const weapons = {
  'autocannon-120':{range:30,rpm:20,damage:12,speed:1,penetration:.25,guidance:'Ship radar + laser ranging / targeting'},
  'autocannon-75':{range:20,rpm:40,damage:5,speed:1,penetration:.1,guidance:'Ship radar + laser ranging / targeting'},
  'ciws-30':{range:20,rpm:3000,damage:.1,speed:1,penetration:0,guidance:'Independent computer, tracking radar and tracking IR per mount'},
  'rail-gun':{range:150,rpm:6,damage:180,speed:10,penetration:.8,guidance:'Ship radar + laser ranging / targeting'},
  'as-missiles':{range:200,rpm:4,damage:160,speed:1,penetration:.5,missile:true,guidance:'Onboard radar + IR'},
  'mp-missiles':{range:80,rpm:7.5,damage:60,speed:1,penetration:.25,missile:true,guidance:'Onboard radar + IR'},
  'gp-missiles':{range:120,rpm:6,damage:90,speed:1,penetration:.35,missile:true,guidance:'Onboard radar + IR'}
};
export const missileRoles={
  'anti-ship':'Anti-ship',precision:'Subsystem strike',aa:'AA · shuttles / fighters / missiles',
  'anti-radiation':'Anti-radiation · radar emitter','anti-jammer':'Anti-jammer · radar jammer'
};
export const missileOptions={
  'as-missiles':['anti-ship','precision','anti-radiation','anti-jammer'],
  'gp-missiles':['anti-ship','precision','aa','anti-radiation','anti-jammer'],
  // Legacy AA presets and in-flight MP shots remain readable in existing saves.
  'mp-missiles':['precision','aa','anti-radiation','anti-jammer']
};
const subsystemAims=[['engines','Main engines'],['weapons','Weapon mounts'],['sensors','Radar / fire control'],['jammer','Radar jammer'],['reactor','Reactor'],['power','Power distribution'],['epd','EPD'],['bridge','Bridge'],['communications','Communications'],['life-support','Life support']];
export function weaponAimOptions(weapon){
  if(weapon==='as-missiles')return [['hull','Hull · heavy strike'],...subsystemAims];
  if(weapon==='mp-missiles')return subsystemAims;
  return [['hull','Hull'],...subsystemAims,...(weapon==='gp-missiles'?[['incoming','Incoming missile · AA']]:[])];
}
const internalAimPoints=new Set(['reactor','power','epd','bridge','communications','life-support']);
export function aimPointState(ship,component){
  if(component==='incoming')return {available:true,destroyed:false,protected:false};
  const systems=!ship?[]:component==='engines'?Object.entries(ship.systems).filter(([id])=>id.startsWith('engine-')).map(([,system])=>system):component==='weapons'?ship.mounts.map(mount=>ship.systems[mount.id]):[ship.systems[component]].filter(Boolean);
  const destroyed=!!ship&&!systems.some(system=>system.hp>0);
  const protectedByHull=internalAimPoints.has(component)&&(!ship||ship.systems.hull.hp>0);
  return {available:!destroyed&&!protectedByHull,destroyed,protected:protectedByHull};
}
export function nextAimPoint(ship,weapon,current){
  const options=weaponAimOptions(weapon),start=options.findIndex(([id])=>id===current);
  for(let offset=1;offset<=options.length;offset++){
    const id=options[(start+offset+options.length)%options.length][0];
    // Never switch a ship strike into an unrelated incoming-missile engagement.
    if(id!=='incoming'&&aimPointState(ship,id).available)return id;
  }
  return null;
}
// Guidance follows the chosen target and system; there is no separate launch preset.
function launchRole(weapon,targetId,component){
  if(!weapons[weapon].missile)return null;
  if(targetId?.startsWith('shot:'))return 'aa';
  return component==='sensors'?'anti-radiation':component==='jammer'?'anti-jammer':component==='hull'?'anti-ship':'precision';
}
// Hull, spares, repair teams, armor reduction, engines. SDF and pirate engine counts are confirmed.
export const damageClasses={
  'private-yacht':[350,40,1,.05,2],'une-light-cargo':[500,60,1,.08,1],
  'une-cargo':[1200,160,2,.1,2],'une-transport':[900,120,2,.1,2],'une-large-transport':[1800,250,3,.15,4],
  privateer:[850,120,2,.2,2],'pirate-corvette':[550,60,1,.18,2],'pirate-frigate':[900,100,2,.25,2],
  'sdf-frigate':[1000,200,2,.3,2],'sdf-destroyer':[1500,300,3,.35,2],
  'sdf-cruiser':[2400,500,4,.4,2],'sdf-heavy-cruiser':[3600,750,5,.45,3]
};
export const systemNames={hull:'Hull / structure',bridge:'Bridge',reactor:'Fusion reactor',power:'Power distribution',epd:'EPD',sensors:'Sensors / fire control',communications:'Communications','life-support':'Life support',jammer:'Radar jammer'};
const baseSystems={bridge:100,reactor:200,power:150,epd:160,sensors:80,communications:60,'life-support':140,jammer:60};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const position=(sector,id)=>id==='own'?sector.own:sector.contacts.find(c=>c.id===id);
const vessel=(combat,id)=>id==='own'?combat.own:combat.contacts[id];
const log=(combat,message)=>{combat.log.unshift(message);combat.log=combat.log.slice(0,8);};
const alive=ship=>!!ship && ship.systems.hull.hp>0;
const targetable=ship=>!!ship&&Object.values(ship.systems).some(system=>system.hp>0);

export function createDamageShip(classId,player=false){
  const [hull,spares,teams,armor,engines]=damageClasses[classId],catalog=shipTypes[classId];
  const systems={hull:{name:systemNames.hull,hp:hull,max:hull}};
  for(const [id,base] of Object.entries(baseSystems)){
    const max=Math.max(20,Math.round(base*hull/1000));systems[id]={name:systemNames[id],hp:max,max};
  }
  for(let i=1;i<=engines;i++){const max=Math.max(20,Math.round(120*hull/1000));systems[`engine-${i}`]={name:`Main engine ${i}`,hp:max,max};}
  const mounts=[],ammo={};
  for(const weapon of catalog.loadout){
    const fit=catalog.fitting?.[weapon],spec=weapons[weapon];
    const count=spec.missile?1:fit?.turrets??fit?.quantity??1;
    ammo[weapon]=spec.missile?(fit?.quantity??(weapon==='gp-missiles'?16:12)):(weapon==='ciws-30'?6000:weapon==='rail-gun'?120:1200)*count;
    for(let i=1;i<=count;i++){
      const id=`${weapon}-${i}`,max=weapon==='rail-gun'?160:weapon==='ciws-30'?50:spec.missile?100:80;
      systems[id]={name:`${spec.missile?'Launcher':weapon==='ciws-30'?'CIWS mount':'Turret'} ${i} · ${weapon}`,hp:max,max};
      mounts.push({id,weapon,barrels:fit?.gunsPerTurret??1,readyAt:0});
    }
  }
  // Retained for compatibility with version 2 saves; launches derive guidance from aim.
  const roles=Object.fromEntries(Object.keys(missileOptions).map(w=>[w,w==='mp-missiles'?'precision':'anti-ship']));
  return {classId,systems,mounts,ammo,maxAmmo:{...ammo},roles,spares,maxSpares:spares,teams,armor,
    radar:true,jammer:classId.startsWith('pirate-'),ciwsAuto:true,surrendered:false,jobs:[],autoRepair:player,repairHolds:[],fire:false,breach:false,air:1800,underFireUntil:0};
}
export function createCombat(contacts=trainingContacts){
  return {time:0,own:createDamageShip('sdf-frigate',true),contacts:Object.fromEntries(contacts.map(c=>[c.id,createDamageShip(c.shipType)])),
    shots:[],nextShot:1,firing:null,hostiles:[],alliedOrders:{},docked:false,service:null,log:['Weapons safed · select a weapon and aim system before firing.']};
}
export function changeEncounter(combat,contacts){
  combat.contacts=Object.fromEntries(contacts.map(c=>[c.id,createDamageShip(c.shipType)]));
  combat.engagement=null;combat.shots=[];combat.firing=null;combat.hostiles=[];combat.alliedOrders={};combat.docked=false;combat.service=null;
  combat.own.jobs=combat.own.jobs.filter(j=>!j.station);
}
export function condition(system){const ratio=system.hp/system.max;return ratio>.7?1:ratio>=.4?.7:ratio>0?.35:0;}
export function shipPerformance(ship){
  if(!alive(ship))return {engines:0,sensors:0,power:0,epd:false};
  const power=condition(ship.systems.reactor)*condition(ship.systems.power);
  const engines=Object.entries(ship.systems).filter(([id])=>id.startsWith('engine-')).map(([,s])=>condition(s));
  return {engines:engines.reduce((a,b)=>a+b,0)/engines.length*power,
    sensors:condition(ship.systems.sensors)*(power||.2),power,epd:power>0&&ship.systems.epd.hp>0};
}
export const radarEmitting=ship=>!!ship?.radar&&ship.systems.sensors.hp>0&&shipPerformance(ship).power>0;
export const jammerEmitting=ship=>!!ship?.jammer&&ship.systems.jammer.hp>0&&shipPerformance(ship).power>0;
export function applyDamage(combat,id,damage,component='hull',penetration=0){
  const ship=vessel(combat,id);if(!targetable(ship)||!aimPointState(ship,component).available||!Number.isFinite(damage)||damage<=0)return 0;
  const wasAlive=alive(ship);
  const amount=damage*(1-ship.armor*(1-penetration));
  ship.systems.hull.hp=Math.max(0,ship.systems.hull.hp-amount);
  const candidate=Object.keys(ship.systems).filter(key=>key!=='hull');
  const key=component==='engines'?candidate.find(k=>k.startsWith('engine-')&&ship.systems[k].hp>0):component==='weapons'?candidate.find(k=>ship.mounts.some(m=>m.id===k)&&ship.systems[k].hp>0):component;
  // Hull and equipment measure different effects of the same penetrating hit.
  if(key!=='hull'&&ship.systems[key])ship.systems[key].hp=Math.max(0,ship.systems[key].hp-amount*.3);
  ship.underFireUntil=combat.time+30;
  if(ship.systems.hull.hp<ship.systems.hull.max*.5)ship.breach=true;
  if((key==='reactor'||key==='power')&&ship.systems[key].hp<ship.systems[key].max*.4)ship.fire=true;
  if(wasAlive&&!alive(ship)){ship.jobs=[];log(combat,`${id==='own'?'Wayfarer':id}: hull breached · disabled · internal systems exposed.`);}
  if(id==='own')scheduleRepairs(combat);
  return amount;
}

// Ballistic intercept in the fixed sector frame. Guns inherit the firing ship's
// velocity; there is no drag or distance-based loss of speed or impact damage.
export function intercept(source,target,speed){
  const r=['x','y','z'].map(k=>target[k]-source[k]),v=['vx','vy','vz'].map(k=>((target[k]||0)-(source[k]||0))/3600);
  const a=v.reduce((s,n)=>s+n*n,0)-speed*speed,b=2*r.reduce((s,n,i)=>s+n*v[i],0),c=r.reduce((s,n)=>s+n*n,0);
  let time;if(c===0)time=0;else if(Math.abs(a)<1e-9)time=b<0?-c/b:Infinity;else{
    const d=b*b-4*a*c;if(d<0)return null;
    const roots=[(-b-Math.sqrt(d))/(2*a),(-b+Math.sqrt(d))/(2*a)].filter(t=>t>=0);time=Math.min(...roots);
  }
  if(!Number.isFinite(time))return null;
  const aim=r.map((n,i)=>n+v[i]*time),length=Math.hypot(...aim)||1;
  return {time,velocity:Object.fromEntries(['x','y','z'].map((k,i)=>[k,(source[['vx','vy','vz'][i]]||0)/3600+aim[i]/length*speed]))};
}
export function canFire(combat,sector,sourceId,mountId,targetId,component='hull',{ignoreCooldown=false}={}){
  const ship=vessel(combat,sourceId),mount=ship?.mounts.find(m=>m.id===mountId),source=position(sector,sourceId);
  if(!alive(ship)||!mount||!source)return 'Weapon unavailable.';
  if(ship.surrendered)return 'Vessel has surrendered · weapons secured.';
  if(sourceId==='own'&&combat.docked)return 'Undock before firing.';
  const spec=weapons[mount.weapon],role=launchRole(mount.weapon,targetId,component);
  if(mount.weapon==='mp-missiles'&&(component==='hull'||targetId?.startsWith('shot:')))return 'MP missiles target ship subsystems only.';
  if(mount.weapon==='as-missiles'&&targetId?.startsWith('shot:'))return 'AS missiles target ships and ship systems only.';
  if(!weaponAimOptions(mount.weapon).some(([id])=>id===component))return 'Select a valid aim system for this weapon.';
  if(ship.systems[mountId].hp<=0||shipPerformance(ship).power<=0)return 'Mount or main power is offline.';
  if(!ignoreCooldown&&mount.readyAt>combat.time+1e-8)return 'Weapon is reloading.';
  if(ship.ammo[mount.weapon]<mount.barrels)return 'Ammunition depleted.';
  if(!spec.missile&&mount.weapon!=='ciws-30'&&(!ship.radar||shipPerformance(ship).sensors<=0))return 'Turret fire requires ship radar and laser fire control.';
  const threat=targetId?.startsWith('shot:')?combat.shots.find(s=>s.id===targetId):null;
  if(threat&&mount.weapon==='ciws-30'&&ship.ammo[mount.weapon]<75)return 'CIWS requires 75 rounds per missile engagement.';
  const target=threat||position(sector,targetId),targetShip=threat?null:vessel(combat,targetId);
  if(!target || (threat?threat.sourceId===sourceId||!weapons[threat.weapon].missile:!targetable(targetShip)))return 'No valid live target.';
  if(!threat){
    const aim=aimPointState(targetShip,component);
    if(aim.destroyed)return 'Aim point destroyed · select another system.';
    if(aim.protected)return 'Internal system protected by hull · reduce hull to 0 first.';
  }
  if(distance(source,target)>spec.range)return 'Target is outside weapon range.';
  if(sourceId==='own'&&mount.weapon!=='ciws-30'&&(shipPerformance(ship).sensors<=0||distance(source,target)>(sector.sensorRange??200)))return 'No live acquisition track in sensor coverage.';
  if(threat&&mount.weapon!=='gp-missiles'&&mount.weapon!=='ciws-30')return 'Use GP missiles or CIWS against incoming missiles.';
  if(role==='anti-radiation'&&!radarEmitting(targetShip))return 'Target radar is not emitting.';
  if(role==='anti-jammer'&&!jammerEmitting(targetShip))return 'Target jammer is not emitting.';
  return null;
}
export function fireWeapon(combat,sector,sourceId,mountId,targetId,component='hull',rng=Math.random){
  const error=canFire(combat,sector,sourceId,mountId,targetId,component);if(error)return {ok:false,message:error};
  const ship=vessel(combat,sourceId),mount=ship.mounts.find(m=>m.id===mountId),spec=weapons[mount.weapon],source=position(sector,sourceId);
  const target=targetId.startsWith('shot:')?combat.shots.find(s=>s.id===targetId):position(sector,targetId);
  const plan=intercept(source,{...target,vx:target.vx??0,vy:target.vy??0,vz:target.vz??0},spec.speed);
  if(!plan)return {ok:false,message:'No intercept solution.'};
  if(mount.weapon==='ciws-30'&&targetId.startsWith('shot:')){
    ship.ammo[mount.weapon]-=75;mount.readyAt=combat.time+10+5*rng();mount.ciwsTarget=targetId;
    log(combat,`${sourceId}: ${mount.id} engaging missile · 75 rounds · 10–15 seconds.`);
    return {ok:true,message:'CIWS engaging missile.'};
  }
  const rounds=Math.min(mount.weapon==='ciws-30'?10*mount.barrels:mount.barrels,ship.ammo[mount.weapon]);
  ship.ammo[mount.weapon]-=rounds;mount.readyAt=combat.time+60/spec.rpm*(rounds/mount.barrels)/condition(ship.systems[mountId]);
  const role=launchRole(mount.weapon,targetId,component);
  const tracking=mount.weapon==='ciws-30'?condition(ship.systems[mountId]):spec.missile?1:shipPerformance(ship).sensors;
  const targetShip=targetId.startsWith('shot:')?null:vessel(combat,targetId);
  const jamming=targetShip&&jammerEmitting(targetShip)&&role!=='anti-jammer'?(spec.missile ? .9 : .8):1;
  const hitChance=Math.max(.05,(.95-.25*distance(source,target)/spec.range)*tracking*jamming);
  // Misses are resolved and discarded. Self-destruction is a setting note only.
  if(rng()>=hitChance){log(combat,`${sourceId}: ${mount.weapon} missed.`);return {ok:true,message:'Weapon fired · miss.'};}
  const guided=spec.missile;
  const velocity=guided?Object.fromEntries(['x','y','z'].map(k=>[k,plan.velocity[k]-(source[{x:'vx',y:'vy',z:'vz'}[k]]||0)/3600])):plan.velocity;
  combat.shots.push({id:`shot:${combat.nextShot++}`,sourceId,targetId,weapon:mount.weapon,role,component:role==='anti-radiation'?'sensors':role==='anti-jammer'?'jammer':component,
    damage:spec.damage*rounds,x:source.x,y:source.y,z:source.z,vx:velocity.x*3600,vy:velocity.y*3600,vz:velocity.z*3600,remaining:Math.max(.25,plan.time*2+1)});
  if(sourceId==='own'&&!targetId.startsWith('shot:')&&targetId!=='own'&&!combat.hostiles.includes(targetId))combat.hostiles.push(targetId);
  log(combat,`${sourceId}: ${mount.weapon}${role?` / ${missileRoles[role]}`:''} fired.`);
  return {ok:true,message:'Weapon fired.'};
}
export function startFiring(combat,sector,mountId,targetId,component){
  const error=canFire(combat,sector,'own',mountId,targetId,component,{ignoreCooldown:true});if(error)return {ok:false,message:error};
  const orders=combat.firing||[];
  combat.firing=[...orders.filter(order=>order.mountId!==mountId),{mountId,targetId,component}];
  return {ok:true,message:'Fire order active · run local time to fire.'};
}
export function ceaseFiring(combat,mountIds=null){
  if(!mountIds)combat.engagement=null;
  else if(combat.engagement)combat.engagement.overrides=[...new Set([...combat.engagement.overrides,...mountIds])];
  const orders=mountIds?(combat.firing||[]).filter(order=>!mountIds.includes(order.mountId)):[];
  combat.firing=orders.length?orders:null;
}
export function commandWeapons(combat,sector,orders,continuous=false,rng=Math.random){
  if(combat.engagement)combat.engagement.overrides=[...new Set([...combat.engagement.overrides,...orders.map(order=>order.mountId)])];
  const seen=new Set(),results=[];
  for(const order of orders){
    if(seen.has(order.mountId))continue;seen.add(order.mountId);
    const result=continuous?startFiring(combat,sector,order.mountId,order.targetId,order.component):fireWeapon(combat,sector,'own',order.mountId,order.targetId,order.component,rng);
    results.push({mountId:order.mountId,...result});
  }
  const count=results.filter(result=>result.ok).length,skipped=results.filter(result=>!result.ok);
  return {ok:count>0,results,message:`${count} weapon${count===1?'':'s'} ${continuous?'ordered to fire':'fired'}${skipped.length?` · ${skipped.length} skipped: ${skipped.map(result=>`${result.mountId}: ${result.message}`).join('; ')}`:''}.`};
}
export function orderEngagement(combat,sector,objective,targetIds){
  if(!['disable','destroy'].includes(objective)||!targetIds.length)return {ok:false,message:'Lock targets and set priorities first.'};
  ceaseFiring(combat);
  combat.engagement={objective,targetIds:[...new Set(targetIds)],overrides:[]};
  planEngagement(combat,sector);
  return {ok:true,message:`Automatic ${objective} order active · manual weapon commands override individual mounts.`};
}
export function orderAlliedSupport(combat,sector,id,mode,targetIds){
  const contact=sector.contacts.find(c=>c.id===id),ship=combat.contacts[id];
  const refuse=message=>({accepted:false,message});
  if(contact?.type!=='friendly'||!ship?.classId.startsWith('sdf-'))return refuse('Only friendly SDF ships can receive these commands.');
  if(combat.hostiles.includes(id)||ship.surrendered)return refuse('Request refused. We are not accepting your combat orders.');
  if(mode==='stand-down'){delete combat.alliedOrders[id];return {accepted:true,message:'Acknowledged. Standing down from your support order. Weapons already in flight cannot be recalled.'};}
  if(!['attack-targets','battle-assistance'].includes(mode))return refuse('Unrecognized support order.');
  if(!alive(ship)||ship.systems.hull.hp/ship.systems.hull.max<=.4||ship.fire||ship.breach)return refuse('Unable to comply. We must prioritize our own damage control.');
  if(ship.systems.bridge.hp<=0||shipPerformance(ship).power<=0||shipPerformance(ship).sensors<=0)return refuse('Unable to comply. Our bridge, power, or fire control is offline.');
  const targets=[...new Set(targetIds)].filter(targetId=>targetId!==id&&sector.contacts.some(c=>c.id===targetId&&c.type==='enemy')&&alive(combat.contacts[targetId])&&!combat.contacts[targetId].surrendered);
  if(!targets.length)return refuse(mode==='attack-targets'?'Unable to comply. Send a live, identified hostile target lock; we will not attack friendly, neutral, or unidentified ships.':'No confirmed hostile threat is available for battle assistance.');
  const canEngage=targets.some(targetId=>ship.mounts.some(m=>m.weapon!=='ciws-30'&&!canFire(combat,sector,id,m.id,targetId,m.weapon==='mp-missiles'?'engines':'hull',{ignoreCooldown:true})));
  if(!canEngage)return refuse('Unable to comply. The requested targets are beyond our working weapons range, or our weapons and ammunition are unavailable.');
  combat.alliedOrders[id]={mode,targetIds:targets};
  return {accepted:true,message:`Acknowledged. ${mode==='attack-targets'?'Engaging your transmitted targets in priority order':'Providing fire support against the confirmed battle threats'}. We will fire within weapons range and maintain our present course.`};
}
function alliedSupport(combat,sector,rng){
  for(const [id,order] of Object.entries(combat.alliedOrders)){
    const ship=combat.contacts[id];
    if(!alive(ship)||ship.surrendered||combat.hostiles.includes(id)||ship.systems.hull.hp/ship.systems.hull.max<=.4||ship.fire||ship.breach||ship.systems.bridge.hp<=0||shipPerformance(ship).power<=0){delete combat.alliedOrders[id];continue;}
    order.targetIds=order.targetIds.filter(targetId=>alive(combat.contacts[targetId])&&!combat.contacts[targetId].surrendered);
    if(!order.targetIds.length){delete combat.alliedOrders[id];continue;}
    for(const mount of ship.mounts){
      if(mount.weapon==='ciws-30')continue;
      for(const targetId of order.targetIds){
        const component=mount.weapon==='mp-missiles'?'engines':'hull';
        if(!canFire(combat,sector,id,mount.id,targetId,component)){fireWeapon(combat,sector,id,mount.id,targetId,component,rng);break;}
      }
    }
  }
}
function engagementAims(combat,id,objective){
  const ship=combat.contacts[id];
  if(!ship||ship.surrendered)return [];
  if(objective==='disable')return ship.systems.hull.hp<=0?[]:['engines','weapons'].filter(aim=>aimPointState(ship,aim).available);
  return ['hull','reactor','power','engines','weapons','sensors','jammer','epd','bridge','communications','life-support'].filter(aim=>aimPointState(ship,aim).available);
}
function planEngagement(combat,sector){
  const order=combat.engagement;if(!order)return;
  const manual=(combat.firing||[]).filter(f=>order.overrides.includes(f.mountId));
  const automatic=[];
  for(const mount of combat.own.mounts){
    // Point defense stays available for incoming missiles.
    if(order.overrides.includes(mount.id)||mount.weapon==='ciws-30')continue;
    for(const id of order.targetIds){
      const component=engagementAims(combat,id,order.objective).find(aim=>!canFire(combat,sector,'own',mount.id,id,aim,{ignoreCooldown:true}));
      if(component){automatic.push({mountId:mount.id,targetId:id,component});break;}
    }
  }
  combat.firing=[...manual,...automatic];if(!combat.firing.length)combat.firing=null;
  if(order.targetIds.every(id=>!engagementAims(combat,id,order.objective).length)){combat.engagement=null;log(combat,`Automatic ${order.objective} objective complete.`);}
}
export function queueRepair(combat,systemId,automatic=false){
  const ship=combat.own,s=ship.systems[systemId],cap=systemId==='hull'?.6:.75;
  if(!alive(ship)||combat.service||!s||s.hp<=0||s.hp>=s.max*cap||ship.spares<1||ship.jobs.some(j=>j.systemId===systemId))return false;
  const job={systemId,progress:0,station:false};
  if(automatic){job.automatic=true;ship.jobs.push(job);}
  else {
    ship.repairHolds=ship.repairHolds.filter(id=>id!==systemId);
    const firstAuto=ship.jobs.findIndex(j=>j.automatic);
    ship.jobs.splice(firstAuto<0?ship.jobs.length:firstAuto,0,job);
  }
  return true;
}
export function scheduleRepairs(combat){
  const ship=combat.own;if(!ship.autoRepair||!alive(ship)||combat.service||ship.spares<1)return;
  const priority=['hull','life-support','reactor','power',...Object.keys(ship.systems).filter(id=>id.startsWith('engine-'))];
  for(const id of new Set([...priority,...Object.keys(ship.systems)]))if(!ship.repairHolds.includes(id))queueRepair(combat,id,true);
}
export function setAutomaticRepairs(combat,enabled){
  const ship=combat.own;ship.autoRepair=!!enabled;
  if(enabled){ship.repairHolds=[];scheduleRepairs(combat);}
  else ship.jobs=ship.jobs.filter(job=>!job.automatic);
}
export function cancelRepair(combat,systemId){
  const ship=combat.own;
  if(!ship.jobs.some(job=>job.systemId===systemId&&!job.station))return false;
  ship.jobs=ship.jobs.filter(job=>job.systemId!==systemId);
  if(!ship.repairHolds.includes(systemId))ship.repairHolds.push(systemId);
  return true;
}
function repairStep(combat,seconds){
  const ship=combat.own;if(!alive(ship))return;
  const incomplete=j=>{const s=ship.systems[j.systemId],cap=j.station&&combat.service?.full?1:j.systemId==='hull'?.6:.75;return s&&s.hp<s.max*cap&&(j.station||s.hp>0);};
  let remaining=seconds;
  while(remaining>1e-8){
    ship.jobs=ship.jobs.filter(incomplete);
    const jobs=ship.jobs.filter(j=>j.station||ship.spares>0).slice(0,ship.teams);if(!jobs.length)break;
    const rate=(combat.service?50:ship.underFireUntil>combat.time?5:10)/60;
    const chunk=j=>Math.min(5,ship.systems[j.systemId].max*(j.station&&combat.service?.full?1:j.systemId==='hull'?.6:.75)-ship.systems[j.systemId].hp);
    const dt=Math.min(remaining,...jobs.map(j=>Math.max(0,(chunk(j)-j.progress)/rate)));
    for(const job of jobs)job.progress+=dt*rate;remaining-=dt;
    for(const job of jobs)if(job.progress+1e-8>=chunk(job)&&(job.station||ship.spares>0)){
      const points=chunk(job);ship.systems[job.systemId].hp+=points;job.progress=0;if(!job.station)ship.spares--;
    }
    if(dt===0&&!jobs.some(j=>j.progress===0))break;
  }
  ship.jobs=ship.jobs.filter(incomplete);
  if(combat.service&&!ship.jobs.length){
    combat.service.remaining-=remaining;
    if(combat.service.remaining<=0){
      ship.spares=combat.service.full?ship.maxSpares:Math.max(ship.spares,Math.floor(ship.maxSpares/2));
      for(const weapon of Object.keys(ship.ammo))if(combat.service.full||!weapons[weapon].missile)ship.ammo[weapon]=ship.maxAmmo[weapon];
      ship.fire=false;ship.breach=false;ship.air=1800;combat.service=null;log(combat,'Station service complete · repairs and replenishment finished.');
    }
  }
}
export function advanceMaintenance(combat,seconds){
  if(!Number.isFinite(seconds)||seconds<=0)return;
  scheduleRepairs(combat);
  repairStep(combat,seconds);emergencyStep(combat.own,seconds);
}
function emergencyStep(ship,seconds){
  if(!alive(ship))return;
  if(ship.fire)ship.systems.hull.hp=Math.max(0,ship.systems.hull.hp-seconds*.1);
  if(ship.breach||ship.systems['life-support'].hp<=0||shipPerformance(ship).power===0){ship.air=Math.max(0,ship.air-seconds);if(ship.air===0)ship.systems.hull.hp=0;}
  if(!alive(ship))ship.jobs=[];
}
export function stationSupport(location){
  if(['Moon station','Phobos station','Ganymede station','Titan station','Titania station','Triton station','Heliopause station','Mars colony'].includes(location))return {name:location,full:true};
  if(/^(Alpha|Beta|Gamma|Delta|Epsilon|Zeta|Eta|Theta|Iota|Kappa|Lambda|Mu|Nu|Xi|Omicron|Omega) station$/.test(location))return {name:location,full:false};
  return null;
}
export function dock(combat,sector){
  if(!alive(combat.own)||!stationSupport(sector.location)||Math.hypot(sector.own.x,sector.own.y,sector.own.z)>5||Math.hypot(sector.own.vx,sector.own.vy,sector.own.vz)>10||combat.shots.some(s=>s.targetId==='own')||combat.hostiles.some(id=>alive(combat.contacts[id])&&position(sector,id)&&distance(sector.own,position(sector,id))<=200))return false;
  combat.engagement=null;combat.docked=true;combat.firing=null;sector.order=null;sector.manual.thrust=0;sector.own.vx=sector.own.vy=sector.own.vz=0;sector.running=false;return true;
}
export function requestService(combat,sector){
  const station=stationSupport(sector.location);if(!combat.docked||!station||combat.service)return false;
  combat.service={full:station.full,remaining:60};combat.own.jobs=[];
  combat.own.fire=false;combat.own.breach=false;combat.own.air=1800;
  for(const [systemId,s] of Object.entries(combat.own.systems))if(s.hp<s.max*(station.full?1:systemId==='hull'?.6:.75)&&(station.full||s.hp>0))combat.own.jobs.push({systemId,progress:0,station:true});
  sector.running=true;return true;
}
export function containEmergency(combat,type){
  if(!['fire','breach'].includes(type))return false;
  combat.own[type]=false;return true;
}
function resolveShots(combat,sector,seconds){
  for(const shot of [...combat.shots]){
    if(!combat.shots.includes(shot))continue;
    const target=shot.targetId.startsWith('shot:')?combat.shots.find(s=>s.id===shot.targetId):position(sector,shot.targetId),targetShip=vessel(combat,shot.targetId);
    if(!target||(targetShip&&(!targetable(targetShip)||!aimPointState(targetShip,shot.component).available))||(shot.role==='anti-radiation'&&!radarEmitting(targetShip))||(shot.role==='anti-jammer'&&!jammerEmitting(targetShip))){
      combat.shots=combat.shots.filter(s=>s!==shot);continue;
    }
    if(weapons[shot.weapon].missile){const d=distance(shot,target)||1;for(const [axis,v] of [['x','vx'],['y','vy'],['z','vz']])shot[v]=(target[axis]-shot[axis])/d*weapons[shot.weapon].speed*3600;}
    const r={x:target.x-shot.x,y:target.y-shot.y,z:target.z-shot.z},move={x:shot.vx/3600*seconds,y:shot.vy/3600*seconds,z:shot.vz/3600*seconds};
    const size=move.x**2+move.y**2+move.z**2,t=size?Math.max(0,Math.min(1,(r.x*move.x+r.y*move.y+r.z*move.z)/size)):0;
    const hit=Math.hypot(r.x-move.x*t,r.y-move.y*t,r.z-move.z*t)<=.5;
    shot.x+=move.x;shot.y+=move.y;shot.z+=move.z;shot.remaining-=seconds;
    if(hit){
      if(shot.targetId.startsWith('shot:')){const intercepted=combat.shots.find(s=>s.id===shot.targetId);if(intercepted)flashInterception(combat,intercepted.targetId);combat.shots=combat.shots.filter(s=>s.id!==shot.targetId);log(combat,`${shot.sourceId}: incoming missile intercepted.`);}
      else{const amount=applyDamage(combat,shot.targetId,shot.damage,shot.component,weapons[shot.weapon].penetration);log(combat,`${shot.targetId}: ${amount.toFixed(1)} damage · ${shot.component}.`);}
    }
    if(hit||shot.remaining<=0)combat.shots=combat.shots.filter(s=>s!==shot);
  }
}
function autoCIWS(combat,sector,id,rng){
  const ship=vessel(combat,id),source=position(sector,id);if(!alive(ship)||!source)return;
  for(const mount of ship.mounts.filter(m=>m.weapon==='ciws-30')){
    if(mount.ciwsTarget){
      const threat=combat.shots.find(s=>s.id===mount.ciwsTarget);
      if(!threat||ship.systems[mount.id].hp<=0||shipPerformance(ship).power<=0||distance(source,threat)>weapons['ciws-30'].range){delete mount.ciwsTarget;continue;}
      if(combat.time+1e-8<mount.readyAt)continue;
      delete mount.ciwsTarget;
      if(rng()<.85*condition(ship.systems[mount.id])){flashInterception(combat,id);combat.shots=combat.shots.filter(s=>s!==threat);log(combat,`${id}: ${mount.id} intercepted an incoming missile.`);}
      else log(combat,`${id}: ${mount.id} interception failed.`);
      continue;
    }
    if(!ship.ciwsAuto)continue;
    const assigned=new Set(ship.mounts.map(m=>m.ciwsTarget).filter(Boolean));
    const threat=combat.shots.filter(s=>s.targetId===id&&weapons[s.weapon].missile&&distance(source,s)<=weapons['ciws-30'].range&&!assigned.has(s.id)).sort((a,b)=>distance(source,a)-distance(source,b))[0];
    if(!threat||ship.ammo[mount.weapon]<75||canFire(combat,sector,id,mount.id,threat.id))continue;
    ship.ammo[mount.weapon]-=75;mount.readyAt=combat.time+10+5*rng();mount.ciwsTarget=threat.id;
    log(combat,`${id}: ${mount.id} engaging missile · 75 rounds · 10–15 seconds.`);
  }
}
export function stepCombat(combat,sector,seconds,rng=Math.random){
  if(!Number.isFinite(seconds)||seconds<=0)return;
  combat.time+=seconds;
  planEngagement(combat,sector);
  for(const f of [...(combat.firing||[])]){
    if(!f.targetId.startsWith('shot:')){
      const targetShip=vessel(combat,f.targetId),mount=combat.own.mounts.find(mount=>mount.id===f.mountId);
      if(targetShip&&mount&&!aimPointState(targetShip,f.component).available){
        const next=nextAimPoint(targetShip,mount.weapon,f.component);
        if(next){f.component=next;log(combat,`${f.mountId}: aim advanced to ${next}.`);}
        else{ceaseFiring(combat,[f.mountId]);log(combat,`${f.mountId}: no remaining compatible aim point.`);continue;}
      }
    }
    const error=canFire(combat,sector,'own',f.mountId,f.targetId,f.component);
    if(!error)fireWeapon(combat,sector,'own',f.mountId,f.targetId,f.component,rng);
    else if(error!=='Weapon is reloading.'){ceaseFiring(combat,[f.mountId]);log(combat,`${f.mountId} fire order stopped: ${error}`);}
  }
  alliedSupport(combat,sector,rng);
  const opponents=new Set([...combat.hostiles,...Object.values(combat.alliedOrders).flatMap(order=>order.targetIds)]);
  for(const id of opponents){
    const ship=vessel(combat,id),source=position(sector,id);if(!alive(ship)||!source)continue;
    const targetId=combat.hostiles.includes(id)&&alive(combat.own)?'own':Object.keys(combat.alliedOrders).find(allyId=>combat.alliedOrders[allyId].targetIds.includes(id)&&alive(combat.contacts[allyId]));
    if(!targetId)continue;
    const mount=ship.mounts.find(m=>m.weapon!=='ciws-30'&&!canFire(combat,sector,id,m.id,targetId,m.weapon==='mp-missiles'?'engines':'hull'));
    if(mount)fireWeapon(combat,sector,id,mount.id,targetId,mount.weapon==='mp-missiles'?'engines':mount.weapon==='as-missiles'?'hull':['weapons','engines','hull'][Math.floor(rng()*3)],rng);
  }
  autoCIWS(combat,sector,'own',rng);for(const id of new Set([...opponents,...Object.keys(combat.alliedOrders)]))autoCIWS(combat,sector,id,rng);
  resolveShots(combat,sector,seconds);
  for(const ship of Object.values(combat.contacts))emergencyStep(ship,seconds);
  advanceMaintenance(combat,seconds);
}
