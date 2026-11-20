/**
 * report.js - pure aggregation of per-photo analyses into the Home Safety Report.
 * No DOM. Inputs are plain objects so the whole report can be unit tested.
 */
import { bandOf, homeScore, hearts, clearance, toWsh, isActive } from './risk.js';
import { roomProgress } from './shots.js';
import { cirEstimate } from './scene.js';

const BAND_ORDER = ['EXTREME', 'HIGH', 'MEDIUM', 'LOW'];
const REF_TO_BAND = { high: ['HIGH', 'EXTREME'], medium: ['MEDIUM'], low: ['LOW'] };

/**
 * Merge hazards from all analyses. Detection-anchored hazards are unique per photo
 * (uid = shot:hazard). Room-level hazards (lighting, clutter, checklist) are counted once per
 * room, keeping the highest rating, so two dark photos of one room are not double-counted.
 */
export function mergeHazards(analyses) {
  const out = new Map();
  for (const a of analyses) {
    for (const hz of a.hazards || []) {
      const uid = hz.det_id ? `${a.shot_id}:${hz.hazard_id}` : `${a.room}:${hz.hazard_id}`;
      const prev = out.get(uid);
      if (!prev || hz.rating > prev.rating) out.set(uid, { ...hz, uid, shot_id: a.shot_id, room: a.room });
    }
  }
  return [...out.values()].sort((x, y) => y.rating - x.rating || BAND_ORDER.indexOf(x.band) - BAND_ORDER.indexOf(y.band));
}

/** Counts in each cell of the 5x5 matrix: cells[S][L]. */
export function matrixCells(hazards) {
  const cells = Array.from({ length: 6 }, () => Array(6).fill(0));
  for (const h of hazards) cells[h.S][h.L_final]++;
  return cells;
}

/** Counts in each cell of the WSH 3x3 view: cells[s][l]. */
export function wshCells(hazards, matrix) {
  const cells = Array.from({ length: 4 }, () => Array(4).fill(0));
  for (const h of hazards) {
    const w = toWsh(h.S, h.L_final, matrix);
    cells[w.s][w.l]++;
  }
  return cells;
}

/** Agreement between reference labels (sample photos) and the app's rule-based bands. */
export function referenceAgreement(analyses) {
  const rows = [];
  for (const a of analyses) {
    for (const d of a.detections || []) {
      if (d.source !== 'reference') continue;
      const linked = (a.hazards || []).filter((h) => h.det_id === d.id && !h.pending);
      const best = linked.sort((x, y) => y.rating - x.rating)[0] || null;
      rows.push({
        room: a.room, label: d.label, cls: d.cls, reference: d.reference_risk,
        detected: Boolean(best), band: best ? best.band : null, rule_id: best ? best.rule_id : null,
        agrees: Boolean(best) && (REF_TO_BAND[d.reference_risk] || []).includes(best.band),
      });
    }
  }
  const n = rows.length;
  return {
    rows,
    n,
    flagged: rows.filter((r) => r.detected).length,
    agree: rows.filter((r) => r.agrees).length,
  };
}

/**
 * Build the full report model.
 * @param {{rooms:string[], guides:object, matrix:object, captured:(room)=>Set<string>,
 *          analyses:object[], exerciseZone:string}} p
 */
