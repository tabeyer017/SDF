import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat,createDamageShip,damageClasses,weapons,weaponAimOptions,aimPointState,nextAimPoint,applyDamage,shipPerformance,fireWeapon,canFire,orderEngagement,startFiring,commandWeapons,ceaseFiring,stepCombat,queueRepair,scheduleRepairs,setAutomaticRepairs,cancelRepair,advanceMaintenance,containEmergency,dock,requestService,changeEncounter,requestSupportShip,cancelSupportShip,supportStatus } from '../combat-model.mjs';
import { createSector,stepSector } from '../sector-model.mjs';
import { restoreCombat } from '../combat-save.mjs';
import { shipTypes,trainingContacts } from '../tactical-model.mjs';
import { trackingSolution,syncElectronicTracking,updateElectronicWarfare,setJammerMode,requestRadarBurnThrough,radarBurnThrough,infraredTrackingQuality,jammerEmitting } from '../combat-model.mjs';
import { observeSector,issueManeuver } from '../sector-model.mjs';
const setup=()=>({sector:createSector(),combat:createCombat()});
function step(c,s,seconds,rng=()=>0){for(let t=0;t<seconds-1e-8;t+=.05)stepCombat(c,s,Math.min(.05,seconds-t),rng);}

test('all library classes have individual systems, engines, mounts, finite parts and ammunition',()=>{
  assert.deepEqual(Object.keys(damageClasses).sort(),Object.keys(shipTypes).sort());
  for(const [id,catalog] of Object.entries(shipTypes)){
    const ship=createDamageShip(id);assert.ok(ship.systems.hull.hp>0);assert.ok(ship.spares>0);
    assert.equal(Object.keys(ship.systems).filter(k=>k.startsWith('engine-')).length,damageClasses[id][4]);
    for(const weapon of catalog.loadout){assert.ok(ship.mounts.some(m=>m.weapon===weapon));assert.ok(ship.ammo[weapon]>0);}
  }
  const heavy=createDamageShip('sdf-heavy-cruiser');assert.equal(heavy.mounts.filter(m=>m.weapon==='rail-gun').length,1);
  assert.equal(heavy.mounts.find(m=>m.weapon==='rail-gun').barrels,2);
});

test('logistics tender has the specified weapons, ammunition, engines and repair-shuttle launch layout',()=>{
  const classId='spf-logistics-tender',catalog=shipTypes[classId],ship=createDamageShip(classId);
  assert.equal(catalog.fitConfirmed,true);
  assert.equal(ship.mounts.filter(m=>m.weapon==='ciws-30').length,2);
  assert.equal(ship.mounts.filter(m=>m.weapon==='autocannon-120').length,1);
  assert.equal(ship.ammo['mp-missiles'],20);
  assert.match(catalog.fitting['mp-missiles'].location,/Ventral.*vertical launch/);
  assert.equal(Object.keys(ship.systems).filter(id=>id.startsWith('engine-')).length,2);
  assert.deepEqual(catalog.hangar,{bays:1,repairShuttles:6,launchLanes:{aft:2,port:2,starboard:2}});
});

test('rail-gun impacts retain full damage and ballistic velocity at close and long distance',()=>{
  for(const range of [5,100]){
    const {sector,combat}=setup();combat.own=createDamageShip('sdf-cruiser',true);
    Object.assign(sector.contacts[0],{x:0,y:range,z:0,vx:0,vy:0,vz:0});
    assert.equal(fireWeapon(combat,sector,'own','rail-gun-1','U-01','hull',()=>0).ok,true);combat.hostiles=[];
    const shot=combat.shots[0],v=[shot.vx,shot.vy,shot.vz],before=combat.contacts['U-01'].systems.hull.hp;
    assert.equal(shot.damage,180);stepCombat(combat,sector,.01,()=>1);assert.deepEqual([shot.vx,shot.vy,shot.vz],v);
    step(combat,sector,range/weapons['rail-gun'].speed+.2,()=>1);
    assert.ok(Math.abs(before-combat.contacts['U-01'].systems.hull.hp-180*(1-.2*(1-.8)))<1e-8);
  }
});

test('confirmed pirate fits create the specified turrets, CIWS, missile inventories and engines',()=>{
  for(const [classId,guns,missiles] of [['pirate-corvette',1,30],['pirate-frigate',2,40]]){
    const ship=createDamageShip(classId);
    assert.equal(ship.mounts.filter(m=>m.weapon==='autocannon-120').length,guns);
    assert.equal(ship.mounts.filter(m=>m.weapon==='ciws-30').length,2);
    assert.equal(ship.mounts.filter(m=>m.weapon==='gp-missiles').length,1);
    assert.equal(ship.ammo['gp-missiles'],missiles);
    assert.equal(ship.maxAmmo['gp-missiles'],missiles);
    assert.equal(ship.mounts.length,guns+3);
    assert.ok(ship.mounts.every(m=>m.barrels===1));
    assert.equal(Object.keys(ship.systems).filter(id=>id.startsWith('engine-')).length,2);
    assert.ok(!ship.mounts.some(m=>['mp-missiles','autocannon-75'].includes(m.weapon)));
  }
});

function oldPirateEncounter(){
  const combat=createCombat();
  for(const [id,weaponIds,missiles] of [['E-04',['gp-missiles','autocannon-120','ciws-30'],16],['E-06',['mp-missiles','autocannon-75','ciws-30'],12]]){
    const ship=combat.contacts[id];
    for(const mount of ship.mounts)delete ship.systems[mount.id];
    ship.mounts=weaponIds.map(weapon=>{
      const id=`${weapon}-1`,max=weapon==='ciws-30'?50:weapons[weapon].missile?100:80;
      ship.systems[id]={name:id,hp:weapon==='ciws-30'?0:max/2,max};
      return {id,weapon,barrels:1,readyAt:25};
    });
    ship.maxAmmo={[weaponIds[0]]:missiles,[weaponIds[1]]:1200,'ciws-30':6000};
    ship.ammo={[weaponIds[0]]:missiles-3,[weaponIds[1]]:1190,'ciws-30':5900};
    ship.systems.hull.hp=0;ship.spares=3;ship.surrendered=true;
    ship.jobs=[{systemId:`${weaponIds[1]}-1`,progress:2,station:false}];
  }
  return combat;
}

test('legacy pirate saves migrate without resetting damage, spent rounds, cooldowns, repairs or player progress',()=>{
  const legacy=oldPirateEncounter();legacy.own.systems.hull.hp=241;legacy.own.ammo['as-missiles']=24;
  const before=structuredClone(legacy),restored=restoreCombat(legacy,trainingContacts);
  assert.deepEqual(legacy,before);assert.deepEqual(restored.own,legacy.own);
  for(const [id,guns,missiles] of [['E-04',2,40],['E-06',1,30]]){
    const ship=restored.contacts[id];
    assert.equal(ship.systems.hull.hp,0);assert.equal(ship.spares,3);assert.equal(ship.surrendered,true);
    assert.equal(ship.ammo['gp-missiles'],missiles-3);
    assert.equal(ship.ammo['autocannon-120'],guns*1200-10);
    assert.equal(ship.ammo['ciws-30'],11900);
    for(const mount of ship.mounts){
      assert.equal(mount.readyAt,25);
      assert.equal(ship.systems[mount.id].hp,mount.weapon==='ciws-30'?0:ship.systems[mount.id].max/2);
    }
    assert.deepEqual(ship.jobs,[{systemId:'autocannon-120-1',progress:2,station:false}]);
    assert.ok(!ship.systems['autocannon-75-1']);assert.ok(!ship.systems['mp-missiles-1']);
  }
  assert.deepEqual(restoreCombat(JSON.parse(JSON.stringify(restored)),trainingContacts),restored);
  for(const edit of [c=>delete c.contacts['E-04'].systems.bridge,c=>c.contacts['E-06'].ammo['mp-missiles']=13,
    c=>c.contacts['E-04'].mounts[1].id='unexpected',c=>c.contacts['E-06'].systems['autocannon-75-1'].hp=81]){
    const bad=structuredClone(legacy);edit(bad);assert.throws(()=>restoreCombat(bad,trainingContacts));
  }
});

test('old corvette shots keep their original weapon and damage after migration and repeated saves',()=>{
  const legacy=oldPirateEncounter();legacy.nextShot=3;
  legacy.shots=[{id:'shot:1',sourceId:'E-06',targetId:'own',weapon:'mp-missiles',role:'precision',component:'engines',damage:60,remaining:4,x:0,y:10,z:0,vx:0,vy:-10,vz:0},
    {id:'shot:2',sourceId:'E-06',targetId:'own',weapon:'autocannon-75',role:null,component:'hull',damage:5,remaining:2,x:0,y:10,z:0,vx:0,vy:-5,vz:0}];
  const restored=restoreCombat(legacy,trainingContacts);
  assert.deepEqual(restored.shots,legacy.shots);
  assert.deepEqual(restoreCombat(JSON.parse(JSON.stringify(restored)),trainingContacts).shots,legacy.shots);
  const bad=structuredClone(restored);bad.shots[0].damage=61;assert.throws(()=>restoreCombat(bad,trainingContacts));
  bad.shots[0].damage=60;bad.shots[0].sourceId='E-04';assert.throws(()=>restoreCombat(bad,trainingContacts));
});

test('mount cooldown and ammunition apply per barrel, and misses create no persistent object',()=>{
  const {sector,combat}=setup();combat.own=createDamageShip('sdf-heavy-cruiser',true);const ammo=combat.own.ammo['rail-gun'];
  assert.equal(fireWeapon(combat,sector,'own','rail-gun-1','U-01','hull',()=>1).ok,true);
  assert.equal(combat.own.ammo['rail-gun'],ammo-2);assert.equal(combat.shots.length,0);
  assert.match(canFire(combat,sector,'own','rail-gun-1','U-01'),/firing cycle/);
  combat.time=10;assert.equal(canFire(combat,sector,'own','rail-gun-1','U-01'),null);
});

