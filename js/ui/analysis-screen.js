/**
 * analysis-screen.js - runs Stages B-E for one saved shot:
 * detection -> lighting -> facts -> rules -> scored hazards -> user verification.
 * The result is saved per shot, so reopening shows it instantly.
 */
import { h, guide, hud, disclaimer, toast, bandChip, announce } from './components.js';
import { t } from '../i18n.js';
import { getShot, getAnalysis, saveAnalysis, capturedIds } from '../state.js';
import { findShot, shotList } from '../shots.js';
import { detect, loadDetector, MODEL_NAME } from '../detector.js';
import { analyzeLighting, buildFacts } from '../scene.js';
import { evaluateRules } from '../rules.js';
import { canvasToBlob, downloadBlob, fitSize } from '../camera.js';

const BAND_STROKE = { LOW: '#2fbf71', MEDIUM: '#f0b400', HIGH: '#f58a3a', EXTREME: '#e5484d' };
const BAND_ORDER = ['EXTREME', 'HIGH', 'MEDIUM', 'LOW'];

async function blobToCanvas(blob, maxSide = 1600) {
  const bmp = await createImageBitmap(blob);
  const { w, h: hh } = fitSize(bmp.width, bmp.height, maxSide);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hh;
  c.getContext('2d').drawImage(bmp, 0, 0, w, hh);
  if (bmp.close) bmp.close();
  return c;
}

function lightingOf(canvas, th) {
  const small = document.createElement('canvas');
  const { w, h: hh } = fitSize(canvas.width, canvas.height, 320);
  small.width = w;
  small.height = hh;
  const c2 = small.getContext('2d', { willReadFrequently: true });
  c2.drawImage(canvas, 0, 0, w, hh);
  return analyzeLighting(c2.getImageData(0, 0, w, hh).data, w, hh, th);
}

/** Draw the photo with labelled boxes, coloured by the worst hazard each detection triggers. */
function drawAnnotated(target, photo, analysis) {
  target.width = photo.width;
  target.height = photo.height;
  const g = target.getContext('2d');
  g.drawImage(photo, 0, 0);
  const worst = {};
  for (const hz of analysis.hazards) {
    if (!hz.det_id) continue;
    const cur = worst[hz.det_id];
    if (!cur || BAND_ORDER.indexOf(hz.band) < BAND_ORDER.indexOf(cur)) worst[hz.det_id] = hz.band;
  }
  const lw = Math.max(3, Math.round(photo.width / 300));
  g.font = `700 ${Math.max(14, Math.round(photo.width / 55))}px Poppins, Nunito, sans-serif`;
  for (const d of analysis.detections) {
    if (d.verdict === 'rejected') continue;
    const [x, y, w, hh] = [d.bbox[0] * photo.width, d.bbox[1] * photo.height, d.bbox[2] * photo.width, d.bbox[3] * photo.height];
    const color = worst[d.id] ? BAND_STROKE[worst[d.id]] : 'rgba(77,155,255,.9)';
    g.lineWidth = lw;
    g.strokeStyle = color;
    g.setLineDash(worst[d.id] ? [] : [lw * 3, lw * 2]);
    g.strokeRect(x, y, w, hh);
    const label = `${worst[d.id] ? '! ' : ''}${d.cls} ${Math.round(d.conf * 100)}%`;
    const tw = g.measureText(label).width + lw * 4;
    const th = parseInt(g.font.match(/(\d+)px/)[1], 10) + lw * 2;
    g.setLineDash([]);
    g.fillStyle = color;
    g.fillRect(x, Math.max(0, y - th), tw, th);
    g.fillStyle = '#fff';
    g.fillText(label, x + lw * 2, Math.max(th - lw * 1.5, y - lw * 1.5));
  }
}

