/**
 * fixtures.js - builds a positive and a negative facts fixture for any rule,
 * directly from its trigger, so every rule in hazard_rules.json is tested.
 *
 * positive: satisfies every `all` condition (and the first `any`).
 * negative: same, but the first `all` condition is deliberately broken.
 */

/** Empty facts for a room. */
export function emptyFacts(room) {
  return { room, detections: [], ctx: {}, checklist: {}, profile: {}, verified_controls: [] };
}

/** Pick a room the rule applies to. */
export function roomFor(rule) {
  return rule.room.includes('all') ? 'living' : rule.room[0];
}

/** Add whatever facts satisfy a single condition. */
function satisfy(cond, facts, tag) {
  if (cond.cls) {
    const n = cond.min_count || 1;
    for (let k = 0; k < n; k++) {
      facts.detections.push({
        id: `${tag}_${k}`,
        cls: cond.cls[0],
        conf: 0.9,
        bbox: [0.4, 0.4, 0.1, 0.1],
        on_floor: cond.on_floor ?? false,
        in_walkway: cond.in_walkway ?? false,
        height_m: cond.height_gte !== undefined ? cond.height_gte + 0.1 : null,
        verdict: null,
        near: cond.near ? { [cond.near.cls[0]]: cond.near.max_m * 0.5 } : {},
      });
    }
  } else if (cond.ctx) facts.ctx[cond.ctx] = cond.eq;
  else if (cond.checklist) facts.checklist[cond.checklist] = cond.is;
  else if (cond.profile) facts.profile[cond.profile] = cond.eq;
  // `absent` is satisfied by adding nothing.
}

/** Make the condition false in facts that currently satisfy it. */
function breakCond(cond, facts) {
  if (cond.cls) {
    if (cond.near) {
      // Keep the object but move it out of range.
      for (const d of facts.detections) d.near = { [cond.near.cls[0]]: cond.near.max_m + 5 };
    } else {
      facts.detections = facts.detections.filter((d) => !cond.cls.includes(d.cls));
    }
  } else if (cond.absent) {
    facts.detections.push({ id: 'neg_absent', cls: cond.absent[0], conf: 0.9, bbox: [0.1, 0.1, 0.1, 0.1], near: {} });
  } else if (cond.ctx) facts.ctx[cond.ctx] = !cond.eq;
  else if (cond.checklist) facts.checklist[cond.checklist] = cond.is === 'no' ? 'yes' : 'no';
  else if (cond.profile) facts.profile[cond.profile] = !cond.eq;
}

/** @returns {{positive:object, negative:object}} */
export function fixturesFor(rule) {
  const build = () => {
    const f = emptyFacts(roomFor(rule));
    (rule.trigger.all || []).forEach((c, i) => satisfy(c, f, `a${i}`));
    if (rule.trigger.any && rule.trigger.any.length) satisfy(rule.trigger.any[0], f, 'any0');
    return f;
  };
  const positive = build();
  const negative = build();
  breakCond(rule.trigger.all[0], negative);
  return { positive, negative };
}