test('a selected salvo fires each mount once at its assigned target and skips unavailable mounts',()=>{
  const {sector,combat}=setup();
  Object.assign(sector.contacts[0],{x:0,y:10,z:0,vx:0,vy:0,vz:0});
  const orders=[{mountId:'autocannon-120-1',targetId:'U-01',component:'weapons'},
    {mountId:'mp-missiles-1',targetId:'E-04',component:'engines'},
    {mountId:'as-missiles-1',targetId:'E-04',component:'hull'},
    {mountId:'ciws-30-1',targetId:'E-04',component:'hull'}];
  const before={...combat.own.ammo},result=commandWeapons(combat,sector,[...orders,orders[0]],false,()=>0);
  assert.equal(result.ok,true);assert.equal(result.results.length,4);assert.equal(result.results.filter(r=>r.ok).length,3);
  assert.equal(combat.own.ammo['autocannon-120'],before['autocannon-120']-1);
  assert.equal(combat.own.ammo['mp-missiles'],before['mp-missiles']-1);
  assert.equal(combat.own.ammo['as-missiles'],before['as-missiles']-1);
  assert.equal(combat.own.ammo['ciws-30'],before['ciws-30']);
  assert.deepEqual(combat.shots.map(s=>[s.targetId,s.component]),[['U-01','weapons'],['E-04','engines'],['E-04','hull']]);
  assert.equal(combat.firing,null);
  const pending=structuredClone(combat.own.mounts.find(m=>m.id===orders[0].mountId).burst);
  assert.equal(commandWeapons(combat,sector,[orders[0]],false,()=>0).ok,false);
  assert.deepEqual(combat.own.mounts.find(m=>m.id===orders[0].mountId).burst,pending); // Skipping a busy mount must not cancel its burst.
});

test('continuous mount orders retain independent targets, firing cadence, and selective cease fire',()=>{
  const {sector,combat}=setup();Object.assign(sector.contacts[0],{x:0,y:20,z:0,vx:0,vy:0,vz:0});
  const orders=[{mountId:'autocannon-120-1',targetId:'U-01',component:'weapons'},
    {mountId:'mp-missiles-1',targetId:'E-04',component:'engines'}];
  combat.own.mounts.find(m=>m.id==='mp-missiles-1').readyAt=4;
  assert.equal(commandWeapons(combat,sector,orders,true).ok,true);
  const before={...combat.own.ammo};stepCombat(combat,sector,.01,()=>0);combat.hostiles=[];
  assert.equal(combat.own.ammo['autocannon-120'],before['autocannon-120']-1);
  assert.equal(combat.own.ammo['mp-missiles'],before['mp-missiles']);
  assert.equal(combat.firing.length,2);
  stepCombat(combat,sector,4,()=>0);combat.hostiles=[];
  assert.equal(combat.own.ammo['mp-missiles'],before['mp-missiles']-1);
  assert.ok(combat.shots.some(s=>s.weapon==='mp-missiles'&&s.targetId==='E-04'&&s.component==='engines'));
  startFiring(combat,sector,'autocannon-120-1','U-01','engines');assert.equal(combat.firing.length,2);
  ceaseFiring(combat,['autocannon-120-1']);assert.deepEqual(combat.firing,[orders[1]]);
  combat.own.systems['mp-missiles-1'].hp=0;stepCombat(combat,sector,.01,()=>1);assert.equal(combat.firing,null);
  startFiring(combat,sector,'autocannon-120-1','U-01','hull');ceaseFiring(combat);assert.equal(combat.firing,null);
});

test('missiles and autocannons cycle at their firing rates without reloading or restoring exhausted ammunition',()=>{
  for(const [weapon,mountId,aim] of [['as-missiles','as-missiles-1','hull'],['mp-missiles','mp-missiles-1','engines'],['autocannon-120','autocannon-120-1','hull']]){
    const {combat,sector}=setup();combat.own.ammo[weapon]=2;
    assert.equal(fireWeapon(combat,sector,'own',mountId,'U-01',aim,()=>1).ok,true);
    const cycling=canFire(combat,sector,'own',mountId,'U-01',aim);assert.ok(!cycling.includes('reload'));assert.match(cycling,/cycl/);
    combat.time+=60/weapons[weapon].rpm;
    assert.equal(fireWeapon(combat,sector,'own',mountId,'U-01',aim,()=>1).ok,true);assert.equal(combat.own.ammo[weapon],0);
    assert.match(canFire(combat,sector,'own',mountId,'U-01',aim),/station or request a resupply/);
    advanceMaintenance(combat,10000);changeEncounter(combat,sector.contacts);assert.equal(combat.own.ammo[weapon],0);
  }
});

test('an autocannon can fire its final round even when its turret normally fires two barrels',()=>{
  const {combat,sector}=setup();combat.own=createDamageShip('sdf-destroyer',true);combat.own.ammo['autocannon-120']=1;
  assert.equal(fireWeapon(combat,sector,'own','autocannon-120-1','U-01','hull',()=>1).ok,true);
  assert.equal(combat.own.ammo['autocannon-120'],0);
});

test('station arrival and docking do not replenish ammunition until station service completes',()=>{
  const {combat,sector}=setup();sector.location='Moon station';combat.own.ammo['as-missiles']=0;
  advanceMaintenance(combat,600);assert.equal(combat.own.ammo['as-missiles'],0);
  assert.equal(dock(combat,sector),true);advanceMaintenance(combat,600);assert.equal(combat.own.ammo['as-missiles'],0);
  assert.equal(requestService(combat,sector),true);advanceMaintenance(combat,59);assert.equal(combat.own.ammo['as-missiles'],0);
  advanceMaintenance(combat,1);assert.equal(combat.own.ammo['as-missiles'],combat.own.maxAmmo['as-missiles']);
});

test('a repair tender reaches a stranded ship, replaces destroyed engines, and replenishes ammunition after service',()=>{
  const {combat,sector}=setup();sector.location='deep space';combat.own.spares=0;
  combat.own.systems['engine-1'].hp=combat.own.systems['engine-2'].hp=0;
  for(const weapon in combat.own.ammo)combat.own.ammo[weapon]=0;
  assert.equal(requestSupportShip(combat,sector).ok,true);assert.equal(combat.support.phase,'en-route');
  assert.equal(combat.own.ammo['as-missiles'],0);step(combat,sector,200);
  assert.equal(combat.support.phase,'servicing');assert.equal(combat.service.provider,'tender');assert.equal(combat.own.ammo['as-missiles'],0);
  assert.match(canFire(combat,sector,'own','as-missiles-1','U-01','hull'),/tender connected/);
  step(combat,sector,200);assert.equal(combat.support.phase,'complete');assert.equal(combat.service,null);
  assert.equal(combat.own.systems['engine-1'].hp,combat.own.systems['engine-1'].max);
  assert.equal(combat.own.systems['engine-2'].hp,combat.own.systems['engine-2'].max);
  assert.deepEqual(combat.own.ammo,combat.own.maxAmmo);assert.equal(combat.own.spares,combat.own.maxSpares);
});

test('a tender waits for threats to clear and for the ship to hold before transferring ammunition',()=>{
  const {combat,sector}=setup();combat.own.ammo['as-missiles']=0;combat.hostiles=['E-04'];
  for(const mount of combat.contacts['E-04'].mounts)mount.readyAt=1e9;
  requestSupportShip(combat,sector);step(combat,sector,190);
  assert.equal(combat.support.phase,'waiting');assert.equal(combat.service,null);assert.equal(combat.own.ammo['as-missiles'],0);
  combat.hostiles=[];sector.own.vx=100;step(combat,sector,1);assert.equal(combat.support.phase,'waiting');
  sector.own.vx=0;step(combat,sector,61);assert.equal(combat.support.phase,'complete');
  assert.equal(combat.own.ammo['as-missiles'],combat.own.maxAmmo['as-missiles']);
});

test('tender requests are not duplicated and cancellation never transfers ammunition',()=>{
  const {combat,sector}=setup();combat.own.ammo['as-missiles']=0;requestSupportShip(combat,sector);
  step(combat,sector,10);const before=structuredClone(combat.support);
  assert.equal(requestSupportShip(combat,sector).ok,false);assert.deepEqual(combat.support,before);
  step(combat,sector,170);assert.equal(combat.service.provider,'tender');
  assert.equal(cancelSupportShip(combat),true);assert.equal(combat.support,null);assert.equal(combat.service,null);
  assert.ok(combat.own.jobs.every(job=>!job.station));advanceMaintenance(combat,1000);assert.equal(combat.own.ammo['as-missiles'],0);
  assert.match(supportStatus(combat,sector),/No resupply/);
});

test('tender approach and service survive combat saves and reject inconsistent provider state',()=>{
  const {combat,sector}=setup();combat.own.ammo['as-missiles']=0;requestSupportShip(combat,sector);step(combat,sector,20);
  let restored=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts);assert.deepEqual(restored.support,combat.support);
  step(combat,sector,160);restored=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts);
  assert.deepEqual(restored.support,combat.support);assert.deepEqual(restored.service,combat.service);
  for(const change of [c=>c.support.phase='invalid',c=>c.support.x=Infinity,c=>c.service=null,c=>c.service.full=false,c=>c.docked=true]){
    const bad=structuredClone(combat);change(bad);assert.throws(()=>restoreCombat(bad,sector.contacts),/combat data/);
  }
  const old=createCombat();delete old.support;assert.equal(restoreCombat(old,sector.contacts).support,null);
});

test('multiple firing assignments survive JSON and old single-order saves migrate safely',()=>{
  const {sector,combat}=setup();const orders=[{mountId:'mp-missiles-1',targetId:'E-04',component:'engines'},
    {mountId:'as-missiles-1',targetId:'U-01',component:'hull'}];
  commandWeapons(combat,sector,orders,true);
  assert.deepEqual(restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts),combat);
  const legacy=structuredClone(combat);legacy.firing=orders[0];
  assert.deepEqual(restoreCombat(legacy,sector.contacts).firing,[orders[0]]);
  for(const firing of [[orders[0],orders[0]],[],[{...orders[0],mountId:'unknown'}],[{...orders[0],targetId:'unknown'}]]){
    assert.throws(()=>restoreCombat({...structuredClone(combat),firing},sector.contacts));
  }
});

