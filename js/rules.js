/**
 * rules.js - Stage D: deterministic, explainable hazard rules engine.
 *
 * Pure (no DOM). Interprets the trigger DSL in config/hazard_rules.json against a
 * "facts" object and returns hazard instances scored with risk.js.
 *
 * facts = {
 *   room: 'kitchen',
 *   detections: [{ id, cls, conf, bbox, on_floor, in_walkway, height_m, verdict, near:{cls:distance_m} }],
 *   ctx: { glare, clutter_high, walkway_narrow, dark_floor_high, dark_bed_path, exercise_blocked,
 *          in_bed_path, in_exercise_zone },
 *   checklist: { item_id: 'yes'|'no'|'unsure' },
 *   profile: { walking_aid, falls_12m, ... },
 *   verified_controls: [rule_id, ...]
 * }
 */
import { evaluate, finalLikelihood, dueDate } from './risk.js';

/** Hierarchy of Controls order: Elimination, Substitution, Engineering, Administrative, PPE. */
export const CONTROL_ORDER = ['E', 'S', 'Eng', 'Admin', 'PPE'];

/** Return a copy of controls sorted by hierarchy (stable within a level). */
export function sortControls(controls) {
  return controls
    .map((c, i) => ({ c, i }))
    .sort((a, b) => CONTROL_ORDER.indexOf(a.c.lvl) - CONTROL_ORDER.indexOf(b.c.lvl) || a.i - b.i)
    .map((x) => x.c);
}

/** Detections the user has not rejected. */
function liveDetections(facts) {
  return (facts.detections || []).filter((d) => d.verdict !== 'rejected');
}

/**
 * Evaluate one condition.
 * @returns {{ok:boolean, matches:object[]}} matches is only populated for class conditions.
 */
export function evalCondition(cond, facts) {
  if (cond.cls) {
    const matches = liveDetections(facts).filter((d) => {
      // A relabelled detection counts under its corrected class.
      const cls = d.verdict === 'relabelled' && d.relabel_class ? d.relabel_class : d.cls;
      if (!cond.cls.includes(cls)) return false;
      if (cond.on_floor !== undefined && !!d.on_floor !== cond.on_floor) return false;
      if (cond.in_walkway !== undefined && !!d.in_walkway !== cond.in_walkway) return false;
      if (cond.height_gte !== undefined && !(d.height_m >= cond.height_gte)) return false;
      if (cond.near) {
        const near = d.near || {};
        if (!cond.near.cls.some((c) => near[c] !== undefined && near[c] <= cond.near.max_m)) return false;
      }
      return true;
    });
    const need = cond.min_count || 1;
    return { ok: matches.length >= need, matches };
  }
  if (cond.absent) {
    const found = liveDetections(facts).some((d) => cond.absent.includes(d.cls));
    return { ok: !found, matches: [] };
  }
  if (cond.ctx) return { ok: (facts.ctx || {})[cond.ctx] === cond.eq, matches: [] };
  if (cond.checklist) return { ok: (facts.checklist || {})[cond.checklist] === cond.is, matches: [] };
  if (cond.profile) return { ok: (facts.profile || {})[cond.profile] === cond.eq, matches: [] };
  throw new Error(`Unknown condition: ${JSON.stringify(cond)}`);
}

/** True when the rule applies to the given room. */
export function appliesToRoom(rule, room) {
  return rule.room.includes('all') || rule.room.includes(room);
}

/**
 * Check a rule trigger.
 * @returns {{fired:boolean, anchors:object[], source:'cv'|'checklist'|'context'}}
 */
export function matchRule(rule, facts) {
  const t = rule.trigger;
  const all = (t.all || []).map((c) => ({ c, r: evalCondition(c, facts) }));
  const anyList = (t.any || []).map((c) => evalCondition(c, facts));
  const none = (t.none || []).map((c) => evalCondition(c, facts));

  const fired =
    all.every((x) => x.r.ok) &&
    (anyList.length === 0 || anyList.some((r) => r.ok)) &&
    none.every((r) => !r.ok);
  if (!fired) return { fired: false, anchors: [], source: 'context' };

  const anchorCond = all.find((x) => x.c.cls);
  const anchors = anchorCond ? anchorCond.r.matches : [];
  const usesChecklist = all.some((x) => x.c.checklist);
  return { fired: true, anchors, source: anchors.length ? 'cv' : usesChecklist ? 'checklist' : 'context' };
}

/**
 * Run every applicable rule and build scored hazard instances.
 * @param {object} facts see header
 * @param {{rules:object[]}} ruleFile contents of hazard_rules.json
 * @param {object} matrix contents of risk_matrix.json
 * @param {Date} [now]
 */
export function evaluateRules(facts, ruleFile, matrix, now = new Date()) {
  const hazards = [];
  const lowConf = matrix.likelihood_modifiers.low_confidence_below;
  const ctx = facts.ctx || {};

  for (const rule of ruleFile.rules) {
    if (!appliesToRoom(rule, facts.room)) continue;
    const m = matchRule(rule, facts);
    if (!m.fired) continue;

    // One hazard per anchor detection, unless the rule is room-scoped or counts several objects.
    const perRoom = rule.scope === 'room' || !m.anchors.length || (rule.trigger.all || []).some((c) => c.min_count);
    const targets = perRoom ? [null] : m.anchors;

    for (const det of targets) {
      const zone = rule.zone || (ctx.in_exercise_zone ? 'exercise_zone' : ctx.in_bed_path ? 'bed_to_toilet_path' : null);
      const verifiedControl = (facts.verified_controls || []).includes(rule.id);
      const { L, modifiers } = finalLikelihood(
        rule.base_likelihood,
        { profile: facts.profile, criticalPath: !!zone, verifiedControl },
        matrix
      );
      const scored = evaluate(rule.base_severity, L, matrix);
      const trusted = det && ['confirmed', 'added', 'relabelled'].includes(det.verdict);
      const pending = !!det && !trusted && typeof det.conf === 'number' && det.conf < lowConf;

      const hazard = {
        hazard_id: `${rule.id}:${det ? det.id : facts.room}`,
        room: facts.room,
        source: det ? (det.verdict === 'added' ? 'manual' : 'cv') : m.source,
        rule_id: rule.id,
        hazard_type: rule.hazard_type,
        mechanism: rule.mechanism,
        S: rule.base_severity,
        L_base: rule.base_likelihood,
        L_modifiers: modifiers,
        L_final: L,
        rating: scored.rating,
        band: scored.band,
        controls: sortControls(rule.controls),
        committed_control: null,
        due_date: null,
        status: 'open',
        residual_rating: null,
        evidence: rule.evidence_text,
        reference: rule.reference,
        det_id: det ? det.id : null,
        zone,
        pending,
      };
      hazard.due_date = dueDate(hazard, matrix, now);
      hazards.push(hazard);
    }
  }
  return hazards;
}
