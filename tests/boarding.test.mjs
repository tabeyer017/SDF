import test from 'node:test';
import assert from 'node:assert/strict';
import {createCombat,stepCombat,surrenderShip,changeEncounter} from '../combat-model.mjs';
import {createSector,observeSector,stepSector} from '../sector-model.mjs';
import {restoreCombat} from '../combat-save.mjs';
import {boardingBalance,boardingLaunchError,launchShuttle,recallShuttle,advanceBoarding,hasDeployedShuttles,shuttleStatus} from '../boarding-model.mjs';
import {channelContactId,createCommunications,pollCommunications,restoreCommunications,unreadCommunications} from '../communications-model.mjs';
import {createSave,parseSave} from '../save-game.mjs';
import {restoreBridgeState} from '../bridge-model.mjs';
function setup(id='E-04'){
  const sector=createSector(),combat=createCombat(sector.contacts),contact=sector.contacts.find(item=>item.id===id);
  Object.assign(contact,{x:6,y:0,z:0,vx:0,vy:0,vz:0});
  return {sector,combat,target:observeSector(sector).find(item=>item.id===id)};
}
function advance(combat,sector,seconds){for(let i=0;i<seconds;i++){combat.time++;advanceBoarding(combat,sector,1,id=>surrenderShip(combat,id,'Captured by SDF marines','own',true));}}
function portable(combat,sector){return createSave({navigation:{ship:{x:0,y:1},location:'Earth',route:[],active:false,paused:false,days:0,speed:1},bridge:{settings:restoreBridgeState(),sector,combat,tactical:{lockedIds:[],activeId:null}},selection:{x:0,y:1,name:'Earth'},logs:[]});}

test('shuttle launches allow 10 km including the boundary and reject greater 3D range',()=>{
  const {combat,sector,target}=setup();assert.equal(boardingBalance.range,10);
  assert.equal(boardingLaunchError(combat,sector,1,'capture',{...target,x:6,y:8,z:0}),null);
  const before=structuredClone(combat);
  for(const point of [{x:10.001,y:0,z:0},{x:6,y:8,z:.1}]){
    const result=launchShuttle(combat,sector,1,'capture',{...target,...point});assert.equal(result.ok,false);assert.match(result.message,/within 10 km/);
  }
  assert.deepEqual(combat,before);
});

test('the launch limit does not prevent recall or recovery after separation exceeds 10 km',()=>{
  const {combat,sector,target}=setup();launchShuttle(combat,sector,1,'explore',target);advance(combat,sector,3);
  sector.own.x=50;assert.equal(recallShuttle(combat,sector,1).ok,true);
  advance(combat,sector,45);assert.equal(combat.boarding.shuttles[0].status,'ready');assert.equal(hasDeployedShuttles(combat),false);
});

test('each actual shuttle launches one team, stays unavailable, and returns before relaunch',()=>{
  const {combat,sector,target}=setup('U-01');assert.equal(combat.boarding.shuttles.length,2);
  assert.equal(launchShuttle(combat,sector,1,'explore',target).ok,true);
  assert.match(launchShuttle(combat,sector,1,'explore',target).message,/Tactical Shuttle Ops/);
  assert.equal(launchShuttle(combat,sector,2,'assist',target).ok,true);
  assert.equal(hasDeployedShuttles(combat),true);assert.equal(sector.running,true);
  advance(combat,sector,6);assert.equal(combat.boarding.shuttles[0].entry,'hatch');
  advance(combat,sector,120);assert.ok(combat.boarding.shuttles.every(shuttle=>shuttle.status==='ready'));
  assert.ok(combat.boarding.reports.some(report=>report.body.includes('all 10 marines')));
  assert.equal(launchShuttle(combat,sector,1,'explore',target).ok,true);
});

test('boarders use a cutting collar against resistance without requiring a target hangar',()=>{
  const {combat,sector,target}=setup();launchShuttle(combat,sector,1,'capture',target);
  advance(combat,sector,120);const shuttle=combat.boarding.shuttles[0];
  assert.equal(shuttle.entry,'hull-cut');assert.equal(shuttle.status,'boarding');assert.equal(shuttle.blocked,true);
  assert.equal(combat.boarding.captured.length,0);assert.match(shuttleStatus(shuttle),/Resistance/);
  assert.ok(combat.boarding.reports.some(report=>report.body.includes('sealed hull-cutting collar')));
  assert.equal(recallShuttle(combat,sector,1).ok,true);assert.equal(shuttle.status,'returning');
  assert.equal(recallShuttle(combat,sector,1).ok,false);advance(combat,sector,10);assert.equal(shuttle.status,'ready');
});

test('capture secures a surrendered ship, ends its engagement, and survives portable saves',()=>{
  const {combat,sector,target}=setup();surrenderShip(combat,target.id,'Surrender accepted');
  launchShuttle(combat,sector,1,'capture',target);advance(combat,sector,100);
  assert.deepEqual(combat.boarding.captured,[target.id]);assert.equal(combat.contacts[target.id].surrendered,true);
  assert.equal(hasDeployedShuttles(combat),false);
  const loaded=parseSave(JSON.stringify(portable(combat,sector)));assert.deepEqual(loaded.bridge.combat.boarding,combat.boarding);
  assert.match(boardingLaunchError(combat,sector,2,'capture',target),/already captured/);
});

