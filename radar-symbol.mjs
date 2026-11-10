import { contactTypes } from './tactical-model.mjs';

const svg = (tag, attrs = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for(const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};
const shuttleSymbol = () => svg('circle', {r:6,fill:'none',stroke:'#a8e4ea','stroke-width':1.7,'pointer-events':'stroke'});

// Own shuttles use a ring so the ship underneath remains visible at boarding range.
export function createShuttleTrackLayer(glyphClass) {
  const root = svg('g', {'aria-label':'Deployed boarding shuttles'}), markers = new Map();
  return {root, update(tracks, scale) {
    const visible = new Set();
    for(const {number,x,y,label} of tracks){
      visible.add(number);
      let marker = markers.get(number);
      if(!marker){
        marker = svg('g', {class:'shuttle-track','data-shuttle':number,role:'img'});
        const glyph = svg('g', {class:glyphClass});glyph.append(shuttleSymbol());
        marker.append(svg('title'),glyph);root.append(marker);markers.set(number,marker);
      }
      marker.setAttribute('transform', `translate(${x} ${y})`);
      if(marker.getAttribute('aria-label')!==label){marker.setAttribute('aria-label',label);marker.firstElementChild.textContent=label;}
      if(scale!==undefined)marker.lastElementChild.setAttribute('transform',`scale(${scale})`);
    }
    for(const [number,marker] of markers)if(!visible.has(number)){marker.remove();markers.delete(number);}
  }};
}

// Match the radar's legend-based contact size in screen pixels at any scale.
export function contactGlyphScale(scale, legendWidth = 16) {
  return scale > 0 && legendWidth > 0 ? (legendWidth * 6 / 20) / (4.5 * scale) : 1;
}

// One glyph definition for radar and bridge reference displays.
export function contactSymbol(type, size = 6) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', type === 'friendly' ? 'circle' : type === 'enemy' ? 'rect' : 'path');
  const color = contactTypes[type].color;
  const attrs = { fill: color, stroke: color, 'stroke-width': 1.4 };
  if (type === 'friendly') attrs.r = size;
  else if (type === 'enemy') Object.assign(attrs, { x: -size, y: -size, width: size * 2, height: size * 2 });
  else attrs.d = type === 'neutral' ? `M0 ${-size} ${size} ${size} ${-size} ${size}Z` : `M0 ${-size} ${size} 0 0 ${size} ${-size} 0Z`;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

export function createRadarLegend({className = 'radar-legend'} = {}) {
  const legend = document.createElement('div'); legend.className = className;
  legend.setAttribute('aria-label', 'Ship, shuttle and weapon fire symbols: blue rings are our shuttles; triangles are missiles; dots are cannon rounds');
  const add = (icon, label, title) => {
    const item = document.createElement('span'); if(title) item.title = title;
    item.append(icon, document.createTextNode(label)); legend.append(item);
  };
  for(const [type, info] of Object.entries(contactTypes)) {
    const icon = svg('svg', {viewBox:'-10 -10 20 20', 'aria-hidden':'true'}); icon.append(contactSymbol(type)); add(icon, info.label);
  }
  const shuttleIcon = svg('svg', {viewBox:'-10 -10 20 20','aria-hidden':'true'});shuttleIcon.append(shuttleSymbol());add(shuttleIcon,'Our shuttle');
  for(const [label, color] of [['Outgoing fire','#7cffff'], ['Hostile / incoming fire',contactTypes.enemy.color], ['Friendly fire',contactTypes.friendly.color], ['Other fire','#ffd166']]) {
    const icon = svg('svg', {viewBox:'-12 -8 24 16', class:'radar-fire-key', 'aria-hidden':'true'});
    icon.append(svg('path', {d:'M5 0L-3-1.5V1.5Z', fill:color, stroke:color, 'stroke-width':.35, transform:'translate(-5 0)'}), svg('circle', {cx:7, r:1.8, fill:color}));
    add(icon, label, 'Triangle: missile · dot: cannon round');
  }
  return legend;
}
