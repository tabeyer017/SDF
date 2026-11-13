// A lightweight, perspective-projected bridge. Furniture and glazing share the
// same world coordinates; SVG keeps the station controls keyboard accessible.
const NS = 'http://www.w3.org/2000/svg';
const project = ([x,y,z]) => {
  const scale = 900 / (18 - z * .7);
  return [500 + x * scale, 338 + (z * .58 - y) * scale];
};
const node = (tag,attrs={},text) => {
  const element=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(attrs))element.setAttribute(key,value);
  if(text!==undefined)element.textContent=text;
  return element;
};
const points = vertices => vertices.map(point=>project(point).map(n=>n.toFixed(2)).join(',')).join(' ');
const polygon = (parent,vertices,fill,attrs={}) => {
  const face=node('polygon',{points:points(vertices),fill,...attrs});parent.append(face);return face;
};
const line = (parent,vertices,stroke,width=1,attrs={}) => {
  const path=node('polyline',{points:points(vertices),fill:'none',stroke,'stroke-width':width,...attrs});parent.append(path);return path;
};

function addConsoleDisplay(parent,world,color){
  const surface=([x,z])=>world([x,.88-(z+.88)*.11/.74,z]);
  const panel=(x,z,w,d,fill,attrs={})=>polygon(parent,[[x,z],[x+w,z],[x+w,z+d],[x,z+d]].map(surface),fill,attrs);
  const trace=(vertices,stroke=color,width=.75,opacity=.9)=>line(parent,vertices.map(surface),stroke,width,{opacity});
  for(const [x,w] of [[-.55,.23],[-.29,.58],[.32,.23]]){
    panel(x,-.83,w,.47,'url(#bridge-screen-glass)',{stroke:color,'stroke-width':.8});
    panel(x+.025,-.79,w-.05,.035,color,{opacity:.55});
  }
  for(let i=0;i<4;i++){
    const z=-.69+i*.07;
    panel(-.52,z,.15-(i%3)*.035,.019,color,{opacity:.4+i*.13});
    panel(.35,z,.035,.022,i===1?'#e0b879':color,{opacity:.8});
    panel(.405,z,.10-(i%2)*.035,.019,color,{opacity:.35});
  }
  for(const x of [-.2,0,.2])trace([[x,-.71],[x,-.41]],color,.5,.3);
  for(const z of [-.67,-.56,-.45])trace([[-.25,z],[.25,z]],color,.5,.35);
  trace([[-.24,-.54],[-.16,-.54],[-.09,-.63],[-.015,-.47],[.065,-.58],[.15,-.56],[.23,-.66]]);
  for(let i=0;i<7;i++)panel(-.51+i*.15,-.29,.09,.035,i===3?'#e1b878':color,{opacity:i===3?.9:.45});
}

