import test from 'node:test';
import assert from 'node:assert/strict';
import { generateEncounter, encounterRegion, applyEncounterEvent, MAX_ENCOUNTER_CONTACTS } from '../encounter-model.mjs';
import { createSector, createEncounterSector, observeSector, stepSector } from '../sector-model.mjs';
import { createCombat, changeEncounter, stepCombat, surrenderShip } from '../combat-model.mjs';
import { createCommunications, pollCommunications, communicationsRecipients, markChannelRead, missionMatchesWaypoint, pollPatrolMission, revealedPatrolMission, leavePatrolMission, recordPatrolSweep, sendCommunication } from '../communications-model.mjs';
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

test('new Earth arrivals have no pirate encounters, while old Earth encounters still load',()=>{
  for(let seed=0;seed<80;seed++){
    const encounter=generateEncounter('Earth',seed);
    assert.notEqual(encounter.event,'raiders');
    assert.deepEqual(encounter.hostileIds,[]);
    assert.ok(encounter.contacts.every(contact=>contact.type!=='enemy'));
  }
  const {contacts,...encounter}=generateEncounter('Earth',7,4);
  assert.equal(encounter.event,'raiders');
  const original=game('Earth',7),sector=createSector(contacts,'Earth'),combat=createCombat(contacts);
  sector.encounter=encounter;applyEncounterEvent(sector,combat);
  Object.assign(original.bridge,{sector,combat});
  const loaded=parseSave(JSON.stringify(createSave(original)));
  assert.deepEqual(loaded.bridge.sector.contacts,contacts);
  assert.deepEqual(loaded.bridge.combat.hostiles,encounter.hostileIds);
});

function dispatchedMission(random){
  const original=game('Earth',4),{sector,combat}=original.bridge;
  const communications=original.bridge.communications=createCommunications();
  const context={sector,combat,position:original.navigation.ship,days:1,inTransit:false};
  assert.equal(pollPatrolMission(communications,context,miningStations,()=>random),true);
  const mission=communications.mission,message=communications.messages.at(-1);
  return {original,communications,context,mission,message};
}

function arriveForAssignment({original,communications,context,mission,message}){
  markChannelRead(communications,message.channelId);
  const sector=createEncounterSector(mission.destination.name,mission.seed,mission.kind);
  changeEncounter(context.combat,sector.contacts);applyEncounterEvent(sector,context.combat);
  original.bridge.sector=context.sector=sector;
  original.navigation.location=sector.location;
  original.navigation.ship={x:mission.destination.x,y:mission.destination.y};
  mission.arrived=true;
  return sector;
}

test('a mission fix is hidden until its incoming message is read and survives save and reload',()=>{
  const assignment=dispatchedMission(0),{original,communications,context,mission,message}=assignment;
  assert.equal(mission.kind,'station-attack');assert.equal(message.channelId,mission.destination.siteId);
  assert.equal(revealedPatrolMission(communications),null);
  assert.equal(pollPatrolMission(communications,context,miningStations,()=>0),false);
  const reload=()=>parseSave(JSON.stringify(createSave(original)));
  assert.equal(revealedPatrolMission(reload().bridge.communications),null);
  markChannelRead(communications,message.channelId);
  assert.deepEqual(revealedPatrolMission(reload().bridge.communications),mission);
  assert.equal(missionMatchesWaypoint(mission,mission.destination),true);
  assert.equal(missionMatchesWaypoint(mission,{...mission.destination,x:0}),false);
  const sector=arriveForAssignment(assignment),loaded=reload();
  assert.deepEqual(loaded.bridge.sector.encounter,sector.encounter);
  assert.equal(loaded.bridge.communications.mission.arrived,true);
});

