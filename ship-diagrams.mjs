import { condition } from './combat-model.mjs';
import { shipFiveViews, shipTypes } from './tactical-model.mjs';

const point=(x,y)=>({x,y});

// Percentages refer to the full image, including its labels and all five views.
// Internal systems and fittings absent from the artwork use approximate locations.
export const shipDiagramMarkers={
  'une-cargo':{
    hull:point(46,59),bridge:point(59,46),reactor:point(61,83),sensors:point(90,67),jammer:point(67,33),
    'engine-1':point(85,77),'engine-2':point(96,77),'ciws-30-1':point(6,33)
  },
  'une-light-cargo':{
    hull:point(44,59),bridge:point(57,45),reactor:point(60,85),sensors:point(89,63),jammer:point(65,31),
    'engine-1':point(90,78),'ciws-30-1':point(6,32)
  },
  privateer:{
    hull:point(57,52),bridge:point(38,45),reactor:point(22,79),sensors:point(88,14),jammer:point(38,22),
    'engine-1':point(82,82),'engine-2':point(95,82),
    'gp-missiles-1':point(38,82),'autocannon-75-1':point(63,23),'ciws-30-1':point(33,31)
  },
  'private-yacht':{
    hull:point(46,57),bridge:point(33,43),reactor:point(61,83),sensors:point(89,15),jammer:point(59,22),
    'engine-1':point(84,81),'engine-2':point(94,81),'ciws-30-1':point(48,22)
  },
  'une-transport':{
    hull:point(47,59),bridge:point(27,47),reactor:point(58,83),sensors:point(89,16),jammer:point(39,21),
    'engine-1':point(86,81),'engine-2':point(94,81),'ciws-30-1':point(62,30)
  },
  'une-large-transport':{
    hull:point(49,58),bridge:point(25,45),reactor:point(61,85),sensors:point(90,17),jammer:point(49,22),
    'engine-1':point(84,82),'engine-2':point(89.5,82),'engine-3':point(95,82),'engine-4':point(76,58),
    'ciws-30-1':point(31,32)
  },
  'pirate-frigate':{
    hull:point(49,60),bridge:point(28,47),reactor:point(59,81),sensors:point(90,17),jammer:point(37,23),
    'engine-1':point(85,84),'engine-2':point(95,84),'gp-missiles-1':point(40,79),
    'autocannon-75-1':point(13,23),'autocannon-75-2':point(59,23),'ciws-30-1':point(34,30),'ciws-30-2':point(34,15)
  },
  'pirate-corvette':{
    hull:point(49,60),bridge:point(30,46),reactor:point(60,81),sensors:point(89,17),jammer:point(38,22),
    'engine-1':point(84,84),'engine-2':point(95,84),'gp-missiles-1':point(41,79),
    'autocannon-75-1':point(13,22),'ciws-30-1':point(35,30),'ciws-30-2':point(35,13)
  },
  'sdf-frigate':{
    hull:point(50,63),bridge:point(87,21),reactor:point(57,87),sensors:point(32,18),jammer:point(42,63),
    'engine-1':point(84,69),'engine-2':point(91,69),
    'autocannon-120-1':point(18,24),'autocannon-120-2':point(59,24),
    'mp-missiles-1':point(44,24),'as-missiles-1':point(42,86),'ciws-30-1':point(39,36),'ciws-30-2':point(39,12)
  },
  'sdf-destroyer':{
    hull:point(49,65),bridge:point(28,51),reactor:point(63,86),sensors:point(89,12),jammer:point(38,62),
    'engine-1':point(87,73),'engine-2':point(92,73),
    'autocannon-120-1':point(16,27),'autocannon-120-2':point(60,27),
    'mp-missiles-1':point(40,27),'as-missiles-1':point(40,87),'ciws-30-1':point(30,36),'ciws-30-2':point(30,17)
  },
  'sdf-cruiser':{
    hull:point(49,59),bridge:point(34,53),reactor:point(60,84),sensors:point(34,25),jammer:point(39,57),
    'engine-1':point(87,85),'engine-2':point(92,85),
    'autocannon-120-1':point(15,25),'autocannon-120-2':point(67,25),'rail-gun-1':point(24,25),
    'mp-missiles-1':point(47,25),'as-missiles-1':point(45,83),
    'ciws-30-1':point(30,32),'ciws-30-2':point(65,32),'ciws-30-3':point(30,18),'ciws-30-4':point(65,18)
  },
  'sdf-heavy-cruiser':{
    hull:point(51,58),bridge:point(34,51),reactor:point(60,83),sensors:point(35,24),jammer:point(40,57),
    'engine-1':point(85,86),'engine-2':point(90,86),'engine-3':point(95,86),
    'autocannon-120-1':point(15,24),'autocannon-120-2':point(71,24),'rail-gun-1':point(24,24),
    'mp-missiles-1':point(44,24),'as-missiles-1':point(45,83),
    'ciws-30-1':point(29,34),'ciws-30-2':point(68,34),'ciws-30-3':point(29,14),'ciws-30-4':point(68,14)
  },
  'spf-logistics-tender':{
    hull:point(47,63),bridge:point(87,21),reactor:point(62,86),sensors:point(32,22),jammer:point(42,60),
    'engine-1':point(84,69),'engine-2':point(91,69),
    'autocannon-120-1':point(18,24),'mp-missiles-1':point(42,87),'ciws-30-1':point(39,35),'ciws-30-2':point(39,12)
  }
};

