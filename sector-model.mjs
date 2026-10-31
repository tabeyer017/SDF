import { trainingContacts, observeContact, contactDistance, contactClosureRate } from './tactical-model.mjs';

export const SENSOR_RANGE = 200;
export const VECTOR_LIMIT = 7200; // Provisional Vector Drive performance, KPH.
export const VECTOR_ACCELERATION = 120; // KPH gained per simulated second.
export const maneuverNames = { intercept:'Intercept', match:'Match velocity', maintain:'Maintain range', open:'Open distance', break:'Break away', patrol:'Patrol route', manual:'Manual Helm', brake:'Braking to sector rest', coast:'Coasting' };
export const sectorHazards = [{ id:'debris', name:'Training debris field', x:50, y:60, z:0, radius:12 }];
const keys = ['x','y','z'], speeds = ['vx','vy','vz'];
const length = v => Math.hypot(v.x,v.y,v.z);
const subtract = (a,b) => Object.fromEntries(keys.map(k=>[k,a[k]-b[k]]));
const unit = v => { const n=length(v); return n ? Object.fromEntries(keys.map(k=>[k,v[k]/n])) : {x:0,y:1,z:0}; };
const velocity = v => ({x:v.vx,y:v.vy,z:v.vz});
const cross = (a,b) => ({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
const dot = (a,b) => keys.reduce((sum,k)=>sum+a[k]*b[k],0);
const limited = (v,max) => {const n=length(v);return n>max?Object.fromEntries(keys.map(k=>[k,v[k]*max/n])):v;};
const validPoint = p => p && keys.every(k=>Number.isFinite(p[k]) && Math.abs(p[k])<=100000);

export function createSector(contacts=trainingContacts, location='Earth') {
  return { location, time:0, running:false, rate:1, own:{x:0,y:0,z:0,vx:0,vy:0,vz:0}, facing:{x:0,y:1,z:0}, contacts:contacts.map(c=>({...c})), memory:{}, order:null, route:[], manual:{thrust:0,bearing:0,elevation:0}, status:'Vector Drive ready · local simulation paused', safety:'Clear', faceTarget:true };
}

// Sector coordinates stay fixed. Tactical coordinates follow the ship's bow.
export function relativeContact(sector, contact) {
  const forward=unit(sector.facing), reference=Math.abs(forward.z)>.99?{x:0,y:1,z:0}:{x:0,y:0,z:1};
  const right=unit(cross(forward,reference)), up=unit(cross(right,forward));
  const r=subtract(contact,sector.own), v=subtract(velocity(contact),velocity(sector.own));
  return {...contact,x:dot(r,right),y:dot(r,forward),z:dot(r,up),vx:dot(v,right),vy:dot(v,forward),vz:dot(v,up)};
}

export function observeSector(sector) {
  const live=[];
  for(const contact of sector.contacts) {
    const relative=relativeContact(sector,contact);
    if(contactDistance(relative)>(sector.sensorRange??SENSOR_RANGE)) continue;
    let observed=observeContact(relative);
    const previous=sector.memory[contact.id];
    if(!observed.identified && previous?.observed.identified) observed={...previous.observed,x:relative.x,y:relative.y,z:relative.z,vx:relative.vx,vy:relative.vy,vz:relative.vz,iffStatus:'Previously verified IFF'};
    sector.memory[contact.id]={observed,position:{x:contact.x,y:contact.y,z:contact.z},velocity:velocity(contact),seen:sector.time};
    live.push(observed);
  }
  return live;
}

export function issueManeuver(sector, mode, targetId, range=25) {
  if(!['intercept','match','maintain','open','break'].includes(mode) || !Number.isFinite(range) || range<5 || range>200) return false;
  const target=observeSector(sector).find(c=>c.id===targetId);
  if(!target) return false;
  sector.order={mode,targetId,range}; sector.running=true; sector.manual.thrust=0;sector.safety='Clear';
  sector.status=`${maneuverNames[mode]} · ${target.trackLabel} · Navigation calculating`;
  return true;
}

export function setManualHelm(sector, {thrust=0,bearing=0,elevation=0,bow=0}) {
  if(![thrust,bearing,elevation,bow].every(Number.isFinite) || Math.abs(thrust)>100 || bearing<0 || bearing>360 || bow<0 || bow>360 || Math.abs(elevation)>90) return false;
  sector.order={mode:'manual'};sector.manual={thrust,bearing,elevation}; sector.running=true;
  const angle=bow*Math.PI/180;sector.facing={x:Math.sin(angle),y:Math.cos(angle),z:0};
  sector.status='Manual Helm override · automatic maneuver cancelled'; return true;
}

export function coast(sector) { sector.order=null;sector.manual.thrust=0;sector.status='Coasting · current velocity retained';sector.safety='Coasting · no automatic guidance'; }
export function brake(sector) {sector.order={mode:'brake'};sector.manual.thrust=0;sector.running=true;sector.status='Braking to rest in sector frame';}
export function addPatrolWaypoint(sector,point) {
  if(!validPoint(point) || sector.route.length>=8) return false;
  sector.route.push({...point,name:`Patrol ${sector.route.length+1}`});return true;
}
export function startPatrol(sector) {
  if(!sector.route.length) return false;
  sector.order={mode:'patrol'};sector.running=true;sector.manual.thrust=0;sector.status='Patrol route · Navigation guiding Helm';return true;
}

export function segmentHitsHazard(start,end,hazard,margin=2) {
  const d=subtract(end,start), offset=subtract(hazard,start), size=dot(d,d);
  const t=size?Math.max(0,Math.min(1,dot(offset,d)/size)):0;
  return length(subtract(hazard,Object.fromEntries(keys.map(k=>[k,start[k]+d[k]*t]))))<=hazard.radius+margin;
}

function guidance(sector) {
  const order=sector.order, own=sector.own;
  if(!order || order.mode==='manual') return null;
  let desired;
  if(order.mode==='brake') {
    desired={x:0,y:0,z:0};sector.status=length(velocity(own))<1?'Holding zero velocity in sector frame':'Braking to rest in sector frame';
  } else if(order.mode==='patrol') {
    let waypoint=sector.route[0];
    if(!waypoint){coast(sector);return null;}
    if(length(subtract(waypoint,own))<.5 && length(velocity(own))<100) {
      sector.route.shift();waypoint=sector.route[0];
      if(!waypoint){sector.order=null;sector.own.vx=sector.own.vy=sector.own.vz=0;sector.status='Patrol route complete · velocity zero in sector frame';return null;}
    }
    const r=subtract(waypoint,own); desired=limited(Object.fromEntries(keys.map(k=>[k,r[k]*180])),VECTOR_LIMIT);
    sector.status=`Patrol route · ${waypoint.name} · Helm executing`;
  } else {
    const target=sector.contacts.find(c=>c.id===order.targetId);
    if(!target || length(subtract(target,own))>(sector.sensorRange??SENSOR_RANGE)){coast(sector);sector.status='Target lost beyond sensor coverage · maneuver cancelled · coasting';return null;}
    const r=subtract(target,own), direction=unit(r), distance=length(r);
    if(sector.faceTarget) sector.facing=direction;
    let correction=0;
    if(order.mode==='intercept') correction=(distance-5)*180;
    if(order.mode==='maintain') correction=(distance-order.range)*180;
    if(order.mode==='open') correction=Math.min(0,(distance-order.range)*180);
    if(order.mode==='break') correction=-VECTOR_LIMIT;
    desired=limited(Object.fromEntries(keys.map((k,i)=>[k,target[speeds[i]]+direction[k]*correction])),VECTOR_LIMIT);
    sector.status=`${maneuverNames[order.mode]} · TRK-${target.id.split('-').at(-1)} · Helm executing`;
  }
  // Check the stopping corridor as well as the commanded path; brake if either is obstructed.
  const speed=length(velocity(own)), horizon=speed/VECTOR_ACCELERATION+10;
  const end=Object.fromEntries(keys.map(k=>[k,own[k]+desired[k]*horizon/3600]));
  const stopping=Object.fromEntries(keys.map((k,i)=>[k,own[k]+own[speeds[i]]*horizon/3600]));
  const hazard=sectorHazards.find(h=>segmentHitsHazard(own,end,h)||segmentHitsHazard(own,stopping,h));
  sector.safety=hazard?`Blocked: ${hazard.name}`:'Clear';
  if(hazard){sector.status=`Navigation braking · ${hazard.name} · plot a waypoint around hazard`;return {x:0,y:0,z:0};}
  return desired;
}

export function stepSector(sector,seconds) {
  if(!sector.running || !Number.isFinite(seconds) || seconds<=0) return 0;
  let remaining=Math.min(seconds,120), advanced=0;
  while(remaining>1e-8) {
    const dt=Math.min(.25,remaining), desired=guidance(sector), own=sector.own;
    if(desired) {
      const delta=subtract(desired,velocity(own)), acceleration=limited(delta,VECTOR_ACCELERATION*dt*(sector.enginePerformance??1));
      keys.forEach((k,i)=>{own[speeds[i]]+=acceleration[k];});
    } else if(sector.order?.mode==='manual') {
      const {thrust,bearing,elevation}=sector.manual, a=bearing*Math.PI/180,e=elevation*Math.PI/180;
      const push={x:Math.sin(a)*Math.cos(e),y:Math.cos(a)*Math.cos(e),z:Math.sin(e)};
      const v=limited(Object.fromEntries(keys.map((k,i)=>[k,own[speeds[i]]+push[k]*thrust/100*VECTOR_ACCELERATION*dt*(sector.enginePerformance??1)])),VECTOR_LIMIT);
      keys.forEach((k,i)=>{own[speeds[i]]=v[k];});sector.safety='Manual control · hazard avoidance disengaged';
    }
    keys.forEach((k,i)=>{own[k]+=own[speeds[i]]*dt/3600;});
    for(const contact of sector.contacts)keys.forEach((k,i)=>{contact[k]+=contact[speeds[i]]*dt/3600;});
    sector.time+=dt;advanced+=dt;remaining-=dt;observeSector(sector);
  }
  return advanced;
}

export function maneuverTelemetry(sector) {
  const target=observeSector(sector).find(c=>c.id===sector.order?.targetId);
  return {mode:sector.order?.mode||'coast',speed:length(velocity(sector.own)),distance:target?contactDistance(target):null,closure:target?contactClosureRate(target):null,requestedRange:sector.order?.range??null,target:target?.trackLabel||'None'};
}

export function predictedPath(sector,seconds=60) {
  const copy=structuredClone(sector), path=[{...copy.own}];copy.running=true;
  for(let t=0;t<seconds;t+=5){stepSector(copy,Math.min(5,seconds-t));path.push({...copy.own});}
  return path;
}
