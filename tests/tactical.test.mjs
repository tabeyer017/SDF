import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { radarRanges, rangeRings, projectContact, contactsInRange, projectVelocity, contactDistance, contactSpeed, contactClosureRate, armamentTypes, countermeasureTypes, shipTypes, shipFiveViews, trainingContacts, selectTargets, prioritizeTargets, restoreTargetPriorities, MAX_TARGET_PRIORITY, observeContact, IFF_RANGE_KM, IFF_IDENTIFICATION_CHANCE } from '../tactical-model.mjs';
import { restoreBridgeState } from '../bridge-model.mjs';
import { expandRadarRounds, radarDamageSummary, shipDamageSummary } from '../tactical.mjs';
import { createDamageShip } from '../combat-model.mjs';
import { projectTacticalView, tacticalViews, bridgeCombatActive, tacticalProjectiles, incomingTacticalThreats } from '../tactical-view-model.mjs';
import { createSector, relativeContact, issueManeuver } from '../sector-model.mjs';
import { createCombat, fireWeapon, stepCombat } from '../combat-model.mjs';
import { diagramAimCategory, diagramSystemStatus, renderShipDiagram, shipDiagramMarkers } from '../ship-diagrams.mjs';

test('each five-view diagram covers its fitted engines, weapon mounts and key ship systems',async()=>{
  assert.deepEqual(Object.keys(shipDiagramMarkers).sort(),Object.keys(shipFiveViews).sort());
  for(const classId of Object.keys(shipFiveViews)){
    const ship=createDamageShip(classId),markers=shipDiagramMarkers[classId];
    const expected=['bridge','reactor','jammer','hull','sensors',...Object.keys(ship.systems).filter(id=>id.startsWith('engine-')),...ship.mounts.map(mount=>mount.id)];
    assert.deepEqual(Object.keys(markers).sort(),expected.sort(),classId);
    const image=await readFile(new URL(`../${shipFiveViews[classId]}`,import.meta.url));
    const aspect=image.readUInt32BE(20)/image.readUInt32BE(16);
    const points=Object.entries(markers);
    for(const [index,[id,{x,y}]] of points.entries()){
      assert.ok(Number.isFinite(x)&&x>0&&x<100,classId);
      assert.ok(Number.isFinite(y)&&y>0&&y<100,classId);
      for(const [otherId,other] of points.slice(index+1)){
        assert.ok(Math.hypot(x-other.x,(y-other.y)*aspect)>=5,`${classId}: ${id} overlaps ${otherId}`);
      }
    }
  }
  assert.equal(renderShipDiagram({ship:null,classId:'unknown'}),null);
});

test('diagram integrity thresholds and Tactical aim categories match combat',()=>{
  for(const [hp,status] of [[100,'healthy'],[71,'healthy'],[70,'damaged'],[40,'damaged'],[39,'critical'],[1,'critical'],[0,'offline']]){
    assert.equal(diagramSystemStatus({hp,max:100}),status);
  }
  const ship=createDamageShip('sdf-frigate');
  for(const [id,category] of [
    ['engine-1','engines'],['ciws-30-2','ciws'],['mp-missiles-1','weapons'],['autocannon-120-2','weapons'],
    ['jammer','jammer'],['sensors','sensors'],['bridge','hull'],['reactor','hull'],['hull','hull'],['missing',null]
  ]){
    assert.equal(diagramAimCategory(ship,id),category);
  }
});

test('tactical views cover the complete bearing circle once, including sector boundaries',()=>{
  for(let bearing=-180;bearing<180;bearing+=.5){
    const contact={x:50*Math.sin(bearing*Math.PI/180),y:50*Math.cos(bearing*Math.PI/180),z:0};
    const views=Object.keys(tacticalViews).filter(view=>projectTacticalView(contact,view,60));
    assert.equal(views.length,1,`bearing ${bearing}`);
  }
  for(const [direction,x,y] of [['forward',0,50],['port',-50,0],['starboard',50,0],['rear',0,-50]]){
    const point=projectTacticalView({x,y,z:0},direction,60);assert.equal(point.x,320);assert.equal(point.y,180);
  }
});