export function diagramSystemStatus(system){
  if(system.hp<=0)return 'offline';
  const performance=condition(system);
  return performance===1?'healthy':performance===.7?'damaged':'critical';
}

export function diagramAimCategory(ship,systemId){
  if(!Object.hasOwn(ship.systems,systemId))return null;
  if(systemId.startsWith('engine-'))return 'engines';
  const mount=ship.mounts.find(mount=>mount.id===systemId);
  if(mount)return mount.weapon==='ciws-30'?'ciws':'weapons';
  if(systemId==='jammer'||systemId==='sensors')return systemId;
  return 'hull';
}

export function renderShipDiagram({ship,classId=ship?.classId,interactive=false,onSelectSystem,selectedSystem=null}){
  const coordinates=Object.hasOwn(shipDiagramMarkers,classId)?shipDiagramMarkers[classId]:null;
  if(!ship||!coordinates)return null;

  const root=document.createElement('figure');
  root.className='ship-diagram';
  root.dataset.classId=classId;
  root.setAttribute('aria-label',`${shipTypes[classId].label} system diagram`);
  const schematic=document.createElement('div');
  schematic.className='ship-diagram-schematic';
  const image=document.createElement('img');
  image.alt=`${shipTypes[classId].label} five-view schematic`;
  image.src=shipFiveViews[classId];
  image.loading='lazy';
  schematic.append(image);
  const readout=document.createElement('figcaption');
  readout.className='ship-diagram-readout';
  root.append(schematic,readout);

  const markers=new Map();
  let hovered=null,focused=null,selected=null;
  function refreshReadout(){
    const marker=markers.get(hovered??focused??selected);
    const value=marker?.title??'Focus or hover over a marker to see system integrity.';
    if(readout.textContent!==value)readout.textContent=value;
  }
  for(const [id,{x,y}] of Object.entries(coordinates)){
    if(!Object.hasOwn(ship.systems,id))continue;
    const marker=document.createElement('button');
    marker.type='button';
    marker.dataset.systemId=id;
    marker.style.left=`${x}%`;
    marker.style.top=`${y}%`;
    marker.onpointerenter=()=>{hovered=id;refreshReadout();};
    marker.onpointerleave=()=>{hovered=null;refreshReadout();};
    marker.onfocus=()=>{focused=id;refreshReadout();};
    marker.onblur=()=>{focused=null;refreshReadout();};
    if(interactive)marker.onclick=()=>onSelectSystem?.(id);
    else marker.setAttribute('aria-disabled','true');
    schematic.append(marker);markers.set(id,marker);
  }
  function update(nextShip,nextSelected=null){
    selected=nextSelected;
    for(const [id,marker] of markers){
      const system=nextShip.systems[id],status=diagramSystemStatus(system);
      const label=`${system.name} · ${system.hp} / ${system.max} HP · ${status}`;
      marker.className=`ship-diagram-marker is-${status}`;
      if(marker.title!==label){
        marker.title=label;
        marker.setAttribute('aria-label',label);
      }
      if(interactive)marker.setAttribute('aria-pressed',String(selected===id));
    }
    refreshReadout();
  }
  update(ship,selectedSystem);
  return {root,update};
}
