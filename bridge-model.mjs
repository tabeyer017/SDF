import { radarRanges } from './tactical-model.mjs';

export const bridgeStations = [
  { id:'command', name:'Command area', short:'Command', group:'Command', symbol:'✧', color:'#d5b77c', x:330,y:305, summary:'The captain and first officer coordinate the bridge, set the watch condition, and take direct control through the station consoles.' },
  { id:'helm', name:'Conn / Helm', short:'Conn / Helm', group:'Forward & flight control', symbol:'⌁', color:'#8ac9d0', x:255,y:157, summary:'Execute the plotted course, control EPD transit, and hold or resume the ship’s flight. Helm is responsible for physical flight and local maneuvering.' },
  { id:'ops', name:'Operations', short:'Ops', group:'Forward & flight control', symbol:'◈', color:'#8ac9d0', x:405,y:157, summary:'Coordinate daily ship resources, internal systems, sensor assignments, and readiness reports. Choose the current bridge duty priority.' },
  { id:'navigation', name:'Navigation', short:'Navigation', group:'Forward & flight control', symbol:'⌖', color:'#8ac9d0', x:150,y:235, summary:'Plot local patrol routes, assess hazards, and guide combat maneuvers. Open the Solar System planner for EPD travel between sectors.' },
  { id:'tactical', name:'Tactical', short:'Tactical', group:'Tactical & security', symbol:'◇', color:'#d6977f', x:510,y:235, summary:'Coordinate weapons control, defensive readiness, and target assessment from a single tactical console.' },
  { id:'security', name:'Security / Defense', short:'Security', group:'Tactical & security', symbol:'⬡', color:'#d6977f', x:485,y:420, summary:'Coordinate internal security, protective systems, access readiness, and local threat assessments. Security and Tactical share the ship’s watch condition.' },
  { id:'science', name:'Science', short:'Science', group:'Science & communications', symbol:'✺', color:'#aaa7d1', x:125,y:330, summary:'Review sensor assignments, planetary information, and the selected navigation target. Coordinate anomaly analysis and research data.' },
  { id:'communications', name:'Communications', short:'Comms', group:'Science & communications', symbol:'⌁', color:'#aaa7d1', x:535,y:330, summary:'Maintain the Sol Command link, coordinate hailing and inter-ship messages, and prepare shipboard status reports for the patrol watch.' },
  { id:'engineering', name:'Engineering', short:'Engineering', group:'Engineering & support', symbol:'⚙', color:'#94b69b', x:330,y:465, summary:'Monitor the cold fusion core, EPD propulsion, power distribution, inertial dampeners, life-support interfaces, and damage-control readiness.' },
  { id:'environment', name:'Environment / Life Support', short:'Life support', group:'Engineering & support', symbol:'◌', color:'#94b69b', x:175,y:420, summary:'Oversee atmosphere, temperature, artificial gravity, air recycling, and waste processing. Set the habitat temperature for the current watch.' }
];

const allowed={ watch:['routine','heightened'], seat:['captain','first-officer'], ops:['balanced','sensors','engineering'], sensor:['navigation','long-range','planetary'] };
export function restoreBridgeState(saved={}) {
  if(!saved||typeof saved!=='object')saved={};
  const result={watch:'routine',seat:'captain',ops:'balanced',sensor:'navigation',temperature:21,selected:'command',radarRange:60};
  for(const [key,values] of Object.entries(allowed))if(values.includes(saved[key]))result[key]=saved[key];
  if(Number.isFinite(saved.temperature))result.temperature=Math.min(25,Math.max(18,saved.temperature));
  if(bridgeStations.some(station=>station.id===saved.selected))result.selected=saved.selected;
  if(radarRanges.includes(saved.radarRange))result.radarRange=saved.radarRange;
  return result;
}
export function flightControlState(snapshot) {
  return {
    canEngage:!snapshot.active && Number.isInteger(snapshot.routeCount) && snapshot.routeCount>0 && snapshot.routeCount<=12 && !snapshot.unsafe,
    canPause:!!snapshot.active,
    canAbort:!!snapshot.active
  };
}
