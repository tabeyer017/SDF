import {pirateShipNames,shipNameOptions} from './ship-names.mjs';

export const radarRanges = [10, 30, 60, 100, 140, 200];
export const IFF_RANGE_KM = 100;
export const IFF_IDENTIFICATION_CHANCE = .9;
export const crewDoctrine={
  maxAndroidFraction:.3,
  automation:'High automation keeps ship crews small.',
  androids:'Androids serve as crew, space marines, or raiders on SDF and pirate ships, handling routine and hazardous duties. They count within personnel totals and can be injured or destroyed. Their high cost limits androids to 30% of each crew or combat team.'
};
export const shuttleTypes={
  shuttle:{name:'Shuttle',troopCapacity:10,flightCrewIncluded:false},
  'assault-shuttle':{name:'Assault shuttle',troopCapacity:10,flightCrewIncluded:false}
};
export const boardingComplements={
  'sdf-corvette':{unit:'Space marines',platoons:1,personnel:40},
  'sdf-frigate':{unit:'Space marines',platoons:1,personnel:40},
  'sdf-destroyer':{unit:'Space marines',platoons:1,personnel:40},
  'sdf-cruiser':{unit:'Space marines',platoons:2,personnel:80},
  'sdf-heavy-cruiser':{unit:'Space marines',platoons:3,personnel:120},
  'pirate-frigate':{unit:'Raiders',personnel:40},
  'pirate-corvette':{unit:'Raiders',personnel:40}
};
export const shipFiveViews = {
  'une-cargo': 'images/une-cargo-ship-five-view.png',
  'une-light-cargo': 'images/une-light-cargo-ship-five-view.png',
  privateer: 'images/privateer-five-view.png',
  'private-yacht': 'images/private-yacht-five-view.png',
  'une-transport': 'images/une-transport-five-view.png',
  'une-large-transport': 'images/une-large-transport-five-view.png',
  'pirate-frigate': 'images/pirate-frigate-five-view.png',
  'pirate-corvette': 'images/pirate-corvette-five-view.png',
  'sdf-frigate': 'images/sdf-frigate-five-view.png',
  'sdf-destroyer': 'images/sdf-destroyer-five-view.png',
  'sdf-cruiser': 'images/sdf-cruiser-five-view.png',
  'sdf-heavy-cruiser': 'images/sdf-heavy-cruiser-five-view.png',
  'spf-logistics-tender': 'images/sdf-logistics-tender-five-view.png'
};
export const contactTypes = {
  unknown: { label: 'Unknown', color: '#f1cf62', shape: 'diamond' },
  neutral: { label: 'Neutral', color: '#a7afb9', shape: 'triangle' },
  friendly: { label: 'Friendly', color: '#74d79c', shape: 'circle' },
  enemy: { label: 'Enemy', color: '#f47779', shape: 'square' }
};

// Stable catalog IDs let future armament types be added without changing the ship UI.
export const armamentTypes = {
  'as-missiles': { name:'Anti-ship (AS) missiles', category:'Missiles' },
  'mp-missiles': { name:'Multi-purpose (MP) missiles', category:'Missiles' },
  'gp-missiles': { name:'General Purpose (GP) missiles', category:'Missiles' },
  'autocannon-120': { name:'120 mm Autocannon', category:'Autocannons' },
  'autocannon-75': { name:'75 mm Autocannon', category:'Autocannons' },
  'ciws-30': { name:'30 mm CIWS', category:'Close-in defense' },
  'rail-gun': { name:'Rail Gun', category:'Rail guns' }
};
export const countermeasureTypes = {
  chaff: { name:'Chaff dispensers', charges:{sdf:30,pirate:4} },
  flares: { name:'Flare dispensers', charges:{sdf:30,pirate:4} },
  'radar-jammer': { name:'Radar jammer' }
};
export function armamentLabel(ship,id) {
  const quantity=ship.fitting?.[id]?.quantity;
  return `${quantity===undefined?'':`${quantity} × `}${armamentTypes[id].name}`;
}

