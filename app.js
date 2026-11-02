import { EPD_AU_PER_DAY, EDGE_AU, distance, at, mapPoint, unmapPoint, nearSol, routeDistance, advance } from './navigation.mjs';
import { createSettlements, settlementCallout, formatDistance, ARRIVAL_EPSILON_AU, STATION_SYMBOL_PATH } from './settlements.mjs';
import { miningCompanies, miningStations, MINING_SYMBOL_PATH } from './mining.mjs';
import { mountBridge } from './bridge.mjs';
import { createSave, parseSave, SAVE_STORAGE_KEY, LEGACY_SAVE_STORAGE_KEY } from './save-game.mjs';
import { mountSaves } from './save-ui.mjs';
import { mountStartMenu } from './start-menu.mjs';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const bodies = [
  { id:'mercury', name:'Mercury', au:.39, angle:165, color:'#a6a09a', radius:3.3, type:'TERRESTRIAL PLANET', description:'The innermost planet. A close approach to Sol calls for careful course planning.' },
  { id:'venus', name:'Venus', au:.72, angle:-115, color:'#d4b68b', radius:5, type:'TERRESTRIAL PLANET', description:'A brilliant, cloud-covered world inside Earth’s orbit. An inner-system patrol destination.' },
  { id:'earth', name:'Earth', au:1, angle:40, color:'#6fa9ba', radius:6.5, type:'TERRESTRIAL PLANET', description:'Home of Sol Command, with a large station on the Moon. Select the lunar station from Settlements or its map callout.' },
  { id:'mars', name:'Mars', au:1.52, angle:-45, color:'#c77d60', radius:4.8, type:'COLONIZED TERRESTRIAL PLANET', description:'Home to the Mars colony and a station on Phobos. Both locations are separate patrol destinations.' },
  { id:'jupiter', name:'Jupiter', au:5.2, angle:153, color:'#c4ab8b', radius:13, type:'GAS GIANT', description:'The Jovian system is served by an SDF station on Ganymede. Select its station callout to plan a visit.' },
  { id:'saturn', name:'Saturn', au:9.58, angle:24, color:'#cbbd91', radius:10, type:'RINGED GAS GIANT', description:'An SDF station on Titan anchors the Saturnian patrol region. Select the station to add it to your route.' },
  { id:'uranus', name:'Uranus', au:19.2, angle:-124, color:'#8abcc5', radius:8, type:'ICE GIANT', description:'An SDF station on Titania maintains the Uranian watch. Titania was selected as the larger of the two candidate moons.' },
  { id:'neptune', name:'Neptune', au:30.05, angle:-25, color:'#5f7eb4', radius:8, type:'ICE GIANT', description:'An SDF station on Triton serves this outer planetary region. Select the station to plan a Neptunian patrol.' },
  { id:'heliopause', name:'Heliopause station', au:120, angle:143, color:'#a6b9c5', radius:5, type:'OUTER PATROL OUTPOST · PROVISIONAL', description:'A provisional outpost at the 120 AU patrol boundary. A radial EPD journey from Sol takes about 32 days.' }
].map(body => ({ ...body, ...at(body.au, body.angle) }));
const settlements=createSettlements(bodies);
let directoryMode='planets';
let miningPage=0, miningCompany='all';
let bridgeConsole;
const earth = bodies.find(b => b.id === 'earth');
let state = { ship:{ x:earth.x, y:earth.y }, location:'Earth', route:[], active:false, paused:false, days:0, speed:1 };
let savedGame=null,saveLoadError=false,lastAutosave=0;
let startMenu,missionStarted=false,hasLegacyPatrol=false;
try{const json=localStorage.getItem(SAVE_STORAGE_KEY)||localStorage.getItem(LEGACY_SAVE_STORAGE_KEY);if(json){savedGame=parseSave(json);state=savedGame.navigation;}}catch{saveLoadError=true;}
try {
  const saved = savedGame?null:JSON.parse(localStorage.getItem('sdf-navigation-v1'));
  const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.hypot(p.x,p.y) <= EDGE_AU + .01;
  if (saved && validPoint(saved.ship) && Array.isArray(saved.route) && saved.route.length <= 12 && saved.route.every(p => validPoint(p) && typeof p.name === 'string') && Number.isFinite(saved.days) && saved.days >= 0) {
    hasLegacyPatrol=true;
    state = { ...state, ship:saved.ship, location:typeof saved.location === 'string' ? saved.location : 'Deep space', route:saved.route, days:saved.days, active:!!saved.active && saved.route.length > 0, paused:!!saved.active, speed:[1,10,100].includes(saved.speed) ? saved.speed : 1 };
  }
} catch { /* Storage may be disabled; the session remains fully playable. */ }
let selected = earth, zoom = 1, pan = {x:0,y:0}, logs = [], lastSave = 0, lastTime = 0, toastTimer, routePage = 0;
const pageSize = () => innerWidth < 600 && innerHeight < 640 ? 1 : 2;
let waypointsPerPage = pageSize();
const focusedConsole = matchMedia('(max-width: 980px), (max-height: 620px)');
const fmt = n => n.toFixed(2);
const formatETA = days => days < 1/24 ? `${Math.max(1,Math.round(days*1440))} min` : days < 1 ? `${(days*24).toFixed(1)} hrs` : `${days.toFixed(1)} days`;
function node(tag, attrs={}, text) { const el=document.createElementNS(NS,tag); for(const [key,value] of Object.entries(attrs)) el.setAttribute(key,value); if(text!==undefined) el.textContent=text; return el; }
function captureSave(){return createSave({navigation:state,bridge:bridgeConsole.exportState(),selection:selected,logs});}
function save() { if(!bridgeConsole||!missionStarted)return;try { localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(captureSave())); } catch { /* JSON downloads remain available when browser storage is disabled. */ } }
function toast(message) { $('toast').textContent=message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3500); }
function date() { return new Date(Date.UTC(2250,0,1)+state.days*86400000); }
function log(message) { logs.unshift({time:date().toISOString().slice(11,16),message}); logs=logs.slice(0,3); $('command-log').replaceChildren(...logs.map(item=>{const li=document.createElement('li');const time=document.createElement('time');time.textContent=item.time;const text=document.createElement('span');text.textContent=item.message;li.append(time,text);return li;})); }
function showView(view) {
  document.body.dataset.view=view;
  document.querySelectorAll('.console-tabs button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
}
function showScreen(screen){
  document.body.dataset.screen=screen;
  $('map-tab').classList.toggle('nav-active',screen==='map');
  $('bridge-button').classList.toggle('nav-active',screen==='bridge');
  document.querySelector('.page-heading h1').textContent=screen==='bridge'?'Command deck.':'The watch begins.';
  document.querySelector('.page-heading .eyebrow').textContent=screen==='bridge'?'SDF WAYFARER / MAIN BRIDGE':'SOL SECTOR / NAVIGATION';
  document.querySelector('.page-heading p').textContent=screen==='bridge'?'Ten stations. One command.':'One system. Our home. Your command.';
  if(screen==='bridge')bridgeConsole?.refresh();
}
function select(body, navigate=true) {
  selected=body;
  document.querySelectorAll('.planet-item,.planet-group,.facility-group').forEach(el=>{
    const isSelected=el.dataset.id===body.id;
    el.classList.toggle('selected',isSelected);
    el.setAttribute('aria-pressed',String(isSelected));
  });
  updateSelection(); renderTarget();
  if(navigate && focusedConsole.matches){showView('navigation');$('destination-name').setAttribute('tabindex','-1');$('destination-name').focus({preventScroll:true});}
}
function updateSelection() {
  $('destination-name').textContent=selected.name;
  $('destination-type').textContent=selected.type;
  $('destination-description').textContent=selected.description;
  $('contract-info').hidden=selected.kind!=='mining';
  $('destination-orb').style.background=`radial-gradient(circle at 30% 25%, ${selected.color}, ${selected.color} 15%, #101a2b 90%)`;
  $('destination-au').textContent=`${fmt(Math.hypot(selected.x,selected.y))} AU`;
  const d=distance(state.ship,selected);
  $('destination-distance').textContent=formatDistance(d);
  $('destination-eta').textContent=d<ARRIVAL_EPSILON_AU?'At destination':formatETA(d/EPD_AU_PER_DAY);
  const origin=state.route.at(-1)||state.ship;
  const duplicate=distance(origin,selected)<ARRIVAL_EPSILON_AU;
  $('add-waypoint').disabled=state.active || duplicate || state.route.length>=12;
  $('selection-note').textContent=state.active?'Flight plan locked during transit.':duplicate?(state.route.length?'Already the last waypoint.':'Choose another destination to plot a course.'):state.route.length>=12?'Maximum 12 waypoints per flight plan.':d<.01?'Local transfer · nominal EPD estimate':'Direct transit estimate · 3.8 AU/day';
}
function routeUnsafe() { let previous=state.ship;return state.route.some(point=>{const unsafe=nearSol(previous,point);previous=point;return unsafe;}); }
function renderTarget() {
  const p=mapPoint(selected);const group=$('target-marker');group.replaceChildren();
  if(selected.id.startsWith('grid-')) { group.append(node('path',{d:`M${p.x-10} ${p.y-5}v-5h5 M${p.x+5} ${p.y-10}h5v5 M${p.x+10} ${p.y+5}v5h-5 M${p.x-5} ${p.y+10}h-5v-5`,stroke:'#c9aa73','stroke-width':1,fill:'none'}),node('text',{x:p.x+16,y:p.y+3,class:'planet-label'},selected.name)); }
}
function segmentPath(a,b) { const steps=64;return Array.from({length:steps+1},(_,i)=>{const f=i/steps,p=mapPoint({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f});return `${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;}).join(' '); }
function renderRoutes() {
  const group=$('routes');group.replaceChildren();let previous=state.ship;
  state.route.forEach((point,i)=>{const p=mapPoint(point);group.append(node('path',{d:segmentPath(previous,point),class:`route-line ${state.active?'active':''} ${nearSol(previous,point)?'unsafe':''}`}));group.append(node('circle',{cx:p.x,cy:p.y,r:11,class:'waypoint-dot'}),node('text',{x:p.x,y:p.y+3,'text-anchor':'middle',fill:'#d5b77c','font-size':8,'font-family':'monospace'},i+1));previous=point;});
  const p=mapPoint(state.ship);$('ship-marker').setAttribute('transform',`translate(${p.x} ${p.y})`);
}
function renderPlan() {
  const list=$('waypoint-list');list.replaceChildren();
  const pages=Math.max(1,Math.ceil(state.route.length/waypointsPerPage));
  routePage=Math.max(0,Math.min(routePage,pages-1));
  const start=routePage*waypointsPerPage;
  state.route.slice(start,start+waypointsPerPage).forEach((point,index)=>{
    const i=start+index, previous=i===0?state.ship:state.route[i-1];
    const row=document.createElement('div');row.className='waypoint-row';const number=document.createElement('span');number.className='waypoint-number';number.textContent=String(i+1).padStart(2,'0');
    const info=document.createElement('div');const name=document.createElement('span');name.textContent=point.name;const detail=document.createElement('small');detail.textContent=`${formatDistance(distance(previous,point))} · ${formatETA(distance(previous,point)/EPD_AU_PER_DAY)}`;info.append(name,detail);
    const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label',`Remove ${point.name} waypoint`);remove.disabled=state.active;remove.onclick=()=>{state.route.splice(i,1);renderPlan();save();};row.append(number,info,remove);list.append(row);
  });
  $('waypoint-pagination').hidden=pages===1;
  $('waypoint-page').textContent=`${start+1}–${Math.min(start+waypointsPerPage,state.route.length)} of ${state.route.length}`;
  $('previous-waypoints').disabled=routePage===0;
  $('next-waypoints').disabled=routePage===pages-1;
  $('empty-course').hidden=state.route.length>0;
  $('waypoint-count').textContent=`${String(state.route.length).padStart(2,'0')} WAYPOINT${state.route.length===1?'':'S'}`;
  $('clear-course').disabled=!state.route.length||state.active;
  const unsafe=routeUnsafe();
  $('engage-button').disabled=(!state.route.length||unsafe||bridgeConsole?.localStatus().canEPD===false)&&!state.active;
  $('engage-button').firstElementChild.textContent=state.active?'Abort transit':'Engage EPD';
  $('engage-button').lastElementChild.textContent=state.active?'■':'↗';
  $('safety-message').textContent=unsafe?'Course crosses Sol’s safety zone. Add a detour waypoint.':'';
  $('map-hint').textContent=state.active?'EPD engaged · Use time controls to advance your patrol':state.route.length?'Course plotted · Engage EPD when ready':'Select a destination to begin your patrol';
  updateTelemetry();renderRoutes();updateSelection();
}
function updateTelemetry() {
  const d=routeDistance(state.ship,state.route);
  const [distanceValue,distanceUnit]=formatDistance(d).split(' ');
  $('total-distance').replaceChildren(document.createTextNode(`${distanceValue} `),Object.assign(document.createElement('small'),{textContent:distanceUnit}));
  $('total-eta').textContent=state.route.length?formatETA(d/EPD_AU_PER_DAY):'—';
  const firstLeg=$('waypoint-list').querySelector('.waypoint-row small');
  if(firstLeg && state.route.length && routePage===0){const leg=distance(state.ship,state.route[0]);firstLeg.textContent=`${formatDistance(leg)} · ${formatETA(leg/EPD_AU_PER_DAY)}`;}
  const dt=date();const day=String(dt.getUTCDate()).padStart(2,'0'),month=dt.toLocaleString('en',{month:'short',timeZone:'UTC'}).toUpperCase();
  $('stardate').replaceChildren(document.createTextNode(`${day} ${month} ${dt.getUTCFullYear()} `),Object.assign(document.createElement('span'),{textContent:dt.toISOString().slice(11,16)}));
  const local=bridgeConsole?.localStatus();
  if(local){
    const percent=Math.ceil(local.hull*100);document.querySelector('.readiness strong').replaceChildren(document.createTextNode(String(percent)),Object.assign(document.createElement('span'),{textContent:'%'}));
    document.querySelector('.readiness-bar span').style.width=`${percent}%`;document.querySelector('.readiness > span').textContent='HULL INTEGRITY';
    const systems=document.querySelectorAll('.systems b');systems[0].textContent=local.core?'ONLINE':'OFFLINE';systems[1].textContent=local.canEPD?'AVAILABLE':'UNAVAILABLE';
    document.querySelector('.page-footer > span:first-child').textContent=percent===0?'SHIP LOST':percent<100?'DAMAGE CONTROL ACTIVE':'ALL SYSTEMS OPERATIONAL';
    $('engage-button').disabled=!state.active&&(!state.route.length||routeUnsafe()||!local.canEPD);
  }
  $('ship-status').textContent=state.active?`En route to ${state.route[0].name}`:local?.running?`Local flight near ${state.location}`:`Holding at ${state.location}`;
  $('clock-state').textContent=state.active?(state.paused?'TRANSIT PAUSED':'PATROL IN PROGRESS'):local?.running?'LOCAL FLIGHT IN PROGRESS':local?.time?'LOCAL FLIGHT PAUSED':'AWAITING ORDERS';
  $('simulation-status').textContent=state.active?(state.paused?'Paused':`Transit · ${state.speed}×`):'Standby';
  $('pause-button').textContent=state.paused?'▶':'Ⅱ';
  $('pause-button').disabled=!state.active;
  document.querySelectorAll('.speed').forEach(el=>el.classList.toggle('active',Number(el.dataset.speed)===state.speed));
  bridgeConsole?.refresh();
}
function buildMap() {
  let seed=2250;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<250;i++) $('stars').append(node('circle',{cx:random()*1700-850,cy:random()*1500-750,r:random()>.95?1.2:.5,fill:'#c5d1e0',opacity:.1+random()*.35}));
  for(let i=-10;i<=10;i++){if(i===0)continue;$('orbits').append(node('text',{x:i*50+3,y:12,class:'map-grid-label'},`${i>0?'+':''}${i}`),node('text',{x:4,y:i*50-4,class:'map-grid-label'},`${i<0?'+':''}${-i}`));}
  for(const body of bodies) {
    const p=mapPoint(body),r=Math.hypot(p.x,p.y);
    $('orbits').append(node('circle',{r,fill:'none',stroke:body.au===120?'#92b5c9':'#8ca9c2','stroke-width':body.au===120?1.4:1.1,opacity:body.au===120?.8:.7,'vector-effect':'non-scaling-stroke','stroke-dasharray':body.au===120?'3 7':'none'}));
    const g=node('g',{class:`planet-group ${body.id==='heliopause'?'outpost':''}`,'data-id':body.id,transform:`translate(${p.x} ${p.y})`,role:'button',tabindex:'0','aria-label':`Select ${body.name}, ${body.au} AU from Sol`});
    const grad=node('radialGradient',{id:`planet-${body.id}`,cx:'28%',cy:'25%',r:'80%'});grad.append(node('stop',{offset:'0%','stop-color':body.color}),node('stop',{offset:'40%','stop-color':body.color}),node('stop',{offset:'100%','stop-color':'#14202c'}));document.querySelector('defs').append(grad);
    g.append(node('circle',{r:Math.max(20,body.radius+10),fill:'transparent'}),node('circle',{r:body.radius+6,class:'selection-ring','stroke-dasharray':'3 3'}));
    if(body.id==='saturn')g.append(node('ellipse',{rx:23,ry:7,fill:'none',stroke:'#a99e7e','stroke-width':3,opacity:.55,transform:'rotate(-25)'}));
    if(body.id==='heliopause')g.append(node('path',{d:STATION_SYMBOL_PATH,class:'facility-symbol'}));
    else g.append(node('circle',{r:body.radius,fill:`url(#planet-${body.id})`}));
    if(body.id==='earth')g.append(node('path',{d:'M-4-3-1-4 2-2 0 1-2 0-1 4-3 2Z',fill:'#a0af87',opacity:.75}));
    if(body.id==='jupiter')g.append(node('path',{d:'M-10-5Q0-2 11-4M-12 2Q0 5 12 2M-8 8Q0 9 8 7',fill:'none',stroke:'#806b5d','stroke-width':2,opacity:.6}));
    const labelX=body.radius+12;
    g.append(node('text',{x:labelX,y:1,class:'planet-label'},body.name),node('text',{x:labelX,y:14,class:'planet-sublabel'},body.id==='earth'?'SOL COMMAND':`${body.au.toFixed(body.au<2?2:1)} AU`));
    g.onclick=e=>{e.stopPropagation();if(!moved)select(body);};g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(body);}};$('bodies').append(g);
  }
  buildSettlements();
  buildMiningStations();
  $('heliopause-icon-path').setAttribute('d',STATION_SYMBOL_PATH);
  $('company-filter').append(...miningCompanies.map(company=>Object.assign(document.createElement('option'),{value:company.id,textContent:company.name})));
  renderDirectory();
  for(let i=0;i<350;i++) {const au=2.2+random()*1.1,p=mapPoint(at(au,random()*360));$('asteroids').append(node('circle',{cx:p.x,cy:p.y,r:random()*.85+.55,fill:'#d9bd8f',opacity:.4+random()*.35}));}
  for(let i=0;i<160;i++){const p=mapPoint(at(32+random()*15,random()*360));$('asteroids').append(node('circle',{cx:p.x,cy:p.y,r:.55,fill:'#8298b6',opacity:.22}));}
  const belt=mapPoint(at(2.8,0));$('orbits').append(node('text',{x:0,y:Math.hypot(belt.x,belt.y)-9,'text-anchor':'middle',class:'orbit-label'},'A S T E R O I D  B E L T'));
  $('orbits').append(node('text',{x:0,y:451,'text-anchor':'middle',class:'orbit-label'},'H E L I O P A U S E  /  1 2 0  A U'));
  $('ship-marker').append(node('circle',{r:12,fill:'#79d7e0',opacity:.07}),node('path',{d:'M0-8 5 6 0 3-5 6Z',fill:'#92e1e7',stroke:'#d4faff','stroke-width':.5,transform:'rotate(25)'}),node('text',{x:14,y:-13,class:'ship-label'},'SDF WAYFARER'));
}
function renderDirectory(){
  const mining=directoryMode==='mining';
  const entries=mining?miningStations.filter(site=>miningCompany==='all'||site.companyId===miningCompany):directoryMode==='settlements'?settlements:bodies.filter(body=>body.id!=='heliopause');
  const pages=Math.max(1,Math.ceil(entries.length/4));
  miningPage=Math.max(0,Math.min(miningPage,pages-1));
  const visible=mining?entries.slice(miningPage*4,miningPage*4+4):entries;
  $('directory-count').textContent=String(entries.length).padStart(2,'0');
  $('ship-panel').classList.toggle('mining-directory',mining);
  $('mining-filter').hidden=!mining;
  $('directory-pagination').hidden=!mining||pages===1;
  $('directory-page').textContent=`${miningPage+1} / ${pages}`;
  $('directory-previous').disabled=miningPage===0;
  $('directory-next').disabled=miningPage===pages-1;
  $('planet-directory').classList.toggle('settlement-directory',directoryMode!=='planets');
  $('planet-directory').replaceChildren(...visible.map(body=>{
    const button=document.createElement('button');button.className=`planet-item ${body.kind?'site-item':''}`;
    button.dataset.id=body.id;button.style.setProperty('--planet-color',body.color);
    button.classList.toggle('selected',body.id===selected.id);
    const marker=document.createElement('span');marker.className=`mini-planet ${body.kind||''}`;
    const name=document.createElement('span');name.className='directory-name';name.textContent=body.name;
    const detail=document.createElement('span');detail.textContent=body.companyCode||body.parentName||`${body.au.toFixed(body.au<2?2:1)} AU`;
    button.title=body.companyName?`${body.name} · ${body.companyName}`:body.parentName?`${body.name} · ${body.parentName}${body.size==='large'?' · Large station':''}`:body.name;
    button.setAttribute('aria-label',body.companyName?`${body.name}, ${body.companyName}`:body.parentName?`${body.name}, ${body.parentName}`:`${body.name} ${body.au.toFixed(body.au<2?2:1)} AU`);
    button.append(marker,name,detail);button.onclick=()=>select(body);return button;
  }));
}
function buildSettlements(){
  for(const site of settlements){
    const {x,y,origin,radius,sweep}=settlementCallout(site,bodies);
    const g=node('g',{class:`facility-group ${site.kind}`,'data-id':site.id,role:'button',tabindex:0,'aria-label':`Select ${site.name}, ${site.parentName}`});
    g.append(node('path',{d:`M${origin.x} ${origin.y}A${radius} ${radius} 0 0 ${sweep>0?1:0} ${x} ${y}`,class:'facility-leader'}));
    const marker=node('g',{transform:`translate(${x} ${y})`});
    marker.append(node('circle',{r:13,fill:'transparent'}),node('circle',{r:13,class:'selection-ring','stroke-dasharray':'3 3'}));
    if(site.kind==='colony')marker.append(node('path',{d:'M-7-5H7V7H-7ZM-10-5 0-12 10-5',class:'facility-symbol'}));
    else marker.append(node('path',{d:STATION_SYMBOL_PATH,class:`facility-symbol ${site.size==='large'?'large-station':''}`,transform:site.size==='large'?'scale(1.25)':'scale(1)'}));
    const labelX=x<0?-18:18, anchor=x<0?'end':'start';
    marker.append(node('text',{x:labelX,y:-10,'text-anchor':anchor,class:'facility-label'},site.name),node('text',{x:labelX,y:4,'text-anchor':anchor,class:'facility-caption'},site.kind==='colony'?'SURFACE COLONY':site.size==='large'?'LARGE LUNAR STATION':`${site.parentName.toUpperCase()} · MOON STATION`));
    g.append(marker);g.onclick=e=>{e.stopPropagation();if(!moved)select(site);};g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(site);}};
    $('settlements').append(g);
  }
}
function buildMiningStations(){
  for(const site of miningStations){
    const p=mapPoint(site);
    const g=node('g',{class:'facility-group mining','data-id':site.id,transform:`translate(${p.x} ${p.y})`,role:'button',tabindex:0,'aria-label':`Select ${site.name}, ${site.companyName}`});
    g.style.setProperty('--mine-color',site.color);
    g.append(node('circle',{r:16,fill:'transparent'}),node('circle',{r:14,class:'selection-ring','stroke-dasharray':'3 3'}),node('path',{d:MINING_SYMBOL_PATH,class:'mining-symbol'}));
    const x=p.x<0?-19:19, anchor=p.x<0?'end':'start';
    g.append(node('text',{x,y:-13,'text-anchor':anchor,class:'facility-label'},site.name),node('text',{x,y:2,'text-anchor':anchor,class:'facility-caption'},`${site.companyCode} · UNE MINING`));
    g.onclick=e=>{e.stopPropagation();if(!moved)select(site);};g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(site);}};
    $('mining-stations').append(g);
  }
}
function updateView(){ $('map-world').setAttribute('transform',`translate(${pan.x} ${pan.y}) scale(${zoom})`); }
function zoomBy(factor){zoom=Math.min(4,Math.max(.65,zoom*factor));updateView();}
function resetView(){zoom=1;pan={x:0,y:0};updateView();}
const svg=$('solar-map');
function mapCoords(event){const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform($('map-world').getScreenCTM().inverse());}
let dragging=null, moved=false;
svg.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging={x:e.clientX,y:e.clientY,pan:{...pan}};moved=false;});
svg.addEventListener('pointermove',e=>{
  const p=mapCoords(e),au=unmapPoint(p);$('cursor-coord').textContent=`X ${au.x>=0?'+':''}${fmt(au.x)} / Y ${au.y<=0?'+':''}${fmt(-au.y)} AU`;
  if(dragging){const dx=e.clientX-dragging.x,dy=e.clientY-dragging.y;if(Math.hypot(dx,dy)>5){moved=true;const matrix=svg.getScreenCTM();pan={x:dragging.pan.x+dx/matrix.a,y:dragging.pan.y+dy/matrix.d};updateView();}}
});
window.addEventListener('pointerup',()=>{dragging=null;});
svg.addEventListener('click',e=>{if(moved||e.target.closest('.planet-group,.facility-group'))return;const p=unmapPoint(mapCoords(e));const au=Math.hypot(p.x,p.y);if(au>EDGE_AU){toast('Choose a point within the 120 AU patrol boundary.');return;}if(au<.18){toast('Sol safety exclusion: choose a point farther from the Sun.');return;}select({id:`grid-${p.x.toFixed(3)}-${p.y.toFixed(3)}`,name:`Grid ${p.x>=0?'+':''}${p.x.toFixed(1)}, ${p.y<=0?'+':''}${(-p.y).toFixed(1)}`,type:'CUSTOM PATROL WAYPOINT',description:'An open-space navigation fix. Add this point to build a patrol route or steer safely around Sol.',color:'#cdb27e',...p});});
svg.addEventListener('wheel',e=>{e.preventDefault();zoomBy(e.deltaY<0?1.1:1/1.1);},{passive:false});
$('zoom-in').onclick=()=>zoomBy(1.25);$('zoom-out').onclick=()=>zoomBy(.8);$('recenter').onclick=resetView;$('reset-view').onclick=resetView;
$('edge-button').onclick=()=>select(bodies.at(-1));
for(const mode of ['planets','settlements','mining'])$(`directory-${mode}`).onclick=()=>{
  directoryMode=mode;
  for(const item of ['planets','settlements','mining'])$(`directory-${item}`).setAttribute('aria-pressed',String(item===mode));
  renderDirectory();
};
$('company-filter').onchange=()=>{miningCompany=$('company-filter').value;miningPage=0;renderDirectory();};
$('directory-previous').onclick=()=>{miningPage--;renderDirectory();};
$('directory-next').onclick=()=>{miningPage++;renderDirectory();};
$('contract-info').onclick=()=>{
  if(selected.kind!=='mining')return;
  $('contract-station').textContent=selected.name;
  $('contract-owner').textContent=selected.companyName;
  $('contract-issuer').textContent=selected.contract.issuer;
  $('contract-number').textContent=selected.contract.id;
  $('contract-status').textContent=selected.contract.status;
  $('contract-dialog').showModal();
};
for(const id of ['close-contract','return-navigation'])$(id).onclick=()=>$('contract-dialog').close();
$('contract-dialog').addEventListener('click',event=>{if(event.target!==event.currentTarget)return;const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();});
document.querySelectorAll('.console-tabs button').forEach(button=>button.onclick=()=>showView(button.dataset.view));
$('previous-waypoints').onclick=()=>{routePage--;renderPlan();};
$('next-waypoints').onclick=()=>{routePage++;renderPlan();};
$('add-waypoint').onclick=()=>{
  if(state.active||state.route.length>=12)return;
  const origin=state.route.at(-1)||state.ship;if(distance(origin,selected)<ARRIVAL_EPSILON_AU){toast('This destination is already the last waypoint.');return;}
  state.route.push({...selected});routePage=Math.floor((state.route.length-1)/waypointsPerPage);log(`Course updated: ${selected.name}.`);renderPlan();save();
};
$('clear-course').onclick=()=>{if(state.active)return;state.route=[];log('Flight plan cleared.');renderPlan();save();};
$('engage-button').onclick=()=>{
  if(state.active){state.active=false;state.paused=false;state.location='deep space';bridgeConsole?.arrive(state.location);log('EPD disengaged. Vector Drive ready.');toast('Transit aborted. Remaining waypoints retained.');}
  else {if(!state.route.length||routeUnsafe())return;if(bridgeConsole?.localStatus().canEPD===false){toast('EPD unavailable: check Engineering or undock.');return;}bridgeConsole?.suspendLocal();state.active=true;state.paused=false;log(`EPD engaged. Destination: ${state.route[0].name}.`);toast('Course confirmed. Electromagnetic Pulse Drive engaged.');}
  renderPlan();save();
  if(state.active && focusedConsole.matches && document.body.dataset.screen!=='bridge'){showView('map');svg.focus({preventScroll:true});}
};
$('pause-button').onclick=()=>{if(!state.active)return;state.paused=!state.paused;updateTelemetry();save();};
document.querySelectorAll('.speed').forEach(button=>button.onclick=()=>{state.speed=Number(button.dataset.speed);updateTelemetry();save();});
for(const id of ['briefing-button','about-button'])$(id).onclick=()=>$('briefing-dialog').showModal();
$('map-tab').onclick=()=>{showScreen('map');showView('map');resetView();svg.focus({preventScroll:true});};
$('bridge-button').onclick=()=>{bridgeConsole.selectStation('command');showScreen('bridge');};
document.querySelectorAll('.briefing-tabs button').forEach(button=>button.onclick=()=>{
  $('briefing-mission').hidden=button.dataset.briefing!=='mission';
  $('briefing-details').hidden=button.dataset.briefing!=='details';
  document.querySelectorAll('.briefing-tabs button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
});
for(const id of ['close-dialog','begin-button'])$(id).onclick=()=>$('briefing-dialog').close();
function newPatrol(){
  missionStarted=true;
  state={ship:{x:earth.x,y:earth.y},location:'Earth',route:[],active:false,paused:false,days:0,speed:1};
  bridgeConsole?.resetPatrol();
  logs=[];routePage=0;log('New patrol initialized. Holding at Earth.');select(earth,false);showScreen('map');showView('map');resetView();renderPlan();save();$('briefing-dialog').close();toast('Patrol reset. Ready for your orders, Captain.');
}
$('restart-patrol').onclick=newPatrol;
$('briefing-dialog').addEventListener('click',e=>{if(e.target===$('briefing-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
document.addEventListener('visibilitychange',()=>{lastTime=0;save();});
window.addEventListener('pagehide',save);
window.addEventListener('resize',()=>{
  const size=pageSize();
  if(size!==waypointsPerPage){const first=routePage*waypointsPerPage;waypointsPerPage=size;routePage=Math.floor(first/size);renderPlan();}
});
function frame(time){
  const elapsed=lastTime?Math.min((time-lastTime)/1000,.25):0;lastTime=time;
  if(startMenu?.isOpen()){requestAnimationFrame(frame);return;}
  if(state.active&&!state.paused&&elapsed){
    const available=elapsed*.08*state.speed;
    const days=Math.min(available,routeDistance(state.ship,state.route)/EPD_AU_PER_DAY);
    if(bridgeConsole?.advanceTransit(days*86400)===false){state.active=false;state.paused=false;state.location='deep space';bridgeConsole.arrive(state.location);renderPlan();save();toast('Ship lost during transit. Load a save or restart patrol.');requestAnimationFrame(frame);return;}
    const result=advance(state.ship,state.route,days*EPD_AU_PER_DAY);state.ship={x:result.position.x,y:result.position.y};state.days+=days;
    if(result.reached){const reached=state.route.splice(0,result.reached);for(const point of reached)log(`Arrived: ${point.name}.`);state.location=reached.at(-1).name;if(!state.route.length){state.active=false;state.paused=false;bridgeConsole?.arrive(state.location);toast(`Patrol leg complete. Vector Drive ready at ${state.location}.`);}renderPlan();save();}
    else if(time-lastSave>120){updateTelemetry();updateSelection();renderRoutes();lastSave=time;}
  }
  if(!state.active&&elapsed){const seconds=bridgeConsole?.tick(elapsed)||0;if(seconds){state.days+=seconds/86400;if(time-lastSave>350){updateTelemetry();lastSave=time;}}}
  if(time-lastAutosave>=2000){save();lastAutosave=time;}
  requestAnimationFrame(frame);
}
new ResizeObserver(entries=>{
  const {width,height}=entries[0].contentRect;
  if(!width||!height)return;
  const scale=Math.min(width/1080,height/1000);
  svg.style.setProperty('--chart-label-size',`${Math.max(14,10/scale)}px`);
  svg.style.setProperty('--chart-small-size',`${Math.max(8,6/scale)}px`);
}).observe($('map-surface'));
bridgeConsole=mountBridge({
  snapshot:()=>({shipName:'SDF Wayfarer',location:state.location,days:state.days,canEPD:bridgeConsole?.localStatus().canEPD!==false,active:state.active,paused:state.paused,routeCount:state.route.length,nextWaypoint:state.route[0]?.name||'',unsafe:routeUnsafe(),distance:formatDistance(routeDistance(state.ship,state.route)),eta:state.route.length?formatETA(routeDistance(state.ship,state.route)/EPD_AU_PER_DAY):'Awaiting course',targetName:selected.name}),
  openNavigation:()=>{showScreen('map');showView('navigation');},
  engage:()=>{if(!state.active)$('engage-button').click();},
  pause:()=>{if(state.active)$('pause-button').click();},
  abort:()=>{if(state.active)$('engage-button').click();},
  log,onLocalChange:()=>{updateTelemetry();save();},onSave:save,savedGame:savedGame?.bridge
});
function restoredSelection(point){return [...bodies,...settlements,...miningStations].find(body=>body.id===point?.id)||point||earth;}
function restoreSave(game){
  missionStarted=true;
  state=game.navigation;selected=restoredSelection(game.selection);logs=game.logs.map(item=>({...item}));routePage=0;lastTime=0;
  bridgeConsole.restoreState(game.bridge);select(selected,false);renderPlan();
  const station=game.bridge.settings.selected;showScreen(['navigation','helm','tactical','engineering'].includes(station)?'bridge':'map');showView('map');
  log('JSON save restored. Flight paused.');save();toast('Save loaded. Strategic and local flight are paused.');
  startMenu?.enter();
}
mountSaves({capture:captureSave,restore:restoreSave});
buildMap();select(restoredSelection(savedGame?.selection),false);renderPlan();
if(savedGame){logs=savedGame.logs;log('Autosave restored. Flight paused.');}
else{log(state.active?'Saved journey restored. Transit paused.':'Sol Command link established.');log('Captain on deck. Awaiting orders.');}
if(saveLoadError)toast('Browser save could not be restored. You can load a JSON backup from Saves.');
startMenu=mountStartMenu({
  hasPatrol:()=>missionStarted||!!savedGame||hasLegacyPatrol,
  summary:()=>`${state.location} · ${date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'})} · flight paused`,
  onPause:()=>{if(state.active)state.paused=true;bridgeConsole.pauseLocal();lastTime=0;updateTelemetry();save();},
  onEnter:()=>{missionStarted=true;lastTime=0;save();},
  onNewMission:newPatrol
});
requestAnimationFrame(frame);
