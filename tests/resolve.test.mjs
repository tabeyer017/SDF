import test from 'node:test';
import assert from 'node:assert/strict';
import {createCombat,updateEnemyResolve,stepCombat,syncElectronicTracking,fireWeapon,canFire,jammerEmitting,changeEncounter,orderEngagement,surrenderShip,commandWeapons} from '../combat-model.mjs';
import {createSector,stepSector,observeSector} from '../sector-model.mjs';
import {createCommunications,pollCommunications,restoreCommunications} from '../communications-model.mjs';
import {restoreCombat} from '../combat-save.mjs';
import {createSave,parseSave} from '../save-game.mjs';
import {restoreBridgeState} from '../bridge-model.mjs';

function setup(){
  const sector=createSector(),combat=createCombat();combat.own.autoRepair=false;
  const contact=sector.contacts.find(c=>c.id==='E-04'),enemy=combat.contacts['E-04'];
  Object.assign(contact,{x:0,y:40,z:0,vx:0,vy:0,vz:0});combat.hostiles=['E-04'];
  const state=createCommunications();
  const context=()=>({sector,combat,contacts:observeSector(sector),range:200,inTransit:false,days:0});
  return {sector,combat,contact,enemy,state,context};
}
function enginesOff(ship){for(const [id,system] of Object.entries(ship.systems))if(id.startsWith('engine-'))system.hp=0;}
function advance(game,seconds){game.sector.running=true;for(let i=0;i<seconds;i++){stepSector(game.sector,1);stepCombat(game.combat,game.sector,1,()=>1);}game.sector.running=false;}

test('Engage suppresses defenses then targets offensive weapons and survives a save',()=>{
  const {combat,sector,enemy,contact}=setup();contact.y=10;
  assert.equal(orderEngagement(combat,sector,'engage',['E-04']).ok,true);
  assert.ok(combat.firing.every(f=>f.component==='ciws'));
  assert.deepEqual(restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts).engagement,combat.engagement);
  for(const mount of enemy.mounts.filter(m=>m.weapon==='ciws-30'))enemy.systems[mount.id].hp=0;
  enemy.jammerMode='on';enemy.jammer=true;
  stepCombat(combat,sector,.01,()=>1);
  assert.ok(combat.firing.length);assert.ok(combat.firing.every(f=>f.component==='jammer'));
  enemy.systems.jammer.hp=0;
  stepCombat(combat,sector,.01,()=>1);
  assert.ok(combat.firing.length);assert.ok(combat.firing.every(f=>f.component==='weapons'));
});

test('Engage ends without further fire when offensive mounts, ammunition, main power or hull are lost',()=>{
  for(const loss of ['mounts','ammunition','power','hull']){
    const {combat,sector,enemy,contact}=setup();contact.y=10;
    orderEngagement(combat,sector,'engage',['E-04']);const ammo={...combat.own.ammo};
    if(loss==='mounts')for(const mount of enemy.mounts)if(mount.weapon!=='ciws-30')enemy.systems[mount.id].hp=0;
    if(loss==='ammunition')for(const mount of enemy.mounts)if(mount.weapon!=='ciws-30')enemy.ammo[mount.weapon]=0;
    if(loss==='power')enemy.systems.power.hp=0;
    if(loss==='hull')enemy.systems.hull.hp=0;
    stepCombat(combat,sector,.01,()=>1);
    assert.equal(combat.engagement,null,loss);assert.equal(combat.firing,null,loss);
    assert.deepEqual(combat.own.ammo,ammo,loss);
    assert.ok(!combat.own.mounts.some(m=>m.burst),loss);
  }
  const {combat,sector,enemy}=setup();enginesOff(enemy);
  assert.equal(orderEngagement(combat,sector,'engage',['E-04']).ok,true);
  stepCombat(combat,sector,.01,()=>1);assert.equal(enemy.surrendered,false);assert.ok(combat.engagement);
});

