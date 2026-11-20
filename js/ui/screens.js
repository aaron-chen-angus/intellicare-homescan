/**
 * screens.js - Title, World Map, Room briefing, Help tutorial and Settings screens.
 * Each screen is a function (ctx) => { title, node } where ctx = { config, go }.
 */
import { h, typewriter, mascot } from './components.js';
import { t, getLanguage, setLanguage } from '../i18n.js';
import { getSettings, setSettings } from '../state.js';
import { clearanceValid } from '../risk.js';

const ICONS = { bedroom: 'BED', kitchen: 'POT', dining: 'TBL', living: 'SOFA' };

/** Header bar with optional back target and the help / settings buttons. */
function topbar(ctx, { back } = {}) {
  return h('header', { class: 'topbar' },
    back
      ? h('button', { class: 'btn ghost', onclick: () => ctx.go(back), 'aria-label': t('hs.back') }, '< ' + t('hs.back'))
      : h('span'),
    h('div', { class: 'row' },
      h('button', { class: 'btn secondary', onclick: () => ctx.go('/help'), 'aria-label': t('hs.help') }, '?'),
      h('button', { class: 'btn secondary', onclick: () => ctx.go('/settings'), 'aria-label': t('hs.settings') }, 'SET'))
  );
}

const disclaimer = () => h('p', { class: 'footer' }, t('hs.disclaimer'));

/** Title screen: "PRESS START". */
export function title(ctx) {
  const node = h('main', { class: 'screen center', id: 'main' },
    mascot('Safi, the pixel helper robot with a hard hat'),
    h('h1', { tabindex: '-1' }, ctx.config.app.app_name),
    h('p', {}, t('hs.tagline')),
    h('div', { class: 'pixel-box' }, h('p', {}, t('home_scanning.intro_description'))),
    h('button', { class: 'btn blink', onclick: () => ctx.go('/map') }, t('hs.press_start')),
    h('div', { class: 'row' },
      h('button', { class: 'btn secondary', onclick: () => ctx.go('/help') }, '? ' + t('hs.help')),
      h('button', { class: 'btn ghost', onclick: () => ctx.go('/settings') }, t('hs.settings'))),
    disclaimer());
  return { title: ctx.config.app.app_name, node };
}

/** Exercise door: locked until a valid clearance record exists. */
function exerciseDoor(ctx) {
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem(ctx.config.app.clearance_storage_key) || 'null'); } catch { /* unreadable record counts as none */ }
  const open = clearanceValid(rec);
  const children = [
    h('span', { class: 'lock', 'aria-hidden': 'true' }, open ? 'OPEN' : 'LOCK'),
    h('div', {},
      h('h2', {}, t('hs.exercise_door')),
      h('p', {}, open ? t('hs.exercise_open') : t('hs.exercise_locked')),
      open ? h('p', { class: 'muted' }, t('hs.exercise_valid_until', { date: new Date(rec.expiresAt).toLocaleDateString(getLanguage()) })) : null),
    h('span', { class: 'chip ' + (open ? rec.status : 'NOT_ISSUED') }, t('hs.clearance.' + (open ? rec.status : 'NOT_ISSUED'))),
  ];
  return h('section', { class: 'pixel-box door' + (open ? ' open' : ''), 'aria-label': t('hs.clearance.title') }, ...children);
}

/** World map: four room "levels" plus the locked exercise door. */
export function map(ctx) {
  const guides = ctx.config.guides.rooms;
  const cards = ctx.config.app.rooms.map((room) => {
    const n = guides[room].required.length;
    return h('button', { class: 'room-card', onclick: () => ctx.go('/room/' + room) },
      h('span', { class: 'icon', 'aria-hidden': 'true' }, ICONS[room]),
      h('span', { class: 'name' }, t('hs.room.' + room)),
      room === 'kitchen' ? h('span', { class: 'chip HIGH' }, '! ' + t('hs.room.kitchen_boss')) : null,
      room === getSettings().exerciseZone ? h('span', { class: 'chip secondary' }, t('hs.exercise_zone')) : null,
      h('span', { class: 'sub' }, t('hs.room.status_todo') + ' | ' + t('hs.room.shots_needed', { n })));
  });
  const node = h('div', { class: 'screen' },
    topbar(ctx, { back: '/' }),
    h('main', { id: 'main', class: 'screen' },
      h('h1', { tabindex: '-1' }, t('hs.map_title')),
      exerciseDoor(ctx),
      h('div', { class: 'rooms' }, h('div', { class: 'rooms-grid' }, ...cards)),
      disclaimer()));
  return { title: t('hs.map_title'), node };
}

