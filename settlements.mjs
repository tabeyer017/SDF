import { at, mapPoint } from './navigation.mjs';

export const AU_KM = 149597870.7;
export const ARRIVAL_EPSILON_AU = 1e-9;
export const STATION_SYMBOL_PATH = 'M0-8 8 0 0 8-8 0ZM-12 0H12M0-12V12';

// Rounded JPL mean moon orbital radii, with illustrative directions.
// Chart callouts are separate from physical navigation coordinates.
const definitions = [
  { id:'moon-station', name:'Moon station', parentId:'earth', moon:'Moon', kind:'station', size:'large', offsetKm:384400, angle:95, color:'#c9cecb', type:'LARGE STATION · EARTH / MOON', description:'A large station on Earth’s Moon. A major SDF presence in the home system, protected by advanced radiation shielding.' },
  { id:'mars-colony', name:'Mars colony', parentId:'mars', kind:'colony', offsetKm:3390, angle:-75, color:'#c99676', type:'SURFACE COLONY · MARS', description:'An established colony on the surface of Mars. A civilian settlement within the SDF’s Solar System patrol area.' },
  { id:'phobos-station', name:'Phobos station', parentId:'mars', moon:'Phobos', kind:'station', offsetKm:9375, angle:35, color:'#b2a898', type:'STATION · MARS / PHOBOS', description:'A station on Phobos, the inner moon of Mars. A separate patrol destination close to the Martian colony.' },
  { id:'ganymede-station', name:'Ganymede station', parentId:'jupiter', moon:'Ganymede', kind:'station', offsetKm:1070400, angle:125, color:'#bdb19b', type:'STATION · JUPITER / GANYMEDE', description:'An SDF station on Ganymede. Its crew maintains a presence in the Jovian system behind advanced protective shielding.' },
  { id:'titan-station', name:'Titan station', parentId:'saturn', moon:'Titan', kind:'station', offsetKm:1221900, angle:60, color:'#d5ba7d', type:'STATION · SATURN / TITAN', description:'An SDF station on Titan, extending patrol coverage to the Saturnian system.' },
  { id:'titania-station', name:'Titania station', parentId:'uranus', moon:'Titania', kind:'station', offsetKm:436298, angle:220, color:'#b6c5c7', type:'STATION · URANUS / TITANIA', description:'A shielded SDF station on Titania, Uranus’s largest moon. The station maintains the Uranian patrol watch.' },
  { id:'triton-station', name:'Triton station', parentId:'neptune', moon:'Triton', kind:'station', offsetKm:354800, angle:300, color:'#acbdcf', type:'STATION · NEPTUNE / TRITON', description:'An SDF station on Triton, maintaining a presence in the Neptunian system near the outer planetary frontier.' }
];

export function createSettlements(planets) {
  return definitions.map(site=>{
    const parent=planets.find(body=>body.id===site.parentId);
    if(!parent)throw new Error(`Missing parent planet: ${site.parentId}`);
    const offset=at(site.offsetKm/AU_KM,site.angle);
    return { ...site, parentName:parent.name, x:parent.x+offset.x, y:parent.y+offset.y };
  });
}

export function settlementCallout(site, planets) {
  const parent=planets.find(body=>body.id===site.parentId);
  const origin=mapPoint(parent);
  const radius=Math.hypot(origin.x,origin.y);
  // Adjacent markers share the parent's heliocentric orbit. The two Martian
  // sites sit on opposite sides of Mars; chart placement never changes travel.
  const sweep=site.id==='mars-colony'?-1:1;
  const angle=Math.atan2(origin.y,origin.x)+sweep*36/radius;
  return { x:radius*Math.cos(angle), y:radius*Math.sin(angle), origin, radius, sweep };
}

export function formatDistance(au) {
  return au>0 && au<.01 ? `${Math.round(au*AU_KM).toLocaleString('en-US')} km` : `${au.toFixed(2)} AU`;
}
