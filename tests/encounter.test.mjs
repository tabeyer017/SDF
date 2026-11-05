import test from 'node:test';
import assert from 'node:assert/strict';
import { generateEncounter, encounterRegion, applyEncounterEvent, MAX_ENCOUNTER_CONTACTS } from '../encounter-model.mjs';
import { createSector, createEncounterSector, observeSector, stepSector } from '../sector-model.mjs';
import { createCombat, changeEncounter, stepCombat } from '../combat-model.mjs';
import { createCommunications, pollCommunications, communicationsRecipients } from '../communications-model.mjs';
import { createSave, parseSave } from '../save-game.mjs';
import { restoreBridgeState } from '../bridge-model.mjs';
import { trainingContacts, shipTypes, observeContact } from '../tactical-model.mjs';
import { miningStations } from '../mining.mjs';

function game(location,seed){
  const sector=createEncounterSector(location,seed),combat=createCombat(sector.contacts);applyEncounterEvent(sector,combat);observeSector(sector);
  return {navigation:{ship:{x:0,y:1},location,route:[],active:false,paused:false,days:1,speed:1},bridge:{sector,combat,settings:restoreBridgeState(),tactical:{lockedIds:[],activeId:null,priorities:{}}},selection:{x:0,y:1,name:location},logs:[]};
}

test('arrival traffic is repeatable from its seed, changes between visits, and depends on destination',()=>{
  assert.deepEqual(generateEncounter('Mars',42),generateEncounter('Mars',42));
  assert.notDeepEqual(generateEncounter('Mars',42),generateEncounter('Mars',43));
  assert.notDeepEqual(generateEncounter('Mars',42),generateEncounter('Jupiter',42));
  assert.equal(encounterRegion('Earth'),'inner');assert.equal(encounterRegion('Moon station'),'inner');
  assert.equal(encounterRegion(miningStations[0].name),'belt');assert.equal(encounterRegion('Titania station'),'outer');
  assert.equal(encounterRegion('Heliopause station'),'boundary');assert.equal(encounterRegion('deep space'),'deep');
  assert.deepEqual(createSector().contacts,trainingContacts);
});

test('generated encounters vary ship counts and events while keeping traffic inside the radar envelope',()=>{
  const events=new Set(),sizes=new Set();
  for(const location of ['Earth',miningStations[0].name,'Jupiter','Heliopause station','deep space'])for(let seed=0;seed<80;seed++){
    const encounter=generateEncounter(location,seed);events.add(encounter.event);sizes.add(encounter.contacts.length);
    assert.ok(encounter.contacts.length<=MAX_ENCOUNTER_CONTACTS);
    assert.equal(new Set(encounter.contacts.map(c=>c.id)).size,encounter.contacts.length);
    for(const c of encounter.contacts){
      assert.ok(shipTypes[c.shipType]);assert.ok(Math.hypot(c.x,c.y,c.z)<=200);
      assert.ok(c.iffRoll>=0&&c.iffRoll<1);assert.match(c.id,/^[EFN]-[A-Z0-9]+-\d{2}$/);
      assert.equal(c.type,c.shipType.startsWith('sdf-')?'friendly':c.shipType.startsWith('pirate-')?'enemy':'neutral');
    }
    if(encounter.contacts.length)assert.ok(Math.hypot(...['x','y','z'].map(k=>encounter.contacts[0][k]))<45);
  }
  assert.deepEqual([...events].sort(),['convoy','distress','patrol','quiet','raiders','traffic']);assert.ok(sizes.size>=5);
});

test('distress events create a damaged disabled ship and a single durable Comms distress call',()=>{
  const {bridge:{sector,combat}}=game('Mars',2),id=sector.encounter.distressId;
  assert.ok(id);assert.ok(combat.contacts[id].systems.hull.hp/combat.contacts[id].systems.hull.max<.4);
  const vessel=sector.contacts.find(c=>c.id===id);assert.deepEqual([vessel.vx,vessel.vy,vessel.vz],[0,0,0]);
  assert.ok(Object.entries(combat.contacts[id].systems).filter(([key])=>key.startsWith('engine-')).every(([,s])=>s.hp===0));
  const state=createCommunications(),context={sector,combat,contacts:observeSector(sector),range:200,inTransit:false,days:1};
  assert.equal(pollCommunications(state,context),true);assert.equal(pollCommunications(state,context),false);
  assert.match(state.messages.at(-1).subject,/Distress/);
});