// Class fittings use the user's armament catalog. Confirmed fits include quantities
// and mounting details; other fits remain provisional. Combat balance is in combat-model.mjs.
export const shipTypes = {
  'une-cargo': { label: 'UNE - CARGO SHIP', faction: 'United Nations of Earth', role: 'Bulk freight carrier', engines: '2 × Atlas CF-80 fusion drives · EPD Mk II', loadout:['ciws-30'] },
  'une-light-cargo': { label: 'UNE - LIGHT CARGO SHIP', faction: 'United Nations of Earth', role: 'Light freight courier', engines: '1 × Kestrel CF-35 fusion drive · EPD Mk II', loadout:['ciws-30'] },
  privateer: { label: 'PRIVATEER', faction: 'Independent operator', role: 'Armed patrol / contract escort', engines: '2 × Raptor CF-60 fusion drives · EPD Mk III', loadout:['gp-missiles','autocannon-75','ciws-30'] },
  'private-yacht': { label: 'PRIVATE YACHT', faction: 'Private civilian registry', role: 'Personal interplanetary vessel', engines: '2 × Aurora CF-25 fusion drives · EPD Mk II', loadout:['ciws-30'] },
  'une-transport': { label: 'UNE - TRANSPORT', faction: 'United Nations of Earth', role: 'Passenger / personnel transport', engines: '2 × Meridian CF-55 fusion drives · EPD Mk II', loadout:['ciws-30'] },
  'une-large-transport': { label: 'UNE - LARGE TRANSPORT', faction: 'United Nations of Earth', role: 'Mass passenger / logistics transport', engines: '4 × Atlas CF-80 fusion drives · EPD Mk III', loadout:['ciws-30'] },
  'pirate-frigate': {
    label:'PIRATE - FRIGATE',faction:'Pirate raider group',role:'Armed raider / interdiction',engines:'2 × Reaver CF-70 fusion drives · modified EPD Mk III',
    loadout:['gp-missiles','autocannon-75','ciws-30'],fitConfirmed:true,
    fitting:{
      'autocannon-75':{quantity:4,turrets:2,gunsPerTurret:2,configuration:'2 turrets · 1 forward, 1 aft on top of the shuttle hangar · 2 autocannons per turret'},
      'gp-missiles':{quantity:40,location:'Ventral launch / bottom'},
      'ciws-30':{quantity:2,port:1,starboard:1,location:'Port and starboard · 1 per side'}
    },
    countermeasures:['chaff','flares','radar-jammer'],hangar:{bays:1,assaultShuttles:4}
  },
  'pirate-corvette': {
    label:'PIRATE - CORVETTE',faction:'Pirate raider group',role:'Fast attack / pursuit',engines:'2 × Reaver CF-40 fusion drives · modified EPD Mk II',
    loadout:['gp-missiles','autocannon-75','ciws-30'],fitConfirmed:true,
    fitting:{
      'autocannon-75':{quantity:2,turrets:1,gunsPerTurret:2,configuration:'1 forward turret · 2 autocannons'},
      'gp-missiles':{quantity:30,location:'Ventral launch / bottom'},
      'ciws-30':{quantity:2,port:1,starboard:1,location:'Port and starboard · 1 per side'}
    },
    countermeasures:['chaff','flares','radar-jammer'],hangar:{bays:1,assaultShuttles:4}
  },
  'sdf-frigate': {
    label:'SDF - FRIGATE',faction:'Sol Defense Force',role:'System patrol / escort',engines:'2 × Resolute CF-75 fusion drives · EPD Mk IV',
    loadout:['autocannon-120','mp-missiles','as-missiles','ciws-30'],fitConfirmed:true,
    fitting:{
      'autocannon-120':{quantity:2,turrets:2,gunsPerTurret:1,configuration:'2 turrets · 1 autocannon per turret'},
      'mp-missiles':{quantity:20,location:'Dorsal / top'},
      'as-missiles':{quantity:30,location:'Ventral / bottom'},
      'ciws-30':{quantity:2,port:1,starboard:1,location:'Port and starboard · 1 per side'}
    },
    countermeasures:['chaff','flares'],hangar:{bays:1,shuttles:2}
  },
  'sdf-destroyer': {
    label:'SDF - DESTROYER',faction:'Sol Defense Force',role:'Fleet screen / interception',engines:'2 × Resolute CF-90 fusion drives · EPD Mk IV',
    loadout:['autocannon-120','mp-missiles','as-missiles','ciws-30'],fitConfirmed:true,
    fitting:{
      'autocannon-120':{quantity:4,turrets:2,gunsPerTurret:2,configuration:'2 turrets · 2 autocannons per turret'},
      'mp-missiles':{quantity:24,location:'Dorsal / top'},
      'as-missiles':{quantity:40,location:'Ventral / bottom'},
      'ciws-30':{quantity:2,port:1,starboard:1,location:'Port and starboard · 1 per side'}
    },
    countermeasures:['chaff','flares'],hangar:{bays:1,shuttles:2}
  },
  'sdf-cruiser': {
    label:'SDF - CRUISER',faction:'Sol Defense Force',role:'Fleet command / sustained patrol',engines:'2 × Bastion CF-120 fusion drives · EPD Mk V',
    loadout:['autocannon-120','rail-gun','mp-missiles','as-missiles','ciws-30'],fitConfirmed:true,
    fitting:{
      'autocannon-120':{quantity:4,turrets:2,gunsPerTurret:2,configuration:'2 turrets · 2 autocannons per turret'},
      'rail-gun':{quantity:1,turrets:1,gunsPerTurret:1,configuration:'1 turret · 1 rail gun'},
      'mp-missiles':{quantity:28,location:'Dorsal / top'},
      'as-missiles':{quantity:50,location:'Ventral / bottom'},
      'ciws-30':{quantity:4,port:2,starboard:2,location:'Port and starboard · 2 per side'}
    },
    countermeasures:['chaff','flares'],hangar:{bays:1,shuttles:2}
  },
  'sdf-heavy-cruiser': {
    label:'SDF - HEAVY CRUISER',faction:'Sol Defense Force',role:'Heavy fleet support / area defense',engines:'3 × Bastion CF-140 fusion drives · EPD Mk V',
    loadout:['autocannon-120','rail-gun','mp-missiles','as-missiles','ciws-30'],fitConfirmed:true,
    fitting:{
      'autocannon-120':{quantity:4,turrets:2,gunsPerTurret:2,configuration:'2 turrets · 2 autocannons per turret'},
      'rail-gun':{quantity:2,turrets:1,gunsPerTurret:2,configuration:'1 turret · 2 rail guns'},
      'mp-missiles':{quantity:40,location:'Dorsal / top'},
      'as-missiles':{quantity:78,location:'Ventral / bottom'},
      'ciws-30':{quantity:4,port:2,starboard:2,location:'Port and starboard · 2 per side'}
    },
    countermeasures:['chaff','flares'],hangar:{bays:1,shuttles:4}
  },
  'spf-logistics-tender': {
    label:'SPF LOGISTICS TENDER',faction:'SPF',role:'Repair / resupply tender',engines:'2 main engines · drive model and EPD rating not specified',
    loadout:['autocannon-120','mp-missiles','ciws-30'],fitConfirmed:true,
    fitting:{
      'autocannon-120':{quantity:1,turrets:1,gunsPerTurret:1,configuration:'1 forward turret · 1 autocannon'},
      'mp-missiles':{quantity:20,location:'Ventral / bottom · vertical launch tubes'},
      'ciws-30':{quantity:2,port:1,starboard:1,location:'Port and starboard · 1 per side'}
    },
    hangar:{bays:1,repairShuttles:6,launchLanes:{aft:2,port:2,starboard:2}}
  }
};
for (const [id,ship] of Object.entries(shipTypes)) {
  ship.armaments=ship.loadout.map(id=>armamentLabel(ship,id)).join(' · ');
  ship.crew={automation:'high',size:'small',androids:id.startsWith('sdf-')||id.startsWith('pirate-')?'included':'unspecified',maxAndroidFraction:crewDoctrine.maxAndroidFraction};
  if(boardingComplements[id])ship.boarding=boardingComplements[id];
}

