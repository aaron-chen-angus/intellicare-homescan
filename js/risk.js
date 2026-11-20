/**
 * risk.js - Risk matrix, likelihood modifiers, aggregation and clearance logic.
 *
 * Pure functions only (no DOM, no fetch). Config is always passed in
 * (the object loaded from config/risk_matrix.json) so tests can inject fixtures.
 * Method: ISO 31000:2018 / ISO 45001, with a mapping to the WSH Council 3x3 matrix.
 */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Risk rating = Severity x Likelihood (both 1..5). */
export function rate(S, L) {
  if (!Number.isInteger(S) || !Number.isInteger(L) || S < 1 || S > 5 || L < 1 || L > 5) {
    throw new RangeError(`S and L must be integers 1..5 (got S=${S}, L=${L})`);
  }
  return S * L;
}

/** Return the band object ({id,color,icon,action,...}) for a rating. */
export function bandOf(rating, matrix) {
  const band = matrix.bands.find((b) => rating >= b.min && rating <= b.max);
  if (!band) throw new RangeError(`No band for rating ${rating}`);
  return band;
}

/** Rating and band in one call. */
export function evaluate(S, L, matrix) {
  const rating = rate(S, L);
  return { S, L, rating, band: bandOf(rating, matrix).id };
}

/**
 * Apply likelihood modifiers (section 6.3). Severity is never modified.
 * @param {number} Lbase base likelihood from the rule
 * @param {{profile?:object, criticalPath?:boolean, verifiedControl?:boolean}} ctx
 * @returns {{L:number, modifiers:{id:string, delta:number}[]}}
 */
export function finalLikelihood(Lbase, ctx, matrix) {
  const m = matrix.likelihood_modifiers;
  const p = ctx.profile || {};
  const modifiers = [];
  if (Number(p.falls_12m) >= 1) modifiers.push({ id: 'prior_fall', delta: m.prior_fall });
  // Walking aid and vision impairment share a single +1 (max +1 combined).
  if (p.walking_aid || p.vision_impaired) modifiers.push({ id: 'aid_or_vision', delta: m.aid_or_vision });
  if (ctx.criticalPath) modifiers.push({ id: 'critical_path', delta: m.critical_path });
  if (ctx.verifiedControl) modifiers.push({ id: 'verified_control', delta: m.verified_control });
  const L = clamp(Lbase + modifiers.reduce((a, x) => a + x.delta, 0), m.min, m.max);
  return { L, modifiers };
}

/** Map a 5x5 (S,L) pair onto the WSH 3x3 matrix. */
export function toWsh(S, L, matrix) {
  const w = matrix.wsh;
  const s = w.severity_map[S];
  const l = w.likelihood_map[L];
  const score = s * l;
  const band = w.bands.find((b) => score >= b.min && score <= b.max);
  return {
    s, l, score,
    band: band.id,
    severity: w.severity_labels[s - 1],
    likelihood: w.likelihood_labels[l - 1],
  };
}

/**
 * Residual risk after committing to a control. Control carries expected
 * reduction as delta_L and/or delta_S (negative numbers).
 */
export function residual(hazard, control, matrix) {
  const S = clamp(hazard.S + (control.delta_S || 0), 1, 5);
  const L = clamp(hazard.L_final + (control.delta_L || 0), 1, 5);
  return evaluate(S, L, matrix);
}

/** True when a hazard counts toward scoring and clearance. */
export function isActive(h) {
  return !h.pending && h.status !== 'fixed' && h.status !== 'verified';
}

const BAND_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'];

/** Worst-case room risk plus counts by band (section 6.6). */
export function roomRisk(hazards, matrix) {
  const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, EXTREME: 0 };
  let max = 0;
  for (const h of hazards.filter(isActive)) {
    counts[bandOf(h.rating, matrix).id] += 1;
    max = Math.max(max, h.rating);
  }
  return { max, band: max ? bandOf(max, matrix).id : null, counts };
}

/**
 * Home Safety Score 0..100 (gamification only). If any Extreme hazard is
 * active the score is capped so it can never look healthy (cap = 40).
 */
export function homeScore(hazards, matrix) {
  const w = matrix.score_weights;
  const active = hazards.filter(isActive);
  const penalty = active.reduce((a, h) => a + w[bandOf(h.rating, matrix).id], 0);
  let score = Math.max(0, 100 - penalty);
  if (active.some((h) => bandOf(h.rating, matrix).id === 'EXTREME')) score = Math.min(score, 40);
  return score;
}