test('tactical horizon preserves signed elevation in all four views',()=>{
  for(const [direction,x,y] of [['forward',0,50],['port',-50,0],['starboard',50,0],['rear',0,-50]]){
    assert.ok(projectTacticalView({x,y,z:25},direction,60).y<180);
    assert.ok(projectTacticalView({x,y,z:-25},direction,60).y>180);
    assert.equal(projectTacticalView({x,y,z:0},direction,60).y,180);
  }
  assert.equal(projectTacticalView({x:0,y:0,z:50},'forward',60).elevation,90);
  assert.equal(projectTacticalView({x:0,y:0,z:-50},'forward',60).elevation,-90);
});

test('tactical reference excludes stale and out-of-range tracks using full 3D distance',()=>{
  assert.ok(projectTacticalView({x:0,y:30,z:40},'forward',50));
  assert.equal(projectTacticalView({x:0,y:30,z:41},'forward',50),null);
  assert.equal(projectTacticalView({x:0,y:30,z:0,stale:true},'forward',50),null);
});

test('tactical reference follows a changing bow without rotating sector positions',()=>{
  const sector=createSector(),contact={x:30,y:40,z:10,vx:0,vy:0,vz:0};
  assert.ok(projectTacticalView(relativeContact(sector,contact),'forward',60));
  issueManeuver(sector,'port');
  assert.equal(projectTacticalView(relativeContact(sector,contact),'forward',60),null);
  assert.ok(projectTacticalView(relativeContact(sector,contact),'starboard',60));
  assert.equal(contact.x,30);assert.equal(contact.y,40);
});

test('blast shields respond to combat and incoming or outgoing fire, not merely enemy presence',()=>{
  const sector=createSector(),combat=createCombat(sector.contacts),enemy=sector.contacts.find(c=>c.type==='enemy');
  assert.equal(bridgeCombatActive(combat,sector),false);
  combat.hostiles=[enemy.id];assert.equal(bridgeCombatActive(combat,sector),true);
  combat.contacts[enemy.id].surrendered=true;assert.equal(bridgeCombatActive(combat,sector),false);
  combat.shots=[{sourceId:enemy.id,targetId:'own'}];assert.equal(bridgeCombatActive(combat,sector),true);
  combat.shots=[{sourceId:'own',targetId:enemy.id}];assert.equal(bridgeCombatActive(combat,sector),true);
  combat.shots=[];combat.contacts[enemy.id].surrendered=false;enemy.x=1000;assert.equal(bridgeCombatActive(combat,sector),false);
});

test('tactical view shows incoming and outgoing in-range missiles and every cannon round',()=>{
  const sector=createSector(),combat=createCombat();
  const missile={id:'shot:1',sourceId:'own',targetId:'E-04',weapon:'as-missiles',damage:160,x:0,y:20,z:10,vx:0,vy:3600,vz:0};
  combat.shots=[missile,{...missile,id:'shot:2',weapon:'autocannon-120',damage:24,z:-5},
    {...missile,id:'shot:3',sourceId:'E-04',targetId:'own'}, {...missile,id:'shot:4',y:200}, {...missile,id:'shot:5',x:30,y:0}];
  const before=structuredClone(combat.shots),markers=tacticalProjectiles(combat,sector,'forward',60);
  assert.equal(markers.length,4);assert.equal(markers.filter(p=>p.missile).length,2);
  assert.equal(markers.filter(p=>p.affiliation==='outgoing').length,3);
  assert.equal(markers.filter(p=>p.affiliation==='incoming').length,1);
  assert.equal(markers.filter(p=>!p.missile).length,2);
  assert.equal(new Set(markers.map(p=>p.id)).size,4);
  assert.ok(markers.find(p=>p.missile).y<180);assert.ok(markers.filter(p=>!p.missile).every(p=>p.y>180));
  assert.notEqual(markers[1].x,markers[2].x);
  assert.deepEqual(combat.shots,before);
});

test('outgoing projectiles switch views with the bow and use velocity at the muzzle',()=>{
  const sector=createSector(),combat=createCombat();
  combat.shots=[{id:'shot:1',sourceId:'own',weapon:'gp-missiles',damage:90,x:0,y:0,z:0,vx:3600,vy:0,vz:0}];
  assert.equal(tacticalProjectiles(combat,sector,'forward',60).length,0);
  assert.equal(tacticalProjectiles(combat,sector,'starboard',60).length,1);
  combat.shots[0].x=10;sector.facing={x:1,y:0,z:0};
  const marker=tacticalProjectiles(combat,sector,'forward',60)[0];
  assert.equal(marker.x,320);assert.equal(marker.y,180);
  assert.equal(tacticalProjectiles(combat,sector,'starboard',60).length,0);
});