test('pirate events remain paused on arrival and produce incoming fire only when local time runs',()=>{
  const {bridge:{sector,combat}}=game('Mars',1);
  assert.equal(sector.encounter.event,'raiders');assert.equal(sector.running,false);assert.equal(combat.shots.length,0);
  assert.deepEqual(combat.hostiles,sector.encounter.hostileIds);
  // Pirates need autocannon range to strip our CIWS before using missiles.
  Object.assign(sector.contacts.find(c=>combat.hostiles.includes(c.id)),{x:0,y:10,z:0});
  sector.running=true;stepSector(sector,.05);stepCombat(combat,sector,.05,()=>0);
  assert.ok(combat.shots.some(shot=>shot.targetId==='own'&&combat.hostiles.includes(shot.sourceId)));
  const distant=sector.contacts.find(c=>Math.hypot(c.x,c.y,c.z)>100);
  if(distant){const view=observeContact(distant);assert.equal(view.identified,false);assert.equal(view.ship.label,'UNKNOWN SHIP TYPE');}
});

test('arrival retains player damage and supplies while clearing old combat orders and channel identity',()=>{
  const old=createSector(),combat=createCombat(old.contacts),state=createCommunications();
  combat.own.systems.hull.hp=700;combat.own.ammo['as-missiles']=7;combat.hostiles=['E-04'];combat.alliedOrders={'F-03':{mode:'attack-targets',targetIds:['E-04']}};
  const own=structuredClone(combat.own),sector=createEncounterSector('Mars',4);
  changeEncounter(combat,sector.contacts);applyEncounterEvent(sector,combat);state.encounter++;
  assert.deepEqual(combat.own,own);assert.deepEqual(combat.alliedOrders,{});assert.equal(combat.firing,null);assert.deepEqual(combat.shots,[]);
  assert.deepEqual(Object.keys(combat.contacts),sector.contacts.map(c=>c.id));
  const recipients=communicationsRecipients(state,{sector,combat,contacts:observeSector(sector),range:200,inTransit:false});
  assert.ok(recipients.filter(r=>r.kind==='ship').every(r=>r.id.startsWith('ship:1:')));
});

test('generated ships, quiet sectors, distress damage, and event identity round-trip without rerolling',()=>{
  for(const location of ['Mars','deep space'])for(let seed=0;seed<20;seed++){
    const original=game(location,seed),sector=original.bridge.sector;sector.running=true;stepSector(sector,3);
    const loaded=parseSave(JSON.stringify(createSave(original)));
    assert.deepEqual(loaded.bridge.sector.contacts,sector.contacts);assert.deepEqual(loaded.bridge.sector.encounter,sector.encounter);
    assert.deepEqual(loaded.bridge.combat,original.bridge.combat);assert.equal(loaded.bridge.sector.running,false);
    assert.deepEqual(Object.keys(loaded.bridge.sector.memory),Object.keys(sector.memory));
  }
  assert.equal(game('deep space',3).bridge.sector.contacts.length,0);
});

test('encounter save validation rebuilds trusted identities and rejects forged or incomplete rosters',()=>{
  const saved=createSave(game('Mars',2));
  for(const edit of [s=>s.bridge.sector.encounter.seed=-1,s=>s.bridge.sector.encounter.seed=.5,s=>s.bridge.sector.encounter.version=99,s=>s.bridge.sector.contacts.pop(),s=>s.bridge.sector.contacts[1]=s.bridge.sector.contacts[0],s=>s.bridge.sector.contacts[0].id='N-forged-01',s=>delete s.bridge.sector.encounter]){
    const bad=structuredClone(saved);edit(bad);assert.throws(()=>parseSave(JSON.stringify(bad)));
  }
  const expected=generateEncounter('Mars',2).contacts[0];saved.bridge.sector.contacts[0].name='Injected';saved.bridge.sector.contacts[0].shipType='sdf-heavy-cruiser';saved.bridge.sector.contacts[0].iffRoll=0;saved.bridge.sector.encounter.summary='Forged event';
  const loaded=parseSave(JSON.stringify(saved));
  assert.equal(loaded.bridge.sector.contacts[0].name,expected.name);assert.equal(loaded.bridge.sector.contacts[0].shipType,expected.shipType);assert.equal(loaded.bridge.sector.contacts[0].iffRoll,expected.iffRoll);
  assert.notEqual(loaded.bridge.sector.encounter.summary,'Forged event');
});
