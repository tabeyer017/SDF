import { contactDistance } from './tactical-model.mjs';
import { weapons, expandProjectileRounds, projectileAffiliation } from './combat-model.mjs';
import { relativeContact } from './sector-model.mjs';
import { shuttleStatus } from './boarding-model.mjs';

export const tacticalViews = { forward: 0, starboard: 90, rear: 180, port: -90 };
export const HUD_RANGE_KM = 200;
export const tacticalViewKeys = { ArrowUp: 'forward', ArrowLeft: 'port', ArrowRight: 'starboard', ArrowDown: 'rear' };

export function relativeShuttleTracks(combat, sector, range) {
  const tracks = [];
  for (const shuttle of combat?.boarding?.shuttles ?? []) {
    if (shuttle.status === 'ready') continue;
    const {x,y,z} = relativeContact(sector, {...shuttle,vx:0,vy:0,vz:0});
    const distance = Math.hypot(x,y,z);
    if (distance <= range) tracks.push({number:shuttle.number,x,y,z,label:`Shuttle ${shuttle.number} · ${shuttleStatus(shuttle)} · ${distance.toFixed(1)} km`});
  }
  return tracks;
}

// Observed contacts are already in the ship's bow/right/up coordinate frame.
// Four adjoining 90-degree sectors cover every bearing exactly once.
export function projectTacticalView(contact, direction, range) {
  if (contact.stale || contactDistance(contact) > range || !(direction in tacticalViews)) return null;
  const bearing = Math.atan2(contact.x, contact.y) * 180 / Math.PI;
  const offset = ((bearing - tacticalViews[direction] + 540) % 360) - 180;
  if (offset < -45 || offset >= 45) return null;
  const elevation = Math.atan2(contact.z, Math.hypot(contact.x, contact.y)) * 180 / Math.PI;
  return { x: 320 + offset / 45 * 288, y: 180 - elevation / 90 * 128, elevation, bearing, offset };
}

export function bridgeCombatActive(combat, sector) {
  if (combat.shots.some(shot => shot.sourceId === 'own' || shot.targetId === 'own')) return true;
  const targets = new Set([
    ...combat.hostiles,
    ...(combat.engagement?.targetIds ?? []),
    ...(combat.firing ?? []).map(order => order.targetId),
    ...combat.own.mounts.filter(mount => mount.burst).map(mount => mount.burst.targetId)
  ]);
  return [...targets].some(id => {
    const ship = combat.contacts[id], position = sector.contacts.find(contact => contact.id === id);
    return ship && position && !ship.surrendered && ship.systems.hull.hp > 0 &&
      Math.hypot(...['x', 'y', 'z'].map(axis => position[axis] - sector.own[axis])) <= 200;
  });
}

export function tacticalProjectiles(combat, sector, direction, range) {
  const result = [];
  for (const shot of expandProjectileRounds(combat.shots)) {
    const relative = relativeContact(sector, shot), distance = contactDistance(relative);
    // At the muzzle, use launch velocity for bearing until position separates.
    const position = distance < 1e-6 ? {...relative, x: relative.vx / 360000, y: relative.vy / 360000, z: relative.vz / 360000} : relative;
    const point = projectTacticalView(position, direction, range);
    if (!point) continue;
    const previous = projectTacticalView({...relative, x: relative.x - relative.vx / 3600 * .1, y: relative.y - relative.vy / 3600 * .1, z: relative.z - relative.vz / 3600 * .1}, direction, Infinity);
    const dx = previous ? point.x - previous.x : 0, dy = previous ? point.y - previous.y : 0;
    const affiliation = projectileAffiliation(shot, combat, sector.memory[shot.sourceId]?.observed);
    const length = Math.hypot(dx, dy), vector = length > .01 ? {x: dx / length, y: dy / length} : {x: 0, y: affiliation === 'incoming' ? 1 : -1};
    const missile = !!weapons[shot.weapon].missile;
    const offset = missile ? 0 : (shot.roundIndex - (shot.roundCount - 1) / 2) * 4;
    result.push({id: `${shot.id}:${shot.roundIndex ?? 0}`, shotId: shot.id, weapon: shot.weapon, missile, distance, affiliation,
      x: point.x - vector.y * offset, y: point.y + vector.x * offset,
      angle: Math.atan2(vector.y, vector.x) * 180 / Math.PI,
      scale: (1.25 - .65 * Math.min(1, distance / range)) * (affiliation === 'incoming' ? 1 + .8 * Math.max(0, 1 - distance / 20) : 1)});
  }
  return result;
}

// This readout covers every direction, so a forward view still warns of rear fire.
export function incomingTacticalThreats(combat, sector, range) {
  let missiles = 0, rounds = 0, nearest = Infinity;
  const directions = new Set();
  for (const shot of expandProjectileRounds(combat.shots.filter(shot => shot.sourceId !== 'own' && shot.targetId === 'own'))) {
    const relative = relativeContact(sector, shot), distance = contactDistance(relative);
    if (distance > range) continue;
    if (weapons[shot.weapon].missile) missiles++; else rounds++;
    nearest = Math.min(nearest, distance);
    for (const direction of Object.keys(tacticalViews)) if (projectTacticalView(relative, direction, range)) directions.add(direction);
  }
  return {missiles, rounds, nearest: Number.isFinite(nearest) ? nearest : null, directions: [...directions]};
}
