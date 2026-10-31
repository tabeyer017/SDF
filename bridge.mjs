import { bridgeStations, marineComplements, restoreBridgeState, flightControlState } from './bridge-model.mjs';
import { mountTactical } from './tactical.mjs';
import { createSector, observeSector, issueManeuver, setManualHelm, coast, brake, addPatrolWaypoint, startPatrol, stepSector } from './sector-model.mjs';
import { mountSectorConsole } from './sector-console.mjs';
import { createCombat,changeEncounter,shipPerformance,commandWeapons,ceaseFiring,queueRepair,containEmergency,dock,requestService,stepCombat,advanceMaintenance } from './combat-model.mjs';
import { mountDamageConsole } from './combat-console.mjs';
import { createCommunications,restoreCommunications,pollCommunications,unreadCommunications } from './communications-model.mjs';
import { mountCommunications } from './communications-console.mjs';
import { shuttleTypes,crewDoctrine } from './tactical-model.mjs';

export function mountBridge({snapshot,openNavigation,engage,pause,abort,log,onLocalChange=()=>{},onSave=()=>{},savedGame=null}) {
  const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
  const svg=(tag,attrs={},text)=>{const el=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);if(text!==undefined)el.textContent=text;return el;};
  let saved=savedGame?.settings;
  if(!saved)try{saved=JSON.parse(localStorage.getItem('sdf-bridge-v1'));}catch{}
  const state=restoreBridgeState(saved);
  let notice='All stations report ready for the patrol watch.',lastReview=null;
  const compact=matchMedia('(max-width: 650px)');
  const save=()=>onSave();
  let sector=savedGame?.sector?structuredClone(savedGame.sector):createSector(undefined,snapshot().location),localElapsed=0;
  let combat=savedGame?.combat?structuredClone(savedGame.combat):createCombat(sector.contacts);
  let communications=restoreCommunications(savedGame?.communications);
  function syncPerformance(){const p=shipPerformance(combat.own);sector.sensorRange=(combat.own.radar?200:60)*p.sensors;sector.enginePerformance=combat.docked?0:p.engines;return p;}
  syncPerformance();
  const flight={
    get sector(){return sector;},get combat(){return combat;},inTransit:()=>snapshot().active,
    contacts:()=>{syncPerformance();return observeSector(sector);},
    command:(mode,id,range)=>operate(()=>!combat.docked&&syncPerformance().engines>0&&issueManeuver(sector,mode,id,range)),
    manual:values=>operate(()=>!combat.docked&&syncPerformance().engines>0&&setManualHelm(sector,values)),
    coast:()=>operate(()=>{coast(sector);return true;}),
    brake:()=>operate(()=>{if(combat.docked||syncPerformance().engines===0)return false;brake(sector);return true;}),
    add:point=>operate(()=>{const added=addPatrolWaypoint(sector,point);if(added)sector.status='Patrol waypoint added · ready to fly';return added;}),
    patrol:()=>operate(()=>!combat.docked&&syncPerformance().engines>0&&startPatrol(sector)),
    clearRoute:()=>operate(()=>{sector.route=[];if(sector.order?.mode==='patrol')coast(sector);sector.status='Patrol route cleared';return true;}),
    toggle:()=>operate(()=>{sector.running=!sector.running;sector.status=sector.running?'Local simulation running · current flight order resumed':'Local simulation paused · flight order retained';return true;}),
    setRate:value=>{if([1,10,60].includes(value)){sector.rate=value;refresh();save();}},
    toggleEmitter:key=>{if(['radar','jammer','ciwsAuto'].includes(key)){combat.own[key]=!combat.own[key];syncPerformance();refresh();save();}},
    fire:orders=>combatAction(()=>commandWeapons(combat,sector,orders)),
    startFire:orders=>combatAction(()=>commandWeapons(combat,sector,orders,true)),
    ceaseFire:mountIds=>{ceaseFiring(combat,mountIds);refresh();save();},
    repair:id=>{if(queueRepair(combat,id)){if(!snapshot().active)sector.running=true;refresh();save();}},
    cancelRepair:id=>{combat.own.jobs=combat.own.jobs.filter(j=>j.systemId!==id);refresh();save();},
    contain:type=>{containEmergency(combat,type);refresh();save();},
    dock:()=>{if(snapshot().active)return;if(combat.docked){combat.docked=false;combat.service=null;combat.own.jobs=combat.own.jobs.filter(j=>!j.station);report('Undocked. Vector Drive available.');}else if(dock(combat,sector))report('Docking complete. Station service available.');else report('Docking unavailable: hold within 5 km of arrival below 10 KPH, with no incoming missiles.');save();},
    service:()=>{if(requestService(combat,sector)){refresh();save();}}
  };
  function combatAction(fn){if(snapshot().active){report('Weapons unavailable during EPD transit.');return;}const result=fn();if(result.ok)sector.running=true;report(result.message);save();}
  const localRoot=document.createElement('section');localRoot.className='sector-console';localRoot.setAttribute('aria-label','Navigation and Helm local sector');$('bridge-console').append(localRoot);
  const localConsole=mountSectorConsole({root:localRoot,flight,openSystem:openNavigation,strategic:{snapshot,engage,pause,abort}});
  const tactical=mountTactical({root:$('tactical-console'),range:state.radarRange,onRangeChange:range=>{state.radarRange=range;save();},flight,onNavigate:()=>select('navigation')});
  const damageRoot=document.createElement('section');$('bridge-console').append(damageRoot);const damageConsole=mountDamageConsole({root:damageRoot,flight});
  const commsRoot=document.createElement('section');$('bridge-console').append(commsRoot);
  const communicationsContext=()=>({sector,combat,contacts:flight.contacts(),range:state.radarRange,inTransit:snapshot().active,days:snapshot().days});
  const commsConsole=mountCommunications({root:commsRoot,getState:()=>communications,getContext:communicationsContext,onChange:()=>{updateCommsBadge();save();},onNavigate:select});
  if(savedGame)tactical.restoreState(savedGame.tactical,state.radarRange);
  function operate(fn){if(snapshot().active){report('EPD transit active. Disengage EPD before local maneuvering.');return false;}const result=fn();if(result)report(sector.status);else report('Local order unavailable: check the target, range, or waypoint limit.');onLocalChange();return result;}
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
      case 'communications':break;
      case 'engineering':break;
      case 'environment':{
        const wrapper=document.createElement('label');wrapper.className='bridge-setting';const caption=document.createElement('span');caption.textContent='Habitat temperature';
        const select=document.createElement('select');select.setAttribute('aria-label','Habitat temperature');
        for(let temperature=18;temperature<=25;temperature++)select.append(Object.assign(document.createElement('option'),{value:String(temperature),textContent:`${temperature} °C`}));
        select.value=String(state.temperature);select.onchange=()=>{state.temperature=Number(select.value);save();report(`Life support: habitat setpoint ${state.temperature} °C.`);};wrapper.append(caption,select);controls.append(wrapper);break;
      }
    }
    if(state.selected==='command'||state.selected==='ops')controls.append(action('Open damage control ↗',()=>select('engineering')));
    if(state.selected==='security'||state.selected==='environment')controls.append(action('Isolate fire',()=>flight.contain('fire'),!combat.own.fire),action('Seal bulkheads / isolate pressure loss',()=>flight.contain('breach'),!combat.own.breach),action('Open damage control ↗',()=>select('engineering')));
  }
  function readouts(s){
    const watch=state.watch==='routine'?'Routine watch':'Heightened watch';
    switch(state.selected){
      case 'command':return [['Command seat',state.seat==='captain'?'Captain':'First officer'],['Watch condition',watch],['Vessel',s.shipName],['Patrol status',s.active?`To ${s.nextWaypoint}`:`At ${s.location}`]];
      case 'helm':return [['EPD drive',s.active?(s.paused?'Transit paused':'In transit'):'Standby'],['Next waypoint',s.nextWaypoint||'None plotted'],['Remaining distance',s.distance],['Transit estimate',s.eta]];
      case 'ops':return [['Duty priority',{balanced:'Balanced',sensors:'Sensor coordination',engineering:'Engineering readiness'}[state.ops]],['Spare parts',`${combat.own.spares} / ${combat.own.maxSpares}`],['Repair teams',`${combat.own.teams} · ${combat.own.jobs.length} jobs`],['Flight plan',`${s.routeCount} waypoints`]];
      case 'navigation':return [['Chart reference','Heliocentric / Sol'],['Selected destination',s.targetName],['Flight plan',`${s.routeCount} waypoints`],['Course safety',s.unsafe?'Detour required':'Clear of Sol exclusion']];
      case 'tactical':return [['Watch condition',watch],['Weapons posture','Safed'],['Defensive protection','Shielding secure'],['Fire-control target','None designated']];
      case 'security':{
        const marines=marineComplements[combat.own.classId];
        return [['Space marines',marines?`${marines.personnel} · ${marines.platoons} ${marines.platoons===1?'platoon':'platoons'} · up to ${Math.floor(marines.personnel*crewDoctrine.maxAndroidFraction)} androids`:'Complement not specified'],['Shuttle troop capacity',`${shuttleTypes.shuttle.troopCapacity} per craft · flight crew additional`],['Watch condition',watch],['Fire',combat.own.fire?'Active · isolate compartments':'Contained'],['Pressure loss',combat.own.breach?'Active · seal bulkheads':'Contained'],['Hull integrity',`${Math.ceil(combat.own.systems.hull.hp)} / ${combat.own.systems.hull.max}`]];
      }
      case 'science':return [['Sensor assignment',{navigation:'Navigation support','long-range':'Long-range watch',planetary:'Planetary review'}[state.sensor]],['Selected target',s.targetName],['Catalog review',lastReview||'Awaiting review'],['Anomaly research','No data assigned']];
      case 'communications':return [['Sol Command link','Established'],['Patrol authority','United Nations of Earth'],['Channel','Patrol operations'],['Hailing target',s.targetName]];
      case 'engineering':return [['Cold fusion core','Online'],['EPD propulsion',s.active?'Engaged':'Standby'],['Inertial dampeners','Active'],['Power / damage control','Nominal']];
      case 'environment':return [['Cabin temperature',`${state.temperature} °C`],['Pressure loss',combat.own.breach?'Active':'Contained'],['Life support',`${Math.ceil(combat.own.systems['life-support'].hp)} / ${combat.own.systems['life-support'].max}`],['Emergency air',`${Math.ceil(combat.own.air)} seconds`]];
      default:return [];
    }
  }
  let lastControlKey='';
  function refresh(){
    const s=snapshot(),station=bridgeStations.find(item=>item.id===state.selected);
    if(pollCommunications(communications,communicationsContext()))save();
    const controlKey=[state.selected,state.watch,s.active,s.paused,s.routeCount,s.unsafe,combat.own.fire,combat.own.breach].join('|');
    if(controlKey!==lastControlKey){lastControlKey=controlKey;renderControls();}
    $('bridge-station-select').value=station.id;
    $('bridge-console').dataset.station=station.id;
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
    if(['navigation','helm'].includes(state.selected))localConsole.refresh(state.selected);
    if(state.selected==='tactical')tactical.refresh();
    if(state.selected==='engineering')damageConsole.refresh();
    if(state.selected==='communications'&&document.body.dataset.screen==='bridge')commsConsole.refresh();
    updateCommsBadge();
  }
  function updateCommsBadge(){
    const count=unreadCommunications(communications),label=`Communications${count?` (${count})`:''}`;
    const button=$('bridge-station-list').querySelector('[data-bridge-station="communications"]');if(button)button.lastElementChild.textContent=label;
    const option=$('bridge-station-select').querySelector('option[value="communications"]');if(option)option.textContent=label;
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
  return {
    refresh,selectStation:select,
    exportState:()=>({settings:{...state},sector:structuredClone(sector),tactical:tactical.exportState(),combat:structuredClone(combat),communications:structuredClone(communications)}),
    restoreState(saved){
      Object.assign(state,saved.settings);sector=structuredClone(saved.sector);combat=structuredClone(saved.combat);syncPerformance();localElapsed=0;lastReview=null;
      communications=restoreCommunications(saved.communications);
      tactical.restoreState(saved.tactical,state.radarRange);notice='JSON save restored · flight paused.';
      renderControls();refresh();
    },
    localStatus:()=>({running:sector.running,mode:sector.order?.mode||'coast',time:sector.time,canEPD:shipPerformance(combat.own).epd&&!combat.docked,hull:combat.own.systems.hull.hp/combat.own.systems.hull.max,spares:combat.own.spares,core:combat.own.systems.reactor.hp>0}),
    suspendLocal(){sector.running=false;coast(sector);combat.firing=null;combat.shots=[];sector.status='EPD transit · local flight suspended';refresh();},
    arrive(location){sector=createSector(undefined,location);changeEncounter(combat,sector.contacts);communications.encounter++;syncPerformance();tactical.reset();notice=`Arrived at ${location}. Damage and supplies retained.`;refresh();},
    resetPatrol(){combat=createCombat();sector=createSector(undefined,'Earth');communications=createCommunications();syncPerformance();tactical.reset();refresh();},
    advanceTransit(seconds){combat.time+=seconds;advanceMaintenance(combat,seconds);return combat.own.systems.hull.hp>0;},
    tick(seconds){
      if(snapshot().active || document.hidden || !sector.running)return 0;
      let advanced=0,remaining=Math.min(120,seconds*sector.rate);
      while(remaining>1e-8){const quantum=(combat.shots.length||combat.firing||combat.hostiles.length)? .05:.25;const dt=Math.min(quantum,remaining);syncPerformance();if(!sector.enginePerformance&&sector.order)coast(sector);advanced+=stepSector(sector,dt);stepCombat(combat,sector,dt);remaining-=dt;}
      localElapsed+=seconds;
      if(localElapsed>=.35){localElapsed=0;if(pollCommunications(communications,communicationsContext()))save();updateCommsBadge();if(document.body.dataset.screen==='bridge'){if(state.selected==='tactical')tactical.refresh();if(state.selected==='engineering')damageConsole.refresh();if(state.selected==='communications')commsConsole.refresh();if(['navigation','helm'].includes(state.selected))localConsole.refresh(state.selected);}}
      return advanced;
    }
  };
}