test('MP launches directly at subsystems, rejects hull attacks, and damages the selected equipment',()=>{
  const {sector,combat}=setup();
  combat.own.roles['mp-missiles']=null; // Old saves required a preset; the new launch ignores it.
  const ammo=combat.own.ammo['mp-missiles'];
  assert.equal(fireWeapon(combat,sector,'own','mp-missiles-1','U-01','hull',()=>0).ok,false);
  assert.equal(combat.own.ammo['mp-missiles'],ammo);
  assert.equal(canFire(combat,sector,'own','mp-missiles-1','U-01','engines'),null);
  Object.assign(sector.contacts[0],{x:0,y:10,z:0,vx:0,vy:0,vz:0});
  const engine=combat.contacts['U-01'].systems['engine-1'],before=engine.hp;
  assert.equal(startFiring(combat,sector,'mp-missiles-1','U-01','engines').ok,true);
  stepCombat(combat,sector,.01,()=>0);combat.firing=null;combat.hostiles=[];
  assert.equal(combat.shots[0].role,'precision');assert.equal(combat.shots[0].component,'engines');
  step(combat,sector,12,()=>1);assert.ok(engine.hp<before);
});

test('GP and AS strike hull or equipment, with AS retaining its heavy warhead',()=>{
  const {sector,combat}=setup();combat.own=createDamageShip('privateer',true);
  combat.own.roles['gp-missiles']=null;
  for(const aim of ['hull','engines','weapons','sensors'])assert.equal(canFire(combat,sector,'own','gp-missiles-1','U-01',aim),null);
  assert.equal(fireWeapon(combat,sector,'own','gp-missiles-1','U-01','engines',()=>0).ok,true);
  assert.equal(combat.shots[0].component,'engines');assert.equal(combat.shots[0].role,'precision');
  combat.own=createDamageShip('sdf-frigate',true);
  assert.equal(canFire(combat,sector,'own','as-missiles-1','U-01','engines'),null);
  assert.match(canFire(combat,sector,'own','as-missiles-1','U-01','reactor'),/protected by hull/);
  assert.match(canFire(combat,sector,'own','as-missiles-1','shot:1','hull'),/ships and ship systems only/);
  assert.equal(fireWeapon(combat,sector,'own','as-missiles-1','U-01','hull',()=>0).ok,true);
  assert.equal(combat.shots[1].damage,160);assert.equal(combat.shots[1].component,'hull');
  assert.ok(weapons['as-missiles'].damage>weapons['gp-missiles'].damage);
  assert.ok(weapons['gp-missiles'].damage>weapons['mp-missiles'].damage);
  assert.ok(!weaponAimOptions('mp-missiles').some(([id])=>['hull','incoming'].includes(id)));
  assert.deepEqual(weaponAimOptions('as-missiles').map(([id])=>id),weaponAimOptions('gp-missiles').filter(([id])=>id!=='incoming').map(([id])=>id));
});

test('AS missiles hit exposed internal systems after hull destruction and survive save restoration',()=>{
  const {sector,combat}=setup(),target=combat.contacts['U-01'];target.systems.hull.hp=0;
  Object.assign(sector.contacts[0],{x:0,y:5,z:0,vx:0,vy:0,vz:0});
  const before=target.systems.reactor.hp;
  assert.equal(fireWeapon(combat,sector,'own','as-missiles-1','U-01','reactor',()=>0).ok,true);
  assert.equal(combat.shots[0].component,'reactor');assert.equal(combat.shots[0].role,'precision');assert.equal(combat.shots[0].damage,160);
  assert.deepEqual(restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts).shots,combat.shots);
  combat.hostiles=[];step(combat,sector,6,()=>1);
  assert.ok(target.systems.reactor.hp<before);assert.equal(target.systems.hull.hp,0);
});

test('intact hull protects every internal aim point while exposed equipment stays targetable',()=>{
  const {sector,combat}=setup(),target=combat.contacts['U-01'],before=structuredClone(target),ammo={...combat.own.ammo};
  for(const component of ['reactor','power','epd','bridge','communications','life-support']){
    assert.equal(aimPointState(target,component).protected,true);
    assert.match(canFire(combat,sector,'own','mp-missiles-1','U-01',component),/protected by hull/);
    assert.equal(fireWeapon(combat,sector,'own','mp-missiles-1','U-01',component,()=>0).ok,false);
    assert.equal(startFiring(combat,sector,'mp-missiles-1','U-01',component).ok,false);
    assert.equal(applyDamage(combat,'U-01',100,component),0);
  }
  assert.deepEqual(target,before);assert.deepEqual(combat.own.ammo,ammo);assert.equal(combat.firing,null);
  for(const component of ['hull','engines','weapons','sensors','jammer'])assert.equal(aimPointState(target,component).available,true);
  target.systems.hull.hp=.01;assert.equal(aimPointState(target,'reactor').protected,true);
  target.systems.hull.hp=0;
  assert.equal(shipPerformance(target).power,0);assert.equal(aimPointState(target,'hull').destroyed,true);
  for(const component of ['reactor','power','epd','bridge','communications','life-support']){
    assert.equal(aimPointState(target,component).available,true);
    assert.equal(canFire(combat,sector,'own','mp-missiles-1','U-01',component),null);
  }
  const reactor=target.systems.reactor.hp;
  Object.assign(sector.contacts[0],{x:0,y:5,z:0,vx:0,vy:0,vz:0});
  assert.equal(fireWeapon(combat,sector,'own','mp-missiles-1','U-01','reactor',()=>0).ok,true);
  combat.hostiles=[];step(combat,sector,6,()=>1);assert.ok(target.systems.reactor.hp<reactor);
  assert.match(canFire(combat,sector,'own','as-missiles-1','U-01','hull'),/destroyed/);
});

test('automatic aim advances guns and AS past destroyed hulls and systems until none survive',()=>{
  const {sector,combat}=setup(),target=combat.contacts['U-01'];
  target.surrendered=true; // Deliberate manual fire on a secured hulk still exercises aim advancement.
  Object.assign(sector.contacts[0],{x:0,y:20,z:0,vx:0,vy:0,vz:0});
  for(const id of Object.keys(target.systems).filter(id=>id.startsWith('engine-')))target.systems[id].hp=0;
  assert.equal(nextAimPoint(target,'autocannon-120','hull'),'weapons');
  target.systems.reactor.hp=0;assert.equal(aimPointState(target,'reactor').destroyed,true);
  commandWeapons(combat,sector,[{mountId:'autocannon-120-1',targetId:'U-01',component:'hull'},
    {mountId:'as-missiles-1',targetId:'U-01',component:'hull'}],true);
  target.systems.hull.hp=0;stepCombat(combat,sector,.01,()=>0);combat.hostiles=[];
  assert.deepEqual(combat.firing,[{mountId:'autocannon-120-1',targetId:'U-01',component:'weapons'},
    {mountId:'as-missiles-1',targetId:'U-01',component:'weapons'}]);
  assert.equal(combat.shots.length,2);assert.ok(combat.shots.every(shot=>shot.component==='weapons'));
  assert.equal(nextAimPoint(target,'as-missiles','hull'),'weapons');
  for(const mount of target.mounts)target.systems[mount.id].hp=0;
  target.systems.sensors.hp=0;target.systems.jammer.hp=0;
  stepCombat(combat,sector,.01,()=>1);
  assert.equal(combat.firing[0].component,'power'); // Skip destroyed reactor after external equipment.
  assert.equal(combat.firing[1].component,'power');
  assert.deepEqual(restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts).firing,combat.firing);
  for(const system of Object.values(target.systems))system.hp=0;
  stepCombat(combat,sector,.01,()=>1);assert.equal(combat.firing,null);
});

test('aiming at radar or jammer automatically chooses emitter seeking and retains launch guidance',()=>{
  for(const [component,emitter,role] of [['sensors','radar','anti-radiation'],['jammer','jammer','anti-jammer']]){
    const {sector,combat}=setup(),target=combat.contacts['U-01'];
    target[emitter]=false;
    if(component==='jammer')assert.equal(canFire(combat,sector,'own','mp-missiles-1','U-01',component),null);
    else assert.match(canFire(combat,sector,'own','mp-missiles-1','U-01',component),/not emitting/);
    target[emitter]=true;
    assert.equal(fireWeapon(combat,sector,'own','mp-missiles-1','U-01',component,()=>0).ok,true);
    const shot=combat.shots[0];assert.equal(shot.role,role);assert.equal(shot.component,component);
    combat.own.roles['mp-missiles']=null;assert.equal(shot.role,role);
    target[emitter]=false;if(emitter==='jammer')target.jammerMode='off';combat.hostiles=[];stepCombat(combat,sector,.05,()=>1);assert.ok(!combat.shots.includes(shot));
  }
});

test('each CIWS mount tracks incoming missiles independently of ship radar and fire control',()=>{
  const {sector,combat}=setup();Object.assign(sector.contacts[3],{x:0,y:18,z:0,vx:0,vy:0,vz:0});
  const enemy=combat.contacts['E-04'];assert.equal(fireWeapon(combat,sector,'E-04','gp-missiles-1','own','hull',()=>0).ok,true);
  combat.own.systems.sensors.hp=0;combat.own.radar=false;combat.own.systems['ciws-30-1'].hp=0;
  const ammo=combat.own.ammo['ciws-30'];stepCombat(combat,sector,.05,()=>0);
  assert.equal(combat.shots.length,1);assert.equal(combat.own.ammo['ciws-30'],ammo-75);
  combat.hostiles=[];step(combat,sector,10.1,()=>0);assert.equal(combat.shots.length,0);
  assert.ok(combat.own.mounts.find(m=>m.id==='ciws-30-2').readyAt>0);assert.ok(enemy);
});

test('CIWS cycles persist through saves and a close salvo overwhelms two mounts',()=>{
  const {sector,combat}=setup();
  Object.assign(sector.contacts[3],{x:0,y:8,z:0,vx:0,vy:0,vz:0});
  fireWeapon(combat,sector,'E-04','gp-missiles-1','own','hull',()=>0);
  combat.hostiles=[];
  const template=combat.shots[0];
  for(let i=0;i<12;i++)combat.shots.push({...template,id:`shot:${combat.nextShot++}`});
  const ammo=combat.own.ammo['ciws-30'],hull=combat.own.systems.hull.hp;
  stepCombat(combat,sector,.05,()=>0);
  const mounts=combat.own.mounts.filter(m=>m.weapon==='ciws-30');
  assert.equal(new Set(mounts.map(m=>m.ciwsTarget)).size,2);
  assert.equal(combat.own.ammo['ciws-30'],ammo-150);
  assert.ok(mounts.every(m=>Math.abs(m.readyAt-combat.time-1.5)<1e-10));
  const restored=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts);
  assert.deepEqual(restored.own.mounts,combat.own.mounts);
  step(restored,sector,8,()=>0);
  assert.ok(restored.own.systems.hull.hp<hull);
});

