/**
 * tutorial-art.js - illustrations for the eight universal photo rules (original vector art).
 * Keys match config/shot_guides.json universal_rules.
 */
import { svgFromString } from './svg.js';

const room = (extra = '') => `
  <rect width="400" height="260" fill="#eaf6ff"/>
  <rect x="0" y="180" width="400" height="80" fill="#e8c9a0"/>
  <path d="M0 180 L400 180" stroke="#cfa877" stroke-width="3"/>
  <rect x="40" y="110" width="110" height="60" rx="14" fill="#77a4ea"/><rect x="48" y="96" width="94" height="28" rx="12" fill="#8db5f0"/>
  <rect x="250" y="120" width="90" height="12" rx="4" fill="#b9824d"/><rect x="258" y="132" width="6" height="48" fill="#9a6a3c"/><rect x="326" y="132" width="6" height="48" fill="#9a6a3c"/>
  ${extra}`;
const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260">${inner}</svg>`;
const check = (x, y) => `<circle cx="${x}" cy="${y}" r="20" fill="#2fbf71"/><path d="M${x - 9} ${y} l6 7 l13 -14" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
const phone = (x, y, w, hgt, screen = '#8fd3ff', rot = 0) => `<g transform="rotate(${rot} ${x + w / 2} ${y + hgt / 2})"><rect x="${x}" y="${y}" width="${w}" height="${hgt}" rx="10" fill="#1b2a3b"/><rect x="${x + 6}" y="${y + 6}" width="${w - 12}" height="${hgt - 12}" rx="5" fill="${screen}"/></g>`;

const ART = {
  'hs.rule.lights': frame(room(`
    <rect x="170" y="30" width="70" height="60" rx="4" fill="#bfe4ff" stroke="#fff" stroke-width="6"/>
    <circle cx="205" cy="60" r="14" fill="#ffd24d"/>
    <path d="M160 26 q20 40 0 70 M250 26 q-20 40 0 70" fill="#b9a5f0"/>
    <path d="M330 0 v28" stroke="#7c8a9a" stroke-width="3"/><path d="M308 46 q22 -26 44 0 z" fill="#ffd24d"/>
    <circle cx="330" cy="50" r="60" fill="#fff6c8" opacity=".55"/>${check(370, 220)}`)),
  'hs.rule.people': frame(room(`
    <g opacity=".85"><circle cx="210" cy="80" r="20" fill="#f3cfb0"/><rect x="190" y="100" width="40" height="70" rx="16" fill="#ff8fa3"/></g>
    <ellipse cx="300" cy="186" rx="22" ry="12" fill="#c98a4a"/><circle cx="318" cy="174" r="10" fill="#c98a4a"/>
    <circle cx="250" cy="130" r="88" fill="none" stroke="#e5484d" stroke-width="10"/><path d="M188 68 L312 192" stroke="#e5484d" stroke-width="10"/>`)),
  'hs.rule.dont_tidy': frame(room(`
    <ellipse cx="200" cy="210" rx="60" ry="10" fill="#f0b86a"/>
    <rect x="96" y="196" width="26" height="12" rx="5" fill="#7a4a3a"/><rect x="128" y="200" width="26" height="12" rx="5" fill="#7a4a3a"/>
    <path d="M200 236 q40 -20 80 0 t70 -6" stroke="#2b3a4a" stroke-width="4" fill="none"/>
    <rect x="300" y="186" width="32" height="28" rx="6" fill="#d9a36a"/>${check(370, 40)}`)),
  'hs.rule.height': frame(`
    <rect width="400" height="260" fill="#eaf6ff"/><rect x="0" y="220" width="400" height="40" fill="#e8c9a0"/>
    <circle cx="70" cy="70" r="20" fill="#f3cfb0"/><path d="M52 66 Q50 44 70 42 Q90 44 88 66 Q84 54 70 54 Q56 54 52 66 Z" fill="#e4e4ea"/>
    <rect x="50" y="90" width="40" height="80" rx="14" fill="#ff8fa3"/><rect x="54" y="168" width="14" height="52" rx="6" fill="#6c7a96"/><rect x="72" y="168" width="14" height="52" rx="6" fill="#6c7a96"/>
    <path d="M86 104 L112 116" stroke="#ff8fa3" stroke-width="12" stroke-linecap="round"/>
    <rect x="110" y="102" width="10" height="30" rx="3" fill="#1b2a3b"/>
    <polygon points="120,117 400,40 400,230" fill="rgba(31,111,224,.15)" stroke="rgba(31,111,224,.5)" stroke-width="2" stroke-dasharray="8 6"/>
    <path d="M30 117 v100" stroke="#154fa8" stroke-width="3"/><path d="M24 117 h12 M24 220 h12" stroke="#154fa8" stroke-width="3"/>
    <rect x="0" y="150" width="58" height="26" rx="8" fill="#fff"/><text x="29" y="168" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="700" font-size="13" fill="#154fa8">1.2-1.5 m</text>
    <rect x="250" y="14" width="140" height="92" rx="8" fill="#fff" stroke="#1b2a3b" stroke-width="3"/>
    <rect x="256" y="20" width="128" height="80" rx="4" fill="#d6ecff"/><rect x="256" y="66" width="128" height="34" fill="#e8c9a0"/>
    <path d="M256 66 h128" stroke="#e0a800" stroke-width="2" stroke-dasharray="5 4"/>
    <text x="320" y="89" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="700" font-size="11" fill="#6b4a00">FLOOR 1/3+</text>`),
  'hs.rule.landscape': frame(`
    <rect width="400" height="260" fill="#eaf6ff"/>
    ${phone(40, 70, 190, 110, '#bfe4ff')}<rect x="52" y="140" width="166" height="28" fill="#e8c9a0"/>${check(214, 70)}
    <g opacity=".55">${phone(290, 60, 70, 130, '#bfe4ff')}<rect x="302" y="150" width="46" height="28" fill="#e8c9a0"/>
    <rect x="300" y="72" width="16" height="70" rx="2" fill="#c9905d"/></g>`),
  'hs.rule.hold_still': frame(`
    <rect width="400" height="260" fill="#eaf6ff"/>
    ${phone(90, 40, 220, 160, '#20354a')}
    <rect x="112" y="62" width="176" height="80" rx="6" fill="#bfe4ff"/><rect x="112" y="112" width="176" height="30" fill="#e8c9a0"/>
    <g font-family="Poppins,sans-serif" font-weight="700" font-size="11">
      <rect x="112" y="152" width="54" height="24" rx="12" fill="#d9f5e5" stroke="#2fbf71" stroke-width="2"/><text x="139" y="168" text-anchor="middle" fill="#0b5a32">LIGHT</text>
      <rect x="173" y="152" width="54" height="24" rx="12" fill="#d9f5e5" stroke="#2fbf71" stroke-width="2"/><text x="200" y="168" text-anchor="middle" fill="#0b5a32">STEADY</text>
      <rect x="234" y="152" width="54" height="24" rx="12" fill="#d9f5e5" stroke="#2fbf71" stroke-width="2"/><text x="261" y="168" text-anchor="middle" fill="#0b5a32">FLOOR</text>
    </g>
    <circle cx="350" cy="60" r="30" fill="#fff"/><circle cx="350" cy="60" r="24" fill="none" stroke="#12a37f" stroke-width="6" stroke-dasharray="150" stroke-dashoffset="20"/>
    <text x="350" y="66" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="700" font-size="16" fill="#12a37f">2s</text>`),
  'hs.rule.no_flash': frame(room(`
    <ellipse cx="220" cy="214" rx="80" ry="14" fill="#ffffff" opacity=".9"/>
    <ellipse cx="220" cy="214" rx="40" ry="6" fill="#ffffff"/>
    <path d="M200 30 l-24 44 h20 l-12 40 l40 -56 h-22 l14 -28 z" fill="#ffd24d" stroke="#e0a800" stroke-width="3"/>
    <circle cx="200" cy="70" r="58" fill="none" stroke="#e5484d" stroke-width="9"/><path d="M160 30 L240 110" stroke="#e5484d" stroke-width="9"/>`)),
  'hs.rule.all_shots': frame(`
    <rect width="400" height="260" fill="#eaf6ff"/>
    ${[30, 150, 270].map((x, i) => `<rect x="${x}" y="60" width="100" height="76" rx="10" fill="#fff" stroke="#c6d6e8" stroke-width="3"/>
      <rect x="${x + 8}" y="68" width="84" height="40" rx="4" fill="#bfe4ff"/><rect x="${x + 8}" y="96" width="84" height="32" fill="#e8c9a0"/>
      ${check(x + 92, 62)}<text x="${x + 50}" y="160" text-anchor="middle" font-family="Poppins,sans-serif" font-weight="700" font-size="14" fill="#1b2a3b">${i + 1}</text>`).join('')}
    <path d="M200 186 l9 18 l20 3 l-15 14 l4 20 l-18 -10 l-18 10 l4 -20 l-15 -14 l20 -3 z" fill="#ffd24d" stroke="#e0a800" stroke-width="3"/>
    <text x="250" y="224" font-family="Poppins,sans-serif" font-weight="700" font-size="15" fill="#6b4a00">+ XP</text>`),
};

export function tutorialArt(ruleKey, label) {
  return svgFromString(ART[ruleKey] || ART['hs.rule.lights'], { label });
}
