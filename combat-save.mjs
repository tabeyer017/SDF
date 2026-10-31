import { createCombat,createDamageShip,weapons,missileOptions } from './combat-model.mjs';
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function check(ok){if(!ok)throw new Error('Invalid damage / combat data in save file.');}
function num(v,min=0,max=1e12){check(Number.isFinite(v)&&v>=min&&v<=max);return v;}
function integer(v,min=0,max=1e12){num(v,min,max);check(Number.isInteger(v));return v;}
function bool(v){check(typeof v==='boolean');return v;}
function text(v,max=300){check(typeof v==='string'&&v.length<=max);return v;}
function array(v,max){check(Array.isArray(v)&&v.length<=max);return v;}
// Recognize only the exact three-mount pirate fits used before quantities were confirmed.
function legacyPirateFit(saved,classId){
  const weapons=classId==='pirate-frigate'?['gp-missiles','autocannon-120','ciws-30']:
    classId==='pirate-corvette'?['mp-missiles','autocannon-75','ciws-30']:null;
  if(!weapons||!Array.isArray(saved.mounts)||saved.mounts.length!==3||
    !weapons.every(weapon=>saved.mounts.some(m=>object(m)&&m.id===`${weapon}-1`)))return null;
  const legacy=createDamageShip(classId);
  for(const mount of legacy.mounts)delete legacy.systems[mount.id];
  legacy.mounts=weapons.map(weapon=>{
    const id=`${weapon}-1`,max=weapon==='ciws-30'?50:weapon.endsWith('missiles')?100:80;
    legacy.systems[id]={name:id,hp:max,max};return {id,weapon,barrels:1,readyAt:0};
  });
  legacy.ammo=Object.fromEntries(weapons.map(weapon=>[weapon,weapon==='ciws-30'?6000:weapon==='gp-missiles'?16:weapon==='mp-missiles'?12:1200]));
  legacy.maxAmmo={...legacy.ammo};return legacy;
}
function upgradePirateFit(legacy){
  const current=createDamageShip(legacy.classId),rename=legacy.classId==='pirate-corvette'?
    {'mp-missiles':'gp-missiles','autocannon-75':'autocannon-120'}:{};
  const result={...legacy,systems:current.systems,mounts:current.mounts,ammo:current.ammo,maxAmmo:current.maxAmmo};
  for(const [id,system] of Object.entries(result.systems))if(legacy.systems[id])system.hp=legacy.systems[id].hp;
  for(const mount of result.mounts){
    const source=legacy.mounts.find(m=>(rename[m.weapon]??m.weapon)===mount.weapon);
    // Newly specified mounts inherit their former weapon group's damage and reload time.
    result.systems[mount.id].hp=legacy.systems[source.id].hp;mount.readyAt=source.readyAt;
  }
  for(const [weapon,remaining] of Object.entries(legacy.ammo)){
    const replacement=rename[weapon]??weapon;
    result.ammo[replacement]=Math.max(0,result.maxAmmo[replacement]-(legacy.maxAmmo[weapon]-remaining));
  }
  result.jobs=legacy.jobs.map(job=>{
    const mount=legacy.mounts.find(m=>m.id===job.systemId);
    return {...job,systemId:mount?`${rename[mount.weapon]??mount.weapon}-1`:job.systemId};
  });
  return result;
}
function ship(saved,classId,player){
  check(object(saved)&&saved.classId===classId&&object(saved.systems)&&object(saved.ammo)&&object(saved.roles));
  const legacy=legacyPirateFit(saved,classId),result=legacy??createDamageShip(classId,player);
  for(const [id,s] of Object.entries(result.systems)){check(object(saved.systems[id]));s.hp=num(saved.systems[id].hp,0,s.max);}
  for(const weapon of Object.keys(result.ammo))result.ammo[weapon]=integer(saved.ammo[weapon],0,result.maxAmmo[weapon]);
  const mounts=array(saved.mounts,result.mounts.length);check(mounts.length===result.mounts.length);
  for(const mount of result.mounts){const source=mounts.find(m=>object(m)&&m.id===mount.id);check(!!source);mount.readyAt=num(source.readyAt);}
  for(const weapon of Object.keys(result.roles)){const role=saved.roles[weapon];check(role===null&&weapon!=='as-missiles'||missileOptions[weapon].includes(role));result.roles[weapon]=role;}
  result.spares=integer(saved.spares,0,result.maxSpares);result.radar=bool(saved.radar);result.jammer=bool(saved.jammer);result.ciwsAuto=bool(saved.ciwsAuto);
  result.surrendered=saved.surrendered===undefined?false:bool(saved.surrendered);
  result.fire=bool(saved.fire);result.breach=bool(saved.breach);result.air=num(saved.air,0,1800);result.underFireUntil=num(saved.underFireUntil);
  const used=new Set();result.jobs=array(saved.jobs,Object.keys(result.systems).length).map(j=>{
    check(object(j)&&Object.hasOwn(result.systems,j.systemId)&&!used.has(j.systemId));used.add(j.systemId);
    return {systemId:j.systemId,progress:num(j.progress,0,5),station:bool(j.station)};
  });
  return legacy?upgradePirateFit(result):result;
}
export function restoreCombat(saved,contacts){
  check(object(saved)&&object(saved.contacts));const result=createCombat(contacts);
  result.time=num(saved.time);result.nextShot=integer(saved.nextShot,1);
  result.own=ship(saved.own,'sdf-frigate',true);
  for(const contact of contacts)result.contacts[contact.id]=ship(saved.contacts[contact.id],contact.shipType,false);
  const validId=id=>id==='own'||Object.hasOwn(result.contacts,id);
  const shotId=id=>typeof id==='string'&&/^shot:\d+$/.test(id)&&Number(id.slice(5))<result.nextShot;
  const targetId=id=>validId(id)||shotId(id);
  result.hostiles=array(saved.hostiles,contacts.length).map(id=>{check(id!=='own'&&validId(id));return id;});check(new Set(result.hostiles).size===result.hostiles.length);
  const seen=new Set();result.shots=array(saved.shots,1000).map(s=>{
    check(object(s)&&shotId(s.id)&&!seen.has(s.id)&&validId(s.sourceId)&&targetId(s.targetId)&&Object.hasOwn(weapons,s.weapon));seen.add(s.id);
    const source=s.sourceId==='own'?result.own:result.contacts[s.sourceId],mounts=source.mounts.filter(m=>m.weapon===s.weapon);
    // Old corvette projectiles keep their original warhead and guidance across subsequent saves.
    const legacyShot=source.classId==='pirate-corvette'&&['mp-missiles','autocannon-75'].includes(s.weapon);
    check(mounts.length>0||legacyShot);
    check(weapons[s.weapon].missile?missileOptions[s.weapon].includes(s.role):s.role===null);
    const component=text(s.component,100);check(['hull','engines','weapons','reactor','power','bridge','epd','sensors','communications','life-support','jammer'].includes(component));
    const shot={id:s.id,sourceId:s.sourceId,targetId:s.targetId,weapon:s.weapon,role:s.role,component,
      damage:num(s.damage,0,weapons[s.weapon].damage*(legacyShot?1:Math.max(...mounts.map(m=>m.barrels)))*(s.weapon==='ciws-30'?10:1)),remaining:num(s.remaining,0,1000000)};
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
      const component=text(f.component,100);check(['hull','engines','weapons','reactor','power','bridge','epd','sensors','communications','life-support','jammer'].includes(component));
      return {mountId:f.mountId,targetId:f.targetId,component};
    });
  }
  result.docked=bool(saved.docked);
  if(saved.service!==null){check(object(saved.service)&&result.docked);result.service={full:bool(saved.service.full),remaining:num(saved.service.remaining,0,60)};}
  check(!result.own.jobs.some(j=>j.station)||!!result.service);
  result.log=array(saved.log,8).map(line=>text(line));return result;
}
