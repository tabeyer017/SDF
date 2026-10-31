import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunications,restoreCommunications,communicationsRecipients,communicationChannels,communicationRequests,communicationLink,sendCommunication,pollCommunications,markChannelRead,unreadCommunications,MAX_MESSAGES } from '../communications-model.mjs';
import { createCombat,canFire,fireWeapon,startFiring,stepCombat } from '../combat-model.mjs';
import { createSector,observeSector } from '../sector-model.mjs';
import { restoreCombat } from '../combat-save.mjs';
import { createSave,parseSave } from '../save-game.mjs';
import { restoreBridgeState } from '../bridge-model.mjs';
function setup(){const sector=createSector(),combat=createCombat(sector.contacts);return {state:createCommunications(),context:{sector,combat,contacts:observeSector(sector),range:60,inTransit:false,days:16.25}};}

test('directory includes HQ, every station and settlement, and only live ships in Tactical range',()=>{
  const {state,context}=setup(),recipients=communicationsRecipients(state,context);
  assert.equal(communicationChannels.length,25);assert.equal(new Set(communicationChannels.map(r=>r.id)).size,25);
  for(const id of ['hq','moon-station','mars-colony','heliopause-station','mine-alpha','mine-omega'])assert.ok(recipients.some(r=>r.id===id));
  assert.ok(recipients.some(r=>r.contactId==='E-04'));assert.ok(!recipients.some(r=>r.contactId==='E-06'));
  assert.match(recipients.find(r=>r.contactId==='U-01').name,/Unknown/);
  context.range=10;assert.equal(communicationsRecipients(state,context).filter(r=>r.kind==='ship').length,1);
  context.inTransit=true;assert.equal(communicationsRecipients(state,context).filter(r=>r.kind==='ship').length,0);
});

test('messages receive contextual replies, unread counts, read state, and durable JSON history',()=>{
  const {state,context}=setup();assert.equal(unreadCommunications(state),1);
  assert.equal(sendCommunication(state,context,'hq','orders','Request updated patrol instructions.').ok,true);
  assert.match(state.messages.at(-1).body,/Continue your patrol/);assert.equal(state.messages.at(-1).time,16.25*86400);
  assert.equal(unreadCommunications(state),2);assert.equal(markChannelRead(state,'hq'),true);assert.equal(unreadCommunications(state),0);
  assert.equal(sendCommunication(state,context,'moon-station','repairs').ok,true);assert.match(state.messages.at(-1).body,/Engineering/);
  assert.equal(sendCommunication(state,context,'mine-alpha','resupply').ok,true);assert.match(state.messages.at(-1).body,/Basic repairs/);
  const game={navigation:{ship:{x:0,y:1},location:'Earth',route:[],active:false,paused:false,days:context.days,speed:1},bridge:{settings:restoreBridgeState(),sector:context.sector,combat:context.combat,tactical:{lockedIds:[],activeId:null},communications:state},selection:{x:0,y:1,name:'Earth'},logs:[]};
  const restored=parseSave(JSON.stringify(createSave(game)));assert.deepEqual(restored.bridge.communications,state);
  delete game.bridge.communications;assert.deepEqual(parseSave(JSON.stringify(createSave(game))).bridge.communications,createCommunications());
});

test('communications failures and invalid requests do not transmit messages',()=>{
  const {state,context}=setup(),length=state.messages.length;
  assert.equal(sendCommunication(state,context,'hq','surrender').ok,false);
  assert.equal(sendCommunication(state,context,'hq','message','  ').ok,false);
  assert.equal(sendCommunication(state,context,'hq','message','x'.repeat(501)).ok,false);
  assert.equal(sendCommunication(state,context,'ship:0:E-06','hail').ok,false);
  context.combat.own.systems.communications.hp=0;assert.match(communicationLink(context,{available:true}),/array offline/);assert.equal(sendCommunication(state,context,'hq','hail').ok,false);
  context.combat.own.systems.communications.hp=60;context.combat.own.systems.power.hp=0;assert.equal(sendCommunication(state,context,'hq','hail').ok,false);
  assert.equal(state.messages.length,length);
});

