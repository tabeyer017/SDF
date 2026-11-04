import { EDGE_AU } from './navigation.mjs';
import { restoreBridgeState } from './bridge-model.mjs';
import { createSector } from './sector-model.mjs';
import { trainingContacts, observeContact, restoreTargetPriorities } from './tactical-model.mjs';
import { createCombat,stationSupport } from './combat-model.mjs';
import { restoreCombat } from './combat-save.mjs';
import { restoreCommunications } from './communications-model.mjs';

export const SAVE_STORAGE_KEY = 'sdf-save-v2';
export const LEGACY_SAVE_STORAGE_KEY = 'sdf-save-v1';
export const MAX_SAVE_BYTES = 1024 * 1024;
const axes=['x','y','z'],speeds=['vx','vy','vz'];
const record=value=>value!==null && typeof value==='object' && !Array.isArray(value);
function requireValue(condition,message){if(!condition)throw new Error(message);}
function string(value,label,max=160){requireValue(typeof value==='string' && value.length<=max,`Invalid ${label}.`);return value;}
function number(value,label,min=-1e12,max=1e12){requireValue(Number.isFinite(value) && value>=min && value<=max,`Invalid ${label}.`);return value;}
function boolean(value,label){requireValue(typeof value==='boolean',`Invalid ${label}.`);return value;}
function choice(value,options,label){requireValue(options.includes(value),`Invalid ${label}.`);return value;}
function vector(value,label,keys=axes,limit=1e12){requireValue(record(value),`Missing ${label}.`);return Object.fromEntries(keys.map(k=>[k,number(value[k],label,-limit,limit)]));}
function list(value,max,label){requireValue(Array.isArray(value) && value.length<=max,`Invalid ${label}.`);return value;}
function point(value){
  requireValue(record(value),'Invalid strategic waypoint.');
  const position=vector(value,'strategic position',['x','y']);
  requireValue(Math.hypot(position.x,position.y)<=EDGE_AU+.01,'Strategic position is outside the patrol boundary.');
  const result={...position,name:string(value.name,'waypoint name',120)};
  for(const key of ['id','type','description'])if(value[key]!==undefined)result[key]=string(value[key],key,key==='description'?2000:160);
  if(value.color!==undefined){requireValue(/^#[\da-f]{6}$/i.test(value.color),'Invalid waypoint color.');result.color=value.color;}
  return result;
}
function navigation(value,pause){
  requireValue(record(value),'Missing strategic navigation.');
  const ship=vector(value.ship,'ship position',['x','y']);
  requireValue(Math.hypot(ship.x,ship.y)<=EDGE_AU+.01,'Ship is outside the patrol boundary.');
  const route=list(value.route,12,'strategic route').map(point),active=boolean(value.active,'EPD state');
  const paused=boolean(value.paused,'EPD pause state');
  requireValue(!active||route.length>0,'An active EPD journey needs a route.');
  return {ship,location:string(value.location,'location',120),route,active,
    paused:pause?active:paused,days:number(value.days,'game time',0,365000),speed:choice(value.speed,[1,10,100],'EPD speed')};
}
function localSector(value,location,pause){
  requireValue(record(value) && value.location===location,'Local sector does not match the strategic location.');
  const result=createSector([],location);
  result.time=number(value.time,'local time',0);
  const running=boolean(value.running,'local simulation state');result.running=pause?false:running;
  result.rate=choice(value.rate,[1,10,60],'local simulation speed');
  result.own={...vector(value.own,'local ship position'),...vector(value.own,'local ship velocity',speeds,7200)};
  requireValue(Math.hypot(...speeds.map(k=>result.own[k]))<=7200.001,'Ship velocity exceeds the Vector Drive limit.');
  result.facing=vector(value.facing,'bow direction',axes,1);
  requireValue(Math.abs(Math.hypot(...axes.map(k=>result.facing[k]))-1)<.001,'Bow direction must be a unit vector.');
  result.faceTarget=boolean(value.faceTarget,'bow tracking');
  requireValue(record(value.manual),'Missing manual Helm settings.');
  result.manual={thrust:number(value.manual.thrust,'thrust',-100,100),bearing:number(value.manual.bearing,'thrust bearing',0,360),elevation:number(value.manual.elevation,'thrust elevation',-90,90)};
  const contacts=list(value.contacts,trainingContacts.length,'sector contacts');
  requireValue(contacts.length===trainingContacts.length,'The save has an incomplete training sector.');
  const ids=new Set();
  result.contacts=contacts.map(c=>{
    requireValue(record(c),'Invalid contact.');const original=trainingContacts.find(t=>t.id===c.id);
    requireValue(original && !ids.has(c.id),'Unknown or duplicate sector contact.');ids.add(c.id);
    return {...original,...vector(c,'contact position'),...vector(c,'contact velocity',speeds,1000000)};
  });
  result.route=list(value.route,8,'local patrol route').map(p=>({...vector(p,'local waypoint',axes,100000),name:string(p.name,'local waypoint name',120)}));
  if(value.order!==null){
    requireValue(record(value.order),'Invalid flight order.');
    const mode=choice(value.order.mode,['intercept','match','maintain','open','break','patrol','manual','brake'],'flight order');result.order={mode};
    if(['intercept','match','maintain','open','break'].includes(mode)){
      requireValue(ids.has(value.order.targetId),'Flight order references an unknown contact.');
      result.order.targetId=value.order.targetId;result.order.range=number(value.order.range,'maneuver range',5,200);
    }
    requireValue(mode!=='patrol'||result.route.length>0,'A patrol order needs waypoints.');
  }
  result.status=string(value.status,'flight status',300);result.safety=string(value.safety,'navigation safety',300);
  requireValue(record(value.memory) && Object.keys(value.memory).length<=contacts.length,'Invalid sensor memory.');
  for(const [id,m] of Object.entries(value.memory)){
    requireValue(ids.has(id) && record(m) && record(m.observed),'Invalid remembered contact.');
    const position=vector(m.position,'last known position'),velocity=vector(m.velocity,'last known velocity',axes,1000000);
    const relative={...vector(m.observed,'observed position'),...vector(m.observed,'observed velocity',speeds,1000000)};
    const identified=boolean(m.observed.identified,'remembered identity'),contact=result.contacts.find(c=>c.id===id);
    // Rebuild catalog details from trusted game data; never load images or ship fits from a file.
    const observed=observeContact({...contact,x:0,y:0,z:0,iffRoll:identified?0:1});
    result.memory[id]={position,velocity,seen:number(m.seen,'sensor observation time',0,result.time),observed:{...observed,...relative,iffStatus:identified?'Previously verified IFF':'No verified IFF return'}};
  }
  return result;
}
function validateSave(value,pause){
  requireValue(record(value) && value.format==='sdf-save','This is not an SDF JSON save file.');
  requireValue([1,2].includes(value.version),'Unsupported save version. This game supports versions 1 and 2.');
  const savedAt=string(value.savedAt,'save timestamp',40);requireValue(Number.isFinite(Date.parse(savedAt)),'Invalid save timestamp.');
  const nav=navigation(value.navigation,pause);
  requireValue(record(value.bridge) && record(value.bridge.settings),'Missing bridge state.');
  // While EPD crosses intermediate waypoints, local flight stays suspended at
  // the departure sector until final arrival initializes the destination sector.
  const sectorLocation=nav.active?string(value.bridge.sector?.location,'local sector location',120):nav.location;
  const sector=localSector(value.bridge.sector,sectorLocation,pause);
  const combat=value.version===1?createCombat(sector.contacts):restoreCombat(value.bridge.combat,sector.contacts);
  requireValue(!combat.docked||(!nav.active&&!!stationSupport(nav.location)&&Math.hypot(sector.own.x,sector.own.y,sector.own.z)<=5&&Math.hypot(sector.own.vx,sector.own.vy,sector.own.vz)<=10),'Invalid docked state.');
  requireValue(!nav.active||(!combat.firing&&!combat.shots.length&&!combat.docked&&!Object.keys(combat.alliedOrders).length),'Combat cannot run during EPD transit.');
  requireValue(!nav.active||(!sector.running && !sector.order),'EPD transit cannot run alongside local flight orders.');
  const tactical=value.bridge.tactical;
  requireValue(record(tactical),'Missing tactical state.');
  const lockedIds=list(tactical.lockedIds,trainingContacts.length,'target locks').map(id=>{
    requireValue(sector.contacts.some(c=>c.id===id) && Object.hasOwn(sector.memory,id),'Target lock has no sensor record.');return id;
  });
  requireValue(new Set(lockedIds).size===lockedIds.length,'Duplicate target locks.');
  requireValue(tactical.activeId===null||lockedIds.includes(tactical.activeId),'Selected target is not locked.');
  const priorities=restoreTargetPriorities(lockedIds,tactical.priorities);
  const logs=list(value.logs,3,'command log').map(l=>({time:string(l.time,'log time',20),message:string(l.message,'log message',500)}));
  return {format:'sdf-save',version:2,savedAt,navigation:nav,
    bridge:{settings:restoreBridgeState(value.bridge.settings),sector,tactical:{lockedIds,activeId:tactical.activeId,priorities},combat,communications:restoreCommunications(value.bridge.communications)},
    selection:point(value.selection),logs};
}

export function createSave({navigation,bridge,selection,logs},savedAt=new Date().toISOString()){
  return validateSave({format:'sdf-save',version:2,savedAt,navigation,bridge:{...bridge,combat:bridge.combat??createCombat(bridge.sector.contacts)},selection,logs},false);
}
export function parseSave(text){
  requireValue(typeof text==='string' && new TextEncoder().encode(text).length<=MAX_SAVE_BYTES,'Save files must be 1 MB or smaller.');
  let value;try{value=JSON.parse(text);}catch{throw new Error('The file does not contain valid JSON.');}
  return validateSave(value,true);
}
