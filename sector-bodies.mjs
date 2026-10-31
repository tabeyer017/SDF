import { createSettlements, AU_KM } from './settlements.mjs';

// Rounded mean radii (km): NASA planet sizes and JPL satellite physical parameters.
// https://science.nasa.gov/solar-system/planet-sizes-and-locations-in-our-solar-system/
// https://ssd.jpl.nasa.gov/sats/phys_par/
const planets = [
  ['mercury','Mercury',2440,'#a6a09a'], ['venus','Venus',6052,'#d4b68b'],
  ['earth','Earth',6371,'#7ca9cf'], ['mars','Mars',3390,'#c77d60'],
  ['jupiter','Jupiter',69911,'#c4ab8b'], ['saturn','Saturn',58232,'#cbbd91'],
  ['uranus','Uranus',25362,'#8abcc5'], ['neptune','Neptune',24622,'#5f7eb4']
].map(([id,name,radius,color])=>({id,name,radius,color,kind:'planet',x:0,y:0,z:0}));
const settlements = createSettlements(planets);
const moonRadii = { Moon:1737, Phobos:11, Ganymede:2634, Titan:2575, Titania:789, Triton:1353 };

// Use the strategic chart's existing moon distances and illustrative directions.
// Each destination starts 100 km above its body's +X limb in the training frame.
// These are fixed chart references, not an orbital/gravity simulation.
export function sectorBodies(location) {
  const key=location.toLowerCase();
  const site=settlements.find(s=>s.name.toLowerCase()===key);
  const planet=planets.find(p=>p.name.toLowerCase()===key || p.id===site?.parentId);
  if(!planet)return [];
  const moons=settlements.filter(s=>s.parentId===planet.id && s.moon).map(s=>({
    id:s.moon.toLowerCase(),name:s.moon,kind:'moon',radius:moonRadii[s.moon],color:s.color,
    x:s.x*AU_KM,y:s.y*AU_KM,z:0,orbitRadius:s.offsetKm,parentId:planet.id
  }));
  const anchor=site?.moon ? moons.find(m=>m.name===site.moon) : planet;
  const offset={x:-anchor.x-anchor.radius-100,y:-anchor.y,z:-anchor.z};
  return [planet,...moons].map(body=>({...body,x:body.x+offset.x,y:body.y+offset.y,z:body.z+offset.z}));
}

export function planetaryOverview(bodies,own,axis='y') {
  if(!bodies.length)return null;
  const bounds=axis=>[Math.min(own[axis],...bodies.map(b=>b[axis]-b.radius)),Math.max(own[axis],...bodies.map(b=>b[axis]+b.radius))];
  const extents=['x','y','z'].map(bounds);
  return {center:Object.fromEntries(['x','y','z'].map((axis,i)=>[axis,(extents[i][0]+extents[i][1])/2])),
    radius:Math.ceil(Math.max(1000,...[0,axis==='z'?2:1].map(i=>(extents[i][1]-extents[i][0])*.65))/1000)*1000};
}