test('outgoing tracks update position and depth, and disappear when their shot is removed',()=>{
  const sector=createSector(),combat=createCombat();
  const shot={id:'shot:1',sourceId:'own',weapon:'gp-missiles',damage:90,x:0,y:10,z:0,vx:3600,vy:3600,vz:0};combat.shots=[shot];
  const first=tacticalProjectiles(combat,sector,'forward',60)[0];
  shot.x=5;shot.y=20;
  const moved=tacticalProjectiles(combat,sector,'forward',60)[0];
  assert.ok(moved.x>first.x);assert.ok(moved.scale<first.scale);
  combat.shots=[];assert.deepEqual(tacticalProjectiles(combat,sector,'forward',60),[]);
});

test('projectile colors distinguish friendly, hostile, unknown and fire aimed at us without revealing unseen identity',()=>{
  const sector=createSector(),combat=createCombat();
  sector.memory['F-03']={observed:{type:'friendly'}};
  sector.memory['E-04']={observed:{type:'enemy'}};
  const shot={targetId:'U-01',weapon:'gp-missiles',damage:90,x:0,y:15,z:0,vx:0,vy:-3600,vz:0};
  combat.shots=['own','F-03','E-04','E-06'].map((sourceId,i)=>({...shot,id:`shot:${i+1}`,sourceId}));
  assert.deepEqual(tacticalProjectiles(combat,sector,'forward',60).map(p=>p.affiliation),['outgoing','friendly','hostile','other']);
  // An identified friendly firing at us is still an incoming threat.
  combat.shots[1].targetId='own';
  assert.equal(tacticalProjectiles(combat,sector,'forward',60)[1].affiliation,'incoming');
  combat.hostiles=['E-06'];
  assert.equal(tacticalProjectiles(combat,sector,'forward',60)[3].affiliation,'hostile');
});

test('incoming warning counts all directions and individual rounds without counting unrelated fire',()=>{
  const sector=createSector(),combat=createCombat();
  const shot={sourceId:'E-04',targetId:'own',weapon:'gp-missiles',damage:90,x:0,y:15,z:0,vx:0,vy:-3600,vz:0};
  combat.shots=[{...shot,id:'shot:1'}, {...shot,id:'shot:2',y:-5,weapon:'autocannon-120',damage:24},
    {...shot,id:'shot:3',x:-8,y:0}, {...shot,id:'shot:4',x:200}, {...shot,id:'shot:5',targetId:'F-03'}, {...shot,id:'shot:6',sourceId:'own',targetId:'E-04'}];
  const warning=incomingTacticalThreats(combat,sector,60);
  assert.deepEqual(warning,{missiles:2,rounds:2,nearest:5,directions:['forward','rear','port']});
  assert.equal(tacticalProjectiles(combat,sector,'forward',60).filter(p=>p.affiliation==='incoming').length,1);
  combat.shots=[];assert.deepEqual(incomingTacticalThreats(combat,sector,60),{missiles:0,rounds:0,nearest:null,directions:[]});
});

test('head-on incoming fire grows on approach and disappears after the simulation removes it',()=>{
  const sector=createSector(),combat=createCombat();
  const shot={id:'shot:1',sourceId:'E-04',targetId:'own',weapon:'gp-missiles',damage:90,x:0,y:30,z:0,vx:0,vy:-3600,vz:0};combat.shots=[shot];
  const far=tacticalProjectiles(combat,sector,'forward',60)[0];shot.y=5;
  const near=tacticalProjectiles(combat,sector,'forward',60)[0];
  assert.equal(near.angle,90);assert.equal(near.x,far.x);assert.equal(near.y,far.y);assert.ok(near.scale>far.scale);
  assert.equal(incomingTacticalThreats(combat,sector,60).nearest,5);
  combat.shots=[];assert.deepEqual(tacticalProjectiles(combat,sector,'forward',60),[]);
});

