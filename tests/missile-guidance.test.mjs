import test from 'node:test';
import assert from 'node:assert/strict';
import {createCombat,createDamageShip,fireWeapon,stepCombat,refreshMissileGuidance,weapons,deployCountermeasures} from '../combat-model.mjs';
import {createSector,stepSector,relativeContact} from '../sector-model.mjs';
import {restoreCombat} from '../combat-save.mjs';
import {projectVelocity} from '../tactical-model.mjs';

function setup(weapon='as-missiles',axis='vy'){
  const combat=createCombat(),sector=createSector();combat.own.autoRepair=false;
  const enemy=sector.contacts.find(c=>c.id==='E-04');
  Object.assign(sector.own,{x:0,y:0,z:0,vx:0,vy:0,vz:0,[axis]:7200});
  Object.assign(enemy,{x:0,y:25,z:0,vx:0,vy:0,vz:0,[axis]:7200});
  const sourceId=weapon==='gp-missiles'?'E-04':'own',targetId=sourceId==='own'?'E-04':'own';
  if(sourceId==='E-04'){sector.own.y=25;enemy.y=0;}
  const target=targetId==='own'?combat.own:combat.contacts[targetId];
  target.systems.jammer.hp=0;target.jammerMode='off';target.ciwsAuto=false;
  sector.running=true;
  return {combat,sector,sourceId,targetId,target};
}

test('AS, MP and GP missiles inherit launch momentum and catch a target matching the launch ship at 7200 KPH',()=>{
  for(const weapon of ['as-missiles','mp-missiles','gp-missiles'])for(const axis of ['vx','vy']){
    const {combat,sector,sourceId,targetId,target}=setup(weapon,axis),aim=weapon==='mp-missiles'?'engines':'hull';
    assert.equal(fireWeapon(combat,sector,sourceId,`${weapon}-1`,targetId,aim,()=>0).ok,true);
    const shot=combat.shots[0];assert.equal(shot.launchVelocity[axis],7200);
    assert.ok(Math.abs(shot.vy-(axis==='vy'?10800:3600))<1e-8);
    if(axis==='vx')assert.ok(Math.abs(shot.vx-7200)<1e-8);
    combat.hostiles=[];const before=target.systems.hull.hp;
    for(let i=0;i<510;i++){stepSector(sector,.05);stepCombat(combat,sector,.05,()=>0);}
    assert.ok(target.systems.hull.hp<before,`${weapon}, ${axis}: missile must close and hit`);
  }
});

test('missiles approach the target on ship-centered radar with a destroyed jammer and preserve their target after surrender',()=>{
  const {combat,sector,target}=setup();
  fireWeapon(combat,sector,'own','as-missiles-1','E-04','hull',()=>0);
  target.surrendered=true;target.radar=false;combat.hostiles=[];
  const shot=combat.shots[0],relative=relativeContact(sector,shot);
  assert.equal(relative.vy,3600);assert.deepEqual(projectVelocity(relative,'top',1),{x:0,y:-1});
  const before=25;
  for(let i=0;i<20;i++){stepSector(sector,.05);stepCombat(combat,sector,.05,()=>0);}
  const enemy=sector.contacts.find(c=>c.id==='E-04');
  assert.ok(Math.hypot(shot.x-enemy.x,shot.y-enemy.y,shot.z-enemy.z)<before);
  assert.equal(shot.targetId,'E-04');assert.equal(shot.component,'hull');
});

test('missile launch momentum remains fixed if the firing ship turns or changes velocity',()=>{
  const {combat,sector}=setup('as-missiles','vx');
  fireWeapon(combat,sector,'own','as-missiles-1','E-04','hull',()=>0);
  const shot=combat.shots[0];combat.hostiles=[];
  sector.own.vx=-7200;sector.facing={x:1,y:0,z:0};
  refreshMissileGuidance(combat,sector);
  assert.deepEqual(shot.launchVelocity,{vx:7200,vy:0,vz:0});
  assert.ok(Math.abs(shot.vx-7200)<1e-8);assert.ok(Math.abs(shot.vy-3600)<1e-8);
  const saved=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts);
  assert.deepEqual(saved.shots[0].launchVelocity,shot.launchVelocity);
  refreshMissileGuidance(saved,sector);assert.equal(saved.shots[0].vx,shot.vx);
});

