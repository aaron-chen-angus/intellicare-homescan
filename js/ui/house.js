/**
 * house.js - illustrated two-storey cutaway house (original art) with tappable rooms and
 * resident characters. Room hotspots are real <button>s placed over the art, so the map is
 * keyboard and screen-reader accessible.
 */
import { h } from './components.js';
import { svgFromString } from './svg.js';
import { character, wave } from './characters.js';
import { t } from '../i18n.js';

/** Room rectangles in the 800x540 art space (shared by art and hotspots). */
export const ROOM_BOXES = {
  bedroom: { x: 75, y: 160, w: 315, h: 160 },
  kitchen: { x: 410, y: 160, w: 315, h: 160 },
  living: { x: 75, y: 335, w: 315, h: 165 },
  dining: { x: 410, y: 335, w: 315, h: 165 },
};
const W = 800;
const H = 540;

const ART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 540" class="house-art">
<defs>
  <linearGradient id="roof$$" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2735a"/><stop offset="1" stop-color="#b44a3a"/></linearGradient>
  <linearGradient id="grass$$" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fdc7a"/><stop offset="1" stop-color="#4fb35f"/></linearGradient>
  <linearGradient id="wood$$" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9a36a"/><stop offset="1" stop-color="#b9824d"/></linearGradient>
  <linearGradient id="bedw$$" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e2ff"/><stop offset="1" stop-color="#d6ccf5"/></linearGradient>
  <linearGradient id="kitw$$" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3fbf2"/><stop offset="1" stop-color="#c6efe0"/></linearGradient>
  <linearGradient id="livw$$" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3df"/><stop offset="1" stop-color="#f6e2c2"/></linearGradient>
  <linearGradient id="dinw$$" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9e2"/><stop offset="1" stop-color="#f8d3c6"/></linearGradient>
  <radialGradient id="glow$$" cx="0.5" cy="0" r="0.9"><stop offset="0" stop-color="#fff6c8" stop-opacity=".9"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></radialGradient>
  <pattern id="tile$$" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="none" stroke="#b8e6d4" stroke-width="1"/></pattern>
</defs>
<ellipse cx="400" cy="522" rx="400" ry="30" fill="url(#grass$$)"/>
<circle cx="760" cy="470" r="34" fill="#5fc46c"/><circle cx="738" cy="486" r="24" fill="#4fb35f"/>
<circle cx="38" cy="476" r="30" fill="#5fc46c"/><circle cx="62" cy="492" r="20" fill="#4fb35f"/>
<rect x="608" y="48" width="44" height="80" fill="#a3473a"/><rect x="602" y="40" width="56" height="12" rx="3" fill="#8e3b30"/>
<polygon points="30,156 400,26 770,156" fill="url(#roof$$)"/>
<polygon points="30,156 400,26 770,156 760,164 400,40 40,164" fill="#93392d"/>
<circle cx="400" cy="104" r="22" fill="#fff8e6" stroke="#93392d" stroke-width="6"/>
<path d="M400 90 v28 M386 104 h28" stroke="#2fbf9a" stroke-width="7" stroke-linecap="round"/>
<rect x="60" y="148" width="680" height="366" rx="6" fill="#f7efe2" stroke="#e1d3bd" stroke-width="3"/>

<rect x="75" y="160" width="315" height="160" fill="url(#bedw$$)"/>
<rect x="410" y="160" width="315" height="160" fill="url(#kitw$$)"/><rect x="410" y="160" width="315" height="160" fill="url(#tile$$)"/>
<rect x="75" y="335" width="315" height="165" fill="url(#livw$$)"/>
<rect x="410" y="335" width="315" height="165" fill="url(#dinw$$)"/>
<g fill="url(#wood$$)"><rect x="75" y="302" width="315" height="18"/><rect x="410" y="302" width="315" height="18"/><rect x="75" y="482" width="315" height="18"/><rect x="410" y="482" width="315" height="18"/></g>
<rect x="60" y="320" width="680" height="15" fill="#e1d3bd"/><rect x="390" y="148" width="20" height="366" fill="#e1d3bd"/>

