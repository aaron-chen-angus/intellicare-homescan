/**
 * report-screen.js - consolidated Home Safety Report across all rooms and photos.
 * Opening it analyses any photos not yet checked (batch), then renders KPIs, charts,
 * room profiles, priorities, the risk register, data-quality metrics and exports.
 */
import { h, guide, hud, disclaimer, toast, bandChip } from './components.js';
import { gauge, donut, stackedBars, levelDots, BAND_COLORS, SERIES } from './charts.js';
import { t, getLanguage } from '../i18n.js';
import { capturedIds, roomAnalyses, getShot, getSettings } from '../state.js';
import { analyzeAll, pendingShots } from '../analyze.js';
import { buildReport, registerCsv } from '../report.js';
import { loadSampleHome } from '../samples.js';
import { downloadBlob } from '../camera.js';
import { bandOf } from '../risk.js';

const BANDS = ['EXTREME', 'HIGH', 'MEDIUM', 'LOW'];

function thumb(shotId, alt) {
  const rec = getShot(shotId);
  if (!rec || !rec.blob) return h('span', { class: 'rp-thumb' });
  const url = URL.createObjectURL(rec.blob);
  return h('img', { class: 'rp-thumb', src: url, alt, loading: 'lazy', onload: () => URL.revokeObjectURL(url) });
}

function kpi(title, value, sub, extra) {
  return h('div', { class: 'panel kpi' }, h('span', { class: 'eyebrow' }, title), value, sub ? h('p', { class: 'muted' }, sub) : null, extra || null);
}

/** 5x5 (or WSH 3x3) heat map as an accessible grid with counts. */
function heatMap(report, matrix, wsh) {
  const wrap = h('div', { class: 'heat' + (wsh ? ' wsh' : ''), role: 'table', 'aria-label': wsh ? t('hs.rp.heat_wsh') : t('hs.rp.heat') });
  const n = wsh ? 3 : 5;
  const sLabels = wsh ? matrix.wsh.severity_labels : matrix.severity.map((s) => s.level);
  const lLabels = wsh ? matrix.wsh.likelihood_labels : matrix.likelihood.map((l) => l.level);
  wrap.append(h('div', { class: 'heat-corner', role: 'columnheader' }, 'S \\ L'));
  for (let l = 1; l <= n; l++) wrap.append(h('div', { class: 'heat-axis', role: 'columnheader' }, `${l}`, h('small', {}, lLabels[l - 1])));
  for (let s = n; s >= 1; s--) {
    wrap.append(h('div', { class: 'heat-axis', role: 'rowheader' }, `${s}`, h('small', {}, sLabels[s - 1])));
    for (let l = 1; l <= n; l++) {
      const count = wsh ? report.wsh[s][l] : report.cells[s][l];
      const score = s * l;
      const band = wsh ? matrix.wsh.bands.find((b) => score >= b.min && score <= b.max).id : bandOf(score, matrix).id;
      wrap.append(h('div', {
        class: `heat-cell ${band}${count ? ' has' : ''}`, role: 'cell',
        title: `${t('hs.band.' + band)} (${score}): ${count}`,
      }, h('span', { class: 'score' }, String(score)), count ? h('strong', {}, String(count)) : null));
    }
  }
  return wrap;
}