test('belt-fed CIWS sustains its 3000 rpm cadence without stopping continuous fire for a reload',()=>{
  const {sector,combat}=setup();Object.assign(sector.contacts[3],{x:0,y:10,z:0,vx:0,vy:0,vz:0});
  combat.own.ciwsAuto=false;const ammo=combat.own.ammo['ciws-30'];
  assert.equal(startFiring(combat,sector,'ciws-30-1','E-04','hull').ok,true);
  stepCombat(combat,sector,.05,()=>0);
  assert.match(canFire(combat,sector,'own','ciws-30-1','E-04','hull'),/belt feed cycling/);
  step(combat,sector,.95,()=>0);
  assert.equal(combat.own.ammo['ciws-30'],ammo-50);
  assert.equal(combat.firing[0].mountId,'ciws-30-1');
  assert.ok(combat.log.every(line=>!line.includes('reloading')));
});

test('automatic CIWS starts the next missile immediately after firing its 75-round belt-fed engagement',()=>{
  const {sector,combat}=setup();Object.assign(sector.contacts[3],{x:0,y:15,z:0,vx:0,vy:0,vz:0});
  fireWeapon(combat,sector,'E-04','gp-missiles-1','own','hull',()=>0);combat.hostiles=[];
  const first=combat.shots[0].id,second=`shot:${combat.nextShot++}`;combat.shots.push({...combat.shots[0],id:second});
  combat.own.systems['ciws-30-2'].hp=0;const ammo=combat.own.ammo['ciws-30'],mount=combat.own.mounts.find(m=>m.id==='ciws-30-1');
  stepCombat(combat,sector,.05,()=>0);assert.equal(mount.ciwsTarget,first);
  step(combat,sector,1.5,()=>0);
  assert.ok(!combat.shots.some(shot=>shot.id===first));assert.equal(mount.ciwsTarget,second);
  assert.equal(combat.own.ammo['ciws-30'],ammo-150);assert.ok(Math.abs(mount.readyAt-combat.time-1.5)<1e-9);
});

test('CIWS uses the final rounds in its drum and preserves a partial firing cycle in saves',()=>{
  const {sector,combat}=setup();Object.assign(sector.contacts[3],{x:0,y:15,z:0,vx:0,vy:0,vz:0});
  fireWeapon(combat,sector,'E-04','gp-missiles-1','own','hull',()=>0);combat.hostiles=[];
  combat.own.ammo['ciws-30']=20;combat.own.systems['ciws-30-2'].hp=0;
  stepCombat(combat,sector,.05,()=>0);
  const mount=combat.own.mounts.find(m=>m.id==='ciws-30-1');
  assert.equal(combat.own.ammo['ciws-30'],0);assert.equal(mount.ciwsRounds,20);assert.ok(Math.abs(mount.readyAt-combat.time-.4)<1e-10);
  const restored=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts);
  assert.deepEqual(restored.own.mounts,combat.own.mounts);
  step(restored,sector,.4,()=>0);assert.equal(restored.shots.length,0);assert.equal(restored.own.ammo['ciws-30'],0);
});

test('old CIWS engagement delays migrate to firing time without refilling ammunition',()=>{
  const {sector,combat}=setup();Object.assign(sector.contacts[3],{x:0,y:15,z:0,vx:0,vy:0,vz:0});
  fireWeapon(combat,sector,'E-04','gp-missiles-1','own','hull',()=>0);combat.hostiles=[];
  stepCombat(combat,sector,.05,()=>0);const saved=JSON.parse(JSON.stringify(combat));delete saved.ciwsFeedVersion;
  for(const mount of saved.own.mounts)if(mount.ciwsTarget){mount.readyAt=saved.time+14;delete mount.ciwsRounds;}
  const restored=restoreCombat(saved,sector.contacts),mount=restored.own.mounts.find(m=>m.ciwsTarget);
  assert.equal(restored.ciwsFeedVersion,1);assert.ok(Math.abs(mount.readyAt-restored.time-1.5)<1e-10);
  assert.equal(restored.own.ammo['ciws-30'],combat.own.ammo['ciws-30']);
  for(const edit of [s=>s.ciwsFeedVersion=2,s=>s.own.mounts.find(m=>m.ciwsTarget).ciwsRounds=76]){
    const bad=JSON.parse(JSON.stringify(combat));edit(bad);assert.throws(()=>restoreCombat(bad,sector.contacts),/combat data/);
  }
});

test('GP automatically intercepts incoming missiles; MP cannot launch against them',()=>{
  const {sector,combat}=setup();Object.assign(sector.contacts[3],{x:0,y:10,z:0,vx:0,vy:0,vz:0});
  fireWeapon(combat,sector,'E-04','gp-missiles-1','own','hull',()=>0);
  const incoming=combat.shots[0];assert.match(canFire(combat,sector,'own','mp-missiles-1',incoming.id,'engines'),/subsystems only/);
  combat.own=createDamageShip('privateer',true);
  assert.equal(fireWeapon(combat,sector,'own','gp-missiles-1',incoming.id,'hull',()=>0).ok,true);
  assert.equal(combat.shots[1].targetId,incoming.id);assert.equal(combat.shots[1].role,'aa');
});

test('destroyed engines remove thrust without removing existing momentum',()=>{
  const {sector,combat}=setup();sector.own.vx=3600;sector.running=true;sector.order={mode:'brake'};
  combat.own.systems['engine-1'].hp=combat.own.systems['engine-2'].hp=0;
  sector.enginePerformance=shipPerformance(combat.own).engines;stepSector(sector,10);
  assert.equal(sector.own.vx,3600);assert.equal(sector.own.x,10);
  combat.own.systems.epd.hp=0;assert.equal(shipPerformance(combat.own).epd,false);
});

test('Engineering automatically starts repairable damage and consumes parts as time advances',()=>{
  const {combat}=setup();assert.equal(combat.own.autoRepair,true);
  applyDamage(combat,'own',250,'engines');
  assert.deepEqual(combat.own.jobs,[{systemId:'engine-1',progress:0,station:false,automatic:true}]);
  const damaged=combat.own.systems['engine-1'].hp;combat.time=31;advanceMaintenance(combat,60);
  assert.equal(combat.own.systems['engine-1'].hp,damaged+10);assert.equal(combat.own.spares,198);
  scheduleRepairs(combat);assert.equal(combat.own.jobs.length,1);
});

test('automatic maintenance recovers existing damage within field limits without manual orders',()=>{
  const {combat}=setup(),ship=combat.own;
  ship.systems.hull.hp=550;ship.systems['engine-1'].hp=40;ship.systems.sensors.hp=0;
  advanceMaintenance(combat,300);
  assert.equal(ship.systems.hull.hp,600);assert.equal(ship.systems['engine-1'].hp,90);
  assert.equal(ship.systems.sensors.hp,0);assert.equal(ship.spares,180);assert.equal(ship.jobs.length,0);
  advanceMaintenance(combat,300);assert.equal(ship.spares,180);
});

test('manual override stops automatic jobs, keeps manual orders, and permits explicit repairs',()=>{
  const {combat}=setup(),ship=combat.own;
  ship.systems['engine-1'].hp=40;ship.systems['engine-2'].hp=40;
  queueRepair(combat,'engine-2');scheduleRepairs(combat);advanceMaintenance(combat,15);
  const manual=structuredClone(ship.jobs.find(j=>j.systemId==='engine-2'));
  setAutomaticRepairs(combat,false);assert.deepEqual(ship.jobs,[manual]);
  advanceMaintenance(combat,45);assert.equal(ship.systems['engine-2'].hp,50);assert.equal(ship.systems['engine-1'].hp,40);
  applyDamage(combat,'own',100,'engines');assert.equal(ship.jobs.some(j=>j.automatic),false);
  assert.equal(queueRepair(combat,'engine-1'),true);
});

test('canceling holds a system across scheduling, encounters, and saves until explicitly resumed',()=>{
  const {combat,sector}=setup(),ship=combat.own;ship.systems['engine-1'].hp=40;
  scheduleRepairs(combat);advanceMaintenance(combat,15);assert.ok(ship.jobs[0].progress>0);
  assert.equal(cancelRepair(combat,'engine-1'),true);advanceMaintenance(combat,120);
  assert.equal(ship.systems['engine-1'].hp,40);assert.deepEqual(ship.jobs,[]);
  const loaded=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts);
  changeEncounter(loaded,sector.contacts);advanceMaintenance(loaded,60);
  assert.deepEqual(loaded.own.repairHolds,['engine-1']);assert.deepEqual(loaded.own.jobs,[]);
  setAutomaticRepairs(loaded,true);assert.deepEqual(loaded.own.repairHolds,[]);
  advanceMaintenance(loaded,30);assert.equal(loaded.own.systems['engine-1'].hp,45);
  cancelRepair(loaded,'engine-1');assert.equal(queueRepair(loaded,'engine-1'),true);
  assert.deepEqual(loaded.own.repairHolds,[]);assert.equal(loaded.own.jobs[0].automatic,undefined);
});

test('manual repair orders precede automatic work and automatic work prioritizes essential systems',()=>{
  const {combat}=setup(),ship=combat.own;
  for(const [id,value] of Object.entries({hull:550,'life-support':50,reactor:80,power:60,'engine-1':40,sensors:20}))ship.systems[id].hp=value;
  scheduleRepairs(combat);assert.deepEqual(ship.jobs.map(j=>j.systemId),['hull','life-support','reactor','power','engine-1','sensors']);
  cancelRepair(combat,'sensors');queueRepair(combat,'sensors');
  assert.equal(ship.jobs[0].systemId,'sensors');assert.equal(ship.jobs[0].automatic,undefined);
});

