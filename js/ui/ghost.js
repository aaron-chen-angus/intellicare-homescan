/**
 * ghost.js - ghost-outline framing overlay for a shot.
 * Shapes come from config/shot_guides.json and are positioned in percent of the preview, so the
 * overlay follows the preview box on every screen size and rotation.
 */
import { h } from './components.js';
import { t } from '../i18n.js';

/** Floor guide: the floor should fill at least the bottom third (spec: >= 1/3 of the frame). */
const FLOOR_LINE_PCT = 66.6;

/** @param {object[]} shapes ghost array from a shot */
export function buildGhost(shapes = []) {
  const nodes = shapes.map((s) => h('div', {
    class: 'ghost-shape' + (s.kind ? ' ' + s.kind : ''),
    style: `left:${s.x}%;top:${s.y}%;width:${s.w}%;height:${s.h}%`,
  }, h('span', {}, t('hs.ghost.' + s.label))));
  const floorLine = h('div', { class: 'ghost-floor', style: `top:${FLOOR_LINE_PCT}%` }, h('span', {}, t('hs.ghost.floor_line')));
  return h('div', { class: 'ghost', 'aria-hidden': 'true' }, ...nodes, floorLine);
}
