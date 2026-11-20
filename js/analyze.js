/**
 * analyze.js - the per-photo pipeline (Stages B-D) shared by the analysis screen, the batch
 * "analyse all photos" step of the report, and the sample-home loader.
 *
 *   photo -> lighting (Stage C) -> detection (Stage B, on device) + reference/manual boxes
 *         -> facts (scene.js) -> rules (rules.js) -> scored hazards -> IndexedDB
 */
import { getShot, getAnalysis, saveAnalysis, capturedIds, getSettings } from './state.js';
import { findShot, shotList } from './shots.js';
import { detect, loadDetector, MODEL_NAME } from './detector.js';
import { analyzeLighting, buildFacts, clutterIndex, annotationToDetection } from './scene.js';
import { evaluateRules } from './rules.js';
import { fitSize } from './camera.js';

/** Bump when detection/rule logic changes so older stored results are recomputed. */
export const ANALYSIS_VERSION = 3;

export async function blobToCanvas(blob, maxSide = 1600) {
  const bmp = await createImageBitmap(blob);
  const { w, h } = fitSize(bmp.width, bmp.height, maxSide);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if (bmp.close) bmp.close();
  return c;
}

function lightingOf(canvas, th) {
  const { w, h } = fitSize(canvas.width, canvas.height, 320);
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const g = small.getContext('2d', { willReadFrequently: true });
  g.drawImage(canvas, 0, 0, w, h);
  return analyzeLighting(g.getImageData(0, 0, w, h).data, w, h, th);
}

let cfgPromise = null;
/** Rules and COCO map are only needed for analysis, so they load lazily (cached). */
export function analysisConfig(ctx) {
  if (!cfgPromise) {
    cfgPromise = Promise.all([ctx.loadConfig('hazard_rules'), ctx.loadConfig('coco_map')])
      .then(([rules, coco]) => ({ rules, coco: coco.map }))
      .catch((e) => { cfgPromise = null; throw e; });
  }
  return cfgPromise;
}

/** Re-run rules over stored detections (after a verdict change). Mutates and returns analysis. */
export function rescore(ctx, analysis, cfg) {
  const shot = findShot(ctx.config.guides, analysis.room, analysis.shot_id) || { id: analysis.shot_id };
  const facts = buildFacts({
    room: analysis.room, shot, detections: analysis.detections, lighting: analysis.lighting,
    thresholds: ctx.config.thresholds.scene, exerciseZone: getSettings().exerciseZone,
  });
  analysis.hazards = evaluateRules(facts, cfg.rules, ctx.config.matrix);
  analysis.exercise_zone = getSettings().exerciseZone;
  analysis.scene = { clutter_index: clutterIndex(analysis.detections.filter((d) => d.verdict !== 'rejected')) };
  return analysis;
}

/** True when a shot has a photo but no current analysis. */
export function needsAnalysis(shotId) {
  const a = getAnalysis(shotId);
  // Stale when the pipeline changed or the user moved the Exercise Zone to another room.
  return Boolean(getShot(shotId)) && (!a || a.version !== ANALYSIS_VERSION || a.exercise_zone !== getSettings().exerciseZone);
}

/**
 * Analyse one stored shot and save the result.
 * @param {object} ctx app context
 * @param {string} room
 * @param {string} shotId
 * @param {{photo?:HTMLCanvasElement, onStatus?:(key)=>void}} [opts]
 */
export async function analyzeShot(ctx, room, shotId, { photo, onStatus = () => {} } = {}) {
  const rec = getShot(shotId);
  if (!rec) throw new Error(`No photo for ${shotId}`);
  const cfg = await analysisConfig(ctx);
  const canvas = photo || (await blobToCanvas(rec.blob));
  const previous = getAnalysis(shotId);

  const lighting = lightingOf(canvas, ctx.config.thresholds.scene);
  let detections = [];
  let model = null;
  let ms = null;
  try {
    onStatus('hs.an.loading_model');
    await loadDetector();
    onStatus('hs.an.scanning');
    const r = await detect(canvas, cfg.coco, ctx.config.thresholds.detector.default_conf * 0.85);
    detections = r.detections.map((d) => ({ ...d, source: 'cv' }));
    ms = r.ms;
    model = MODEL_NAME;
  } catch {
    model = null; // cv_unavailable: lighting, reference and manual boxes still count
  }

  // Keep the user's earlier verdicts when the same detection reappears (deterministic model).
  if (previous && previous.detections) {
    const old = new Map(previous.detections.filter((d) => d.source !== 'reference').map((d) => [`${d.id}|${d.cls}`, d]));
    for (const d of detections) {
      const o = old.get(`${d.id}|${d.cls}`);
      if (o) { d.verdict = o.verdict; d.relabel_class = o.relabel_class; }
    }
    for (const d of previous.detections) if (d.source === 'manual') detections.push(d);
  }
  (rec.reference || []).forEach((a, i) => detections.push(annotationToDetection(a, i)));

  const analysis = {
    version: ANALYSIS_VERSION,
    shot_id: shotId, room, model, inference_ms: ms, cv_unavailable: !model,
    lighting, detections, hazards: [], analysed_at: new Date().toISOString(),
  };
  rescore(ctx, analysis, cfg);
  await saveAnalysis(analysis);
  return analysis;
}

/** Every captured shot (all rooms) that still needs analysing, in room/shot order. */
export function pendingShots(ctx) {
  const list = [];
  for (const room of ctx.config.app.rooms) {
    const taken = capturedIds(room);
    for (const s of shotList(ctx.config.guides, room)) if (taken.has(s.id) && needsAnalysis(s.id)) list.push({ room, shotId: s.id });
  }
  return list;
}

/** Analyse all pending shots one after another, reporting progress. Returns count analysed. */
export async function analyzeAll(ctx, onProgress = () => {}) {
  const todo = pendingShots(ctx);
  let done = 0;
  for (const { room, shotId } of todo) {
    onProgress({ done, total: todo.length, room, shotId });
    try {
      await analyzeShot(ctx, room, shotId);
    } catch {
      // A single unreadable photo must not stop the whole report.
    }
    done++;
  }
  onProgress({ done, total: todo.length });
  return done;
}
