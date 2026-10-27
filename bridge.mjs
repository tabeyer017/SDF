import { bridgeStations, restoreBridgeState, flightControlState } from './bridge-model.mjs';

export function mountBridge({snapshot,openNavigation,engage,pause,abort,log}) {
  const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  const svg=(tag,attrs={},text)=>{const el=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);if(text!==undefined)el.textContent=text;return el;};
  let saved;
  try{saved=JSON.parse(localStorage.getItem('sdf-bridge-v1'));}catch{}
  const state=restoreBridgeState(saved);
  let notice='All stations report ready for the patrol watch.',lastReview=null;
  const compact=matchMedia('(max-width: 650px)');
  const save=()=>{try{localStorage.setItem('sdf-bridge-v1',JSON.stringify(state));}catch{}};
  function report(text){notice=text;log(text);refresh();}
  function select(id){
    if(!bridgeStations.some(station=>station.id===id))return;
    state.selected=id;save();renderControls();refresh();
    if(compact.matches)$('bridge-console').dataset.view='station';
    updateViewButton();
  }
  function updateViewButton(){ $('bridge-view-toggle').textContent=$('bridge-console').dataset.view==='deck'?'Station console ↗':'Deck view ↗'; }
  function action(label,callback,disabled=false){const button=document.createElement('button');button.textContent=label;button.className='bridge-action';button.disabled=disabled;button.onclick=callback;return button;}
  function choice(label,key,options){
    const wrapper=document.createElement('label');wrapper.className='bridge-setting';
    const caption=document.createElement('span');caption.textContent=label;
    const select=document.createElement('select');select.setAttribute('aria-label',label);
    select.append(...options.map(([value,text])=>Object.assign(document.createElement('option'),{value,textContent:text})));
    select.value=String(state[key]);select.onchange=()=>{state[key]=select.value;save();report(`${label}: ${select.selectedOptions[0].textContent}.`);};wrapper.append(caption,select);return wrapper;
  }
  function setWatch(){state.watch=state.watch==='routine'?'heightened':'routine';save();renderControls();report(`Command: ${state.watch==='routine'?'routine':'heightened'} watch set.`);}
  function renderControls(){
    const controls=$('bridge-actions');controls.replaceChildren();const s=snapshot(),flight=flightControlState(s);
    switch(state.selected){
      case 'command':
        controls.append(choice('Command seat','seat',[['captain','Captain'],['first-officer','First officer']]),action(state.watch==='routine'?'Set heightened watch':'Return to routine watch',setWatch));break;
      case 'helm':
        controls.append(action('Engage plotted course',engage,!flight.canEngage),action(s.paused?'Resume transit':'Pause transit',pause,!flight.canPause),action('Abort transit / hold position',abort,!flight.canAbort));break;
      case 'navigation':controls.append(action('Open course planner ↗',openNavigation));break;
      case 'ops':controls.append(choice('Duty priority','ops',[['balanced','Balanced operations'],['sensors','Sensor coordination'],['engineering','Engineering readiness']]));break;
      case 'tactical':case 'security':controls.append(action(state.watch==='routine'?'Set heightened watch':'Return to routine watch',setWatch));break;
      case 'science':
        controls.append(choice('Sensor assignment','sensor',[['navigation','Navigation support'],['long-range','Long-range watch'],['planetary','Planetary review']]),action('Review selected destination',()=>{const current=snapshot();lastReview=current.targetName;report(`Science: catalog reviewed for ${current.targetName}.`);}));break;
      case 'communications':controls.append(action('Log patrol status report',()=>{const current=snapshot();report(`Comms report: ${current.active?`in transit to ${current.nextWaypoint}`:`holding at ${current.location}`}; ${current.routeCount} waypoints remaining.`);}));break;
      case 'engineering':controls.append(action('Run readiness check',()=>{const current=snapshot();report(`Engineering: core and dampeners nominal. ${current.unsafe?'Navigation reports a solar exclusion conflict.':current.routeCount?'Plotted flight plan available.':'Awaiting a flight plan.'}`);}));break;
      case 'environment':{
        const wrapper=document.createElement('label');wrapper.className='bridge-setting';const caption=document.createElement('span');caption.textContent='Habitat temperature';
        const select=document.createElement('select');select.setAttribute('aria-label','Habitat temperature');
        for(let temperature=18;temperature<=25;temperature++)select.append(Object.assign(document.createElement('option'),{value:String(temperature),textContent:`${temperature} °C`}));
        select.value=String(state.temperature);select.onchange=()=>{state.temperature=Number(select.value);save();report(`Life support: habitat setpoint ${state.temperature} °C.`);};wrapper.append(caption,select);controls.append(wrapper);break;
      }
    }
  }
  function readouts(s){
    const watch=state.watch==='routine'?'Routine watch':'Heightened watch';
    switch(state.selected){
      case 'command':return [['Command seat',state.seat==='captain'?'Captain':'First officer'],['Watch condition',watch],['Vessel',s.shipName],['Patrol status',s.active?`To ${s.nextWaypoint}`:`At ${s.location}`]];
      case 'helm':return [['EPD drive',s.active?(s.paused?'Transit paused':'In transit'):'Standby'],['Next waypoint',s.nextWaypoint||'None plotted'],['Remaining distance',s.distance],['Transit estimate',s.eta]];
      case 'ops':return [['Duty priority',{balanced:'Balanced',sensors:'Sensor coordination',engineering:'Engineering readiness'}[state.ops]],['Ship resources','Nominal'],['Power distribution','Nominal'],['Flight plan',`${s.routeCount} waypoints`]];
      case 'navigation':return [['Chart reference','Heliocentric / Sol'],['Selected destination',s.targetName],['Flight plan',`${s.routeCount} waypoints`],['Course safety',s.unsafe?'Detour required':'Clear of Sol exclusion']];
      case 'tactical':return [['Watch condition',watch],['Weapons posture','Safed'],['Defensive protection','Shielding secure'],['Fire-control target','None designated']];
      case 'security':return [['Watch condition',watch],['Internal security','Standing watch'],['Local threat report','No contacts assigned'],['Protective systems','Secure']];
      case 'science':return [['Sensor assignment',{navigation:'Navigation support','long-range':'Long-range watch',planetary:'Planetary review'}[state.sensor]],['Selected target',s.targetName],['Catalog review',lastReview||'Awaiting review'],['Anomaly research','No data assigned']];
      case 'communications':return [['Sol Command link','Established'],['Patrol authority','United Nations of Earth'],['Channel','Patrol operations'],['Hailing target',s.targetName]];
      case 'engineering':return [['Cold fusion core','Online'],['EPD propulsion',s.active?'Engaged':'Standby'],['Inertial dampeners','Active'],['Power / damage control','Nominal']];
      case 'environment':return [['Cabin temperature',`${state.temperature} °C`],['Atmosphere setpoint','101 kPa'],['Artificial gravity','1.0 g'],['Air / waste processing','Nominal']];
      default:return [];
    }
  }
  let lastControlKey='';
  function refresh(){
    const s=snapshot(),station=bridgeStations.find(item=>item.id===state.selected);
    const controlKey=[state.selected,state.watch,s.active,s.paused,s.routeCount,s.unsafe].join('|');
    if(controlKey!==lastControlKey){lastControlKey=controlKey;renderControls();}
    $('bridge-station-select').value=station.id;
    $('bridge-station-name').textContent=station.name;
    $('bridge-station-group').textContent=station.group;
    $('bridge-station-summary').textContent=station.summary;
    $('bridge-station-detail').style.setProperty('--station-color',station.color);
    $('bridge-watch').textContent=state.watch==='routine'?'ROUTINE WATCH':'HEIGHTENED WATCH';
    $('bridge-watch').classList.toggle('heightened',state.watch==='heightened');
    $('bridge-duty-seat').textContent=state.seat==='captain'?'CAPTAIN HAS THE CONN':'FIRST OFFICER HAS THE CONN';
    $('bridge-main-display').textContent=s.active?`TRANSIT TO ${s.nextWaypoint.toUpperCase()}`:'SOL SYSTEM / PATROL WATCH';
    $('bridge-last-report').textContent=notice;
    document.querySelectorAll('[data-bridge-station]').forEach(el=>{const chosen=el.dataset.bridgeStation===station.id;el.classList.toggle('selected',chosen);el.setAttribute('aria-pressed',String(chosen));});
    const list=$('bridge-readouts');list.replaceChildren(...readouts(s).map(([label,value])=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);return row;}));
  }
  const groupLabels=new Map();
  for(const station of bridgeStations){
    if(!groupLabels.has(station.group)){
      const group=document.createElement('div');group.className='bridge-station-group';const caption=document.createElement('h3');caption.textContent=station.group;group.append(caption);$('bridge-station-list').append(group);groupLabels.set(station.group,group);
    }
    const button=document.createElement('button');button.dataset.bridgeStation=station.id;button.style.setProperty('--station-color',station.color);button.setAttribute('aria-pressed','false');
    const icon=document.createElement('span');icon.textContent=station.symbol;const label=document.createElement('span');label.textContent=station.name;button.append(icon,label);button.onclick=()=>select(station.id);groupLabels.get(station.group).append(button);
    $('bridge-station-select').append(Object.assign(document.createElement('option'),{value:station.id,textContent:station.name}));
    const g=svg('g',{class:'bridge-deck-station',transform:`translate(${station.x} ${station.y})`,'data-bridge-station':station.id,role:'button',tabindex:0,'aria-label':`Open ${station.name} station`});
    g.style.setProperty('--station-color',station.color);
    if(station.id==='command'){
      g.append(svg('circle',{r:62,class:'command-platform'}),svg('path',{d:'M-30-19h23v31h-23ZM8-19h23v31H8ZM-35-14v30h34M3 16h34v-30',class:'command-chairs'}),svg('text',{y:35,'text-anchor':'middle',class:'bridge-deck-label'},'COMMAND'),svg('text',{y:48,'text-anchor':'middle',class:'bridge-deck-caption'},'CAPTAIN / FIRST OFFICER'));
    }else{
      g.append(svg('rect',{x:-48,y:-23,width:96,height:46,rx:9,class:'bridge-console-shell'}),svg('path',{d:'M-34-11h68v9h-68ZM-29 7h13m7 0H5m8 0h16',class:'bridge-screen-lines'}),svg('text',{y:41,'text-anchor':'middle',class:'bridge-deck-label'},station.short));
    }
    g.onclick=()=>select(station.id);g.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(station.id);}};$('bridge-deck-stations').append(g);
  }
  $('bridge-station-select').onchange=()=>select($('bridge-station-select').value);
  $('bridge-view-toggle').onclick=()=>{const root=$('bridge-console');root.dataset.view=root.dataset.view==='deck'?'station':'deck';updateViewButton();};
  updateViewButton();refresh();
  return {refresh};
}