function furniture(parent,x,z,angle,color,commander=false) {
  const faces=[],turn=angle*Math.PI/180;
  const world=([u,v,w])=>[x+u*Math.cos(turn)+w*Math.sin(turn),v,z+w*Math.cos(turn)-u*Math.sin(turn)];
  const face=(vertices,fill,attrs={},decorate)=>faces.push({vertices:vertices.map(world),fill,attrs,decorate});
  const box=(cx,cy,cz,w,h,d,palette,attrs={})=>{
    const x0=cx-w/2,x1=cx+w/2,y0=cy,y1=cy+h,z0=cz-d/2,z1=cz+d/2;
    const [top,front,side]=palette;
    face([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]],side,attrs);
    face([[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1]],side,attrs);
    face([[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]],side,attrs);
    face([[x0,y0,z1],[x0,y1,z1],[x1,y1,z1],[x1,y0,z1]],front,attrs);
    face([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],top,attrs);
  };
  const metal=['#536575','#263440','#1c2833'],cushion=commander?['#334451','#202e3a','#16222d']:['#526574','#344653','#23323e'];
  const base=commander ? .29 : 0;
  // Pedestal, seat cushion, high back, headrest, and two armrests.
  const foot=Array.from({length:12},(_,i)=>world([Math.cos(i*Math.PI/6)*.42,.035+base,.7+Math.sin(i*Math.PI/6)*.42]));
  polygon(parent,foot,'#111c25',{stroke:'#425360','stroke-width':1});
  box(0,.03+base,.7,.16,.43,.16,metal);
  box(0,.45+base,.64,.63,.16,.64,cushion,{'class':'bridge-seat'});
  box(0,.57+base,.91,.63,.79,.17,cushion,{'class':'bridge-seat'});
  box(0,1.36+base,.91,.44,.18,.18,cushion);
  for(const side of [-1,1]){
    box(side*.39,.42+base,.65,.08,.32,.08,metal);
    box(side*.39,.73+base,.56,.16,.1,.59,metal);
    box(side*.39,.837+base,.38,.1,.012,.13,[color,color,color]);
  }
  // A sloping display and a solid console cabinet in front of every chair.
  if(!commander){
    box(0,0,-.53,1.16,.78,.63,['#4b5e6c','#263644','#172633'],{'class':'bridge-furniture-shell'});
    const display=[[-.63,.88,-.88],[.63,.88,-.88],[.63,.77,-.14],[-.63,.77,-.14]];
    face(display,'#263946',{'class':'bridge-furniture-shell'},()=>addConsoleDisplay(parent,world,color));
    box(0,.66,-.205,1.03,.04,.025,[color,color,color],{'class':'bridge-console-light'});
  }
  faces.sort((a,b)=>{
    const depth=f=>f.vertices.reduce((sum,[,y,z])=>sum+z+y*.62,0)/f.vertices.length;
    return depth(a)-depth(b);
  });
  for(const item of faces){
    polygon(parent,item.vertices,item.fill,{'stroke':'#0c151d','stroke-width':.65,'stroke-linejoin':'round',...item.attrs});
    item.decorate?.();
  }
}

function decorateTacticalScreen(screen,direction){
  screen.append(node('rect',{width:640,height:160,rx:6,fill:'#071019',stroke:'#425b68','stroke-width':5}));
  const display=node('g',{'aria-hidden':'true','pointer-events':'none'});screen.append(display);
  display.append(
    node('rect',{x:10,y:10,width:620,height:140,rx:3,fill:'url(#bridge-screen-glass)',stroke:'#426472','stroke-width':1.5}),
    node('text',{x:27,y:36,class:'bridge-monitor-label'},direction.toUpperCase()),
    node('path',{d:'M24 48H616M465 49V140',stroke:'#426472','stroke-width':1,fill:'none'}),
    node('path',{d:'M42 96H223M253 96H438',stroke:'#6fa7b5','stroke-width':2,'stroke-dasharray':'8 5',fill:'none'}),
    node('path',{d:'M207 96H229M247 96H269M238 74V87M238 105V118',stroke:'#dbf3f4','stroke-width':3,fill:'none'}),
    node('path',{d:'M219 63H257M225 76H251M225 116H251M219 129H257M85 91V101M391 91V101',stroke:'#86b9c5','stroke-width':1.7,fill:'none'}),
    node('path',{d:'M48 61H105M48 67H79M48 125H101M48 132H70M374 61H429M400 67H429M391 126H429M408 133H429',stroke:'#567b88','stroke-width':1.6,fill:'none'}),
    node('circle',{cx:608,cy:28,r:4,class:'bridge-monitor-indicator'})
  );
  const radar=node('g',{transform:'translate(546 98)',fill:'none',stroke:'#6093a0','stroke-width':1.4});display.append(radar);
  radar.append(node('circle',{r:37}),node('circle',{r:24}),node('circle',{r:11}),node('path',{d:'M-37 0H37M0-37V37',opacity:.55}));
  const sweep=node('g',{class:'bridge-monitor-sweep'});radar.append(sweep);
  sweep.append(
    node('path',{d:'M0 0L-20-31A37 37 0 0 1 0-37Z',fill:'#7ddee5',opacity:.20,stroke:'none'}),
    node('path',{d:'M0 0V-37',stroke:'#94edf1','stroke-width':2})
  );
}