<!-- Bedroom -->
<rect x="300" y="182" width="62" height="54" rx="4" fill="#bfe4ff" stroke="#fff" stroke-width="5"/>
<path d="M296 180 q14 30 0 62 M366 180 q-14 30 0 62" fill="#b9a5f0"/>
<rect x="104" y="246" width="16" height="58" rx="4" fill="#8a6a4f"/>
<rect x="112" y="262" width="160" height="34" rx="8" fill="#ffffff"/>
<rect x="150" y="256" width="122" height="40" rx="10" fill="#8f7ff0"/>
<rect x="118" y="252" width="34" height="18" rx="8" fill="#fff6ea" stroke="#e5d9c6"/>
<rect x="112" y="294" width="160" height="10" rx="3" fill="#8a6a4f"/>
<rect x="282" y="268" width="34" height="34" rx="4" fill="#c9905d"/><rect x="292" y="248" width="4" height="20" fill="#7a5a3f"/>
<path d="M282 250 l12 -16 l12 16 z" fill="#ffd24d"/><circle cx="294" cy="250" r="34" fill="url(#glow$$)"/>
<ellipse cx="200" cy="310" rx="70" ry="6" fill="#c7b9f5"/>

<!-- Kitchen -->
<rect x="424" y="174" width="196" height="36" rx="4" fill="#ffffff" stroke="#cfe9df" stroke-width="2"/>
<path d="M473 174 v36 M522 174 v36 M571 174 v36" stroke="#cfe9df" stroke-width="2"/>
<rect x="424" y="262" width="210" height="42" rx="4" fill="#ffffff" stroke="#cfe9df" stroke-width="2"/>
<rect x="420" y="256" width="218" height="8" rx="3" fill="#7c8a9a"/>
<circle cx="458" cy="258" r="9" fill="#2b3a4a"/><circle cx="486" cy="258" r="9" fill="#2b3a4a"/>
<rect x="560" y="252" width="44" height="10" rx="4" fill="#9fb2c4"/><path d="M582 252 v-16 h10" stroke="#9fb2c4" stroke-width="4" fill="none"/>
<rect x="646" y="186" width="62" height="118" rx="8" fill="#eef3f8" stroke="#c9d6e2" stroke-width="2"/>
<path d="M646 230 h62" stroke="#c9d6e2" stroke-width="2"/><rect x="696" y="200" width="4" height="20" rx="2" fill="#9fb2c4"/><rect x="696" y="240" width="4" height="30" rx="2" fill="#9fb2c4"/>
<path d="M458 238 q4 -10 0 -18 M486 238 q4 -10 0 -18" stroke="#c9d6e2" stroke-width="2" fill="none"/>

<!-- Living room -->
<rect x="104" y="372" width="96" height="62" rx="4" fill="#bfe4ff" stroke="#fff" stroke-width="5"/>
<rect x="290" y="404" width="80" height="46" rx="4" fill="#1b2a3b"/><rect x="294" y="408" width="72" height="38" rx="2" fill="#3c6b9a"/>
<rect x="286" y="450" width="88" height="34" rx="4" fill="#c9905d"/>
<rect x="98" y="436" width="168" height="48" rx="14" fill="#5f8fd8"/>
<rect x="104" y="418" width="156" height="30" rx="12" fill="#77a4ea"/>
<rect x="92" y="440" width="20" height="40" rx="8" fill="#4c7bc4"/><rect x="252" y="440" width="20" height="40" rx="8" fill="#4c7bc4"/>
<ellipse cx="200" cy="492" rx="110" ry="7" fill="#f0b86a"/>
<rect x="346" y="456" width="22" height="26" rx="4" fill="#e07a5f"/><circle cx="357" cy="440" r="18" fill="#5fc46c"/><circle cx="347" cy="430" r="12" fill="#4fb35f"/>