test('an impact that disables the last offensive mount ends Engage during the same simulation step',()=>{
  const {combat,sector,enemy,contact}=setup();contact.y=1;
  for(const mount of enemy.mounts)enemy.systems[mount.id].hp=0;
  enemy.systems['autocannon-75-1'].hp=1;enemy.systems.jammer.hp=0;
  orderEngagement(combat,sector,'engage',['E-04']);
  fireWeapon(combat,sector,'own','autocannon-120-1','E-04','weapons',()=>0,1,5);
  stepCombat(combat,sector,1,()=>0);
  assert.equal(enemy.systems['autocannon-75-1'].hp,0);
  assert.ok(enemy.systems.hull.hp>0);
  assert.equal(combat.engagement,null);assert.equal(combat.firing,null);
  assert.ok(!combat.own.mounts.some(m=>m.burst));
});

test('Engage clears neutralized-target bursts and overrides while continuing against other threats',()=>{
  const {combat,sector,enemy,contact}=setup();contact.y=10;
  Object.assign(sector.contacts.find(c=>c.id==='E-06'),{x:0,y:12,z:0});
  orderEngagement(combat,sector,'engage',['E-04','E-06']);
  fireWeapon(combat,sector,'own','autocannon-120-1','E-04','ciws',()=>0,1,5);
  const shot=combat.shots[0];
  commandWeapons(combat,sector,[{mountId:'autocannon-120-2',targetId:'E-04',component:'hull'}],true);
  for(const mount of enemy.mounts)if(mount.weapon!=='ciws-30')enemy.systems[mount.id].hp=0;
  stepCombat(combat,sector,.01,()=>1);
  assert.deepEqual(combat.engagement.targetIds,['E-06']);
  assert.ok(combat.firing.length);assert.ok(combat.firing.every(f=>f.targetId==='E-06'));
  assert.ok(!combat.own.mounts.some(m=>m.burst?.targetId==='E-04'));
  assert.ok(combat.shots.includes(shot),'already-fired projectiles remain in flight');
});

test('surrender immediately stops Engage fire on that ship and preserves other engagements',()=>{
  const {combat,sector,contact}=setup();contact.y=10;
  Object.assign(sector.contacts.find(c=>c.id==='E-06'),{x:0,y:12,z:0});
  orderEngagement(combat,sector,'engage',['E-04','E-06']);
  fireWeapon(combat,sector,'own','autocannon-120-1','E-04','ciws',()=>0,1,5);
  const shot=combat.shots[0];surrenderShip(combat,'E-04','We surrender');
  assert.equal(combat.contacts['E-04'].surrendered,true);
  assert.deepEqual(combat.engagement.targetIds,['E-06']);
  assert.ok(!(combat.firing??[]).some(f=>f.targetId==='E-04'));
  assert.ok(!combat.own.mounts.some(m=>m.burst?.targetId==='E-04'));
  assert.ok(combat.shots.includes(shot));
});

test('pirates disengage earlier than disciplined SDF opponents, with stable decisions and no panic in bystanders',()=>{
  for(let repeat=0;repeat<2;repeat++){
    const {combat,sector,enemy}=setup();enemy.systems.hull.hp=enemy.systems.hull.max*.54;
    const sdf=combat.contacts['F-03'];sdf.systems.hull.hp=sdf.systems.hull.max*.54;combat.hostiles.push('F-03');
    const bystander=combat.contacts['N-02'];bystander.systems.hull.hp=bystander.systems.hull.max*.2;
    updateEnemyResolve(combat,sector);
    assert.equal(enemy.combatResponse.mode,'retreating');assert.equal(sdf.combatResponse,null);assert.equal(bystander.combatResponse,null);
    const since=enemy.combatResponse.since;enemy.systems.hull.hp=enemy.systems.hull.max;updateEnemyResolve(combat,sector);
    assert.equal(enemy.combatResponse.since,since);assert.equal(enemy.combatResponse.notices.length,1);
  }
});

