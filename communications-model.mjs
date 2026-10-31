import { settlementDefinitions } from './settlements.mjs';
import { miningStations } from './mining.mjs';
import { shipPerformance, ceaseFiring } from './combat-model.mjs';

export const MAX_MESSAGES=200;
export const communicationChannels=[
  {id:'hq',name:'Earth HQ · Sol Command',kind:'hq',description:'Secure command relay · Earth'},
  ...settlementDefinitions.map(s=>({id:s.id,name:s.name,kind:'station',description:s.type})),
  {id:'heliopause-station',name:'Heliopause station',kind:'station',description:'Outer patrol station'},
  ...miningStations.map(s=>({id:s.id,name:s.name,kind:'station',description:s.companyName}))
];
const requestLabels={hail:'Open channel',status:'Request status',report:'Send patrol / situation report',assistance:'Request assistance',offer:'Offer assistance',orders:'Request orders',docking:'Request docking instructions',repairs:'Request repairs',resupply:'Request resupply',escort:'Request escort',threat:'Report hostile contact',surrender:'Demand surrender',cease:'Request cease-fire',acknowledge:'Acknowledge',accept:'Accept assistance',decline:'Decline assistance',message:'Other message'};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=ok=>{if(!ok)throw new Error('Invalid communications data in save file.');};
const percent=s=>Math.round(s.hp/s.max*100);
const stamp=context=>Math.max(0,context.days??0)*86400;
export function createCommunications(){
  return {nextId:2,selectedId:'hq',filter:'all',encounter:0,alerts:[],messages:[{id:1,channelId:'hq',channelName:communicationChannels[0].name,kind:'hq',direction:'received',subject:'Patrol orders',body:'Wayfarer, Sol Command. Maintain the patrol watch, assist vessels in distress, and report hostile activity. Use this channel for situation reports and requests. Sol Command standing by.',time:0,location:'Earth',read:false}]};
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
    recipients.push({id:`ship:${state.encounter}:${c.id}`,name:`${c.trackLabel} · ${c.name}`,kind:'ship',contactId:c.id,available:true,hostile:c.type==='enemy'||context.combat.hostiles.includes(c.id),description:`${range.toFixed(1)} km · ${ship?.surrendered?'SURRENDERED':c.classification||'Unverified contact'}`});
  }
  for(const m of state.messages)if(!recipients.some(r=>r.id===m.channelId))recipients.push({id:m.channelId,name:m.channelName,kind:m.kind,available:false,description:'Channel history · no live tactical link'});
  return recipients;
}
export function communicationRequests(recipient){
  if(!recipient)return [];
  const ids=['hail','status','report','assistance'];
  if(recipient.kind==='hq')ids.push('orders','escort','threat');
  if(recipient.kind==='station')ids.push('offer','docking','repairs','resupply','escort','threat');
  if(recipient.kind==='ship'){ids.push('offer','escort','threat','cease');if(recipient.hostile)ids.push('surrender');}
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
  combat.hostiles=combat.hostiles.filter(target=>target!==id);
  ceaseFiring(combat,(combat.firing||[]).filter(order=>order.targetId===id).map(order=>order.mountId));
}
function respond(recipient,request,context){
  const {combat,sector}=context,ship=recipient.kind==='ship'?combat.contacts[recipient.contactId]:null;
  const weak=ship&&(ship.systems.hull.hp/ship.systems.hull.max<=.4||ship.mounts.every(m=>ship.systems[m.id].hp===0));
  const station=recipient.kind==='station',hq=recipient.kind==='hq',hostile=recipient.hostile&&!ship?.surrendered;
  switch(request){
    case 'hail':return ship?.surrendered?'We have surrendered. Our weapons remain secured.':hostile?'Channel open. State your business, Wayfarer.':`Wayfarer, ${recipient.name} receiving. Go ahead.`;
    case 'status':return ship?`Hull integrity ${percent(ship.systems.hull)}%. ${ship.surrendered?'We have surrendered.':ship.fire||ship.breach?'Damage-control assistance requested.':'Crew standing by.'}`:hq?'Patrol watch active. Report hostile activity and assistance requests on this channel.':`Traffic control online at ${recipient.name}. ${recipient.id.startsWith('mine-')?'Basic repairs, limited spare parts, and gun ammunition available.':'Station repairs and replenishment available.'}`;
    case 'report':return 'Situation report received and logged. Maintain the watch and report any material change.';
    case 'orders':return 'Continue your patrol, investigate unidentified traffic, offer aid to distressed vessels, and report hostile activity. Use Navigation to plot your course.';
    case 'assistance':return hostile?'Your request for assistance is refused.':hq?'Distress report received. No reinforcement unit is currently assigned. Proceed to a repair station if able; retain this channel for further reports.':station?`We can provide dockside assistance at ${recipient.name}. Travel here, then contact Engineering for docking and service. No rescue craft is available for dispatch.`:'We can provide damage-control advice over comms. No rescue or repair team is available for transfer; seek station services if able.';
    case 'offer':return hostile?'We do not accept your assistance.':ship&&(ship.fire||ship.breach||percent(ship.systems.hull)<70)?'Assistance accepted. Please relay our distress to Earth HQ and direct us to station services.':'Thank you, Wayfarer. No immediate assistance is required; remain available on this channel.';
    case 'escort':return hostile?'Escort request refused.':hq?'Escort request logged. No escort unit is currently available for assignment.':station?'No escort craft available. Maintain a safe course and report threats to Earth HQ.':'Unable to change course for escort duty. We will keep a listening watch.';
    case 'docking':return sector.location===recipient.name?'Approach within 5 km of the arrival point, reduce speed below 10 KPH, and clear incoming threats. Request docking through Engineering.':`Proceed to ${recipient.name}. On arrival, hold within 5 km below 10 KPH and request docking through Engineering.`;
    case 'repairs':case 'resupply':return `${recipient.id.startsWith('mine-')?'Basic repairs, partial spare-parts replenishment, and gun ammunition':'Full repairs, destroyed-system replacement, spare parts, and ammunition'} available after docking at ${recipient.name}. Request station service in Engineering.`;
    case 'threat':return hostile?'We reject your accusation.':hq?'Hostile contact report received. Maintain sensor contact and send updates. No reinforcements are currently assigned.':'Threat report received. Maintaining a listening watch; relay urgent requests to Earth HQ.';
    case 'surrender':
      if(ship.surrendered)return 'We have already surrendered. Weapons remain secured.';
      if(!weak)return 'Surrender demand rejected. We will not stand down.';
      ship.surrendered=true;ship.radar=false;ship.jammer=false;ship.ciwsAuto=false;ceaseEngagement(combat,recipient.contactId);
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
  const body=`${subject}. Wayfarer at ${context.sector.location}; hull ${hull}%.${detail.trim()?` ${detail.trim()}`:''}`;
  addMessage(state,recipient,'sent',subject,body,context);
  addMessage(state,recipient,'received',`Re: ${subject}`,respond(recipient,request,context),context);
  return {ok:true,message:`Reply received from ${recipient.name}.`};
}
export function pollCommunications(state,context){
  if(communicationLink(context,{available:true}))return false;
  let changed=false;
  for(const recipient of communicationsRecipients(state,context).filter(r=>r.kind==='ship'&&r.available)){
    const ship=context.combat.contacts[recipient.contactId];
    if(state.alerts.includes(recipient.id)||ship.surrendered||ship.systems.communications.hp<=0||!ship.fire&&!ship.breach&&percent(ship.systems.hull)>=40)continue;
    addMessage(state,recipient,'received','Distress call',`${recipient.name} to Wayfarer: we are damaged and require assistance. Please acknowledge or offer assistance.`,context);
    state.alerts.push(recipient.id);state.alerts=state.alerts.slice(-100);changed=true;
  }
  return changed;
}
export function markChannelRead(state,id){let changed=false;for(const m of state.messages)if(m.channelId===id&&!m.read){m.read=true;changed=true;}return changed;}