export function buildReport({ rooms, guides, matrix, captured, analyses, exerciseZone }) {
  const hazards = mergeHazards(analyses);
  const active = hazards.filter(isActive);
  const byBand = { EXTREME: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const h of active) byBand[bandOf(h.rating, matrix).id]++;

  const byType = {};
  for (const h of active) byType[h.hazard_type] = (byType[h.hazard_type] || 0) + 1;

  const byRoom = {};
  let shotsDone = 0;
  let shotsTotal = 0;
  let analysedCount = 0;
  const clearanceRooms = {};
  for (const r of rooms) {
    const prog = roomProgress(guides, r, captured(r));
    const ra = analyses.filter((a) => a.room === r);
    const rh = active.filter((h) => h.room === r);
    const counts = { EXTREME: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const h of rh) counts[h.band]++;
    const max = rh.reduce((m, h) => Math.max(m, h.rating), 0);
    const dark = ra.length ? Math.round(ra.reduce((s, a) => s + (a.lighting ? a.lighting.dark_floor_pct : 0), 0) / ra.length) : null;
    const clutter = ra.length ? Math.max(...ra.map((a) => (a.scene && typeof a.scene.clutter_index === 'number' ? a.scene.clutter_index : 0))) : null;
    byRoom[r] = {
      coverage: prog, analysed: ra.length, counts, max, band: max ? bandOf(max, matrix).id : null,
      dark_floor_pct: dark, clutter_index: clutter, cir: clutter === null ? null : cirEstimate(clutter),
      exercise_zone: r === exerciseZone, hazards: rh,
    };
    shotsDone += prog.done;
    shotsTotal += prog.total;
    analysedCount += ra.length;
    clearanceRooms[r] = { shotsDone: prog.done, shotsRequired: prog.total, checklistComplete: false, hazards: rh };
  }

  // Official status needs every photo and checklist; checklists are not built yet, so the
  // hazard-only "provisional" status is shown alongside and clearly labelled.
  const official = clearance({ rooms: clearanceRooms }, matrix);
  const provisionalRooms = {};
  for (const r of rooms) provisionalRooms[r] = { ...clearanceRooms[r], shotsDone: clearanceRooms[r].shotsRequired, checklistComplete: true };
  const provisional = clearance({ rooms: provisionalRooms }, matrix);

  const dets = analyses.flatMap((a) => (a.detections || []).filter((d) => d.source !== 'reference'));
  const confirmed = dets.filter((d) => d.verdict === 'confirmed').length;
  const rejected = dets.filter((d) => d.verdict === 'rejected').length;
  const sources = { cv: 0, reference: 0, context: 0, checklist: 0, manual: 0 };
  for (const h of active) {
    const det = h.det_id ? (analyses.find((a) => a.shot_id === h.shot_id) || { detections: [] }).detections.find((d) => d.id === h.det_id) : null;
    const key = det && det.source === 'reference' ? 'reference' : h.source;
    sources[key] = (sources[key] || 0) + 1;
  }

  return {
    generated_at: new Date().toISOString(),
    hazards,
    active,
    byBand,
    byType,
    byRoom,
    cells: matrixCells(active),
    wsh: wshCells(active, matrix),
    score: homeScore(active, matrix),
    hearts: hearts(active, matrix),
    coverage: { shotsDone, shotsTotal, analysed: analysedCount },
    official,
    provisional,
    model: {
      names: [...new Set(analyses.map((a) => a.model).filter(Boolean))],
      detections: dets.length,
      mean_conf: dets.length ? Math.round((dets.reduce((s, d) => s + d.conf, 0) / dets.length) * 100) : null,
      confirmed,
      rejected,
      precision_proxy: confirmed + rejected ? Math.round((confirmed / (confirmed + rejected)) * 100) : null,
      cv_unavailable: analyses.filter((a) => a.cv_unavailable).length,
      mean_ms: analyses.filter((a) => a.inference_ms).length
        ? Math.round(analyses.reduce((s, a) => s + (a.inference_ms || 0), 0) / analyses.filter((a) => a.inference_ms).length)
        : null,
    },
    sources,
    reference: referenceAgreement(analyses),
    referral: byBand.EXTREME > 0,
  };
}

/** CSV of the risk register (RFC 4180 quoting). */
export function registerCsv(report, roomName = (r) => r) {
  const head = ['uid', 'room', 'shot_id', 'rule_id', 'hazard_type', 'mechanism', 'S', 'L_base', 'L_final', 'rating', 'band', 'zone', 'source', 'due_date', 'top_control', 'status'];
  const q = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = report.hazards.map((h) => [h.uid, roomName(h.room), h.shot_id, h.rule_id, h.hazard_type, h.mechanism, h.S, h.L_base, h.L_final,
    h.rating, h.band, h.zone || '', h.source, h.due_date || '', (h.controls[0] || {}).text || '', h.pending ? 'possible' : h.status]);
  return [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n');
}
