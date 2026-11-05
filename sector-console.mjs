import { contactTypes } from './tactical-model.mjs';
import {playerShipName} from './ship-names.mjs';
import { maneuverNames, maneuverTelemetry, predictedPath, sectorHazards, SENSOR_RANGE, isHardTurn, LOCAL_SIMULATION_RATES } from './sector-model.mjs';
import { flightControlState } from './bridge-model.mjs';
import { sectorBodies, planetaryOverview } from './sector-bodies.mjs';

const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const svg=(tag,attrs={},text)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
const number=value=>Math.round(value).toLocaleString('en-US');
const signed=value=>`${value>0?'+':''}${number(value)}`;
function button(text,fn){const n=el('button','bridge-action',text);n.type='button';n.onclick=fn;return n;}
function field(form,label,value,min,max,step=1){const wrapper=el('label','bridge-setting');wrapper.append(el('span','',label));const input=el('input','');input.type='number';input.value=value;input.min=min;input.max=max;input.step=step;input.required=true;input.setAttribute('aria-label',label);wrapper.append(input);form.append(wrapper);return input;}

export function flightReadout(flight) {
  const s=flight.sector,t=maneuverTelemetry(s),closure=t.closure===null?'—':signed(t.closure);
  return `${maneuverNames[t.mode]}${t.target!=='None'?` · ${t.target}`:''} · ${number(t.speed)} KPH${t.distance!==null?` · Range ${t.distance.toFixed(1)} km · Vc ${closure} KPH`:''}${['maintain','open'].includes(t.mode)?` · Requested ${t.requestedRange} km`:''}${s.safety.startsWith('Blocked')?' · NAV BRAKING':''}`;
}

export function mountManeuverControls({flight,targetId,onNavigate,canExecute=()=>true}) {
  const wrap=el('section','combat-maneuvers');wrap.append(el('h4','','COMBAT MANEUVER'));
  const label=el('label','bridge-setting');label.append(el('span','','Maneuver'));const choice=el('select','');choice.setAttribute('aria-label','Combat maneuver');
  for(const [value,text] of [['intercept','Intercept · 5 km standoff'],['match','Match velocity'],['maintain','Maintain range'],['open','Open distance'],['break','Break away'],['port','Hard a Port · left 40°'],['starboard','Hard a Starboard · right 40°']]) choice.append(Object.assign(el('option','',text),{value}));
  choice.value='maintain';label.append(choice);wrap.append(label);
  const form=el('form','maneuver-form');const range=field(form,'Engagement range · km',25,5,200);
  const available=()=>!flight.inTransit()&&(isHardTurn(choice.value)||!!targetId)&&canExecute(choice.value);
  choice.onchange=()=>{range.disabled=!['maintain','open'].includes(choice.value);execute.disabled=!available();};
  const execute=el('button','bridge-action','Execute maneuver');execute.type='submit';form.append(execute);
  form.onsubmit=e=>{e.preventDefault();if(available())flight.command(choice.value,targetId,Number(range.value));};
  wrap.append(form,el('p','target-fit-note','Target maneuvers use autopilot and bow tracking. Hard turns rotate the bow 40° without a target and retain current flight motion.'),button('View Local Flight ↗',onNavigate));choice.onchange();return wrap;
}

