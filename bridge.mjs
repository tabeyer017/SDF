import { bridgeStations, bridgeAreas, bridgeAreaFor, canonicalBridgeStation, marineComplements, restoreBridgeState, redistributePower, operationsDutyModes, battleStationsPreset } from './bridge-model.mjs';
import { gameDate } from './navigation.mjs';
import { mountBridgeDeck, createStationAcknowledgments } from './bridge-deck.mjs';
import { mountTacticalView } from './tactical-view.mjs';
import { mountTactical } from './tactical.mjs';
import { createSector, createEncounterSector, observeSector, issueManeuver, setManualHelm, coast, brake, addPatrolWaypoint, startPatrol, stepSector, LOCAL_SIMULATION_RATES, maneuverNames } from './sector-model.mjs';
import { applyEncounterEvent } from './encounter-model.mjs';
import { mountSectorConsole } from './sector-console.mjs';
import { createCombat,changeEncounter,shipPerformance,orderEngagement,commandWeapons,ceaseFiring,queueRepair,scheduleRepairs,setAutomaticRepairs,cancelRepair,containEmergency,dock,requestService,stepCombat,advanceMaintenance,cancelSupportShip,salvoWeights,missileVolleySizes,cannonBurstSizes,syncElectronicTracking,setJammerMode,requestRadarBurnThrough,refreshMissileGuidance,deployCountermeasures } from './combat-model.mjs';
import { mountDamageConsole } from './combat-console.mjs';
import { createCommunications,restoreCommunications,pollCommunications,communicationsRecipients,communicationLink,sendCommunication,channelContactId,revealedPatrolMission,missionMatchesWaypoint,pollPatrolMission,finishPatrolMission,leavePatrolMission,recordPatrolSweep } from './communications-model.mjs';
import { mountCommunications,mountCommunicationAlerts } from './communications-console.mjs';
import { earthPatrolContacts,shuttleTypes,crewDoctrine } from './tactical-model.mjs';
import {shipNameOptions,shipNamingConventions,playerShipName,setPlayerShipName} from './ship-names.mjs';
import {boardingOrders,launchShuttle,recallShuttle,shuttleStatus,hasDeployedShuttles} from './boarding-model.mjs';