test('a simulated enemy missile closes on our ship, appears as incoming, and leaves the view on impact',()=>{
  const sector=createSector(),combat=createCombat();
  Object.assign(sector.contacts.find(c=>c.id==='E-04'),{x:0,y:8,z:0,vx:0,vy:0,vz:0});
  combat.own.ciwsAuto=false;combat.own.jammerMode='off';combat.own.jammer=false;
  assert.equal(fireWeapon(combat,sector,'E-04','gp-missiles-1','own','hull',()=>0).ok,true);
  const id=combat.shots[0].id,hull=combat.own.systems.hull.hp;
  const first=tacticalProjectiles(combat,sector,'forward',60).find(p=>p.shotId===id);
  assert.equal(first.affiliation,'incoming');
  for(let i=0;i<20;i++)stepCombat(combat,sector,.05,()=>0);
  const next=tacticalProjectiles(combat,sector,'forward',60).find(p=>p.shotId===id);
  assert.ok(next.distance<first.distance);assert.ok(next.scale>first.scale);
  for(let i=0;i<200&&combat.shots.some(s=>s.id===id);i++)stepCombat(combat,sector,.05,()=>0);
  assert.ok(!tacticalProjectiles(combat,sector,'forward',60).some(p=>p.shotId===id));
  assert.ok(combat.own.systems.hull.hp<hull);
});

test('our ship hover uses current integrity and updates after damage and repair',()=>{
  const ship=createDamageShip('sdf-frigate',true);
  ship.systems.hull.hp=800;ship.systems.sensors.hp=0;ship.systems['engine-1'].hp=0;
  for(const mount of ship.mounts)ship.systems[mount.id].hp=ship.systems[mount.id].max/2;
  assert.deepEqual(shipDamageSummary(ship),[
    {label:'Hull',percent:80,status:'healthy'},
    {label:'Weapons',percent:50,status:'damaged'},
    {label:'Sensors',percent:0,status:'critical'},
    {label:'Engines',percent:50,status:'damaged'}
  ]);
  for(const system of Object.values(ship.systems))system.hp=system.max;
  assert.ok(shipDamageSummary(ship).every(row=>row.percent===100&&row.status==='healthy'));
  assert.deepEqual(shipDamageSummary(undefined),[]);
});

test('identified ship hovers show integrity for every affiliation and aggregate weapons and engines by maximum points',()=>{
  const ship=createDamageShip('sdf-frigate');
  ship.systems.hull.hp=200;ship.systems.sensors.hp=32;
  ship.systems['mp-missiles-1'].hp=0;
  ship.systems['engine-1'].hp=0;ship.systems['engine-2'].max=240;ship.systems['engine-2'].hp=240;
  for(const type of ['enemy','friendly','neutral']){
    assert.deepEqual(radarDamageSummary({type,identified:true},ship),[
      {label:'Hull',percent:20,status:'critical'},
      {label:'Weapons',percent:78,status:'healthy'},
      {label:'Sensors',percent:40,status:'damaged'},
      {label:'Engines',percent:67,status:'damaged'}
    ]);
  }
});

test('enemy hover uses the existing green, yellow and red condition thresholds',()=>{
  const ship=createDamageShip('sdf-frigate'),contact={type:'enemy',identified:true};
  for(const [percent,status] of [[100,'healthy'],[71,'healthy'],[70,'damaged'],[40,'damaged'],[39,'critical'],[0,'critical']]){
    ship.systems.hull.hp=ship.systems.hull.max*percent/100;
    assert.deepEqual(radarDamageSummary(contact,ship)[0],{label:'Hull',percent,status});
  }
});

test('hover integrity is withheld for unidentified and stale tracks',()=>{
  const ship=createDamageShip('pirate-frigate');
  assert.deepEqual(radarDamageSummary({type:'unknown',identified:false},ship),[]);
  for(const type of ['enemy','friendly','neutral']){
    assert.deepEqual(radarDamageSummary({type,identified:false},ship),[]);
    assert.deepEqual(radarDamageSummary({type,identified:true,stale:true},ship),[]);
  }
  assert.deepEqual(radarDamageSummary({type:'enemy',identified:true},undefined),[]);
});

