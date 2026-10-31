import test from 'node:test';
import assert from 'node:assert/strict';
import { createSector, relativeContact, observeSector, issueManeuver, setManualHelm, coast, brake, addPatrolWaypoint, startPatrol, stepSector, maneuverTelemetry, predictedPath, segmentHitsHazard, sectorHazards, VECTOR_ACCELERATION } from '../sector-model.mjs';
import { contactDistance, contactClosureRate } from '../tactical-model.mjs';
import { sectorBodies, planetaryOverview } from '../sector-bodies.mjs';

test('planet and lunar arrivals preserve Earth–Moon separation with a chart origin above the surface',()=>{
  for(const location of ['Earth','Moon station']){
    const bodies=sectorBodies(location),earth=bodies.find(b=>b.id==='earth'),moon=bodies.find(b=>b.id==='moon');
    assert.ok(Math.abs(Math.hypot(earth.x-moon.x,earth.y-moon.y)-384400)<1e-6);
    const anchor=location==='Earth'?earth:moon;
    assert.ok(Math.abs(Math.hypot(anchor.x,anchor.y,anchor.z)-anchor.radius-100)<1e-6);
    const fit=planetaryOverview(bodies,{x:0,y:0,z:0});
    for(const body of bodies)for(const axis of ['x','y','z'])assert.ok(Math.abs(body[axis]-fit.center[axis])+body.radius<fit.radius);
  }
});

test('planetary references follow existing planetary settlements and omit deep space',()=>{
  for(const [location,planet,moon] of [['Mars colony','mars','phobos'],['Phobos station','mars','phobos'],['Ganymede station','jupiter','ganymede'],['Titan station','saturn','titan'],['Titania station','uranus','titania'],['Triton station','neptune','triton']]){
    const bodies=sectorBodies(location);
    assert.ok(bodies.some(b=>b.id===planet));assert.ok(bodies.some(b=>b.id===moon));
  }
  assert.equal(sectorBodies('Mercury').length,1);
  assert.deepEqual(sectorBodies('deep space'),[]);
  assert.deepEqual(sectorBodies('Alpha station'),[]);
  assert.equal(planetaryOverview([],{x:0,y:0,z:0}),null);
});

const target={id:'T-01',type:'neutral',shipType:'une-cargo',name:'Test cargo',registry:'TEST',iffRoll:0,x:0,y:40,z:10,vx:300,vy:600,vz:120};
function advance(sector,seconds){for(let t=0;t<seconds;t++)stepSector(sector,1);}

test('one fixed sector frame projects relative motion into the bow frame without changing range or Vc',()=>{
  const sector=createSector([target]);sector.own={x:5,y:-8,z:3,vx:50,vy:90,vz:-12};
  const initial=relativeContact(sector,target);sector.facing={x:1,y:0,z:1};
  const rotated=relativeContact(sector,target);
  assert.ok(Math.abs(contactDistance(rotated)-contactDistance(initial))<1e-10);
  assert.ok(Math.abs(contactClosureRate(rotated)-contactClosureRate(initial))<1e-9);
  assert.notEqual(rotated.y,initial.y);
});

test('coasting preserves momentum and paused sectors never advance',()=>{
  const sector=createSector([]);sector.own.vx=3600;
  assert.equal(stepSector(sector,10),0);assert.equal(sector.own.x,0);
  sector.running=true;coast(sector);stepSector(sector,10);
  assert.equal(sector.own.x,10);assert.equal(sector.own.vx,3600);
});

test('manual Helm cancels automatic orders and separates thrust from bow direction',()=>{
  const sector=createSector([target]);assert.equal(issueManeuver(sector,'maintain',target.id,25),true);
  assert.equal(setManualHelm(sector,{thrust:100,bearing:90,elevation:0,bow:0}),true);
  stepSector(sector,1);assert.equal(sector.order.mode,'manual');assert.ok(sector.own.vx>119);assert.ok(Math.abs(sector.own.vy)<1e-8);
  assert.deepEqual(sector.facing,{x:0,y:1,z:0});
  assert.ok(sector.own.vx<=VECTOR_ACCELERATION);
  assert.equal(setManualHelm(sector,{thrust:101}),false);
});

test('active braking removes velocity while coasting leaves it intact',()=>{
  const sector=createSector([]);sector.own.vx=1200;brake(sector);advance(sector,15);
  assert.equal(sector.own.vx,0);assert.ok(sector.own.x>0 && sector.own.x<2);
  assert.match(sector.status,/zero velocity/);
});