function deckDefinitions(){
  const defs=node('defs');
  function radial(id,attrs,stops){
    const gradient=node('radialGradient',{id,...attrs});
    for(const [offset,color,opacity] of stops)gradient.append(node('stop',{offset,'stop-color':color,'stop-opacity':opacity}));
    defs.append(gradient);
  }
  radial('bridge-deck-floor',{cx:'50%',cy:'29%',r:'82%'},[['0%','#385363',1],['58%','#203342',1],['100%','#101d2a',1]]);
  radial('bridge-deck-ambient',{cx:'50%',cy:'42%',r:'53%'},[['0%','var(--deck-ambient)',.30],['52%','var(--deck-ambient)',.11],['100%','var(--deck-ambient)',0]]);
  radial('bridge-screen-glass',{cx:'47%',cy:'35%',r:'75%'},[['0%','#1b3c49',1],['100%','#061420',1]]);
  const glow=node('filter',{id:'bridge-light-glow',filterUnits:'userSpaceOnUse',x:-55,y:-70,width:1110,height:780});
  glow.append(node('feGaussianBlur',{in:'SourceGraphic',stdDeviation:3.1,result:'halo'}));
  const merge=node('feMerge');merge.append(node('feMergeNode',{in:'halo'}),node('feMergeNode',{in:'SourceGraphic'}));glow.append(merge);
  defs.append(glow);
  return defs;
}

function drawCommandCompass(room){
  const compass=node('g',{class:'bridge-command-compass','aria-hidden':'true'});room.append(compass);
  const centerZ=1.10;
  const ringPoint=(angle,radius)=>[Math.sin(angle)*radius,.026,centerZ-Math.cos(angle)*radius];
  for(const radius of [1.86,2.25]){
    const ring=Array.from({length:73},(_,i)=>ringPoint(i*Math.PI/36,radius));
    line(compass,ring,'currentColor',radius>2?1.2:.8,{opacity:radius>2?.65:.44,'stroke-dasharray':radius>2?'none':'3 6'});
  }
  for(let i=0;i<36;i++){
    const angle=i*Math.PI/18,cardinal=i%9===0;
    line(compass,[ringPoint(angle,cardinal?2.02:2.13),ringPoint(angle,2.24)],'currentColor',cardinal?2:1,{opacity:cardinal?.93:.55});
  }
  const [x,y]=project(ringPoint(0,2.47));
  compass.append(node('path',{d:`M${x-5} ${y+4}L${x} ${y-3}L${x+5} ${y+4}Z`,fill:'currentColor',opacity:.8}));
}

export function createStationAcknowledgments(applyPreset) {
  const replies = [
    'Flight Control · Helm standing by',
    'Tactical · Weapons crews at stations',
    'Security · Marines standing by',
    'Communications · Channels monitored',
    'Engineering · Damage control standing by',
    'Science · Long-range watch assigned',
    'Operations · Engineering readiness prioritized',
    'Life Support · Damage-control liaison standing by'
  ];
  const views = [];
  let timer, message = '';
  function update(text) {
    message = text;
    for (const view of views) view.textContent = text;
  }
  function activate() {
    clearTimeout(timer);
    applyPreset();
    let next = 0;
    update('Battle Stations ordered · awaiting station acknowledgments');
    function acknowledge() {
      update(replies[next++]);
      if (next < replies.length) timer = setTimeout(acknowledge, 1500);
      else timer = setTimeout(() => update('Battle Stations · all officers acknowledged'), 1500);
    }
    timer = setTimeout(acknowledge, 600);
  }
  return {
    activate,
    mount(root) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bridge-action';
      button.textContent = 'Battle Stations';
      const ticker = document.createElement('p');
      ticker.className = 'station-acknowledgment';
      ticker.setAttribute('role','status');
      ticker.setAttribute('aria-label','Station Officer Acknowledgment Ticker');
      ticker.textContent = message;
      views.push(ticker);
      button.onclick = activate;
      root.append(button,ticker);
    },
    clear() { clearTimeout(timer); update(''); }
  };
}