test('radar displays one dot per cannon round and leaves missiles individual',()=>{
  const shot={sourceId:'own',targetId:'E-04',weapon:'autocannon-120',component:'hull',damage:12,x:0,y:0,z:0,vx:0,vy:3600,vz:0};
  const shots=Array.from({length:7},(_,i)=>({...shot,id:`shot:${i}`,y:i}));
  shots.push({...shot,id:'enemy',sourceId:'E-04',targetId:'own'});
  const missile={...shot,id:'missile',weapon:'as-missiles',damage:160};shots.push(missile);
  const before=structuredClone(shots),result=expandRadarRounds(shots);
  assert.equal(result.length,9);
  assert.equal(result[0].y,0);assert.equal(result[1].y,1);
  assert.equal(result[8],missile);assert.deepEqual(shots,before);
  assert.equal(expandRadarRounds([{...shot,weapon:'ciws-30',damage:1}]).length,10);
  assert.equal(expandRadarRounds([{...shot,damage:24}]).length,2);
});

test('target priorities remain unique when adding ships and preserve the original selection on rejection',()=>{
  const first=prioritizeTargets([],{},'E-04',1),before=structuredClone(first);
  const second=prioritizeTargets(first.lockedIds,first.priorities,'F-03',2,true);
  assert.deepEqual(second,{lockedIds:['E-04','F-03'],priorities:{'E-04':1,'F-03':2}});
  assert.deepEqual(first,before);assert.throws(()=>prioritizeTargets(first.lockedIds,first.priorities,'F-03',1,true),/unique/);
  assert.deepEqual(first,before);
});

test('single-target replacement and release free priorities without renumbering retained ships',()=>{
  const ids=['E-04','F-03'],priorities={'E-04':1,'F-03':8};
  assert.deepEqual(prioritizeTargets(ids,priorities,'U-01',1),{lockedIds:['U-01'],priorities:{'U-01':1}});
  const released=prioritizeTargets(ids,priorities,'E-04',undefined,true);
  assert.deepEqual(released,{lockedIds:['F-03'],priorities:{'F-03':8}});
  assert.deepEqual(prioritizeTargets(released.lockedIds,released.priorities,'U-01',1,true).priorities,{'F-03':8,'U-01':1});
});

test('priority validation rejects duplicate, fractional, zero, and out-of-range numbers',()=>{
  for(const value of [0,-1,1.5,'1',true,NaN,Infinity,MAX_TARGET_PRIORITY+1])assert.throws(()=>prioritizeTargets([],{},'E-04',value));
  for(const value of [null,[],{}, {'E-04':1,'F-03':1},{'E-04':1,'other':2}])assert.throws(()=>restoreTargetPriorities(['E-04','F-03'],value));
  assert.deepEqual(restoreTargetPriorities(['E-04','F-03'],{'E-04':MAX_TARGET_PRIORITY,'F-03':1}),{'E-04':MAX_TARGET_PRIORITY,'F-03':1});
});

test('legacy locks gain stable priorities in their existing order and empty selections stay empty',()=>{
  assert.deepEqual(restoreTargetPriorities(['F-03','E-04']),{'F-03':1,'E-04':2});
  assert.deepEqual(restoreTargetPriorities([],{}),{});assert.deepEqual(restoreTargetPriorities([]),{});
});

test('all six ranges have three intermediate rings and an outer range ring', () => {
  assert.deepEqual(radarRanges, [10, 30, 60, 100, 140, 200]);
  for (const range of radarRanges) assert.deepEqual(rangeRings(range), [range * .25, range * .5, range * .75, range]);
  assert.equal(restoreBridgeState({ radarRange: 140 }).radarRange, 140);
  assert.equal(restoreBridgeState({ radarRange: 30 }).radarRange, 30);
  assert.equal(restoreBridgeState({ radarRange: 20 }).radarRange, 30);
  assert.equal(restoreBridgeState({ radarRange: 40 }).radarRange, 60);
  assert.equal(restoreBridgeState({ radarRange: '200' }).radarRange, 60);
});

test('both views share X while top uses Y and rear uses signed elevation', () => {
  const target = { x: 10, y: 20, z: -30 };
  assert.deepEqual(projectContact(target, 'top', 100, 100), { x: 10, y: -20 });
  assert.deepEqual(projectContact(target, 'rear', 100, 100), { x: 10, y: 30 });
  assert.equal(projectContact({ ...target, z: 30 }, 'rear', 100, 100).y, -30);
  assert.equal(Math.abs(projectContact({ ...target, z: 0 }, 'rear', 100).y), 0);
  assert.deepEqual(projectContact(target, 'top', 200, 100), { x: 5, y: -10 });
});

