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

function furniture(parent,x,z,angle,color,commander=false) {
  const faces=[],turn=angle*Math.PI/180;
  const world=([u,v,w])=>[x+u*Math.cos(turn)+w*Math.sin(turn),v,z+w*Math.cos(turn)-u*Math.sin(turn)];
  const face=(vertices,fill,attrs={})=>faces.push({vertices:vertices.map(world),fill,attrs});
  const box=(cx,cy,cz,w,h,d,palette,attrs={})=>{
    const x0=cx-w/2,x1=cx+w/2,y0=cy,y1=cy+h,z0=cz-d/2,z1=cz+d/2;
    const [top,front,side]=palette;
    face([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]],side,attrs);
    face([[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1]],side,attrs);
    face([[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]],side,attrs);
    face([[x0,y0,z1],[x0,y1,z1],[x1,y1,z1],[x1,y0,z1]],front,attrs);
    face([[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],top,attrs);
  };
  const metal=['#536575','#263440','#1c2833'],cushion=commander?['#aa8d5d','#6c5940','#473c2e']:['#526574','#344653','#23323e'];
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
    face(display,'#627784',{'class':'bridge-furniture-shell'});
    face([[-.55,.885,-.83],[.55,.885,-.83],[.55,.80,-.29],[-.55,.80,-.29]],'#071b26',{stroke:color,'stroke-width':1});
    // Small instrument rows lie on the same inclined surface as the display.
    for(let i=0;i<4;i++){
      const left=-.46+i*.235;
      face([[left,.85,-.62],[left+.15,.85,-.62],[left+.15,.82,-.45],[left,.82,-.45]],i===2?'#b29a65':color,{opacity:i===2?.85:.38});
    }
    face([[-.45,.876,-.77],[.26,.876,-.77],[.26,.867,-.72],[-.45,.867,-.72]],color,{opacity:.8});
    box(0,.66,-.205,1.03,.04,.025,[color,color,color],{'class':'bridge-console-light'});
  }
  faces.sort((a,b)=>{
    const depth=f=>f.vertices.reduce((sum,[,y,z])=>sum+z+y*.62,0)/f.vertices.length;
    return depth(a)-depth(b);
  });
  for(const item of faces)polygon(parent,item.vertices,item.fill,{'stroke':'#0c151d','stroke-width':.65,'stroke-linejoin':'round',...item.attrs});
}

