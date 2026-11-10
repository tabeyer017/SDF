import {shipTypes,shuttleTypes} from './tactical-model.mjs';

export const boardingOrders=[['capture','Capture ship'],['explore','Explore / search'],['assist','Assist crew']];
// Provisional local-game timing: km/second and simulated seconds.
export const boardingBalance={speed:1.2,range:10,hangar:10,hatch:15,'hull-cut':30,capture:60,explore:45,assist:45};
const axes=['x','y','z'];
const gap=(a,b)=>Math.hypot(...axes.map(axis=>a[axis]-b[axis]));
const validOrder=order=>boardingOrders.some(([id])=>id===order);
export const hasDeployedShuttles=combat=>combat.boarding?.shuttles.some(shuttle=>shuttle.status!=='ready')??false;
export function createBoarding(own){
  const count=shipTypes[own.classId].hangar?.shuttles??0;
  return {shuttles:Array.from({length:count},(_,i)=>({number:i+1,status:'ready',order:'capture',targetId:null,targetName:'',x:0,y:0,z:0,elapsed:0,entry:null,blocked:false,result:''})),captured:[],reports:[],nextReport:1};
}
function report(combat,subject,body,targetId){
  const state=combat.boarding;state.reports.push({id:state.nextReport++,subject,body,time:combat.time,reported:false,...(targetId?{targetId}:{})});state.reports=state.reports.slice(-100);
}
export function shuttleStatus(shuttle){
  if(shuttle.status==='ready')return 'Ready · 10 marines';
  const phase=shuttle.status==='outbound'?'Outbound':shuttle.status==='returning'?'Returning':shuttle.blocked?'Resistance · awaiting support / recall':shuttle.elapsed<boardingBalance[shuttle.entry]?'Boarding via '+({'hull-cut':'sealed cutting collar',hatch:'hatch',hangar:'hangar'}[shuttle.entry]):boardingOrders.find(([id])=>id===shuttle.order)[1];
  return `${phase} · ${shuttle.targetName}`;
}
export function boardingLaunchError(combat,sector,number,order,target,inTransit=false){
  const shuttle=combat.boarding?.shuttles.find(item=>item.number===number);
  if(!shuttle)return 'Shuttle unavailable.';
  if(shuttle.status!=='ready')return 'This shuttle is deployed. Recall it from Comms or wait for its return.';
  if(!validOrder(order))return 'Choose shuttle orders.';
  if(inTransit)return 'Recover all shuttles before EPD transit; launches are unavailable in transit.';
  if(combat.own.systems.hull.hp<=0||combat.own.systems.power.hp<=0||combat.own.systems.reactor.hp<=0)return 'Shuttle launch control is offline.';
  if(combat.docked||combat.service)return 'Undock and end service before launching a shuttle.';
  if(!target||target.stale||!combat.contacts[target.id]||!sector.contacts.some(contact=>contact.id===target.id))return 'Select a live ship on radar or HUD.';
  if(Math.hypot(target.x,target.y,target.z)>boardingBalance.range)return `Approach within ${boardingBalance.range} km before launching a shuttle.`;
  const complement=shipTypes[combat.own.classId].boarding?.personnel??0;
  const deployed=combat.boarding.shuttles.filter(item=>item.status!=='ready').length*shuttleTypes.shuttle.troopCapacity;
  if(deployed+10>complement)return 'Fewer than 10 marines remain aboard.';
  if(order==='capture'&&combat.boarding.captured.includes(target.id))return 'This ship is already captured. Choose Explore or Assist.';
  if(order==='capture'&&target.type==='friendly')return 'Friendly ship: choose Explore or Assist.';
  return null;
}
export function launchShuttle(combat,sector,number,order,target,inTransit=false){
  const error=boardingLaunchError(combat,sector,number,order,target,inTransit);if(error)return {ok:false,message:error};
  const shuttle=combat.boarding.shuttles.find(item=>item.number===number);
  Object.assign(shuttle,{status:'outbound',order,targetId:target.id,targetName:target.name,elapsed:0,entry:null,blocked:false,result:''},Object.fromEntries(axes.map(axis=>[axis,sector.own[axis]])));
  sector.running=true;
  const message=`Shuttle ${number} launched · 10 marines · ${boardingOrders.find(([id])=>id===order)[1]} · ${target.name}.`;
  report(combat,`Shuttle ${number} launched`,message);return {ok:true,message};
}
export function recallShuttle(combat,sector,number,inTransit=false){
  const shuttle=combat.boarding?.shuttles.find(item=>item.number===number);
  if(!shuttle||shuttle.status==='ready'||shuttle.status==='returning')return {ok:false,message:'This shuttle is ready or already returning.'};
  if(inTransit||combat.own.systems.communications.hp<=0||combat.own.systems.power.hp<=0||combat.own.systems.reactor.hp<=0)return {ok:false,message:'Recall requires local communications and power.'};
  shuttle.status='returning';shuttle.blocked=false;shuttle.result='Recalled';sector.running=true;
  const message=`Shuttle ${number}: recall acknowledged. Returning with all 10 marines from ${shuttle.targetName}.`;
  report(combat,`Shuttle ${number} recalled`,message);return {ok:true,message};
}
function travel(shuttle,destination,seconds){
  const distance=gap(shuttle,destination),step=Math.min(distance,boardingBalance.speed*seconds);
  if(distance)for(const axis of axes)shuttle[axis]+=(destination[axis]-shuttle[axis])*step/distance;
  return distance<=boardingBalance.speed*seconds+.05;
}
export function advanceBoarding(combat,sector,seconds,onCapture){
  if(!Number.isFinite(seconds)||seconds<=0)return;
  if(!hasDeployedShuttles(combat))return;
  for(const shuttle of combat.boarding.shuttles){
    if(shuttle.status==='ready')continue;
    const target=sector.contacts.find(contact=>contact.id===shuttle.targetId),ship=combat.contacts[shuttle.targetId];
    if(!target||!ship){shuttle.status='returning';shuttle.result='Target unavailable';}
    if(shuttle.status==='returning'){
      if(travel(shuttle,sector.own,seconds)){
        report(combat,`Shuttle ${shuttle.number} returned`,`Shuttle ${shuttle.number} recovered with all 10 marines. ${shuttle.result||'Mission ended'}. Ready for launch.`,shuttle.targetId);
        Object.assign(shuttle,{status:'ready',targetId:null,targetName:'',elapsed:0,entry:null,blocked:false});
      }
      continue;
    }
    if(shuttle.status==='outbound'){
      if(!travel(shuttle,target,seconds))continue;
      shuttle.status='boarding';shuttle.elapsed=0;
      const cooperative=ship.surrendered||target.type!=='enemy'||combat.boarding.captured.includes(target.id);
      shuttle.entry=cooperative?(shipTypes[ship.classId].hangar?.bays?'hangar':'hatch'):'hull-cut';
      report(combat,`Shuttle ${shuttle.number} boarding`,`Shuttle ${shuttle.number} at ${shuttle.targetName}: entering via ${shuttle.entry==='hull-cut'?'a sealed hull-cutting collar':shuttle.entry==='hatch'?'an external hatch':'the hangar'}. No hangar is required for boarding.`);
      continue;
    }
    for(const axis of axes)shuttle[axis]=target[axis];
    shuttle.elapsed=Math.min(600,shuttle.elapsed+seconds);
    if(shuttle.elapsed<boardingBalance[shuttle.entry]+boardingBalance[shuttle.order])continue;
    if(shuttle.order==='capture'&&!combat.boarding.captured.includes(target.id)){
      const force=combat.boarding.shuttles.filter(item=>item.targetId===target.id&&item.status==='boarding'&&item.order==='capture'&&item.elapsed>=boardingBalance[item.entry]).length*10;
      const disabled=ship.systems.bridge.hp<=0||ship.systems.power.hp<=0||ship.systems.reactor.hp<=0;
      const resistance=ship.surrendered||disabled?0:Math.max(10,shipTypes[ship.classId].boarding?.personnel??10)*Math.max(.25,ship.systems.hull.hp/ship.systems.hull.max);
      if(force<resistance){
        if(!shuttle.blocked)report(combat,`Shuttle ${shuttle.number}: resistance`,`Capture resisted aboard ${shuttle.targetName}. ${force} marines cannot secure the remaining defenders. Team holding at the entry point; weaken the ship, obtain surrender, reinforce, or recall from Comms.`);
        shuttle.blocked=true;continue;
      }
      onCapture?.(target.id);combat.boarding.captured.push(target.id);
      shuttle.result='Ship captured · weapons secured';
    }else if(shuttle.order==='explore'){
      shuttle.result=`Exploration complete · ${shipTypes[ship.classId].label} · hull ${Math.round(ship.systems.hull.hp/ship.systems.hull.max*100)}% · ${ship.fire?'fire detected':'no fire'} · ${ship.breach?'pressure loss detected':'pressure secure'}`;
    }else if(shuttle.order==='assist'){
      ship.fire=false;ship.breach=false;shuttle.result='Crew assistance complete · fires contained and bulkheads sealed';
    }else shuttle.result='Ship secured';
    report(combat,`Shuttle ${shuttle.number}: mission complete`,`${shuttle.targetName}: ${shuttle.result}. Shuttle ${shuttle.number} and 10 marines returning.`,shuttle.targetId);
    shuttle.status='returning';shuttle.blocked=false;
  }
}

