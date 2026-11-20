/**
 * screens.js - Title, House map, Room mission board, Tutorial and Settings.
 * Each screen is (ctx) => { title, node, cleanup? } where ctx = { config, go, back, rerender }.
 */
import { h, guide, hud, disclaimer, toast, bandChip } from './components.js';
import { buildHouse } from './house.js';
import { buildPlan } from './plan.js';
import { tutorialArt } from './tutorial-art.js';
import { t, getLanguage, setLanguage } from '../i18n.js';
import { getSettings, setSettings, capturedIds, getShot, getAnalysis, roomAnalyses, clearAll, isPersistent } from '../state.js';
import { clearanceValid, bandOf } from '../risk.js';
import { roomProgress, shotList, assignUploads, findShot } from '../shots.js';
import { requestTiltPermission } from '../tilt.js';
import { ingestFile } from '../ingest.js';
import { pendingShots } from '../analyze.js';
import { loadSampleHome } from '../samples.js';

const CAST_LINES = (room) => [
  { kind: 'mei', room: 'living', x: 0.62, label: t('hs.name.mei'), line: t('hs.say.mei') },
  { kind: 'ravi', room: 'bedroom', x: 0.86, label: t('hs.name.ravi'), line: t('hs.say.ravi') },
  { kind: 'nurse', room: room || 'dining', x: 0.18, label: t('hs.name.nurse'), line: t('hs.say.nurse_tap') },
];