test('cargo raiders attack the freighter and the mission resolves after the threat and incoming fire are gone',()=>{
  const assignment=dispatchedMission(.3),{communications,context,mission}=assignment;
  assert.equal(mission.kind,'cargo-attack');
  const sector=arriveForAssignment(assignment),{combat}=context;
  const {attackTargetId,hostileIds}=sector.encounter;
  stepCombat(combat,sector,.05,()=>0);
  assert.ok(combat.shots.some(shot=>shot.targetId===attackTargetId&&hostileIds.includes(shot.sourceId)));
  for(const id of hostileIds)surrenderShip(combat,id);
  assert.equal(pollPatrolMission(communications,context,miningStations),false);
  combat.shots=[];
  assert.equal(pollPatrolMission(communications,context,miningStations),true);
  assert.equal(revealedPatrolMission(communications),null);
  assert.equal(communications.messages.at(-1).subject,'Mission complete');
  assert.equal(pollPatrolMission(communications,context,miningStations,()=>.6),false);
  context.days+=1/24;
  assert.equal(pollPatrolMission(communications,context,miningStations,()=>.6),true);
});

function advanceSweep({communications,context},seconds){
  const {sector,combat}=context;
  const advanced=stepSector(sector,seconds);
  context.days+=advanced/86400;
  recordPatrolSweep(communications,sector,combat.own.radar,advanced);
}

test('a quiet sweep gives one untimed check-in after three minutes and a follow-up after two more, including across saves',()=>{
  const patrol=dispatchedMission(.6),sector=arriveForAssignment(patrol);
  const {original,communications,context,mission,message}=patrol;
  assert.equal(sector.encounter.event,'patrol');
  assert.doesNotMatch(message.body,/\b(seconds|minutes)\b/);
  sector.running=true;
  advanceSweep(patrol,90); // Holding at rest with radar on does not count.
  sector.own.vy=1200;
  context.combat.own.radar=false;
  advanceSweep(patrol,90);
  context.combat.own.radar=true;
  advanceSweep(patrol,60);
  assert.equal(pollPatrolMission(communications,context,miningStations),false);
  advanceSweep(patrol,119);
  assert.equal(pollPatrolMission(communications,context,miningStations),false);
  advanceSweep(patrol,1);
  assert.equal(pollPatrolMission(communications,context,miningStations),true);
  assert.equal(communications.mission,mission);
  assert.match(communications.messages.at(-1).body,/continue sweeping this sector or return to Earth/);
  assert.doesNotMatch(communications.messages.at(-1).body,/\b(seconds|minutes)\b/);

  const loaded=parseSave(JSON.stringify(createSave(original)));
  patrol.communications=loaded.bridge.communications;
  context.sector=loaded.bridge.sector;
  advanceSweep(patrol,120); // The reload is paused.
  assert.equal(pollPatrolMission(patrol.communications,context,miningStations),false);
  context.sector.running=true;
  advanceSweep(patrol,119);
  assert.equal(pollPatrolMission(patrol.communications,context,miningStations),false);
  advanceSweep(patrol,1);
  assert.equal(pollPatrolMission(patrol.communications,context,miningStations,()=>.3),true);
  assert.equal(patrol.communications.mission.kind,'cargo-attack');
  assert.notEqual(patrol.communications.mission.id,mission.id);
  assert.equal(patrol.communications.messages.filter(item=>item.subject==='Patrol update').length,1);
  assert.equal(pollPatrolMission(patrol.communications,context,miningStations,()=>.3),false);
});