test('3D range includes boundary tracks and excludes contacts beyond either projected plane', () => {
  const boundary = { x: 6, y: 0, z: 8 };
  const above = { x: 0, y: 0, z: 11 };
  const forward = { x: 0, y: 11, z: 0 };
  const diagonal = { x: 8, y: 8, z: 0 };
  assert.deepEqual(contactsInRange([boundary, above, forward, diagonal], 10), [boundary]);
});

test('direction lines project velocity into each view without inventing a heading for perpendicular motion', () => {
  const contact = { vx: 3, vy: 4, vz: -4 };
  assert.deepEqual(projectVelocity(contact, 'top', 10), { x: 6, y: -8 });
  assert.deepEqual(projectVelocity(contact, 'rear', 10), { x: 6, y: 8 });
  assert.equal(projectVelocity({ vx: 0, vy: 5, vz: 0 }, 'rear'), null);
  assert.equal(projectVelocity({ vx: 0, vy: 0, vz: 5 }, 'top'), null);
  assert.equal(contactSpeed({ vx: 3, vy: 4, vz: 12 }), 13);
});

test('closure rate is positive for closing, negative for opening, and zero for tangential motion', () => {
  const contact = { x: 10, y: 0, z: 0, vx: -450, vy: 0, vz: 0 };
  assert.equal(contactClosureRate(contact), 450);
  assert.equal(contactClosureRate({ ...contact, vx: 150 }), -150);
  assert.equal(contactClosureRate({ ...contact, vx: 0, vy: 6000 }), 0);
  assert.equal(contactClosureRate({ ...contact, vx: 0 }), 0);
});

test('closure uses the full relative 3D velocity and withholds a value at coincident positions', () => {
  assert.equal(contactClosureRate({ x: 3, y: 4, z: 12, vx: -30, vy: -40, vz: -120 }), 130);
  assert.equal(contactClosureRate({ x: 0, y: 0, z: -10, vx: 0, vy: 0, vz: 90 }), 90);
  assert.equal(contactClosureRate({ x: 0, y: 0, z: -10, vx: 0, vy: 0, vz: -90 }), -90);
  assert.equal(contactClosureRate({ x: 0, y: 0, z: 0, vx: 450, vy: 0, vz: 0 }), null);
  const unknown = trainingContacts[0];
  assert.equal(contactClosureRate(observeContact(unknown)), contactClosureRate(unknown));
});

test('the ship library includes the tender while the twelve-contact training roster is retained', () => {
  assert.deepEqual(Object.values(shipTypes).map(ship => ship.label), ['UNE - CARGO SHIP', 'UNE - LIGHT CARGO SHIP', 'PRIVATEER', 'PRIVATE YACHT', 'UNE - TRANSPORT', 'UNE - LARGE TRANSPORT', 'PIRATE - FRIGATE', 'PIRATE - CORVETTE', 'SDF - FRIGATE', 'SDF - DESTROYER', 'SDF - CRUISER', 'SDF - HEAVY CRUISER', 'SPF LOGISTICS TENDER']);
  assert.equal(new Set(trainingContacts.map(contact => contact.shipType)).size, 12);
  assert.equal(new Set(trainingContacts.map(contact => contact.id)).size, 12);
  assert.equal(contactsInRange(trainingContacts, 200).length, 12);
  for (const contact of trainingContacts) {
    const ship = shipTypes[contact.shipType];
    assert.ok(ship.engines && ship.armaments && ship.faction && ship.role);
    assert.ok(Number.isFinite(contactSpeed(contact)) && contactSpeed(contact) > 0);
  }
});

test('all class armaments reference the supplied catalog without duplicate weapon entries',()=>{
  assert.deepEqual(Object.values(armamentTypes).map(weapon=>weapon.name),['Anti-ship (AS) missiles','Multi-purpose (MP) missiles','General Purpose (GP) missiles','120 mm Autocannon','75 mm Autocannon','30 mm CIWS','Rail Gun']);
  for(const ship of Object.values(shipTypes)){
    assert.equal(new Set(ship.loadout).size,ship.loadout.length);
    for(const id of ship.loadout)assert.ok(armamentTypes[id]);
    for(const id of ship.countermeasures||[])assert.ok(countermeasureTypes[id]);
    assert.doesNotMatch(ship.armaments,/coilgun|laser|PDC|Aegis|Fang/i);
  }
});

