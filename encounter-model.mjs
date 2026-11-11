import { miningStations } from './mining.mjs';
import {shipNameOptions,pirateShipNames,legacyFrigateNames} from './ship-names.mjs';
import {at,distance,nearSol} from './navigation.mjs';

export const ENCOUNTER_VERSION = 6;
export const ENCOUNTER_VERSIONS = [1,2,3,4,5,6];
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

export const missionBriefings={
  'station-attack':{title:'Station under attack',objective:'Drive off the raiders and protect the station’s evacuation transport.'},
  'cargo-attack':{title:'Cargo ship under attack',objective:'Drive off the raiders before they destroy the freighter.'},
  patrol:{title:'Sector patrol orders',objective:'Sweep the sector with radar operating, investigate unusual contacts, and watch Comms for further orders.'},
  search:{title:'Missing freighter',objective:'Locate the disabled freighter and approach within 10 km with radar operating to confirm its position.'}
};
const patrolFindings={
  distress:'A disabled ship is broadcasting a distress signal. Approach within 10 km with radar operating to confirm its position.',
  raiders:'Intermittent targeting emissions detected. Investigate and drive off any hostile ships.'
};
export function updateLegacyPatrolBriefing(text){
  return text.replace('Spend 60 seconds in the sector and sweep with radar operating at least 5 km from the arrival point.',missionBriefings.patrol.objective);
}

