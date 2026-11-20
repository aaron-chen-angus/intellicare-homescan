/**
 * suite.js - unit tests for the risk matrix, rules engine and clearance logic.
 * `loadJson(path)` is injected: fetch() in the browser, fs in Node.
 */
import * as risk from '../js/risk.js';
import { evaluateRules, CONTROL_ORDER, evalCondition } from '../js/rules.js';
import { fixturesFor, emptyFacts } from './fixtures.js';

export async function runSuite(h, loadJson) {
  const matrix = await loadJson('config/risk_matrix.json');
  const ruleFile = await loadJson('config/hazard_rules.json');
  const vocab = await loadJson('config/vocabulary.json');
  const checklists = await loadJson('config/checklists.json');
  const appCfg = await loadJson('config/app.json');
  const shotGuides = await loadJson('config/shot_guides.json');

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
    for (const r of shotGuides.universal_rules) h.ok(keys.has(r), r);
    for (const room of Object.values(shotGuides.rooms)) for (const s of room.required) h.ok(keys.has(s.label), s.label);
    for (const rm of appCfg.rooms) h.ok(keys.has(`hs.room.${rm}`), rm);
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