test('match velocity converges to all three target velocity components',()=>{
  const sector=createSector([target]);issueManeuver(sector,'match',target.id);advance(sector,60);
  for(const key of ['vx','vy','vz'])assert.ok(Math.abs(sector.own[key]-target[key])<.001);
  assert.ok(Math.abs(maneuverTelemetry(sector).closure)<.001);
});

test('maintain range converges to the requested separation while matching a moving target',()=>{
  const sector=createSector([target]);issueManeuver(sector,'maintain',target.id,25);advance(sector,180);
  const t=maneuverTelemetry(sector);assert.ok(Math.abs(t.distance-25)<.1,JSON.stringify(t));assert.ok(Math.abs(t.closure)<20);
});

test('intercept approaches a moving target and stops at five km standoff',()=>{
  const sector=createSector([{...target,x:-40,y:-20,z:5}]);issueManeuver(sector,'intercept',target.id);advance(sector,240);
  const t=maneuverTelemetry(sector);assert.ok(Math.abs(t.distance-5)<.1,JSON.stringify(t));assert.ok(Math.abs(t.closure)<20);
});

test('opening increases separation and break away produces negative Vc',()=>{
  const sector=createSector([{...target,x:-20,y:-20,z:0,vx:0,vy:0,vz:0}]);
  issueManeuver(sector,'open',target.id,50);advance(sector,140);
  assert.ok(maneuverTelemetry(sector).distance>49);
  issueManeuver(sector,'break',target.id);advance(sector,10);assert.ok(maneuverTelemetry(sector).closure<0);
});

test('sensor loss retains only the last known observation, and cancels a target maneuver',()=>{
  const sector=createSector([{...target,y:199,z:0,vx:0,vy:7200,vz:0}]);observeSector(sector);issueManeuver(sector,'match',target.id);
  advance(sector,3);assert.equal(observeSector(sector).length,0);assert.equal(sector.order,null);
  const known=sector.memory[target.id];assert.ok(known.position.y<=200);assert.ok(known.seen<sector.time);assert.match(sector.status,/Target lost/);
});

test('IFF memory retains verified identity, and never reveals identity of unseen distant contacts',()=>{
  const sector=createSector([{...target,y:50,z:0},{...target,id:'T-02',y:1000}]);assert.equal(observeSector(sector)[0].identified,true);
  sector.contacts[0].y=70;const observed=observeSector(sector)[0];assert.equal(observed.identified,true);assert.match(observed.iffStatus,/Previously/);
  assert.equal(sector.memory['T-02'],undefined);
});

test('patrol validates waypoints and completes the route with braking',()=>{
  const sector=createSector([]);assert.equal(addPatrolWaypoint(sector,{x:NaN,y:0,z:0}),false);
  assert.equal(addPatrolWaypoint(sector,{x:-10,y:10,z:5}),true);assert.equal(startPatrol(sector),true);advance(sector,200);
  assert.equal(sector.route.length,0);assert.equal(sector.order,null);assert.match(sector.status,/complete/);
  assert.ok(Math.hypot(sector.own.x+10,sector.own.y-10,sector.own.z-5)<.5);
});

test('Navigation brakes instead of flying an automatic route through a 3D hazard',()=>{
  const sector=createSector([]);addPatrolWaypoint(sector,{x:100,y:120,z:0});startPatrol(sector);advance(sector,120);
  assert.match(sector.safety,/Blocked/);assert.match(sector.status,/braking/);
  const hazard=sectorHazards[0];assert.ok(Math.hypot(sector.own.x-hazard.x,sector.own.y-hazard.y,sector.own.z-hazard.z)>hazard.radius);
  assert.equal(segmentHitsHazard({x:0,y:0,z:100},{x:100,y:120,z:100},hazard),false);
});

test('predictions do not mutate flight, sensor memory, orders, or the simulation clock',()=>{
  const sector=createSector([target]);issueManeuver(sector,'maintain',target.id,25);const before=structuredClone(sector);
  const path=predictedPath(sector);assert.equal(path.length,13);assert.notEqual(path.at(-1).y,0);assert.deepEqual(sector,before);
  assert.equal(issueManeuver(sector,'maintain','missing',25),false);assert.equal(issueManeuver(sector,'maintain',target.id,1),false);
});