test('automatic repair settings and partial jobs round-trip, old saves enable auto, and malformed overrides fail validation',()=>{
  const {combat,sector}=setup();combat.own.systems['engine-1'].hp=40;
  scheduleRepairs(combat);advanceMaintenance(combat,15);
  assert.deepEqual(restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts),combat);
  setAutomaticRepairs(combat,false);assert.deepEqual(restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts),combat);
  const legacy=structuredClone(combat);delete legacy.own.autoRepair;delete legacy.own.repairHolds;
  const loaded=restoreCombat(legacy,sector.contacts);assert.equal(loaded.own.autoRepair,true);assert.deepEqual(loaded.own.repairHolds,[]);
  for(const edit of [c=>c.own.autoRepair='yes',c=>c.own.repairHolds=['unknown'],c=>c.own.repairHolds=['hull','hull'],c=>{c.own.jobs=[{systemId:'hull',progress:0,station:false,automatic:'yes'}];}]){
    const bad=structuredClone(combat);edit(bad);assert.throws(()=>restoreCombat(bad,sector.contacts));
  }
});

test('automatic repair obeys spare exhaustion and leaves explicit station service under player control',()=>{
  const {combat,sector}=setup(),ship=combat.own;ship.systems['engine-1'].hp=40;ship.spares=1;
  advanceMaintenance(combat,300);assert.equal(ship.systems['engine-1'].hp,45);assert.equal(ship.spares,0);
  advanceMaintenance(combat,300);assert.equal(ship.systems['engine-1'].hp,45);assert.equal(combat.docked,false);assert.equal(combat.service,null);
  sector.location='Moon station';assert.equal(dock(combat,sector),true);assert.equal(requestService(combat,sector),true);
  setAutomaticRepairs(combat,false);assert.ok(ship.jobs.every(j=>j.station));
  advanceMaintenance(combat,1000);assert.equal(ship.systems['engine-1'].hp,120);assert.equal(ship.spares,200);
  ship.systems.hull.hp=0;setAutomaticRepairs(combat,true);scheduleRepairs(combat);assert.deepEqual(ship.jobs,[]);
});

test('onboard repair costs parts, obeys field ceilings, and stops when parts run out',()=>{
  const {combat}=setup(),s=combat.own.systems['engine-1'];s.hp=40;
  assert.equal(queueRepair(combat,'engine-1'),true);advanceMaintenance(combat,300);
  assert.equal(s.hp,90);assert.equal(combat.own.spares,190);assert.equal(combat.own.jobs.length,0);
  s.hp=40;combat.own.spares=1;queueRepair(combat,'engine-1');advanceMaintenance(combat,300);
  assert.equal(s.hp,45);assert.equal(combat.own.spares,0);advanceMaintenance(combat,300);assert.equal(s.hp,45);
  s.hp=0;assert.equal(queueRepair(combat,'engine-1'),false);
});

test('two repair teams work concurrently and emergency containment never restores damage',()=>{
  const {combat}=setup();combat.own.systems['engine-1'].hp=40;combat.own.systems['engine-2'].hp=40;
  queueRepair(combat,'engine-1');queueRepair(combat,'engine-2');advanceMaintenance(combat,60);
  assert.equal(combat.own.systems['engine-1'].hp,50);assert.equal(combat.own.systems['engine-2'].hp,50);
  combat.own.fire=true;combat.own.breach=true;combat.own.spares=0;const before=combat.own.systems.hull.hp;
  containEmergency(combat,'fire');containEmergency(combat,'breach');assert.equal(combat.own.systems.hull.hp,before);
  assert.equal(combat.own.fire,false);assert.equal(combat.own.breach,false);
});

test('docking requires a real service location and low speed; full station replaces destroyed systems and replenishes',()=>{
  const {sector,combat}=setup();assert.equal(dock(combat,sector),false);sector.location='Moon station';sector.own.vx=100;
  assert.equal(dock(combat,sector),false);sector.own.vx=0;assert.equal(dock(combat,sector),true);
  combat.own.systems.epd.hp=0;combat.own.spares=0;combat.own.ammo['as-missiles']=0;
  assert.equal(requestService(combat,sector),true);advanceMaintenance(combat,1000);
  assert.equal(combat.own.systems.epd.hp,160);assert.equal(combat.own.spares,200);assert.equal(combat.own.ammo['as-missiles'],30);assert.equal(combat.service,null);
});

test('new sectors retain player damage and stores while replacing the training encounter',()=>{
  const {combat}=setup();applyDamage(combat,'own',100,'engines');combat.own.spares=4;
  const own=structuredClone(combat.own);changeEncounter(combat,trainingContacts);assert.deepEqual(combat.own,own);
  assert.equal(combat.contacts['E-04'].systems.hull.hp,900);
});

test('combat saves preserve automatic missile guidance, legacy presets, repairs, and spent parts',()=>{
  const {sector,combat}=setup();combat.own.roles['mp-missiles']=null;
  fireWeapon(combat,sector,'own','mp-missiles-1','E-04','engines',()=>0);
  fireWeapon(combat,sector,'own','as-missiles-1','E-04','hull',()=>0);
  combat.own.systems['engine-1'].hp=40;queueRepair(combat,'engine-1');advanceMaintenance(combat,15);
  const restored=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts);assert.deepEqual(restored,combat);
  const legacy=structuredClone(combat);legacy.own.roles['mp-missiles']='aa';legacy.shots[0].role='aa';legacy.shots[0].component='hull';
  assert.deepEqual(restoreCombat(legacy,sector.contacts),legacy);
  for(const edit of [c=>c.own.spares=-1,c=>c.own.roles['mp-missiles']='anti-ship',c=>c.shots[0].vx=null,c=>c.own.systems.hull.hp=1001]){
    const bad=structuredClone(combat);edit(bad);assert.throws(()=>restoreCombat(bad,sector.contacts));
  }
});

test('automatic objectives respect range, priorities, manual overrides and cease fire',()=>{
  const {combat,sector}=setup();
  Object.assign(sector.contacts[0],{x:0,y:10,z:0});
  const id=sector.contacts[0].id;
  assert.equal(orderEngagement(combat,sector,'disable',[id]).ok,true);
  assert.ok(combat.firing.length);
  assert.ok(combat.firing.every(f=>f.component==='ciws'));
  const mount=combat.firing[0].mountId;
  commandWeapons(combat,sector,[{mountId:mount,targetId:id,component:'hull'}],true);
  stepCombat(combat,sector,.01,()=>1);
  assert.ok(combat.engagement.overrides.includes(mount));
  assert.equal(combat.firing.find(f=>f.mountId===mount).component,'hull');
  const restored=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts);
  assert.deepEqual(restored.engagement,combat.engagement);
  ceaseFiring(combat);assert.equal(combat.engagement,null);assert.equal(combat.firing,null);
  orderEngagement(combat,sector,'disable',[id]);
  for(const [key,system] of Object.entries(combat.contacts[id].systems))if(key.startsWith('engine-')||combat.contacts[id].mounts.some(m=>m.id===key))system.hp=0;
  stepCombat(combat,sector,.01,()=>1);
  assert.equal(combat.engagement,null);assert.equal(combat.firing,null);
});
test('automatic destroy selects reachable targets in priority order and waits beyond range',()=>{
  const {combat,sector}=setup();const [a,b]=sector.contacts;
  Object.assign(a,{x:0,y:250,z:0});Object.assign(b,{x:0,y:10,z:0});
  orderEngagement(combat,sector,'destroy',[a.id,b.id]);
  assert.ok(combat.firing.length);assert.ok(combat.firing.every(f=>f.targetId===b.id&&f.component==='ciws'));
  Object.assign(a,{y:5});stepCombat(combat,sector,.01,()=>1);
  assert.ok(combat.firing.every(f=>f.targetId===a.id));
});

test('Disable and Destroy suppress CIWS, then the jammer, then attack the objective one missile at a time',()=>{
  for(const objective of ['disable','destroy']){
    const {combat,sector}=setup(),id='E-04';
    Object.assign(sector.contacts.find(c=>c.id===id),{x:0,y:10,z:0,vx:0,vy:0,vz:0});
    const before={...combat.own.ammo};
    orderEngagement(combat,sector,objective,[id]);stepCombat(combat,sector,.01,()=>0);
    assert.equal(combat.own.ammo['as-missiles'],before['as-missiles']);
    assert.equal(combat.own.ammo['mp-missiles'],before['mp-missiles']);
    const gunfire=combat.shots.filter(s=>s.sourceId==='own');
    assert.equal(gunfire.length,2);assert.ok(gunfire.every(s=>s.weapon==='autocannon-120'&&s.component==='ciws'));
    const restored=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts);
    assert.deepEqual(restored.firing,combat.firing);assert.deepEqual(restored.shots,combat.shots);
    applyDamage(restored,id,170,'ciws',1);
    assert.equal(restored.contacts[id].systems['ciws-30-1'].hp,0);
    assert.equal(restored.contacts[id].systems['ciws-30-2'].hp,50);
    assert.equal(restored.contacts[id].systems['autocannon-120-1'].hp,80);
    stepCombat(restored,sector,.01,()=>0);
    assert.equal(restored.own.ammo['as-missiles'],before['as-missiles']);
    applyDamage(restored,id,170,'ciws',1);stepCombat(restored,sector,.01,()=>0);
    assert.equal(aimPointState(restored.contacts[id],'ciws').destroyed,true);
    assert.equal(restored.own.ammo['as-missiles'],before['as-missiles']);
    assert.equal(restored.own.ammo['mp-missiles'],before['mp-missiles']-1);
    assert.ok(restored.firing.every(f=>f.component==='jammer'&&!f.mountId.startsWith('as-missiles')));
    assert.equal(restored.shots.find(s=>s.weapon==='mp-missiles'&&s.sourceId==='own').role,'anti-jammer');
    applyDamage(restored,id,200,'jammer',1);
    restored.own.mounts.find(m=>m.weapon==='mp-missiles').readyAt=restored.time;
    stepCombat(restored,sector,.01,()=>0);
    assert.equal(restored.own.ammo['as-missiles'],before['as-missiles']-1);
    assert.equal(restored.own.ammo['mp-missiles'],before['mp-missiles']-2);
    const missiles=restored.shots.filter(s=>s.sourceId==='own'&&weapons[s.weapon].missile);
    assert.equal(missiles.length,2);
    assert.ok(missiles.every(s=>s.component===(objective==='disable'||s.weapon==='mp-missiles'?'engines':'hull')));
  }
});

