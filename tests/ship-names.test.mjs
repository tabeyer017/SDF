import test from 'node:test';
import assert from 'node:assert/strict';
import {shipNamingConventions,shipNameOptions,defaultShipName,playerShipName,setPlayerShipName,pirateShipNames,legacyFrigateNames} from '../ship-names.mjs';
import {createCombat,changeEncounter} from '../combat-model.mjs';
import {restoreCombat} from '../combat-save.mjs';
import {createSector,createEncounterSector,observeSector} from '../sector-model.mjs';
import {generateEncounter} from '../encounter-model.mjs';
import {createCommunications,sendCommunication} from '../communications-model.mjs';
import {createSave,parseSave} from '../save-game.mjs';
import {restoreBridgeState} from '../bridge-model.mjs';

function record(sector,combat){return {navigation:{ship:{x:1,y:0},location:sector.location,route:[],active:false,paused:false,days:0,speed:1},
  bridge:{settings:restoreBridgeState(),sector,combat,tactical:{lockedIds:[],activeId:null,priorities:{}}},selection:{x:1,y:0,name:'Earth'},logs:[]};}

test('UNE military class names follow their four categories and player choices respect the current class',()=>{
  assert.deepEqual(Object.values(shipNamingConventions).map(rule=>rule.category),['National capitals','States, provinces and regions','Large world cities','Geographical features around the world']);
  const combat=createCombat();assert.equal(playerShipName(combat),'SDF Andes');
  assert.equal(setPlayerShipName(combat,'SDF Nile'),true);assert.equal(playerShipName(combat),'SDF Nile');
  assert.equal(setPlayerShipName(combat,'SDF Ontario'),false);assert.equal(setPlayerShipName(combat,'<script>'),false);
  assert.equal(playerShipName(combat),'SDF Nile');
  assert.equal(defaultShipName('sdf-heavy-cruiser'),'SDF Nairobi');
});

test('the selected player ship name survives portable saves and new encounters while old saves get a valid default',()=>{
  const sector=createSector(),combat=createCombat();setPlayerShipName(combat,'SDF Amazon');
  const saved=parseSave(JSON.stringify(createSave(record(sector,combat))));
  assert.equal(playerShipName(saved.bridge.combat),'SDF Amazon');
  changeEncounter(combat,sector.contacts);assert.equal(playerShipName(combat),'SDF Amazon');
  const legacy=structuredClone(combat);delete legacy.own.name;
  assert.equal(playerShipName(restoreCombat(legacy,sector.contacts)),defaultShipName('sdf-frigate'));
  for(const name of ['SDF Paris','Wayfarer','<img>',null])assert.throws(()=>restoreCombat({...combat,own:{...combat.own,name}},sector.contacts));
});

test('new military encounter names come from class-specific pools without duplicate names in a watch',()=>{
  for(let seed=0;seed<100;seed++){
    const encounter=generateEncounter('Mars',seed),friendly=encounter.contacts.filter(c=>c.type==='friendly');
    for(const contact of friendly)assert.ok(shipNameOptions(contact.shipType).includes(contact.name));
    assert.equal(new Set(friendly.map(c=>c.name)).size,friendly.length);
  }
});

test('older player frigate names migrate to geographical choices without changing patrol progress or pirate names',()=>{
  const sector=createSector(),combat=createCombat();combat.own.systems.hull.hp=666;combat.own.ammo['as-missiles']=11;
  const choices=shipNameOptions('sdf-frigate');
  for(const [index,name] of legacyFrigateNames.entries()){
    combat.own.name=name;
    const restored=parseSave(JSON.stringify(createSave(record(sector,combat))));
    assert.equal(restored.bridge.combat.own.name,choices[index]);
    assert.equal(restored.bridge.combat.own.systems.hull.hp,666);assert.equal(restored.bridge.combat.own.ammo['as-missiles'],11);
    assert.deepEqual(restored.bridge.sector.contacts,sector.contacts);
    assert.equal(setPlayerShipName(restored.bridge.combat,name),false);
  }
  for(let seed=0;seed<100;seed++){
    const previous=generateEncounter('Mars',seed,3),current=generateEncounter('Mars',seed);
    assert.deepEqual(current.contacts.filter(c=>c.shipType.startsWith('pirate-')),previous.contacts.filter(c=>c.shipType.startsWith('pirate-')));
  }
});

test('legacy encounters retain their names and new naming does not reroll traffic or motion',()=>{
  for(const version of [1,2,3]){
    const old=generateEncounter('Mars',1,version),current=generateEncounter('Mars',1);
    assert.deepEqual(old.contacts.map(c=>({...c,name:''})),current.contacts.map(c=>({...c,name:''})));
    if(version<3)assert.ok(old.contacts.some(c=>c.type==='enemy'&&!pirateShipNames.includes(c.name)));
    const sector=createEncounterSector('Mars',1);sector.encounter=Object.fromEntries(Object.entries(old).filter(([key])=>key!=='contacts'));sector.contacts=old.contacts;
    const restored=parseSave(JSON.stringify(createSave(record(sector,createCombat(old.contacts)))));
    assert.equal(restored.bridge.sector.encounter.version,version);assert.deepEqual(restored.bridge.sector.contacts,old.contacts);
  }
});

test('new pirate encounters use all 50 supplied names without suffixes or duplicates in a watch',()=>{
  assert.equal(pirateShipNames.length,50);assert.equal(new Set(pirateShipNames).size,50);
  assert.ok(pirateShipNames.includes('Space King'));assert.ok(pirateShipNames.includes('Space Nymph'));
  assert.ok(pirateShipNames.every(name=>!name.includes('Sea')));
  const seen=new Set();
  for(let seed=0;seed<3000;seed++){
    const encounter=generateEncounter('Mars',seed),pirates=encounter.contacts.filter(c=>c.type==='enemy');
    for(const contact of pirates){assert.ok(pirateShipNames.includes(contact.name));seen.add(contact.name);}
    assert.equal(new Set(pirates.map(c=>c.name)).size,pirates.length);
  }
  assert.equal(seen.size,50);
  for(const contact of createSector().contacts.filter(c=>c.type==='enemy'))assert.ok(pirateShipNames.includes(contact.name));
});

test('new Comms traffic uses the selected name without rewriting historical messages',()=>{
  const sector=createSector(),combat=createCombat(),state=createCommunications();
  const old=state.messages[0].body;setPlayerShipName(combat,'SDF Kilimanjaro');
  const context={sector,combat,contacts:observeSector(sector),range:200,inTransit:false,days:0};
  assert.equal(sendCommunication(state,context,'hq','hail').ok,true);
  assert.match(state.messages.at(-2).body,/SDF Kilimanjaro/);assert.match(state.messages.at(-1).body,/SDF Kilimanjaro/);
  assert.equal(state.messages[0].body,old);
  assert.match(createCommunications(playerShipName(combat)).messages[0].body,/SDF Kilimanjaro/);
});