test('exhausted offensive weapons prompt escape while CIWS and jamming remain available',()=>{
  const game=setup(),{combat,sector,enemy,contact}=game;
  for(const mount of enemy.mounts)if(mount.weapon!=='ciws-30')enemy.ammo[mount.weapon]=0;
  stepCombat(combat,sector,1,()=>0);
  assert.equal(enemy.combatResponse.mode,'retreating');assert.ok(contact.vy>0);assert.equal(jammerEmitting(enemy),true);assert.equal(enemy.ciwsAuto,true);
  assert.ok(!combat.shots.some(s=>s.sourceId==='E-04'));
  assert.match(canFire(combat,sector,'E-04','gp-missiles-1','own','hull'),/disengaging/);
  contact.y=10;fireWeapon(combat,sector,'own','as-missiles-1','E-04','hull',()=>0);stepCombat(combat,sector,1,()=>0);
  advance(game,10);
  assert.ok(enemy.ammo['ciws-30']<enemy.maxAmmo['ciws-30']);
});

test('losing CIWS and jammer alone does not cause surrender, but sustained missile pressure prompts retreat',()=>{
  const {combat,sector,enemy}=setup();
  for(const mount of enemy.mounts.filter(m=>m.weapon==='ciws-30'))enemy.systems[mount.id].hp=0;enemy.systems.jammer.hp=0;
  updateEnemyResolve(combat,sector);assert.equal(enemy.combatResponse,null);
  assert.equal(fireWeapon(combat,sector,'own','as-missiles-1','E-04','hull',()=>0,5).ok,true);
  updateEnemyResolve(combat,sector);assert.equal(enemy.combatResponse.mode,'retreating');assert.equal(enemy.surrendered,false);
});

test('a critically damaged immobilized ship surrenders and clears only engagements against itself',()=>{
  const {combat,sector,enemy}=setup();
  fireWeapon(combat,sector,'own','as-missiles-1','E-04','hull',()=>0);const shot=combat.shots[0];
  enemy.systems.hull.hp=enemy.systems.hull.max*.35;enginesOff(enemy);
  combat.firing=[{mountId:'autocannon-120-1',targetId:'E-04',component:'hull'},{mountId:'autocannon-120-2',targetId:'E-06',component:'hull'}];
  combat.engagement={objective:'destroy',targetIds:['E-04','E-06'],overrides:[]};
  combat.alliedOrders={'F-03':{mode:'attack-targets',targetIds:['E-04','E-06']}};
  updateEnemyResolve(combat,sector);
  assert.equal(enemy.surrendered,true);assert.equal(enemy.combatResponse.mode,'surrendered');assert.equal(enemy.radar,false);assert.equal(enemy.jammer,false);assert.equal(enemy.ciwsAuto,false);
  assert.deepEqual(combat.hostiles,[]);assert.deepEqual(combat.engagement.targetIds,['E-06']);
  assert.deepEqual(combat.firing.map(f=>f.targetId),['E-06']);assert.deepEqual(combat.alliedOrders['F-03'].targetIds,['E-06']);
  assert.equal(combat.shots[0],shot);assert.match(canFire(combat,sector,'E-04','gp-missiles-1','own'),/surrendered/);
});

test('a failed escape and a severe emergency can force surrender without deleting momentum',()=>{
  const {combat,sector,enemy,contact}=setup();enemy.systems.hull.hp=enemy.systems.hull.max*.35;
  updateEnemyResolve(combat,sector);assert.equal(enemy.surrendered,false);
  combat.time=21;updateEnemyResolve(combat,sector,21);const velocity=contact.vy;updateEnemyResolve(combat,sector);
  assert.equal(enemy.surrendered,true);assert.equal(contact.vy,velocity);
  const emergency=setup();enginesOff(emergency.enemy);emergency.enemy.fire=true;emergency.enemy.breach=true;emergency.enemy.air=200;
  updateEnemyResolve(emergency.combat,emergency.sector);assert.equal(emergency.enemy.surrendered,true);
  const coasting=setup();coasting.contact.y=100;coasting.contact.vy=7200;enginesOff(coasting.enemy);coasting.enemy.systems.hull.hp=coasting.enemy.systems.hull.max*.35;
  updateEnemyResolve(coasting.combat,coasting.sector);assert.equal(coasting.enemy.surrendered,false);assert.equal(coasting.enemy.combatResponse.mode,'retreating');assert.equal(coasting.contact.vy,7200);
});

