/**
 * components.js - small DOM helpers shared by all screens.
 * Elements are built with createElement/textContent (never innerHTML) so translated or
 * user-supplied strings cannot inject markup.
 */

/**
 * Hyperscript helper: h('button', {class:'btn', onclick: fn}, 'Text', childNode)
 * `class`, `dataset`, `aria-*` and `on*` handlers are supported; other keys become attributes.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** True when the user asked the OS for less motion. */
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Typewriter effect. The complete text is set up front in an sr-only copy for assistive tech;
 * the visible copy animates (or shows at once under reduced motion).
 */
export function typewriter(text, { speed = 22 } = {}) {
  const visible = h('span', { 'aria-hidden': 'true' });
  const full = h('span', { class: 'sr-only' }, text);
  const box = h('p', { class: 'typewriter' }, full, visible);
  if (reducedMotion()) {
    visible.textContent = text;
    return box;
  }
  const cursor = h('span', { class: 'cursor' });
  visible.append(cursor);
  let i = 0;
  const timer = setInterval(() => {
    if (!box.isConnected && i > 0) return clearInterval(timer); // screen changed: stop
    i += 1;
    visible.textContent = text.slice(0, i);
    visible.append(cursor);
    if (i >= text.length) {
      clearInterval(timer);
      cursor.remove();
    }
  }, speed);
  return box;
}

/** Announce a message to screen readers via the polite live region. */
export function announce(message) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  // Re-setting on the next frame makes repeated identical messages re-announce.
  requestAnimationFrame(() => { live.textContent = message; });
}

/** Original pixel-art mascot "Safi" (16x16 grid, drawn as SVG rects). */
export function mascot(label) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'mascot');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('shape-rendering', 'crispEdges');
  // [x, y, w, h, fill]
  const px = [
    [7, 0, 2, 1, '#ff5555'], [5, 1, 6, 1, '#ffd23f'], [4, 2, 8, 1, '#ffd23f'], [3, 3, 10, 1, '#ff9142'],
    [4, 4, 8, 5, '#f8f8ff'], [6, 5, 1, 1, '#0b0b14'], [9, 5, 1, 1, '#0b0b14'], [6, 7, 4, 1, '#0b0b14'],
    [5, 9, 6, 5, '#6ec1ff'], [7, 10, 2, 1, '#ffd23f'], [3, 9, 2, 4, '#b8b8d0'], [11, 9, 2, 4, '#b8b8d0'],
    [5, 14, 2, 2, '#4b4b8f'], [9, 14, 2, 2, '#4b4b8f'],
  ];
  for (const [x, y, w, hgt, fill] of px) {
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', hgt);
    r.setAttribute('fill', fill);
    svg.append(r);
  }
  return svg;
}
