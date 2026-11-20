/**
 * plan.js - layout-agnostic "three corners" diagram for the room mission board.
 * Every home is different, so it shows a generic room outline with three corner
 * viewpoints looking in, highlighting the photo the card is about. No furniture is drawn.
 */
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

/** Points of a field-of-view cone. angle in degrees, 0 = right, 90 = down. */
export function fovCone(x, y, angle, fov = 62, len = 62) {
  const a1 = ((angle - fov / 2) * Math.PI) / 180;
  const a2 = ((angle + fov / 2) * Math.PI) / 180;
  return [[x, y], [x + Math.cos(a1) * len, y + Math.sin(a1) * len], [x + Math.cos(a2) * len, y + Math.sin(a2) * len]];
}

/** Three corners of a 100 x 70 room, each looking towards the centre. */
export const CORNERS = [
  { x: 8, y: 62, a: -40 },
  { x: 92, y: 62, a: -140 },
  { x: 92, y: 8, a: 140 },
];

/**
 * @param {number} active 1-based index of the highlighted corner (0 = none highlighted)
 * @param {string} label accessible description
 */
export function buildCornerPlan(active, label) {
  const svg = el('svg', { viewBox: '-2 -2 104 74', class: 'plan', role: 'img', 'aria-label': label });
  const clipId = 'pc' + Math.random().toString(36).slice(2);
  const clip = el('clipPath', { id: clipId });
  clip.append(el('rect', { x: 0, y: 0, width: 100, height: 70 }));
  svg.append(clip);
  svg.append(el('rect', { x: 0, y: 0, width: 100, height: 70, rx: 3, fill: '#fbf6ee', stroke: '#9aa9b8', 'stroke-width': 1.6 }));
  svg.append(el('rect', { x: 30, y: 22, width: 40, height: 26, rx: 3, fill: '#eef3f8', stroke: '#c9d6e2', 'stroke-width': 0.8, 'stroke-dasharray': '2 1.5' }));
  const g = el('g', { 'clip-path': `url(#${clipId})` });
  CORNERS.forEach((c, i) => {
    const on = i + 1 === active;
    g.append(el('polygon', {
      points: fovCone(c.x, c.y, c.a).map((p) => p.join(',')).join(' '),
      fill: on ? 'rgba(31,111,224,.22)' : 'rgba(120,140,160,.08)',
      stroke: on ? 'rgba(31,111,224,.6)' : 'rgba(120,140,160,.25)', 'stroke-width': 0.6,
    }));
  });
  svg.append(g);
  CORNERS.forEach((c, i) => {
    const on = i + 1 === active;
    svg.append(el('circle', { cx: c.x, cy: c.y, r: on ? 5.2 : 4, fill: on ? '#1f6fe0' : '#b8c6d6', stroke: '#fff', 'stroke-width': 1.2 }));
    const n = el('text', { x: c.x, y: c.y + 1.7, 'text-anchor': 'middle', 'font-size': 5, 'font-family': 'Poppins, sans-serif', 'font-weight': 700, fill: '#fff' });
    n.textContent = String(i + 1);
    svg.append(n);
  });
  return svg;
}