function roomCard(ctx, room, info) {
  const pct = info.coverage.total ? Math.round((info.coverage.done / info.coverage.total) * 100) : 0;
  return h('article', { class: 'panel stack room-profile' },
    h('div', { class: 'row between' },
      h('h3', {}, t('hs.room.' + room)),
      info.band ? bandChip(info.band) : h('span', { class: 'chip LOW' }, '\u2713 ' + t('hs.an.none_short'))),
    h('div', { class: 'row' },
      info.exercise_zone ? h('span', { class: 'chip info' }, t('hs.exercise_zone')) : null,
      ...BANDS.filter((b) => info.counts[b]).map((b) => h('span', { class: 'chip ' + b }, `${info.counts[b]} \u00D7 ${t('hs.band.' + b)}`))),
    h('div', {},
      h('span', { class: 'muted' }, t('hs.rp.coverage', { done: info.coverage.done, n: info.coverage.total, a: info.analysed })),
      h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span', { style: `width:${pct}%` }))),
    h('div', { class: 'row between' },
      h('span', { class: 'muted' }, t('hs.rp.dark')), h('strong', {}, info.dark_floor_pct === null ? '-' : `${info.dark_floor_pct}%`)),
    h('div', { class: 'row between' },
      h('span', { class: 'muted' }, t('hs.rp.cir')),
      h('span', { class: 'row', style: 'gap:.4rem' }, levelDots(info.cir, 9, t('hs.rp.cir') + ': ' + (info.cir ?? '-')), h('strong', {}, info.cir === null ? '-' : `${info.cir}/9`))),
    h('div', { class: 'row' }, ...roomAnalyses(room).map((a) => h('button', {
      class: 'thumb-btn', 'aria-label': t('hs.shot.view'), onclick: () => ctx.go(`/analyze/${room}/${a.shot_id}`),
    }, thumb(a.shot_id, '')))),
    h('button', { class: 'btn small soft', onclick: () => ctx.go('/room/' + room) }, t('hs.rp.open_room') + ' \u2192'));
}

function priorityCard(ctx, hz, i) {
  return h('article', { class: 'panel hazard ' + hz.band },
    h('div', { class: 'row between' },
      h('h3', {}, `${i + 1}. ${hz.label || hz.mechanism}`),
      bandChip(hz.band)),
    h('p', { class: 'muted' }, `${t('hs.room.' + hz.room)} \u00B7 S${hz.S} \u00D7 L${hz.L_final} = ${hz.rating}` + (hz.due_date ? ` \u00B7 ${t('hs.rp.due', { date: new Date(hz.due_date).toLocaleDateString(getLanguage()) })}` : '')),
    h('ol', { class: 'controls-list' }, ...hz.controls.slice(0, 2).map((c) => h('li', {}, h('span', { class: 'lvl' }, t('hs.ctl.' + c.lvl) + ' \u00B7 '), c.text))),
    h('button', { class: 'btn small soft', onclick: () => ctx.go(`/analyze/${hz.room}/${hz.shot_id}`) }, t('hs.shot.view')));
}

function registerTable(report) {
  const table = h('table', { class: 'register' },
    h('caption', { class: 'sr-only' }, t('hs.rp.register')),
    h('thead', {}, h('tr', {}, ...['#', 'hs.rp.col_photo', 'hs.rp.col_room', 'hs.rp.col_hazard', 'hs.rp.col_type', 'S', 'L', 'R', 'hs.rp.col_band', 'hs.rp.col_source', 'hs.rp.col_control']
      .map((k) => h('th', { scope: 'col' }, k.startsWith('hs.') ? t(k) : k)))),
    h('tbody', {}, ...report.hazards.map((hz, i) => h('tr', { class: hz.pending ? 'pending' : '' },
      h('td', {}, String(i + 1)),
      h('td', {}, thumb(hz.shot_id, '')),
      h('td', {}, t('hs.room.' + hz.room)),
      h('td', {}, hz.label || hz.mechanism, hz.pending ? h('div', { class: 'muted' }, t('hs.an.possible')) : null),
      h('td', {}, t('hs.type.' + hz.hazard_type)),
      h('td', {}, String(hz.S)),
      h('td', {}, String(hz.L_final)),
      h('td', {}, h('strong', {}, String(hz.rating))),
      h('td', {}, bandChip(hz.band)),
      h('td', {}, t('hs.src.' + (hz.ref ? 'reference' : hz.source))),
      h('td', {}, (hz.controls[0] || {}).text || '')))));
  return h('div', { class: 'table-wrap' }, table);
}

export function reportScreen(ctx) {
  const body = h('div', { class: 'stack' });
  const node = h('div', { class: 'stage report' },
    hud(ctx, { back: '/map' }),
    h('main', { id: 'main', class: 'stack' },
      h('div', { class: 'row between' },
        h('div', { class: 'stack', style: 'gap:.2rem' },
          h('span', { class: 'eyebrow' }, t('hs.rp.eyebrow')),
          h('h1', { tabindex: '-1' }, t('hs.rp.title'))),
        h('div', { class: 'row no-print' },
          h('button', { class: 'btn small soft', onclick: () => window.print() }, '\uD83D\uDDA8 ' + t('hs.rp.print')),
          h('button', { class: 'btn small soft', onclick: () => exportCsv() }, 'CSV'),
          h('button', { class: 'btn small soft', onclick: () => exportJson() }, 'JSON'))),
      body),
    disclaimer());

  let report = null;
  let showWsh = false;

  const compute = () => {
    const analyses = ctx.config.app.rooms.flatMap((r) => roomAnalyses(r));
    report = buildReport({
      rooms: ctx.config.app.rooms, guides: ctx.config.guides, matrix: ctx.config.matrix,
      captured: (r) => capturedIds(r), analyses, exerciseZone: getSettings().exerciseZone,
    });
    // Attach reference labels so the register can show the human description.
    for (const hz of report.hazards) {
      const a = analyses.find((x) => x.shot_id === hz.shot_id);
      const d = a && hz.det_id ? a.detections.find((x) => x.id === hz.det_id) : null;
      if (d && d.label) hz.label = `${d.label}: ${hz.mechanism}`;
      hz.ref = Boolean(d && d.source === 'reference');
    }
    return report;
  };

  function exportCsv() {
    if (!report) return;
    downloadBlob(new Blob(['\uFEFF' + registerCsv(report, (r) => t('hs.room.' + r))], { type: 'text/csv;charset=utf-8' }), 'home-scan-risk-register.csv');
    toast(t('home_scanning.image_saved'));
  }
  function exportJson() {
    if (!report) return;
    const slim = { ...report, hazards: report.hazards.map(({ controls, ...x }) => ({ ...x, controls })), byRoom: Object.fromEntries(Object.entries(report.byRoom).map(([k, v]) => [k, { ...v, hazards: v.hazards.length }])) };
    delete slim.active;
    downloadBlob(new Blob([JSON.stringify(slim, null, 2)], { type: 'application/json' }), 'home-scan-report.json');
    toast(t('home_scanning.image_saved'));
  }

  /** Attribution for sample photos (required by their CC BY / CC BY-SA licences). */
  function creditsPanel() {
    const credits = [];
    for (const room of ctx.config.app.rooms) {
      for (const a of roomAnalyses(room)) {
        const rec = getShot(a.shot_id);
        if (rec && rec.sample_credit) credits.push({ room, ...rec.sample_credit });
      }
    }
    if (!credits.length) return null;
    return h('section', { class: 'panel stack' },
      h('h2', {}, t('hs.rp.credits')),
      h('ul', { class: 'list muted' }, ...credits.map((c) => h('li', {},
        `${t('hs.room.' + c.room)}: ${c.author}, ${c.license}. `,
        h('a', { href: c.source, target: '_blank', rel: 'noopener' }, c.source)))));
  }

  function emptyState() {
    body.replaceChildren(
      guide('nurse', t('hs.rp.empty')),
      h('div', { class: 'row' },
        h('button', { class: 'btn big', onclick: () => ctx.go('/map') }, t('hs.cta.continue')),
        h('button', { class: 'btn soft', onclick: () => runSamples() }, '\uD83E\uDDEA ' + t('hs.rp.load_samples'))),
      h('p', { class: 'muted' }, t('hs.rp.samples_note')));
  }

  function progressState(text, done, total) {
    const pct = total ? Math.round((done / total) * 100) : 0;
    body.replaceChildren(h('section', { class: 'panel stack', role: 'status', 'aria-live': 'polite' },
      guide('nurse', text),
      h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct }, h('span', { style: `width:${pct}%` })),
      h('p', { class: 'muted' }, `${done} / ${total}`)));
  }

  async function runSamples() {
    try {
      await loadSampleHome(ctx, (p) => progressState(t('hs.rp.loading_samples'), p.done, p.total));
      await start();
    } catch (e) {
      toast(t('home_scanning.error_generic', { error: e.message }), 'err');
      emptyState();
    }
  }

  async function start() {
    const todo = pendingShots(ctx);
    if (todo.length) {
      await analyzeAll(ctx, (p) => progressState(t('hs.rp.analysing', { n: p.total }), p.done, p.total));
    }
    render();
  }

  function render() {
    compute();
    const r = report;
    if (!r.coverage.shotsDone) return emptyState();
    const totalActive = r.active.length;
    const prov = r.provisional.status;

    const kpis = h('div', { class: 'kpis' },
      kpi(t('hs.rp.score'), gauge(r.score, t('hs.rp.score') + ': ' + r.score, t('hs.rp.score_caption')), t('hs.rp.score_note')),
      kpi(t('hs.rp.hazards'), h('div', { class: 'big-num' }, String(totalActive)), null,
        h('div', { class: 'row' }, ...BANDS.map((b) => h('span', { class: 'chip ' + b }, `${r.byBand[b]} ${t('hs.band.' + b)}`)))),
      kpi(t('hs.rp.photos'), h('div', { class: 'big-num' }, `${r.coverage.shotsDone}/${r.coverage.shotsTotal}`), t('hs.rp.photos_sub', { a: r.coverage.analysed })),
      kpi(t('hs.rp.status'), h('div', {}, h('span', { class: 'chip ' + prov }, t('hs.clearance.' + prov))),
        t('hs.rp.status_note'),
        h('p', { class: 'muted' }, t('hs.rp.hearts', { n: r.hearts }), ' ', h('span', { 'aria-hidden': 'true' }, '\u2764'.repeat(r.hearts) + '\u2661'.repeat(Math.max(0, 5 - r.hearts))))));

    const worst = r.active[0];
    const summary = totalActive
      ? t('hs.rp.summary', { n: totalActive, high: r.byBand.EXTREME + r.byBand.HIGH, room: t('hs.room.' + worst.room) })
      : t('hs.rp.summary_none');

    const typeData = Object.entries(r.byType).sort((a, b) => b[1] - a[1]).map(([k, v], i) => ({ label: t('hs.type.' + k), value: v, color: SERIES[i % SERIES.length] }));
    const heatSlot = h('div');
    const drawHeat = () => heatSlot.replaceChildren(heatMap(r, ctx.config.matrix, showWsh));
    drawHeat();
    const toggle = h('button', { class: 'btn small soft no-print', 'aria-pressed': String(showWsh), onclick: () => { showWsh = !showWsh; toggle.setAttribute('aria-pressed', String(showWsh)); toggle.textContent = showWsh ? t('hs.rp.view_5x5') : t('hs.rp.view_wsh'); drawHeat(); } }, t('hs.rp.view_wsh'));

    const rooms = ctx.config.app.rooms;
    const barRows = rooms.map((room) => ({ label: t('hs.room.' + room), parts: BANDS.map((b) => ({ value: r.byRoom[room].counts[b], color: BAND_COLORS[b] })) }));

    const priorities = r.active.filter((x) => x.band === 'EXTREME' || x.band === 'HIGH' || x.band === 'MEDIUM').slice(0, 5);
    const m = r.model;

    body.replaceChildren(...[
      guide('nurse', summary),
      kpis,
      r.referral ? h('section', { class: 'panel hazard EXTREME' }, h('h3', {}, '\u26A0 ' + t('hs.rp.referral_title')), h('p', {}, ctx.config.app.referral_text)) : null,
      h('div', { class: 'split' },
        h('section', { class: 'panel stack' },
          h('div', { class: 'row between' }, h('h2', {}, t('hs.rp.heat')), toggle),
          h('p', { class: 'muted' }, t('hs.rp.heat_note')),
          heatSlot,
          h('div', { class: 'row' }, ...BANDS.map((b) => bandChip(b)))),
        h('section', { class: 'panel stack' },
          h('h2', {}, t('hs.rp.types')),
          typeData.length
            ? h('div', { class: 'donut-wrap' },
              donut(typeData, typeData.map((d) => `${d.label}: ${d.value}`).join(', '), String(totalActive)),
              h('ul', { class: 'legend' }, ...typeData.map((d) => h('li', {}, h('i', { style: `background:${d.color}` }), `${d.label} (${d.value})`))))
            : h('p', { class: 'muted' }, t('hs.an.summary_none')))),
      h('section', { class: 'panel stack' },
        h('h2', {}, t('hs.rp.by_room')),
        stackedBars(barRows, barRows.map((x) => `${x.label}: ${x.parts.reduce((a, p) => a + p.value, 0)}`).join(', '))),
      h('div', { class: 'room-grid' }, ...rooms.map((room) => roomCard(ctx, room, r.byRoom[room]))),
      h('section', { class: 'stack' },
        h('h2', {}, t('hs.rp.priorities')),
        priorities.length ? h('div', { class: 'room-grid' }, ...priorities.map((hz, i) => priorityCard(ctx, hz, i))) : h('p', { class: 'muted' }, t('hs.rp.summary_none'))),
      h('section', { class: 'panel stack' },
        h('h2', {}, t('hs.rp.register')),
        h('p', { class: 'muted' }, t('hs.rp.register_note')),
        r.hazards.length ? registerTable(r) : h('p', { class: 'muted' }, t('hs.rp.summary_none'))),
      h('div', { class: 'split' },
        h('section', { class: 'panel stack' },
          h('h2', {}, t('hs.rp.quality')),
          h('dl', { class: 'facts' },
            h('dt', {}, t('hs.rp.q_model')), h('dd', {}, m.names.join(', ') || t('hs.rp.q_none')),
            h('dt', {}, t('hs.rp.q_dets')), h('dd', {}, String(m.detections)),
            h('dt', {}, t('hs.rp.q_conf')), h('dd', {}, m.mean_conf === null ? '-' : `${m.mean_conf}%`),
            h('dt', {}, t('hs.rp.q_verified')), h('dd', {}, `${m.confirmed} / ${m.rejected}`),
            h('dt', {}, t('hs.rp.q_precision')), h('dd', {}, m.precision_proxy === null ? t('hs.rp.q_need_verify') : `${m.precision_proxy}%`),
            h('dt', {}, t('hs.rp.q_speed')), h('dd', {}, m.mean_ms === null ? '-' : `${m.mean_ms} ms`),
            h('dt', {}, t('hs.rp.q_sources')), h('dd', {}, Object.entries(r.sources).filter(([, v]) => v).map(([k, v]) => `${t('hs.src.' + k)} ${v}`).join(' \u00B7 ') || '-'))),
        r.reference.n ? h('section', { class: 'panel stack' },
          h('h2', {}, t('hs.rp.validation')),
          h('p', { class: 'muted' }, t('hs.rp.validation_note')),
          h('div', { class: 'row' },
            h('span', { class: 'chip info' }, t('hs.rp.v_flagged', { k: r.reference.flagged, n: r.reference.n })),
            h('span', { class: 'chip info' }, t('hs.rp.v_agree', { k: r.reference.agree, n: r.reference.n }))),
          h('div', { class: 'table-wrap' }, h('table', { class: 'register' },
            h('thead', {}, h('tr', {}, ...['hs.rp.col_room', 'hs.rp.col_hazard', 'hs.rp.v_ref', 'hs.rp.v_app'].map((k) => h('th', { scope: 'col' }, t(k))))),
            h('tbody', {}, ...r.reference.rows.map((row) => h('tr', {},
              h('td', {}, t('hs.room.' + row.room)), h('td', {}, row.label),
              h('td', {}, t('hs.rp.ref_' + row.reference)),
              h('td', {}, row.band ? bandChip(row.band) : t('hs.rp.v_missed'), row.agrees ? ' \u2713' : ''))))))) : null),
      h('section', { class: 'panel stack' },
        h('h2', {}, t('hs.rp.method')),
        h('p', { class: 'muted' }, t('hs.rp.method_text'))),
      creditsPanel(),
    ].filter(Boolean)); // replaceChildren would print a literal null as text
  }

  setTimeout(() => start().catch((e) => {
    body.replaceChildren(h('p', {}, t('home_scanning.error_generic', { error: e.message })));
  }), 0);
  return { title: t('hs.rp.title'), node };
}