export function mountSectorConsole({root,flight,openSystem,strategic}) {
  let radius=220,plane='top',camera=null,chartedSector=null,bodies=[];
  root.dataset.mode='navigation';
  const heading=el('header','sector-heading'), title=el('div','');title.append(el('span','tactical-eyebrow','LOCAL FLIGHT'));
  heading.append(title,button('Solar System / EPD ↗',openSystem));
  const toolbar=el('div','sector-toolbar'),ranges=el('div','sector-ranges');ranges.setAttribute('role','group');ranges.setAttribute('aria-label','Sector map radius');
  for(const value of [100,200,220,250,500,1000,2500]){const b=button(`${value.toLocaleString()} km`,()=>{radius=value;camera=null;refresh();});b.dataset.radius=value;ranges.append(b);}
  const view=el('select','');view.setAttribute('aria-label','Sector projection');view.append(Object.assign(el('option','','Top · X / Y'),{value:'top'}),Object.assign(el('option','','Rear · X / Z'),{value:'rear'}));view.onchange=()=>{plane=view.value;if(camera)fitBodies();refresh();};
  function fitBodies(){const fit=planetaryOverview(bodies,flight.sector.own,plane==='top'?'y':'z');if(fit){camera=fit.center;radius=fit.radius;}}
  const overview=button('Planetary overview',()=>{fitBodies();refresh();});
  toolbar.append(ranges,view,overview,button('Center on ship',()=>{camera=null;radius=220;refresh();}));
  const workspace=el('div','sector-workspace'),mapArea=el('section','sector-map-area');mapArea.setAttribute('aria-label','Local sector navigation map');
  const tabs=el('div','sector-view-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Local flight views');
  const chartTab=button('Sector chart',()=>setView('chart')),controlsTab=button('Route & controls',()=>setView('controls'));tabs.append(chartTab,controlsTab);
  function setView(value){workspace.dataset.view=value;chartTab.setAttribute('aria-pressed',String(value==='chart'));controlsTab.setAttribute('aria-pressed',String(value==='controls'));}
  setView('chart');
  const chart=svg('svg',{viewBox:'-330 -270 660 540',role:'img','aria-label':'Local sector chart with planets, moons, patrol route, hazards, contacts, and predicted flight paths'});
  const caption=el('p','sector-map-caption','Click chart to append a waypoint · fixed sector axes · Z can be set below');mapArea.append(chart,caption);
  const side=el('aside','sector-controls');side.setAttribute('aria-label','Local flight controls');
  const status=el('p','sector-status');status.setAttribute('role','status');const readout=el('p','sector-readout'),safety=el('p','sector-safety');
  const clock=el('div','sector-clock');const pause=button('Run local simulation',()=>{flight.toggle();refresh();});const rate=el('select','');rate.setAttribute('aria-label','Local simulation speed');for(const value of LOCAL_SIMULATION_RATES)rate.append(Object.assign(el('option','',`${value}× local time`),{value}));rate.onchange=()=>flight.setRate(Number(rate.value));clock.append(pause,rate);
  const nav=el('section','sector-navigation');nav.append(el('h3','','ROUTE PLANNING'),el('p','sector-help','Click the chart to add stops, then fly the route. Autopilot handles thrust and braking and stops if the known debris field blocks the course.'));
  const waypointForm=el('form','sector-waypoint-form');const x=field(waypointForm,'Waypoint X · km',0,-100000,100000,.1),y=field(waypointForm,'Waypoint Y · km',100,-100000,100000,.1),z=field(waypointForm,'Waypoint Z · km',0,-100000,100000,.1);
  const add=el('button','bridge-action','Add waypoint');add.type='submit';waypointForm.append(add);waypointForm.onsubmit=e=>{e.preventDefault();flight.add({x:Number(x.value),y:Number(y.value),z:Number(z.value)});refresh();};
  const route=el('ol','sector-route');const routeActions=el('div','sector-route-actions'),fly=button('Fly route',()=>{flight.patrol();refresh();});routeActions.append(button('Clear patrol route',()=>{flight.clearRoute();refresh();}));
  const coordinates=el('details','sector-advanced');coordinates.append(el('summary','','Enter coordinates (optional)'),waypointForm);
  nav.append(route,routeActions,coordinates);
  const helm=el('details','sector-helm sector-advanced');helm.append(el('summary','','Manual controls (advanced)'),el('p','','Applying manual controls cancels autopilot and bypasses debris avoidance. Zero thrust coasts without slowing down; bow direction is independent of travel. Use Stop ship to brake.'));
  const helmForm=el('form','sector-helm-form');const thrust=field(helmForm,'Thrust · %',0,-100,100),bearing=field(helmForm,'Thrust bearing · °',0,0,360),elevation=field(helmForm,'Thrust elevation · °',0,-90,90),bow=field(helmForm,'Bow bearing · °',0,0,360);
  const apply=el('button','bridge-action','Apply manual controls');apply.type='submit';helmForm.append(apply);helmForm.onsubmit=e=>{e.preventDefault();flight.manual({thrust:Number(thrust.value),bearing:Number(bearing.value),elevation:Number(elevation.value),bow:Number(bow.value)});refresh();};helm.append(helmForm);
  const transitControls=el('details','sector-advanced'),epd=el('section','sector-epd');transitControls.append(el('summary','','EPD transit controls'),epd);
  const epdEngage=button('Engage plotted EPD course',strategic.engage),epdPause=button('Pause EPD transit',strategic.pause),epdAbort=button('Abort EPD transit',strategic.abort);
  epd.append(epdEngage,epdPause,epdAbort);
  const coast=button('Cancel maneuver / coast',()=>{flight.coast();refresh();}),brake=button('Stop ship',()=>{flight.brake();refresh();});brake.classList.add('sector-stop');helm.append(coast);const position=el('p','sector-position');
  const tracks=el('details','sector-track-list');tracks.append(el('summary','','Sensor tracks / last known'));const trackList=el('ul','');tracks.append(trackList);
  const bodySection=el('details','sector-body-list sector-advanced');bodySection.append(el('summary','','Planets & moons'));const bodyList=el('ul',''),bodyNote=el('p','','Fixed chart positions · guidance avoids training debris only.');bodySection.append(bodyList,bodyNote);
  const primary=el('div','sector-primary-actions');primary.append(fly,brake);
  side.append(el('span','tactical-eyebrow','FLIGHT STATUS'),status,readout,safety,clock,primary,nav,helm,transitControls,bodySection,position,tracks);
  workspace.append(mapArea,side);root.append(heading,toolbar,tabs,workspace);
  new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;if(width&&height)chart.style.setProperty('--sector-font',`${Math.max(10,8.5/Math.min(width/660,height/540))}px`);}).observe(chart);
  chart.onclick=event=>{
    const p=chart.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const local=p.matrixTransform(chart.getScreenCTM().inverse());
    if(Math.abs(local.x)>250 || Math.abs(local.y)>250)return;
    const origin=camera||flight.sector.own,point={x:origin.x+local.x/250*radius,y:origin.y,z:origin.z};point[plane==='top'?'y':'z']-=local.y/250*radius;
    if(['x','y','z'].some(k=>Math.abs(point[k])>100000)){flight.sector.status='Choose a local range to plot waypoints within ±100,000 km.';refresh();return;}
    flight.add(point);refresh();
  };
  function refresh() {
    caption.textContent='Click chart to add route stops · autopilot handles flight · dashed line predicts the next 60 seconds';
    const s=flight.sector;
    if(chartedSector!==s){chartedSector=s;bodies=sectorBodies(s.location);camera=null;radius=220;helm.open=false;coordinates.open=false;transitControls.open=false;thrust.value=String(s.manual.thrust);bearing.value=String(s.manual.bearing);elevation.value=String(s.manual.elevation);bow.value=String(Math.round((Math.atan2(s.facing.x,s.facing.y)*180/Math.PI+360)%360));}
    const live=flight.contacts(),origin=camera||s.own,axis=plane==='top'?'y':'z';
    const px=p=>(p.x-origin.x)/radius*250,py=p=>-(p[axis]-origin[axis])/radius*250;
    status.textContent=flight.inTransit()?'EPD in transit · local controls unavailable':s.status;
    readout.textContent=flightReadout(flight);safety.textContent=`Navigation safety: ${s.safety}`;
    overview.disabled=!bodies.length;
    bodyList.replaceChildren(...bodies.map(b=>el('li','',`${b.name} · ${b.kind} · ${number(Math.max(0,Math.hypot(b.x-s.own.x,b.y-s.own.y,b.z-s.own.z)-b.radius))} km to surface`)));
    if(!bodies.length)bodyList.append(el('li','','No planetary chart at this deep-space location.'));
    pause.textContent=s.running?'Pause local simulation':'Run local simulation';pause.disabled=flight.inTransit();rate.value=String(s.rate);
    ranges.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.radius)===radius)));
    route.replaceChildren(...s.route.map(p=>{const li=el('li','',`${p.name} · X ${p.x.toFixed(1)} / Y ${p.y.toFixed(1)} / Z ${p.z.toFixed(1)} km`);return li;}));
    if(!s.route.length)route.append(el('li','','No patrol waypoints plotted.'));
    routeActions.querySelectorAll('button').forEach(b=>{b.disabled=!s.route.length||flight.inTransit();});
    fly.disabled=!s.route.length||flight.inTransit();
    add.disabled=flight.inTransit()||s.route.length>=8;apply.disabled=flight.inTransit();coast.disabled=brake.disabled=flight.inTransit();
    const transit=strategic.snapshot(),availability=flightControlState(transit);epdEngage.disabled=!availability.canEngage;epdPause.disabled=!availability.canPause;epdAbort.disabled=!availability.canAbort;epdPause.textContent=transit.paused?'Resume EPD transit':'Pause EPD transit';
    position.textContent=`${s.location} sector · T+${s.time.toFixed(0)} s · Ship X ${s.own.x.toFixed(1)} / Y ${s.own.y.toFixed(1)} / Z ${s.own.z.toFixed(1)} km`;
    chart.replaceChildren(svg('rect',{x:-250,y:-250,width:500,height:500,fill:'#091a21',stroke:'#38535f'}));
    for(let i=-2;i<=2;i++)chart.append(svg('path',{d:`M${i*100} -250V250M-250 ${i*100}H250`,stroke:i===0?'#729ba8':'#476976','stroke-width':i===0?1.4:1,'vector-effect':'non-scaling-stroke'}));
    chart.append(svg('text',{x:-250,y:-258,fill:'#9fbfc9','font-size':10},`${radius.toLocaleString()} KM RADIUS · ${plane==='top'?'X / Y':'X / Z'} · ${camera?'PLANETARY OVERVIEW':'CENTERED ON SHIP'}`));
    // Clip every spatial layer to the chart; labels and controls stay outside the plot.
    const defs=svg('defs'),clip=svg('clipPath',{id:'sector-plot-clip'});clip.append(svg('rect',{x:-250,y:-250,width:500,height:500}));defs.append(clip);chart.append(defs);
    const layer=svg('g',{'clip-path':'url(#sector-plot-clip)'});chart.append(layer);
    const parent=bodies.find(b=>b.kind==='planet');
    for(const b of bodies){
      const cx=px(b),cy=py(b),size=b.radius/radius*250;
      if(b.orbitRadius && plane==='top')layer.append(svg('circle',{cx:px(parent),cy:py(parent),r:b.orbitRadius/radius*250,fill:'none',stroke:b.color,'stroke-dasharray':'2 6',opacity:.2}));
      if(cx+size>=-250 && cx-size<=250 && cy+size>=-250 && cy-size<=250){
        const body=svg('g',{'data-body':b.id});body.append(svg('title',{},`${b.name} · ${b.kind} · radius ${number(b.radius)} km`),svg('circle',{cx,cy,r:Math.max(3,size),fill:b.color+'20',stroke:b.color,'stroke-width':1.5,'vector-effect':'non-scaling-stroke'}));
        body.append(svg('text',{x:Math.max(-238,Math.min(150,cx+Math.max(3,size)+9)),y:Math.max(-220,Math.min(230,cy-9)),fill:b.color,class:'sector-body-label'},b.name));layer.append(body);
      }else{
        const scale=225/Math.max(Math.abs(cx),Math.abs(cy)),bx=cx*scale,by=cy*scale;
        const marker=svg('g',{'data-body':b.id});marker.append(svg('circle',{cx:bx,cy:by,r:3,fill:'none',stroke:b.color}),svg('text',{x:bx+(bx>0?-8:8),y:by+(by<0?14:-9),'text-anchor':bx>0?'end':'start',fill:b.color,class:'sector-body-label'},`${b.name} · off chart`));layer.append(marker);
      }
    }
    layer.append(svg('circle',{cx:px(s.own),cy:py(s.own),r:(s.sensorRange??SENSOR_RANGE)/radius*250,fill:'#78cbd608',stroke:'#8cd3df','stroke-width':1.6,'stroke-dasharray':'5 4','vector-effect':'non-scaling-stroke'}));
    for(const h of sectorHazards){const slice=Math.sqrt(Math.max(0,h.radius**2-(h[plane==='top'?'z':'y']-origin[plane==='top'?'z':'y'])**2));if(!slice)continue;layer.append(svg('circle',{cx:px(h),cy:py(h),r:slice/radius*250,fill:'#f4777920',stroke:'#f47779'}));if(radius<=2500)layer.append(svg('text',{x:px(h)+8,y:py(h)-8,fill:'#f47779','font-size':9},h.name));}
    layer.append(svg('path',{d:`M${px({x:0,y:0,z:0})-5} ${py({x:0,y:0,z:0})}h10m-5-5v10`,stroke:'#d5b77c'}));
    const points=[s.own,...s.route];if(points.length>1)layer.append(svg('polyline',{points:points.map(p=>`${px(p)},${py(p)}`).join(' '),fill:'none',stroke:'#d5b77c','stroke-width':1.2}));
    s.route.forEach((p,i)=>layer.append(svg('circle',{cx:px(p),cy:py(p),r:4,fill:'#d5b77c'}),svg('text',{x:px(p)+8,y:py(p)-7,fill:'#e7cf9d','font-size':10},`${i+1} · Z ${p.z.toFixed(1)}`)));
    const path=predictedPath(s);
    layer.append(svg('polyline',{points:path.map(p=>`${px(p)},${py(p)}`).join(' '),fill:'none',stroke:'#90e6e7','stroke-dasharray':'4 4','stroke-width':1.3}));
    const liveIds=new Set(live.map(c=>c.id));trackList.replaceChildren();
    for(const [id,record] of Object.entries(s.memory)) {
      const current=liveIds.has(id),c=record.observed,p=record.position,age=Math.max(0,s.time-record.seen),color=current?contactTypes[c.type].color:'#78838d';
      const marker=svg('g',{transform:`translate(${px(p)} ${py(p)})`});
      const shape=c.type==='friendly'?svg('circle',{r:4}):c.type==='enemy'?svg('rect',{x:-4,y:-4,width:8,height:8}):svg('path',{d:c.type==='unknown'?'M0-5 5 0 0 5-5 0Z':'M0-5 5 5-5 5Z'});
      shape.setAttribute('fill',current?color:'none');shape.setAttribute('stroke',color);marker.append(shape);if(radius<=2500)marker.append(svg('text',{x:8,y:-7,fill:color,'font-size':9,class:'sector-contact-label'},`${c.trackLabel}${current?'':` · ${age.toFixed(0)}s old`}`));layer.append(marker);
      if(current){const future={...p};for(const key of ['x','y','z'])future[key]+=record.velocity[key]/60;layer.append(svg('path',{d:`M${px(p)} ${py(p)}L${px(future)} ${py(future)}`,stroke:color,'stroke-dasharray':'2 4',opacity:.6}));}
      trackList.append(el('li','',`${c.trackLabel} · ${current?'Live':`Last known ${age.toFixed(0)}s ago`} · Z ${p.z.toFixed(1)} km · ${c.ship.label}`));
    }
    const ship=svg('g',{transform:`translate(${px(s.own)} ${py(s.own)})`});ship.append(svg('circle',{r:7,fill:'#091a21',stroke:'#b3eff0'}),svg('path',{d:`M0 0L${s.facing.x*18} ${-s.facing[axis]*18}`,stroke:'#b3eff0','stroke-width':2}),svg('text',{x:11,y:16,fill:'#b3eff0','font-size':9},playerShipName(flight.combat).toUpperCase()));layer.append(ship);
    chart.append(svg('text',{x:-250,y:267,fill:'#9fbfc9','font-size':9},`CYAN: ${Math.round(s.sensorRange??SENSOR_RANGE)} KM SENSORS / PREDICTION · GOLD: PATROL · HOLLOW: LAST KNOWN`));
  }
  return {refresh};
}
