import test from 'node:test';
import assert from 'node:assert/strict';
import { miningCompanies, miningStations, CONTRACT_AUTHORITY } from '../mining.mjs';
import { distance, advance } from '../navigation.mjs';

test('exactly four companies each own four of the sixteen distinct stations',()=>{
  assert.equal(miningCompanies.length,4);
  assert.equal(miningStations.length,16);
  assert.equal(new Set(miningStations.map(site=>site.id)).size,16);
  assert.equal(new Set(miningStations.map(site=>site.name)).size,16);
  for(const company of miningCompanies)assert.equal(miningStations.filter(site=>site.companyId===company.id).length,4);
});
test('all stations lie in the displayed asteroid belt and are separate navigation targets',()=>{
  for(const [i,site] of miningStations.entries()){
    const au=Math.hypot(site.x,site.y);
    assert.ok(au>=2.2 && au<=3.3);
    for(const other of miningStations.slice(i+1))assert.ok(distance(site,other)>.1);
  }
  const start=miningStations[0],end=miningStations[1];
  const arrival=advance(start,[end],distance(start,end));
  assert.equal(arrival.reached,1);
  assert.equal(arrival.position.id,end.id);
});
test('every mining station has a unique active contract issued by the UNE government',()=>{
  assert.equal(new Set(miningStations.map(site=>site.contract.id)).size,16);
  for(const site of miningStations){
    assert.equal(site.contract.issuer,CONTRACT_AUTHORITY);
    assert.equal(site.contract.status,'Active');
    assert.match(site.contract.id,/^UNE-MIN-2100-\d{3}$/);
    assert.ok(miningCompanies.some(company=>company.id===site.companyId && company.name===site.companyName));
  }
});
