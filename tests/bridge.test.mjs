import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreBridgeState, flightControlState } from '../bridge-model.mjs';

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