export function generatePatrolMission(id,position,stations,random=Math.random){
  const available=stations.filter(site=>distance(position,site)>.001).sort((a,b)=>distance(position,a)-distance(position,b));
  const reachable=available.filter(site=>!nearSol(position,site));
  const candidates=(reachable.length?reachable:available).slice(0,6);
  const kinds=Object.keys(missionBriefings).filter(kind=>kind!=='station-attack'||candidates.length);
  const kind=kinds[Math.floor(random()*kinds.length)],seed=Math.floor(random()*0x100000000);
  if(kind==='station-attack'){
    const {id:siteId,name,x,y}=candidates[Math.floor(random()*candidates.length)];
    return {id,kind,seed,arrived:false,destination:{siteId,name,x,y}};
  }
  const name={ 'cargo-attack':'Cargo distress sector',patrol:'Assigned patrol sector',search:'Freighter search sector' }[kind];
  const bearing=Math.atan2(position.y,position.x)*180/Math.PI;
  const fix=at(2.4+random()*3,bearing+(random()-.5)*150);
  return {id,kind,seed,arrived:false,destination:{name,...fix}};
}

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
export function generateEncounter(location,seed=Math.floor(Math.random()*4294967296),version=ENCOUNTER_VERSION,missionKind){
  if(!ENCOUNTER_VERSIONS.includes(version))throw new Error('Unsupported encounter version.');
  if(typeof location!=='string'||!location.length||location.length>120||!Number.isInteger(seed)||seed<0||seed>0xFFFFFFFF)throw new Error('Invalid encounter destination or seed.');
  if(missionKind!==undefined&&(version<5||!Object.hasOwn(missionBriefings,missionKind)||/^(Earth|Moon station)$/i.test(location)))throw new Error('Invalid mission encounter.');
  const random=randomStream(location,seed),pick=items=>items[Math.floor(random()*items.length)],count=(min,max)=>min+Math.floor(random()*(max-min+1));
  const region=encounterRegion(location),scenarios={inner:['traffic','traffic','convoy','patrol','distress','raiders'],belt:['traffic','convoy','distress','distress','raiders','raiders','patrol'],outer:['quiet','traffic','patrol','distress','raiders'],boundary:['quiet','patrol','patrol','distress','raiders'],deep:['quiet','quiet','distress','raiders','patrol']};
  const options=scenarios[region];
  let event=missionKind??pick(version>=5&&location.toLowerCase()==='earth'?options.filter(scenario=>scenario!=='raiders'):options);
  if(missionKind==='patrol'&&version>=6){
    const roll=random();
    if(roll<.125)event='distress';
    else if(roll<.25)event='raiders';
  }
  const contacts=[],tag=seed.toString(36).toUpperCase();
  function add(type,shipType){
    const index=contacts.length+1,id=`${type==='friendly'?'F':type==='enemy'?'E':'N'}-${tag}-${String(index).padStart(2,'0')}`;
    const radius=index===1?count(18,42):count(45,190),azimuth=random()*Math.PI*2,z=(random()-.5)*radius*.7,plane=Math.sqrt(radius*radius-z*z);
    const suffix=count(10,99),prefix=type==='friendly'?'SDF ':'';
    const choices=version>=3&&type==='enemy'?pirateShipNames:version>=2&&type==='friendly'?(version<4&&shipType==='sdf-frigate'?legacyFrigateNames:shipNameOptions(shipType)):null;
    let name=choices?pick(choices):`${prefix}${pick(names[type])} ${suffix}`;
    if(choices&&contacts.some(contact=>contact.name===name))name=choices.find(candidate=>!contacts.some(contact=>contact.name===candidate))??name;
    contacts.push({id,type,shipType,name,registry:`${type==='friendly'?'SDF':type==='enemy'?'PIR':'CIV'}-${tag}-${index}`,iffRoll:random(),x:Math.cos(azimuth)*plane,y:Math.sin(azimuth)*plane,z,vx:count(-1600,1600),vy:count(-1600,1600),vz:count(-400,400)});
  }
  const addMany=(type,classes,min,max)=>{const total=count(min,max);for(let i=0;i<total;i++)add(type,pick(classes));};
  if(event==='traffic'){addMany('neutral',civilians,2,5);addMany('friendly',sdf,0,2);}
  if(event==='convoy'){addMany('neutral',civilians.slice(0,4),3,6);addMany('friendly',sdf,1,2);}
  if(event==='patrol'){addMany('friendly',sdf,2,4);addMany('neutral',civilians,0,2);}
  if(event==='distress'){add('neutral',pick(civilians.slice(0,4)));addMany('neutral',civilians,0,2);addMany('friendly',sdf,0,1);}
  if(event==='raiders'){addMany('enemy',pirates,1,3);addMany('neutral',civilians,1,3);addMany('friendly',sdf,0,1);}
  if(event==='quiet')addMany('neutral',civilians,0,2);
  const attack=event==='station-attack'||event==='cargo-attack';
  if(attack){
    add('neutral',event==='station-attack'?'une-transport':'une-cargo');
    add('enemy',pick(pirates));
    if(event==='station-attack')add('enemy','pirate-corvette');
    contacts.forEach((contact,index)=>Object.assign(contact,{x:index*8,y:24-index*4,z:0,vx:0,vy:250,vz:0,iffRoll:.1}));
    if(event==='station-attack'){
      add('friendly','sdf-frigate');
      Object.assign(contacts.at(-1),{x:-12,y:14,z:0,vx:0,vy:250,vz:0,iffRoll:.1});
    }
  }
  if(event==='search'){
    add('neutral','une-light-cargo');
    Object.assign(contacts[0],{iffRoll:.1});
    addMany('neutral',civilians,1,2);
  }
  const briefing=missionKind&&missionBriefings[missionKind];
  const finding=missionKind==='patrol'&&patrolFindings[event];
  const [title,summary]=finding?[reports[event][0],finding]:briefing?[briefing.title,briefing.objective]:reports[event];
  const distressId=event==='distress'||event==='search'?contacts[0].id:null;
  const hostileIds=contacts.filter(contact=>contact.type==='enemy').map(contact=>contact.id);
  return {version,seed,region,event,title,summary,contacts,distressId,hostileIds,
    ...(missionKind?{missionKind}:{}),...(attack?{attackTargetId:contacts[0].id}:{})};
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