test('reinforcements combine boarding strength, and assistance contains emergencies without restocking',()=>{
  const {combat,sector,target}=setup();combat.contacts[target.id].systems.hull.hp=450;
  launchShuttle(combat,sector,1,'capture',target);advance(combat,sector,100);assert.equal(combat.boarding.shuttles[0].blocked,true);
  launchShuttle(combat,sector,2,'capture',target);advance(combat,sector,100);assert.deepEqual(combat.boarding.captured,[target.id]);
  const next=setup('U-01'),ship=next.combat.contacts[next.target.id];ship.fire=true;ship.breach=true;const ammo={...ship.ammo};
  launchShuttle(next.combat,next.sector,1,'assist',next.target);advance(next.combat,next.sector,100);
  assert.equal(ship.fire,false);assert.equal(ship.breach,false);assert.deepEqual(ship.ammo,ammo);
});

test('invalid launches and offline recalls do not change deployment state',()=>{
  const {combat,sector,target}=setup(),before=structuredClone(combat);
  for(const [number,order,contact,transit] of [[3,'capture',target,false],[1,'invalid',target,false],[1,'capture',null,false],[1,'capture',{...target,stale:true},false],[1,'capture',{...target,x:201},false],[1,'capture',target,true],[1,'capture',{...target,type:'friendly'},false]])assert.equal(launchShuttle(combat,sector,number,order,contact,transit).ok,false);
  assert.deepEqual(combat,before);
  launchShuttle(combat,sector,1,'capture',target);combat.own.systems.communications.hp=0;
  assert.equal(recallShuttle(combat,sector,1).ok,false);assert.equal(combat.boarding.shuttles[0].status,'outbound');
});

test('travel follows moving ships in 3D and recall preserves the shuttle current position',()=>{
  const {combat,sector,target}=setup('U-01'),contact=sector.contacts.find(item=>item.id===target.id);
  Object.assign(contact,{x:5,y:5,z:5,vx:30,vy:20,vz:40});launchShuttle(combat,sector,1,'explore',target);
  for(let i=0;i<3;i++){stepSector(sector,1);combat.time++;advanceBoarding(combat,sector,1,()=>{});}
  const shuttle=combat.boarding.shuttles[0];assert.ok(shuttle.x>0&&shuttle.y>0&&shuttle.z>0);
  const before=[shuttle.x,shuttle.y,shuttle.z];recallShuttle(combat,sector,1);assert.deepEqual([shuttle.x,shuttle.y,shuttle.z],before);
  advance(combat,sector,10);assert.equal(shuttle.status,'ready');
});

test('deployed shuttles survive saves, pause with local flight and prevent EPD or encounter replacement',()=>{
  const {combat,sector,target}=setup();launchShuttle(combat,sector,1,'capture',target);stepCombat(combat,sector,1,()=>.99);
  const save=portable(combat,sector),loaded=parseSave(JSON.stringify(save));
  assert.equal(loaded.bridge.sector.running,false);assert.deepEqual(loaded.bridge.combat.boarding,combat.boarding);
  assert.equal(changeEncounter(combat,[]),false);assert.ok(combat.contacts[target.id]);
  save.navigation.route=[{name:'Mars',x:1,y:1}];save.navigation.active=true;save.bridge.sector.running=false;
  assert.throws(()=>parseSave(JSON.stringify(save)),/shuttles/);
});

test('old saves receive ready shuttles and malformed boarding state is rejected',()=>{
  const {combat,sector}=setup(),old=structuredClone(combat);delete old.boarding;
  assert.equal(hasDeployedShuttles(restoreCombat(old,sector.contacts)),false);
  for(const change of [s=>s.boarding.shuttles.push({...s.boarding.shuttles[0]}),s=>s.boarding.shuttles[0].number=2,s=>s.boarding.shuttles[0].status='boarding',s=>s.boarding.shuttles[0].x=Infinity,s=>s.boarding.captured=['E-04'],s=>s.boarding.shuttles[0].order='invalid',s=>s.boarding.nextReport=0]){
    const bad=structuredClone(combat);change(bad);assert.throws(()=>restoreCombat(bad,sector.contacts),/boarding/);
  }
});

test('launch, recall and recovery reports arrive once in the saved Shuttle control channel',()=>{
  const {combat,sector,target}=setup(),state=createCommunications(),context={combat,sector,contacts:observeSector(sector),range:60,days:1,inTransit:false};
  launchShuttle(combat,sector,1,'explore',target);assert.equal(pollCommunications(state,context),true);
  const count=state.messages.length;assert.equal(pollCommunications(state,context),false);assert.equal(state.messages.length,count);
  assert.equal(state.messages.at(-1).channelId,'shuttles');assert.equal(state.messages.at(-1).time,86400);
  recallShuttle(combat,sector,1);advance(combat,sector,10);pollCommunications(state,context);
  assert.ok(unreadCommunications(state)>1);
  const restored=restoreCommunications(state);assert.deepEqual(restored,state);
  const recovery=restored.messages.find(message=>message.subject==='Shuttle 1 returned');
  assert.equal(channelContactId(recovery.contactChannelId,state.encounter),target.id);
  assert.equal(channelContactId(recovery.contactChannelId,state.encounter+1),null);
});
