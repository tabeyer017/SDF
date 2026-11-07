import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { radarRanges, rangeRings, projectContact, contactsInRange, projectVelocity, contactDistance, contactSpeed, contactClosureRate, armamentTypes, countermeasureTypes, shipTypes, shipFiveViews, trainingContacts, selectTargets, prioritizeTargets, restoreTargetPriorities, MAX_TARGET_PRIORITY, observeContact, IFF_RANGE_KM, IFF_IDENTIFICATION_CHANCE } from '../tactical-model.mjs';
import { restoreBridgeState } from '../bridge-model.mjs';
import { expandRadarRounds, radarDamageSummary, shipDamageSummary } from '../tactical.mjs';
import { createDamageShip } from '../combat-model.mjs';

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

test('enemy hover aggregates weapon and engine integrity by maximum points',()=>{
  const ship=createDamageShip('sdf-frigate'),contact={type:'enemy',identified:true};
  ship.systems.hull.hp=200;ship.systems.sensors.hp=32;
  ship.systems['mp-missiles-1'].hp=0;
  ship.systems['engine-1'].hp=0;ship.systems['engine-2'].max=240;ship.systems['engine-2'].hp=240;
  assert.deepEqual(radarDamageSummary(contact,ship),[
    {label:'Hull',percent:20,status:'critical'},
    {label:'Weapons',percent:78,status:'healthy'},
    {label:'Sensors',percent:40,status:'damaged'},
    {label:'Engines',percent:67,status:'damaged'}
  ]);
});

test('enemy hover uses the existing green, yellow and red condition thresholds',()=>{
  const ship=createDamageShip('sdf-frigate'),contact={type:'enemy',identified:true};
  for(const [percent,status] of [[100,'healthy'],[71,'healthy'],[70,'damaged'],[40,'damaged'],[39,'critical'],[0,'critical']]){
    ship.systems.hull.hp=ship.systems.hull.max*percent/100;
    assert.deepEqual(radarDamageSummary(contact,ship)[0],{label:'Hull',percent,status});
  }
});

test('hover integrity is withheld for unidentified, stale and non-enemy tracks',()=>{
  const ship=createDamageShip('pirate-frigate');
  for(const contact of [{type:'unknown',identified:false},{type:'enemy',identified:false},{type:'enemy',identified:true,stale:true},{type:'friendly',identified:true},{type:'neutral',identified:true}])assert.deepEqual(radarDamageSummary(contact,ship),[]);
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
