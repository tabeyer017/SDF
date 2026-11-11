import { settlementDefinitions } from './settlements.mjs';
import { miningStations } from './mining.mjs';
import { shipPerformance, canContinueAttack, standDownAgainst, surrenderShip, orderAlliedSupport, requestSupportShip, supportStatus } from './combat-model.mjs';
import {playerShipName,defaultShipName} from './ship-names.mjs';
import {shuttleStatus} from './boarding-model.mjs';
import {generatePatrolMission,missionBriefings,updateLegacyPatrolBriefing} from './encounter-model.mjs';
import {distance,EDGE_AU,SOL_EXCLUSION_AU} from './navigation.mjs';
import {ARRIVAL_EPSILON_AU} from './settlements.mjs';

export const MAX_MESSAGES=200;
const MISSION_INTERVAL=1800;
const PATROL_CHECK_IN=180;
const PATROL_EXTENSION=120;
const TIME_EPSILON=1e-6;
const EARTH_ORDERS='Proceed to Earth. Plot your return course on the System Map.';
export const communicationChannels=[
  {id:'hq',name:'Earth HQ · Sol Command',kind:'hq',description:'Secure command relay · Earth'},
  {id:'shuttles',name:'Shuttle control',kind:'hq',description:'Shipboard shuttle and marine operations'},
  ...settlementDefinitions.map(s=>({id:s.id,name:s.name,kind:'station',description:s.type})),
  {id:'heliopause-station',name:'Heliopause station',kind:'station',description:'Outer patrol station'},
  ...miningStations.map(s=>({id:s.id,name:s.name,kind:'station',description:s.companyName}))
];
const requestLabels={hail:'Open channel',status:'Request status',report:'Send patrol / situation report',assistance:'Request assistance',offer:'Offer assistance',orders:'Request orders',docking:'Request docking instructions',repairs:'Request repairs',resupply:'Request resupply',escort:'Request escort',threat:'Report hostile contact',surrender:'Demand surrender',cease:'Request cease-fire',acknowledge:'Acknowledge',accept:'Accept assistance',decline:'Decline assistance',message:'Other message'};
requestLabels.support='Request resupply / repair ship';
export const friendlyCommands=[{id:'attack-targets',label:'Attack my targets'},{id:'battle-assistance',label:'I need assistance in this battle'},{id:'stand-down',label:'Cease fire / stand down'},{id:'status',label:'Report your status'}];
for(const command of friendlyCommands)if(command.id!=='status')requestLabels[command.id]=command.label;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=ok=>{if(!ok)throw new Error('Invalid communications data in save file.');};
const percent=s=>Math.round(s.hp/s.max*100);
const stamp=context=>Math.max(0,context.days??0)*86400;
export function createCommunications(shipName=defaultShipName('sdf-frigate')){
  return {nextId:2,selectedId:'hq',filter:'all',encounter:0,alerts:[],mission:null,nextMissionAt:0,returningToEarth:false,messages:[{id:1,channelId:'hq',channelName:communicationChannels[0].name,kind:'hq',direction:'received',subject:'Patrol orders',body:`${shipName}, Sol Command. Maintain the patrol watch, assist vessels in distress, and report hostile activity. Use this channel for situation reports and requests. Sol Command standing by.`,time:0,location:'Earth',read:false}]};
}
export function restoreCommunications(saved){
  if(saved===undefined)return createCommunications();
  check(object(saved)&&Number.isSafeInteger(saved.nextId)&&saved.nextId>0&&saved.nextId<=1e12&&Number.isSafeInteger(saved.encounter)&&saved.encounter>=0&&saved.encounter<=1e12);
  check(typeof saved.selectedId==='string'&&saved.selectedId.length<=100&&['all','unread','ships','stations','archive'].includes(saved.filter));
  check(Array.isArray(saved.messages)&&saved.messages.length<=MAX_MESSAGES&&Array.isArray(saved.alerts)&&saved.alerts.length<=100);
  const ids=new Set();let previous=0;
  const messages=saved.messages.map(m=>{
    check(object(m)&&Number.isSafeInteger(m.id)&&m.id>previous&&m.id<saved.nextId&&!ids.has(m.id));ids.add(m.id);previous=m.id;
    for(const [key,max] of [['channelId',100],['channelName',160],['subject',100],['body',1600],['location',120]])check(typeof m[key]==='string'&&m[key].length<=max);
    check(['hq','station','ship'].includes(m.kind)&&['sent','received'].includes(m.direction)&&typeof m.read==='boolean'&&Number.isFinite(m.time)&&m.time>=0&&m.time<=365000*86400);
    check(communicationChannels.some(c=>c.id===m.channelId&&c.kind===m.kind)||(m.kind==='ship'&&/^ship:\d+:[\w-]+$/.test(m.channelId)));
    if(m.contactChannelId!==undefined)check(m.channelId==='shuttles'&&typeof m.contactChannelId==='string'&&m.contactChannelId.length<=100&&/^ship:\d+:[\w-]+$/.test(m.contactChannelId));
    const body=m.channelId==='hq'&&m.direction==='received'&&m.subject===missionBriefings.patrol.title
      ?updateLegacyPatrolBriefing(m.body):m.body;
    return {id:m.id,channelId:m.channelId,channelName:m.channelName,kind:m.kind,direction:m.direction,subject:m.subject,body,time:m.time,location:m.location,read:m.read,...(m.contactChannelId?{contactChannelId:m.contactChannelId}:{})};
  });
  const alerts=saved.alerts.map(id=>{check(typeof id==='string'&&/^ship:\d+:[\w-]+$/.test(id));return id;});
  check(new Set(alerts).size===alerts.length);
  const nextMissionAt=saved.nextMissionAt??0;
  check(Number.isFinite(nextMissionAt)&&nextMissionAt>=0&&nextMissionAt<=365000*86400+MISSION_INTERVAL);
  const mission=saved.mission==null?null:restoreMission(saved.mission,messages);
  const returningToEarth=saved.returningToEarth??false;
  check(typeof returningToEarth==='boolean'&&(!returningToEarth||!mission));
  return {nextId:saved.nextId,selectedId:saved.selectedId,filter:saved.filter,encounter:saved.encounter,alerts,messages,mission,nextMissionAt,returningToEarth};
}

