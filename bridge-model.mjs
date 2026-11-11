import { radarRanges,boardingComplements } from './tactical-model.mjs';

// Confirmed complements; a space-marine platoon has 40 personnel.
export const marineComplements=Object.fromEntries(Object.entries(boardingComplements).filter(([id])=>id.startsWith('sdf-')));

export const bridgeStations = [
  { id:'command', name:'Bridge Command', short:'Bridge Command', group:'Bridge Command', symbol:'✧', color:'#d5b77c', x:330,y:305, summary:'Ship readiness, alerts, and shuttle status.' },
  { id:'system-map', name:'System Map', short:'System Map', group:'Flight Control', symbol:'⌖', color:'#8ac9d0', summary:'Plot a strategic patrol through the Solar System.' },
  { id:'ops', name:'Operations', short:'Ops', group:'Forward & flight control', symbol:'◈', color:'#8ac9d0', x:405,y:157, summary:'Coordinate daily ship resources, internal systems, sensor assignments, and readiness reports. Choose the current bridge duty priority.' },
  { id:'navigation', name:'Local Flight', short:'Local Flight', group:'Flight Control', symbol:'⌖', color:'#8ac9d0', summary:'Choose stops on the local chart and fly the route with automatic guidance. Optional manual controls are available for direct thrust and steering.' },
  { id:'tactical', name:'Tactical', short:'Tactical', group:'Tactical & security', symbol:'◇', color:'#d6977f', x:510,y:235, summary:'Coordinate weapons control, defensive readiness, and target assessment from a single tactical console.' },
  { id:'security', name:'Security / Defense', short:'Security', group:'Tactical & security', symbol:'⬡', color:'#d6977f', x:485,y:420, summary:'Marines board, seize, and defend ships. Automation keeps crews small. Androids perform routine, hazardous, and combat duties, count within personnel totals, and can be injured or destroyed. Their high cost limits them to 30% of each crew or combat team.' },
  { id:'science', name:'Science', short:'Science', group:'Engineering & support', symbol:'✺', color:'#94b69b', x:125,y:330, summary:'Review sensor assignments, planetary information, and the selected navigation target. Coordinate anomaly analysis and research data.' },
  { id:'communications', name:'Comms', short:'Comms', group:'Comms', symbol:'⌁', color:'#aaa7d1', x:535,y:330, summary:'Hail ships and stations, review messages, and recall shuttles.' },
  { id:'engineering', name:'Engineering', short:'Engineering', group:'Engineering & support', symbol:'⚙', color:'#94b69b', x:330,y:465, summary:'Monitor the cold fusion core, EPD propulsion, power distribution, inertial dampeners, life-support interfaces, and damage-control readiness.' },
  { id:'environment', name:'Environment / Life Support', short:'Life support', group:'Engineering & support', symbol:'◌', color:'#94b69b', x:175,y:420, summary:'Oversee atmosphere, temperature, artificial gravity, air recycling, and waste processing. Set the habitat temperature for the current watch.' }
];

// Legacy station IDs resolve to the console that now contains their controls.
export const bridgeAreas = [
  {id:'command',name:'Bridge Command',short:'Bridge Command',symbol:'✧',color:'#d5b77c',x:330,y:305,summary:'Ship readiness, alerts & shuttles',tabs:[['command','Bridge Command']]},
  {id:'flight',name:'Flight Control',short:'Flight Control',symbol:'⌖',color:'#8ac9d0',x:330,y:140,summary:'System travel & local flight',tabs:[['system-map','System Map'],['navigation','Local Flight']]},
  {id:'tactical-security',name:'Tactical / Security',short:'Tactical / Security',symbol:'◇',color:'#d6977f',x:140,y:305,summary:'Weapons, defenses & marines',tabs:[['tactical','Tactical']]},
  {id:'communications',name:'Comms',short:'Comms',symbol:'⌁',color:'#aaa7d1',x:520,y:305,summary:'Hails, messages & shuttle recall',tabs:[['communications','Comms']]},
  {id:'engineering-support',name:'Engineering / Support',short:'Engineering',symbol:'⚙',color:'#94b69b',x:330,y:465,summary:'Repairs, science, operations & life support',tabs:[['engineering','Engineering'],['science','Science'],['ops','Operations'],['environment','Life Support']]}
];
export const canonicalBridgeStation=id=>id==='helm'?'navigation':id==='security'?'tactical':id;
export function bridgeAreaFor(stationId){return bridgeAreas.find(area=>area.tabs.some(([id])=>id===canonicalBridgeStation(stationId)))||bridgeAreas[0];}

const allowed={ watch:['routine','heightened'], seat:['captain','first-officer'], ops:['balanced','sensors','engineering'], sensor:['navigation','long-range','planetary'] };
export function restoreBridgeState(saved={}) {
  if(!saved||typeof saved!=='object')saved={};
  const result={watch:'routine',seat:'captain',ops:'balanced',sensor:'navigation',temperature:21,selected:'command',radarRange:60};
  for(const [key,values] of Object.entries(allowed))if(values.includes(saved[key]))result[key]=saved[key];
  if(Number.isFinite(saved.temperature))result.temperature=Math.min(25,Math.max(18,saved.temperature));
  const selected=canonicalBridgeStation(saved.selected);
  if(bridgeStations.some(station=>station.id===selected))result.selected=selected;
  if(radarRanges.includes(saved.radarRange))result.radarRange=saved.radarRange;
  if(saved.radarRange===20)result.radarRange=30;
  return result;
}
export function flightControlState(snapshot) {
  return {
    canEngage:!snapshot.active && snapshot.canEPD!==false && Number.isInteger(snapshot.routeCount) && snapshot.routeCount>0 && snapshot.routeCount<=12 && !snapshot.unsafe,
    canPause:!!snapshot.active,
    canAbort:!!snapshot.active
  };
}
