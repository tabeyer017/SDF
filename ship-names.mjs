export const pirateShipNames=[
  'The William','Happy Delivery','Liberty','Ranger','Space King','Delight','Marooner','Mercury','Ambrose Light','The Charles',
  'Speedy Return','Morning Star','Good Intent','Black Joke',"Ranger's Prize",'Defiant','Night Hawk','Black Swan','Swift','The Greyhound',
  'Flying Fish','Little Ranger','The Postillion','Black Robin','The Fortune','Snap Dragon','Space Nymph','The Spy','Rambler','The Hawk',
  'Scourge of the Coast','Viper','The Blackbird','The Lark','Nimble','The Weasel','The Ferret','The Arrow','Spitfire','The Dolphin',
  "Revenge's Prize",'The Tyger','The Swallow','The Hound','Siren','The Wolf','Gannet','The Kestrel','The Falcon','The Jackal'
];

// UNE military naming doctrine. SDF retains its existing service prefix.
export const shipNamingConventions={
  'sdf-heavy-cruiser':{category:'National capitals',names:['Nairobi','New Delhi','Tokyo','Brasília','Ottawa','Canberra','Pretoria','Paris']},
  'sdf-cruiser':{category:'States, provinces and regions',names:['Ontario','Quebec','Punjab','Hokkaido','Bavaria','Gauteng','Catalonia','Queensland']},
  'sdf-destroyer':{category:'Large world cities',names:['Shanghai','Mumbai','São Paulo','Lagos','Delhi','New York','Tokyo','Jakarta']},
  'sdf-frigate':{category:'Geographical features around the world',names:['Andes','Himalaya','Kilimanjaro','Sahara','Amazon','Nile','Great Barrier Reef','Grand Canyon','Alps','Gobi','Victoria Falls','Lake Baikal','Mariana Trench','Mount Fuji','Aoraki','Uluru']}
};
// Preserve older generated identities and translate saved player names to the new convention.
export const legacyFrigateNames=['Marie Curie','Albert Einstein','Isaac Newton','Katherine Johnson','Alan Turing','Nelson Mandela','Eleanor Roosevelt','Dwight Eisenhower'].map(name=>`SDF ${name}`);
export const shipNameOptions=classId=>(shipNamingConventions[classId]?.names??[]).map(name=>`SDF ${name}`);
export const defaultShipName=classId=>shipNameOptions(classId)[0]??shipNameOptions('sdf-frigate')[0];
export function migratePlayerShipName(classId,name){
  const choices=shipNameOptions(classId);
  if(choices.includes(name))return name;
  const previous=classId==='sdf-frigate'?legacyFrigateNames.indexOf(name):-1;
  return previous<0?null:choices[previous];
}
export const playerShipName=combat=>combat?.own?.name??defaultShipName(combat?.own?.classId??'sdf-frigate');
export function setPlayerShipName(combat,name){
  if(!shipNameOptions(combat.own.classId).includes(name))return false;
  combat.own.name=name;return true;
}