export function mountBridge({snapshot,engage,abort,log,missionStations,onOpenBriefing,onOpenMission,onMissionChange,onLocalChange=()=>{},onSave=()=>{},savedGame=null}) {
  const $=id=>document.getElementById(id);
  let saved=savedGame?.settings;
  if(!saved)try{saved=JSON.parse(localStorage.getItem('sdf-bridge-v1'));}catch{}
  const state=restoreBridgeState(saved);
  const areaStations=Object.fromEntries(bridgeAreas.map(area=>[area.id,area.tabs[0][0]]));
  areaStations[bridgeAreaFor(state.selected).id]=state.selected;
  const mapLayout=document.querySelector('.command-layout'),mapTabs=document.querySelector('.console-tabs');
  const systemRoot=document.createElement('section');systemRoot.className='bridge-system-map';systemRoot.id='bridge-system-map';systemRoot.setAttribute('aria-label','Strategic navigation console');$('bridge-console').append(systemRoot);
  systemRoot.append(mapTabs,mapLayout);
  let notice='All stations report ready for the patrol watch.',lastReview=null;
  const compact=matchMedia('(max-width: 650px)');
  const save=()=>onSave();
  let sector=savedGame?.sector?structuredClone(savedGame.sector):snapshot().location==='Earth'?createSector(earthPatrolContacts):createEncounterSector(snapshot().location),localElapsed=0;
  let combat=savedGame?.combat?structuredClone(savedGame.combat):createCombat(sector.contacts);
  if(!savedGame?.combat)applyEncounterEvent(sector,combat);
  scheduleRepairs(combat);
  let communications=restoreCommunications(savedGame?.communications);
  function syncPerformance(){const p=shipPerformance(combat.own);sector.sensorRange=(combat.own.radar?200:60)*p.sensors;sector.enginePerformance=combat.docked?0:p.engines;syncElectronicTracking(combat,sector);refreshMissileGuidance(combat,sector);return p;}
  syncPerformance();
  const flight={
    get sector(){return sector;},get combat(){return combat;},inTransit:()=>snapshot().active,
    allocatePower:(channel,percent)=>{
      const next=redistributePower(combat.own.powerAllocation,channel,percent);
      combat.own.powerAllocation=next;
      if(next.sensors===0)combat.own.burnThroughUntil=0;
      refresh();save();
    },
    clockRunning:()=>{const transit=snapshot();return transit.active?!transit.paused:sector.running;},
    contacts:()=>{syncPerformance();return observeSector(sector).map(contact=>combat.boarding.captured.includes(contact.id)?{...contact,type:'friendly',behavior:'captured'}:contact);},
    launchShuttle:(number,order,target)=>{const result=launchShuttle(combat,sector,number,order,target,snapshot().active);report(result.message);onLocalChange();save();return result;},
    recallShuttle:number=>{const result=recallShuttle(combat,sector,number,snapshot().active);report(result.message);onLocalChange();save();return result;},
    setShuttleOrder:(number,order)=>{const shuttle=combat.boarding.shuttles.find(item=>item.number===number);if(shuttle?.status==='ready'&&boardingOrders.some(([id])=>id===order)){shuttle.order=order;refresh();save();}},
    friendlyLink:id=>{const context=communicationsContext();return communicationLink(context,communicationsRecipients(communications,context).find(r=>r.contactId===id&&r.friendly));},
    requestFriendly:(id,request,targetIds)=>{
      const context={...communicationsContext(),lockedTargetIds:targetIds};
      const recipient=communicationsRecipients(communications,context).find(r=>r.contactId===id&&r.friendly);
      if(!recipient)return {ok:false,message:'No live link to this friendly SDF ship.'};
      const result=sendCommunication(communications,context,recipient.id,request);
      report(result.response||result.message);save();return result;
    },
    supportLink:()=>communicationLink(communicationsContext(),{available:true}),
    requestSupport:()=>{const result=sendCommunication(communications,communicationsContext(),'hq','support');report(result.response||result.message);save();return result;},
    cancelSupport:()=>{if(cancelSupportShip(combat)){report('Resupply / repair tender request cancelled.');save();}},
    command:(mode,id,range)=>operate(()=>!combat.docked&&combat.service?.provider!=='tender'&&syncPerformance().engines>0&&issueManeuver(sector,mode,id,range)),
    manual:values=>operate(()=>!combat.docked&&combat.service?.provider!=='tender'&&syncPerformance().engines>0&&setManualHelm(sector,values)),
    coast:()=>operate(()=>{coast(sector);return true;}),
    brake:()=>operate(()=>{if(combat.docked||combat.service?.provider==='tender'||syncPerformance().engines===0)return false;brake(sector);return true;}),
    add:point=>operate(()=>{const added=addPatrolWaypoint(sector,point);if(added)sector.status='Patrol waypoint added · ready to fly';return added;}),
    patrol:()=>operate(()=>!combat.docked&&combat.service?.provider!=='tender'&&syncPerformance().engines>0&&startPatrol(sector)),
    clearRoute:()=>operate(()=>{sector.route=[];if(sector.order?.mode==='patrol')coast(sector);sector.status='Patrol route cleared';return true;}),
    toggle:()=>operate(()=>{sector.running=!sector.running;sector.status=sector.running?'Local simulation running · current flight order resumed':'Local simulation paused · flight order retained';return true;}),
    setRate:value=>{if(LOCAL_SIMULATION_RATES.includes(value)){sector.rate=value;refresh();save();}},
    toggleEmitter:key=>{if(['radar','ciwsAuto'].includes(key)){combat.own[key]=!combat.own[key];if(key==='radar'&&!combat.own.radar)combat.own.burnThroughUntil=0;syncPerformance();refresh();save();}},
    cycleJammer:()=>{const modes=['auto','on','off'];setJammerMode(combat,sector,modes[(modes.indexOf(combat.own.jammerMode)+1)%modes.length]);syncPerformance();refresh();save();},
    burnThrough:()=>combatAction(()=>requestRadarBurnThrough(combat)),
    deployCountermeasures:type=>{
      if(snapshot().active)return;
      report(deployCountermeasures(combat,type).message);save();
    },
    engageTargets:(objective,ids)=>combatAction(()=>orderEngagement(combat,sector,objective,ids)),
    setMissileVolley:size=>{if(missileVolleySizes.includes(size)){combat.missileVolleySize=size;refresh();save();}},
    setCannonBurst:size=>{if(cannonBurstSizes.includes(size)){combat.cannonBurstSize=size;refresh();save();}},
    setSalvoWeight:id=>{
      const weight=salvoWeights.find(weight=>weight.id===id);if(!weight)return;
      combat.missileVolleySize=weight.missileVolleySize;
      combat.cannonBurstSize=weight.cannonBurstSize;
      refresh();save();
    },
    fire:orders=>combatAction(()=>commandWeapons(combat,sector,orders)),
    startFire:orders=>combatAction(()=>commandWeapons(combat,sector,orders,true)),
    ceaseFire:mountIds=>{ceaseFiring(combat,mountIds);refresh();save();},
    repair:id=>{if(queueRepair(combat,id)){if(!snapshot().active)sector.running=true;refresh();save();}},
    cancelRepair:id=>{cancelRepair(combat,id);refresh();save();},
    automaticRepairs:enabled=>{setAutomaticRepairs(combat,enabled);report(enabled?'Engineering: automatic repairs enabled. Individual repair holds cleared.':'Engineering: manual repair control. Automatic jobs stopped; manual orders retained.');save();},
    contain:type=>{containEmergency(combat,type);refresh();save();},
    dock:()=>{if(snapshot().active)return;if(combat.docked){combat.docked=false;combat.service=null;combat.own.jobs=combat.own.jobs.filter(j=>!j.station);report('Undocked. Vector Drive available.');}else if(dock(combat,sector))report('Docking complete. Station service available.');else report('Docking unavailable: hold within 5 km of arrival below 10 KPH, with no incoming missiles.');save();},
    service:()=>{if(requestService(combat,sector)){refresh();save();}}
  };
  function combatAction(fn){if(snapshot().active){report('Weapons unavailable during EPD transit.');return;}const result=fn();if(result.ok)sector.running=true;report(result.message);save();}
  const localRoot=document.createElement('section');localRoot.className='sector-console';localRoot.setAttribute('aria-label','Local Flight');$('bridge-console').append(localRoot);
  const localConsole=mountSectorConsole({root:localRoot,flight,strategic:{snapshot,engage,abort},
    getContactId:()=>tactical.exportState().activeId,
    openDefense:()=>select('security'),
    interceptUnavailable:contact=>{
      if(snapshot().active)return 'Local flight is unavailable during EPD transit.';
      if(!contact)return 'Waiting for a live sensor track.';
      if(contact.precisionTrack===false)return 'Waiting for a precise sensor track.';
      if(combat.docked||combat.service?.provider==='tender')return 'Undock or end tender service to maneuver.';
      if(!shipPerformance(combat.own).engines)return 'Restore propulsion in Engineering to maneuver.';
      return '';
    }
  });
  function mountSecurity(root,{idPrefix}){
    root.className='tactical-security';root.setAttribute('aria-label','Own ship security');
    const heading=document.createElement('h3');heading.textContent='SECURITY / SHIPBOARD DEFENSE';
    function iconAction(label,callback,path){
      const button=action('',callback),icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),shape=document.createElementNS('http://www.w3.org/2000/svg','path'),hint=document.createElement('span');
      button.classList.add('security-action-icon');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');shape.setAttribute('d',path);icon.append(shape);hint.className='defense-action-tooltip';hint.setAttribute('role','tooltip');button.append(icon,hint);labelAction(button,label);return button;
    }
    function labelAction(button,label){button.title=label;button.setAttribute('aria-label',label);button.lastElementChild.textContent=label;}
    const readout=document.createElement('dl');readout.className='security-readouts';
    const values=readouts(snapshot(),'security').map(([label])=>{
      const row=document.createElement('div'),name=document.createElement('dt'),value=document.createElement('dd');name.textContent=label;row.append(name,value);readout.append(row);return value;
    });
    const controls=document.createElement('div');controls.className='security-actions';
    const watch=iconAction('Set heightened watch',setWatch,'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4ZM8 12l3 3 5-6'),fire=iconAction('Isolate fire',()=>flight.contain('fire'),'M12 2c2 5-2 6-2 9 0 1 1 2 2 2 2 0 3-2 3-5 4 4 5 6 5 8a8 8 0 0 1-16 0c0-5 5-7 8-14Z'),breach=iconAction('Seal bulkheads / isolate pressure loss',()=>flight.contain('breach'),'M3 3h18v18H3ZM10 3v18m4-18v18M5 12h3m8 0h3');
    controls.append(watch,fire,breach,iconAction('Open damage control',()=>select('engineering'),'m14 4 3 3-4 4 3 3 4-4 1 3-3 5-5-1-7 7-3-3 7-7-1-5 5-3Z'));
    const header=document.createElement('header');header.className='security-heading';header.append(heading,controls);
    const doctrine=document.createElement('p');doctrine.className='security-doctrine';doctrine.textContent='Marines board, seize and defend ships. Automation keeps crews small. Androids handle routine, hazardous and combat duties, count within personnel totals and can be injured or destroyed. High cost limits androids to 30%.';
    const info=iconAction('Marine and android doctrine',()=>{},'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18ZM12 11v6m0-10v1');
    info.title=doctrine.textContent;info.lastElementChild.textContent=doctrine.textContent;info.lastElementChild.id=`${idPrefix}-marine-doctrine`;info.setAttribute('aria-describedby',info.lastElementChild.id);controls.prepend(info);
    root.append(header,readout);
    return {refresh(){
      readouts(snapshot(),'security').forEach(([,value],index)=>{values[index].textContent=value;});
      labelAction(watch,state.watch==='routine'?'Set heightened watch':'Return to routine watch');watch.setAttribute('aria-pressed',String(state.watch==='heightened'));fire.disabled=!combat.own.fire;breach.disabled=!combat.own.breach;
    }};
  }
  const tactical=mountTactical({root:$('tactical-console'),range:state.radarRange,onRangeChange:range=>{state.radarRange=range;save();},onChange:()=>{
    if(state.selected==='communications')commsConsole.refresh();
    save();
  },flight,onNavigate:()=>select('navigation'),mountSecurity});
  if(saved?.selected==='security')tactical.openDefense();
  const damageRoot=document.createElement('section');$('bridge-console').append(damageRoot);const damageConsole=mountDamageConsole({root:damageRoot,flight});
  const commsRoot=document.createElement('section');$('bridge-console').append(commsRoot);
  const missionContext=()=>{const s=snapshot();return {sector,combat,inTransit:s.active,days:s.days,position:s.position};};
  const communicationsContext=()=>{const locks=tactical.exportState();return {...missionContext(),missionStations,contacts:flight.contacts(),activeTargetId:locks.activeId,range:state.radarRange,lockedTargetIds:[...locks.lockedIds].sort((a,b)=>locks.priorities[a]-locks.priorities[b])};};
  function communicationsChanged(){commsAlerts.refresh();onMissionChange();save();}
  const commsConsole=mountCommunications({root:commsRoot,getState:()=>communications,getContext:communicationsContext,onChange:communicationsChanged,onOpenContact:openContact,onOpenMission,onDeclineMission:()=>{
    if(!revealedPatrolMission(communications)||communications.mission.arrived)return;
    finishPatrolMission(communications,missionContext(),'declined','Assignment returned to Sol Command.');
    commsConsole.refresh();communicationsChanged();
  }});
  const commsAlerts=mountCommunicationAlerts({getState:()=>communications,onOpen:channelId=>{
    if(channelId)communications.selectedId=channelId;
    communications.filter='all';select('communications');commsConsole.focus();
  }});
  if(savedGame)tactical.restoreState(savedGame.tactical,state.radarRange);
  function operate(fn){if(snapshot().active){report('EPD transit active. Disengage EPD before local maneuvering.');return false;}const result=fn();if(result)report(sector.status);else report('Local order unavailable: check the target, range, or waypoint limit.');onLocalChange();return result;}
  function report(text){notice=text;log(text);refresh();}
  function openContact(channelId){
    const id=channelContactId(channelId,communications.encounter);
    if(snapshot().active||!id||!tactical.focusContact(id))return false;
    select('navigation');localConsole.focusContact();return true;
  }
  function select(id){
    if(id==='security')tactical.openDefense();
    id=canonicalBridgeStation(id);
    if(!bridgeStations.some(station=>station.id===id))return;
    state.selected=id;areaStations[bridgeAreaFor(id).id]=id;save();renderControls();refresh();
    if(compact.matches)$('bridge-console').dataset.view='station';
    updateViewButton();
  }
  function selectArea(id){const area=bridgeAreas.find(area=>area.id===id);if(area)select(areaStations[id]);}
  function updateViewButton(){ $('bridge-view-toggle').textContent=$('bridge-console').dataset.view==='deck'?'Overview':'Deck view'; }
  function openBridge(){select('command');$('bridge-console').dataset.view='deck';updateViewButton();}
  function action(label,callback,disabled=false){const button=document.createElement('button');button.textContent=label;button.className='bridge-action';button.disabled=disabled;button.onclick=callback;return button;}
  function choice(label,key,options){
    const wrapper=document.createElement('label');wrapper.className='bridge-setting';
    const caption=document.createElement('span');caption.textContent=label;
    const select=document.createElement('select');select.setAttribute('aria-label',label);
    select.append(...options.map(([value,text])=>Object.assign(document.createElement('option'),{value,textContent:text})));
    select.value=String(state[key]);select.onchange=()=>{state[key]=select.value;save();report(`${label}: ${select.selectedOptions[0].textContent}.`);};wrapper.append(caption,select);return wrapper;
  }
  function setWatch(){state.watch=state.watch==='routine'?'heightened':'routine';save();renderControls();report(`Bridge Command: ${state.watch==='routine'?'routine':'heightened'} watch set.`);}
  function renderControls(){
    const controls=$('bridge-actions'),settingsOpen=controls.querySelector('.command-settings')?.open;controls.replaceChildren();
    switch(state.selected){
      case 'command':
        {
          const label=document.createElement('label');label.className='bridge-setting';
          const caption=document.createElement('span');caption.textContent='Ship name';
          const names=document.createElement('select');names.setAttribute('aria-label','Ship name');
          for(const name of shipNameOptions(combat.own.classId))names.append(Object.assign(document.createElement('option'),{value:name,textContent:name}));
          names.value=playerShipName(combat);names.onchange=()=>{if(setPlayerShipName(combat,names.value)){report(`Ship named ${names.value}.`);save();}};
          label.append(caption,names);const note=document.createElement('p');note.className='combat-note';note.textContent=`UNE naming: ${shipNamingConventions[combat.own.classId].category}.`;
          const settings=document.createElement('details');settings.className='command-settings';settings.open=!!settingsOpen;
          const summary=document.createElement('summary');summary.textContent='Ship settings';
          const fields=document.createElement('div');fields.className='command-settings-fields';
          fields.append(label,note,choice('Command seat','seat',[['captain','Captain'],['first-officer','First officer']]));
          settings.append(summary,fields);
          controls.append(action('Battle Stations',()=>acknowledgments.activate()),action(state.watch==='routine'?'Set heightened watch':'Return to routine watch',setWatch),settings);break;
        }
      case 'navigation':break;
      case 'ops':controls.append(choice('Duty priority','ops',Object.entries(operationsDutyModes)));break;
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
    if(state.selected==='ops')controls.append(action('Open Engineering / Support ↗',()=>select('engineering')));
    if(state.selected==='security'||state.selected==='environment')controls.append(action('Isolate fire',()=>flight.contain('fire'),!combat.own.fire),action('Seal bulkheads / isolate pressure loss',()=>flight.contain('breach'),!combat.own.breach),action('Open damage control ↗',()=>select('engineering')));
  }
  function readouts(s,selected=state.selected){
    const watch=state.watch==='routine'?'Routine watch':'Heightened watch';
    switch(selected){
      case 'command':return [['Hull integrity',`${Math.round(combat.own.systems.hull.hp/combat.own.systems.hull.max*100)}%`]];
      case 'ops':return [['Duty priority',operationsDutyModes[state.ops]],['Spare parts',`${combat.own.spares} / ${combat.own.maxSpares}`],['Repair teams',`${combat.own.teams} · ${combat.own.jobs.length} jobs`],['Flight plan',`${s.routeCount} waypoints`]];
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
  let areaTabKey='';
  const panelFor=id=>id==='system-map'?systemRoot:id==='navigation'?localRoot:id==='tactical'?$('tactical-console'):id==='engineering'?damageRoot:id==='communications'?commsRoot:$('bridge-station-detail');
  for(const [panel,id] of [[localRoot,'bridge-flight-panel'],[damageRoot,'bridge-engineering-panel'],[commsRoot,'bridge-comms-panel']])panel.id=id;
  function refreshArea(area){
    $('bridge-area-name').textContent=area.name;
    for(const button of document.querySelectorAll('[data-station-area]')){
      if(button.dataset.stationArea===area.id)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    }
    const tabs=$('bridge-area-tabs'),hasTabs=area.tabs.length>1;
    tabs.hidden=!hasTabs;tabs.setAttribute('aria-label',`${area.name} controls`);
    if(areaTabKey!==area.id){
      areaTabKey=area.id;tabs.replaceChildren(...(hasTabs?area.tabs:[]).map(([id,label])=>{
        const tab=document.createElement('button');tab.id=`bridge-tab-${id}`;tab.dataset.bridgeTab=id;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',panelFor(id).id);tab.textContent=label;tab.onclick=()=>select(id);
        tab.onkeydown=event=>{const index=area.tabs.findIndex(([key])=>key===id);let next;
          if(event.key==='ArrowRight')next=(index+1)%area.tabs.length;
          if(event.key==='ArrowLeft')next=(index+area.tabs.length-1)%area.tabs.length;
          if(event.key==='Home')next=0;if(event.key==='End')next=area.tabs.length-1;
          if(next!==undefined){event.preventDefault();select(area.tabs[next][0]);$(`bridge-tab-${area.tabs[next][0]}`).focus();}
        };return tab;
      }));
    }
    for(const tab of tabs.children){const active=tab.dataset.bridgeTab===state.selected;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
    for(const panel of [systemRoot,localRoot,$('tactical-console'),damageRoot,commsRoot,$('bridge-station-detail')]){
      if(hasTabs&&panel===panelFor(state.selected)){
        panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',`bridge-tab-${state.selected}`);
      }else{
        panel.removeAttribute('role');panel.removeAttribute('aria-labelledby');
      }
    }
  }
  const watchTimeFormat=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC'});
  let alertKey='',shuttleKey='';
  function refreshWatch(s){
    const own=combat.own,order=sector.order,memory=sector.memory[order?.targetId];
    const moving=Math.hypot(sector.own.vx,sector.own.vy,sector.own.vz)>=1;
    let orderText=s.active?`EPD to ${s.nextWaypoint}`:combat.docked?'Docked':order&&!(order.mode==='brake'&&!moving)?maneuverNames[order.mode]:moving?'Coasting':'Holding position';
    if(!s.active&&memory){
      orderText+=` · ${memory.observed.name}`;
      if(memory.seen!==sector.time)orderText+=' · last known';
    }
    $('watch-location').textContent=s.location;
    $('watch-order').textContent=orderText;
    const date=gameDate(s.days*86400);
    $('watch-time').dateTime=date.toISOString();$('watch-time').textContent=watchTimeFormat.format(date);
    const running=flight.clockRunning();
    $('watch-mode').textContent=`${s.active?'EPD':'Local'} ${running?'running':'paused'}`;
    $('pause-button').textContent=running?'Pause':s.active?'Resume':'Run';
    $('pause-button').setAttribute('aria-label',`${running?'Pause':s.active?'Resume':'Run'} ${s.active?'EPD transit':'local simulation'}`);
    const rate=$('watch-rate'),mode=s.active?'epd':'local';
    if(rate.dataset.mode!==mode){
      rate.dataset.mode=mode;rate.replaceChildren(...(s.active?[1,10,100]:LOCAL_SIMULATION_RATES).map(value=>Object.assign(document.createElement('option'),{value,textContent:`${value}×`})));
    }
    rate.value=String(s.active?s.speed:sector.rate);
    const alerts=[];
    if(own.systems.hull.hp===0)alerts.push(['Ship lost','engineering']);
    if(own.fire)alerts.push(['Fire aboard','engineering']);
    if(own.breach)alerts.push(['Pressure loss','engineering']);
    if(combat.shots.some(shot=>shot.targetId==='own'))alerts.push(['Incoming fire','tactical']);
    if(!shipPerformance(own).epd)alerts.push(['EPD unavailable','engineering']);
    if(own.spares===0)alerts.push(['Repair spares exhausted','engineering']);
    if(sector.safety.startsWith('Blocked')&&!s.active)alerts.push(['Navigation blocked','navigation']);
    const alert=$('watch-alert');alert.hidden=!alerts.length;
    if(alerts.length){
      alert.textContent=alerts.length>1?`${alerts[0][0]} +${alerts.length-1}`:alerts[0][0];
      alert.onclick=()=>select(alerts[0][1]);
    }
    const nextAlertKey=JSON.stringify(alerts);
    if(nextAlertKey!==alertKey){
      alertKey=nextAlertKey;
      $('command-alerts').replaceChildren(...(alerts.length?alerts.map(([label,station])=>action(label,()=>select(station))):[document.createTextNode('No active alerts')]));
    }
    const deployed=combat.boarding.shuttles.filter(shuttle=>shuttle.status!=='ready').map(shuttle=>`Shuttle ${shuttle.number} · ${shuttleStatus(shuttle)}`);
    const nextShuttleKey=JSON.stringify(deployed);
    if(nextShuttleKey!==shuttleKey){
      shuttleKey=nextShuttleKey;
      $('command-shuttles').replaceChildren(...(deployed.length?deployed.map(label=>action(label,()=>{
        select('security');tactical.focusShuttleOps();
      })):[document.createTextNode('All shuttles aboard')]));
    }
  }
  function refresh(){
    for(const element of document.querySelectorAll('[data-player-ship-name]'))element.textContent=(element.dataset.shipCase==='upper'?playerShipName(combat).toUpperCase():playerShipName(combat))+(element.dataset.shipSuffix??'');
    const s=snapshot(),station=bridgeStations.find(item=>item.id===state.selected),area=bridgeAreaFor(state.selected);
    if(pollCommunications(communications,communicationsContext()))save();
    const controlKey=[state.selected,state.watch,state.ops,state.sensor,s.active,s.paused,s.routeCount,s.unsafe,combat.own.fire,combat.own.breach,playerShipName(combat)].join('|');
    if(controlKey!==lastControlKey){lastControlKey=controlKey;renderControls();}
    $('bridge-console').dataset.station=station.id;
    $('bridge-console').dataset.area=area.id;refreshArea(area);
    $('bridge-station-name').textContent=station.name;
    $('bridge-station-name').hidden=station.id==='command';
    $('bridge-station-summary').textContent=station.summary;
    $('bridge-station-summary').hidden=station.id==='command';
    $('bridge-command-reference').hidden=state.selected!=='command';
    $('bridge-command-watch').hidden=state.selected!=='command';
    $('bridge-station-detail').style.setProperty('--station-color',station.color);
    $('bridge-watch').textContent=state.watch==='routine'?'ROUTINE WATCH':'HEIGHTENED WATCH';
    $('bridge-watch').classList.toggle('heightened',state.watch==='heightened');
    $('bridge-deck').classList.toggle('heightened-watch',state.watch==='heightened');
    $('bridge-duty-seat').textContent=state.seat==='captain'?'CAPTAIN HAS THE CONN':'FIRST OFFICER HAS THE CONN';
    $('bridge-main-display').textContent=s.active?`TRANSIT TO ${s.nextWaypoint.toUpperCase()}`:'SOL SYSTEM / PATROL WATCH';
    $('bridge-last-report').textContent=notice;
    document.querySelectorAll('[data-bridge-area]').forEach(el=>{const chosen=el.dataset.bridgeArea===area.id;el.classList.toggle('selected',chosen);el.setAttribute('aria-pressed',String(chosen));});
    const list=$('bridge-readouts');list.replaceChildren(...readouts(s).map(([label,value])=>{const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);return row;}));
    if(state.selected==='navigation')localConsole.refresh();
    if(state.selected==='tactical')tactical.refresh();
    if(state.selected==='engineering')damageConsole.refresh();
    if(state.selected==='communications'&&document.body.dataset.screen==='bridge')commsConsole.refresh();
    commsAlerts.refresh();
    refreshWatch(s);
    tacticalView.refresh();
  }
  for(const button of document.querySelectorAll('[data-station-area]:not(#messages-button)')){
    button.onclick=()=>button.dataset.stationArea==='command'?openBridge():selectArea(button.dataset.stationArea);
  }
  function selectDeckArea(id){
    if(id==='command')onOpenBriefing();
    else selectArea(id);
  }
  const mobileAreas=document.createElement('div');mobileAreas.className='bridge-mobile-areas';document.querySelector('.bridge-deck-panel').insertBefore(mobileAreas,document.querySelector('.bridge-deck-footer'));
  for(const station of bridgeAreas){
    const mobileButton=document.createElement('button');mobileButton.dataset.bridgeArea=station.id;mobileButton.style.setProperty('--station-color',station.color);mobileButton.setAttribute('aria-label',`Open ${station.name}`);
    const mobileIcon=document.createElement('span'),mobileName=document.createElement('strong'),mobileDescription=document.createElement('small');mobileIcon.className='bridge-area-icon';mobileIcon.setAttribute('aria-hidden','true');mobileIcon.textContent=station.symbol;mobileName.textContent=station.name;mobileDescription.textContent=station.summary;mobileDescription.id=`bridge-mobile-description-${station.id}`;mobileButton.setAttribute('aria-describedby',mobileDescription.id);mobileButton.append(mobileIcon,mobileName,mobileDescription);mobileButton.onclick=()=>selectDeckArea(station.id);mobileAreas.append(mobileButton);
    if(station.id==='command'){mobileButton.setAttribute('aria-haspopup','dialog');mobileButton.setAttribute('aria-controls','briefing-dialog');}
  }
  const acknowledgments=createStationAcknowledgments(()=>{
    Object.assign(state,battleStationsPreset.settings);
    Object.assign(combat.own,battleStationsPreset.emitters);
    syncPerformance();
    report('Bridge Command: Battle Stations ordered.');
    save();
  });
  const deckFooter=document.querySelector('.bridge-deck-footer');
  mountBridgeDeck({root:$('bridge-deck'),areas:bridgeAreas,onSelect:selectDeckArea,onTacticalOpen:direction=>tacticalView.open(direction),footer:deckFooter,acknowledgments});
  const tacticalView=mountTacticalView({flight,deck:$('bridge-deck'),targeting:tactical.hudTargeting,acknowledgments});
  const viewButton=document.createElement('button');viewButton.type='button';viewButton.className='bridge-action';viewButton.textContent='HUD · V';viewButton.setAttribute('aria-haspopup','dialog');viewButton.setAttribute('aria-controls','tactical-view-dialog');viewButton.onclick=()=>tacticalView.open();deckFooter.append(viewButton);
  $('bridge-game-guide').onclick=()=>$('how-to-play-dialog').showModal();
  $('bridge-game-history').onclick=()=>$('history-dialog').showModal();
  $('bridge-view-toggle').onclick=()=>{const root=$('bridge-console');root.dataset.view=root.dataset.view==='deck'?'station':'deck';updateViewButton();};
  updateViewButton();refresh();
  return {
    refresh,selectStation:select,selectArea,openBridge,toggleLocal:flight.toggle,setLocalRate:flight.setRate,
    revealedMission:()=>revealedPatrolMission(communications),
    isMissionWaypoint:waypoint=>missionMatchesWaypoint(revealedPatrolMission(communications),waypoint),
    updateMissions(){
      if(!pollPatrolMission(communications,missionContext(),missionStations))return;
      if(state.selected==='communications'&&document.body.dataset.screen==='bridge')commsConsole.refresh();
      communicationsChanged();
    },
    shipName:()=>playerShipName(combat),
    exportState:()=>({settings:{...state},sector:structuredClone(sector),tactical:tactical.exportState(),combat:structuredClone(combat),communications:structuredClone(communications)}),
    restoreState(saved){
      acknowledgments.clear();
      Object.assign(state,restoreBridgeState(saved.settings));sector=structuredClone(saved.sector);combat=structuredClone(saved.combat);syncPerformance();localElapsed=0;lastReview=null;
      areaStations[bridgeAreaFor(state.selected).id]=state.selected;
      scheduleRepairs(combat);
      communications=restoreCommunications(saved.communications);
      if(saved.settings?.selected==='security')tactical.openDefense();
      tactical.restoreState(saved.tactical,state.radarRange);notice='JSON save restored · flight paused.';
      renderControls();refresh();
    },
    localStatus:()=>({running:sector.running,mode:sector.order?.mode||'coast',time:sector.time,canEPD:shipPerformance(combat.own).epd&&!combat.docked&&combat.service?.provider!=='tender'&&!hasDeployedShuttles(combat),hull:combat.own.systems.hull.hp/combat.own.systems.hull.max,spares:combat.own.spares,core:combat.own.systems.reactor.hp>0}),
    pauseLocal(){sector.running=false;sector.status='Local simulation paused · flight order retained';refresh();},
    suspendLocal(headingToEarth){
      if(leavePatrolMission(communications,missionContext(),missionStations,headingToEarth))communicationsChanged();
      cancelSupportShip(combat);sector.running=false;coast(sector);ceaseFiring(combat);
      for(const ship of Object.values(combat.contacts))for(const mount of ship.mounts)delete mount.burst;
      combat.shots=[];combat.alliedOrders={};combat.own.burnThroughUntil=0;combat.own.chaffUntil=combat.own.flaresUntil=0;sector.status='EPD transit · local flight suspended';refresh();
    },
    arrive(location,waypoint){
      const mission=revealedPatrolMission(communications);
      if(missionMatchesWaypoint(mission,waypoint)){
        sector=createEncounterSector(location,mission.seed,mission.kind);
        mission.arrived=true;
      }else sector=createEncounterSector(location);
      changeEncounter(combat,sector.contacts);applyEncounterEvent(sector,combat);
      communications.encounter++;localElapsed=0;syncPerformance();tactical.reset();
      notice=`Arrived at ${location}. ${sector.encounter.summary} Damage and supplies retained.`;
      log(`Sensor watch at ${location}: ${sector.encounter.summary}`);refresh();
    },
    resetPatrol(name){
      acknowledgments.clear();
      Object.assign(state,restoreBridgeState());
      sector=createSector(earthPatrolContacts);
      combat=createCombat(sector.contacts);
      if(typeof name==='string')setPlayerShipName(combat,name);
      communications=createCommunications(playerShipName(combat));
      localElapsed=0;lastReview=null;notice='New patrol initialized. All stations ready.';
      syncPerformance();tactical.reset();renderControls();refresh();
    },
    advanceTransit(seconds){combat.time+=seconds;advanceMaintenance(combat,seconds);return combat.own.systems.hull.hp>0;},
    tick(seconds){
      if(snapshot().active || document.hidden || !sector.running)return 0;
      let advanced=0,remaining=Math.min(120,seconds*sector.rate);
      while(remaining>1e-8){
        const quantum=(combat.shots.length||combat.firing||combat.own.mounts.some(m=>m.burst)||combat.hostiles.length||Object.keys(combat.alliedOrders).length)? .05:.25;
        const dt=Math.min(quantum,remaining);
        const performance=syncPerformance();
        if(!sector.enginePerformance&&sector.order)coast(sector);
        const localSeconds=stepSector(sector,dt);
        recordPatrolSweep(communications,sector,combat.own.radar&&performance.sensors>0,localSeconds);
        advanced+=localSeconds;
        stepCombat(combat,sector,dt);
        remaining-=dt;
      }
      localElapsed+=seconds;
      if(document.body.dataset.screen==='bridge'&&state.selected==='tactical')tactical.refreshFlightTracks();
      tacticalView.refreshFlightTracks();
      if(localElapsed>=.35){localElapsed=0;if(pollCommunications(communications,communicationsContext()))save();commsAlerts.refresh();tacticalView.refresh();if(document.body.dataset.screen==='bridge'){if(state.selected==='tactical')tactical.refresh();if(state.selected==='engineering')damageConsole.refresh();if(state.selected==='communications')commsConsole.refresh();if(state.selected==='navigation')localConsole.refresh();}}
      return advanced;
    }
  };
}
