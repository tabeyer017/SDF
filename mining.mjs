import { at } from './navigation.mjs';

export const CONTRACT_AUTHORITY = 'United Nations of Earth';
export const MINING_SYMBOL_PATH = 'M-8-5 0-10 8-5V5L0 10-8 5ZM-5 5 4-4M-4-5Q2-8 6-1';
export const miningCompanies = [
  { id:'asterion', name:'Asterion Resource Group', code:'ARG', color:'#d5af78' },
  { id:'helios', name:'Helios Deepcore Industries', code:'HDI', color:'#84c7bd' },
  { id:'peregrine', name:'Peregrine Beltworks', code:'PBW', color:'#bca5d6' },
  { id:'vulcan', name:'Vulcan Frontier Mining', code:'VFM', color:'#8eaed3' }
];

// Sixteen Greek-letter names written with Latin letters, ending with Omega.
const names=['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Omega'];
export const miningStations = names.map((letter,index)=>{
  const company=miningCompanies[Math.floor(index/4)];
  const au=[2.45,2.85,2.6,3.1][index%4];
  return {
    id:`mine-${letter.toLowerCase()}`, name:`${letter} station`, letter, kind:'mining',
    companyId:company.id, companyName:company.name, companyCode:company.code,
    color:company.color, au, ...at(au,8+index*22.5), type:'MINING STATION · UNE CONTRACT',
    contract:{ id:`UNE-MIN-2250-${String(index+1).padStart(3,'0')}`, issuer:CONTRACT_AUTHORITY, status:'Active' },
    description:`An asteroid-belt mining station owned by ${company.name}, operating under a mining contract issued by the ${CONTRACT_AUTHORITY} government.`
  };
});