test('SDF frigate fits have the confirmed gun, missile, CIWS and countermeasure configuration',()=>{
  const ship=shipTypes['sdf-frigate'];assert.equal(ship.fitConfirmed,true);
  const guns=ship.fitting['autocannon-120'];assert.equal(guns.quantity,2);assert.equal(guns.turrets,2);assert.equal(guns.gunsPerTurret,1);
  assert.equal(ship.fitting['mp-missiles'].quantity,20);assert.equal(ship.fitting['mp-missiles'].location,'Dorsal / top');
  assert.equal(ship.fitting['as-missiles'].quantity,30);assert.equal(ship.fitting['as-missiles'].location,'Ventral / bottom');
  const ciws=ship.fitting['ciws-30'];assert.equal(ciws.quantity,2);assert.equal(ciws.port,1);assert.equal(ciws.starboard,1);
  assert.deepEqual(ship.countermeasures,['chaff','flares']);
  assert.deepEqual(ship.hangar,{bays:1,shuttles:2});
  assert.match(ship.armaments,/20 × Multi-purpose \(MP\) missiles/);assert.match(ship.armaments,/30 × Anti-ship \(AS\) missiles/);
  const observed=observeContact(trainingContacts.find(c=>c.shipType==='sdf-frigate'));assert.deepEqual(observed.ship.fitting,ship.fitting);assert.deepEqual(observed.ship.countermeasures,ship.countermeasures);
});

test('left-click selects exactly one target, including a target already in a multiple selection', () => {
  const first = selectTargets([], 'U-01');
  const second = selectTargets(first, 'F-03', true);
  assert.deepEqual(first, ['U-01']);
  assert.deepEqual(second, ['U-01', 'F-03']);
  assert.deepEqual(selectTargets(second, 'U-01'), ['U-01']);
  assert.deepEqual(selectTargets(second, 'F-03'), ['F-03']);
  assert.deepEqual(selectTargets(second, 'E-04'), ['E-04']);
  assert.deepEqual(selectTargets(['F-03'], 'F-03'), ['F-03']);
  assert.deepEqual(second, ['U-01', 'F-03']);
});

test('pirate class references include confirmed weapon locations, defenses and assault shuttles',()=>{
  for(const [id,guns,missiles] of [['pirate-corvette',1,30],['pirate-frigate',2,40]]){
    const ship=shipTypes[id];assert.equal(ship.fitConfirmed,true);
    assert.equal(ship.fitting['autocannon-75'].quantity,guns*2);
    assert.equal(ship.fitting['autocannon-75'].turrets,guns);
    assert.equal(ship.fitting['autocannon-75'].gunsPerTurret,2);
    assert.ok(!ship.loadout.includes('autocannon-120'));
    assert.equal(ship.fitting['gp-missiles'].quantity,missiles);
    assert.equal(ship.fitting['gp-missiles'].location,'Ventral launch / bottom');
    assert.deepEqual(ship.fitting['ciws-30'],{quantity:2,port:1,starboard:1,location:'Port and starboard · 1 per side'});
    assert.deepEqual(ship.countermeasures,['chaff','flares','radar-jammer']);
    assert.deepEqual(ship.hangar,{bays:1,assaultShuttles:4});assert.equal(ship.boarding.personnel,40);
  }
  assert.match(shipTypes['pirate-corvette'].fitting['autocannon-75'].configuration,/forward turret · 2 autocannons/);
  assert.match(shipTypes['pirate-frigate'].fitting['autocannon-75'].configuration,/1 forward, 1 aft on top of the shuttle hangar · 2 autocannons per turret/);
});

test('Ctrl-click toggles a target while preserving every other lock', () => {
  const second = ['U-01', 'F-03'];
  assert.deepEqual(selectTargets(second, 'U-01', true), ['F-03']);
  assert.deepEqual(selectTargets(['F-03'], 'F-03', true), []);
  assert.deepEqual(selectTargets(second, 'E-04', true), ['U-01', 'F-03', 'E-04']);
  assert.deepEqual(second, ['U-01', 'F-03']);
});

