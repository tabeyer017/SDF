import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommunications,restoreCommunications,communicationsRecipients,communicationChannels,communicationRequests,communicationLink,sendCommunication,pollCommunications,markChannelRead,unreadCommunications,MAX_MESSAGES } from '../communications-model.mjs';
import { createCombat,canFire,fireWeapon,startFiring,stepCombat,changeEncounter } from '../combat-model.mjs';
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

test('HQ and stations dispatch a resupply / repair ship without instantly restoring ammunition',()=>{
  for(const channel of ['hq','moon-station']){
    const {state,context}=setup();context.combat.own.ammo['as-missiles']=0;
    assert.ok(communicationRequests(communicationsRecipients(state,context).find(r=>r.id===channel)).some(r=>r.id==='support'));
    const result=sendCommunication(state,context,channel,'support');assert.equal(result.accepted,true);
    assert.equal(context.combat.support.phase,'en-route');assert.equal(context.sector.running,true);
    assert.equal(context.combat.own.ammo['as-missiles'],0);assert.match(result.response,/tender dispatched/);
    assert.match(state.messages.at(-1).body,/rendezvous/);
    assert.equal(sendCommunication(state,context,channel,'support').accepted,false);
  }
});

test('support dispatch requires communications and a local rendezvous outside EPD transit',()=>{
  const {state,context}=setup();context.inTransit=true;
  assert.equal(sendCommunication(state,context,'hq','support').accepted,false);assert.equal(context.combat.support,null);
  context.inTransit=false;context.combat.own.systems.communications.hp=0;
  assert.equal(sendCommunication(state,context,'hq','support').ok,false);assert.equal(context.combat.support,null);
  context.combat.own.systems.communications.hp=60;
  assert.equal(sendCommunication(state,context,'ship:0:F-03','support').ok,false);
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

test('only identified friendly SDF channels offer battle commands',()=>{
  const {state,context}=setup(),recipients=communicationsRecipients(state,context);
  const ally=recipients.find(r=>r.contactId==='F-03');assert.equal(ally.friendly,true);
  assert.ok(communicationRequests(ally).some(r=>r.id==='attack-targets'));
  for(const id of ['E-04','N-02','U-01'])assert.ok(!communicationRequests(recipients.find(r=>r.contactId===id)).some(r=>r.id==='attack-targets'));
  assert.equal(sendCommunication(state,context,'ship:0:N-02','attack-targets').ok,false);
});

test('accepted attack requests produce allied fire and hostile retaliation without taking over player weapons',()=>{
  const {state,context}=setup();context.lockedTargetIds=['N-02','F-03','U-01','E-04'];
  const ally=context.sector.contacts.find(c=>c.id==='F-03');
  Object.assign(context.sector.contacts.find(c=>c.id==='E-04'),{x:ally.x+10,y:ally.y,z:ally.z});
  const result=sendCommunication(state,context,'ship:0:F-03','attack-targets');
  assert.equal(result.accepted,true);assert.equal(context.sector.running,true);
  assert.deepEqual(context.combat.alliedOrders['F-03'].targetIds,['E-04']);assert.equal(context.combat.firing,null);
  const ammo=context.combat.contacts['F-03'].ammo['as-missiles'];stepCombat(context.combat,context.sector,.05,()=>0);
  assert.ok(context.combat.shots.some(s=>s.sourceId==='F-03'&&s.targetId==='E-04'));
  assert.ok(context.combat.shots.some(s=>s.sourceId==='E-04'&&s.targetId==='F-03'));
  assert.ok(context.combat.contacts['F-03'].ammo['as-missiles']<ammo);
  assert.deepEqual(context.combat.hostiles,[]);assert.equal(context.combat.firing,null);
  assert.match(state.messages.at(-1).body,/Acknowledged/);
});

test('battle assistance uses confirmed threats without requiring a target lock',()=>{
  const {state,context}=setup();context.combat.hostiles=['E-04'];
  const result=sendCommunication(state,context,'ship:0:F-03','battle-assistance');
  assert.equal(result.accepted,true);assert.deepEqual(context.combat.alliedOrders['F-03'].targetIds,['E-04']);
  assert.match(result.response,/fire support/);
});

test('friendly ships refuse unsafe or impossible battle requests and explain their reason',()=>{
  const cases=[
    {change:c=>c.lockedTargetIds=['F-03','N-02','U-01'],reason:/will not attack/},
    {change:c=>c.combat.contacts['F-03'].systems.hull.hp=100,reason:/damage control/},
    {change:c=>c.combat.contacts['F-03'].breach=true,reason:/damage control/},
    {change:c=>c.combat.contacts['F-03'].systems.bridge.hp=0,reason:/bridge/},
    {change:c=>{for(const weapon in c.combat.contacts['F-03'].ammo)c.combat.contacts['F-03'].ammo[weapon]=0;},reason:/ammunition/},
    {change:c=>c.combat.hostiles=['F-03'],reason:/not accepting/},
    {change:c=>{c.range=200;Object.assign(c.sector.contacts.find(s=>s.id==='F-03'),{x:-199,y:0,z:0});Object.assign(c.sector.contacts.find(s=>s.id==='E-04'),{x:199,y:0,z:0});c.contacts=observeSector(c.sector);},reason:/weapons range/}
  ];
  for(const {change,reason} of cases){
    const {state,context}=setup();context.lockedTargetIds=['E-04'];change(context);
    const result=sendCommunication(state,context,'ship:0:F-03','attack-targets');
    assert.equal(result.ok,true);assert.equal(result.accepted,false);assert.match(result.response,reason);
    assert.deepEqual(context.combat.alliedOrders,{});assert.equal(context.sector.running,false);
  }
});

test('offline, out-of-range, and transit links cannot issue allied orders',()=>{
  for(const change of [c=>c.combat.own.systems.communications.hp=0,c=>c.combat.contacts['F-03'].systems.communications.hp=0,c=>c.range=10,c=>c.inTransit=true]){
    const {state,context}=setup();context.lockedTargetIds=['E-04'];change(context);const before=state.messages.length;
    assert.equal(sendCommunication(state,context,'ship:0:F-03','attack-targets').ok,false);
    assert.equal(state.messages.length,before);assert.deepEqual(context.combat.alliedOrders,{});
  }
});

test('stand down stops allied firing orders while leaving existing shots in flight',()=>{
  const {state,context}=setup();context.lockedTargetIds=['E-04'];
  sendCommunication(state,context,'ship:0:F-03','attack-targets');stepCombat(context.combat,context.sector,.05,()=>0);
  const shots=structuredClone(context.combat.shots),ammo={...context.combat.contacts['F-03'].ammo};
  assert.equal(sendCommunication(state,context,'ship:0:F-03','stand-down').accepted,true);
  assert.deepEqual(context.combat.alliedOrders,{});assert.deepEqual(context.combat.shots,shots);
  stepCombat(context.combat,context.sector,.05,()=>0);assert.deepEqual(context.combat.contacts['F-03'].ammo,ammo);
});

test('allied orders survive saves, reject unsafe assignments, and clear on encounter changes',()=>{
  const {state,context}=setup();context.lockedTargetIds=['E-04'];sendCommunication(state,context,'ship:0:F-03','attack-targets');
  stepCombat(context.combat,context.sector,.05,()=>0);
  const saved=JSON.parse(JSON.stringify(context.combat)),restored=restoreCombat(saved,context.sector.contacts);
  assert.deepEqual(restored.alliedOrders,context.combat.alliedOrders);assert.deepEqual(restored.shots,context.combat.shots);
  for(const change of [s=>s.alliedOrders['F-03'].targetIds=['N-02'],s=>s.alliedOrders['F-03'].targetIds=['E-04','E-04'],s=>s.alliedOrders['F-03'].mode='invalid',s=>s.alliedOrders['E-04']=s.alliedOrders['F-03']]){
    const bad=structuredClone(saved);change(bad);assert.throws(()=>restoreCombat(bad,context.sector.contacts),/combat data/);
  }
  delete saved.alliedOrders;assert.deepEqual(restoreCombat(saved,context.sector.contacts).alliedOrders,{});
  changeEncounter(context.combat,context.sector.contacts);assert.deepEqual(context.combat.alliedOrders,{});
});

test('surrender and critical damage end allied support against that target',()=>{
  const {state,context}=setup();context.lockedTargetIds=['E-04'];sendCommunication(state,context,'ship:0:F-03','attack-targets');
  context.combat.contacts['E-04'].systems.hull.hp=100;
  assert.equal(sendCommunication(state,context,'ship:0:E-04','surrender').ok,true);assert.deepEqual(context.combat.alliedOrders,{});
  context.combat.contacts['E-04'].surrendered=false;sendCommunication(state,context,'ship:0:F-03','attack-targets');
  context.combat.contacts['F-03'].breach=true;stepCombat(context.combat,context.sector,.05,()=>0);assert.deepEqual(context.combat.alliedOrders,{});
});