// Provisional size classes for recognized catalog vessels.
const shipSizes = {
  'une-cargo': 'Large', 'une-light-cargo': 'Small', privateer: 'Medium',
  'private-yacht': 'Small', 'une-transport': 'Medium', 'une-large-transport': 'Large',
  'pirate-frigate': 'Medium', 'pirate-corvette': 'Small', 'sdf-frigate': 'Medium',
  'sdf-destroyer': 'Large', 'sdf-cruiser': 'Very large', 'sdf-heavy-cruiser': 'Heavy',
  'spf-logistics-tender': 'Large'
};

// Ship-relative training snapshot: positions in km, relative velocity components in km/h.
// +X starboard, +Y fore, +Z above. Each catalog ship has a representative contact.
export const trainingContacts = [
  { id: 'U-01', type: 'neutral', shipType: 'privateer', name: 'Black Kestrel', registry: 'IND-0714', iffRoll: .96, x: 7, y: 6, z: 0, vx: 1200, vy: 900, vz: 0 },
  { id: 'N-02', type: 'neutral', shipType: 'une-cargo', name: 'Meridian Hauler', registry: 'UNE-2408', x: -12, y: 9, z: 8, vx: -480, vy: 640, vz: 120 },
  { id: 'F-03', type: 'friendly', shipType: 'sdf-frigate', name: shipNameOptions('sdf-frigate')[1], registry: 'SDF-031', x: 24, y: 18, z: -12, vx: 1500, vy: -800, vz: 360 },
  { id: 'E-04', type: 'enemy', shipType: 'pirate-frigate', name: pirateShipNames[0], registry: 'PIR-009', x: -36, y: -22, z: 20, vx: 1100, vy: 1600, vz: -420 },
  { id: 'U-05', type: 'neutral', shipType: 'private-yacht', name: 'Silver Horizon', registry: 'CIV-6802', x: 62, y: -50, z: -35, vx: -720, vy: -960, vz: 150 },
  { id: 'E-06', type: 'enemy', shipType: 'pirate-corvette', name: pirateShipNames[1], registry: 'PIR-024', x: -116, y: 70, z: 62, vx: 2100, vy: -1700, vz: -550 },
  { id: 'N-07', type: 'neutral', shipType: 'une-light-cargo', name: 'Copper Finch', registry: 'UNE-5118', x: 17, y: -41, z: -24, vx: 600, vy: 800, vz: 80 },
  { id: 'N-08', type: 'neutral', shipType: 'une-transport', name: 'New Dawn', registry: 'UNE-1842', x: -54, y: 39, z: -46, vx: 840, vy: 630, vz: -140 },
  { id: 'N-09', type: 'neutral', shipType: 'une-large-transport', name: 'Pioneer Assembly', registry: 'UNE-1020', x: 92, y: 44, z: 38, vx: -360, vy: 480, vz: 90 },
  { id: 'F-10', type: 'friendly', shipType: 'sdf-destroyer', name: 'SDF Tokyo', registry: 'SDF-052', x: 43, y: -8, z: 14, vx: -1400, vy: 1900, vz: -300 },
  { id: 'F-11', type: 'friendly', shipType: 'sdf-cruiser', name: 'SDF Ontario', registry: 'SDF-083', x: -67, y: -66, z: 55, vx: 1000, vy: 750, vz: 200 },
  { id: 'F-12', type: 'friendly', shipType: 'sdf-heavy-cruiser', name: 'SDF Nairobi', registry: 'SDF-101', x: 118, y: -95, z: -75, vx: -900, vy: 1200, vz: 240 }
];
export const earthPatrolContacts = trainingContacts.filter(contact => contact.type !== 'enemy');