test('older in-flight missiles adopt a launch frame once without moving time, restoring ammunition or rerolling guidance',()=>{
  const {combat,sector}=setup();fireWeapon(combat,sector,'own','as-missiles-1','E-04','hull',()=>0);
  delete combat.shots[0].launchVelocity;combat.shots[0].vy=3600;combat.shots[0].jammingChecked=true;
  const loaded=restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts),before={time:loaded.time,ammo:loaded.own.ammo['as-missiles'],y:loaded.shots[0].y};
  refreshMissileGuidance(loaded,sector);
  assert.equal(loaded.shots[0].vy,10800);assert.equal(loaded.shots[0].jammingChecked,true);
  assert.deepEqual({time:loaded.time,ammo:loaded.own.ammo['as-missiles'],y:loaded.shots[0].y},before);
  sector.own.vy=0;refreshMissileGuidance(loaded,sector);assert.equal(loaded.shots[0].launchVelocity.vy,7200);
  for(const value of [null,{vx:0,vy:'7200',vz:0},{vx:0,vy:Infinity,vz:0}]){
    const bad=structuredClone(loaded);bad.shots[0].launchVelocity=value;assert.throws(()=>restoreCombat(bad,sector.contacts));
  }
  assert.equal(weapons['as-missiles'].speed,1);
});

test('deployed chaff and flares can spoof a terminal salvo without spending additional charges',()=>{
  for(const type of ['chaff','flares']){
    const {combat,sector,sourceId,targetId,target}=setup('gp-missiles');
    sector.own.y=16;
    assert.equal(fireWeapon(combat,sector,sourceId,'gp-missiles-1',targetId,'hull',()=>0,5).ok,true);
    assert.equal(deployCountermeasures(combat,type).ok,true);
    stepCombat(combat,sector,.05,()=>1);
    assert.equal(combat.shots.length,5);
    for(const shot of combat.shots)shot.y=1;
    stepCombat(combat,sector,.05,()=>1);
    assert.equal(combat.shots.length,0);
    assert.equal(target.ammo[type],target.maxAmmo[type]-1);
    assert.ok(combat.log.some(message=>message.match(/decoy spoofed gp-missiles guidance/)));
  }
});

test('a surviving missile does not reroll the same decoy check after loading a save',()=>{
  const {combat,sector,sourceId,targetId,target}=setup('gp-missiles');
  sector.own.y=5;sector.own.vy=0;sector.contacts.find(c=>c.id==='E-04').vy=0;
  assert.equal(fireWeapon(combat,sector,sourceId,'gp-missiles-1',targetId,'hull',()=>0).ok,true);
  deployCountermeasures(combat,'chaff');
  stepCombat(combat,sector,.05,()=>0);
  assert.deepEqual(combat.shots[0].countermeasuresChecked,{chaff:true});
  const loaded=restoreCombat(structuredClone(combat),sector.contacts);
  stepCombat(loaded,sector,6,()=>1);
  assert.ok(loaded.own.systems.hull.hp<target.systems.hull.hp);
  assert.equal(loaded.own.ammo.chaff,29);
});

test('expired decoys and emitter seekers bypass spoofing',()=>{
  for(const component of ['hull','sensors']){
    const {combat,sector,sourceId,targetId,target}=setup('gp-missiles');
    sector.own.y=5;sector.own.vy=0;sector.contacts.find(c=>c.id==='E-04').vy=0;
    assert.equal(fireWeapon(combat,sector,sourceId,'gp-missiles-1',targetId,component,()=>0).ok,true);
    deployCountermeasures(combat,'chaff');
    deployCountermeasures(combat,'flares');
    if(component==='hull')combat.time=10;
    const hull=target.systems.hull.hp;
    stepCombat(combat,sector,6,()=>1);
    assert.ok(target.systems.hull.hp<hull);
  }
});
