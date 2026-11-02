import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, parseSave, MAX_SAVE_BYTES } from '../save-game.mjs';
import { createSector, observeSector, issueManeuver, setManualHelm, addPatrolWaypoint, startPatrol, stepSector } from '../sector-model.mjs';
import { restoreBridgeState } from '../bridge-model.mjs';

function game(){
  const sector=createSector();observeSector(sector);
  return {navigation:{ship:{x:.766,y:.643},location:'Earth',route:[],active:false,paused:false,days:3.25,speed:10},
    bridge:{settings:{...restoreBridgeState(),selected:'tactical',watch:'heightened',radarRange:140},sector,tactical:{lockedIds:['F-03','U-01'],activeId:'F-03'}},
    selection:{id:'mars',name:'Mars',x:1.1,y:-1.1,type:'PLANET',color:'#c77d60',description:'Patrol destination'},
    logs:[{time:'06:00',message:'Patrol underway.'}]};
}
const roundTrip=value=>parseSave(JSON.stringify(createSave(value)));

test('JSON save preserves strategic progress, bridge settings, selection, logs, and target locks',()=>{
  const original=game(),before=structuredClone(original),saved=roundTrip(original);
  assert.equal(saved.format,'sdf-save');assert.equal(saved.version,2);
  assert.deepEqual(saved.navigation,original.navigation);assert.deepEqual(saved.bridge.settings,original.bridge.settings);
  assert.deepEqual(saved.selection,original.selection);assert.deepEqual(saved.logs,original.logs);
  assert.deepEqual(saved.bridge.tactical,original.bridge.tactical);assert.deepEqual(original,before);
});

test('local maneuver reloads paused with ship velocity, contact motion, and order intact',()=>{
  const original=game(),sector=original.bridge.sector;
  issueManeuver(sector,'maintain','F-03',35);stepSector(sector,12);
  const saved=roundTrip(original).bridge.sector;
  assert.equal(saved.running,false);assert.deepEqual(saved.own,sector.own);assert.deepEqual(saved.contacts,sector.contacts);
  assert.deepEqual(saved.order,sector.order);assert.deepEqual(saved.facing,sector.facing);assert.equal(saved.time,12);
  const time=saved.time;stepSector(saved,10);assert.equal(saved.time,time);
  saved.running=true;stepSector(saved,1);assert.equal(saved.time,time+1);
});

test('manual Helm and local patrol waypoints survive separate save round trips',()=>{
  const original=game(),sector=original.bridge.sector;
  setManualHelm(sector,{thrust:65,bearing:75,elevation:20,bow:42});stepSector(sector,8);
  let saved=roundTrip(original).bridge.sector;assert.deepEqual(saved.manual,sector.manual);assert.deepEqual(saved.order,{mode:'manual'});
  addPatrolWaypoint(sector,{x:-25,y:35,z:12});addPatrolWaypoint(sector,{x:-40,y:50,z:8});startPatrol(sector);
  saved=roundTrip(original).bridge.sector;assert.deepEqual(saved.route,sector.route);assert.deepEqual(saved.order,{mode:'patrol'});
});

test('active strategic journey resumes paused at the same position with all waypoints',()=>{
  const original=game();original.navigation.route=[original.selection];original.navigation.active=true;
  const saved=roundTrip(original);assert.equal(saved.navigation.active,true);assert.equal(saved.navigation.paused,true);
  assert.deepEqual(saved.navigation.route,original.navigation.route);assert.deepEqual(saved.navigation.ship,original.navigation.ship);
  assert.equal(saved.bridge.sector.running,false);
});

test('last-known sensor records retain verified identity without identifying an unknown track',()=>{
  const original=game(),sector=original.bridge.sector;
  const known=structuredClone(sector.memory['F-03']);
  sector.contacts.find(c=>c.id==='F-03').x=1000;sector.contacts.find(c=>c.id==='U-01').x=1000;
  const saved=roundTrip(original).bridge.sector;
  assert.equal(saved.memory['F-03'].observed.identified,true);assert.deepEqual(saved.memory['F-03'].position,known.position);
  assert.equal(saved.memory['U-01'].observed.identified,false);assert.equal(saved.memory['U-01'].observed.ship.label,'UNKNOWN SHIP TYPE');
  assert.deepEqual(saved.contacts,sector.contacts);
});