export function analysisScreen(ctx, roomId, shotId) {
  const shot = findShot(ctx.config.guides, roomId, shotId);
  const rec = getShot(shotId);
  if (!shot || !rec) return null;

  const canvas = h('canvas', { role: 'img', 'aria-label': t('hs.an.photo_alt', { shot: t(shot.label) }) });
  const scanLine = h('div', { class: 'scan-line', 'aria-hidden': 'true' });
  const scan = h('div', { class: 'scan-wrap' }, canvas, scanLine);
  const statusLine = h('p', { class: 'prompt', role: 'status', 'aria-live': 'polite' }, t('hs.an.scanning'));
  const guideSlot = h('div');
  const results = h('div', { class: 'stack' });
  const actions = h('div', { class: 'row' });
  let photo = null;
  let analysis = getAnalysis(shotId);
  let cfg = null;

  const node = h('div', { class: 'stage' },
    hud(ctx, { back: '/room/' + roomId }),
    h('main', { id: 'main', class: 'stack' },
      h('div', { class: 'stack', style: 'gap:.2rem' },
        h('span', { class: 'eyebrow' }, t('hs.an.title') + ' \u00B7 ' + t('hs.room.' + roomId)),
        h('h1', { tabindex: '-1' }, t(shot.label))),
      guideSlot,
      h('div', { class: 'split' },
        h('div', { class: 'stack' }, scan, statusLine, actions),
        results)),
    disclaimer());

  async function configs() {
    if (!cfg) {
      const [rules, coco] = await Promise.all([ctx.loadConfig('hazard_rules'), ctx.loadConfig('coco_map')]);
      cfg = { rules, coco: coco.map };
    }
    return cfg;
  }

  /** Re-run rules after a verdict change, keeping detections and lighting. */
  function rescore() {
    const facts = buildFacts({ room: roomId, shot, detections: analysis.detections, lighting: analysis.lighting, thresholds: ctx.config.thresholds.scene });
    analysis.hazards = evaluateRules(facts, cfg.rules, ctx.config.matrix);
  }

  async function run() {
    photo = await blobToCanvas(rec.blob);
    canvas.width = photo.width;
    canvas.height = photo.height;
    canvas.getContext('2d').drawImage(photo, 0, 0);
    await configs();
    if (analysis) return render();

    const lighting = lightingOf(photo, ctx.config.thresholds.scene);
    let detections = [];
    let model = null;
    let ms = null;
    try {
      statusLine.textContent = t('hs.an.loading_model');
      await loadDetector();
      statusLine.textContent = t('hs.an.scanning');
      const r = await detect(photo, cfg.coco, ctx.config.thresholds.detector.default_conf * 0.85);
      detections = r.detections;
      ms = r.ms;
      model = MODEL_NAME;
    } catch {
      model = null; // cv_unavailable: lighting rules still run, checklist covers the rest later
    }
    analysis = { shot_id: shotId, room: roomId, model, inference_ms: ms, cv_unavailable: !model, lighting, detections, hazards: [], analysed_at: new Date().toISOString() };
    rescore();
    await saveAnalysis(analysis);
    render();
  }

  function verdict(detId, v) {
    const d = analysis.detections.find((x) => x.id === detId);
    if (!d) return;
    d.verdict = d.verdict === v ? null : v;
    rescore();
    saveAnalysis(analysis);
    announce(v === 'rejected' ? t('hs.an.rejected') : t('hs.an.confirmed'));
    render();
  }

  function hazardCard(hz) {
    const det = hz.det_id ? analysis.detections.find((d) => d.id === hz.det_id) : null;
    return h('article', { class: 'panel hazard ' + hz.band },
      h('div', { class: 'row between' },
        h('h3', {}, hz.mechanism),
        bandChip(hz.band)),
      h('div', { class: 'row' },
        h('span', { class: 'chip info' }, `S${hz.S} \u00D7 L${hz.L_final} = ${hz.rating}`),
        hz.pending ? h('span', { class: 'chip MEDIUM' }, '? ' + t('hs.an.possible')) : null,
        det ? h('span', { class: 'muted' }, `${det.cls} \u00B7 ${t('hs.an.confidence', { pct: Math.round(det.conf * 100) })}`) : null,
        hz.zone ? h('span', { class: 'chip info' }, t('hs.zone.' + hz.zone)) : null),
      h('p', {}, h('strong', {}, t('hs.an.why') + ': '), hz.evidence),
      h('details', {},
        h('summary', { style: 'cursor:pointer;font-weight:700;color:var(--primary-dark);min-height:44px;display:flex;align-items:center' }, t('hs.an.fix')),
        h('ol', { class: 'controls-list' }, ...hz.controls.map((c) => h('li', {}, h('span', { class: 'lvl' }, t('hs.ctl.' + c.lvl) + ' \u00B7 '), c.text)))),
      det ? h('div', { class: 'row' },
        h('button', { class: 'btn small' + (det.verdict === 'confirmed' ? ' mint' : ' soft'), 'aria-pressed': String(det.verdict === 'confirmed'), onclick: () => verdict(det.id, 'confirmed') }, '\u2713 ' + t('hs.an.confirm')),
        h('button', { class: 'btn small soft', 'aria-pressed': String(det.verdict === 'rejected'), onclick: () => verdict(det.id, 'rejected') }, '\u2715 ' + t('hs.an.reject'))) : null);
  }

  function nextTarget() {
    const taken = capturedIds(roomId);
    const list = shotList(ctx.config.guides, roomId);
    const unchecked = list.find((s) => s.id !== shotId && taken.has(s.id) && !getAnalysis(s.id));
    if (unchecked) return { path: `/analyze/${roomId}/${unchecked.id}`, label: t('hs.an.check_next') };
    const missing = list.find((s) => s.required && !taken.has(s.id));
    if (missing) return { path: `/room/${roomId}`, label: t('hs.an.next_shot') + ': ' + t(missing.label) };
    return null;
  }

  function render() {
    scanLine.remove();
    drawAnnotated(canvas, photo, analysis);
    const sorted = [...analysis.hazards].sort((a, b) => b.rating - a.rating);
    const active = sorted.filter((x) => !x.pending);
    statusLine.textContent = analysis.cv_unavailable ? t('hs.an.cv_unavailable')
      : t('hs.an.done', { n: analysis.detections.length, ms: analysis.inference_ms ?? '-' });

    guideSlot.replaceChildren(guide('nurse', active.length ? t('hs.say.nurse_found', { n: active.length }) : t('hs.say.nurse_clear')));

    const objects = analysis.detections.filter((d) => d.verdict !== 'rejected');
    results.replaceChildren(
      h('section', { class: 'panel stack' },
        h('h2', {}, active.length ? t('hs.an.found', { n: active.length }) : t('hs.an.none')),
        h('div', { class: 'row' },
          h('span', { class: 'chip ' + (analysis.lighting.dark_floor_pct >= 25 ? 'MEDIUM' : 'LOW') }, '\u263C ' + t('hs.an.dark_pct', { pct: analysis.lighting.dark_floor_pct })),
          analysis.lighting.glare ? h('span', { class: 'chip MEDIUM' }, '\u2727 ' + t('hs.an.glare')) : null),
        objects.length ? h('div', { class: 'row' }, h('span', { class: 'muted' }, t('hs.an.objects') + ':'), ...objects.map((d) => h('span', { class: 'chip info' }, d.cls))) : null,
        h('p', { class: 'muted' }, t('hs.an.estimate') + ' ' + (analysis.model ? t('hs.an.model', { name: analysis.model }) : ''))),
      ...sorted.map(hazardCard));

    const next = nextTarget();
    actions.replaceChildren(
      next ? h('button', { class: 'btn', onclick: () => ctx.go(next.path) }, next.label + ' \u2192') : h('button', { class: 'btn mint', onclick: () => ctx.go('/room/' + roomId) }, '\u2713 ' + t('hs.an.back_room')),
      h('button', { class: 'btn soft', onclick: () => ctx.go(`/camera/${roomId}/${shotId}`) }, '\uD83D\uDCF7 ' + t('home_scanning.retake')),
      h('button', { class: 'btn soft', onclick: async () => {
        try { downloadBlob(await canvasToBlob(canvas), `${shotId}-annotated.jpg`); toast(t('home_scanning.image_saved')); } catch (e) { toast(t('home_scanning.download_error', { error: e.message }), 'err'); }
      } }, '\u2B07 ' + t('home_scanning.download')),
      next ? h('button', { class: 'btn soft', onclick: () => ctx.go('/room/' + roomId) }, t('hs.an.back_room')) : null);
    announce(active.length ? t('hs.an.found', { n: active.length }) : t('hs.an.none'));
  }

  setTimeout(() => run().catch((e) => {
    statusLine.textContent = t('home_scanning.error_generic', { error: e.message });
    scanLine.remove();
  }), 0);
  return { title: t('hs.an.title'), node };
}