test('quiet sweeps accept authorized Earth departures and hold new dispatches until Earth after return orders',()=>{
  for(const stay of [false,true]){
    const patrol=dispatchedMission(.6),sector=arriveForAssignment(patrol);
    const {original,communications,context}=patrol;
    sector.running=true;sector.own.vy=1200;
    advanceSweep(patrol,120);advanceSweep(patrol,60);
    assert.equal(pollPatrolMission(communications,context,miningStations),true);
    if(stay){
      advanceSweep(patrol,120);
      assert.equal(pollPatrolMission(communications,context,miningStations,()=>.9),true);
      assert.match(communications.messages.at(-1).body,/Proceed to Earth/);
    }else{
      assert.equal(leavePatrolMission(communications,context,miningStations,true),true);
      assert.match(communications.messages.at(-1).body,/Returning to Earth as authorized/);
    }
    assert.equal(communications.messages.at(-1).subject,'Mission complete');
    assert.equal(communications.mission,null);
    const restored=parseSave(JSON.stringify(createSave(original))).bridge.communications;
    assert.equal(restored.returningToEarth,true);
    context.days+=1;
    assert.equal(pollPatrolMission(restored,context,miningStations),false);
    const orders=sendCommunication(restored,{...context,contacts:[],missionStations:miningStations},'hq','orders');
    assert.match(orders.response,/Proceed to Earth/);
    assert.equal(restored.mission,null);
    context.sector=createSector();
    assert.equal(pollPatrolMission(restored,context,miningStations),true);
    assert.equal(restored.returningToEarth,false);
  }
  const early=dispatchedMission(.6);arriveForAssignment(early);
  assert.equal(leavePatrolMission(early.communications,early.context,miningStations,true),true);
  assert.equal(early.communications.messages.at(-1).subject,'Mission failed');
});

test('patrols with a distress or hostile encounter resolve the contact instead of giving a quiet check-in',()=>{
  const distress=dispatchedMission(.66),sector=arriveForAssignment(distress);
  assert.equal(sector.encounter.event,'distress');
  const contact=sector.contacts.find(item=>item.id===sector.encounter.distressId);
  sector.running=true;sector.own.vy=1200;
  for(let i=0;i<3;i++)advanceSweep(distress,120);
  assert.equal(pollPatrolMission(distress.communications,distress.context,miningStations),false);
  Object.assign(sector.own,{x:contact.x,y:contact.y,z:contact.z});
  assert.equal(pollPatrolMission(distress.communications,distress.context,miningStations),true);
  assert.match(distress.communications.messages.at(-1).body,/Distressed vessel located/);

  const raiders=dispatchedMission(.52),raidSector=arriveForAssignment(raiders);
  assert.equal(raidSector.encounter.event,'raiders');
  assert.equal(pollPatrolMission(raiders.communications,raiders.context,miningStations),false);
  for(const id of raidSector.encounter.hostileIds)surrenderShip(raiders.context.combat,id);
  assert.equal(pollPatrolMission(raiders.communications,raiders.context,miningStations),true);
  assert.match(raiders.communications.messages.at(-1).body,/Raiders repelled/);
});

test('legacy sweep saves keep their roster and replace the old timed briefing',()=>{
  const patrol=dispatchedMission(.52);
  const {original,context,communications,mission,message}=patrol;
  const {contacts,...encounter}=generateEncounter(mission.destination.name,mission.seed,5,mission.kind);
  const sector=createSector(contacts,mission.destination.name);sector.encounter=encounter;
  changeEncounter(context.combat,contacts);applyEncounterEvent(sector,context.combat);
  original.bridge.sector=sector;
  original.navigation.location=sector.location;
  original.navigation.ship={x:mission.destination.x,y:mission.destination.y};
  markChannelRead(communications,message.channelId);mission.arrived=true;
  message.body='Spend 60 seconds in the sector and sweep with radar operating at least 5 km from the arrival point.';
  const loaded=parseSave(JSON.stringify(createSave(original)));
  assert.deepEqual(loaded.bridge.sector.contacts,contacts);
  assert.equal(loaded.bridge.sector.encounter.event,'patrol');
  assert.doesNotMatch(loaded.bridge.communications.messages.at(-1).body,/60 seconds/);
});

test('search missions require approaching the missing freighter',()=>{
  const search=dispatchedMission(.9),searchSector=arriveForAssignment(search);
  assert.equal(search.mission.kind,'search');
  const freighter=searchSector.contacts.find(contact=>contact.id===searchSector.encounter.distressId);
  assert.deepEqual([freighter.vx,freighter.vy,freighter.vz],[0,0,0]);
  assert.equal(pollPatrolMission(search.communications,search.context,miningStations),false);
  Object.assign(searchSector.own,{x:freighter.x,y:freighter.y,z:freighter.z});
  assert.equal(pollPatrolMission(search.communications,search.context,miningStations),true);
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