test('multi-leg EPD saves intermediate arrivals while retaining the suspended departure sector',()=>{
  const original=game();original.navigation.active=true;original.navigation.location='Mars';original.navigation.route=[original.selection];
  const saved=roundTrip(original);
  assert.equal(saved.navigation.location,'Mars');assert.equal(saved.navigation.paused,true);
  assert.equal(saved.bridge.sector.location,'Earth');assert.equal(saved.bridge.sector.running,false);
  assert.equal(saved.bridge.sector.order,null);
});

test('import rejects unrelated, malformed, oversized, and unsupported JSON',()=>{
  for(const text of ['not JSON','null','[]','{}'])assert.throws(()=>parseSave(text));
  assert.throws(()=>parseSave(' '.repeat(MAX_SAVE_BYTES+1)),/1 MB/);
  const saved=createSave(game());saved.version=99;assert.throws(()=>parseSave(JSON.stringify(saved)),/version/);
});

test('invalid saves cannot inject bad coordinates, mismatched sectors, orders, locks, or routes',()=>{
  const edits=[
    s=>s.navigation.ship.x=121,
    s=>s.navigation.days=-1,
    s=>s.navigation.paused='yes',
    s=>s.bridge.sector.location='Mars',
    s=>s.bridge.sector.own.vx=9000,
    s=>s.bridge.sector.facing={x:0,y:0,z:0},
    s=>s.bridge.sector.manual.thrust=101,
    s=>s.bridge.sector.contacts.push(s.bridge.sector.contacts[0]),
    s=>s.bridge.sector.order={mode:'maintain',targetId:'missing',range:25},
    s=>s.bridge.sector.route=[{x:100001,y:0,z:0,name:'Invalid'}],
    s=>s.bridge.tactical.activeId='missing',
    s=>s.bridge.sector.memory['F-03'].seen=1000,
    s=>{s.navigation.active=true;s.navigation.route=[s.selection];s.bridge.sector.order={mode:'manual'};}
  ];
  for(const edit of edits){const save=createSave(game());edit(save);assert.throws(()=>parseSave(JSON.stringify(save)));}
});

test('import reconstructs ship references from the catalog and strips unknown payload properties',()=>{
  const saved=createSave(game());saved.bridge.sector.memory['F-03'].observed.ship={label:'Injected',image:'https://example.invalid/image.png'};
  saved.bridge.sector.contacts[0].shipType='injected';saved.untrusted='discard';
  const loaded=parseSave(JSON.stringify(saved));assert.equal(loaded.untrusted,undefined);
  assert.equal(loaded.bridge.sector.memory['F-03'].observed.ship.label,'SDF - FRIGATE');
  assert.equal(loaded.bridge.sector.contacts[0].shipType,'privateer');
});

test('version 1 saves migrate to damage-aware saves without losing strategic or local progress',()=>{
  const saved=createSave(game());saved.version=1;delete saved.bridge.combat;
  const loaded=parseSave(JSON.stringify(saved));assert.equal(loaded.version,2);
  assert.deepEqual(loaded.navigation,saved.navigation);assert.deepEqual(loaded.bridge.sector.own,saved.bridge.sector.own);
  assert.equal(loaded.bridge.combat.own.systems.hull.hp,1000);assert.equal(loaded.bridge.combat.own.spares,200);
});

test('damage, missile presets, ammunition and repair jobs survive the complete JSON codec',()=>{
  const saved=createSave(game());saved.bridge.combat.own.systems['engine-1'].hp=40;
  saved.bridge.combat.own.spares=7;saved.bridge.combat.own.roles['mp-missiles']='anti-radiation';
  saved.bridge.combat.own.ammo['as-missiles']=4;saved.bridge.combat.own.jobs=[{systemId:'engine-1',progress:2.5,station:false}];
  const loaded=parseSave(JSON.stringify(saved));assert.deepEqual(loaded.bridge.combat,saved.bridge.combat);
});

test('automatic repair mode, per-system holds, and automatic labor survive the complete JSON codec',()=>{
  const saved=createSave(game()),ship=saved.bridge.combat.own;
  ship.repairHolds=['sensors'];ship.systems['engine-1'].hp=40;
  ship.jobs=[{systemId:'engine-1',progress:2.5,station:false,automatic:true}];
  assert.deepEqual(parseSave(JSON.stringify(saved)).bridge.combat,saved.bridge.combat);
  ship.autoRepair=false;ship.jobs=[];
  const loaded=parseSave(JSON.stringify(saved));assert.equal(loaded.bridge.combat.own.autoRepair,false);assert.deepEqual(loaded.bridge.combat.own.repairHolds,['sensors']);
});