/** Room briefing: required shots, what to include, optional shots. */
export function room(ctx, roomId) {
  const guide = ctx.config.guides.rooms[roomId];
  if (!guide) return notFound(ctx);
  const isExercise = getSettings().exerciseZone === roomId;
  const node = h('div', { class: 'screen' },
    topbar(ctx, { back: '/map' }),
    h('main', { id: 'main', class: 'screen' },
      h('h1', { tabindex: '-1' }, t('hs.room.' + roomId)),
      h('div', { class: 'pixel-box' },
        h('h2', {}, t('hs.briefing_title')),
        typewriter(t('hs.rule.height')),
        isExercise ? h('p', { class: 'muted' }, t('hs.exercise_zone_default')) : null),
      h('div', { class: 'split' },
        h('section', { class: 'pixel-box' },
          h('h2', {}, t('hs.required_shots')),
          h('ol', { class: 'list' },
            ...guide.required.map((s) => h('li', {},
              h('strong', {}, t(s.label)),
              h('div', { class: 'muted' }, t('hs.must_include') + ': ' + s.include))))),
        h('section', { class: 'pixel-box' },
          h('h2', {}, t('hs.optional_shots')),
          h('ul', { class: 'list' }, ...guide.optional.map((o) => h('li', {}, o))))),
      disclaimer()));
  return { title: t('hs.room.' + roomId), node };
}

/** Help: the universal photo rules, one at a time. */
export function help(ctx) {
  const rules = ctx.config.guides.universal_rules;
  const body = h('div', { class: 'pixel-box', 'aria-live': 'polite' });
  let i = 0;
  const next = h('button', { class: 'btn' }, '');
  const show = () => {
    body.replaceChildren(
      h('h2', {}, `${t('hs.universal_rules')} ${i + 1}/${rules.length}`),
      typewriter(t(rules[i])));
    next.textContent = i === rules.length - 1 ? t('hs.close') : '>';
    next.setAttribute('aria-label', i === rules.length - 1 ? t('hs.close') : 'Next');
  };
  next.addEventListener('click', () => {
    if (i < rules.length - 1) { i += 1; show(); } else ctx.back();
  });
  show();
  const node = h('div', { class: 'screen' },
    topbar(ctx, { back: '/map' }),
    h('main', { id: 'main', class: 'screen center' },
      h('h1', { tabindex: '-1' }, t('hs.help')),
      mascot('Safi'),
      body,
      next));
  return { title: t('hs.help'), node };
}

/** Settings: language and display options. */
export function settings(ctx) {
  const s = getSettings();
  const toggle = (key, label) => h('label', { class: 'toggle' },
    h('span', {}, label),
    h('input', { type: 'checkbox', checked: s[key] || null, onchange: (e) => setSettings({ [key]: e.target.checked }) }));
  const lang = h('select', {
    id: 'lang', 'aria-label': t('hs.language'),
    onchange: async (e) => { await setLanguage(e.target.value); setSettings({ lang: e.target.value }); ctx.rerender(); },
  }, ...[['en', 'English'], ['zh', '简体中文'], ['ms', 'Bahasa Melayu'], ['ta', 'தமிழ்']]
    .map(([v, name]) => h('option', { value: v, selected: v === getLanguage() || null }, name)));
  const node = h('div', { class: 'screen' },
    topbar(ctx, { back: '/map' }),
    h('main', { id: 'main', class: 'screen' },
      h('h1', { tabindex: '-1' }, t('hs.settings')),
      h('div', { class: 'pixel-box' },
        h('label', { class: 'toggle', for: 'lang' }, h('span', {}, t('hs.language')), lang),
        toggle('largeText', t('hs.large_text')),
        toggle('highContrast', t('hs.high_contrast')),
        toggle('crt', t('hs.crt')))));
  return { title: t('hs.settings'), node };
}

/** Unknown route. */
export function notFound(ctx) {
  const node = h('main', { class: 'screen center', id: 'main' },
    h('h1', { tabindex: '-1' }, '404'),
    h('button', { class: 'btn', onclick: () => ctx.go('/') }, t('hs.back')));
  return { title: '404', node };
}
