export const GAME_YEAR = 2100;
const GAME_EPOCH = Date.UTC(GAME_YEAR, 0, 1);
export const gameDate = seconds => new Date(GAME_EPOCH + seconds * 1000);

export const EPD_AU_PER_DAY = 3.8;
export const SOL_EXCLUSION_AU = 0.18;
export const EDGE_AU = 120;
export const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export const at = (au, degrees) => ({ x: au * Math.cos(degrees * Math.PI / 180), y: au * Math.sin(degrees * Math.PI / 180) });
export function mapPoint(p) {
  const au = Math.hypot(p.x, p.y);
  if (!au) return { x: 0, y: 0 };
  const r = 460 * Math.log1p(au * 4) / Math.log1p(EDGE_AU * 4);
  return { x: p.x / au * r, y: p.y / au * r };
}
export function unmapPoint(p) {
  const r = Math.hypot(p.x, p.y);
  if (!r) return { x: 0, y: 0 };
  const au = Math.expm1(r / 460 * Math.log1p(EDGE_AU * 4)) / 4;
  return { x: p.x / r * au, y: p.y / r * au };
}
export function nearSol(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(a.x + dx * t, a.y + dy * t) < SOL_EXCLUSION_AU;
}
export function routeDistance(origin, points) {
  let previous = origin;
  return points.reduce((total, point) => { const leg = distance(previous, point); previous = point; return total + leg; }, 0);
}
export function advance(origin, points, budget) {
  let position = { ...origin }, reached = 0;
  for (const point of points) {
    const remaining = distance(position, point);
    if (remaining <= budget) { budget -= remaining; position = { ...point }; reached++; }
    else {
      const f = budget / remaining;
      position = { x: position.x + (point.x - position.x) * f, y: position.y + (point.y - position.y) * f };
      break;
    }
  }
  return { position, reached };
}
