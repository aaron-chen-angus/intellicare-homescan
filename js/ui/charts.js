/**
 * charts.js - small dependency-free SVG charts for the report. Every chart carries an
 * aria-label summary, and the report also shows the same numbers as text or tables.
 */
const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function svg(viewBox, label, cls = 'chart') {
  return el('svg', { viewBox, class: cls, role: 'img', 'aria-label': label });
}

export const BAND_COLORS = { EXTREME: '#e5484d', HIGH: '#f58a3a', MEDIUM: '#f0b400', LOW: '#2fbf71' };
export const SERIES = ['#1f6fe0', '#12a37f', '#f58a3a', '#9b6bff', '#e5484d', '#f0b400', '#3fb8d6', '#ff7ab8', '#7c8a9a', '#5fc46c', '#b9824d'];

/** Semicircle gauge for a 0..100 score. */
export function gauge(value, label, caption) {
  const s = svg('0 0 200 120', label, 'chart gauge');
  const arc = (from, to) => {
    const a0 = Math.PI * (1 - from);
    const a1 = Math.PI * (1 - to);
    const p = (a) => [100 + 80 * Math.cos(a), 100 - 80 * Math.sin(a)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    // A semicircle never exceeds 180 degrees, so the large-arc flag is always 0.
    return `M${x0} ${y0} A80 80 0 0 1 ${x1} ${y1}`;
  };
  s.append(el('path', { d: arc(0, 1), stroke: '#e2eaf3', 'stroke-width': 18, fill: 'none', 'stroke-linecap': 'round' }));
  const v = Math.max(0, Math.min(100, value)) / 100;
  const color = value >= 80 ? '#12a37f' : value >= 60 ? '#f0b400' : value >= 40 ? '#f58a3a' : '#e5484d';
  if (v > 0) s.append(el('path', { d: arc(0, Math.max(0.001, v)), stroke: color, 'stroke-width': 18, fill: 'none', 'stroke-linecap': 'round' }));
  s.append(el('text', { x: 100, y: 92, 'text-anchor': 'middle', 'font-size': 34, 'font-weight': 700, 'font-family': 'Poppins, sans-serif', fill: '#1b2a3b' }, String(Math.round(value))));
  if (caption) s.append(el('text', { x: 100, y: 114, 'text-anchor': 'middle', 'font-size': 12, 'font-family': 'Nunito, sans-serif', fill: '#52657a' }, caption));
  return s;
}

/** Donut chart. data: [{label, value, color}] */
export function donut(data, label, centerText) {
  const s = svg('0 0 200 200', label, 'chart donut');
  const total = data.reduce((a, d) => a + d.value, 0);
  let acc = 0;
  const R = 80;
  const C = 2 * Math.PI * R;
  s.append(el('circle', { cx: 100, cy: 100, r: R, fill: 'none', stroke: '#e2eaf3', 'stroke-width': 30 }));
  for (const d of data) {
    if (!d.value) continue;
    const frac = d.value / total;
    s.append(el('circle', {
      cx: 100, cy: 100, r: R, fill: 'none', stroke: d.color, 'stroke-width': 30,
      'stroke-dasharray': `${frac * C} ${C}`, 'stroke-dashoffset': -acc * C, transform: 'rotate(-90 100 100)',
    }));
    acc += frac;
  }
  s.append(el('text', { x: 100, y: 108, 'text-anchor': 'middle', 'font-size': 30, 'font-weight': 700, 'font-family': 'Poppins, sans-serif', fill: '#1b2a3b' }, centerText ?? String(total)));
  return s;
}

/**
 * Horizontal stacked bars. rows: [{label, parts:[{value, color}]}]
 * Bars share one scale (the largest row total).
 */
export function stackedBars(rows, label) {
  const rowH = 34;
  const labelW = 120;
  const width = 420;
  const s = svg(`0 0 ${width} ${rows.length * rowH + 10}`, label, 'chart bars');
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((a, p) => a + p.value, 0)));
  rows.forEach((r, i) => {
    const y = 8 + i * rowH;
    s.append(el('text', { x: 0, y: y + 17, 'font-size': 13, 'font-weight': 700, 'font-family': 'Nunito, sans-serif', fill: '#1b2a3b' }, r.label));
    s.append(el('rect', { x: labelW, y: y + 4, width: width - labelW - 30, height: 18, rx: 9, fill: '#eef3f8' }));
    let x = labelW;
    let total = 0;
    for (const p of r.parts) {
      if (!p.value) continue;
      const w = (p.value / max) * (width - labelW - 30);
      s.append(el('rect', { x, y: y + 4, width: Math.max(2, w), height: 18, fill: p.color }));
      x += w;
      total += p.value;
    }
    s.append(el('text', { x: width - 24, y: y + 18, 'font-size': 13, 'font-weight': 700, 'font-family': 'Poppins, sans-serif', fill: '#1b2a3b' }, String(total)));
  });
  return s;
}

/** Small 1..9 level meter (used for the CIR-aligned clutter estimate). */
export function levelDots(level, max, label) {
  const s = svg(`0 0 ${max * 16} 16`, label, 'chart dots9');
  for (let i = 1; i <= max; i++) {
    const on = level !== null && i <= level;
    const color = i <= 3 ? '#2fbf71' : i <= 5 ? '#f0b400' : i <= 7 ? '#f58a3a' : '#e5484d';
    s.append(el('rect', { x: (i - 1) * 16 + 1, y: 2, width: 13, height: 12, rx: 3, fill: on ? color : '#e2eaf3' }));
  }
  return s;
}
