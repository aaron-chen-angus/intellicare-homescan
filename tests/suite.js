/**
 * suite.js - unit tests for the risk matrix, rules engine and clearance logic.
 * `loadJson(path)` is injected: fetch() in the browser, fs in Node.
 */
import * as risk from '../js/risk.js';
import { evaluateRules, CONTROL_ORDER, evalCondition } from '../js/rules.js';
import { fixturesFor, emptyFacts } from './fixtures.js';
import * as quality from '../js/quality.js';
import * as tilt from '../js/tilt.js';
import * as shots from '../js/shots.js';
import * as scene from '../js/scene.js';
import * as report from '../js/report.js';

export async function runSuite(h, loadJson) {
  const matrix = await loadJson('config/risk_matrix.json');
  const ruleFile = await loadJson('config/hazard_rules.json');
  const vocab = await loadJson('config/vocabulary.json');
  const checklists = await loadJson('config/checklists.json');
  const appCfg = await loadJson('config/app.json');
  const shotGuides = await loadJson('config/shot_guides.json');
  const thresholds = await loadJson('config/thresholds.json');
  const cocoMap = await loadJson('config/coco_map.json');
  const samples = await loadJson('config/samples.json');

  // ---------- Risk matrix (all 25 cells) ----------
  // Independent oracle copied from the master prompt table, rows S5..S1, columns L1..L5.
  const expectedBands = {
    5: ['MEDIUM', 'HIGH', 'HIGH', 'EXTREME', 'EXTREME'],
    4: ['LOW', 'MEDIUM', 'HIGH', 'HIGH', 'EXTREME'],
    3: ['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH'],
    2: ['LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'HIGH'],
    1: ['LOW', 'LOW', 'LOW', 'LOW', 'MEDIUM'],
  };
  await h.test('matrix: all 25 cells give the documented rating and band', () => {
    for (let S = 1; S <= 5; S++) {
      for (let L = 1; L <= 5; L++) {
        const r = risk.evaluate(S, L, matrix);
        h.eq(r.rating, S * L, `S${S}L${L} rating`);
        h.eq(r.band, expectedBands[S][L - 1], `S${S}L${L} band`);
      }
    }
  });
  await h.test('matrix: rate() rejects out-of-range input', () => {
    h.throws(() => risk.rate(0, 3));
    h.throws(() => risk.rate(3, 6));
    h.throws(() => risk.rate(2.5, 3));
  });

  // ---------- Likelihood modifiers ----------
  await h.test('modifiers: prior fall adds 1', () => {
    h.eq(risk.finalLikelihood(3, { profile: { falls_12m: 1 } }, matrix).L, 4);
    h.eq(risk.finalLikelihood(3, { profile: { falls_12m: 2 } }, matrix).L, 4);
    h.eq(risk.finalLikelihood(3, { profile: { falls_12m: 0 } }, matrix).L, 3);
  });
  await h.test('modifiers: aid and vision impairment combine to +1 only', () => {
    h.eq(risk.finalLikelihood(2, { profile: { walking_aid: true, vision_impaired: true } }, matrix).L, 3);
    h.eq(risk.finalLikelihood(2, { profile: { vision_impaired: true } }, matrix).L, 3);
  });
  await h.test('modifiers: critical path +1, verified control -1', () => {
    h.eq(risk.finalLikelihood(3, { criticalPath: true }, matrix).L, 4);
    h.eq(risk.finalLikelihood(3, { verifiedControl: true }, matrix).L, 2);
  });
  await h.test('modifiers: capped at 5 and floored at 1', () => {
    const p = { falls_12m: 3, walking_aid: true };
    h.eq(risk.finalLikelihood(5, { profile: p, criticalPath: true }, matrix).L, 5);
    h.eq(risk.finalLikelihood(1, { verifiedControl: true }, matrix).L, 1);
  });
  await h.test('modifiers: trace lists every applied modifier', () => {
    const r = risk.finalLikelihood(2, { profile: { falls_12m: 1, walking_aid: true }, criticalPath: true }, matrix);
    h.eq(r.modifiers.map((m) => m.id), ['prior_fall', 'aid_or_vision', 'critical_path']);
  });

  // ---------- WSH 3x3 ----------
  await h.test('wsh: mapping of S and L onto 3x3', () => {
    const sMap = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 3 };
    const lMap = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 3 };
    for (let S = 1; S <= 5; S++) {
      for (let L = 1; L <= 5; L++) {
        const w = risk.toWsh(S, L, matrix);
        h.eq([w.s, w.l], [sMap[S], lMap[L]], `S${S}L${L}`);
        const expectBand = w.score <= 2 ? 'LOW' : w.score <= 4 ? 'MEDIUM' : 'HIGH';
        h.eq(w.band, expectBand, `S${S}L${L} wsh band`);
      }
    }
    h.eq(risk.toWsh(3, 4, matrix).band, 'HIGH');
    h.eq(risk.toWsh(1, 1, matrix).band, 'LOW');
  });

  // ---------- Residual risk ----------
  await h.test('residual: control reduces L and clamps at 1', () => {
    const hz = { S: 3, L_final: 4 };
    h.eq(risk.residual(hz, { dL: 0, delta_L: -3 }, matrix).rating, 3);
    h.eq(risk.residual(hz, { delta_L: -9 }, matrix).L, 1);
  });

  // ---------- Aggregation ----------
  const mk = (rating, extra = {}) => ({ rating, status: 'open', ...extra });
  await h.test('score: 100 with no hazards, weighted penalty otherwise', () => {
    h.eq(risk.homeScore([], matrix), 100);
    h.eq(risk.homeScore([mk(12), mk(6), mk(3)], matrix), 100 - 10 - 4 - 1);
  });
  await h.test('score: floored at 0 and capped when an Extreme hazard exists', () => {
    h.eq(risk.homeScore(Array.from({ length: 20 }, () => mk(12)), matrix), 0);
    h.ok(risk.homeScore([mk(20)], matrix) <= 40, 'Extreme must not look healthy');
  });
  await h.test('score: pending and fixed hazards are ignored', () => {
    h.eq(risk.homeScore([mk(20, { pending: true }), mk(20, { status: 'verified' })], matrix), 100);
  });
  await h.test('room risk: worst case plus counts', () => {
    const r = risk.roomRisk([mk(3), mk(12), mk(6), mk(12)], matrix);
    h.eq(r.max, 12);
    h.eq(r.band, 'HIGH');
    h.eq(r.counts, { LOW: 1, MEDIUM: 1, HIGH: 2, EXTREME: 0 });
  });
  await h.test('hearts: -2 per Extreme, -1 per High, floor 0', () => {
    h.eq(risk.hearts([mk(20), mk(12)], matrix), 2);
    h.eq(risk.hearts([mk(25), mk(25), mk(25)], matrix), 0);
  });

  // ---------- Clearance ----------
  const room = (hazards = [], over = {}) => ({ shotsDone: 3, shotsRequired: 3, checklistComplete: true, hazards, ...over });
  const home = (over = {}) => ({
    rooms: { bedroom: room(), kitchen: room(), dining: room(), living: room(), ...over },
  });
  await h.test('clearance: clean home is CLEARED', () => {
    h.eq(risk.clearance(home(), matrix).status, 'CLEARED');
  });
  await h.test('clearance: Medium only gives CLEARED_WITH_ADVISORY', () => {
    h.eq(risk.clearance(home({ kitchen: room([mk(6)]) }), matrix).status, 'CLEARED_WITH_ADVISORY');
  });
  await h.test('clearance: any Extreme anywhere is BLOCKED', () => {
    const r = risk.clearance(home({ dining: room([mk(20, { hazard_id: 'X' })]) }), matrix);
    h.eq(r.status, 'BLOCKED');
    h.eq(r.fixes[0].hazard_id, 'X');
  });
  await h.test('clearance: High in Exercise Zone or bed path is BLOCKED', () => {
    h.eq(risk.clearance(home({ living: room([mk(12, { zone: 'exercise_zone' })]) }), matrix).status, 'BLOCKED');
    h.eq(risk.clearance(home({ bedroom: room([mk(12, { zone: 'bed_to_toilet_path' })]) }), matrix).status, 'BLOCKED');
  });
  await h.test('clearance: High elsewhere is advisory, not blocked', () => {
    h.eq(risk.clearance(home({ kitchen: room([mk(12)]) }), matrix).status, 'CLEARED_WITH_ADVISORY');
  });
  await h.test('clearance: fixed and pending hazards do not block', () => {
    const hz = [mk(20, { status: 'verified' }), mk(25, { pending: true })];
    h.eq(risk.clearance(home({ kitchen: room(hz) }), matrix).status, 'CLEARED');
  });
  await h.test('clearance: incomplete shots, checklist, rooms or reported change give NOT_ISSUED', () => {
    h.eq(risk.clearance(home({ kitchen: room([], { shotsDone: 2 }) }), matrix).status, 'NOT_ISSUED');
    h.eq(risk.clearance(home({ kitchen: room([], { checklistComplete: false }) }), matrix).status, 'NOT_ISSUED');
    const three = home();
    delete three.rooms.dining;
    h.eq(risk.clearance(three, matrix).status, 'NOT_ISSUED');
    h.eq(risk.clearance({ ...home(), changeReported: true }, matrix).status, 'NOT_ISSUED');
  });
  await h.test('clearance: BLOCKED to CLEARED after the hazard is verified fixed', () => {
    const bad = mk(20, { hazard_id: 'Y' });
    h.eq(risk.clearance(home({ kitchen: room([bad]) }), matrix).status, 'BLOCKED');
    h.eq(risk.clearance(home({ kitchen: room([{ ...bad, status: 'verified' }]) }), matrix).status, 'CLEARED');
  });
  await h.test('clearance record: valid, expired, tampered, blocked', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const rec = risk.clearanceRecord({ status: 'CLEARED', now, validityDays: 7, participantId: 'HS-0001', scanId: 's1' });
    h.eq(rec.expiresAt, '2026-01-08T00:00:00.000Z');
    h.ok(risk.clearanceValid(rec, new Date('2026-01-05T00:00:00Z')));
    h.ok(!risk.clearanceValid(rec, new Date('2026-01-09T00:00:00Z')), 'expired');
    h.ok(!risk.clearanceValid({ ...rec, status: 'CLEARED_WITH_ADVISORY' }, now), 'tampered');
    const blocked = risk.clearanceRecord({ status: 'BLOCKED', now, participantId: 'HS-0001', scanId: 's2' });
    h.ok(!risk.clearanceValid(blocked, now), 'blocked');
    h.ok(!risk.clearanceValid(null, now));
  });

  // ---------- Rules: data integrity ----------
  await h.test('rules: at least 60 rules with unique ids and required fields', () => {
    h.ok(ruleFile.rules.length >= 60, `only ${ruleFile.rules.length} rules`);
    const ids = new Set(ruleFile.rules.map((r) => r.id));
    h.eq(ids.size, ruleFile.rules.length, 'duplicate rule ids');
    for (const r of ruleFile.rules) {
      for (const k of ['id', 'room', 'trigger', 'hazard_type', 'mechanism', 'base_severity', 'base_likelihood', 'controls', 'evidence_text', 'reference']) {
        h.ok(r[k] !== undefined, `${r.id} missing ${k}`);
      }
      h.ok(matrix.hazard_types.includes(r.hazard_type), `${r.id} bad hazard_type ${r.hazard_type}`);
      h.ok(r.base_severity >= 1 && r.base_severity <= 5, `${r.id} severity`);
      h.ok(r.base_likelihood >= 1 && r.base_likelihood <= 5, `${r.id} likelihood`);
      h.ok(r.controls.length >= 1 && r.controls.every((c) => CONTROL_ORDER.includes(c.lvl)), `${r.id} controls`);
      h.ok(r.trigger.all && r.trigger.all.length >= 1, `${r.id} needs an all condition`);
    }
  });
  await h.test('rules: all four rooms are covered', () => {
    for (const rm of appCfg.rooms) {
      const n = ruleFile.rules.filter((r) => r.room.includes('all') || r.room.includes(rm)).length;
      h.ok(n >= 20, `${rm} has only ${n} applicable rules`);
    }
  });
  await h.test('rules: every class is in the vocabulary and every checklist id exists', () => {
    const vocabSet = new Set(Object.values(vocab.groups).flat());
    const itemIds = new Set(checklists.items.map((i) => i.id));
    const conds = (r) => [...(r.trigger.all || []), ...(r.trigger.any || []), ...(r.trigger.none || [])];
    for (const r of ruleFile.rules) {
      for (const c of conds(r)) {
        for (const cls of [...(c.cls || []), ...(c.absent || []), ...((c.near && c.near.cls) || [])]) {
          h.ok(vocabSet.has(cls), `${r.id}: class "${cls}" not in vocabulary`);
        }
        if (c.checklist) h.ok(itemIds.has(c.checklist), `${r.id}: unknown checklist item ${c.checklist}`);
      }
    }
  });
  await h.test('shot guides: Living Room has an Exercise Zone shot, every room has required shots', () => {
    for (const rm of appCfg.rooms) h.ok(shotGuides.rooms[rm].required.length >= 2, rm);
    h.ok(shotGuides.rooms.living.required.some((s) => s.exercise_zone));
  });

  // ---------- i18n ----------
  const locales = {};
  for (const l of appCfg.languages) locales[l] = await loadJson(`locales/${l}.json`);
  await h.test('i18n: every locale has exactly the English keys, none empty', () => {
    const enKeys = Object.keys(locales.en).sort();
    for (const l of appCfg.languages) {
      h.eq(Object.keys(locales[l]).sort(), enKeys, `${l} key set`);
      for (const [k, v] of Object.entries(locales[l])) h.ok(v.trim().length > 0, `${l}.${k} empty`);
    }
  });
  await h.test('i18n: placeholders match English in every locale', () => {
    const ph = (s) => (s.match(/\{\w+\}/g) || []).sort();
    for (const l of appCfg.languages) {
      for (const k of Object.keys(locales.en)) h.eq(ph(locales[l][k]), ph(locales.en[k]), `${l}.${k}`);
    }
  });
  await h.test('i18n: keys referenced by shot guides exist', () => {
    const keys = new Set(Object.keys(locales.en));
    for (const r of shotGuides.universal_rules) {
      const id = r.split('.').pop();
      for (const k of [r, `hs.tut.title.${id}`, `hs.tut.do.${id}`, `hs.tut.avoid.${id}`]) h.ok(keys.has(k), k);
    }
    for (const room of Object.values(shotGuides.rooms)) {
      for (const s of room.required) {
        h.ok(keys.has(s.label), s.label);
        h.ok(keys.has(s.include), s.include);
        for (const gs of s.ghost) h.ok(keys.has(`hs.ghost.${gs.label}`), `ghost ${gs.label}`);
        h.ok(s.cam && typeof s.cam.a === 'number', `${s.id} needs a camera position`);
      }
      for (const o of room.optional) h.ok(keys.has(o), o);
      for (const f of room.plan.furniture) h.ok(keys.has(`hs.ghost.${f.label}`), `plan ${f.label}`);
    }
    for (const rm of appCfg.rooms) h.ok(keys.has(`hs.room.${rm}`), rm);
    for (const lvl of CONTROL_ORDER) h.ok(keys.has(`hs.ctl.${lvl}`), lvl);
    for (const b of matrix.bands) h.ok(keys.has(`hs.band.${b.id}`), b.id);
  });

  // ---------- Stage A quality ----------
  const qth = thresholds.quality;
  const solid = (w, hh, v) => { const a = new Uint8ClampedArray(w * hh * 4); for (let i = 0; i < a.length; i += 4) { a[i] = a[i + 1] = a[i + 2] = v; a[i + 3] = 255; } return a; };
  await h.test('quality: Rec.709 mean luminance', () => {
    h.eq(Math.round(quality.meanLuminance(solid(4, 4, 100))), 100);
    const red = new Uint8ClampedArray([255, 0, 0, 255]);
    h.eq(Math.round(quality.meanLuminance(red)), 54);
  });
  await h.test('quality: Laplacian variance is 0 for flat, high for checkerboard', () => {
    const w = 16; const hh = 16;
    h.eq(quality.laplacianVariance(new Float32Array(w * hh).fill(120), w, hh), 0);
    const chk = new Float32Array(w * hh).map((_, i) => (((i % w) + Math.floor(i / w)) % 2 ? 255 : 0));
    h.ok(quality.laplacianVariance(chk, w, hh) > qth.blur_var_min, 'checkerboard should be sharp');
  });
  await h.test('quality: gate decisions and prompts', () => {
    const good = { brightness: 120, blur_var: 400, roll: 2, pitch: -10, floor_pct: null };
    h.ok(quality.evaluateQuality(good, qth).ready);
    h.eq(quality.evaluateQuality({ ...good, brightness: 40 }, qth).prompts[0], 'hs.q.too_dark');
    h.eq(quality.evaluateQuality({ ...good, brightness: 240 }, qth).prompts[0], 'hs.q.too_bright');
    h.eq(quality.evaluateQuality({ ...good, blur_var: 20 }, qth).lights.steady, 'bad');
    h.eq(quality.evaluateQuality({ ...good, roll: 12 }, qth).prompts[0], 'hs.q.tilt_roll');
    h.eq(quality.evaluateQuality({ ...good, pitch: 20 }, qth).lights.floor, 'bad');
    h.eq(quality.evaluateQuality({ ...good, pitch: -40 }, qth).prompts[0], 'hs.q.tilt_up');
    h.ok(!quality.evaluateQuality({ ...good, people: true }, qth).ready, 'people block');
  });
  await h.test('quality: missing sensors are unknown and do not block (desktop / upload)', () => {
    const r = quality.evaluateQuality({ brightness: 120, blur_var: 400, roll: null, pitch: null, floor_pct: null }, qth);
    h.eq(r.lights.floor, 'unknown');
    h.ok(r.ready);
  });
  await h.test('quality: shutter arms only after 2 s of continuous green', () => {
    const tr = quality.createReadyTracker(qth.hold_still_ms);
    h.ok(!tr.update(true, 0).armed);
    h.ok(!tr.update(true, 1999).armed);
    h.ok(tr.update(true, 2000).armed);
    h.ok(!tr.update(false, 2100).armed, 'reset on red');
    h.ok(!tr.update(true, 2200).armed, 'timer restarts');
  });

  // ---------- Tilt ----------
  await h.test('tilt: upright portrait is level, looking at the horizon', () => {
    const r = tilt.tiltFromEuler(90, 0, 0);
    h.ok(Math.abs(r.pitch) < 0.5, `pitch ${r.pitch}`);
    h.ok(Math.abs(r.roll) < 0.5, `roll ${r.roll}`);
  });
  await h.test('tilt: tipping the top away looks down (negative pitch)', () => {
    h.ok(tilt.tiltFromEuler(70, 0, 0).pitch < -15);
    h.ok(tilt.tiltFromEuler(110, 0, 0).pitch > 15);
  });
  await h.test('tilt: sideways lean shows as roll; landscape upright is level', () => {
    // Upright portrait rolled 15 deg about the screen normal: gravity (sin15, -cos15, 0) = beta 75, gamma 90.
    const rolled = tilt.tiltFromEuler(75, 90, 0);
    h.ok(Math.abs(Math.abs(rolled.roll) - 15) < 0.5 && Math.abs(rolled.pitch) < 0.5, JSON.stringify(rolled));
    const land = tilt.tiltFromEuler(0, -90, 90);
    h.ok(Math.abs(land.roll) < 1 && Math.abs(land.pitch) < 1, JSON.stringify(land));
    h.eq(tilt.tiltFromEuler(null, 0, 0), null);
  });

  // ---------- Shots ----------
  await h.test('shots: progress, next required and bulk upload assignment', () => {
    const taken = new Set(['bedroom_door']);
    h.eq(shots.roomProgress(shotGuides, 'bedroom', taken), { done: 1, total: 3 });
    h.eq(shots.nextRequired(shotGuides, 'bedroom', taken).id, 'bedroom_bedside');
    const plan = shots.assignUploads(shotGuides, 'bedroom', taken, ['a', 'b', 'c']);
    h.eq(plan.map((p) => p.shotId), ['bedroom_bedside', 'bedroom_corner', 'bedroom_opt1']);
    h.eq(shots.assignUploads(shotGuides, 'dining', new Set(), Array(20).fill('x')).length, 2 + shotGuides.rooms.dining.optional.length);
  });

  // ---------- Scene ----------
  const sth = thresholds.scene;
  await h.test('scene: lighting detects a dark floor and floor glare', () => {
    const w = 30; const hh = 30;
    const dark = solid(w, hh, 20);
    h.eq(scene.analyzeLighting(dark, w, hh, sth).dark_floor_pct, 100);
    const lit = solid(w, hh, 150);
    for (let y = 25; y < 27; y++) for (let x = 10; x < 14; x++) { const i = (y * w + x) * 4; lit[i] = lit[i + 1] = lit[i + 2] = 255; }
    const r = scene.analyzeLighting(lit, w, hh, sth);
    h.eq(r.dark_floor_pct, 0);
    h.ok(r.glare, 'glare expected');
    h.eq(r.grid.length, 16);
  });
  await h.test('scene: floor, walkway and distance estimates', () => {
    h.ok(scene.onFloor([0.4, 0.6, 0.2, 0.3]));
    h.ok(!scene.onFloor([0.4, 0.1, 0.2, 0.3]));
    h.ok(scene.inWalkway([0.4, 0.7, 0.2, 0.25]));
    h.ok(!scene.inWalkway([0.0, 0.7, 0.1, 0.25]), 'edge of frame is not the walkway');
    h.eq(scene.boxGapMetres([0, 0, 0.2, 0.2], [0.1, 0.1, 0.2, 0.2]), 0);
    h.eq(scene.boxGapMetres([0, 0, 0.1, 0.1], [0.35, 0, 0.1, 0.1]), 1);
  });
  await h.test('scene + rules: bag in the walkway fires TRIP-SHOES-01 end to end', () => {
    const facts = scene.buildFacts({
      room: 'living', shot: { id: 'living_entrance' }, thresholds: sth,
      lighting: { dark_floor_pct: 5, glare: false },
      detections: [{ id: 'd0', cls: 'bag on floor', conf: 0.8, bbox: [0.4, 0.7, 0.15, 0.2], verdict: null }],
    });
    h.ok(evaluateRules(facts, ruleFile, matrix).some((x) => x.rule_id === 'TRIP-SHOES-01'));
  });
  await h.test('scene + rules: dark floor fires LIGHT-DARK-01; exercise zone object blocks the zone', () => {
    const dark = scene.buildFacts({ room: 'kitchen', shot: { id: 'kitchen_entrance' }, thresholds: sth, lighting: { dark_floor_pct: 40, glare: false }, detections: [] });
    h.ok(evaluateRules(dark, ruleFile, matrix).some((x) => x.rule_id === 'LIGHT-DARK-01'));
    const zone = scene.buildFacts({
      room: 'living', shot: { id: 'living_exercise', exercise_zone: true }, thresholds: sth, lighting: { dark_floor_pct: 0, glare: false },
      detections: [{ id: 'd0', cls: 'chair', conf: 0.9, bbox: [0.45, 0.6, 0.1, 0.3], verdict: null }],
    });
    const hz = evaluateRules(zone, ruleFile, matrix).find((x) => x.rule_id === 'EXERCISE-ZONE-01');
    h.ok(hz, 'zone hazard expected');
    h.eq(hz.zone, 'exercise_zone');
  });
  await h.test('scene: rejected detections do not count toward proximity', () => {
    const facts = scene.buildFacts({
      room: 'kitchen', shot: { id: 'kitchen_sink' }, thresholds: sth, lighting: { dark_floor_pct: 0, glare: false },
      detections: [
        { id: 'a', cls: 'toaster', conf: 0.9, bbox: [0.3, 0.3, 0.1, 0.1], verdict: null },
        { id: 'b', cls: 'sink', conf: 0.9, bbox: [0.42, 0.3, 0.1, 0.1], verdict: 'rejected' },
      ],
    });
    h.ok(!evaluateRules(facts, ruleFile, matrix).some((x) => x.rule_id === 'ELEC-WET-02'));
  });
  // ---------- Samples, annotations, CIR estimate ----------
  await h.test('samples: every sample targets a real shot and uses vocabulary classes', () => {
    const vocabSet = new Set(Object.values(vocab.groups).flat());
    h.eq(samples.samples.length, 4, 'one sample per room');
    for (const s of samples.samples) {
      h.ok(shotGuides.rooms[s.room].required.some((x) => x.id === s.shot), `${s.room}/${s.shot}`);
      for (const a of s.annotations) {
        h.ok(vocabSet.has(a.cls), `${s.file}: ${a.cls}`);
        h.ok(['high', 'medium', 'low'].includes(a.risk), `${s.file}: risk ${a.risk}`);
        h.ok(a.x >= 0 && a.x <= 100 && a.y >= 0 && a.y <= 100, `${s.file}: coordinates`);
      }
    }
  });
  await h.test('annotations: point marker becomes a clamped, flagged detection', () => {
    const d = scene.annotationToDetection({ x: 98, y: 2, cls: 'rug', on_floor: true, in_walkway: false, risk: 'low', label: 'L' }, 3);
    h.eq(d.id, 'ref3');
    h.eq(d.verdict, 'added');
    h.eq(d.source, 'reference');
    h.ok(d.bbox[0] + d.bbox[2] <= 1 + 1e-9 && d.bbox[1] >= 0, 'box stays inside the frame');
    h.eq(d.flags, { on_floor: true, in_walkway: false });
  });
  await h.test('scene: explicit flags override the geometric heuristic', () => {
    const facts = scene.buildFacts({
      room: 'living', shot: { id: 'living_entrance' }, thresholds: sth, lighting: { dark_floor_pct: 0, glare: false },
      detections: [{ id: 'x', cls: 'bag on floor', conf: 1, bbox: [0.0, 0.1, 0.1, 0.1], verdict: 'added', flags: { on_floor: true, in_walkway: true } }],
    });
    h.ok(facts.detections[0].on_floor && facts.detections[0].in_walkway);
  });
  await h.test('scene: CIR-aligned estimate covers 1..9 monotonically', () => {
    h.eq(scene.cirEstimate(0), 1);
    h.eq(scene.cirEstimate(0.1), 4);
    h.eq(scene.cirEstimate(0.9), 9);
    h.eq(scene.cirEstimate(null), null);
    let prev = 0;
    for (let c = 0; c <= 1; c += 0.01) { const v = scene.cirEstimate(c); h.ok(v >= prev, `monotonic at ${c}`); prev = v; }
  });
  await h.test('samples end to end: all 16 labelled hazards are rated by the rules', () => {
    let rated = 0;
    let total = 0;
    for (const s of samples.samples) {
      const shot = shotGuides.rooms[s.room].required.find((x) => x.id === s.shot);
      const dets = s.annotations.map((a, i) => scene.annotationToDetection(a, i));
      const facts = scene.buildFacts({ room: s.room, shot, detections: dets, lighting: { dark_floor_pct: 0, glare: false }, thresholds: sth });
      const hz = evaluateRules(facts, ruleFile, matrix);
      for (const d of dets) { total++; if (hz.some((x) => x.det_id === d.id)) rated++; else h.ok(false, `${s.file}: ${d.label} not rated`); }
    }
    h.eq(`${rated}/${total}`, '16/16');
  });
  await h.test('samples end to end: bedroom path hazards gain +1 likelihood and block clearance', () => {
    const s = samples.samples.find((x) => x.room === 'bedroom');
    const shot = shotGuides.rooms.bedroom.required.find((x) => x.id === s.shot);
    const dets = s.annotations.map((a, i) => scene.annotationToDetection(a, i));
    const facts = scene.buildFacts({ room: 'bedroom', shot, detections: dets, lighting: { dark_floor_pct: 0, glare: false }, thresholds: sth });
    const hz = evaluateRules(facts, ruleFile, matrix).find((x) => x.det_id === 'ref0');
    h.eq(hz.zone, 'bed_to_toilet_path');
    h.eq(hz.L_final, 5);
  });

  // ---------- Consolidated report ----------
  const mkA = (shot_id, room, hazards, extra = {}) => ({ shot_id, room, hazards, detections: [], lighting: { dark_floor_pct: 10 }, scene: { clutter_index: 0.1 }, model: 'm', inference_ms: 100, ...extra });
  const hz = (id, rating, extra = {}) => {
    const S = extra.S || (rating >= 20 ? 5 : rating >= 12 ? 3 : 3);
    const L = extra.L || Math.max(1, Math.min(5, Math.round(rating / S)));
    return { hazard_id: id, rule_id: id.split(':')[0], rating, band: risk.bandOf(rating, matrix).id, S, L_final: L, L_base: L, status: 'open', controls: [{ lvl: 'E', text: 'fix' }], hazard_type: 'FALL_SAME_LEVEL', mechanism: 'm', source: 'cv', ...extra };
  };
  await h.test('report: detection hazards are per photo, room-level hazards counted once per room', () => {
    const merged = report.mergeHazards([
      mkA('s1', 'kitchen', [hz('LIGHT-DARK-01:kitchen', 12), hz('TRIP-CABLE-01:d0', 12, { det_id: 'd0' })]),
      mkA('s2', 'kitchen', [hz('LIGHT-DARK-01:kitchen', 9), hz('TRIP-CABLE-01:d0', 12, { det_id: 'd0' })]),
    ]);
    h.eq(merged.length, 3, 'one dark-room hazard + two cable hazards');
    h.eq(merged.find((x) => x.rule_id === 'LIGHT-DARK-01').rating, 12, 'keeps the higher rating');
  });
  await h.test('report: totals, matrix cells, score, sorting and provisional clearance', () => {
    const analyses = [
      mkA('bedroom_door', 'bedroom', [hz('A:d0', 15, { det_id: 'd0', S: 3, L: 5, zone: 'bed_to_toilet_path' })]),
      mkA('kitchen_entrance', 'kitchen', [hz('B:d0', 6, { det_id: 'd0', S: 3, L: 2 }), hz('C:d1', 4, { det_id: 'd1', S: 2, L: 2, pending: true })]),
    ];
    const r = report.buildReport({
      rooms: appCfg.rooms, guides: shotGuides, matrix, analyses, exerciseZone: 'living',
      captured: (room) => new Set(analyses.filter((a) => a.room === room).map((a) => a.shot_id)),
    });
    h.eq(r.active.length, 2, 'pending excluded');
    h.eq(r.byBand, { EXTREME: 0, HIGH: 1, MEDIUM: 1, LOW: 0 });
    h.eq(r.cells[3][5], 1);
    h.eq(r.cells[3][2], 1);
    h.eq(r.hazards[0].rating, 15, 'sorted by rating');
    h.eq(r.score, 100 - 10 - 4);
    h.eq(r.provisional.status, 'BLOCKED', 'High on the bed path blocks');
    h.eq(r.official.status, 'NOT_ISSUED', 'photos and checklists incomplete');
    h.eq(r.coverage.shotsDone, 2);
    h.eq(r.byRoom.bedroom.band, 'HIGH');
    h.eq(r.byRoom.living.exercise_zone, true);
    h.eq(r.byRoom.kitchen.cir, scene.cirEstimate(0.1));
  });
  await h.test('report: reference agreement and model precision proxy', () => {
    const a = mkA('living_entrance', 'living', [hz('TRIP-RUG-01:ref0', 12, { det_id: 'ref0' })], {
      detections: [
        { id: 'ref0', source: 'reference', reference_risk: 'high', cls: 'rug', label: 'Rug', conf: 1 },
        { id: 'ref1', source: 'reference', reference_risk: 'low', cls: 'toy', label: 'Toy', conf: 1 },
        { id: 'd0', source: 'cv', conf: 0.8, verdict: 'confirmed', cls: 'chair' },
        { id: 'd1', source: 'cv', conf: 0.6, verdict: 'rejected', cls: 'chair' },
      ],
    });
    const r = report.buildReport({ rooms: appCfg.rooms, guides: shotGuides, matrix, analyses: [a], exerciseZone: 'living', captured: () => new Set(['living_entrance']) });
    h.eq([r.reference.n, r.reference.flagged, r.reference.agree], [2, 1, 1]);
    h.eq(r.model.precision_proxy, 50);
    h.eq(r.model.mean_conf, 70, 'reference boxes excluded from model stats');
    h.eq(r.sources.reference, 1);
  });
  await h.test('report: CSV export has a header, one row per hazard, and RFC 4180 quoting', () => {
    const a = mkA('living_entrance', 'living', [hz('X:d0', 12, { det_id: 'd0', mechanism: 'Trip, "rug", edge' })]);
    const r = report.buildReport({ rooms: appCfg.rooms, guides: shotGuides, matrix, analyses: [a], exerciseZone: 'living', captured: () => new Set() });
    const lines = report.registerCsv(r).split('\r\n');
    h.eq(lines.length, 2);
    h.ok(lines[0].startsWith('uid,room,shot_id,rule_id'), 'header');
    h.ok(lines[1].includes('"Trip, ""rug"", edge"'), 'quoted field');
  });

  await h.test('coco map: every mapped class exists in the hazard vocabulary', () => {
    const vocabSet = new Set(Object.values(vocab.groups).flat());
    for (const [coco, cls] of Object.entries(cocoMap.map)) h.ok(vocabSet.has(cls), `${coco} -> ${cls}`);
  });
  await h.test('i18n: Flutter home_scanning.* keys are preserved', () => {
    for (const k of ['app_bar_title', 'intro_description', 'start_test', 'camera_init_failed', 'error_generic', 'home_safety_title',
      'processing_image', 'storage_permission_denied', 'image_saved', 'save_failed', 'download_error', 'download', 'retake', 'retry', 'initializing_camera']) {
      h.ok(locales.en[`home_scanning.${k}`], k);
    }
  });

  // ---------- Rules: every rule fires on its positive fixture, not on its negative ----------
  for (const rule of ruleFile.rules) {
    await h.test(`rule ${rule.id}: fires on positive, silent on negative`, () => {
      const { positive, negative } = fixturesFor(rule);
      const pos = evaluateRules(positive, ruleFile, matrix).filter((x) => x.rule_id === rule.id);
      const neg = evaluateRules(negative, ruleFile, matrix).filter((x) => x.rule_id === rule.id);
      h.ok(pos.length >= 1, 'did not fire on positive fixture');
      h.eq(neg.length, 0, 'fired on negative fixture');
    });
  }

  // ---------- Rules: engine behaviour ----------
  await h.test('engine: output is scored and carries evidence, S x L and due date', () => {
    const rule = ruleFile.rules.find((r) => r.id === 'TRIP-CABLE-01');
    const { positive } = fixturesFor(rule);
    const hz = evaluateRules(positive, ruleFile, matrix, new Date('2026-01-01T00:00:00Z')).find((x) => x.rule_id === rule.id);
    h.eq(hz.S, 3);
    h.eq(hz.L_final, 4);
    h.eq(hz.rating, 12);
    h.eq(hz.band, 'HIGH');
    h.eq(hz.due_date, '2026-01-04T00:00:00.000Z');
    h.ok(hz.evidence.length > 0);
    h.eq(hz.status, 'open');
  });
  await h.test('engine: profile raises likelihood, never severity', () => {
    const rule = ruleFile.rules.find((r) => r.id === 'TRIP-RUG-01');
    const { positive } = fixturesFor(rule);
    positive.profile = { falls_12m: 2, walking_aid: true };
    const hz = evaluateRules(positive, ruleFile, matrix).find((x) => x.rule_id === rule.id);
    h.eq(hz.S, 3);
    h.eq(hz.L_final, 5);
  });
  await h.test('engine: Exercise Zone and bed path add +1 and set the zone', () => {
    const rule = ruleFile.rules.find((r) => r.id === 'TRIP-SHOES-01');
    const { positive } = fixturesFor(rule);
    positive.ctx.in_exercise_zone = true;
    const hz = evaluateRules(positive, ruleFile, matrix).find((x) => x.rule_id === rule.id);
    h.eq(hz.zone, 'exercise_zone');
    h.eq(hz.L_final, 5);
  });
  await h.test('engine: low-confidence unconfirmed detection is pending; confirming it activates', () => {
    const rule = ruleFile.rules.find((r) => r.id === 'TRIP-CABLE-01');
    const { positive } = fixturesFor(rule);
    positive.detections[0].conf = 0.3;
    let hz = evaluateRules(positive, ruleFile, matrix).find((x) => x.rule_id === rule.id);
    h.ok(hz.pending, 'should be pending');
    h.eq(risk.homeScore([hz], matrix), 100, 'pending must not affect the score');
    positive.detections[0].verdict = 'confirmed';
    hz = evaluateRules(positive, ruleFile, matrix).find((x) => x.rule_id === rule.id);
    h.ok(!hz.pending, 'confirmed should not be pending');
  });
  await h.test('engine: rejected detections never fire a rule', () => {
    const rule = ruleFile.rules.find((r) => r.id === 'TRIP-CABLE-01');
    const { positive } = fixturesFor(rule);
    positive.detections[0].verdict = 'rejected';
    h.eq(evaluateRules(positive, ruleFile, matrix).filter((x) => x.rule_id === rule.id).length, 0);
  });
  await h.test('engine: relabelled detection counts under its corrected class', () => {
    const rule = ruleFile.rules.find((r) => r.id === 'TRIP-CABLE-01');
    const f = emptyFacts('living');
    f.detections.push({ id: 'r1', cls: 'toy', conf: 0.9, on_floor: true, in_walkway: true, verdict: 'relabelled', relabel_class: 'extension cord', near: {} });
    h.ok(evaluateRules(f, ruleFile, matrix).some((x) => x.rule_id === rule.id));
  });
  await h.test('engine: one hazard per matching detection', () => {
    const rule = ruleFile.rules.find((r) => r.id === 'TRIP-CABLE-01');
    const { positive } = fixturesFor(rule);
    positive.detections.push({ ...positive.detections[0], id: 'second' });
    h.eq(evaluateRules(positive, ruleFile, matrix).filter((x) => x.rule_id === rule.id).length, 2);
  });
  await h.test('engine: room filter, rule does not fire in another room', () => {
    const rule = ruleFile.rules.find((r) => r.id === 'FALL-STOOL-01');
    const { positive } = fixturesFor(rule);
    h.ok(evaluateRules(positive, ruleFile, matrix).some((x) => x.rule_id === rule.id));
    positive.room = 'dining';
    h.ok(!evaluateRules(positive, ruleFile, matrix).some((x) => x.rule_id === rule.id));
  });
  await h.test('engine: controls are in Hierarchy-of-Controls order', () => {
    for (const rule of ruleFile.rules) {
      const { positive } = fixturesFor(rule);
      const hz = evaluateRules(positive, ruleFile, matrix).find((x) => x.rule_id === rule.id);
      const idx = hz.controls.map((c) => CONTROL_ORDER.indexOf(c.lvl));
      h.eq(idx, [...idx].sort((a, b) => a - b), rule.id);
    }
  });
  await h.test('engine: verified control lowers likelihood', () => {
    const rule = ruleFile.rules.find((r) => r.id === 'TRIP-CABLE-01');
    const { positive } = fixturesFor(rule);
    positive.verified_controls = [rule.id];
    const hz = evaluateRules(positive, ruleFile, matrix).find((x) => x.rule_id === rule.id);
    h.eq(hz.L_final, 3);
  });
  await h.test('engine: unknown condition throws instead of silently passing', () => {
    h.throws(() => evalCondition({ bogus: 1 }, emptyFacts('living')));
  });
}
