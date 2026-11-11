import { shipTypes, trainingContacts, contactTypes } from './tactical-model.mjs';
import {defaultShipName,playerShipName} from './ship-names.mjs';
import {createBoarding,advanceBoarding,hasDeployedShuttles} from './boarding-model.mjs';

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
  'autocannon-120':{range:30,rpm:20,damage:12,speed:1,penetration:.25,feed:'Continuous ammunition feed · no reload pause',guidance:'Ship radar + laser ranging / targeting'},
  'autocannon-75':{range:20,rpm:40,damage:5,speed:1,penetration:.1,feed:'Continuous ammunition feed · no reload pause',guidance:'Ship radar + laser ranging / targeting'},
  'ciws-30':{range:20,rpm:3000,damage:.1,speed:1,penetration:0,feed:'Belt-fed drum · continuous feed',guidance:'Independent computer, tracking radar and tracking IR per mount'},
  'rail-gun':{range:150,rpm:6,damage:180,speed:10,penetration:.8,guidance:'Ship radar + laser ranging / targeting'},
  'as-missiles':{range:200,rpm:4,damage:160,speed:1,penetration:.5,missile:true,feed:'Ready missile inventory · no reload pause',guidance:'Onboard radar + short-range IR fallback (20 km)'},
  'mp-missiles':{range:80,rpm:7.5,damage:60,speed:1,penetration:.25,missile:true,feed:'Ready missile inventory · no reload pause',guidance:'Onboard radar + short-range IR fallback (20 km)'},
  'gp-missiles':{range:120,rpm:6,damage:90,speed:1,penetration:.35,missile:true,feed:'Ready missile inventory · no reload pause',guidance:'Onboard radar + short-range IR fallback (20 km)'}
};
export const missileRoles={
  'anti-ship':'Anti-ship',precision:'Subsystem strike',aa:'AA · shuttles / fighters / missiles',
  'anti-radiation':'Anti-radiation · radar emitter','anti-jammer':'Anti-jammer · radar jammer'
};

// Display every round in a combined cannon shot without changing combat state.
export function expandProjectileRounds(shots) {
  return shots.flatMap(shot => {
    if (weapons[shot.weapon].missile) return [shot];
    const count = Math.max(1, Math.round(shot.damage / weapons[shot.weapon].damage));
    return Array.from({length: count}, (_, index) => ({...shot, roundIndex: index, roundCount: count}));
  });
}

export const projectileStyles = {
  outgoing: {label: 'Our fire', title: 'Outgoing', color: '#7cffff'},
  incoming: {label: 'Incoming', title: 'Incoming', color: contactTypes.enemy.color},
  hostile: {label: 'Hostile fire', title: 'Hostile', color: contactTypes.enemy.color},
  friendly: {label: 'Friendly fire', title: 'Friendly', color: contactTypes.friendly.color},
  other: {label: 'Unidentified fire', title: 'Unidentified', color: '#ffd166'}
};