function restoreMission(mission,messages){
  check(object(mission)&&typeof mission.kind==='string'&&Object.hasOwn(missionBriefings,mission.kind)&&typeof mission.arrived==='boolean');
  check(Number.isInteger(mission.seed)&&mission.seed>=0&&mission.seed<=0xFFFFFFFF);
  const {id,kind,seed,arrived,destination}=mission;
  check(object(destination)&&typeof destination.name==='string'&&destination.name.length>0&&destination.name.length<=120);
  const {name,x,y,siteId}=destination;
  const radius=Math.hypot(x,y);
  check(Number.isFinite(x)&&Number.isFinite(y)&&radius>=SOL_EXCLUSION_AU&&radius<=EDGE_AU+.01);
  if(kind==='station-attack')check(communicationChannels.some(channel=>channel.kind==='station'&&channel.id===siteId&&channel.name===name&&channel.id!=='moon-station'));
  else check(siteId===undefined);
  const message=messages.find(item=>item.id===id);
  check(message?.direction==='received'&&message.channelId===(siteId??'hq')&&message.subject===missionBriefings[kind].title&&(!arrived||message.read));
  const result={id,kind,seed,arrived,destination:{name,x,y,...(siteId?{siteId}:{})}};
  const {sweepSeconds,clearedToReturnAt}=mission;
  if(sweepSeconds!==undefined){
    check(kind==='patrol'&&arrived&&Number.isFinite(sweepSeconds)&&sweepSeconds>=0&&sweepSeconds<=365000*86400);
    result.sweepSeconds=sweepSeconds;
  }
  if(clearedToReturnAt!==undefined){
    check(Number.isFinite(clearedToReturnAt)&&clearedToReturnAt>=PATROL_CHECK_IN-TIME_EPSILON&&clearedToReturnAt<=sweepSeconds);
    result.clearedToReturnAt=clearedToReturnAt;
  }
  return result;
}