test('Tactical holds missiles beyond gun range or with disabled guns, while a manual launch overrides the hold',()=>{
  const {combat,sector}=setup(),id='E-04';
  Object.assign(sector.contacts.find(c=>c.id===id),{x:0,y:100,z:0,vx:0,vy:0,vz:0});
  orderEngagement(combat,sector,'destroy',[id]);stepCombat(combat,sector,.01,()=>0);
  assert.equal(combat.firing,null);assert.equal(combat.own.ammo['as-missiles'],30);
  sector.contacts.find(c=>c.id===id).y=10;
  for(const mount of combat.own.mounts.filter(m=>m.weapon==='autocannon-120'))combat.own.systems[mount.id].hp=0;
  stepCombat(combat,sector,.01,()=>0);
  assert.equal(combat.firing,null);assert.equal(combat.own.ammo['as-missiles'],30);
  assert.equal(commandWeapons(combat,sector,[{mountId:'as-missiles-1',targetId:id,component:'hull'}],true).ok,true);
  stepCombat(combat,sector,.01,()=>0);
  assert.equal(combat.own.ammo['as-missiles'],29);
  assert.ok(combat.engagement.overrides.includes('as-missiles-1'));
});

test('manual missile volleys use 1, 5, 10 or 15 separate warheads and preserve the launch rate',()=>{
  for(const size of [1,5,10,15]){
    const {combat,sector}=setup();combat.missileVolleySize=size;
    const order={mountId:'as-missiles-1',targetId:'E-04',component:'hull'};
    assert.equal(commandWeapons(combat,sector,[order],false,()=>0).ok,true);
    const shots=combat.shots.filter(s=>s.sourceId==='own');
    assert.equal(shots.length,size);assert.equal(new Set(shots.map(s=>s.id)).size,size);
    assert.ok(shots.every(s=>s.damage===160&&s.targetId==='E-04'));
    assert.equal(combat.own.ammo['as-missiles'],30-size);
    assert.equal(combat.own.mounts.find(m=>m.id===order.mountId).readyAt,size*60/weapons['as-missiles'].rpm);
    assert.equal(commandWeapons(combat,sector,[order]).ok,false);
  }
});

test('volleys assess misses independently and fire remaining ammunition without refilling',()=>{
  const {combat,sector}=setup();combat.missileVolleySize=15;combat.own.ammo['as-missiles']=3;
  let roll=0;
  assert.equal(commandWeapons(combat,sector,[{mountId:'as-missiles-1',targetId:'E-04',component:'hull'}],false,()=>[0,1,0][roll++]).ok,true);
  assert.equal(roll,3);assert.equal(combat.shots.length,2);assert.equal(combat.own.ammo['as-missiles'],0);
  assert.ok(combat.shots.every(s=>s.damage===160));
});

test('a changed volley size applies to the next Tactical launch and survives saves and encounters',()=>{
  const {combat,sector}=setup(),id='E-04';
  Object.assign(sector.contacts.find(c=>c.id===id),{x:0,y:40,z:0,vx:0,vy:0,vz:0});
  for(const mount of combat.contacts[id].mounts.filter(m=>m.weapon==='ciws-30'))combat.contacts[id].systems[mount.id].hp=0;
  combat.contacts[id].systems.jammer.hp=0;
  orderEngagement(combat,sector,'disable',[id]);stepCombat(combat,sector,.01,()=>0);
  assert.equal(combat.own.ammo['as-missiles'],29);
  combat.missileVolleySize=10;
  const restored=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts);
  assert.equal(restored.missileVolleySize,10);
  restored.time=restored.own.mounts.find(m=>m.id==='as-missiles-1').readyAt;
  stepCombat(restored,sector,.01,()=>0);assert.equal(restored.own.ammo['as-missiles'],19);
  changeEncounter(restored,sector.contacts);assert.equal(restored.missileVolleySize,10);
  const legacy=JSON.parse(JSON.stringify(restored));delete legacy.missileVolleySize;
  assert.equal(restoreCombat(legacy,sector.contacts).missileVolleySize,1);
  for(const value of [0,7,16,'10',null])assert.throws(()=>restoreCombat({...legacy,missileVolleySize:value},sector.contacts));
});

test('a real volley gives each CIWS mount a separate interceptable missile track',()=>{
  const {combat,sector}=setup();combat.missileVolleySize=15;
  Object.assign(sector.contacts.find(c=>c.id==='E-04'),{x:0,y:8,z:0,vx:0,vy:0,vz:0});
  commandWeapons(combat,sector,[{mountId:'as-missiles-1',targetId:'E-04',component:'hull'}],false,()=>0);
  stepCombat(combat,sector,.05,()=>0);
  const mounts=combat.contacts['E-04'].mounts.filter(m=>m.weapon==='ciws-30');
  assert.equal(new Set(mounts.map(m=>m.ciwsTarget)).size,2);
  const restored=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts);
  step(restored,sector,1.5,()=>0);
  assert.equal(restored.shots.filter(s=>s.sourceId==='own').length,13);
  assert.ok(restored.shots.filter(s=>s.sourceId==='own').every(s=>s.damage===160));
});

test('live radar jamming can defeat AS, MP and GP missiles completely, even when activated after launch',()=>{
  for(const weapon of ['as-missiles','mp-missiles','gp-missiles']){
    for(const defense of ['active','silent','destroyed']){
      const {combat,sector}=setup(),source=weapon==='gp-missiles'?'E-04':'own',targetId=source==='own'?'E-04':'own';
      const target=targetId==='own'?combat.own:combat.contacts[targetId],component=weapon==='mp-missiles'?'engines':'hull';
      Object.assign(sector.contacts.find(c=>c.id==='E-04'),{x:0,y:5,z:0,vx:0,vy:0,vz:0});
      target.jammer=false;target.ciwsAuto=false;combat.own.autoRepair=false;
      assert.equal(fireWeapon(combat,sector,source,`${weapon}-1`,targetId,component,()=>0).ok,true);
      combat.hostiles=[];target.jammer=defense!=='silent';target.jammerMode=defense==='silent'?'off':'on';target.radar=false;
      if(defense==='destroyed')target.systems.jammer.hp=0;
      const before=structuredClone(target.systems);
      stepCombat(combat,sector,6,()=>.95);
      assert.equal(combat.shots.length,0);
      if(defense==='active'){
        assert.deepEqual(target.systems,before);
        assert.ok(combat.log.some(message=>message.includes('radar jammer')&&message.includes('missile missed completely')));
      }else assert.ok(target.systems.hull.hp<before.hull.hp);
    }
  }
});

test('MP and GP anti-jammer strikes home on the emitting jammer without being defeated by it',()=>{
  for(const weapon of ['mp-missiles','gp-missiles']){
    const {combat,sector}=setup(),source=weapon==='gp-missiles'?'E-04':'own',targetId=source==='own'?'E-04':'own';
    const target=targetId==='own'?combat.own:combat.contacts[targetId];
    Object.assign(sector.contacts.find(c=>c.id==='E-04'),{x:0,y:5,z:0,vx:0,vy:0,vz:0});
    target.jammer=true;target.ciwsAuto=false;combat.own.autoRepair=false;
    assert.equal(fireWeapon(combat,sector,source,`${weapon}-1`,targetId,'jammer',()=>0).ok,true);
    assert.equal(combat.shots[0].role,'anti-jammer');combat.hostiles=[];
    const before=target.systems.jammer.hp;stepCombat(combat,sector,6,()=>1);
    assert.ok(target.systems.jammer.hp<before);
  }
});

test('jammer suppression uses MP beyond autocannon range and holds heavy missiles until the jammer is silent',()=>{
  const {combat,sector}=setup(),id='E-04',target=combat.contacts[id];
  Object.assign(sector.contacts.find(c=>c.id===id),{x:0,y:70,z:0,vx:0,vy:0,vz:0});
  for(const mount of target.mounts.filter(m=>m.weapon==='ciws-30'))target.systems[mount.id].hp=0;
  target.systems.sensors.hp=0; // Main radar loss does not stop the separate jammer.
  orderEngagement(combat,sector,'destroy',[id]);stepCombat(combat,sector,.01,()=>0);
  assert.deepEqual(combat.firing,[{mountId:'mp-missiles-1',targetId:id,component:'jammer'}]);
  assert.equal(combat.own.ammo['mp-missiles'],19);assert.equal(combat.own.ammo['as-missiles'],30);
  assert.equal(combat.shots.find(s=>s.sourceId==='own').role,'anti-jammer');
  target.jammer=false;target.jammerMode='off';stepCombat(combat,sector,.01,()=>0);
  assert.equal(combat.own.ammo['as-missiles'],29);
  assert.ok(!combat.shots.some(s=>s.role==='anti-jammer'));
});

test('both pirate classes suppress CIWS with autocannons, then use GP missiles and autocannons on the jammer',()=>{
  for(const id of ['E-04','E-06']){
    const {combat,sector}=setup(),pirate=combat.contacts[id];combat.own.autoRepair=false;
    Object.assign(sector.contacts.find(c=>c.id===id),{x:0,y:10,z:0,vx:0,vy:0,vz:0});
    combat.hostiles=[id];combat.own.jammer=true;
    stepCombat(combat,sector,.01,()=>0);
    let shots=combat.shots.filter(s=>s.sourceId===id);
    assert.equal(shots.length,1);assert.equal(shots[0].weapon,'autocannon-120');assert.equal(shots[0].component,'ciws');
    const before=pirate.ammo['gp-missiles'];
    for(const mount of combat.own.mounts.filter(m=>m.weapon==='ciws-30'))combat.own.systems[mount.id].hp=0;
    stepCombat(combat,sector,.01,()=>0);
    assert.equal(pirate.ammo['gp-missiles'],before-1);
    assert.ok(combat.shots.some(s=>s.sourceId===id&&s.weapon==='gp-missiles'&&s.component==='jammer'&&s.role==='anti-jammer'));
    for(const mount of pirate.mounts.filter(m=>m.weapon==='autocannon-120'))mount.readyAt=0;
    stepCombat(combat,sector,.01,()=>0);
    assert.ok(combat.shots.some(s=>s.sourceId===id&&s.weapon==='autocannon-120'&&s.component==='jammer'));
    combat.own.systems.jammer.hp=0;
    pirate.mounts.find(m=>m.weapon==='gp-missiles').readyAt=0;stepCombat(combat,sector,.01,()=>0);
    shots=combat.shots.filter(s=>s.sourceId===id);
    assert.ok(shots.some(s=>s.weapon==='gp-missiles'&&s.component!=='ciws'&&s.component!=='jammer'));
    assert.ok(shots.every(s=>['autocannon-120','gp-missiles'].includes(s.weapon)));
  }
});

