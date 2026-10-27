import test from 'node:test';
import assert from 'node:assert/strict';
import { at, distance, mapPoint, unmapPoint, nearSol, routeDistance, advance, EPD_AU_PER_DAY } from '../navigation.mjs';

test('compressed map coordinates round-trip across the patrol area',()=>{
  for(const au of [.18,.39,1,5.2,30.05,120])for(const angle of [0,40,143,270]){
    const p=at(au,angle),q=unmapPoint(mapPoint(p));assert.ok(distance(p,q)<1e-9);
  }
});
test('outer boundary is reachable in just over one month',()=>{
  assert.ok(120/EPD_AU_PER_DAY>30 && 120/EPD_AU_PER_DAY<35);
});
test('solar exclusion catches a crossing and accepts a safe detour',()=>{
  assert.equal(nearSol({x:1,y:0},{x:-1,y:0}),true);
  assert.equal(nearSol({x:1,y:0},{x:0,y:1}),false);
  assert.equal(nearSol({x:.1,y:0},{x:.1,y:0}),true);
  assert.equal(nearSol({x:1,y:0},{x:1,y:0}),false);
});
test('travel advances through multiple waypoints without overshooting',()=>{
  const origin={x:0,y:1},points=[{x:3,y:1,name:'A'},{x:3,y:5,name:'B'}];
  assert.equal(routeDistance(origin,points),7);
  const partial=advance(origin,points,5);assert.equal(partial.reached,1);assert.deepEqual(partial.position,{x:3,y:3});
  const complete=advance(origin,points,20);assert.equal(complete.reached,2);assert.equal(complete.position.name,'B');
});
test('empty, zero-length, and exact arrivals remain stable',()=>{
  assert.deepEqual(advance({x:1,y:1},[],10),{position:{x:1,y:1},reached:0});
  assert.equal(advance({x:1,y:1},[{x:1,y:1}],0).reached,1);
  assert.equal(advance({x:0,y:1},[{x:3,y:1}],3).reached,1);
});