// Use observed identity; unseen ship fittings never reveal a firing affiliation.
export function projectileAffiliation(shot, combat, sourceTrack) {
  if (shot.sourceId === 'own') return 'outgoing';
  if (shot.targetId === 'own') return 'incoming';
  if (sourceTrack?.type === 'enemy' || combat.hostiles.includes(shot.sourceId)) return 'hostile';
  if (sourceTrack?.type === 'friendly') return 'friendly';
  return 'other';
}
export const missileOptions={
  'as-missiles':['anti-ship','precision','anti-radiation','anti-jammer'],
  'gp-missiles':['anti-ship','precision','aa','anti-radiation','anti-jammer'],
  // Legacy AA presets and in-flight MP shots remain readable in existing saves.
  'mp-missiles':['precision','aa','anti-radiation','anti-jammer']
};
export const missileVolleySizes=[1,5,10,15];
export const cannonBurstSizes=[1,5,10,20];
export const CANNON_BURST_PAUSE_SECONDS=2;
export const radarBurnThrough={duration:15,cooldown:180};
const subsystemAims=[['engines','Main engines'],['weapons','Weapon mounts'],['ciws','CIWS mounts'],['sensors','Radar / fire control'],['jammer','Radar jammer'],['reactor','Reactor'],['power','Power distribution'],['epd','EPD'],['bridge','Bridge'],['communications','Communications'],['life-support','Life support']];
export function weaponAimOptions(weapon){
  if(weapon==='as-missiles')return [['hull','Hull · heavy strike'],...subsystemAims];
  if(weapon==='mp-missiles')return subsystemAims;
  return [['hull','Hull'],...subsystemAims,...(weapon==='gp-missiles'?[['incoming','Incoming missile · AA']]:[])];
}
const internalAimPoints=new Set(['reactor','power','epd','bridge','communications','life-support']);
export function aimPointState(ship,component){
  if(component==='incoming')return {available:true,destroyed:false,protected:false};
  const systems=!ship?[]:component==='engines'?Object.entries(ship.systems).filter(([id])=>id.startsWith('engine-')).map(([,system])=>system):component==='weapons'||component==='ciws'?ship.mounts.filter(mount=>component==='weapons'||mount.weapon==='ciws-30').map(mount=>ship.systems[mount.id]):[ship.systems[component]].filter(Boolean);
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
function launchRole(weapon,targetId,component,targetShip){
  if(!weapons[weapon].missile)return null;
  if(targetId?.startsWith('shot:'))return 'aa';
  return component==='sensors'?'anti-radiation':component==='jammer'&&jammerEmitting(targetShip)?'anti-jammer':component==='hull'?'anti-ship':'precision';
}
// Hull, spares, repair teams, armor reduction, engines. SDF and pirate engine counts are confirmed.
export const damageClasses={
  'private-yacht':[350,40,1,.05,2],'une-light-cargo':[500,60,1,.08,1],
  'une-cargo':[1200,160,2,.1,2],'une-transport':[900,120,2,.1,2],'une-large-transport':[1800,250,3,.15,4],
  privateer:[850,120,2,.2,2],'pirate-corvette':[550,60,1,.18,2],'pirate-frigate':[900,100,2,.25,2],
  'sdf-frigate':[1000,200,2,.3,2],'sdf-destroyer':[1500,300,3,.35,2],
  'sdf-cruiser':[2400,500,4,.4,2],'sdf-heavy-cruiser':[3600,750,5,.45,3],
  'spf-logistics-tender':[1200,400,4,.15,2]
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
  return {classId,...(player?{name:defaultShipName(classId)}:{}),systems,mounts,ammo,maxAmmo:{...ammo},roles,spares,maxSpares:spares,teams,armor,
    radar:true,jammer:false,jammerMode:'auto',burnThroughUntil:0,burnThroughReadyAt:0,ciwsAuto:true,surrendered:false,combatResponse:null,underMissileFireUntil:0,jobs:[],autoRepair:player,repairHolds:[],fire:false,breach:false,air:1800,underFireUntil:0};
}
export function createCombat(contacts=trainingContacts){
  return {time:0,ciwsFeedVersion:1,own:createDamageShip('sdf-frigate',true),contacts:Object.fromEntries(contacts.map(c=>[c.id,createDamageShip(c.shipType)])),
    shots:[],nextShot:1,missileVolleySize:1,cannonBurstSize:5,firing:null,hostiles:[],alliedOrders:{},docked:false,service:null,support:null,boarding:createBoarding({classId:'sdf-frigate'}),log:['Weapons safed · select a weapon and aim system before firing.']};
}
export function changeEncounter(combat,contacts){
  if(hasDeployedShuttles(combat))return false;
  for(const mount of combat.own.mounts)delete mount.burst;
  combat.contacts=Object.fromEntries(contacts.map(c=>[c.id,createDamageShip(c.shipType)]));
  combat.engagement=null;combat.shots=[];combat.firing=null;combat.hostiles=[];combat.alliedOrders={};combat.docked=false;combat.service=null;combat.support=null;
  combat.own.jobs=combat.own.jobs.filter(j=>!j.station);
  combat.own.burnThroughUntil=0;if(combat.own.jammerMode==='auto')combat.own.jammer=false;
  combat.boarding={...createBoarding(combat.own),reports:combat.boarding?.reports.map(({targetId,...notice})=>notice)??[],nextReport:combat.boarding?.nextReport??1};
}
export function condition(system){const ratio=system.hp/system.max;return ratio>.7?1:ratio>=.4?.7:ratio>0?.35:0;}
export function ciwsFiringTime(ship,mount,rounds=75){
  const roundsPerSecond=weapons['ciws-30'].rpm/60*mount.barrels*condition(ship.systems[mount.id]);
  return roundsPerSecond?rounds/roundsPerSecond:0;
}
const ciwsCycling='CIWS firing · belt feed cycling.';
const weaponCycling='Weapon firing cycle.',missileCycling='Missile launch sequence cycling.';
const cannonBurstCycling='Cannon burst in progress.';
const jammingError='Radar jamming prevents a precision lock · target the jammer or use radar burn-through.';
function engageCIWS(combat,ship,mount,targetId,sourceId){
  const rounds=Math.min(75,ship.ammo[mount.weapon]),duration=ciwsFiringTime(ship,mount,rounds);
  ship.ammo[mount.weapon]-=rounds;mount.readyAt=combat.time+duration;mount.ciwsTarget=targetId;mount.ciwsRounds=rounds;
  log(combat,`${sourceId}: ${mount.id} firing belt-fed CIWS · ${rounds} rounds · ${duration.toFixed(2)} seconds.`);
}
export function shipPerformance(ship){
  if(!alive(ship))return {engines:0,sensors:0,power:0,epd:false};
  const power=condition(ship.systems.reactor)*condition(ship.systems.power);
  const engines=Object.entries(ship.systems).filter(([id])=>id.startsWith('engine-')).map(([,s])=>condition(s));
  return {engines:engines.reduce((a,b)=>a+b,0)/engines.length*power,
    sensors:condition(ship.systems.sensors)*(power||.2),power,epd:power>0&&ship.systems.epd.hp>0};
}
export const radarEmitting=ship=>!!ship?.radar&&ship.systems.sensors.hp>0&&shipPerformance(ship).power>0;
export const jammerEmitting=ship=>!!ship?.jammer&&!ship.surrendered&&ship.systems.jammer.hp>0&&shipPerformance(ship).power>0;
export function updateElectronicWarfare(combat,sector){
  const engaged=new Set();
  const pair=(a,b)=>{
    const first=vessel(combat,a),second=vessel(combat,b),p=position(sector,a),q=position(sector,b);
    if(p&&q&&alive(first)&&alive(second)&&!first.surrendered&&!second.surrendered&&distance(p,q)<=200){engaged.add(a);engaged.add(b);}
  };
  for(const id of combat.hostiles)pair('own',id);
  const raid=sector.encounter;
  if(raid?.attackTargetId)for(const id of raid.hostileIds)if(combat.hostiles.includes(id))pair(raid.attackTargetId,id);
  for(const id of combat.engagement?.targetIds??[])pair('own',id);
  for(const order of combat.firing??[])pair('own',order.targetId);
  for(const [id,order] of Object.entries(combat.alliedOrders))for(const targetId of order.targetIds)pair(id,targetId);
  for(const shot of combat.shots)pair(shot.sourceId,shot.targetId);
  for(const [id,ship] of [['own',combat.own],...Object.entries(combat.contacts)])for(const mount of ship.mounts)if(mount.burst)pair(id,mount.burst.targetId);
  for(const [id,ship] of [['own',combat.own],...Object.entries(combat.contacts)]){
    if(ship.combatResponse?.mode==='retreating')engaged.add(id);
    if(ship.jammerMode==='auto')ship.jammer=engaged.has(id);
    else if(ship.jammerMode==='on')ship.jammer=true;
    else if(ship.jammerMode==='off')ship.jammer=false;
    if(ship.surrendered||!alive(ship)||ship.systems.jammer.hp<=0||shipPerformance(ship).power<=0)ship.jammer=false;
  }
}
export function setJammerMode(combat,sector,mode){
  if(!['auto','on','off'].includes(mode))return false;
  combat.own.jammerMode=mode;updateElectronicWarfare(combat,sector);
  log(combat,mode==='on'?'Radar jammer emitting · visible to passive receivers even outside normal radar coverage.':mode==='off'?'Radar jammer held silent.':'Radar jammer automatic · combat only, silent during routine traffic.');
  return true;
}
export function trackingSolution(combat,sector,sourceId,targetId){
  const source=vessel(combat,sourceId),target=vessel(combat,targetId),p=position(sector,sourceId),q=position(sector,targetId);
  if(!source||!target||!p||!q)return {detected:false,precision:false,quality:0,strength:0,emitting:false,status:'No sensor contact'};
  const perf=shipPerformance(source),range=distance(p,q),emitting=jammerEmitting(target);
  const coverage=sourceId==='own'?(sector.sensorRange??(source.radar?200:60)*perf.sensors):(source.radar?200:60)*perf.sensors;
  const detected=perf.sensors>0&&(range<=coverage||emitting&&range<=200*perf.sensors);
  const burn=radarEmitting(source)&&(source.burnThroughUntil??0)>combat.time;
  const strength=detected&&emitting&&!burn?condition(target.systems.jammer)*shipPerformance(target).power*range/(range+40*Math.max(.1,perf.sensors)):0;
  const precision=detected&&range<=coverage&&strength<.65,quality=detected?Math.max(.05,1-strength):0;
  return {detected,precision,quality,strength,emitting,detectionRange:emitting?Math.max(coverage,200*perf.sensors):coverage,behavior:target.combatResponse?.mode??null,status:!detected?'No sensor contact':!precision?'JAMMED · emitter bearing only':burn?'Radar burn-through tracking':strength>.1?'Tracking degraded by radar jammer':'Clear tracking'};
}
export function syncElectronicTracking(combat,sector){
  updateElectronicWarfare(combat,sector);
  sector.tracking=Object.fromEntries(sector.contacts.map(contact=>[contact.id,trackingSolution(combat,sector,'own',contact.id)]));
}
export function burnThroughError(combat){
  if(!radarEmitting(combat.own))return 'Burn-through requires operational active radar and main power.';
  if(combat.docked||combat.service?.provider==='tender')return 'Undock or disconnect the tender before radar burn-through.';
  if((combat.own.burnThroughUntil??0)>combat.time)return 'Radar burn-through already active.';
  if((combat.own.burnThroughReadyAt??0)>combat.time)return `Radar cooling · ${Math.ceil(combat.own.burnThroughReadyAt-combat.time)} s before another burn-through.`;
  return null;
}
export function requestRadarBurnThrough(combat){
  const error=burnThroughError(combat);if(error)return {ok:false,message:error};
  combat.own.burnThroughUntil=combat.time+radarBurnThrough.duration;
  combat.own.burnThroughReadyAt=combat.time+radarBurnThrough.cooldown;
  const message=`High-power radar burn-through · ${radarBurnThrough.duration} s tracking pulse · ${radarBurnThrough.cooldown} s between uses.`;
  log(combat,message);return {ok:true,message};
}
export function infraredTrackingQuality(ship,range){
  return alive(ship)&&range<=20?shipPerformance(ship).power*Math.max(0,1-range/25):0;
}
export function applyDamage(combat,id,damage,component='hull',penetration=0){
  const ship=vessel(combat,id);if(!targetable(ship)||!aimPointState(ship,component).available||!Number.isFinite(damage)||damage<=0)return 0;
  const wasAlive=alive(ship);
  const amount=damage*(1-ship.armor*(1-penetration));
  ship.systems.hull.hp=Math.max(0,ship.systems.hull.hp-amount);
  const candidate=Object.keys(ship.systems).filter(key=>key!=='hull');
  const key=component==='engines'?candidate.find(k=>k.startsWith('engine-')&&ship.systems[k].hp>0):component==='weapons'||component==='ciws'?candidate.find(k=>ship.mounts.some(m=>m.id===k&&(component==='weapons'||m.weapon==='ciws-30'))&&ship.systems[k].hp>0):component;
  // Hull and equipment measure different effects of the same penetrating hit.
  if(key!=='hull'&&ship.systems[key])ship.systems[key].hp=Math.max(0,ship.systems[key].hp-amount*.3);
  ship.underFireUntil=combat.time+30;
  if(ship.systems.hull.hp<ship.systems.hull.max*.5)ship.breach=true;
  if((key==='reactor'||key==='power')&&ship.systems[key].hp<ship.systems[key].max*.4)ship.fire=true;
  if(wasAlive&&!alive(ship)){ship.jobs=[];log(combat,`${id==='own'?playerShipName(combat):id}: hull breached · disabled · internal systems exposed.`);}
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
export function canFire(combat,sector,sourceId,mountId,targetId,component='hull',{ignoreCooldown=false,continuingBurst=false}={}){
  const ship=vessel(combat,sourceId),mount=ship?.mounts.find(m=>m.id===mountId),source=position(sector,sourceId);
  if(!alive(ship)||!mount||!source)return 'Weapon unavailable.';
  if(ship.surrendered)return 'Vessel has surrendered · weapons secured.';
  if(ship.combatResponse?.mode==='retreating'&&!(mount?.weapon==='ciws-30'&&targetId?.startsWith('shot:')))return 'Vessel is disengaging · offensive fire ceased.';
  if(sourceId==='own'&&combat.docked)return 'Undock before firing.';
  const spec=weapons[mount.weapon],role=launchRole(mount.weapon,targetId,component,vessel(combat,targetId));
  if(mount.weapon==='mp-missiles'&&(component==='hull'||targetId?.startsWith('shot:')))return 'MP missiles target ship subsystems only.';
  if(mount.weapon==='as-missiles'&&targetId?.startsWith('shot:'))return 'AS missiles target ships and ship systems only.';
  if(!weaponAimOptions(mount.weapon).some(([id])=>id===component))return 'Select a valid aim system for this weapon.';
  if(ship.systems[mountId].hp<=0||shipPerformance(ship).power<=0)return 'Mount or main power is offline.';
  if(sourceId==='own'&&combat.service?.provider==='tender'&&mount.weapon!=='ciws-30')return 'Repair tender connected · cancel tender service before firing.';
  if(ship.ammo[mount.weapon]<=0)return 'Ammunition depleted · replenish at a station or request a resupply / repair ship.';
  if(!ignoreCooldown&&!continuingBurst&&mount.burst)return cannonBurstCycling;
  if(!ignoreCooldown&&mount.readyAt>combat.time+1e-8)return mount.weapon==='ciws-30'?ciwsCycling:spec.missile?missileCycling:weaponCycling;
  if(!spec.missile&&mount.weapon!=='ciws-30'&&(!ship.radar||shipPerformance(ship).sensors<=0))return 'Turret fire requires ship radar and laser fire control.';
  const threat=targetId?.startsWith('shot:')?combat.shots.find(s=>s.id===targetId):null;
  const target=threat||position(sector,targetId),targetShip=threat?null:vessel(combat,targetId);
  if(!target || (threat?threat.sourceId===sourceId||!weapons[threat.weapon].missile:!targetable(targetShip)))return 'No valid live target.';
  if(!threat){
    const aim=aimPointState(targetShip,component);
    if(aim.destroyed)return 'Aim point destroyed · select another system.';
    if(aim.protected)return 'Internal system protected by hull · reduce hull to 0 first.';
  }
  if(distance(source,target)>spec.range)return 'Target is outside weapon range.';
  if(!threat&&mount.weapon!=='ciws-30'){
    const track=trackingSolution(combat,sector,sourceId,targetId);
    if(!track.detected)return 'No live acquisition track in sensor coverage.';
    if(!ignoreCooldown&&!track.precision&&role!=='anti-jammer'&&!(spec.missile&&infraredTrackingQuality(targetShip,distance(source,target))>0))return jammingError;
  }
  if(threat&&mount.weapon!=='gp-missiles'&&mount.weapon!=='ciws-30')return 'Use GP missiles or CIWS against incoming missiles.';
  if(role==='anti-radiation'&&!radarEmitting(targetShip))return 'Target radar is not emitting.';
  if(role==='anti-jammer'&&!jammerEmitting(targetShip))return 'Target jammer is not emitting.';
  return null;
}
function dischargeWeapon(combat,sector,sourceId,mountId,targetId,component='hull',rng=Math.random,volleySize=1,cannonBurstSize=1,continuingBurst=false){
  if(!missileVolleySizes.includes(volleySize))return {ok:false,message:'Choose a missile volley of 1, 5, 10, or 15.'};
  if(!cannonBurstSizes.includes(cannonBurstSize))return {ok:false,message:'Choose a cannon burst of 1, 5, 10, or 20.'};
  const error=canFire(combat,sector,sourceId,mountId,targetId,component,{continuingBurst});if(error)return {ok:false,message:error};
  const ship=vessel(combat,sourceId),mount=ship.mounts.find(m=>m.id===mountId),spec=weapons[mount.weapon],source=position(sector,sourceId);
  const target=targetId.startsWith('shot:')?combat.shots.find(s=>s.id===targetId):position(sector,targetId);
  const plan=intercept(source,{...target,vx:target.vx??0,vy:target.vy??0,vz:target.vz??0},spec.speed);
  if(!plan)return {ok:false,message:'No intercept solution.'};
  if(mount.weapon==='ciws-30'&&targetId.startsWith('shot:')){
    engageCIWS(combat,ship,mount,targetId,sourceId);
    return {ok:true,message:'CIWS engaging missile.'};
  }
  const autocannon=mount.weapon.startsWith('autocannon-');
  if(autocannon&&!continuingBurst)mount.burst={targetId,component,total:cannonBurstSize,remaining:cannonBurstSize};
  const rounds=Math.min(spec.missile?volleySize:autocannon?1:(mount.weapon==='ciws-30'?10:1)*mount.barrels,ship.ammo[mount.weapon]);
  ship.ammo[mount.weapon]-=rounds;mount.readyAt=combat.time+60/spec.rpm*(rounds/mount.barrels)/condition(ship.systems[mountId]);
  const burstTotal=mount.burst?.total,burstRound=autocannon?burstTotal-(--mount.burst.remaining):0;
  if(autocannon&&(!mount.burst.remaining||!ship.ammo[mount.weapon])){
    delete mount.burst;
    const repeating=sourceId==='own'?(combat.firing??[]).some(order=>order.mountId===mountId):combat.hostiles.includes(sourceId)||!!combat.alliedOrders[sourceId];
    if(repeating)mount.readyAt+=CANNON_BURST_PAUSE_SECONDS;
  }
  const role=launchRole(mount.weapon,targetId,component,vessel(combat,targetId));
  const tracking=mount.weapon==='ciws-30'?condition(ship.systems[mountId]):spec.missile?1:shipPerformance(ship).sensors;
  const targetShip=targetId.startsWith('shot:')?null:vessel(combat,targetId);
  const jamming=mount.weapon==='ciws-30'||!targetShip||role==='anti-jammer'?1:Math.max(trackingSolution(combat,sector,sourceId,targetId).quality,spec.missile?infraredTrackingQuality(targetShip,distance(source,target)):0);
  const hitChance=Math.max(.05,(.95-.25*distance(source,target)/spec.range)*tracking*jamming);
  const guided=spec.missile;
  // All projectiles retain launch momentum. Missile cruise speed is additional
  // velocity in this fixed launch frame, not an absolute sector-speed cap.
  const velocity=plan.velocity,launchVelocity=Object.fromEntries(['vx','vy','vz'].map(axis=>[axis,source[axis]??0]));
  // Each missile has its own hit assessment, warhead and CIWS interception track.
  let hits=0;
  for(let i=0;i<(guided?rounds:1);i++){
    if(rng()>=hitChance)continue;
    hits++;
    combat.shots.push({id:`shot:${combat.nextShot++}`,sourceId,targetId,weapon:mount.weapon,role,component:role==='anti-radiation'?'sensors':role==='anti-jammer'?'jammer':component,
      damage:spec.damage*(guided?1:rounds),x:source.x,y:source.y,z:source.z,vx:velocity.x*3600,vy:velocity.y*3600,vz:velocity.z*3600,remaining:Math.max(.25,plan.time*2+1),...(guided?{launchVelocity:{...launchVelocity}}:{})});
  }
  if(hits&&sourceId==='own'&&!targetId.startsWith('shot:')&&targetId!=='own'&&!combat.hostiles.includes(targetId))combat.hostiles.push(targetId);
  const message=guided?`${rounds}-missile volley fired · ${rounds-hits} missed.`:autocannon?`Cannon round ${burstRound}/${burstTotal} fired${hits?'.':' · miss.'}`:hits?'Weapon fired.':'Weapon fired · miss.';
  log(combat,`${sourceId}: ${mount.weapon}${role?` / ${missileRoles[role]}`:''} · ${message}`);
  return {ok:true,message};
}
export function fireWeapon(combat,sector,sourceId,mountId,targetId,component='hull',rng=Math.random,volleySize=1,cannonBurstSize=1){
  return dischargeWeapon(combat,sector,sourceId,mountId,targetId,component,rng,volleySize,cannonBurstSize);
}
function advanceCannonBursts(combat,sector,rng){
  for(const [sourceId,ship] of [['own',combat.own],...Object.entries(combat.contacts)])for(const mount of ship.mounts){
    const burst=mount.burst;if(!burst||mount.readyAt>combat.time+1e-8)continue;
    const target=vessel(combat,burst.targetId);
    if(!aimPointState(target,burst.component).available){
      const next=nextAimPoint(target,mount.weapon,burst.component);
      if(!next){delete mount.burst;continue;}burst.component=next;
    }
    if(sourceId!=='own'&&ship.classId.startsWith('pirate-')){
      const suppress=suppressionAims(target,mount.weapon);if(suppress?.length)burst.component=suppress[0];
    }
    const result=dischargeWeapon(combat,sector,sourceId,mount.id,burst.targetId,burst.component,rng,1,burst.total,true);
    if(!result.ok&&result.message!==jammingError){delete mount.burst;log(combat,`${sourceId}: ${mount.id} burst stopped: ${result.message}`);}
  }
}
export function startFiring(combat,sector,mountId,targetId,component){
  const error=canFire(combat,sector,'own',mountId,targetId,component,{ignoreCooldown:true});if(error)return {ok:false,message:error};
  const orders=combat.firing||[];
  delete combat.own.mounts.find(m=>m.id===mountId).burst;
  combat.firing=[...orders.filter(order=>order.mountId!==mountId),{mountId,targetId,component}];
  return {ok:true,message:'Fire order active · run local time to fire.'};
}
export function ceaseFiring(combat,mountIds=null){
  for(const mount of combat.own.mounts)if(!mountIds||mountIds.includes(mount.id))delete mount.burst;
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
    if(!continuous&&!canFire(combat,sector,'own',order.mountId,order.targetId,order.component))ceaseFiring(combat,[order.mountId]);
    const result=continuous?startFiring(combat,sector,order.mountId,order.targetId,order.component):fireWeapon(combat,sector,'own',order.mountId,order.targetId,order.component,rng,combat.missileVolleySize,combat.cannonBurstSize);
    results.push({mountId:order.mountId,...result});
  }
  const count=results.filter(result=>result.ok).length,skipped=results.filter(result=>!result.ok);
  return {ok:count>0,results,message:`${count} weapon${count===1?'':'s'} ${continuous?'ordered to fire':'fired'}${skipped.length?` · ${skipped.length} skipped: ${skipped.map(result=>`${result.mountId}: ${result.message}`).join('; ')}`:''}.`};
}
export function orderEngagement(combat,sector,objective,targetIds){
  // Older objective IDs remain valid for saved patrols.
  if(!['engage','disable','destroy'].includes(objective)||!targetIds.length)return {ok:false,message:'Lock targets and set priorities first.'};
  if(objective==='engage'&&!targetIds.some(id=>engagementAims(combat,id,objective).length))return {ok:false,message:'Selected ships have surrendered or have no remaining offensive capability.'};
  ceaseFiring(combat);
  combat.engagement={objective,targetIds:[...new Set(targetIds)],overrides:[]};
  updateElectronicWarfare(combat,sector);
  planEngagement(combat,sector);
  return {ok:true,message:objective==='engage'?'Engaging ships in priority order · stop on surrender or loss of offensive capability.':`Automatic ${objective} order active · manual weapon commands override individual mounts.`};
}
export function orderAlliedSupport(combat,sector,id,mode,targetIds){
  const contact=sector.contacts.find(c=>c.id===id),ship=combat.contacts[id];
  const refuse=message=>({accepted:false,message});
  if(contact?.type!=='friendly'||!ship?.classId.startsWith('sdf-'))return refuse('Only friendly SDF ships can receive these commands.');
  if(combat.hostiles.includes(id)||ship.surrendered)return refuse('Request refused. We are not accepting your combat orders.');
  if(mode==='stand-down'){delete combat.alliedOrders[id];for(const mount of ship.mounts)delete mount.burst;return {accepted:true,message:'Acknowledged. Standing down from your support order. Weapons already in flight cannot be recalled.'};}
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
    if(!alive(ship)||ship.surrendered||combat.hostiles.includes(id)||ship.systems.hull.hp/ship.systems.hull.max<=.4||ship.fire||ship.breach||ship.systems.bridge.hp<=0||shipPerformance(ship).power<=0){delete combat.alliedOrders[id];for(const mount of ship.mounts)delete mount.burst;continue;}
    order.targetIds=order.targetIds.filter(targetId=>alive(combat.contacts[targetId])&&!combat.contacts[targetId].surrendered);
    if(!order.targetIds.length){delete combat.alliedOrders[id];for(const mount of ship.mounts)delete mount.burst;continue;}
    for(const mount of ship.mounts){
      if(mount.weapon==='ciws-30')continue;
      for(const targetId of order.targetIds){
        const component=mount.weapon==='mp-missiles'?'engines':'hull';
        if(!canFire(combat,sector,id,mount.id,targetId,component)){fireWeapon(combat,sector,id,mount.id,targetId,component,rng,1,mount.weapon.startsWith('autocannon-')?5:1);break;}
      }
    }
  }
}
function engagementAims(combat,id,objective){
  const ship=combat.contacts[id];
  if(!ship||ship.surrendered)return [];
  if(objective==='engage')return offensiveReadiness(ship).power>0?['weapons','engines','hull'].filter(aim=>aimPointState(ship,aim).available):[];
  if(objective==='disable')return ship.systems.hull.hp<=0?[]:['engines','weapons'].filter(aim=>aimPointState(ship,aim).available);
  return ['hull','reactor','power','engines','weapons','sensors','jammer','epd','bridge','communications','life-support'].filter(aim=>aimPointState(ship,aim).available);
}
export function standDownAgainst(combat,id){
  for(const [sourceId,ship] of [['own',combat.own],...Object.entries(combat.contacts)])for(const mount of ship.mounts)if(sourceId===id||mount.burst?.targetId===id)delete mount.burst;
  combat.hostiles=combat.hostiles.filter(target=>target!==id);
  const firing=(combat.firing??[]).filter(order=>order.targetId!==id);combat.firing=firing.length?firing:null;
  if(combat.engagement){combat.engagement.targetIds=combat.engagement.targetIds.filter(target=>target!==id);if(!combat.engagement.targetIds.length)combat.engagement=null;}
  delete combat.alliedOrders[id];
  for(const [allyId,order] of Object.entries(combat.alliedOrders)){
    order.targetIds=order.targetIds.filter(target=>target!==id);if(!order.targetIds.length)delete combat.alliedOrders[allyId];
  }
}
function responseNotice(ship,type,time){
  if(!ship.combatResponse.notices.some(notice=>notice.type===type))ship.combatResponse.notices.push({type,time,reported:false});
}
export function surrenderShip(combat,id,reason='Surrender demand accepted',opponentId='own',announced=false){
  const ship=combat.contacts[id];if(!ship||ship.surrendered)return false;
  const notices=ship.combatResponse?.notices??[];
  ship.surrendered=true;ship.radar=false;ship.jammer=false;ship.ciwsAuto=false;
  ship.combatResponse={mode:'surrendered',reason,since:combat.time,opponentId,blockedFor:0,bestRange:0,contactLost:false,notices};
  responseNotice(ship,'surrender',combat.time);
  ship.combatResponse.notices.find(notice=>notice.type==='surrender').reported=announced;
  standDownAgainst(combat,id);log(combat,`${id}: SURRENDERED · ${reason}. Weapons secured; existing projectiles remain in flight.`);
  return true;
}
function offensiveReadiness(ship){
  const mounts=ship.mounts.filter(m=>m.weapon!=='ciws-30');
  const working=mounts.filter(m=>ship.systems[m.id].hp>0&&ship.ammo[m.weapon]>0);
  const stocked=[...new Set(mounts.map(m=>m.weapon))];
  return {weak:!working.length||working.length<=mounts.length/3||stocked.length>0&&stocked.every(w=>ship.ammo[w]<=ship.maxAmmo[w]*.1),
    power:working.reduce((sum,m)=>sum+weapons[m.weapon].damage*weapons[m.weapon].rpm*m.barrels*condition(ship.systems[m.id]),0)*shipPerformance(ship).power};
}
export function canContinueAttack(ship){
  return alive(ship)&&!ship.surrendered&&ship.combatResponse?.mode!=='retreating'&&offensiveReadiness(ship).power>0;
}
function resolveNerve(id){let hash=0;for(const c of id)hash=(Math.imul(hash,31)+c.charCodeAt(0))>>>0;return (hash%11-5)/100;}
export function updateEnemyResolve(combat,sector,seconds=0){
  for(const contact of sector.contacts){
    const id=contact.id,ship=combat.contacts[id];
    if(!ship||ship.surrendered||contact.type!=='enemy'&&!combat.hostiles.includes(id))continue;
    const attackers=new Set();
    if(combat.hostiles.includes(id)||combat.engagement?.targetIds.includes(id)||(combat.firing??[]).some(f=>f.targetId===id)||combat.own.mounts.some(m=>m.burst?.targetId===id))attackers.add('own');
    for(const [allyId,order] of Object.entries(combat.alliedOrders))if(order.targetIds.includes(id))attackers.add(allyId);
    for(const shot of combat.shots)if(shot.targetId===id&&!shot.sourceId.startsWith('shot:'))attackers.add(shot.sourceId);
    const opponentId=[...attackers].filter(key=>alive(vessel(combat,key))&&!vessel(combat,key).surrendered&&position(sector,key))
      .sort((a,b)=>distance(contact,position(sector,a))-distance(contact,position(sector,b)))[0]??(ship.combatResponse?.mode==='retreating'?ship.combatResponse.opponentId:null);
    const opponent=vessel(combat,opponentId),threat=position(sector,opponentId);if(!opponent||!threat)continue;
    const range=distance(contact,threat),hull=ship.systems.hull.hp/ship.systems.hull.max,performance=shipPerformance(ship),offense=offensiveReadiness(ship);
    const direction={x:(contact.x-threat.x)/(range||1),y:(contact.y-threat.y)/(range||1),z:(contact.z-threat.z)/(range||1)};if(!range)direction.x=1;
    const opening=['x','y','z'].reduce((sum,axis)=>sum+direction[axis]*((contact[{x:'vx',y:'vy',z:'vz'}[axis]]??0)-(threat[{x:'vx',y:'vy',z:'vz'}[axis]]??0)),0);
    const outwardSpeed=['x','y','z'].reduce((sum,axis)=>sum+direction[axis]*(contact[{x:'vx',y:'vy',z:'vz'}[axis]]??0),0);
    const canEscape=performance.engines>0||opening>720&&outwardSpeed>720&&range>20;
    const severeEmergency=(ship.fire&&ship.breach||ship.systems['life-support'].hp<=0)&&ship.air<=300;
    const blocked=ship.combatResponse?.mode==='retreating'&&ship.combatResponse.blockedFor>=20;
    const cornered=!canEscape||blocked,critical=hull<=.4||offense.weak||severeEmergency;
    if(cornered&&critical||hull===0){
      surrenderShip(combat,id,severeEmergency?'Critical fire / life-support emergency and no safe escape':offense.weak?'Offensive weapons exhausted or disabled; escape unavailable':'Critical hull damage; escape unavailable',opponentId);continue;
    }
    const defensesGone=ship.mounts.filter(m=>m.weapon==='ciws-30').every(m=>ship.systems[m.id].hp<=0)&&ship.systems.jammer.hp<=0;
    const missilePressure=(ship.underMissileFireUntil??0)>combat.time||combat.shots.filter(s=>s.targetId===id&&weapons[s.weapon].missile).length>=2;
    const threshold=(ship.classId.startsWith('pirate-')?.6:ship.classId.startsWith('sdf-')?.45:.55)+resolveNerve(id);
    const losing=hull<opponent.systems.hull.hp/opponent.systems.hull.max-.15||offensiveReadiness(opponent).power>offense.power*1.1;
    if(!ship.combatResponse&&canEscape&&(hull<=threshold&&losing||offense.weak||defensesGone&&missilePressure||severeEmergency)){
      const reason=severeEmergency?'Critical onboard emergency':offense.weak?'Weapons damaged or ammunition nearly exhausted':defensesGone&&missilePressure?'CIWS and jammer lost under missile attack':'Hull damage and unfavorable odds';
      ship.combatResponse={mode:'retreating',reason,since:combat.time,opponentId,blockedFor:0,bestRange:range,contactLost:false,notices:[]};
      for(const mount of ship.mounts)delete mount.burst;
      responseNotice(ship,'retreat',combat.time);delete combat.alliedOrders[id];log(combat,`${id}: DISENGAGING · ${reason}. Offensive fire ceased; defenses retained.`);
    }
    const response=ship.combatResponse;if(response?.mode!=='retreating')continue;
    if(response.opponentId!==opponentId){response.opponentId=opponentId;response.bestRange=range;response.blockedFor=0;}
    if(range>response.bestRange+.5){response.bestRange=range;response.blockedFor=0;}else response.blockedFor+=seconds;
    const desired={vx:direction.x*7200,vy:direction.y*7200,vz:direction.z*7200};
    const change=Math.hypot(...['vx','vy','vz'].map(v=>desired[v]-contact[v])),fraction=change?Math.min(1,120*performance.engines*seconds/change):0;
    for(const axis of ['vx','vy','vz'])contact[axis]+=(desired[axis]-contact[axis])*fraction;
  }
}
function updateRetreatReports(combat,sector){
  for(const contact of sector.contacts){
    const ship=combat.contacts[contact.id],response=ship.combatResponse;if(response?.mode!=='retreating')continue;
    const lost=!sector.tracking?.[contact.id]?.detected;
    if(lost&&!response.contactLost){responseNotice(ship,'contact-lost',combat.time);log(combat,`${contact.id}: CONTACT LOST while retreating · last-known sensor record retained; escape unconfirmed.`);}
    response.contactLost=lost;
  }
}
function suppressionAims(ship,weapon){
  if(!alive(ship))return null;
  if(aimPointState(ship,'ciws').available)return weapons[weapon].missile?[]:['ciws'];
  if(jammerEmitting(ship))return !weapons[weapon].missile||['mp-missiles','gp-missiles'].includes(weapon)?['jammer']:[];
  return null;
}
function planEngagement(combat,sector){
  const order=combat.engagement;if(!order)return;
  if(order.objective==='engage'){
    for(const id of [...order.targetIds])if(!engagementAims(combat,id,'engage').length){
      standDownAgainst(combat,id);
      log(combat,`${id}: engagement ended · surrendered or no remaining offensive capability.`);
    }
    if(!combat.engagement)return;
  }
  const manual=(combat.firing||[]).filter(f=>order.overrides.includes(f.mountId));
  const automatic=[];
  for(const mount of combat.own.mounts){
    // Point defense stays available for incoming missiles.
    if(order.overrides.includes(mount.id)||mount.weapon==='ciws-30')continue;
    for(const id of order.targetIds){
      const aims=engagementAims(combat,id,order.objective);
      if(!aims.length)continue;
      // Suppress CIWS with guns, then jamming with guns and MP / GP missiles.
      const component=(suppressionAims(combat.contacts[id],mount.weapon)??aims).find(aim=>!canFire(combat,sector,'own',mount.id,id,aim,{ignoreCooldown:true}));
      if(component){automatic.push({mountId:mount.id,targetId:id,component});break;}
    }
  }
  combat.firing=[...manual,...automatic];if(!combat.firing.length)combat.firing=null;
  for(const mount of combat.own.mounts)if(mount.burst&&!order.overrides.includes(mount.id)){
    const assigned=automatic.find(f=>f.mountId===mount.id);
    if(assigned){mount.burst.targetId=assigned.targetId;mount.burst.component=assigned.component;}else delete mount.burst;
  }
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
      const tender=combat.service.provider==='tender';
      ship.fire=false;ship.breach=false;ship.air=1800;combat.service=null;
      if(tender&&combat.support)combat.support.phase='complete';
      log(combat,`${tender?'Repair tender':'Station'} service complete · repairs and ammunition replenishment finished.`);
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
export function supportStatus(combat,sector){
  const support=combat.support;if(!support)return 'No resupply / repair ship requested.';
  if(support.phase==='en-route')return `Repair tender en route · ${Math.max(0,distance(support,sector.own)-2).toFixed(0)} seconds to rendezvous at present position.`;
  if(support.phase==='waiting')return 'Repair tender standing by · hold below 10 KPH and clear hostile threats before service.';
  if(support.phase==='servicing')return 'Repair tender connected · repairs in progress; ammunition transfers after repairs finish.';
  return 'Repair tender service complete · ammunition and spare parts replenished.';
}
export function requestSupportShip(combat,sector){
  if(!alive(combat.own))return {ok:false,message:'A disabled hull cannot be recovered by this tender. Load a save or restart patrol.'};
  if(combat.support&&combat.support.phase!=='complete')return {ok:false,message:supportStatus(combat,sector)};
  if(combat.docked||combat.service)return {ok:false,message:'Use station service while docked, or finish the current service first.'};
  combat.support={phase:'en-route',location:sector.location,x:sector.own.x+180,y:sector.own.y,z:sector.own.z,vx:0,vy:0,vz:0};
  sector.running=true;log(combat,'Resupply / repair tender dispatched to this sector.');
  return {ok:true,message:'Resupply / repair tender dispatched. Estimated rendezvous: 3 simulated minutes at your present position. Hold position and clear threats for repairs and ammunition transfer.'};
}
export function cancelSupportShip(combat){
  if(!combat.support)return false;
  const completed=combat.support.phase==='complete';
  if(combat.service?.provider==='tender'){combat.service=null;combat.own.jobs=combat.own.jobs.filter(job=>!job.station);}
  combat.support=null;log(combat,completed?'Repair tender dismissed.':'Repair tender request cancelled. No ammunition transferred.');return true;
}
function serviceThreats(combat,sector){
  const engaged=new Set([...combat.hostiles,...Object.values(combat.alliedOrders).flatMap(order=>order.targetIds)]);
  return combat.shots.some(shot=>shot.targetId==='own')||[...engaged].some(id=>alive(combat.contacts[id])&&!combat.contacts[id].surrendered&&position(sector,id)&&distance(sector.own,position(sector,id))<=200);
}
function advanceSupportShip(combat,sector,seconds){
  const support=combat.support;if(!support||support.phase==='complete')return;
  if(!alive(combat.own)){cancelSupportShip(combat);return;}
  const speed=Math.hypot(sector.own.vx,sector.own.vy,sector.own.vz),gap=distance(support,sector.own);
  if(support.phase==='en-route'){
    const travel=Math.min(Math.max(0,gap-2),seconds);
    for(const [index,axis] of ['x','y','z'].entries()){
      const direction=gap?(sector.own[axis]-support[axis])/gap:0;
      support[['vx','vy','vz'][index]]=gap>2?direction*3600:0;support[axis]+=direction*travel;
    }
    if(gap-travel<=2.001){support.phase='waiting';support.vx=support.vy=support.vz=0;log(combat,'Repair tender arrived · awaiting safe rendezvous.');}
    return;
  }
  const safe=speed<=10&&gap<=5&&!combat.docked&&!serviceThreats(combat,sector);
  if(support.phase==='servicing'){
    if(!safe){combat.service=null;combat.own.jobs=combat.own.jobs.filter(job=>!job.station);support.phase='waiting';log(combat,'Repair tender service suspended · clear threats and hold position.');}
    return;
  }
  if(support.phase==='waiting'&&gap>5){support.phase='en-route';return;}
  if(!safe||combat.service)return;
  combat.service={provider:'tender',full:true,remaining:60};support.phase='servicing';
  combat.own.jobs=[];combat.own.fire=false;combat.own.breach=false;combat.own.air=1800;
  for(const [systemId,system] of Object.entries(combat.own.systems))if(system.hp<system.max)combat.own.jobs.push({systemId,progress:0,station:true});
  ceaseFiring(combat);sector.order=null;sector.manual.thrust=0;sector.own.vx=sector.own.vy=sector.own.vz=0;
  log(combat,'Repair tender connected · repairing ship before ammunition transfer.');
}
export function dock(combat,sector){
  if(!alive(combat.own)||combat.service?.provider==='tender'||!stationSupport(sector.location)||Math.hypot(sector.own.x,sector.own.y,sector.own.z)>5||Math.hypot(sector.own.vx,sector.own.vy,sector.own.vz)>10||serviceThreats(combat,sector))return false;
  ceaseFiring(combat);combat.docked=true;sector.order=null;sector.manual.thrust=0;sector.own.vx=sector.own.vy=sector.own.vz=0;sector.running=false;return true;
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
function guideMissile(combat,sector,shot){
  if(!weapons[shot.weapon].missile)return;
  const target=shot.targetId.startsWith('shot:')?combat.shots.find(s=>s.id===shot.targetId):position(sector,shot.targetId);if(!target)return;
  // Older in-flight saves did not record the launch frame. Adopt the source
  // vessel's current momentum once, then retain it independently of that ship.
  if(!shot.launchVelocity){const source=position(sector,shot.sourceId);shot.launchVelocity=Object.fromEntries(['vx','vy','vz'].map(axis=>[axis,source?.[axis]??0]));}
  const plan=intercept({...shot,...shot.launchVelocity},target,weapons[shot.weapon].speed),d=distance(shot,target)||1;
  for(const [axis,v] of [['x','vx'],['y','vy'],['z','vz']])shot[v]=plan?plan.velocity[axis]*3600:shot.launchVelocity[v]+(target[axis]-shot[axis])/d*weapons[shot.weapon].speed*3600;
}
export function refreshMissileGuidance(combat,sector){for(const shot of combat.shots)guideMissile(combat,sector,shot);}
function resolveShots(combat,sector,seconds,rng){
  for(const shot of [...combat.shots]){
    if(!combat.shots.includes(shot))continue;
    const target=shot.targetId.startsWith('shot:')?combat.shots.find(s=>s.id===shot.targetId):position(sector,shot.targetId),targetShip=vessel(combat,shot.targetId);
    if(!target||(targetShip&&(!targetable(targetShip)||!aimPointState(targetShip,shot.component).available))||(shot.role==='anti-radiation'&&!radarEmitting(targetShip))||(shot.role==='anti-jammer'&&!jammerEmitting(targetShip))){
      combat.shots=combat.shots.filter(s=>s!==shot);continue;
    }
    guideMissile(combat,sector,shot);
    const r={x:target.x-shot.x,y:target.y-shot.y,z:target.z-shot.z},move={x:shot.vx/3600*seconds,y:shot.vy/3600*seconds,z:shot.vz/3600*seconds};
    const size=move.x**2+move.y**2+move.z**2,t=size?Math.max(0,Math.min(1,(r.x*move.x+r.y*move.y+r.z*move.z)/size)):0;
    const closest=Math.hypot(r.x-move.x*t,r.y-move.y*t,r.z-move.z*t),hit=closest<=.5;
    // One guidance contest when entering the jammer's 40 km terminal envelope.
    // Close launches can fall back to IR; missiles disrupted farther out never reach that opportunity.
    if(targetShip&&weapons[shot.weapon].missile&&shot.role!=='anti-jammer'&&!shot.jammingChecked&&jammerEmitting(targetShip)&&(distance(shot,target)<=40||closest<=40)){
      shot.jammingChecked=true;
      const ir=infraredTrackingQuality(targetShip,Math.min(distance(shot,target),40));
      const disruption=.45*condition(targetShip.systems.jammer)*shipPerformance(targetShip).power*(1-.85*ir);
      if(rng()>=1-disruption){
        combat.shots=combat.shots.filter(s=>s!==shot);log(combat,`${shot.targetId}: radar jammer defeated ${shot.weapon}${ir>0?' despite short-range IR fallback':''} · missile missed completely.`);continue;
      }
    }
    shot.x+=move.x;shot.y+=move.y;shot.z+=move.z;shot.remaining-=seconds;
    if(hit){
      if(shot.targetId.startsWith('shot:')){const intercepted=combat.shots.find(s=>s.id===shot.targetId);if(intercepted)flashInterception(combat,intercepted.targetId);combat.shots=combat.shots.filter(s=>s.id!==shot.targetId);log(combat,`${shot.sourceId}: incoming missile intercepted.`);}
      else{const amount=applyDamage(combat,shot.targetId,shot.damage,shot.component,weapons[shot.weapon].penetration);if(weapons[shot.weapon].missile&&targetShip)targetShip.underMissileFireUntil=combat.time+30;log(combat,`${shot.targetId}: ${amount.toFixed(1)} damage · ${shot.component}.`);}
    }
    if(hit||shot.remaining<=0)combat.shots=combat.shots.filter(s=>s!==shot);
  }
}
function autoCIWS(combat,sector,id,rng){
  const ship=vessel(combat,id),source=position(sector,id);if(!alive(ship)||!source)return;
  for(const mount of ship.mounts.filter(m=>m.weapon==='ciws-30')){
    if(mount.ciwsTarget){
      const threat=combat.shots.find(s=>s.id===mount.ciwsTarget);
      if(!threat||ship.systems[mount.id].hp<=0||shipPerformance(ship).power<=0||distance(source,threat)>weapons['ciws-30'].range){delete mount.ciwsTarget;delete mount.ciwsRounds;continue;}
      if(combat.time+1e-8<mount.readyAt)continue;
      const rounds=mount.ciwsRounds??75;delete mount.ciwsTarget;delete mount.ciwsRounds;
      if(rng()<.85*condition(ship.systems[mount.id])*rounds/75){flashInterception(combat,id);combat.shots=combat.shots.filter(s=>s!==threat);log(combat,`${id}: ${mount.id} intercepted an incoming missile.`);}
      else log(combat,`${id}: ${mount.id} interception failed.`);
    }
    if(!ship.ciwsAuto)continue;
    const assigned=new Set(ship.mounts.map(m=>m.ciwsTarget).filter(Boolean));
    const threat=combat.shots.filter(s=>s.targetId===id&&weapons[s.weapon].missile&&distance(source,s)<=weapons['ciws-30'].range&&!assigned.has(s.id)).sort((a,b)=>distance(source,a)-distance(source,b))[0];
    if(!threat||canFire(combat,sector,id,mount.id,threat.id))continue;
    engageCIWS(combat,ship,mount,threat.id,id);
  }
}
export function stepCombat(combat,sector,seconds,rng=Math.random){
  if(!Number.isFinite(seconds)||seconds<=0)return;
  combat.time+=seconds;
  updateEnemyResolve(combat,sector,seconds);
  syncElectronicTracking(combat,sector);
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
    if(!error)fireWeapon(combat,sector,'own',f.mountId,f.targetId,f.component,rng,combat.missileVolleySize,combat.cannonBurstSize);
    else if(![weaponCycling,missileCycling,ciwsCycling,cannonBurstCycling,jammingError].includes(error)){ceaseFiring(combat,[f.mountId]);log(combat,`${f.mountId} fire order stopped: ${error}`);}
  }
  alliedSupport(combat,sector,rng);
  advanceCannonBursts(combat,sector,rng);
  const opponents=new Set([...combat.hostiles,...Object.values(combat.alliedOrders).flatMap(order=>order.targetIds)]);
  const raid=sector.encounter,protectedShip=raid?.attackTargetId;
  for(const id of opponents){
    const ship=vessel(combat,id),source=position(sector,id);if(!alive(ship)||!source||ship.combatResponse?.mode==='retreating')continue;
    const attacksPlayer=combat.hostiles.includes(id)&&alive(combat.own);
    const ally=Object.keys(combat.alliedOrders).find(allyId=>combat.alliedOrders[allyId].targetIds.includes(id)&&alive(combat.contacts[allyId]));
    const raidTarget=protectedShip&&raid.hostileIds.includes(id)&&combat.hostiles.includes(id)&&alive(vessel(combat,protectedShip));
    const playerEngaged=combat.engagement?.targetIds.includes(id)||combat.firing?.some(order=>order.targetId===id)||combat.shots.some(shot=>shot.sourceId==='own'&&shot.targetId===id);
    const targetId=raidTarget&&!playerEngaged?(ally??protectedShip):attacksPlayer?'own':ally;
    if(!targetId)continue;
    for(const mount of ship.mounts){
      if(mount.weapon==='ciws-30')continue;
      const suppress=ship.classId.startsWith('pirate-')?suppressionAims(vessel(combat,targetId),mount.weapon):null;
      const aims=suppress??(mount.weapon==='mp-missiles'?['engines']:['hull']);
      let component=aims.find(aim=>!canFire(combat,sector,id,mount.id,targetId,aim));
      if(!component)continue;
      if(targetId!==protectedShip&&!suppress&&!['mp-missiles','as-missiles'].includes(mount.weapon)){
        const aim=['weapons','engines','hull'][Math.min(2,Math.floor(rng()*3))];
        if(!canFire(combat,sector,id,mount.id,targetId,aim))component=aim;
      }
      fireWeapon(combat,sector,id,mount.id,targetId,component,rng,1,mount.weapon.startsWith('autocannon-')?5:1);break;
    }
  }
  autoCIWS(combat,sector,'own',rng);for(const id of new Set([...opponents,...Object.keys(combat.alliedOrders)]))autoCIWS(combat,sector,id,rng);
  if(protectedShip)autoCIWS(combat,sector,protectedShip,rng);
  resolveShots(combat,sector,seconds,rng);
  for(const ship of Object.values(combat.contacts))emergencyStep(ship,seconds);
  advanceSupportShip(combat,sector,seconds);
  advanceBoarding(combat,sector,seconds,id=>surrenderShip(combat,id,'Captured by SDF marines','own',true));
  advanceMaintenance(combat,seconds);
  updateEnemyResolve(combat,sector);
  // End orders and unfinished bursts as soon as this step's impacts remove a threat.
  if(combat.engagement?.objective==='engage')planEngagement(combat,sector);
  syncElectronicTracking(combat,sector);
  updateRetreatReports(combat,sector);
}