export function mountBridgeDeck({root,areas,onSelect,onTacticalOpen}) {
  root.replaceChildren();
  root.setAttribute('viewBox','0 -55 1000 730');
  root.setAttribute('aria-label','Perspective view of the bridge with forward, port, and starboard tactical screen panels above the windows, nine seated crew consoles, and a central commander chair. Select a station to open its controls or a screen to open the tactical view.');
  const defs=node('defs');
  const floor=node('linearGradient',{id:'bridge-deck-floor',x2:'0',y2:'1'});
  floor.append(node('stop',{'stop-color':'#263a48'}),node('stop',{offset:'1','stop-color':'#101e2a'}));
  defs.append(floor);root.append(defs);
  const room=node('g',{'aria-hidden':'true'}),tacticalScreens=node('g');root.append(room,tacticalScreens);
  const hull=[[-4.4,0,-5],[4.4,0,-5],[6,0,-3],[6,0,5.4],[4.8,0,6.1],[-4.8,0,6.1],[-6,0,5.4],[-6,0,-3]];
  // Visible hull thickness makes the open aft edge read as a cutaway.
  for(let i=0;i<hull.length;i++){
    const a=hull[i],b=hull[(i+1)%hull.length];
    polygon(room,[a,b,[b[0],-.3,b[2]],[a[0],-.3,a[2]]],'#0a141e',{stroke:'#344957'});
  }
  polygon(room,hull,'url(#bridge-deck-floor)',{stroke:'#526773','stroke-width':2});
  const floorClip=node('clipPath',{id:'bridge-floor-clip'});floorClip.append(node('polygon',{points:points(hull)}));defs.append(floorClip);
  const seams=node('g',{'clip-path':'url(#bridge-floor-clip)'});room.append(seams);
  for(let z=-4;z<=5;z+=1)line(seams,[[-5.7,.005,z],[5.7,.005,z]],'#688391',.6,{opacity:.16});
  for(let x=-5;x<=5;x+=1)line(seams,[[x,.005,-4.8],[x,.005,5.8]],'#688391',.6,{opacity:.16});
  // Port, forward bevels, front, and starboard walls. The aft wall is cut away.
  const walls=[[hull[6],hull[7]],[hull[7],hull[0]],[hull[0],hull[1]],[hull[1],hull[2]],[hull[2],hull[3]]];
  let windowIndex=0;
  for(const [a,b] of walls){
    const at=(t,y)=>[a[0]+(b[0]-a[0])*t,y,a[2]+(b[2]-a[2])*t];
    polygon(room,[at(0,0),at(1,0),at(1,4.95),at(0,4.95)],'#253541',{stroke:'#667a86','stroke-width':1.2});
    polygon(room,[at(0,.13),at(1,.13),at(1,1.25),at(0,1.25)],'#1a2935',{stroke:'#3e5260','stroke-width':.8});
    line(room,[at(.015,3.72),at(.985,3.72)],'#b5cfda',3,{opacity:.62});
    line(room,[at(.02,1.1),at(.98,1.1)],'#79b4bd',2,{opacity:.75});
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
    for(let i=1;i<panes;i++)line(room,[at(i/panes,1.37),at(i/panes,3.43)],'#657985',5);
    for(const t of [0,1]){
      line(room,[at(t,0),at(t,3.7)],'#758894',9);
      line(room,[at(t,.2),at(t,3.6)],'#20303e',4);
    }
    line(room,[at(.02,1.35),at(.98,1.35)],'#718b96',3);
    const direction=windowIndex===1?'port':windowIndex===3?'forward':windowIndex===5?'starboard':null;
    if(direction){
      const start=project(at(.08,4.78)),right=project(at(.92,4.78)),bottom=project(at(.08,3.58));
      const matrix=[(right[0]-start[0])/640,(right[1]-start[1])/640,(bottom[0]-start[0])/160,(bottom[1]-start[1])/160,...start];
      const screen=node('g',{transform:`matrix(${matrix.join(' ')})`,class:'bridge-tactical-screen','data-tactical-direction':direction,role:'button',tabindex:0,'aria-label':`Open ${direction} HUD`});
      screen.append(node('rect',{x:0,y:0,width:640,height:160,rx:5,fill:'#07131d',stroke:'#6b99a9','stroke-width':4}),node('text',{x:22,y:38,fill:'#8cabb9','font-size':24,'font-family':'monospace'},`${direction.toUpperCase()} / HUD`),node('circle',{cx:610,cy:132,r:4,fill:'#74b4c5'}));
      screen.onclick=()=>onTacticalOpen(direction);screen.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onTacticalOpen(direction);}};
      tacticalScreens.append(screen);
    }
  }
  // Inset walkways and a raised command island with two shallow aft steps.
  for(const x of [-2.1,2.1])line(room,[[x,.015,-1.1],[x,.015,5.5]],'#7dbfc6',2,{opacity:.45});
  for(const side of [-1,1])line(room,[[side*5.6,.025,-2.7],[side*5.6,.025,4.9]],'#b9a16d',2,{opacity:.6});
  const platform=[[-1.35,.28,-.25],[1.35,.28,-.25],[1.6,.28,1.8],[1.18,.28,2.45],[-1.18,.28,2.45],[-1.6,.28,1.8]];
  for(let i=0;i<platform.length;i++){
    const a=platform[i],b=platform[(i+1)%platform.length];
    polygon(room,[a,b,[b[0],.02,b[2]],[a[0],.02,a[2]]],'#293b49',{stroke:'#51616b','stroke-width':.6});
  }
  polygon(room,platform,'#2e414e',{stroke:'#b6a077','stroke-width':1.5});
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
    group.style.setProperty('--station-color',area.color);
    group.append(node('title',{},`${area.name}: ${layout.names.join(', ')} ${area.id==='command'?'chair':'seated consoles'}`));
    for(const [index,[x,z,angle]] of layout.positions.entries()){
      const seat=node('g',{'data-bridge-seat':layout.names[index]});group.append(seat);
      // Soft contact shadows keep every pedestal grounded on the deck.
      const shadow=Array.from({length:20},(_,i)=>[x+Math.cos(i*Math.PI/10)*.85,.04,z+Math.sin(i*Math.PI/10)*.9]);
      polygon(seat,shadow,'#02080d',{opacity:.45});
      furniture(seat,x,z,angle,area.color,area.id==='command');
    }
    const activate=()=>onSelect(area.id);
    group.onclick=activate;group.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}};
    stations.append(group);
    // Labels remain flat and readable while their matching furniture has depth.
    const [x,y]=layout.label,width=area.id==='engineering-support'?242:area.id==='command'?164:206;
    const label=node('g',{class:'bridge-perspective-label','data-bridge-area':area.id,transform:`translate(${x} ${y})`,'aria-hidden':'true'});
    label.style.setProperty('--station-color',area.color);
    label.append(node('rect',{x:-width/2,y:-17,width,height:38,rx:4}),node('circle',{cx:-width/2+12,cy:1,r:2.4,fill:area.color}),node('text',{'text-anchor':'middle',x:5,y:5},area.name.toUpperCase()));
    label.onclick=activate;labels.append(label);
    group.append(node('desc',{id:`bridge-deck-description-${area.id}`},area.summary));
  }
  for(const [text,x,y] of [['FORWARD',500,-39],['PORT',111,240],['STARBOARD',889,240],['AFT ACCESS',500,656]])root.append(node('text',{x,y,'text-anchor':'middle',class:'bridge-room-direction','aria-hidden':'true'},text));
}