test('distress calls arrive once per encounter and old ship conversations become read-only history',()=>{
  const {state,context}=setup();context.combat.contacts['N-02'].breach=true;
  assert.equal(pollCommunications(state,context),true);assert.equal(pollCommunications(state,context),false);
  assert.match(state.messages.at(-1).subject,/Distress/);
  const recipient='ship:0:N-02';assert.equal(sendCommunication(state,context,recipient,'offer').ok,true);assert.match(state.messages.at(-1).body,/accepted/);
  context.range=1;assert.equal(communicationsRecipients(state,context).find(r=>r.id===recipient).available,false);
  assert.equal(sendCommunication(state,context,recipient,'hail').ok,false);
  state.encounter++;context.range=60;assert.equal(pollCommunications(state,context),true);
  assert.ok(communicationsRecipients(state,context).some(r=>r.id==='ship:1:N-02'&&r.available));
  assert.equal(communicationsRecipients(state,context).find(r=>r.id===recipient).available,false);
});

test('hostiles reject surrender while strong and accept when weakened without changing velocity or in-flight shots',()=>{
  const {state,context}=setup(),{combat,sector}=context,id='E-04',recipient='ship:0:E-04',ship=combat.contacts[id];
  assert.equal(sendCommunication(state,context,recipient,'surrender').ok,true);assert.equal(ship.surrendered,false);assert.match(state.messages.at(-1).body,/rejected/);
  assert.equal(fireWeapon(combat,sector,'own','as-missiles-1',id,'hull',()=>0).ok,true);
  assert.equal(startFiring(combat,sector,'as-missiles-1',id,'hull').ok,true);combat.hostiles=[id];
  ship.systems.hull.hp=ship.systems.hull.max*.4;
  const contactBefore=structuredClone(sector.contacts.find(c=>c.id===id)),shotsBefore=structuredClone(combat.shots);
  assert.equal(sendCommunication(state,context,recipient,'surrender').ok,true);
  assert.equal(ship.surrendered,true);assert.equal(ship.ciwsAuto,false);assert.equal(combat.firing,null);assert.deepEqual(combat.hostiles,[]);
  assert.deepEqual(sector.contacts.find(c=>c.id===id),contactBefore);assert.deepEqual(combat.shots,shotsBefore);
  assert.match(canFire(combat,sector,id,ship.mounts[0].id,'own','hull'),/surrendered/);
  assert.equal(restoreCombat(JSON.parse(JSON.stringify(combat)),sector.contacts).contacts[id].surrendered,true);
  combat.hostiles=[id];stepCombat(combat,sector,1,()=>0);assert.equal(combat.shots.length,shotsBefore.length);assert.ok(combat.shots.every(s=>s.sourceId==='own'));
});

test('accepted cease-fire stops only this engagement and an offline recipient cannot reply',()=>{
  const {state,context}=setup(),{combat,sector}=context;
  combat.hostiles=['E-04','E-06'];combat.contacts['E-04'].systems.hull.hp=100;
  startFiring(combat,sector,'as-missiles-1','E-04','hull');startFiring(combat,sector,'mp-missiles-1','N-02','engines');
  assert.equal(sendCommunication(state,context,'ship:0:E-04','cease').ok,true);
  assert.deepEqual(combat.hostiles,['E-06']);assert.deepEqual(combat.firing.map(o=>o.targetId),['N-02']);
  combat.contacts['E-04'].systems.communications.hp=0;
  assert.equal(sendCommunication(state,context,'ship:0:E-04','hail').ok,false);
});

test('history stays bounded and save validation rejects malformed communication data',()=>{
  const {state,context}=setup();for(let i=0;i<105;i++)sendCommunication(state,context,'hq','hail');
  assert.equal(state.messages.length,MAX_MESSAGES);assert.deepEqual(restoreCommunications(JSON.parse(JSON.stringify(state))),state);
  for(const change of [s=>s.messages[0].body='x'.repeat(1601),s=>s.messages[0].channelId='invalid',s=>s.messages[0].time=-1,s=>s.messages[0].time=1e100,s=>s.messages[1].id=s.messages[0].id,s=>s.filter='invalid',s=>s.alerts=['not-a-ship']]){
    const bad=structuredClone(state);change(bad);assert.throws(()=>restoreCommunications(bad),/communications/);
  }
  const old=createCombat(context.sector.contacts);delete old.contacts['E-04'].surrendered;
  assert.equal(restoreCombat(old,context.sector.contacts).contacts['E-04'].surrendered,false);
});
