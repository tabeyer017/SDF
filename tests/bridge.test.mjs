import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeAreas, bridgeAreaFor, restoreBridgeState, flightControlState } from '../bridge-model.mjs';

test('bridge settings reject invalid saved station, watch, and control values',()=>{
  assert.deepEqual(restoreBridgeState({watch:'red',seat:'admiral',ops:'invalid',sensor:'unknown',temperature:'hot',selected:'missing'}),restoreBridgeState());
  assert.deepEqual(restoreBridgeState(null),restoreBridgeState());
  assert.equal(restoreBridgeState({temperature:500}).temperature,25);
  assert.equal(restoreBridgeState({temperature:-500}).temperature,18);
  const saved=restoreBridgeState({watch:'heightened',seat:'first-officer',ops:'sensors',sensor:'planetary',temperature:22,selected:'science'});
  assert.equal(saved.selected,'science');assert.equal(saved.watch,'heightened');assert.equal(saved.temperature,22);
});
test('helm engagement requires a valid plotted safe route and holds cannot start one',()=>{
  assert.equal(flightControlState({active:false,routeCount:0,unsafe:false}).canEngage,false);
  assert.equal(flightControlState({active:false,routeCount:2,unsafe:true}).canEngage,false);
  assert.equal(flightControlState({active:false,routeCount:2,unsafe:false}).canEngage,true);
  assert.equal(flightControlState({active:false,routeCount:NaN,unsafe:false}).canEngage,false);
  assert.deepEqual(flightControlState({active:true,routeCount:2,unsafe:false}),{canEngage:false,canPause:true,canAbort:true});
});

test('existing station selections reopen within the four areas without losing saved preferences',()=>{
  const memberships={command:'command',helm:'flight',navigation:'flight',tactical:'tactical-security',security:'tactical-security',science:'science-comms',communications:'science-comms',engineering:'engineering-support',ops:'engineering-support',environment:'engineering-support'};
  for(const [selected,area] of Object.entries(memberships)){
    const restored=restoreBridgeState({selected,temperature:23,seat:'first-officer',watch:'heightened',ops:'engineering',sensor:'planetary',radarRange:200});
    assert.equal(restored.selected,selected==='helm'?'navigation':selected);assert.equal(bridgeAreaFor(restored.selected).id,area);
    assert.equal(restored.temperature,23);assert.equal(restored.watch,'heightened');assert.equal(restored.radarRange,200);
  }
  assert.equal(bridgeAreas.length,5);assert.equal(bridgeAreaFor('missing').id,'command');
});

test('Flight Control offers System Map and one Local Flight tab, including legacy Helm selections',()=>{
  const state=restoreBridgeState({selected:'system-map'});assert.equal(state.selected,'system-map');
  assert.equal(bridgeAreaFor(state.selected).id,'flight');
  assert.deepEqual(bridgeAreaFor(state.selected).tabs,[['system-map','System Map'],['navigation','Local Flight']]);
  assert.equal(restoreBridgeState({selected:'helm'}).selected,'navigation');assert.equal(bridgeAreaFor('helm').id,'flight');
  const ids=bridgeAreas.flatMap(area=>area.tabs.map(([id])=>id));assert.equal(new Set(ids).size,ids.length);
});