export function restoreBoarding(saved,combat,contacts){
  const initial=createBoarding(combat.own);if(saved===undefined)return initial;
  const check=ok=>{if(!ok)throw new Error('Invalid boarding / combat data in save file.');};
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const text=(value,max)=>{check(typeof value==='string'&&value.length<=max);return value;};
  const num=(value,min,max)=>{check(Number.isFinite(value)&&value>=min&&value<=max);return value;};
  check(object(saved)&&Array.isArray(saved.shuttles)&&saved.shuttles.length===initial.shuttles.length);
  initial.shuttles=saved.shuttles.map((item,index)=>{
    check(object(item)&&item.number===index+1&&['ready','outbound','boarding','returning'].includes(item.status)&&validOrder(item.order)&&typeof item.blocked==='boolean');
    check(item.status==='ready'?item.targetId===null&&item.entry===null&&item.elapsed===0&&!item.blocked:contacts.some(contact=>contact.id===item.targetId));
    check(item.entry===null||['hangar','hatch','hull-cut'].includes(item.entry));check(item.status!=='boarding'||item.entry!==null);
    check(!item.blocked||item.status==='boarding'&&item.order==='capture');
    const shuttle={number:item.number,status:item.status,order:item.order,targetId:item.targetId,targetName:text(item.targetName,150),elapsed:num(item.elapsed,0,600),entry:item.entry,blocked:item.blocked,result:text(item.result,500)};
    for(const axis of axes)shuttle[axis]=num(item[axis],-1e12,1e12);return shuttle;
  });
  check(initial.shuttles.filter(item=>item.status!=='ready').length*10<=(shipTypes[combat.own.classId].boarding?.personnel??0));
  check(Array.isArray(saved.captured)&&saved.captured.length<=contacts.length&&new Set(saved.captured).size===saved.captured.length);
  initial.captured=saved.captured.map(id=>{check(contacts.some(contact=>contact.id===id)&&combat.contacts[id].surrendered);return id;});
  check(Number.isSafeInteger(saved.nextReport)&&saved.nextReport>=1);initial.nextReport=saved.nextReport;
  check(Array.isArray(saved.reports)&&saved.reports.length<=100);const seen=new Set();
  initial.reports=saved.reports.map(item=>{
    check(object(item)&&Number.isSafeInteger(item.id)&&item.id>=1&&item.id<initial.nextReport&&!seen.has(item.id)&&typeof item.reported==='boolean');seen.add(item.id);
    if(item.targetId!==undefined)check(contacts.some(contact=>contact.id===item.targetId));
    return {id:item.id,subject:text(item.subject,150),body:text(item.body,1500),time:num(item.time,0,combat.time),reported:item.reported,...(item.targetId?{targetId:item.targetId}:{})};
  });
  return initial;
}