export const contactDistance = contact => Math.hypot(contact.x, contact.y, contact.z);
export const contactSpeed = contact => Math.hypot(contact.vx, contact.vy, contact.vz);
// Vc = -r · v_relative / |r|. Positive closes range; negative opens range.
export function contactClosureRate(contact) {
  const distance = contactDistance(contact);
  if (distance === 0) return null; // No line of sight exists at coincident positions.
  const rate = -(contact.x * contact.vx + contact.y * contact.vy + contact.z * contact.vz) / distance;
  return rate === 0 ? 0 : rate;
}

// One stable assessment per track: UI renders, zoom, and locks never reroll IFF.
function iffRollFor(id) {
  let hash = 2166136261;
  for (const character of `sdf-iff:${id}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15; hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

export function observeContact(contact) {
  const withinIFFRange = contactDistance(contact) <= IFF_RANGE_KM;
  const roll = contact.iffRoll ?? iffRollFor(contact.id);
  const identified = withinIFFRange && roll < IFF_IDENTIFICATION_CHANCE && contact.type !== 'unknown' && !!shipTypes[contact.shipType];
  const trackLabel = `TRK-${contact.id.split('-').at(-1)}`;
  // Only this observed view reaches UI code; unknown contacts expose no catalog identity.
  return {
    id: contact.id, trackLabel, x: contact.x, y: contact.y, z: contact.z,
    vx: contact.vx, vy: contact.vy, vz: contact.vz,
    type: identified ? contact.type : 'unknown', identified,
    name: identified ? contact.name : `Unknown contact ${trackLabel}`,
    registry: identified ? contact.registry : 'Unknown',
    ship: identified ? { ...shipTypes[contact.shipType], size: shipSizes[contact.shipType], image: shipFiveViews[contact.shipType] } : {
      label: 'UNKNOWN SHIP TYPE', size: 'Unknown', faction: 'Unknown', role: 'Unknown',
      armaments: 'Unknown', engines: 'Unknown', countermeasures:'Unknown', hangar:'Unknown'
    },
    iffStatus: identified ? 'Identity verified' : withinIFFRange ? 'No verified IFF return' : `Beyond ${IFF_RANGE_KM} km IFF range`
  };
}
export const contactsInRange = (contacts, range) => contacts.filter(contact => contactDistance(contact) <= range);
export const rangeRings = range => [range / 4, range / 2, range * 3 / 4, range];
export function projectContact(contact, view, range, radius = 148) {
  return { x: contact.x / range * radius, y: -(view === 'top' ? contact.y : contact.z) / range * radius };
}
export function projectVelocity(contact, view, length = 26) {
  const x = contact.vx, y = -(view === 'top' ? contact.vy : contact.vz);
  const magnitude = Math.hypot(x, y);
  return magnitude === 0 ? null : { x: x / magnitude * length, y: y / magnitude * length };
}
export function selectTargets(ids, id, toggle = false) {
  if (!toggle) return [id];
  if (ids.includes(id)) return ids.filter(value => value !== id);
  return [...ids, id];
}

export const MAX_TARGET_PRIORITY = trainingContacts.length;
export function restoreTargetPriorities(lockedIds, saved) {
  if(saved===undefined)return Object.fromEntries(lockedIds.map((id,index)=>[id,index+1]));
  if(!saved||typeof saved!=='object'||Array.isArray(saved)||Object.keys(saved).length!==lockedIds.length)throw new Error('Invalid target priorities.');
  const used=new Set();
  return Object.fromEntries(lockedIds.map(id=>{
    const priority=saved[id];
    if(!Object.hasOwn(saved,id)||!Number.isInteger(priority)||priority<1||priority>MAX_TARGET_PRIORITY||used.has(priority))throw new Error('Target priorities must be unique whole numbers starting at 1.');
    used.add(priority);return [id,priority];
  }));
}
export function prioritizeTargets(lockedIds, priorities, id, priority, toggle=false) {
  const next=selectTargets(lockedIds,id,toggle);
  return {lockedIds:next,priorities:restoreTargetPriorities(next,Object.fromEntries(next.map(key=>[key,key===id?priority:priorities[key]])))};
}
