import { miningStations } from './mining.mjs';

export const ENCOUNTER_VERSION = 1;
export const MAX_ENCOUNTER_CONTACTS = 12;
const civilians=['une-cargo','une-light-cargo','une-transport','une-large-transport','private-yacht','privateer'];
const sdf=['sdf-frigate','sdf-destroyer','sdf-cruiser','sdf-heavy-cruiser'];
const pirates=['pirate-corvette','pirate-frigate'];
const names={neutral:['Meridian','Copper Finch','Far Horizon','New Dawn','Prospector','Pioneer','Sol Trader','Daybreak'],friendly:['Resolute','Sentinel','Vigilant','Endeavour','Bastion','Dauntless','Guardian','Valiant'],enemy:['Red Talon','Razor Wraith','Black Wake','Night Viper','Iron Fang','Ash Reaver']};
const reports={
  traffic:['Local traffic','Commercial traffic is crossing this sector.'],
  convoy:['Cargo convoy','A group of civilian transports is passing through the area.'],
  patrol:['SDF patrol','SDF vessels are conducting a local patrol.'],
  distress:['Distress signal','An emergency beacon reports a civilian vessel with damaged engines.'],
  raiders:['Unidentified traffic','Intermittent targeting emissions detected. Maintain a careful watch.'],
  quiet:['Quiet sector','Sparse traffic. Continue the sensor watch.']
};

export function encounterRegion(location){
  if(miningStations.some(station=>station.name===location))return 'belt';
  if(/heliopause/i.test(location))return 'boundary';
  if(/^(Mercury|Venus|Earth|Mars|Moon|Phobos)\b/i.test(location))return 'inner';
  if(/^(Jupiter|Saturn|Uranus|Neptune|Ganymede|Titan|Titania|Triton)\b/i.test(location))return 'outer';
  return 'deep';
}
function randomStream(location,seed){
  let state=seed>>>0;
  for(const letter of location)state=Math.imul(state^letter.charCodeAt(0),16777619)>>>0;
  return ()=>{state=(state+0x6D2B79F5)>>>0;let value=state;value=Math.imul(value^(value>>>15),value|1);value^=value+Math.imul(value^(value>>>7),value|61);return ((value^(value>>>14))>>>0)/4294967296;};
}

// The seed and destination reproduce identities; saved positions and damage may evolve.
export function generateEncounter(location,seed=Math.floor(Math.random()*4294967296)){
  if(typeof location!=='string'||!location.length||location.length>120||!Number.isInteger(seed)||seed<0||seed>0xFFFFFFFF)throw new Error('Invalid encounter destination or seed.');
  const random=randomStream(location,seed),pick=items=>items[Math.floor(random()*items.length)],count=(min,max)=>min+Math.floor(random()*(max-min+1));
  const region=encounterRegion(location),scenarios={inner:['traffic','traffic','convoy','patrol','distress','raiders'],belt:['traffic','convoy','distress','distress','raiders','raiders','patrol'],outer:['quiet','traffic','patrol','distress','raiders'],boundary:['quiet','patrol','patrol','distress','raiders'],deep:['quiet','quiet','distress','raiders','patrol']};
  const event=pick(scenarios[region]),contacts=[],tag=seed.toString(36).toUpperCase();
  function add(type,shipType){
    const index=contacts.length+1,id=`${type==='friendly'?'F':type==='enemy'?'E':'N'}-${tag}-${String(index).padStart(2,'0')}`;
    const radius=index===1?count(18,42):count(45,190),azimuth=random()*Math.PI*2,z=(random()-.5)*radius*.7,plane=Math.sqrt(radius*radius-z*z);
    const suffix=count(10,99),prefix=type==='friendly'?'SDF ':'';
    contacts.push({id,type,shipType,name:`${prefix}${pick(names[type])} ${suffix}`,registry:`${type==='friendly'?'SDF':type==='enemy'?'PIR':'CIV'}-${tag}-${index}`,iffRoll:random(),x:Math.cos(azimuth)*plane,y:Math.sin(azimuth)*plane,z,vx:count(-1600,1600),vy:count(-1600,1600),vz:count(-400,400)});
  }
  const addMany=(type,classes,min,max)=>{const total=count(min,max);for(let i=0;i<total;i++)add(type,pick(classes));};
  if(event==='traffic'){addMany('neutral',civilians,2,5);addMany('friendly',sdf,0,2);}
  if(event==='convoy'){addMany('neutral',civilians.slice(0,4),3,6);addMany('friendly',sdf,1,2);}
  if(event==='patrol'){addMany('friendly',sdf,2,4);addMany('neutral',civilians,0,2);}
  if(event==='distress'){add('neutral',pick(civilians.slice(0,4)));addMany('neutral',civilians,0,2);addMany('friendly',sdf,0,1);}
  if(event==='raiders'){addMany('enemy',pirates,1,3);addMany('neutral',civilians,1,3);addMany('friendly',sdf,0,1);}
  if(event==='quiet')addMany('neutral',civilians,0,2);
  const [title,summary]=reports[event];
  return {version:ENCOUNTER_VERSION,seed,region,event,title,summary,contacts,distressId:event==='distress'?contacts[0].id:null,hostileIds:event==='raiders'?contacts.filter(contact=>contact.type==='enemy').map(contact=>contact.id):[]};
}

// Apply an event once on arrival; loading a save restores its existing damage instead.
export function applyEncounterEvent(sector,combat){
  const event=sector.encounter;if(!event)return;
  if(event.distressId){
    const ship=combat.contacts[event.distressId],contact=sector.contacts.find(c=>c.id===event.distressId);
    ship.systems.hull.hp=Math.round(ship.systems.hull.max*.35);
    for(const [id,system] of Object.entries(ship.systems))if(id.startsWith('engine-'))system.hp=0;
    contact.vx=0;contact.vy=0;contact.vz=0;
  }
  combat.hostiles=[...event.hostileIds];
  combat.log.unshift(`${sector.location}: ${event.summary}`);combat.log=combat.log.slice(0,8);
}
