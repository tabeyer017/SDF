import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, parseSave, MAX_SAVE_BYTES } from '../save-game.mjs';
import { createSector, observeSector, issueManeuver, setManualHelm, addPatrolWaypoint, startPatrol, stepSector } from '../sector-model.mjs';
import { restoreBridgeState } from '../bridge-model.mjs';
import { createCombat,orderAlliedSupport,requestSupportShip,stepCombat,orderEngagement } from '../combat-model.mjs';
import { earthPatrolContacts } from '../tactical-model.mjs';

function game(){
  const sector=createSector();observeSector(sector);
  return {navigation:{ship:{x:.766,y:.643},location:'Earth',route:[],active:false,paused:false,days:3.25,speed:10},
    bridge:{settings:{...restoreBridgeState(),selected:'tactical',watch:'heightened',radarRange:140},sector,tactical:{lockedIds:['F-03','U-01'],activeId:'F-03',priorities:{'F-03':1,'U-01':2}}},
    selection:{id:'mars',name:'Mars',x:1.1,y:-1.1,type:'PLANET',color:'#c77d60',description:'Patrol destination'},
    logs:[{time:'06:00',message:'Patrol underway.'}]};
}
const roundTrip=value=>parseSave(JSON.stringify(createSave(value)));

test('a new Earth patrol saves and reloads with civilian and SDF traffic only',()=>{
  const original=game(),sector=createSector(earthPatrolContacts);
  observeSector(sector);
  original.bridge.sector=sector;
  original.bridge.combat=createCombat(sector.contacts);
  const loaded=roundTrip(original);
  assert.deepEqual(loaded.bridge.sector.contacts,sector.contacts);
  assert.equal(sector.contacts.filter(contact=>contact.type==='neutral').length,6);
  assert.equal(sector.contacts.filter(contact=>contact.type==='friendly').length,4);
  assert.equal(sector.contacts.length,10);
  assert.deepEqual(Object.keys(loaded.bridge.combat.contacts),sector.contacts.map(contact=>contact.id));
});

test('JSON save preserves strategic progress, bridge settings, selection, logs, and target locks',()=>{
  const original=game(),before=structuredClone(original),saved=roundTrip(original);
  assert.equal(saved.format,'sdf-save');assert.equal(saved.version,2);
  assert.deepEqual(saved.navigation,original.navigation);assert.deepEqual(saved.bridge.settings,original.bridge.settings);
  assert.deepEqual(saved.selection,original.selection);assert.deepEqual(saved.logs,original.logs);
  assert.deepEqual(saved.bridge.tactical,original.bridge.tactical);assert.deepEqual(original,before);
});

test('v2 ship saves preserve valid reactor allocations and migrate missing allocations to balanced power',()=>{
  const original=game();
  original.bridge.combat=createCombat(original.bridge.sector.contacts);
  original.bridge.combat.own.powerAllocation={engines:0,weapons:40,sensors:60};
  const saved=roundTrip(original);
  assert.deepEqual(saved.bridge.combat.own.powerAllocation,original.bridge.combat.own.powerAllocation);
  for(const invalid of [
    {engines:34,weapons:33,sensors:34},
    {engines:-1,weapons:51,sensors:50},
    {engines:34.5,weapons:32.5,sensors:33},
    {engines:34,weapons:33}
  ]){
    saved.bridge.combat.own.powerAllocation=invalid;
    assert.throws(()=>parseSave(JSON.stringify(saved)),/combat data/);
  }
  delete saved.bridge.combat.own.powerAllocation;
  delete saved.bridge.combat.contacts['E-04'].powerAllocation;
  const restored=parseSave(JSON.stringify(saved));
  assert.deepEqual(restored.bridge.combat.own.powerAllocation,{engines:34,weapons:33,sensors:33});
  assert.deepEqual(restored.bridge.combat.contacts['E-04'].powerAllocation,{engines:34,weapons:33,sensors:33});
});

test('legacy Security saves reopen in Tactical without changing the watch, patrol, or locks',()=>{
  const saved=createSave(game());saved.bridge.settings.selected='security';
  const loaded=parseSave(JSON.stringify(saved));
  assert.equal(loaded.bridge.settings.selected,'tactical');assert.equal(loaded.bridge.settings.watch,'heightened');
  assert.deepEqual(loaded.navigation,saved.navigation);assert.deepEqual(loaded.bridge.tactical,saved.bridge.tactical);
});

test('half and three-quarter local speeds survive saves while unsupported rates are rejected',()=>{
  for(const rate of [.5,.75]){
    const original=game();original.bridge.sector.rate=rate;original.bridge.sector.running=true;
    const loaded=roundTrip(original);
    assert.equal(loaded.bridge.sector.rate,rate);
    assert.equal(loaded.bridge.sector.running,false);
  }
  for(const rate of [0,.25,.6,-.5,'0.5']){
    const saved=createSave(game());saved.bridge.sector.rate=rate;
    assert.throws(()=>parseSave(JSON.stringify(saved)),/local simulation speed/);
  }
});

