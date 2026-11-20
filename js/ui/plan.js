/**
 * plan.js - top-down floor plan for a shot: furniture, door, and the camera position with its
 * field-of-view cone. Data comes from config/shot_guides.json (rooms.<id>.plan and shot.cam).
 * Coordinates are in a 100 x 70 plan space.
 */
import { t } from '../i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

/** Points of a field-of-view cone. angle in degrees, 0 = right, 90 = down. */
export function fovCone(x, y, angle, fov = 62, len = 58) {
  const a1 = ((angle - fov / 2) * Math.PI) / 180;
  const a2 = ((angle + fov / 2) * Math.PI) / 180;
  return [[x, y], [x + Math.cos(a1) * len, y + Math.sin(a1) * len], [x + Math.cos(a2) * len, y + Math.sin(a2) * len]];
}

/**
 * @param {{furniture:object[], door:object, zone?:object}} plan
 * @param {{x:number,y:number,a:number}|null} cam
 * @param {string} label accessible description
 */
export function buildPlan(plan, cam, label) {
  const svg = el('svg', { viewBox: '-2 -2 104 74', class: 'plan', role: 'img', 'aria-label': label });
  const clip = el('clipPath', { id: 'pc' + Math.random().toString(36).slice(2) });
  clip.append(el('rect', { x: 0, y: 0, width: 100, height: 70 }));
  svg.append(clip);
  svg.append(el('rect', { x: 0, y: 0, width: 100, height: 70, rx: 2, fill: '#fbf6ee', stroke: '#9aa9b8', 'stroke-width': 1.6 }));
  if (plan.zone) {
    svg.append(el('rect', { ...plan.zone, rx: 2, fill: 'rgba(255,210,77,.25)', stroke: '#e0a800', 'stroke-width': 0.8, 'stroke-dasharray': '2 1.5' }));
  }
  for (const f of plan.furniture) {
    svg.append(el('rect', { x: f.x, y: f.y, width: f.w, height: f.h, rx: 1.5, fill: f.fill || '#d9e4f0', stroke: '#8fa3b8', 'stroke-width': 0.6 }));
    const txt = el('text', { x: f.x + f.w / 2, y: f.y + f.h / 2 + 1.4, 'text-anchor': 'middle', 'font-size': 3.6, 'font-family': 'Nunito, sans-serif', 'font-weight': 700, fill: '#3b4d60' });
    txt.textContent = t('hs.ghost.' + f.label);
    svg.append(txt);
  }
  const d = plan.door;
  svg.append(el('rect', { x: d.x, y: d.y, width: d.w, height: d.h, fill: '#ffffff', stroke: '#2fbf9a', 'stroke-width': 1 }));
  if (cam) {
    const g = el('g', { 'clip-path': `url(#${clip.getAttribute('id')})` });
    g.append(el('polygon', { points: fovCone(cam.x, cam.y, cam.a).map((p) => p.join(',')).join(' '), fill: 'rgba(31,111,224,.18)', stroke: 'rgba(31,111,224,.5)', 'stroke-width': 0.6 }));
    svg.append(g);
    const camG = el('g', { transform: `translate(${cam.x} ${cam.y}) rotate(${cam.a})` });
    camG.append(el('circle', { r: 4.2, fill: '#1f6fe0', stroke: '#fff', 'stroke-width': 1.2 }));
    camG.append(el('rect', { x: 1.2, y: -1.6, width: 4.2, height: 3.2, rx: 0.8, fill: '#fff' }));
    svg.append(camG);
    const you = el('text', { x: Math.min(92, Math.max(8, cam.x)), y: cam.y > 60 ? cam.y - 6 : cam.y + 9, 'text-anchor': 'middle', 'font-size': 4, 'font-family': 'Poppins, sans-serif', 'font-weight': 700, fill: '#154fa8' });
    you.textContent = t('hs.plan.you');
    svg.append(you);
  }
  return svg;
}
