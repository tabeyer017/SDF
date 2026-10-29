import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { radarRanges, rangeRings, projectContact, contactsInRange, projectVelocity, contactDistance, contactSpeed, contactClosureRate, armamentTypes, countermeasureTypes, shipTypes, shipFiveViews, trainingContacts, selectTargets, observeContact, IFF_RANGE_KM, IFF_IDENTIFICATION_CHANCE } from '../tactical-model.mjs';
import { restoreBridgeState } from '../bridge-model.mjs';

test('all six ranges have three intermediate rings and an outer range ring', () => {
  assert.deepEqual(radarRanges, [10, 20, 60, 100, 140, 200]);
  for (const range of radarRanges) assert.deepEqual(rangeRings(range), [range * .25, range * .5, range * .75, range]);
  assert.equal(restoreBridgeState({ radarRange: 140 }).radarRange, 140);
  assert.equal(restoreBridgeState({ radarRange: 30 }).radarRange, 60);
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

test('all twelve game ships have a sample within maximum range and provisional fits', () => {
  assert.deepEqual(Object.values(shipTypes).map(ship => ship.label), ['UNE - CARGO SHIP', 'UNE - LIGHT CARGO SHIP', 'PRIVATEER', 'PRIVATE YACHT', 'UNE - TRANSPORT', 'UNE - LARGE TRANSPORT', 'PIRATE - FRIGATE', 'PIRATE - CORVETTE', 'SDF - FRIGATE', 'SDF - DESTROYER', 'SDF - CRUISER', 'SDF - HEAVY CRUISER']);
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

test('Ctrl-click toggles a target while preserving every other lock', () => {
  const second = ['U-01', 'F-03'];
  assert.deepEqual(selectTargets(second, 'U-01', true), ['F-03']);
  assert.deepEqual(selectTargets(['F-03'], 'F-03', true), []);
  assert.deepEqual(selectTargets(second, 'E-04', true), ['U-01', 'F-03', 'E-04']);
  assert.deepEqual(second, ['U-01', 'F-03']);
});

test('IFF identifies with a 90% threshold only within the physical 60 km radius', () => {
  assert.equal(IFF_RANGE_KM, 60); assert.equal(IFF_IDENTIFICATION_CHANCE, .9);
  const contact = { ...trainingContacts[1], x: 60, y: 0, z: 0, iffRoll: .899 };
  assert.equal(observeContact(contact).identified, true);
  assert.equal(observeContact({ ...contact, iffRoll: .9 }).identified, false);
  assert.equal(observeContact({ ...contact, x: 60.001, iffRoll: 0 }).identified, false);
  assert.equal(observeContact({ ...contact, x: 0, y: 0, z: 61, iffRoll: 0 }).identified, false);
});

test('unidentified contacts reveal telemetry while withholding all catalog identity and size', () => {
  for (const raw of [trainingContacts[0], trainingContacts[4], trainingContacts[5],trainingContacts[10]]) {
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
    const expectedName = `${ship.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-five-view.png`;
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