test('Engage orders and their priority list survive a portable save',()=>{
  const original=game();original.bridge.combat=createCombat(original.bridge.sector.contacts);
  assert.equal(orderEngagement(original.bridge.combat,original.bridge.sector,'engage',['E-04','E-06']).ok,true);
  const loaded=roundTrip(original);
  assert.deepEqual(loaded.bridge.combat.engagement,original.bridge.combat.engagement);
  assert.deepEqual(loaded.bridge.combat.firing,original.bridge.combat.firing);
});

test('hard-turn bow and suspended target tracking survive a JSON save',()=>{
  const original=game();issueManeuver(original.bridge.sector,'maintain','F-03',25);
  issueManeuver(original.bridge.sector,'port');
  const loaded=roundTrip(original);
  assert.deepEqual(loaded.bridge.sector.facing,original.bridge.sector.facing);
  assert.equal(loaded.bridge.sector.faceTarget,false);
  assert.deepEqual(loaded.bridge.sector.order,original.bridge.sector.order);
});

test('JSON saves retain allied support and reject support orders during EPD transit',()=>{
  const original=game();original.bridge.combat=createCombat(original.bridge.sector.contacts);
  assert.equal(orderAlliedSupport(original.bridge.combat,original.bridge.sector,'F-03','attack-targets',['E-04']).accepted,true);
  const loaded=roundTrip(original);assert.deepEqual(loaded.bridge.combat.alliedOrders,original.bridge.combat.alliedOrders);
  assert.equal(loaded.bridge.sector.running,false);
  original.navigation.route=[original.selection];original.navigation.active=true;
  assert.throws(()=>createSave(original),/Combat cannot run during EPD transit/);
});

test('portable saves retain a resupply tender and its service progress without resetting ammunition',()=>{
  const original=game(),sector=original.bridge.sector;original.bridge.combat=createCombat(sector.contacts);
  original.bridge.combat.own.ammo['as-missiles']=0;requestSupportShip(original.bridge.combat,sector);
  let loaded=roundTrip(original);assert.deepEqual(loaded.bridge.combat.support,original.bridge.combat.support);
  for(let t=0;t<180;t++)stepCombat(original.bridge.combat,sector,1,()=>0);
  loaded=roundTrip(original);assert.equal(loaded.bridge.combat.service.provider,'tender');
  assert.equal(loaded.bridge.combat.own.ammo['as-missiles'],0);assert.equal(loaded.bridge.sector.running,false);
  const mismatched=createSave(original);mismatched.bridge.combat.support.location='Mars';
  assert.throws(()=>parseSave(JSON.stringify(mismatched)),/another sector/);
  const transit=createSave(original);transit.navigation.active=true;transit.navigation.route=[transit.selection];
  assert.throws(()=>parseSave(JSON.stringify(transit)),/EPD transit/);
});

test('target priorities survive saves, while old saves assign distinct priorities without changing locks',()=>{
  const original=game();original.bridge.tactical.priorities={'F-03':8,'U-01':1};
  const loaded=roundTrip(original);assert.deepEqual(loaded.bridge.tactical,original.bridge.tactical);
  delete loaded.bridge.tactical.priorities;
  const legacy=parseSave(JSON.stringify(loaded));assert.deepEqual(legacy.bridge.tactical.lockedIds,['F-03','U-01']);assert.equal(legacy.bridge.tactical.activeId,'F-03');
  assert.deepEqual(legacy.bridge.tactical.priorities,{'F-03':1,'U-01':2});
});

test('save imports reject duplicate, missing, invalid, and unrelated target-priority assignments',()=>{
  for(const priorities of [{'F-03':1,'U-01':1},{'F-03':1},{'F-03':0,'U-01':2},{'F-03':'1','U-01':2},{'F-03':1.5,'U-01':2},{'F-03':1,'U-01':2,'E-04':3},null]){
    const saved=createSave(game());saved.bridge.tactical.priorities=priorities;assert.throws(()=>parseSave(JSON.stringify(saved)),/priorit/);
  }
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

test('legacy Helm saves reopen in Local Flight without changing manual orders or motion',()=>{
  const original=game(),sector=original.bridge.sector;original.bridge.settings.selected='helm';
  setManualHelm(sector,{thrust:65,bearing:75,elevation:20,bow:42});stepSector(sector,8);addPatrolWaypoint(sector,{x:-25,y:35,z:12});
  const loaded=roundTrip(original);
  assert.equal(loaded.bridge.settings.selected,'navigation');assert.equal(loaded.bridge.sector.running,false);
  for(const key of ['manual','order','own','facing','route'])assert.deepEqual(loaded.bridge.sector[key],sector[key]);
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

test('Flight Control System Map selection preserves the shared patrol and bridge settings in saves',()=>{
  const original=game();original.bridge.settings.selected='system-map';
  const loaded=roundTrip(original);assert.equal(loaded.bridge.settings.selected,'system-map');
  assert.deepEqual(loaded.navigation,original.navigation);assert.deepEqual(loaded.bridge.sector.own,original.bridge.sector.own);
  assert.deepEqual(loaded.bridge.settings,original.bridge.settings);
});
