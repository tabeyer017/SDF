import test from 'node:test';
import assert from 'node:assert/strict';
import { at, distance, advance } from '../navigation.mjs';
import { createSettlements, settlementCallout, formatDistance, ARRIVAL_EPSILON_AU } from '../settlements.mjs';

const planets=[['earth',1,40],['mars',1.52,-45],['jupiter',5.2,153],['saturn',9.58,24],['uranus',19.2,-124],['neptune',30.05,-25]].map(([id,au,angle])=>({id,name:id,...at(au,angle)}));
const sites=createSettlements(planets);

test('settlement network has the Mars colony and all six requested moon stations',()=>{
  assert.equal(sites.length,7);
  assert.deepEqual(sites.filter(site=>site.kind==='station').map(site=>[site.parentId,site.moon]),[
    ['earth','Moon'],['mars','Phobos'],['jupiter','Ganymede'],['saturn','Titan'],['uranus','Titania'],['neptune','Triton']
  ]);
  assert.equal(sites.find(site=>site.id==='moon-station').size,'large');
  assert.equal(sites.find(site=>site.kind==='colony').parentId,'mars');
});
test('local colony and moon transfers stay distinct and can be completed',()=>{
  const mars=planets.find(planet=>planet.id==='mars');
  for(const site of sites.filter(site=>site.parentId==='mars')){
    const length=distance(mars,site);
    assert.ok(length>ARRIVAL_EPSILON_AU && length<.001);
    assert.match(formatDistance(length),/km$/);
    const result=advance(mars,[site],length);
    assert.equal(result.reached,1);
    assert.equal(result.position.id,site.id);
  }
});
test('site markers stay close on their parent orbit without changing navigation coordinates',()=>{
  for(const site of sites){
    const original={x:site.x,y:site.y};
    const callout=settlementCallout(site,planets);
    assert.deepEqual({x:site.x,y:site.y},original);
    assert.ok(Math.abs(Math.hypot(callout.x,callout.y)-Math.hypot(callout.origin.x,callout.origin.y))<1e-9);
    const separation=distance(callout,callout.origin);
    assert.ok(separation>30 && separation<40);
  }
  const colony=settlementCallout(sites.find(site=>site.id==='mars-colony'),planets);
  const phobos=settlementCallout(sites.find(site=>site.id==='phobos-station'),planets);
  assert.ok(distance(colony,phobos)>60);
});