/** Hearts remaining: start - 2 per Extreme - 1 per High, floor 0. */
export function hearts(hazards, matrix) {
  const hc = matrix.hearts;
  const active = hazards.filter(isActive);
  const lost = active.reduce((a, h) => a + (hc[bandOf(h.rating, matrix).id] || 0), 0);
  return Math.max(0, hc.start - lost);
}

/** Due date (ISO string) for a hazard from its band; null for Low. */
export function dueDate(hazard, matrix, from = new Date()) {
  const band = bandOf(hazard.rating, matrix);
  if (band.due_days === null) return null;
  return new Date(from.getTime() + band.due_days * 86400000).toISOString();
}

/**
 * Decide the clearance status (section 7).
 * @param {{
 *   rooms: Record<string,{shotsDone:number, shotsRequired:number, checklistComplete:boolean, hazards:object[]}>,
 *   changeReported?: boolean
 * }} input
 * Hazards may carry zone = 'exercise_zone' | 'bed_to_toilet_path'.
 * @returns {{status:string, reasons:string[], fixes:object[]}}
 *   status is CLEARED | CLEARED_WITH_ADVISORY | BLOCKED | NOT_ISSUED.
 */
export function clearance(input, matrix) {
  const reasons = [];
  const fixes = [];
  const roomIds = Object.keys(input.rooms);

  if (input.changeReported) reasons.push('CHANGE_REPORTED');
  for (const id of roomIds) {
    const r = input.rooms[id];
    if (r.shotsDone < r.shotsRequired) reasons.push(`SHOTS_INCOMPLETE:${id}`);
    if (!r.checklistComplete) reasons.push(`CHECKLIST_INCOMPLETE:${id}`);
  }
  if (roomIds.length < 4) reasons.push('ROOMS_MISSING');
  if (reasons.length) return { status: 'NOT_ISSUED', reasons, fixes };

  const cfg = matrix.clearance;
  let worst = 'LOW';
  for (const id of roomIds) {
    for (const h of input.rooms[id].hazards.filter(isActive)) {
      const band = bandOf(h.rating, matrix).id;
      if (BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf(worst)) worst = band;
      const extreme = cfg.blocked_if_extreme && band === 'EXTREME';
      const highInZone = band === 'HIGH' && cfg.blocked_if_high_in.includes(h.zone);
      if (extreme || highInZone) {
        fixes.push({ room: id, hazard_id: h.hazard_id, rule_id: h.rule_id, band, zone: h.zone || null, controls: h.controls || [] });
      }
    }
  }
  if (fixes.length) return { status: 'BLOCKED', reasons: ['BLOCKING_HAZARDS'], fixes };
  if (worst === 'HIGH') {
    // High hazards outside the exercise zone / bed path: advisory, fix before exercising in that room.
    return { status: 'CLEARED_WITH_ADVISORY', reasons: ['HIGH_OUTSIDE_ZONE'], fixes };
  }
  if (worst === 'MEDIUM') return { status: 'CLEARED_WITH_ADVISORY', reasons: ['MEDIUM_HAZARDS'], fixes };
  return { status: 'CLEARED', reasons: [], fixes };
}

/** Small non-cryptographic FNV-1a hash (tamper-evidence only, not security). */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Build the record other apps read from localStorage. */
export function clearanceRecord({ status, now = new Date(), validityDays = 7, participantId, scanId }) {
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + validityDays * 86400000).toISOString();
  const hash = fnv1a([status, issuedAt, expiresAt, participantId, scanId].join('|'));
  return { status, issuedAt, expiresAt, participantId, scanId, hash };
}

/** Validate a stored record: hash intact, not expired, status allows exercise. */
export function clearanceValid(rec, now = new Date()) {
  if (!rec || !rec.status) return false;
  const expect = fnv1a([rec.status, rec.issuedAt, rec.expiresAt, rec.participantId, rec.scanId].join('|'));
  if (expect !== rec.hash) return false;
  if (new Date(rec.expiresAt) <= now) return false;
  return rec.status === 'CLEARED' || rec.status === 'CLEARED_WITH_ADVISORY';
}