/** Overall required-shot progress across all rooms, 0..100. */
function homeProgress(ctx) {
  let done = 0;
  let total = 0;
  for (const r of ctx.config.app.rooms) {
    const p = roomProgress(ctx.config.guides, r, capturedIds(r));
    done += p.done;
    total += p.total;
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function roomsDone(ctx) {
  return ctx.config.app.rooms.filter((r) => {
    const p = roomProgress(ctx.config.guides, r, capturedIds(r));
    return p.done === p.total;
  }).length;
}

/** Highest band among a room's analysed hazards (active only), or null. */
function roomWorst(ctx, room) {
  let max = 0;
  for (const a of roomAnalyses(room)) for (const hz of a.hazards || []) if (!hz.pending) max = Math.max(max, hz.rating);
  return max ? bandOf(max, ctx.config.matrix).id : null;
}

function ring(pct, label) {
  return h('div', { class: 'ring', style: `--p:${pct}`, role: 'img', 'aria-label': label }, h('div', {}, `${pct}%`));
}

// ---------------------------------------------------------------- Title
export function title(ctx) {
  const prog = homeProgress(ctx);
  const started = prog.done > 0;
  const steps = [
    ['1', t('hs.how.s1'), t('hs.how.s1d')],
    ['2', t('hs.how.s2'), t('hs.how.s2d')],
    ['3', t('hs.how.s3'), t('hs.how.s3d')],
  ];
  const node = h('div', { class: 'stage' },
    hud(ctx, { progress: prog.pct }),
    h('main', { id: 'main', class: 'split' },
      h('section', { class: 'panel stack' },
        h('span', { class: 'eyebrow' }, t('hs.eyebrow')),
        h('h1', { tabindex: '-1' }, t('hs.hero')),
        h('p', {}, t('home_scanning.intro_description')),
        guide('nurse', started ? t('hs.say.nurse_back', { pct: prog.pct }) : t('hs.say.nurse_welcome')),
        h('div', { class: 'row' },
          h('button', { class: 'btn big pulse', onclick: () => ctx.go(getSettings().tutorialSeen ? '/map' : '/help') }, started ? t('hs.cta.continue') : t('home_scanning.start_test')),
          started ? h('button', { class: 'btn gold', onclick: () => ctx.go('/report') }, '\uD83D\uDCCA ' + t('hs.rp.cta')) : null,
          h('button', { class: 'btn soft', onclick: () => ctx.go('/help') }, t('hs.help'))),
        h('p', { class: 'muted' }, '\uD83D\uDD12 ' + t('hs.local_note'))),
      h('section', { class: 'stack' },
        buildHouse({ cast: CAST_LINES() }),
        h('p', { class: 'muted', style: 'text-align:center' }, t('hs.tap_people')))),
    h('section', { class: 'panel' },
      h('h2', {}, t('hs.how.title')),
      h('div', { class: 'split', style: 'grid-template-columns:repeat(auto-fit,minmax(14rem,1fr));margin-top:.8rem' },
        ...steps.map(([n, title2, desc]) => h('div', { class: 'row', style: 'align-items:flex-start;flex-wrap:nowrap' },
          h('div', { class: 'ring', style: '--p:100;width:3.4rem;height:3.4rem' }, h('div', {}, n)),
          h('div', {}, h('strong', {}, title2), h('p', { class: 'muted' }, desc)))))),
    disclaimer());
  return { title: t('home_scanning.app_bar_title'), node };
}

// ---------------------------------------------------------------- House map
function exerciseDoor(ctx) {
  let rec = null;
  try { rec = JSON.parse(localStorage.getItem(ctx.config.app.clearance_storage_key) || 'null'); } catch { /* unreadable record counts as none */ }
  const open = clearanceValid(rec);
  const status = open ? rec.status : 'NOT_ISSUED';
  return h('section', { class: 'panel door' + (open ? ' open' : ''), 'aria-label': t('hs.clearance.title') },
    h('div', { class: 'lock', 'aria-hidden': 'true' }, open ? '\uD83D\uDD13' : '\uD83D\uDD12'),
    h('div', { class: 'grow' },
      h('h2', {}, t('hs.exercise_door')),
      h('p', { class: 'muted' }, open ? t('hs.exercise_open') : t('hs.exercise_locked')),
      open ? h('p', { class: 'muted' }, t('hs.exercise_valid_until', { date: new Date(rec.expiresAt).toLocaleDateString(getLanguage()) })) : null),
    h('span', { class: 'chip ' + (open ? status : 'info') }, t('hs.clearance.' + status)));
}

/** Entry to the consolidated report; analyses every pending photo in one go. */
function reportCard(ctx, prog) {
  const pending = pendingShots(ctx).length;
  return h('section', { class: 'panel stack report-card' },
    h('div', { class: 'row', style: 'flex-wrap:nowrap' },
      h('div', { class: 'lock', 'aria-hidden': 'true', style: 'background:#fff1c2' }, '\uD83D\uDCCA'),
      h('div', {},
        h('h2', {}, t('hs.rp.title')),
        h('p', { class: 'muted' }, prog.done ? (pending ? t('hs.rp.card_pending', { n: pending }) : t('hs.rp.card_ready')) : t('hs.rp.card_empty')))),
    h('button', { class: 'btn gold', onclick: () => ctx.go('/report') }, pending ? t('hs.rp.cta_all', { n: pending }) : t('hs.rp.cta')));
}

export function map(ctx) {
  const prog = homeProgress(ctx);
  const rooms = {};
  const list = [];
  for (const r of ctx.config.app.rooms) {
    const p = roomProgress(ctx.config.guides, r, capturedIds(r));
    const state = p.done === 0 ? 'todo' : p.done === p.total ? 'done' : 'part';
    const sub = state === 'done' ? '\u2713 ' + t('hs.room.done') : t('hs.room.progress', { done: p.done, n: p.total });
    rooms[r] = { label: t('hs.room.' + r), sub, state };
    const worst = roomWorst(ctx, r);
    list.push(h('button', { class: 'panel tight row', style: 'width:100%;text-align:left;cursor:pointer;border:0;flex-wrap:nowrap', onclick: () => ctx.go('/room/' + r) },
      ring(Math.round((p.done / p.total) * 100), sub),
      h('div', { style: 'flex:1;min-width:0' },
        h('strong', {}, t('hs.room.' + r)),
        h('div', { class: 'row', style: 'margin-top:.25rem' },
          r === 'kitchen' ? h('span', { class: 'chip HIGH' }, '\u2605 ' + t('hs.room.kitchen_boss')) : null,
          r === getSettings().exerciseZone ? h('span', { class: 'chip info' }, t('hs.exercise_zone')) : null,
          worst ? bandChip(worst) : null),
        h('p', { class: 'muted' }, sub)),
      h('span', { 'aria-hidden': 'true', style: 'font-size:1.6rem;color:var(--primary)' }, '\u203A')));
  }
  const node = h('div', { class: 'stage' },
    hud(ctx, { back: '/', progress: prog.pct }),
    h('main', { id: 'main', class: 'stack' },
      h('div', { class: 'row between' },
        h('h1', { tabindex: '-1' }, t('hs.map_title')),
        h('span', { class: 'chip info' }, t('hs.hud.rooms', { done: roomsDone(ctx), n: ctx.config.app.rooms.length }))),
      guide('nurse', t('hs.say.nurse_map')),
      h('div', { class: 'split' },
        h('div', { class: 'stack' },
          buildHouse({ interactive: true, rooms, onRoom: (id) => ctx.go('/room/' + id), cast: CAST_LINES() }),
          h('p', { class: 'muted', style: 'text-align:center' }, t('hs.map.tap_room'))),
        h('div', { class: 'stack' }, reportCard(ctx, prog), exerciseDoor(ctx), ...list))),
    disclaimer());
  return { title: t('hs.map_title'), node };
}

// ---------------------------------------------------------------- Room mission board
/** Hidden file picker (gallery / files / camera on mobile). */
function picker(onFiles, multiple = false) {
  return h('input', { type: 'file', accept: 'image/*', multiple: multiple || null, class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true',
    onchange: (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) onFiles(f); } });
}

function shotCard(ctx, roomId, shot, index, isNext, plan) {
  const rec = getShot(shot.id);
  const analysis = getAnalysis(shot.id);
  const thumb = h('div', { class: 'shot-thumb' + (rec ? ' done' : '') });
  if (rec && rec.blob) {
    const url = URL.createObjectURL(rec.blob);
    thumb.append(h('img', { src: url, alt: t(shot.label), onload: () => URL.revokeObjectURL(url) }));
  } else if (shot.cam && plan) {
    thumb.append(buildPlan(plan, shot.cam, t('hs.shot.where') + ': ' + t(shot.label)),
      h('span', { class: 'caption', 'aria-hidden': 'true' }, t('hs.shot.where')));
  } else {
    thumb.append(h('span', { class: 'placeholder', 'aria-hidden': 'true' }, '\uD83D\uDD0D'));
  }
  thumb.append(h('span', { class: 'badge', 'aria-hidden': 'true' }, rec ? '\u2713' : String(index)));

  const input = picker(async ([file]) => {
    try {
      await ingestFile(file, roomId, shot, ctx.config.thresholds.quality);
      toast(t('hs.cam.shot_done'));
      ctx.go(`/analyze/${roomId}/${shot.id}`);
    } catch (e) {
      toast(t('home_scanning.error_generic', { error: e.message }), 'err');
    }
  });

  let status;
  if (analysis) {
    const n = (analysis.hazards || []).filter((x) => !x.pending).length;
    status = n ? h('span', { class: 'chip HIGH' }, '! ' + t('hs.an.found', { n })) : h('span', { class: 'chip LOW' }, '\u2713 ' + t('hs.an.none_short'));
  } else if (rec) status = h('span', { class: 'chip info' }, t('hs.shot.ready_check'));
  else status = h('span', { class: 'chip ' + (shot.required ? 'MEDIUM' : 'info') }, shot.required ? t('hs.shot.todo') : t('hs.shot.bonus'));

  return h('article', { class: 'panel shot-card' + (isNext ? ' next' : '') + (shot.required ? '' : ' compact') },
    thumb,
    h('div', {},
      h('h3', {}, t(shot.label)),
      shot.include ? h('p', { class: 'muted' }, t('hs.must_include') + ': ' + t(shot.include)) : null,
      h('div', { class: 'row', style: 'margin-top:.35rem' }, status),
      h('div', { class: 'actions' },
        h('button', { class: 'btn small' + (isNext ? '' : ' soft'), onclick: () => { requestTiltPermission(); ctx.go(`/camera/${roomId}/${shot.id}`); } },
          '\uD83D\uDCF7 ' + (rec ? t('home_scanning.retake') : t('hs.cam.shutter'))),
        h('button', { class: 'btn small soft', onclick: () => input.click() }, '\uD83D\uDDBC ' + t('hs.shot.upload')),
        rec ? h('button', { class: 'btn small mint', onclick: () => ctx.go(`/analyze/${roomId}/${shot.id}`) }, analysis ? t('hs.shot.view') : t('hs.shot.check')) : null,
        input)));
}

export function room(ctx, roomId) {
  const guides = ctx.config.guides;
  const g = guides.rooms[roomId];
  if (!g) return notFound(ctx);
  const taken = capturedIds(roomId);
  const all = shotList(guides, roomId);
  const required = all.filter((s) => s.required);
  const optional = all.filter((s) => !s.required);
  const p = roomProgress(guides, roomId, taken);
  const pct = Math.round((p.done / p.total) * 100);
  const nextId = (required.find((s) => !taken.has(s.id)) || {}).id;

  const bulk = picker(async (files) => {
    const plan = assignUploads(guides, roomId, capturedIds(roomId), files);
    let ok = 0;
    for (const { file, shotId } of plan) {
      try { await ingestFile(file, roomId, findShot(guides, roomId, shotId), ctx.config.thresholds.quality); ok++; } catch { /* skip unreadable file */ }
    }
    toast(t('hs.room.uploaded', { n: ok }));
    if (ok) ctx.go(`/analyze/${roomId}/${plan[0].shotId}`);
    else ctx.rerender();
  }, true);

  // Findings so far in this room (deduplicated by hazard id).
  const seen = new Map();
  for (const a of roomAnalyses(roomId)) for (const hz of a.hazards || []) if (!hz.pending && !seen.has(hz.hazard_id)) seen.set(hz.hazard_id, hz);
  const counts = { EXTREME: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const hz of seen.values()) counts[hz.band]++;

  const node = h('div', { class: 'stage' },
    hud(ctx, { back: '/map', progress: pct }),
    h('main', { id: 'main', class: 'stack' },
      h('div', { class: 'row between' },
        h('div', { class: 'stack', style: 'gap:.2rem' },
          h('span', { class: 'eyebrow' }, t('hs.briefing_title')),
          h('h1', { tabindex: '-1' }, t('hs.room.' + roomId)),
          h('div', { class: 'row' },
            roomId === getSettings().exerciseZone ? h('span', { class: 'chip info' }, t('hs.exercise_zone')) : null,
            roomId === 'kitchen' ? h('span', { class: 'chip HIGH' }, '\u2605 ' + t('hs.room.kitchen_boss')) : null)),
        ring(pct, t('hs.room.progress', { done: p.done, n: p.total }))),
      guide('nurse', p.done === p.total ? t('hs.room.all_done') : t('hs.say.nurse_room', { n: p.total - p.done })),
      h('div', { class: 'split' },
        h('section', { class: 'stack', 'aria-label': t('hs.required_shots') },
          h('h2', {}, t('hs.required_shots')),
          ...required.map((s, i) => shotCard(ctx, roomId, s, i + 1, s.id === nextId, g.plan))),
        h('aside', { class: 'stack' },
          h('section', { class: 'panel stack' },
            h('h2', {}, t('hs.room.upload_all')),
            h('p', { class: 'muted' }, t('hs.room.upload_all_d')),
            h('button', { class: 'btn', onclick: () => bulk.click() }, '\uD83D\uDDBC ' + t('hs.room.upload_btn')),
            bulk),
          h('section', { class: 'panel stack' },
            h('h2', {}, t('hs.an.summary')),
            seen.size
              ? h('div', { class: 'row' }, ...Object.entries(counts).filter(([, n]) => n).map(([b, n]) => h('span', {}, bandChip(b), ' \u00D7 ' + n)))
              : h('p', { class: 'muted' }, t('hs.an.summary_none'))),
          h('section', { class: 'stack' },
            h('h2', {}, t('hs.optional_shots')),
            ...optional.map((s, i) => shotCard(ctx, roomId, s, i + 1, false, null)))))),
    disclaimer());
  return { title: t('hs.room.' + roomId), node };
}

// ---------------------------------------------------------------- Tutorial
export function help(ctx) {
  const rules = ctx.config.guides.universal_rules;
  let i = 0;
  const card = h('div', { class: 'tut-card' });
  const dots = h('div', { class: 'dots', 'aria-hidden': 'true' });
  const prev = h('button', { class: 'btn soft' }, '\u2190 ' + t('hs.tut.prev'));
  const next = h('button', { class: 'btn' }, '');
  const finish = () => { setSettings({ tutorialSeen: true }); ctx.go('/map'); };

  const show = () => {
    const key = rules[i];
    const id = key.split('.').pop();
    card.replaceChildren(
      h('div', { class: 'tut-art' }, tutorialArt(key, t('hs.tut.title.' + id))),
      h('div', { class: 'stack' },
        h('span', { class: 'eyebrow' }, t('hs.tut.step', { i: i + 1, n: rules.length })),
        h('h2', {}, t('hs.tut.title.' + id)),
        h('p', {}, t(key)),
        h('div', { class: 'stack', style: 'gap:.5rem' },
          h('span', { class: 'dohint' }, t('hs.tut.do.' + id)),
          h('span', { class: 'avoid' }, t('hs.tut.avoid.' + id)))));
    dots.replaceChildren(...rules.map((_, k) => h('i', { class: k === i ? 'on' : '' })));
    prev.disabled = i === 0;
    next.textContent = i === rules.length - 1 ? '\u2713 ' + t('hs.tut.done') : t('hs.tut.next') + ' \u2192';
  };
  prev.addEventListener('click', () => { if (i > 0) { i--; show(); } });
  next.addEventListener('click', () => { if (i < rules.length - 1) { i++; show(); } else finish(); });
  show();

  const node = h('div', { class: 'stage' },
    hud(ctx, { back: '/' }),
    h('main', { id: 'main', class: 'stack' },
      h('h1', { tabindex: '-1' }, t('hs.help')),
      guide('nurse', t('hs.say.nurse_tut')),
      h('section', { class: 'panel tutorial', 'aria-live': 'polite' },
        card, dots,
        h('div', { class: 'row between' }, prev, h('button', { class: 'btn soft', onclick: finish }, t('hs.tut.skip')), next))),
    disclaimer());
  return { title: t('hs.help'), node };
}

// ---------------------------------------------------------------- Settings
export function settings(ctx) {
  const s = getSettings();
  const toggle = (key, label) => h('label', { class: 'toggle' }, h('span', {}, label),
    h('input', { type: 'checkbox', checked: s[key] || null, onchange: (e) => setSettings({ [key]: e.target.checked }) }));
  const lang = h('select', {
    id: 'lang',
    onchange: async (e) => { await setLanguage(e.target.value); setSettings({ lang: e.target.value }); ctx.rerender(); },
  }, ...[['en', 'English'], ['zh', '简体中文'], ['ms', 'Bahasa Melayu'], ['ta', 'தமிழ்']]
    .map(([v, name]) => h('option', { value: v, selected: v === getLanguage() || null }, name)));
  const zone = h('select', { id: 'zone', onchange: (e) => setSettings({ exerciseZone: e.target.value }) },
    ...ctx.config.app.rooms.map((r) => h('option', { value: r, selected: r === s.exerciseZone || null }, t('hs.room.' + r))));
  const node = h('div', { class: 'stage' },
    hud(ctx, { back: '/map' }),
    h('main', { id: 'main', class: 'stack' },
      h('h1', { tabindex: '-1' }, t('hs.settings')),
      h('section', { class: 'panel' },
        h('label', { class: 'toggle', for: 'lang' }, h('span', {}, t('hs.language')), lang),
        h('label', { class: 'toggle', for: 'zone' }, h('span', {}, t('hs.exercise_zone')), zone),
        toggle('largeText', t('hs.large_text')),
        toggle('highContrast', t('hs.high_contrast'))),
      h('section', { class: 'panel stack' },
        h('h2', {}, t('hs.rp.samples_title')),
        h('p', { class: 'muted' }, t('hs.rp.samples_note')),
        h('button', { class: 'btn soft', onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            await loadSampleHome(ctx, (p) => { btn.textContent = `${t('hs.rp.loading_samples')} ${p.done}/${p.total}`; });
            ctx.go('/report');
          } catch (err) {
            toast(t('home_scanning.error_generic', { error: err.message }), 'err');
            btn.disabled = false;
            btn.textContent = '\uD83E\uDDEA ' + t('hs.rp.load_samples');
          }
        } }, '\uD83E\uDDEA ' + t('hs.rp.load_samples'))),
      h('section', { class: 'panel stack' },
        h('h2', {}, t('hs.privacy')),
        h('p', { class: 'muted' }, isPersistent() ? t('hs.local_note') : t('hs.memory_note')),
        h('button', { class: 'btn soft', style: 'color:var(--danger)', onclick: async () => {
          if (!window.confirm(t('hs.settings.clear_confirm'))) return;
          await clearAll();
          toast(t('hs.settings.cleared'));
          ctx.rerender();
        } }, t('hs.settings.clear')))),
    disclaimer());
  return { title: t('hs.settings'), node };
}

export function notFound(ctx) {
  const node = h('main', { class: 'stage center', id: 'main' },
    h('h1', { tabindex: '-1' }, '404'),
    h('button', { class: 'btn', onclick: () => ctx.go('/') }, t('hs.back')));
  return { title: '404', node };
}
