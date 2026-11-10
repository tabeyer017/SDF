import { createCombat,createDamageShip,weapons,missileOptions,missileVolleySizes,cannonBurstSizes,ciwsFiringTime,radarBurnThrough,weaponAimOptions } from './combat-model.mjs';
import {migratePlayerShipName} from './ship-names.mjs';
import {restoreBoarding} from './boarding-model.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function check(ok){if(!ok)throw new Error('Invalid damage / combat data in save file.');}
function num(v,min=0,max=1e12){check(Number.isFinite(v)&&v>=min&&v<=max);return v;}
function integer(v,min=0,max=1e12){num(v,min,max);check(Number.isInteger(v));return v;}
function bool(v){check(typeof v==='boolean');return v;}
function text(v,max=300){check(typeof v==='string'&&v.length<=max);return v;}
function array(v,max){check(Array.isArray(v)&&v.length<=max);return v;}
// Recognize the exact older pirate fits so new equipment preserves patrol damage and supplies.
function legacyPirateFit(saved,classId){
  const earlyWeapons=classId==='pirate-frigate'?['gp-missiles','autocannon-120','ciws-30']:
    classId==='pirate-corvette'?['mp-missiles','autocannon-75','ciws-30']:null;
  if(!earlyWeapons||!Array.isArray(saved.mounts))return null;
  const guns=classId==='pirate-frigate'?2:1;
  const earlyIds=earlyWeapons.map(weapon=>`${weapon}-1`);
  const confirmedIds=['gp-missiles-1',...Array.from({length:guns},(_,i)=>`autocannon-120-${i+1}`),'ciws-30-1','ciws-30-2'];
  const matches=ids=>saved.mounts.length===ids.length&&ids.every(id=>saved.mounts.some(m=>object(m)&&m.id===id));
  const early=matches(earlyIds);if(!early&&!matches(confirmedIds))return null;
  const ids=early?earlyIds:confirmedIds;
  const legacy=createDamageShip(classId);
  for(const mount of legacy.mounts)delete legacy.systems[mount.id];
  legacy.mounts=ids.map(id=>{
    const weapon=id.replace(/-\d+$/,''),max=weapon==='ciws-30'?50:weapon.endsWith('missiles')?100:80;
    legacy.systems[id]={name:id,hp:max,max};return {id,weapon,barrels:1,readyAt:0};
  });
  legacy.ammo=early?Object.fromEntries(earlyWeapons.map(weapon=>[weapon,weapon==='ciws-30'?6000:weapon==='gp-missiles'?16:weapon==='mp-missiles'?12:1200])):
    {'gp-missiles':classId==='pirate-frigate'?40:30,'autocannon-120':1200*guns,'ciws-30':12000};
  legacy.maxAmmo={...legacy.ammo};return legacy;
}
function upgradePirateFit(legacy){
  const current=createDamageShip(legacy.classId),rename={'mp-missiles':'gp-missiles','autocannon-120':'autocannon-75'};
  const mountId=id=>id.replace(/^mp-missiles-/,'gp-missiles-').replace(/^autocannon-120-/,'autocannon-75-');
  const result={...legacy,systems:current.systems,mounts:current.mounts,ammo:current.ammo,maxAmmo:current.maxAmmo};
  for(const [id,system] of Object.entries(result.systems))if(legacy.systems[id])system.hp=legacy.systems[id].hp;
  for(const mount of result.mounts){
    const source=legacy.mounts.find(m=>mountId(m.id)===mount.id)??legacy.mounts.find(m=>(rename[m.weapon]??m.weapon)===mount.weapon);
    // Newly specified mounts inherit their former weapon group's damage and reload time.
    result.systems[mount.id].hp=legacy.systems[source.id].hp;mount.readyAt=source.readyAt;
    if(mountId(source.id)===mount.id)for(const key of ['ciwsTarget','ciwsRounds'])if(source[key]!==undefined)mount[key]=source[key];
  }
  for(const [weapon,remaining] of Object.entries(legacy.ammo)){
    const replacement=rename[weapon]??weapon;
    result.ammo[replacement]=Math.max(0,result.maxAmmo[replacement]-(legacy.maxAmmo[weapon]-remaining));
  }
  result.jobs=legacy.jobs.map(job=>({...job,systemId:mountId(job.systemId)}));
  result.repairHolds=legacy.repairHolds.map(mountId);
  return result;
}
function ship(saved,classId,player){
  check(object(saved)&&saved.classId===classId&&object(saved.systems)&&object(saved.ammo)&&object(saved.roles));
  const legacy=legacyPirateFit(saved,classId),result=legacy??createDamageShip(classId,player);
  if(player&&saved.name!==undefined){const name=migratePlayerShipName(classId,saved.name);check(name!==null);result.name=name;}
  for(const [id,s] of Object.entries(result.systems)){check(object(saved.systems[id]));s.hp=num(saved.systems[id].hp,0,s.max);}
  for(const weapon of Object.keys(result.ammo))result.ammo[weapon]=integer(saved.ammo[weapon],0,result.maxAmmo[weapon]);
  const mounts=array(saved.mounts,result.mounts.length);check(mounts.length===result.mounts.length);
  for(const mount of result.mounts){const source=mounts.find(m=>object(m)&&m.id===mount.id);check(!!source);mount.readyAt=num(source.readyAt);if(source.ciwsTarget!==undefined){check(mount.weapon==='ciws-30'&&typeof source.ciwsTarget==='string'&&/^shot:\d+$/.test(source.ciwsTarget));mount.ciwsTarget=source.ciwsTarget;}if(source.ciwsRounds!==undefined){check(!!mount.ciwsTarget);mount.ciwsRounds=integer(source.ciwsRounds,1,75);}}
  for(const weapon of Object.keys(result.roles)){const role=saved.roles[weapon];check(role===null&&weapon!=='as-missiles'||missileOptions[weapon].includes(role));result.roles[weapon]=role;}
  result.spares=integer(saved.spares,0,result.maxSpares);result.radar=bool(saved.radar);result.jammer=bool(saved.jammer);result.ciwsAuto=bool(saved.ciwsAuto);
  result.surrendered=saved.surrendered===undefined?false:bool(saved.surrendered);
  result.underMissileFireUntil=saved.underMissileFireUntil===undefined?0:num(saved.underMissileFireUntil);
  if(saved.combatResponse!=null){
    const response=saved.combatResponse;check(!player&&object(response)&&['retreating','surrendered'].includes(response.mode));
    check((response.mode==='surrendered')===result.surrendered);
    const used=new Set();
    const notices=array(response.notices,3).map(notice=>{
      check(object(notice)&&['retreat','surrender','contact-lost'].includes(notice.type)&&!used.has(notice.type));used.add(notice.type);
      return {type:notice.type,time:num(notice.time),reported:bool(notice.reported)};
    });
    check(notices.some(notice=>notice.type===(response.mode==='surrendered'?'surrender':'retreat')));
    result.combatResponse={mode:response.mode,reason:text(response.reason,200),since:num(response.since),opponentId:text(response.opponentId,100),blockedFor:num(response.blockedFor),bestRange:num(response.bestRange),contactLost:bool(response.contactLost),notices};
  }
  result.jammerMode=saved.jammerMode===undefined?(player&&saved.jammer?'on':'auto'):saved.jammerMode;check(['auto','on','off'].includes(result.jammerMode));
  result.burnThroughUntil=saved.burnThroughUntil===undefined?0:num(saved.burnThroughUntil);
  result.burnThroughReadyAt=saved.burnThroughReadyAt===undefined?0:num(saved.burnThroughReadyAt);
  result.autoRepair=saved.autoRepair===undefined?player:bool(saved.autoRepair);
  result.repairHolds=saved.repairHolds===undefined?[]:array(saved.repairHolds,Object.keys(result.systems).length).map(id=>{
    check(typeof id==='string'&&Object.hasOwn(result.systems,id));return id;
  });
  check(new Set(result.repairHolds).size===result.repairHolds.length);
  result.fire=bool(saved.fire);result.breach=bool(saved.breach);result.air=num(saved.air,0,1800);result.underFireUntil=num(saved.underFireUntil);
  const used=new Set();result.jobs=array(saved.jobs,Object.keys(result.systems).length).map(j=>{
    check(object(j)&&Object.hasOwn(result.systems,j.systemId)&&!used.has(j.systemId));used.add(j.systemId);
    const job={systemId:j.systemId,progress:num(j.progress,0,5),station:bool(j.station)};
    if(j.automatic!==undefined){job.automatic=bool(j.automatic);check(!job.automatic||!job.station);}
    return job;
  });
  return legacy?upgradePirateFit(result):result;
}
export function restoreCombat(saved,contacts){
  check(object(saved)&&object(saved.contacts));const result=createCombat(contacts);
  result.time=num(saved.time);result.nextShot=integer(saved.nextShot,1);
  if(saved.missileVolleySize!==undefined){check(missileVolleySizes.includes(saved.missileVolleySize));result.missileVolleySize=saved.missileVolleySize;}
  if(saved.cannonBurstSize!==undefined){check(cannonBurstSizes.includes(saved.cannonBurstSize));result.cannonBurstSize=saved.cannonBurstSize;}
  result.own=ship(saved.own,'sdf-frigate',true);
  for(const contact of contacts)result.contacts[contact.id]=ship(saved.contacts[contact.id],contact.shipType,false);
  for(const vessel of [result.own,...Object.values(result.contacts)]){
    check(vessel.burnThroughUntil<=result.time+radarBurnThrough.duration&&vessel.burnThroughReadyAt<=result.time+radarBurnThrough.cooldown);
    check(vessel.burnThroughReadyAt>=vessel.burnThroughUntil);
  }
  check(saved.ciwsFeedVersion===undefined||saved.ciwsFeedVersion===1);
  if(saved.ciwsFeedVersion===undefined)for(const vessel of [result.own,...Object.values(result.contacts)])for(const mount of vessel.mounts){
    if(mount.ciwsTarget)mount.readyAt=Math.min(mount.readyAt,result.time+ciwsFiringTime(vessel,mount,mount.ciwsRounds??75));
  }
  const validId=id=>id==='own'||Object.hasOwn(result.contacts,id);
  for(const [id,vessel] of [['own',result.own],...Object.entries(result.contacts)]){
    const savedShip=id==='own'?saved.own:saved.contacts[id];
    for(const mount of vessel.mounts){
      const source=savedShip.mounts.find(m=>m.id===mount.id)??(vessel.classId.startsWith('pirate-')&&mount.weapon==='autocannon-75'?savedShip.mounts.find(m=>m.id===mount.id.replace('autocannon-75-','autocannon-120-')):undefined);
      const burst=source?.burst;if(burst===undefined)continue;
      check(mount.weapon.startsWith('autocannon-')&&object(burst)&&validId(burst.targetId));
      check(cannonBurstSizes.includes(burst.total)&&burst.total>1&&weaponAimOptions(mount.weapon).some(([aim])=>aim===burst.component));
      mount.burst={targetId:burst.targetId,component:burst.component,total:burst.total,remaining:integer(burst.remaining,1,burst.total-1)};
    }
  }
  for(const [id,vessel] of Object.entries(result.contacts))if(vessel.combatResponse){
    const response=vessel.combatResponse;check(validId(response.opponentId)&&response.opponentId!==id&&response.since<=result.time);
    check(response.notices.every(notice=>notice.time<=result.time));
  }
  const shotId=id=>typeof id==='string'&&/^shot:\d+$/.test(id)&&Number(id.slice(5))<result.nextShot;
  const targetId=id=>validId(id)||shotId(id);
  result.hostiles=array(saved.hostiles,contacts.length).map(id=>{check(id!=='own'&&validId(id));return id;});check(new Set(result.hostiles).size===result.hostiles.length);
  if(saved.alliedOrders!==undefined){
    check(object(saved.alliedOrders)&&Object.keys(saved.alliedOrders).length<=contacts.length);
    for(const [id,order] of Object.entries(saved.alliedOrders)){
      check(contacts.some(c=>c.id===id&&c.type==='friendly'&&c.shipType.startsWith('sdf-'))&&object(order)&&['attack-targets','battle-assistance'].includes(order.mode));
      const targetIds=array(order.targetIds,contacts.length).map(targetId=>{check(contacts.some(c=>c.id===targetId&&c.type==='enemy'));return targetId;});
      check(targetIds.length>0&&new Set(targetIds).size===targetIds.length);result.alliedOrders[id]={mode:order.mode,targetIds};
    }
  }
  const seen=new Set();result.shots=array(saved.shots,1000).map(s=>{
    check(object(s)&&shotId(s.id)&&!seen.has(s.id)&&validId(s.sourceId)&&targetId(s.targetId)&&Object.hasOwn(weapons,s.weapon));seen.add(s.id);
    const source=s.sourceId==='own'?result.own:result.contacts[s.sourceId],mounts=source.mounts.filter(m=>m.weapon===s.weapon);
    // In-flight rounds retain their original weapon and damage across equipment upgrades.
    const legacyShot=source.classId.startsWith('pirate-')&&s.weapon==='autocannon-120'||source.classId==='pirate-corvette'&&s.weapon==='mp-missiles';
    check(mounts.length>0||legacyShot);
    check(weapons[s.weapon].missile?missileOptions[s.weapon].includes(s.role):s.role===null);
    const component=text(s.component,100);check(['hull','engines','weapons','ciws','reactor','power','bridge','epd','sensors','communications','life-support','jammer'].includes(component));
    const maxBurst=s.weapon==='ciws-30'?10:s.sourceId==='own'&&s.weapon.startsWith('autocannon-')?Math.max(...cannonBurstSizes):1;
    const shot={id:s.id,sourceId:s.sourceId,targetId:s.targetId,weapon:s.weapon,role:s.role,component,
      damage:num(s.damage,0,weapons[s.weapon].damage*(legacyShot?1:Math.max(...mounts.map(m=>m.barrels)))*maxBurst),remaining:num(s.remaining,0,1000000)};
    if(s.jammingChecked!==undefined){check(!!weapons[s.weapon].missile);shot.jammingChecked=bool(s.jammingChecked);}
    if(s.launchVelocity!==undefined){
      check(!!weapons[s.weapon].missile&&object(s.launchVelocity));
      shot.launchVelocity=Object.fromEntries(['vx','vy','vz'].map(axis=>[axis,num(s.launchVelocity[axis],-1e6,1e6)]));
    }
    for(const axis of ['x','y','z'])shot[axis]=num(s[axis],-1e12,1e12);
    for(const v of ['vx','vy','vz'])shot[v]=num(s[v],-1e7,1e7);
    return shot;
  });
  if(saved.firing!==null){
    // Earlier version 2 saves stored one order as an object.
    const orders=Array.isArray(saved.firing)?array(saved.firing,result.own.mounts.length):[saved.firing],used=new Set();
    check(orders.length>0);
    result.firing=orders.map(f=>{
      check(object(f)&&result.own.mounts.some(m=>m.id===f.mountId)&&!used.has(f.mountId)&&targetId(f.targetId));used.add(f.mountId);
      const component=text(f.component,100);check(['hull','engines','weapons','ciws','reactor','power','bridge','epd','sensors','communications','life-support','jammer'].includes(component));
      return {mountId:f.mountId,targetId:f.targetId,component};
    });
  }
  if(saved.engagement!=null){
    const order=saved.engagement;check(object(order)&&['engage','disable','destroy'].includes(order.objective));
    const targetIds=array(order.targetIds,contacts.length).map(id=>{check(id!=='own'&&validId(id));return id;});
    const overrides=array(order.overrides,result.own.mounts.length).map(id=>{check(result.own.mounts.some(m=>m.id===id));return id;});
    check(targetIds.length>0&&new Set(targetIds).size===targetIds.length&&new Set(overrides).size===overrides.length);
    result.engagement={objective:order.objective,targetIds,overrides};
  }
  result.docked=bool(saved.docked);
  if(saved.support!=null){
    const support=saved.support;check(object(support)&&['en-route','waiting','servicing','complete'].includes(support.phase));
    result.support={phase:support.phase,location:text(support.location,120)};
    for(const axis of ['x','y','z'])result.support[axis]=num(support[axis],-1e12,1e12);
    for(const axis of ['vx','vy','vz'])result.support[axis]=num(support[axis],-7200,7200);
    check(Math.hypot(result.support.vx,result.support.vy,result.support.vz)<=7200.001);
  }
  if(saved.service!==null){
    check(object(saved.service));const tender=saved.service.provider==='tender';
    check(saved.service.provider===undefined||tender);
    check(tender?result.support?.phase==='servicing'&&!result.docked:result.docked);
    result.service={full:bool(saved.service.full),remaining:num(saved.service.remaining,0,60)};
    if(tender){check(result.service.full);result.service.provider='tender';}
  }
  check(result.support?.phase!=='servicing'||result.service?.provider==='tender');
  check(!result.own.jobs.some(j=>j.station)||!!result.service);
  result.boarding=restoreBoarding(saved.boarding,result,contacts);
  result.log=array(saved.log,8).map(line=>text(line));return result;
}