export function revealedPatrolMission(state){
  const mission=state.mission;
  return mission&&state.messages.some(message=>message.id===mission.id&&message.read)?mission:null;
}

export function missionMatchesWaypoint(mission,waypoint){
  return !!mission&&!mission.arrived&&waypoint?.name===mission.destination.name&&distance(mission.destination,waypoint)<ARRIVAL_EPSILON_AU;
}

function missionChannel(mission){return communicationChannels.find(channel=>channel.id===(mission.destination.siteId??'hq'));}

export function finishPatrolMission(state,context,result,detail){
  const mission=state.mission;
  state.mission=null;
  state.nextMissionAt=stamp(context)+MISSION_INTERVAL;
  addMessage(state,missionChannel(mission),'received',`Mission ${result}`,`${missionBriefings[mission.kind].title} · ${mission.destination.name}. ${detail}`,context);
}

export function recordPatrolSweep(state,sector,radarOperational,seconds){
  const {mission}=state;
  if(mission?.kind!=='patrol'||!mission.arrived||sector.encounter.event!=='patrol'||!radarOperational||seconds<=0)return;
  const {vx,vy,vz}=sector.own;
  if(Math.hypot(vx,vy,vz)>1e-6)mission.sweepSeconds=(mission.sweepSeconds??0)+seconds;
}

function dispatchPatrolMission(state,context,stations,random){
  const dispatch=generatePatrolMission(state.nextId,context.position,stations,random);
  const briefing=missionBriefings[dispatch.kind];
  state.mission=dispatch;
  addMessage(state,missionChannel(dispatch),'received',briefing.title,`${playerShipName(context.combat)}, proceed to ${dispatch.destination.name}. ${briefing.objective} Coordinates relayed to the System Map.`,context);
}

function pollQuietPatrol(state,context,stations,random){
  const {mission}=state;
  const elapsed=mission.sweepSeconds??0;
  const clearedAt=mission.clearedToReturnAt;
  const due=clearedAt===undefined?PATROL_CHECK_IN:clearedAt+PATROL_EXTENSION;
  if(elapsed+TIME_EPSILON<due||communicationLink(context,{available:true}))return false;
  if(clearedAt===undefined){
    mission.clearedToReturnAt=elapsed;
    addMessage(state,missionChannel(mission),'received','Patrol update','No unusual activity has been reported. You may continue sweeping this sector or return to Earth.',context);
  }else if(random()<.5){
    finishPatrolMission(state,context,'complete','Sector clear. Stand by for a new assignment.');
    dispatchPatrolMission(state,context,stations,random);
  }else{
    finishPatrolMission(state,context,'complete',`Sector clear. ${EARTH_ORDERS}`);
    state.returningToEarth=true;
  }
  return true;
}

export function leavePatrolMission(state,context,stations,headingToEarth){
  const {mission}=state;
  if(!mission?.arrived)return false;
  if(headingToEarth&&mission.clearedToReturnAt!==undefined){
    finishPatrolMission(state,context,'complete','Sector clear. Returning to Earth as authorized.');
    state.returningToEarth=true;
    return true;
  }
  if(mission.kind!=='patrol'||context.sector.encounter.event!=='patrol')pollPatrolMission(state,context,stations);
  if(state.mission===mission)finishPatrolMission(state,context,'failed','The sector was left before the objective was complete.');
  return true;
}