test('manual cannon bursts fire 1, 5, 10 or 20 individual shells per mount at the barrel firing rate, then stop',()=>{
  for(const size of [1,5,10,20]){
    for(const classId of ['sdf-frigate','sdf-destroyer']){
      const {combat,sector}=setup();combat.own=createDamageShip(classId,true);combat.cannonBurstSize=size;
      Object.assign(sector.contacts[0],{x:0,y:10,z:0,vx:0,vy:0,vz:0});
      const mount=combat.own.mounts.find(m=>m.weapon==='autocannon-120'),ammo=combat.own.ammo[mount.weapon];
      const order={mountId:mount.id,targetId:'U-01',component:'ciws'};
      const interval=60/weapons[mount.weapon].rpm/mount.barrels;
      assert.equal(commandWeapons(combat,sector,[order],false,()=>1).ok,true);
      assert.equal(combat.own.ammo[mount.weapon],ammo-1);
      assert.equal(mount.readyAt,interval);
      for(let fired=1;fired<size;fired++){
        step(combat,sector,interval-.05,()=>1);
        assert.equal(combat.own.ammo[mount.weapon],ammo-fired);
        step(combat,sector,.05,()=>1);
        assert.equal(combat.own.ammo[mount.weapon],ammo-fired-1);
      }
      assert.equal(mount.burst,undefined);assert.equal(combat.firing,null);
      step(combat,sector,30,()=>1);
      assert.equal(combat.own.ammo[mount.weapon],ammo-size);
    }
  }
});

test('Tactical fires five-round cannon bursts, pauses, repeats, and accepts a player size change',()=>{
  for(const objective of ['disable','destroy']){
    const {combat,sector}=setup(),id='E-04',ammo=combat.own.ammo['autocannon-120'];
    Object.assign(sector.contacts.find(c=>c.id===id),{x:0,y:10,z:0,vx:0,vy:0,vz:0});
    assert.equal(combat.cannonBurstSize,5);
    orderEngagement(combat,sector,objective,[id]);stepCombat(combat,sector,.01,()=>1);
    assert.equal(combat.own.ammo['autocannon-120'],ammo-2); // One shell from each turret.
    step(combat,sector,3,()=>1);assert.equal(combat.own.ammo['autocannon-120'],ammo-4);
    combat.cannonBurstSize=10;
    step(combat,sector,9,()=>1);assert.equal(combat.own.ammo['autocannon-120'],ammo-10);
    assert.ok(combat.own.mounts.filter(m=>m.weapon==='autocannon-120').every(m=>!m.burst));
    step(combat,sector,4.95,()=>1);assert.equal(combat.own.ammo['autocannon-120'],ammo-10);
    step(combat,sector,.05,()=>1);assert.equal(combat.own.ammo['autocannon-120'],ammo-12);
    assert.ok(combat.own.mounts.filter(m=>m.weapon==='autocannon-120').every(m=>m.burst.total===10&&m.burst.remaining===9));
    step(combat,sector,27,()=>1);assert.equal(combat.own.ammo['autocannon-120'],ammo-30);
    step(combat,sector,4.95,()=>1);assert.equal(combat.own.ammo['autocannon-120'],ammo-30);
    step(combat,sector,.05,()=>1);assert.equal(combat.own.ammo['autocannon-120'],ammo-32);
    assert.deepEqual(combat.engagement.overrides,[]);
    assert.equal(combat.own.ammo['as-missiles'],30); // CIWS suppression still governs missiles.
  }
});

test('cannon bursts use the final rounds in a twin turret without refilling exhausted ammunition',()=>{
  const {combat,sector}=setup();combat.own=createDamageShip('sdf-destroyer',true);
  combat.cannonBurstSize=20;combat.own.ammo['autocannon-120']=3;
  Object.assign(sector.contacts[0],{x:0,y:10,z:0,vx:0,vy:0,vz:0});
  const order={mountId:'autocannon-120-1',targetId:'U-01',component:'hull'};
  assert.equal(commandWeapons(combat,sector,[order],false,()=>1).ok,true);
  assert.equal(combat.own.ammo['autocannon-120'],2);
  step(combat,sector,1.5,()=>1);assert.equal(combat.own.ammo['autocannon-120'],1);
  step(combat,sector,1.5,()=>1);assert.equal(combat.own.ammo['autocannon-120'],0);
  assert.equal(combat.own.mounts.find(m=>m.id===order.mountId).burst,undefined);
  combat.time=1000;assert.equal(commandWeapons(combat,sector,[order]).ok,false);
});

test('cannon burst preferences, pending burst damage and cooldowns survive saves and encounters',()=>{
  const {combat,sector}=setup();combat.cannonBurstSize=20;
  Object.assign(sector.contacts[0],{x:0,y:10,z:0,vx:0,vy:0,vz:0});
  commandWeapons(combat,sector,[{mountId:'autocannon-120-1',targetId:'U-01',component:'ciws'}],true);
  stepCombat(combat,sector,.01,()=>0);
  const restored=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts);
  assert.equal(restored.cannonBurstSize,20);assert.deepEqual(restored.shots,combat.shots);
  assert.deepEqual(restored.firing,combat.firing);assert.deepEqual(restored.own.mounts,combat.own.mounts);
  assert.equal(restored.own.mounts.find(m=>m.id==='autocannon-120-1').burst.remaining,19);
  const ammo=restored.own.ammo['autocannon-120'];step(restored,sector,2.95,()=>1);
  assert.equal(restored.own.ammo['autocannon-120'],ammo);
  step(restored,sector,.05,()=>1);assert.equal(restored.own.ammo['autocannon-120'],ammo-1);
  for(const edit of [b=>b.remaining=0,b=>b.remaining=20,b=>b.total=3,b=>b.targetId='missing',b=>b.component='incoming']){
    const bad=structuredClone(restored);edit(bad.own.mounts.find(m=>m.id==='autocannon-120-1').burst);
    assert.throws(()=>restoreCombat(bad,sector.contacts));
  }
  const invalid=structuredClone(restored);invalid.shots.find(s=>s.sourceId==='own').damage=241;
  assert.throws(()=>restoreCombat(invalid,sector.contacts));
  changeEncounter(restored,sector.contacts);assert.equal(restored.cannonBurstSize,20);
  assert.ok(restored.own.mounts.every(m=>!m.burst));
  const legacy=JSON.parse(JSON.stringify(restored));delete legacy.cannonBurstSize;
  assert.equal(restoreCombat(legacy,sector.contacts).cannonBurstSize,5);
  for(const value of [0,2,15,21,'5',null])assert.throws(()=>restoreCombat({...legacy,cannonBurstSize:value},sector.contacts));
});

test('successive cannon shells have separate trajectories and independent hit checks',()=>{
  const {combat,sector}=setup();combat.cannonBurstSize=5;
  Object.assign(sector.contacts[0],{x:0,y:29,z:0,vx:0,vy:0,vz:0});
  const target=combat.contacts['U-01'];target.surrendered=true;
  const order={mountId:'autocannon-120-1',targetId:'U-01',component:'hull'};
  commandWeapons(combat,sector,[order],false,()=>0);
  assert.equal(combat.shots.length,1);assert.equal(combat.shots[0].damage,12);
  const firstId=combat.shots[0].id;step(combat,sector,2.95,()=>1);
  Object.assign(sector.contacts[0],{x:3});step(combat,sector,.05,()=>0);
  const shells=combat.shots.filter(s=>s.sourceId==='own');assert.equal(shells.length,2);
  assert.equal(shells[0].id,firstId);assert.ok(shells[0].y>2.9);
  assert.ok(shells[1].y<.1);assert.ok(shells[1].vx>0);assert.equal(shells[1].damage,12);
  const ammo=combat.own.ammo['autocannon-120'];step(combat,sector,3,()=>1);
  assert.equal(combat.own.ammo['autocannon-120'],ammo-1);
  assert.equal(combat.shots.filter(s=>s.sourceId==='own').length,2); // Third shell missed independently.
});

test('selective cease and mount destruction cancel only their unfinished cannon bursts',()=>{
  const {combat,sector}=setup();combat.cannonBurstSize=10;
  Object.assign(sector.contacts[0],{x:0,y:20,z:0,vx:0,vy:0,vz:0});
  const orders=combat.own.mounts.filter(m=>m.weapon==='autocannon-120').map(m=>({mountId:m.id,targetId:'U-01',component:'hull'}));
  const ammo=combat.own.ammo['autocannon-120'];commandWeapons(combat,sector,orders,false,()=>1);
  ceaseFiring(combat,[orders[0].mountId]);step(combat,sector,3,()=>1);
  assert.equal(combat.own.ammo['autocannon-120'],ammo-3);
  assert.equal(combat.own.mounts.find(m=>m.id===orders[0].mountId).burst,undefined);
  combat.own.systems[orders[1].mountId].hp=0;step(combat,sector,3,()=>1);
  assert.equal(combat.own.ammo['autocannon-120'],ammo-3);
  assert.ok(combat.own.mounts.every(m=>!m.burst));
});

test('manual Fire replaces a repeating assignment with one finite burst, and cease cancels its remainder',()=>{
  const {combat,sector}=setup();combat.cannonBurstSize=1;
  Object.assign(sector.contacts[0],{x:0,y:20,z:0,vx:0,vy:0,vz:0});
  const order={mountId:'autocannon-120-1',targetId:'U-01',component:'hull'};
  commandWeapons(combat,sector,[order],true);stepCombat(combat,sector,.05,()=>1);
  const ammo=combat.own.ammo['autocannon-120'];
  combat.time=combat.own.mounts.find(m=>m.id===order.mountId).readyAt;combat.cannonBurstSize=5;
  assert.equal(commandWeapons(combat,sector,[order],false,()=>1).ok,true);
  assert.equal(combat.firing,null);assert.equal(combat.own.mounts.find(m=>m.id===order.mountId).burst.remaining,4);
  ceaseFiring(combat);const stopped=combat.own.ammo['autocannon-120'];step(combat,sector,60,()=>1);
  assert.equal(combat.own.ammo['autocannon-120'],stopped);assert.ok(stopped<ammo);
});