test('IFF identifies with a 90% threshold only within the physical 100 km radius', () => {
  assert.equal(IFF_RANGE_KM, 100); assert.equal(IFF_IDENTIFICATION_CHANCE, .9);
  const contact = { ...trainingContacts[1], x: 100, y: 0, z: 0, iffRoll: .899 };
  assert.equal(observeContact(contact).identified, true);
  assert.equal(observeContact({ ...contact, x: 60, y: 0, z: 80 }).identified, true);
  assert.equal(observeContact({ ...contact, iffRoll: .9 }).identified, false);
  const outside = observeContact({ ...contact, x: 100.001, iffRoll: 0 });
  assert.equal(outside.identified, false);
  assert.equal(outside.iffStatus, 'Beyond 100 km IFF range');
  assert.equal(observeContact({ ...contact, x: 60, y: 0, z: 80.001, iffRoll: 0 }).identified, false);
  assert.equal(observeContact({ ...contact, x: 0, y: 0, z: 101, iffRoll: 0 }).identified, false);
});

test('unidentified contacts reveal telemetry while withholding all catalog identity and size', () => {
  for (const raw of [trainingContacts[0], trainingContacts[5], trainingContacts[8], trainingContacts[10]]) {
    const observed = observeContact(raw);
    assert.equal(observed.identified, false);
    assert.equal(observed.type, 'unknown');
    assert.equal(observed.registry, 'Unknown');
    assert.equal(observed.ship.label, 'UNKNOWN SHIP TYPE');
    for (const key of ['size', 'faction', 'role', 'armaments', 'engines']) assert.equal(observed.ship[key], 'Unknown');
    assert.equal(observed.shipType, undefined);
    assert.equal(observed.ship.image, undefined);
    assert.equal(observed.ship.loadout, undefined);
    assert.equal(observed.ship.fitting, undefined);
    assert.equal(observed.ship.countermeasures,'Unknown');
    assert.equal(observed.ship.hangar,'Unknown');
    assert.ok(!JSON.stringify(observed).includes(raw.name));
    assert.ok(!JSON.stringify(observed).includes(raw.registry));
    assert.equal(contactDistance(observed), contactDistance(raw));
    assert.equal(contactSpeed(observed), contactSpeed(raw));
    assert.match(observed.trackLabel, /^TRK-\d+$/);
  }
  const known = observeContact(trainingContacts[1]);
  assert.equal(known.identified, true);
  assert.equal(known.name, trainingContacts[1].name);
  assert.equal(known.ship.label, 'UNE - CARGO SHIP');
  assert.equal(known.ship.size, 'Large');
  assert.equal(known.ship.image, 'images/une-cargo-ship-five-view.png');
});

test('every ship type maps to its matching existing five-view PNG', async () => {
  assert.deepEqual(Object.keys(shipFiveViews).sort(), Object.keys(shipTypes).sort());
  for (const [id, ship] of Object.entries(shipTypes)) {
    const expectedName = id==='spf-logistics-tender'?'sdf-logistics-tender-five-view.png':`${ship.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-five-view.png`;
    assert.equal(shipFiveViews[id], `images/${expectedName}`);
    const data = await readFile(new URL(`../${shipFiveViews[id]}`, import.meta.url));
    assert.deepEqual([...data.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.ok(data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0);
  }
});

test('IFF assessments are stable and approximate 90% identification over distinct tracks', () => {
  const raw = { ...trainingContacts[1], iffRoll: undefined };
  let identified = 0;
  for (let index = 0; index < 2000; index++) {
    const contact = { ...raw, id: `T-${index}` };
    const first = observeContact(contact);
    assert.deepEqual(observeContact(contact), first);
    if (first.identified) identified++;
  }
  assert.ok(identified / 2000 > .88 && identified / 2000 < .92, `Identification rate: ${identified / 2000}`);
  // Changing the displayed radar radius filters the observed contacts without changing IFF.
  const observed = trainingContacts.map(observeContact);
  assert.deepEqual(contactsInRange(observed, 200).find(contact => contact.id === raw.id), contactsInRange(observed, 20).find(contact => contact.id === raw.id));
});
