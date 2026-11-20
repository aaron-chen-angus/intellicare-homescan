/**
 * characters.js - original illustrated cast (vector, life-sim style). No third-party IP.
 *   nurse : Nurse Aisha, the care guide who narrates each screen
 *   mei   : Auntie Mei, senior resident
 *   ravi  : Uncle Ravi, senior resident who uses a walking stick
 * Characters idle-bob and blink; tap one to make it wave (handled by the caller via .wave).
 */
import { svgFromString } from './svg.js';

const CAST = {
  nurse: {
    skin: '#e8b88e', skinShade: '#d39d72', top: '#5fb4e8', topShade: '#3d93cc', bottom: '#3d93cc', shoe: '#ffffff',
    hair: `<path d="M34 60 Q34 28 60 26 Q86 28 86 60 L88 92 Q60 104 32 92 Z" fill="#2f4a7a"/>
           <path d="M38 58 Q40 36 60 34 Q80 36 82 58" fill="none" stroke="#24395f" stroke-width="3"/>`,
    front: `<path d="M44 96 Q60 120 76 96" fill="none" stroke="#2b3a4a" stroke-width="3"/>
            <circle cx="76" cy="122" r="5" fill="#c0c8d0" stroke="#2b3a4a" stroke-width="2"/>
            <rect x="48" y="104" width="10" height="5" rx="2" fill="#ffffff"/>
            <path d="M51 106 h4 M53 104 v5" stroke="#e5484d" stroke-width="1.6"/>`,
    hand: `<rect x="80" y="128" width="24" height="32" rx="4" fill="#1b2a3b" transform="rotate(-12 92 144)"/>
           <rect x="83" y="131" width="18" height="24" rx="2" fill="#8fd3ff" transform="rotate(-12 92 144)"/>`,
  },
  mei: {
    skin: '#f3cfb0', skinShade: '#e2b38f', top: '#ff8fa3', topShade: '#e36c84', bottom: '#6c7a96', shoe: '#7a4a3a',
    hair: `<circle cx="60" cy="30" r="11" fill="#d9d9de"/>
           <path d="M36 60 Q34 34 60 32 Q86 34 84 60 Q80 46 60 44 Q40 46 36 60 Z" fill="#e4e4ea"/>`,
    face: `<g fill="none" stroke="#6b5440" stroke-width="2"><circle cx="51" cy="58" r="6"/><circle cx="69" cy="58" r="6"/><path d="M57 58 h6"/></g>`,
    front: `<path d="M48 92 L60 104 L72 92" fill="none" stroke="#ffffff" stroke-width="3"/>
            <circle cx="60" cy="116" r="2.2" fill="#fff"/><circle cx="60" cy="128" r="2.2" fill="#fff"/>`,
  },
  ravi: {
    skin: '#b9825a', skinShade: '#9f6c47', top: '#2fbf9a', topShade: '#1f9c7c', bottom: '#5a5f6e', shoe: '#3a2a20',
    hair: `<path d="M37 56 Q36 44 42 40 L44 56 Z M83 56 Q84 44 78 40 L76 56 Z" fill="#e6e6e6"/>
           <path d="M50 70 Q60 76 70 70 Q66 74 60 74 Q54 74 50 70 Z" fill="#f0f0f0"/>`,
    front: `<path d="M50 90 L60 100 L70 90" fill="none" stroke="#ffffff" stroke-width="3"/>`,
    stick: `<path d="M98 150 L104 214" stroke="#7a4a2a" stroke-width="4" stroke-linecap="round"/>
            <path d="M92 150 Q98 142 104 150" fill="none" stroke="#7a4a2a" stroke-width="4" stroke-linecap="round"/>`,
  },
};

/** Build the SVG markup of a character. */
function markup(kind) {
  const c = CAST[kind];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 224" class="char">
  <defs>
    <linearGradient id="top$$" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.top}"/><stop offset="1" stop-color="${c.topShade}"/></linearGradient>
    <radialGradient id="skin$$" cx="0.4" cy="0.35" r="0.75"><stop offset="0" stop-color="${c.skin}"/><stop offset="1" stop-color="${c.skinShade}"/></radialGradient>
  </defs>
  <ellipse cx="60" cy="216" rx="34" ry="6" fill="rgba(20,40,70,.18)"/>
  <g class="bob">
    ${c.stick || ''}
    <rect x="45" y="150" width="13" height="58" rx="6" fill="${c.bottom}"/>
    <rect x="62" y="150" width="13" height="58" rx="6" fill="${c.bottom}"/>
    <ellipse cx="50" cy="210" rx="10" ry="5" fill="${c.shoe}"/>
    <ellipse cx="70" cy="210" rx="10" ry="5" fill="${c.shoe}"/>
    <path d="M34 100 Q36 86 52 84 L68 84 Q84 86 86 100 L88 160 Q60 168 32 160 Z" fill="url(#top$$)"/>
    <path d="M36 96 Q30 124 32 150" stroke="url(#top$$)" stroke-width="12" stroke-linecap="round" fill="none"/>
    <circle cx="32" cy="152" r="6" fill="url(#skin$$)"/>
    <g class="arm-wave">
      <path d="M84 96 Q92 120 90 146" stroke="url(#top$$)" stroke-width="12" stroke-linecap="round" fill="none"/>
      <circle cx="90" cy="148" r="6" fill="url(#skin$$)"/>
      ${c.hand || ''}
    </g>
    ${c.front || ''}
    <rect x="54" y="74" width="12" height="14" rx="4" fill="${c.skinShade}"/>
    ${kind === 'nurse' ? c.hair : ''}
    <circle cx="60" cy="58" r="23" fill="url(#skin$$)"/>
    ${kind === 'nurse' ? '<path d="M37 52 Q40 32 60 32 Q80 32 83 52 Q72 40 60 40 Q48 40 37 52 Z" fill="#2f4a7a"/>' : c.hair}
    <circle cx="46" cy="66" r="4" fill="#ff8a8a" opacity=".35"/><circle cx="74" cy="66" r="4" fill="#ff8a8a" opacity=".35"/>
    <ellipse cx="51" cy="58" rx="2.6" ry="3" fill="#2b2b33"/><ellipse cx="69" cy="58" rx="2.6" ry="3" fill="#2b2b33"/>
    <circle cx="52" cy="57" r="0.9" fill="#fff"/><circle cx="70" cy="57" r="0.9" fill="#fff"/>
    <g class="eyelid"><rect x="47" y="54" width="9" height="8" rx="3" fill="${c.skin}"/><rect x="65" y="54" width="9" height="8" rx="3" fill="${c.skin}"/></g>
    ${c.face || ''}
    <path d="M52 68 Q60 75 68 68" fill="none" stroke="#7a3b2e" stroke-width="2.4" stroke-linecap="round"/>
  </g>
</svg>`;
}

/** @param {'nurse'|'mei'|'ravi'} kind */
export function character(kind, label) {
  return svgFromString(markup(kind), { label, className: 'char' });
}

/** Make a character wave once (and hop if it has no free hand). */
export function wave(svgEl) {
  svgEl.classList.remove('wave', 'hop');
  void svgEl.getBoundingClientRect(); // restart the animation
  svgEl.classList.add('wave');
}