<!-- Dining room -->
<path d="M568 335 v28" stroke="#7c8a9a" stroke-width="2"/><path d="M548 378 q20 -22 40 0 z" fill="#ffd24d"/><circle cx="568" cy="380" r="46" fill="url(#glow$$)"/>
<rect x="488" y="438" width="160" height="12" rx="4" fill="#b9824d"/>
<rect x="500" y="450" width="8" height="34" fill="#9a6a3c"/><rect x="628" y="450" width="8" height="34" fill="#9a6a3c"/>
<rect x="446" y="424" width="30" height="8" rx="3" fill="#e07a5f"/><rect x="446" y="404" width="8" height="78" rx="3" fill="#c9653f"/><rect x="468" y="432" width="6" height="50" fill="#c9653f"/>
<rect x="660" y="424" width="30" height="8" rx="3" fill="#e07a5f"/><rect x="682" y="404" width="8" height="78" rx="3" fill="#c9653f"/><rect x="662" y="432" width="6" height="50" fill="#c9653f"/>
<circle cx="540" cy="434" r="8" fill="#fff"/><circle cx="596" cy="434" r="8" fill="#fff"/>
<rect x="690" y="356" width="24" height="60" rx="4" fill="#ffffff" stroke="#e8c7bb" stroke-width="2"/>
</svg>`;

/**
 * @param {{interactive?:boolean, rooms?:object, onRoom?:(id)=>void, cast?:Array}} opts
 *   rooms: { [id]: { label, sub, state:'todo'|'part'|'done' } }
 *   cast:  [{ kind, room, x, label, line }]  x = 0..1 position across the room
 */
export function buildHouse({ interactive = false, rooms = {}, onRoom, cast = [] } = {}) {
  const wrap = h('div', { class: 'house' });
  wrap.append(svgFromString(ART, { label: interactive ? null : t('hs.house_alt'), className: 'house-art' }));

  if (interactive) {
    for (const [id, box] of Object.entries(ROOM_BOXES)) {
      const info = rooms[id] || {};
      const btn = h('button', {
        class: 'room-hotspot',
        style: `left:${(box.x / W) * 100}%;top:${(box.y / H) * 100}%;width:${(box.w / W) * 100}%;height:${(box.h / H) * 100}%`,
        'aria-label': `${info.label || id}. ${info.sub || ''}`,
        onclick: () => onRoom && onRoom(id),
      },
      h('span', { class: 'room-tag ' + (info.state || 'todo'), 'aria-hidden': 'true' }, h('span', { class: 'dot' }), info.label || id),
      info.sub ? h('span', { class: 'room-sub', 'aria-hidden': 'true' }, info.sub) : null);
      wrap.append(btn);
    }
  }

  // Residents: tap to wave and say a line.
  const say = h('div', { class: 'bubble-say', role: 'status', hidden: true, style: 'position:absolute;z-index:5;max-width:min(80%,22rem);font-size:var(--fs-small)' });
  let timer = null;
  for (const c of cast) {
    const box = ROOM_BOXES[c.room];
    const left = ((box.x + box.w * c.x) / W) * 100;
    const top = ((box.y + box.h - 14) / H) * 100;
    const fig = character(c.kind, c.label);
    const holder = h('button', {
      class: 'house-char', style: `left:${left}%;top:${top}%;background:none;border:0;padding:0;cursor:pointer`,
      'aria-label': c.label,
      onclick: (e) => {
        e.stopPropagation();
        wave(fig);
        say.replaceChildren(h('span', { class: 'who' }, c.label), c.line);
        say.hidden = false;
        say.style.left = `${Math.max(2, Math.min(60, left - 10))}%`;
        say.style.top = `${Math.max(0, top - 34)}%`;
        clearTimeout(timer);
        timer = setTimeout(() => { say.hidden = true; }, 4500);
      },
    }, fig);
    wrap.append(holder);
  }
  wrap.append(say);
  return wrap;
}