export function pollPatrolMission(state,context,stations,random=Math.random){
  const {mission}=state,{sector,combat}=context;
  if(!mission){
    if(state.returningToEarth){
      if(context.inTransit||sector.location!=='Earth')return false;
      state.returningToEarth=false;
      state.nextMissionAt=stamp(context)+MISSION_INTERVAL;
      return true;
    }
    if(stamp(context)<state.nextMissionAt||communicationLink(context,{available:true}))return false;
    dispatchPatrolMission(state,context,stations,random);
    return true;
  }
  if(!mission.arrived||context.inTransit)return false;
  const {attackTargetId,distressId,hostileIds,event}=sector.encounter;
  if(mission.kind==='patrol'&&event==='patrol')return pollQuietPatrol(state,context,stations,random);
  const radar=combat.own.radar&&shipPerformance(combat.own).sensors>0;
  if(attackTargetId&&combat.contacts[attackTargetId].systems.hull.hp<=0){
    finishPatrolMission(state,context,'failed','The protected ship was lost.');
    return true;
  }
  if(distressId&&combat.contacts[distressId].systems.hull.hp<=0){
    finishPatrolMission(state,context,'failed',mission.kind==='patrol'?'The distressed vessel was lost.':'The missing freighter was destroyed.');
    return true;
  }
  const freighter=distressId&&sector.contacts.find(contact=>contact.id===distressId);
  const located=freighter&&radar&&Math.hypot(freighter.x-sector.own.x,freighter.y-sector.own.y,freighter.z-sector.own.z)<=10;
  const defendedId=attackTargetId||(event==='raiders'?'own':null);
  const repelled=defendedId&&!hostileIds.some(id=>combat.hostiles.includes(id)&&canContinueAttack(combat.contacts[id]))&&
    !combat.shots.some(shot=>shot.targetId===defendedId&&hostileIds.includes(shot.sourceId));
  if(!located&&!repelled)return false;
  const detail=repelled?(attackTargetId?'Raiders repelled. The protected ship survived.':'Raiders repelled. Patrol report filed.'):
    mission.kind==='patrol'?'Distressed vessel located. Its position has been relayed to Sol Command.':'Freighter located. Its position has been relayed to Sol Command.';
  finishPatrolMission(state,context,'complete',detail);
  return true;
}
export function unreadCommunications(state){return state.messages.filter(m=>m.direction==='received'&&!m.read).length;}
export function channelContactId(channelId,encounter){
  const match=/^ship:(\d+):([\w-]+)$/.exec(channelId);
  return match&&match[1]===String(encounter)?match[2]:null;
}
function addMessage(state,recipient,direction,subject,body,context,contactChannelId){
  state.messages.push({id:state.nextId++,channelId:recipient.id,channelName:recipient.name,kind:recipient.kind,direction,subject,body,time:stamp(context),location:context.sector.location,read:direction==='sent',...(contactChannelId?{contactChannelId}:{})});
  if(state.messages.length>MAX_MESSAGES)state.messages.splice(state.messages[0].id===state.mission?.id?1:0,1);
}
export function communicationsRecipients(state,context){
  const recipients=communicationChannels.map(c=>({...c,available:true}));
  if(!context.inTransit)for(const c of context.contacts){
    const range=Math.hypot(c.x,c.y,c.z);
    if(c.stale||range>context.range)continue;
    const ship=context.combat.contacts[c.id];
    recipients.push({id:`ship:${state.encounter}:${c.id}`,name:`${c.trackLabel} · ${c.name}`,kind:'ship',contactId:c.id,available:true,friendly:c.type==='friendly'&&!!ship?.classId.startsWith('sdf-'),hostile:c.type==='enemy'||context.combat.hostiles.includes(c.id),description:`${range.toFixed(1)} km · ${ship?.surrendered?'SURRENDERED':c.classification||'Unverified contact'}`});
  }
  for(const m of state.messages)if(!recipients.some(r=>r.id===m.channelId))recipients.push({id:m.channelId,name:m.channelName,kind:m.kind,available:false,description:'Channel history · no live tactical link'});
  return recipients;
}
export function communicationRequests(recipient){
  if(recipient?.id==='shuttles')return ['status','acknowledge'].map(id=>({id,label:requestLabels[id]}));
  if(!recipient)return [];
  const ids=['hail','status','report','assistance'];
  if(recipient.kind==='hq')ids.push('orders','escort','threat','support');
  if(recipient.kind==='station')ids.push('offer','docking','repairs','resupply','escort','threat','support');
  if(recipient.kind==='ship'){ids.push('offer','escort','threat','cease');if(recipient.hostile)ids.push('surrender');}
  if(recipient.friendly)ids.push('attack-targets','battle-assistance','stand-down');
  ids.push('acknowledge','accept','decline','message');
  return ids.map(id=>({id,label:requestLabels[id]}));
}
export function communicationLink(context,recipient){
  if(context.combat.own.systems.communications.hp<=0)return 'Communications array offline · repair in Engineering.';
  if(shipPerformance(context.combat.own).power<=0)return 'Main power offline · communications unavailable.';
  if(!recipient?.available)return 'No live link. Ship hails require a live contact within the selected Tactical range.';
  if(recipient.kind==='ship'&&context.combat.contacts[recipient.contactId]?.systems.communications.hp<=0)return 'No response carrier · target communications array is offline.';
  return null;
}
function ceaseEngagement(combat,id){
  standDownAgainst(combat,id);
}
function respond(recipient,request,context){
  if(recipient.id==='shuttles')return request==='status'?(context.combat.boarding?.shuttles.map(shuttle=>`Shuttle ${shuttle.number}: ${shuttleStatus(shuttle)}`).join('\n')||'No boarding shuttles assigned.'):'Shuttle control: acknowledged.';
  const {combat,sector}=context,ship=recipient.kind==='ship'?combat.contacts[recipient.contactId]:null;
  const ownName=playerShipName(combat);
  const weak=ship&&(ship.systems.hull.hp/ship.systems.hull.max<=.4||ship.mounts.every(m=>ship.systems[m.id].hp===0));
  const station=recipient.kind==='station',hq=recipient.kind==='hq',hostile=recipient.hostile&&!ship?.surrendered;
  switch(request){
    case 'hail':return ship?.surrendered?'We have surrendered. Our weapons remain secured.':hostile?`Channel open. State your business, ${ownName}.`:`${ownName}, ${recipient.name} receiving. Go ahead.`;
    case 'status':return ship?`Hull integrity ${percent(ship.systems.hull)}%. ${ship.surrendered?'We have surrendered.':ship.fire||ship.breach?'Damage-control assistance requested.':combat.alliedOrders[recipient.contactId]?`Providing fire support against ${combat.alliedOrders[recipient.contactId].targetIds.length} transmitted targets.`:'Crew standing by.'}`:hq?`Patrol watch active. ${supportStatus(combat,sector)} Report hostile activity and assistance requests on this channel.`:`Traffic control online at ${recipient.name}. ${recipient.id.startsWith('mine-')?'Basic repairs, limited spare parts, and gun ammunition available.':'Station repairs and replenishment available.'}`;
    case 'report':return 'Situation report received and logged. Maintain the watch and report any material change.';
    case 'orders':return 'Continue your patrol, investigate unidentified traffic, offer aid to distressed vessels, and report hostile activity. Use Navigation to plot your course.';
    case 'assistance':return hostile?'Your request for assistance is refused.':hq?'Distress report received. No reinforcement unit is currently assigned. Proceed to a repair station if able; retain this channel for further reports.':station?`We can provide dockside assistance at ${recipient.name}. Travel here, then contact Engineering for docking and service. No rescue craft is available for dispatch.`:'We can provide damage-control advice over comms. No rescue or repair team is available for transfer; seek station services if able.';
    case 'offer':return hostile?'We do not accept your assistance.':ship&&(ship.fire||ship.breach||percent(ship.systems.hull)<70)?'Assistance accepted. Please relay our distress to Earth HQ and direct us to station services.':`Thank you, ${ownName}. No immediate assistance is required; remain available on this channel.`;
    case 'escort':return hostile?'Escort request refused.':hq?'Escort request logged. No escort unit is currently available for assignment.':station?'No escort craft available. Maintain a safe course and report threats to Earth HQ.':'Unable to change course for escort duty. We will keep a listening watch.';
    case 'docking':return sector.location===recipient.name?'Approach within 5 km of the arrival point, reduce speed below 10 KPH, and clear incoming threats. Request docking through Engineering.':`Proceed to ${recipient.name}. On arrival, hold within 5 km below 10 KPH and request docking through Engineering.`;
    case 'repairs':case 'resupply':return `${recipient.id.startsWith('mine-')?'Basic repairs, partial spare-parts replenishment, and gun ammunition':'Full repairs, destroyed-system replacement, spare parts, and ammunition'} available after docking at ${recipient.name}. Request station service in Engineering.`;
    case 'threat':return hostile?'We reject your accusation.':hq?'Hostile contact report received. Maintain sensor contact and send updates. No reinforcements are currently assigned.':'Threat report received. Maintaining a listening watch; relay urgent requests to Earth HQ.';
    case 'surrender':
      if(ship.surrendered)return 'We have already surrendered. Weapons remain secured.';
      if(!weak)return 'Surrender demand rejected. We will not stand down.';
      surrenderShip(combat,recipient.contactId,'Surrender demand accepted','own',true);
      return 'We surrender. Weapons secured; offensive fire ceased. Our existing velocity is unchanged. Awaiting instructions. Weapons already in flight cannot be recalled.';
    case 'cease':
      if(hostile&&!weak)return 'Cease-fire request rejected.';
      ceaseEngagement(combat,recipient.contactId);return 'Cease-fire acknowledged. Offensive firing orders between our ships are stopped. Weapons already in flight cannot be recalled.';
    case 'accept':return station?`Acknowledged. Proceed to ${recipient.name} for dockside assistance; Engineering handles docking and service.`:'Acknowledged. Keep this channel open. We can relay advice; no assistance craft or transfer team is currently available.';
    case 'decline':return 'Understood. Assistance declined. Contact us again if your situation changes.';
    case 'acknowledge':return 'Acknowledged. Standing by on this channel.';
    default:return 'Message received and logged. Use a specific request to obtain orders, assistance, or service instructions.';
  }
}
export function sendCommunication(state,context,recipientId,request,detail=''){
  const recipient=communicationsRecipients(state,context).find(r=>r.id===recipientId),error=communicationLink(context,recipient);
  if(error)return {ok:false,message:error};
  if(!communicationRequests(recipient).some(r=>r.id===request)||typeof detail!=='string'||detail.length>500||request==='message'&&!detail.trim())return {ok:false,message:'Choose a request and enter a message for Other message.'};
  const subject=requestLabels[request],hull=percent(context.combat.own.systems.hull);
  const body=`${subject}. ${playerShipName(context.combat)} at ${context.sector.location}; hull ${hull}%.${detail.trim()?` ${detail.trim()}`:''}`;
  let support;
  if(request==='support'){
    const result=context.inTransit?{ok:false,message:'Disengage EPD before requesting a local support rendezvous.'}:requestSupportShip(context.combat,context.sector);
    support={accepted:result.ok,message:result.message};
  }
  if(['attack-targets','battle-assistance','stand-down'].includes(request)){
    const visibleEnemies=context.contacts.filter(c=>!c.stale&&c.type==='enemy'&&Math.hypot(c.x,c.y,c.z)<=context.range).map(c=>c.id);
    const threats=[...context.combat.hostiles,...context.combat.shots.filter(shot=>shot.targetId==='own').map(shot=>shot.sourceId)];
    const targets=request==='attack-targets'?(context.lockedTargetIds||[]).filter(id=>visibleEnemies.includes(id)):visibleEnemies.filter(id=>!threats.length||threats.includes(id));
    support=orderAlliedSupport(context.combat,context.sector,recipient.contactId,request,targets);
    if(support.accepted&&request!=='stand-down')context.sector.running=true;
  }
  addMessage(state,recipient,'sent',subject,body,context);
  const requestingMission=recipient.id==='hq'&&request==='orders'&&context.missionStations;
  const returnPending=state.returningToEarth&&(context.inTransit||context.sector.location!=='Earth');
  const response=requestingMission?(state.mission?'An assignment is already open. Review its message in Comms.':returnPending?EARTH_ORDERS:'Stand by for an assignment.'):(support?.message??respond(recipient,request,context));
  addMessage(state,recipient,'received',`Re: ${subject}`,response,context);
  if(requestingMission&&!state.mission&&!returnPending){
    state.returningToEarth=false;
    state.nextMissionAt=stamp(context);
    pollPatrolMission(state,context,context.missionStations);
  }
  return {ok:true,message:`Reply received from ${recipient.name}.`,response,...(support?{accepted:support.accepted}:{})};
}
export function pollCommunications(state,context){
  if(communicationLink(context,{available:true}))return false;
  let changed=false;
  for(const notice of context.combat.boarding?.reports??[]){
    if(notice.reported)continue;
    const contactChannelId=notice.targetId?`ship:${state.encounter}:${notice.targetId}`:undefined;
    addMessage(state,communicationChannels.find(channel=>channel.id==='shuttles'),'received',notice.subject,notice.body,context,contactChannelId);notice.reported=true;changed=true;
  }
  for(const [id,ship] of Object.entries(context.combat.contacts))for(const notice of ship.combatResponse?.notices??[]){
    if(notice.reported)continue;
    if(ship.surrendered&&notice.type!=='surrender'){notice.reported=true;changed=true;continue;}
    const live=context.contacts.find(contact=>contact.id===id&&!contact.stale),remembered=context.sector.memory[id]?.observed;
    if(notice.type!=='contact-lost'&&!live)continue;
    if(!live&&!remembered)continue;
    const observed=live??remembered,recipient={id:`ship:${state.encounter}:${id}`,name:`${observed.trackLabel} · ${observed.name}`,kind:'ship'};
    const reason=observed.identified||notice.type==='surrender'?ship.combatResponse.reason:'The ship is abandoning its attack';
    const subject=notice.type==='surrender'?'Surrender offered':notice.type==='retreat'?'Sensor watch · Enemy disengaging':'Sensor watch · Contact lost';
    const body=notice.type==='surrender'?(ship.systems.communications.hp>0?`${recipient.name}: We surrender. ${reason}. Weapons and emitters secured. Do not fire. Weapons already in flight cannot be recalled.`:`Sensor watch: ${recipient.name} has ceased resistance and secured its weapons. Its communications array is offline; no surrender transmission received.`):notice.type==='retreat'?`Sensor watch: ${recipient.name} is disengaging and accelerating away. ${reason}. Offensive fire has ceased; defensive systems remain available.`:`Sensor watch: retreating ${recipient.name} has left sensor coverage. Last-known position retained. Escape is not confirmed; reacquisition remains possible.`;
    addMessage(state,recipient,'received',subject,body,context);notice.reported=true;changed=true;
    if(notice.type==='contact-lost')for(const earlier of ship.combatResponse.notices)if(earlier.type==='retreat')earlier.reported=true;
  }
  for(const recipient of communicationsRecipients(state,context).filter(r=>r.kind==='ship'&&r.available)){
    const ship=context.combat.contacts[recipient.contactId];
    if(state.alerts.includes(recipient.id)||ship.surrendered||ship.systems.communications.hp<=0||!ship.fire&&!ship.breach&&percent(ship.systems.hull)>=40)continue;
    addMessage(state,recipient,'received','Distress call',`${recipient.name} to ${playerShipName(context.combat)}: we are damaged and require assistance. Please acknowledge or offer assistance.`,context);
    state.alerts.push(recipient.id);state.alerts=state.alerts.slice(-100);changed=true;
  }
  return changed;
}
export function markChannelRead(state,id){let changed=false;for(const m of state.messages)if(m.channelId===id&&!m.read){m.read=true;changed=true;}return changed;}