test('cannon burst selection leaves rail-gun shots and manual CIWS firing slices unchanged',()=>{
  const {combat,sector}=setup();combat.own=createDamageShip('sdf-heavy-cruiser',true);combat.cannonBurstSize=20;
  Object.assign(sector.contacts[0],{x:0,y:10,z:0,vx:0,vy:0,vz:0});
  const before={...combat.own.ammo};
  commandWeapons(combat,sector,[{mountId:'rail-gun-1',targetId:'U-01',component:'hull'},
    {mountId:'ciws-30-1',targetId:'U-01',component:'hull'}],false,()=>0);
  assert.equal(combat.own.ammo['rail-gun'],before['rail-gun']-2);
  assert.equal(combat.own.ammo['ciws-30'],before['ciws-30']-10);
  assert.equal(combat.shots.find(s=>s.weapon==='rail-gun').damage,360);
  assert.equal(combat.shots.find(s=>s.weapon==='ciws-30').damage,1);
});

test('automatic jammers stay silent during routine traffic, engage only combatants, and stop after combat',()=>{
  const {combat,sector}=setup();updateElectronicWarfare(combat,sector);
  assert.ok([combat.own,...Object.values(combat.contacts)].every(ship=>!jammerEmitting(ship)));
  orderEngagement(combat,sector,'destroy',['E-04']);
  assert.equal(jammerEmitting(combat.own),true);assert.equal(jammerEmitting(combat.contacts['E-04']),true);
  assert.equal(jammerEmitting(combat.contacts['E-06']),false);
  ceaseFiring(combat);updateElectronicWarfare(combat,sector);
  assert.equal(jammerEmitting(combat.own),false);assert.equal(jammerEmitting(combat.contacts['E-04']),false);
  setJammerMode(combat,sector,'on');assert.equal(jammerEmitting(combat.own),true);
  combat.own.systems.jammer.hp=0;updateElectronicWarfare(combat,sector);assert.equal(jammerEmitting(combat.own),false);
});

test('jamming degrades gun and missile accuracy and loses distant precision locks without spending ammunition',()=>{
  for(const weapon of ['autocannon-120','mp-missiles'])for(const jammed of [false,true]){
    const {combat,sector}=setup(),target=combat.contacts['E-04'];
    Object.assign(sector.contacts.find(c=>c.id==='E-04'),{x:0,y:20,z:0,vx:0,vy:0,vz:0});
    target.jammer=jammed;target.jammerMode=jammed?'on':'off';
    const aim=weapon==='mp-missiles'?'engines':'hull',roll=weapon==='mp-missiles'?.75:.6;
    assert.equal(fireWeapon(combat,sector,'own',`${weapon}-1`,'E-04',aim,()=>roll).ok,true);
    assert.equal(combat.shots.length,jammed?0:1);
  }
  const {combat,sector}=setup(),target=combat.contacts['E-04'];target.jammer=true;target.jammerMode='on';
  Object.assign(sector.contacts.find(c=>c.id==='E-04'),{x:0,y:100,z:0,vx:0,vy:0,vz:0});
  const ammo=combat.own.ammo['as-missiles'],track=trackingSolution(combat,sector,'own','E-04');
  assert.equal(track.detected,true);assert.equal(track.precision,false);assert.ok(track.quality<.35);
  assert.match(fireWeapon(combat,sector,'own','as-missiles-1','E-04','hull',()=>0).message,/precision lock/);
  assert.equal(combat.own.ammo['as-missiles'],ammo);
  target.systems.jammer.hp=0;assert.equal(trackingSolution(combat,sector,'own','E-04').precision,true);
});

test('burn-through restores a held firing order for 15 seconds and enforces the cooldown across saves',()=>{
  const {combat,sector}=setup();
  Object.assign(sector.contacts.find(c=>c.id==='E-04'),{x:0,y:100,z:0,vx:0,vy:0,vz:0});
  combat.contacts['E-04'].jammerMode='on';combat.contacts['E-04'].jammer=true;
  startFiring(combat,sector,'as-missiles-1','E-04','hull');stepCombat(combat,sector,.01,()=>0);
  assert.equal(combat.own.ammo['as-missiles'],30);assert.equal(combat.firing.length,1);
  assert.equal(requestRadarBurnThrough(combat).ok,true);
  assert.equal(trackingSolution(combat,sector,'own','E-04').precision,true);
  assert.equal(trackingSolution(combat,sector,'own','E-04').quality,1);
  stepCombat(combat,sector,.01,()=>0);assert.equal(combat.own.ammo['as-missiles'],29);
  const restored=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts);
  assert.equal(restored.own.burnThroughReadyAt,combat.own.burnThroughReadyAt);
  assert.equal(restored.own.burnThroughUntil,combat.own.burnThroughUntil);
  stepCombat(restored,sector,radarBurnThrough.duration+.1,()=>1);
  assert.equal(trackingSolution(restored,sector,'own','E-04').precision,false);
  assert.equal(restored.own.ammo['as-missiles'],29);assert.equal(restored.firing.length,1);
  assert.equal(requestRadarBurnThrough(restored).ok,false);
  restored.time=restored.own.burnThroughReadyAt;assert.equal(requestRadarBurnThrough(restored).ok,true);
  const invalid=structuredClone(restored);invalid.own.burnThroughReadyAt=restored.time+181;
  assert.throws(()=>restoreCombat(invalid,sector.contacts));
});

test('burn-through needs active radar and power, cannot increase sensor range, and does not bypass hardware damage',()=>{
  const {combat,sector}=setup();combat.own.radar=false;
  assert.equal(requestRadarBurnThrough(combat).ok,false);assert.equal(combat.own.burnThroughReadyAt,0);
  combat.own.radar=true;combat.own.systems.sensors.hp=0;
  assert.equal(requestRadarBurnThrough(combat).ok,false);
  combat.own.systems.sensors.hp=combat.own.systems.sensors.max;
  Object.assign(sector.contacts.find(c=>c.id==='E-04'),{x:0,y:250,z:0});
  assert.equal(requestRadarBurnThrough(combat).ok,true);
  assert.equal(trackingSolution(combat,sector,'own','E-04').detected,false);
});

test('jamming emissions expose a ship to passive receivers without revealing its IFF or forcing combat',()=>{
  const {combat,sector}=setup();combat.own.radar=false;
  Object.assign(sector.contacts.find(c=>c.id==='E-04'),{x:0,y:150,z:0});
  syncElectronicTracking(combat,sector);assert.ok(!observeSector(sector).some(c=>c.id==='E-04'));
  combat.contacts['E-04'].jammerMode='on';syncElectronicTracking(combat,sector);
  const contact=observeSector(sector).find(c=>c.id==='E-04');
  assert.equal(contact.identified,false);assert.equal(contact.jammerEmitting,true);assert.equal(contact.precisionTrack,false);
  assert.deepEqual(combat.hostiles,[]);assert.equal(issueManeuver(sector,'intercept','E-04'),false);
  combat.own.radar=true;requestRadarBurnThrough(combat);syncElectronicTracking(combat,sector);
  assert.equal(observeSector(sector).find(c=>c.id==='E-04').precisionTrack,true);
});

test('GP, MP and autocannons can target silent jammer hardware and home on active jammer emissions',()=>{
  for(const weapon of ['gp-missiles','mp-missiles','autocannon-120'])for(const active of [true,false]){
    const {combat,sector}=setup();if(weapon==='gp-missiles')combat.own=createDamageShip('pirate-frigate',true);
    const target=combat.contacts['E-04'];target.jammer=active;target.jammerMode=active?'on':'off';target.ciwsAuto=false;
    Object.assign(sector.contacts.find(c=>c.id==='E-04'),{x:0,y:5,z:0,vx:0,vy:0,vz:0});
    const before=target.systems.jammer.hp;
    assert.equal(fireWeapon(combat,sector,'own',`${weapon}-1`,'E-04','jammer',()=>0).ok,true);
    assert.equal(combat.shots[0].role,weapons[weapon].missile?(active?'anti-jammer':'precision'):null);
    combat.hostiles=[];stepCombat(combat,sector,6,()=>0);assert.ok(target.systems.jammer.hp<before);
  }
  const {combat,sector}=setup();combat.own=createDamageShip('pirate-frigate',true);
  Object.assign(sector.contacts.find(c=>c.id==='E-04'),{x:0,y:100,z:0});
  combat.contacts['E-04'].jammer=true;
  assert.equal(trackingSolution(combat,sector,'own','E-04').precision,false);
  assert.equal(canFire(combat,sector,'own','gp-missiles-1','E-04','jammer'),null);
});

test('short-range IR fallback improves missile survival but cannot recover distant or cold targets',()=>{
  for(const range of [5,40]){
    const {combat,sector}=setup(),target=combat.contacts['E-04'];
    Object.assign(sector.contacts.find(c=>c.id==='E-04'),{x:0,y:range,z:0,vx:0,vy:0,vz:0});
    target.jammer=true;target.jammerMode='on';target.ciwsAuto=false;
    assert.equal(fireWeapon(combat,sector,'own','as-missiles-1','E-04','hull',()=>0).ok,true);combat.hostiles=[];
    const before=target.systems.hull.hp;stepCombat(combat,sector,range+1,()=>.7);
    assert.equal(target.systems.hull.hp<before,range===5);
  }
  const ship=createDamageShip('sdf-frigate');assert.ok(infraredTrackingQuality(ship,5)>.7);
  assert.equal(infraredTrackingQuality(ship,21),0);ship.systems.reactor.hp=0;assert.equal(infraredTrackingQuality(ship,5),0);
});

test('a missile guidance contest is not rerolled on each frame or after saving',()=>{
  const {combat,sector}=setup(),target=combat.contacts['E-04'];
  Object.assign(sector.contacts.find(c=>c.id==='E-04'),{x:0,y:5,z:0,vx:0,vy:0,vz:0});
  target.jammer=true;target.jammerMode='on';target.ciwsAuto=false;
  fireWeapon(combat,sector,'own','as-missiles-1','E-04','hull',()=>0);combat.hostiles=[];
  stepCombat(combat,sector,.05,()=>0);assert.equal(combat.shots[0].jammingChecked,true);
  const restored=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts),before=restored.contacts['E-04'].systems.hull.hp;
  stepCombat(restored,sector,6,()=>1);assert.ok(restored.contacts['E-04'].systems.hull.hp<before);
  assert.throws(()=>restoreCombat({...JSON.parse(JSON.stringify(combat)),own:{...combat.own,jammerMode:'invalid'}},sector.contacts));
});