test('retreating ships leave real sensor coverage, retain last-known records, and can be reacquired',()=>{
  const game=setup(),{combat,sector,enemy,contact,state,context}=game;enemy.systems.hull.hp=enemy.systems.hull.max*.54;
  syncElectronicTracking(combat,sector);observeSector(sector);stepCombat(combat,sector,1,()=>1);
  assert.equal(pollCommunications(state,context()),true);assert.ok(state.messages.some(m=>m.subject==='Sensor watch · Enemy disengaging'));
  advance(game,180);
  assert.ok(contact.y>200);assert.equal(enemy.combatResponse.contactLost,true);
  assert.ok(!observeSector(sector).some(c=>c.id==='E-04'));assert.ok(sector.memory['E-04'].position.y<=200);
  assert.equal(pollCommunications(state,context()),true);
  const lost=state.messages.filter(m=>m.subject==='Sensor watch · Contact lost');assert.equal(lost.length,1);assert.match(lost[0].body,/Escape is not confirmed/);
  assert.equal(pollCommunications(state,context()),false);
  sector.own.y=contact.y-30;stepCombat(combat,sector,.01,()=>1);
  assert.equal(enemy.combatResponse.contactLost,false);assert.ok(observeSector(sector).some(c=>c.id==='E-04'));
});

test('autonomous surrender is announced once and an offline transmitter is not given a fabricated voice message',()=>{
  for(const communications of [true,false]){
    const {combat,sector,enemy,state,context}=setup();enemy.systems.hull.hp=enemy.systems.hull.max*.35;enginesOff(enemy);
    if(!communications)enemy.systems.communications.hp=0;
    updateEnemyResolve(combat,sector);syncElectronicTracking(combat,sector);
    assert.equal(pollCommunications(state,context()),true);
    const notices=state.messages.filter(m=>m.subject==='Surrender offered');assert.equal(notices.length,1);
    assert.match(notices[0].body,communications?/We surrender/:/no surrender transmission received/);
    assert.equal(pollCommunications(state,context()),false);
    assert.deepEqual(restoreCommunications(JSON.parse(JSON.stringify(state))).messages,state.messages);
  }
});

test('retreat decisions, motion and reported Comms notices round-trip through a complete JSON save',()=>{
  const game=setup(),{combat,sector,enemy,state,context}=game;enemy.systems.hull.hp=enemy.systems.hull.max*.54;
  stepCombat(combat,sector,1,()=>1);syncElectronicTracking(combat,sector);pollCommunications(state,context());
  const save=createSave({navigation:{ship:{x:1,y:0},location:'Earth',route:[],active:false,paused:false,days:0,speed:1},
    bridge:{settings:restoreBridgeState(),sector,combat,communications:state,tactical:{lockedIds:['E-04'],activeId:'E-04',priorities:{'E-04':1}}},selection:{x:1,y:0,name:'Earth'},logs:[]});
  const restored=parseSave(JSON.stringify(save)).bridge;
  assert.equal(restored.sector.running,false);assert.deepEqual(restored.combat.contacts['E-04'].combatResponse,enemy.combatResponse);
  assert.equal(restored.sector.contacts.find(c=>c.id==='E-04').vy,game.contact.vy);
  assert.equal(pollCommunications(restored.communications,{...context(),sector:restored.sector,combat:restored.combat,contacts:observeSector(restored.sector)}),false);
  const old=structuredClone(combat);for(const ship of [old.own,...Object.values(old.contacts)]){delete ship.combatResponse;delete ship.underMissileFireUntil;}
  assert.equal(restoreCombat(old,sector.contacts).contacts['E-04'].combatResponse,null);
  for(const edit of [r=>r.mode='escaped',r=>r.opponentId='missing',r=>r.since=1e9,r=>r.notices.push({...r.notices[0]})]){
    const bad=structuredClone(combat);edit(bad.contacts['E-04'].combatResponse);assert.throws(()=>restoreCombat(bad,sector.contacts));
  }
  changeEncounter(combat,sector.contacts);assert.equal(combat.contacts['E-04'].combatResponse,null);
});
