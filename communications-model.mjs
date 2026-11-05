import { settlementDefinitions } from './settlements.mjs';
import { miningStations } from './mining.mjs';
import { shipPerformance, standDownAgainst, surrenderShip, orderAlliedSupport, requestSupportShip, supportStatus } from './combat-model.mjs';
import {playerShipName,defaultShipName} from './ship-names.mjs';

export const MAX_MESSAGES=200;
export const communicationChannels=[
  {id:'hq',name:'Earth HQ · Sol Command',kind:'hq',description:'Secure command relay · Earth'},
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
  return {nextId:2,selectedId:'hq',filter:'all',encounter:0,alerts:[],messages:[{id:1,channelId:'hq',channelName:communicationChannels[0].name,kind:'hq',direction:'received',subject:'Patrol orders',body:`${shipName}, Sol Command. Maintain the patrol watch, assist vessels in distress, and report hostile activity. Use this channel for situation reports and requests. Sol Command standing by.`,time:0,location:'Earth',read:false}]};
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
    return {id:m.id,channelId:m.channelId,channelName:m.channelName,kind:m.kind,direction:m.direction,subject:m.subject,body:m.body,time:m.time,location:m.location,read:m.read};
  });
  const alerts=saved.alerts.map(id=>{check(typeof id==='string'&&/^ship:\d+:[\w-]+$/.test(id));return id;});
  check(new Set(alerts).size===alerts.length);
  return {nextId:saved.nextId,selectedId:saved.selectedId,filter:saved.filter,encounter:saved.encounter,alerts,messages};
}
export function unreadCommunications(state){return state.messages.filter(m=>m.direction==='received'&&!m.read).length;}
function addMessage(state,recipient,direction,subject,body,context){
  state.messages.push({id:state.nextId++,channelId:recipient.id,channelName:recipient.name,kind:recipient.kind,direction,subject,body,time:stamp(context),location:context.sector.location,read:direction==='sent'});
  if(state.messages.length>MAX_MESSAGES)state.messages.splice(0,state.messages.length-MAX_MESSAGES);
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
  const response=support?.message??respond(recipient,request,context);
  addMessage(state,recipient,'received',`Re: ${subject}`,response,context);
  return {ok:true,message:`Reply received from ${recipient.name}.`,response,...(support?{accepted:support.accepted}:{})};
}
export function pollCommunications(state,context){
  if(communicationLink(context,{available:true}))return false;
  let changed=false;
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
