import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombat,createDamageShip,damageClasses,weapons,weaponAimOptions,aimPointState,nextAimPoint,applyDamage,shipPerformance,fireWeapon,canFire,orderEngagement,startFiring,commandWeapons,ceaseFiring,stepCombat,queueRepair,scheduleRepairs,setAutomaticRepairs,cancelRepair,advanceMaintenance,containEmergency,dock,requestService,changeEncounter } from '../combat-model.mjs';
import { createSector,stepSector } from '../sector-model.mjs';
import { restoreCombat } from '../combat-save.mjs';
import { shipTypes,trainingContacts } from '../tactical-model.mjs';
const setup=()=>({sector:createSector(),combat:createCombat()});
function step(c,s,seconds,rng=()=>0){for(let t=0;t<seconds-1e-8;t+=.05)stepCombat(c,s,Math.min(.05,seconds-t),rng);}

test('all twelve classes have individual systems, engines, mounts, finite parts and ammunition',()=>{
  assert.equal(Object.keys(damageClasses).length,12);
  for(const [id,catalog] of Object.entries(shipTypes)){
    const ship=createDamageShip(id);assert.ok(ship.systems.hull.hp>0);assert.ok(ship.spares>0);
    assert.equal(Object.keys(ship.systems).filter(k=>k.startsWith('engine-')).length,damageClasses[id][4]);
    for(const weapon of catalog.loadout){assert.ok(ship.mounts.some(m=>m.weapon===weapon));assert.ok(ship.ammo[weapon]>0);}
  }
  const heavy=createDamageShip('sdf-heavy-cruiser');assert.equal(heavy.mounts.filter(m=>m.weapon==='rail-gun').length,1);
  assert.equal(heavy.mounts.find(m=>m.weapon==='rail-gun').barrels,2);
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
  assert.match(canFire(combat,sector,'own','rail-gun-1','U-01'),/reloading/);
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
});

test('continuous mount orders retain independent targets, reloads, and selective cease fire',()=>{
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
    target[emitter]=false;assert.match(canFire(combat,sector,'own','mp-missiles-1','U-01',component),/not emitting/);
    target[emitter]=true;
    assert.equal(fireWeapon(combat,sector,'own','mp-missiles-1','U-01',component,()=>0).ok,true);
    const shot=combat.shots[0];assert.equal(shot.role,role);assert.equal(shot.component,component);
    combat.own.roles['mp-missiles']=null;assert.equal(shot.role,role);
    target[emitter]=false;combat.hostiles=[];stepCombat(combat,sector,.05,()=>1);assert.ok(!combat.shots.includes(shot));
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
  for(let i=0;i<2;i++)combat.shots.push({...template,id:`shot:${combat.nextShot++}`});
  const ammo=combat.own.ammo['ciws-30'],hull=combat.own.systems.hull.hp;
  stepCombat(combat,sector,.05,()=>0);
  const mounts=combat.own.mounts.filter(m=>m.weapon==='ciws-30');
  assert.equal(new Set(mounts.map(m=>m.ciwsTarget)).size,2);
  assert.equal(combat.own.ammo['ciws-30'],ammo-150);
  assert.ok(mounts.every(m=>m.readyAt-combat.time>=10&&m.readyAt-combat.time<=15));
  const restored=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts);
  assert.deepEqual(restored.own.mounts,combat.own.mounts);
  step(restored,sector,8,()=>0);
  assert.ok(restored.own.systems.hull.hp<hull);
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
  assert.ok(combat.firing.every(f=>['engines','weapons'].includes(f.component)));
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
  assert.ok(combat.firing.every(f=>f.targetId===b.id&&['hull','engines'].includes(f.component)));
  Object.assign(a,{y:5});stepCombat(combat,sector,.01,()=>1);
  assert.ok(combat.firing.every(f=>f.targetId===a.id));
});