export function mountBridgeDeck({root,areas,onSelect,onTacticalOpen,footer,acknowledgments}) {
  acknowledgments.mount(footer);
  root.replaceChildren();
  root.setAttribute('viewBox','30 -42 940 700');
  root.setAttribute('aria-label','Perspective view of the bridge with forward, port, and starboard tactical screen panels above the windows, nine seated crew consoles, and a central commander chair. Select a station to open its controls or a screen to open the tactical view.');
  const defs=deckDefinitions();root.append(defs);
  const room=node('g',{'aria-hidden':'true'}),tacticalScreens=node('g');root.append(room,tacticalScreens);
  const hull=[[-4.4,0,-5],[4.4,0,-5],[6,0,-3],[6,0,5.4],[4.8,0,6.1],[-4.8,0,6.1],[-6,0,5.4],[-6,0,-3]];
  // Visible hull thickness makes the open aft edge read as a cutaway.
  for(let i=0;i<hull.length;i++){
    const a=hull[i],b=hull[(i+1)%hull.length];
    polygon(room,[a,b,[b[0],-.3,b[2]],[a[0],-.3,a[2]]],'#0a141e',{stroke:'#344957'});
  }
  polygon(room,hull,'url(#bridge-deck-floor)',{stroke:'#526773','stroke-width':2});
  polygon(room,hull,'url(#bridge-deck-ambient)');
  const floorClip=node('clipPath',{id:'bridge-floor-clip'});floorClip.append(node('polygon',{points:points(hull)}));defs.append(floorClip);
  const seams=node('g',{'clip-path':'url(#bridge-floor-clip)'});room.append(seams);
  for(let z=-4;z<=5;z+=1)line(seams,[[-5.7,.005,z],[5.7,.005,z]],'#688391',.6,{opacity:.16});
  for(let x=-5;x<=5;x+=1)line(seams,[[x,.005,-4.8],[x,.005,5.8]],'#688391',.6,{opacity:.16});
  // Port, forward bevels, front, and starboard walls. The aft wall is cut away.
  const walls=[[hull[6],hull[7]],[hull[7],hull[0]],[hull[0],hull[1]],[hull[1],hull[2]],[hull[2],hull[3]]];
  const overheadLights=node('g',{class:'bridge-overhead-lights',filter:'url(#bridge-light-glow)'});
  let windowIndex=0;
  for(const [a,b] of walls){
    const at=(t,y)=>[a[0]+(b[0]-a[0])*t,y,a[2]+(b[2]-a[2])*t];
    polygon(room,[at(0,0),at(1,0),at(1,4.95),at(0,4.95)],'#253541',{stroke:'#667a86','stroke-width':1.2});
    polygon(room,[at(0,.13),at(1,.13),at(1,1.25),at(0,1.25)],'#1a2935',{stroke:'#3e5260','stroke-width':.8});
    polygon(room,[at(.012,3.51),at(.988,3.51),at(.988,4.9),at(.012,4.9)],'#182733',{stroke:'#4b6170','stroke-width':1});
    line(room,[at(.02,.55),at(.98,.55)],'#3c5361',1.1);
    const windowShape=[at(.025,1.4),at(.975,1.4),at(.975,3.38),at(.025,3.38)];
    const clip=node('clipPath',{id:`bridge-window-${windowIndex++}`});clip.append(node('polygon',{points:points(windowShape)}));defs.append(clip);
    polygon(room,windowShape,'#000000',{stroke:'#0b151d','stroke-width':8});
    const sky=node('g',{'clip-path':`url(#${clip.id})`,class:'bridge-window-stars'});room.append(sky);
    // A fixed, sparse star field continues across all three sides of the glass.
    for(let i=0;i<100;i++){
      const sx=(i*137.508+31)%1000,sy=(i*73.19+19)%470;
      sky.append(node('circle',{cx:sx,cy:sy,r:i%11===0?1.25:.7,fill:'#eef3ff',opacity:.4+(i%5)*.13}));
    }
    const shield=polygon(room,windowShape,'#9bb6c4',{class:'bridge-window-blast-shield',stroke:'#d2e1e8','stroke-width':1});
    shield.append(node('title',{},'Blast shield down · tactical screens provide the external view'));
    const panes=Math.hypot(b[0]-a[0],b[2]-a[2])>5?5:2;
    for(let i=1;i<panes;i++){
      const t=i/panes;
      line(room,[at(t,1.37),at(t,3.43)],'#4e6776',5);
      line(room,[at(t+.005,1.4),at(t+.005,3.38)],'#8b9da6',.8,{opacity:.65});
      line(room,[at(t,.15),at(t,1.06)],'#4c636f',1.3);
      line(room,[at(t,3.56),at(t,4.9)],'#627887',2.3);
    }
    for(const t of [0,1]){
      line(room,[at(t,0),at(t,3.7)],'#758894',9);
      line(room,[at(t,.2),at(t,3.6)],'#20303e',4);
    }
    line(room,[at(.02,1.35),at(.98,1.35)],'#718b96',3);
    line(overheadLights,[at(.035,3.50),at(.965,3.50)],'currentColor',2,{opacity:.8});
    line(overheadLights,[at(.045,1.08),at(.955,1.08)],'currentColor',1.25,{opacity:.58});
    const direction=windowIndex===1?'port':windowIndex===3?'forward':windowIndex===5?'starboard':null;
    if(direction){
      const start=project(at(.08,4.78)),right=project(at(.92,4.78)),bottom=project(at(.08,3.58));
      const matrix=[(right[0]-start[0])/640,(right[1]-start[1])/640,(bottom[0]-start[0])/160,(bottom[1]-start[1])/160,...start];
      const screen=node('g',{transform:`matrix(${matrix.join(' ')})`,class:'bridge-tactical-screen','data-tactical-direction':direction,role:'button',tabindex:0,'aria-label':`Open ${direction} HUD`});
      decorateTacticalScreen(screen,direction);
      screen.onclick=()=>onTacticalOpen(direction);screen.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onTacticalOpen(direction);}};
      tacticalScreens.append(screen);
    }
  }
  // Inset walkways and a raised command island with two shallow aft steps.
  room.append(overheadLights);
  const walkways=node('g',{class:'bridge-walkway-lights',filter:'url(#bridge-light-glow)'});
  for(const side of [-1,1]){
    const x=side*2.34;
    polygon(room,[[x-.09,.016,-1.3],[x+.09,.016,-1.3],[x+.09,.016,5.5],[x-.09,.016,5.5]],'#162632');
    for(const [start,end] of [[-1.3,.36],[.48,2.65],[2.77,5.5]])line(walkways,[[x,.02,start],[x,.02,end]],'currentColor',1.6,{opacity:.84});
    line(walkways,[[side*5.65,.025,-2.7],[side*5.65,.025,4.95],[side*4.65,.025,5.68]],'currentColor',1.5,{opacity:.64});
  }
  room.append(walkways);
  drawCommandCompass(room);
  const platform=[[-1.35,.28,-.25],[1.35,.28,-.25],[1.6,.28,1.8],[1.18,.28,2.45],[-1.18,.28,2.45],[-1.6,.28,1.8]];
  for(let i=0;i<platform.length;i++){
    const a=platform[i],b=platform[(i+1)%platform.length];
    polygon(room,[a,b,[b[0],.02,b[2]],[a[0],.02,a[2]]],'#293b49',{stroke:'#51616b','stroke-width':.6});
  }
  polygon(room,platform,'#2e414e',{class:'bridge-command-platform', 'stroke-width':1.5});
  for(const [z,y,width] of [[2.65,.08,1.04],[2.48,.16,1.12]])polygon(room,[[-width,y,z-.14],[width,y,z-.14],[width,y,z+.14],[-width,y,z+.14]],'#435463',{stroke:'#71818b','stroke-width':.7});

  const layouts={
    flight:{label:[500,180],positions:[[-1.35,-3.2,0],[1.35,-3.2,0]],names:['System navigation','Local flight']},
    'tactical-security':{label:[195,453],positions:[[-4.8,-.8,90],[-4.8,2.05,90]],names:['Tactical','Security']},
    communications:{label:[805,453],positions:[[4.8,.65,-90]],names:['Communications']},
    'engineering-support':{label:[500,611],positions:[[-3.75,4.55,180],[-1.25,4.55,180],[1.25,4.55,180],[3.75,4.55,180]],names:['Engineering','Science','Operations','Life support']},
    command:{label:[500,273],positions:[[0,.8,0]],names:['Commander']}
  };
  // Each console bank is one accessible control, matching the existing areas.
  const stations=node('g',{id:'bridge-deck-stations'}),labels=node('g');root.append(stations,labels);
  const order=[...areas].sort((a,b)=>Math.max(...layouts[a.id].positions.map(p=>p[1]))-Math.max(...layouts[b.id].positions.map(p=>p[1])));
  for(const area of order){
    const layout=layouts[area.id],group=node('g',{class:'bridge-deck-station bridge-perspective-station','data-bridge-area':area.id,role:'button',tabindex:0,'aria-label':`Open ${area.name}`,'aria-describedby':`bridge-deck-description-${area.id}`});
    if(area.id==='command'){group.setAttribute('aria-haspopup','dialog');group.setAttribute('aria-controls','briefing-dialog');}
    const furnitureColor=area.id==='command'?'#627789':area.color;
    group.style.setProperty('--station-color',furnitureColor);
    for(const [index,[x,z,angle]] of layout.positions.entries()){
      const seat=node('g',{'data-bridge-seat':layout.names[index]});group.append(seat);
      // Soft contact shadows keep every pedestal grounded on the deck.
      const shadow=Array.from({length:20},(_,i)=>[x+Math.cos(i*Math.PI/10)*.85,.04,z+Math.sin(i*Math.PI/10)*.9]);
      polygon(seat,shadow,'#02080d',{opacity:.45});
      furniture(seat,x,z,angle,furnitureColor,area.id==='command');
    }
    const activate=()=>onSelect(area.id);
    group.onclick=activate;group.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}};
    stations.append(group);
    // Keep the station popups above the furniture without intercepting input.
    const [x,y]=layout.label,width=area.id==='engineering-support'?242:area.id==='command'?164:206;
    const label=node('g',{class:'bridge-perspective-label','data-bridge-area':area.id,transform:`translate(${x} ${y})`,'aria-hidden':'true'});
    label.style.setProperty('--station-color',area.color);
    const popupName=area.id==='communications'?'Communications':area.name;
    label.append(node('rect',{x:-width/2,y:-17,width,height:38,rx:4}),node('text',{'text-anchor':'middle',x:0,y:5},popupName.toUpperCase()));
    labels.append(label);
    group.onpointerenter=()=>label.classList.add('is-hovered');
    group.onpointerleave=()=>label.classList.remove('is-hovered');
    group.onfocus=()=>label.classList.toggle('is-focused',group.matches(':focus-visible'));
    group.onblur=()=>label.classList.remove('is-focused');
    group.append(node('desc',{id:`bridge-deck-description-${area.id}`},area.summary));
  }
  for(const [text,x,y] of [['FORWARD',500,-26],['PORT',75,240],['STARBOARD',923,240],['AFT ACCESS',500,647]])root.append(node('text',{x,y,'text-anchor':'middle',class:'bridge-room-direction','aria-hidden':'true'},text));
}
