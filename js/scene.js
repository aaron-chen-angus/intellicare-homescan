/**
 * scene.js - Stage C scene signals (pure, no DOM) and the facts object for the rules engine.
 *
 * Until the depth model lands (task 5), the floor is approximated as the lower third of the
 * frame (the photo rules require the floor to fill at least one third) and distances use a
 * nominal frame width. Every derived distance is an ESTIMATE and is labelled as such in the UI.
 */

/** Nominal real-world width covered by a room photo at chest height (metres). */
export const FRAME_WIDTH_M = 4;
/** Top of the floor band as a fraction of image height. */
export const FLOOR_TOP = 2 / 3;

/**
 * Lighting analysis on RGBA pixels: 4x4 luminance grid, dark share of the floor band,
 * and glare (bright specular blobs on the floor).
 */
export function analyzeLighting(rgba, w, h, th) {
  const grid = Array.from({ length: 16 }, () => ({ sum: 0, n: 0 }));
  const floorStart = Math.floor(h * FLOOR_TOP);
  let floorN = 0;
  let dark = 0;
  let bright = 0;
  for (let y = 0; y < h; y++) {
    const gy = Math.min(3, Math.floor((y / h) * 4));
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
      const cell = grid[gy * 4 + Math.min(3, Math.floor((x / w) * 4))];
      cell.sum += lum;
      cell.n++;
      if (y >= floorStart) {
        floorN++;
        if (lum < th.dark_zone_lum) dark++;
        if (lum > th.glare_lum) bright++;
      }
    }
  }
  const brightPct = floorN ? (bright / floorN) * 100 : 0;
  return {
    grid: grid.map((c) => Math.round(c.n ? c.sum / c.n : 0)),
    dark_floor_pct: floorN ? Math.round((dark / floorN) * 100) : 0,
    glare_pct: Math.round(brightPct * 10) / 10,
    glare: brightPct >= 0.5,
  };
}

/** Gap between two normalised boxes (0 when they overlap), converted to metres (estimate). */
export function boxGapMetres(a, b) {
  const dx = Math.max(0, Math.max(a[0], b[0]) - Math.min(a[0] + a[2], b[0] + b[2]));
  const dy = Math.max(0, Math.max(a[1], b[1]) - Math.min(a[1] + a[3], b[1] + b[3]));
  return Math.round(Math.hypot(dx, dy) * FRAME_WIDTH_M * 100) / 100;
}

/** Bottom edge reaches the floor band. */
export const onFloor = (b) => b[1] + b[3] >= FLOOR_TOP + 0.05;

/** On the floor and crossing the central walking corridor (middle 60% of the width, low in frame). */
export function inWalkway(b) {
  const bottom = b[1] + b[3];
  const cx = b[0] + b[2] / 2;
  return bottom >= 0.8 && cx >= 0.2 && cx <= 0.8;
}

/** Furniture is not "clutter". */
const NOT_CLUTTER = new Set(['bed', 'sofa', 'dining table', 'chair', 'refrigerator', 'oven', 'sink', 'television', 'person', 'cabinet', 'wardrobe']);

/** Share of the floor band covered by small loose objects. */
export function clutterIndex(dets) {
  const floorArea = 1 - FLOOR_TOP;
  let area = 0;
  for (const d of dets) {
    const floor = d.flags && typeof d.flags.on_floor === 'boolean' ? d.flags.on_floor : onFloor(d.bbox);
    if (NOT_CLUTTER.has(d.cls) || !floor) continue;
    const top = Math.max(d.bbox[1], FLOOR_TOP);
    const hh = Math.max(0, d.bbox[1] + d.bbox[3] - top);
    area += d.bbox[2] * hh;
  }
  return Math.round((area / floorArea) * 1000) / 1000;
}

/**
 * Build the facts object consumed by rules.js.
 * @param {{room:string, shot:object, detections:object[], lighting:object, thresholds:object,
 *          profile?:object, checklist?:object}} input  thresholds = config thresholds.scene
 */
export function buildFacts({ room, shot, detections, lighting, thresholds, profile = {}, checklist = {}, exerciseZone = null }) {
  const live = detections.filter((d) => d.verdict !== 'rejected');
  const enriched = detections.map((d) => {
    const near = {};
    for (const o of live) {
      if (o.id === d.id) continue;
      const m = boxGapMetres(d.bbox, o.bbox);
      if (near[o.cls] === undefined || m < near[o.cls]) near[o.cls] = m;
    }
    // Human-labelled boxes (manual additions, reference annotations) may state position
    // explicitly; that judgement overrides the geometric heuristic.
    const f = d.flags || {};
    return {
      ...d,
      on_floor: typeof f.on_floor === 'boolean' ? f.on_floor : onFloor(d.bbox),
      in_walkway: typeof f.in_walkway === 'boolean' ? f.in_walkway : inWalkway(d.bbox),
      height_m: null,
      near,
    };
  });

  // The Exercise Zone is a whole room (chosen in Settings, default Living Room), because the
  // photo protocol is layout-agnostic. Exercise needs a clear floor, so the zone counts as
  // obstructed at a lower clutter level than the general clutter rule.
  const inZone = Boolean(exerciseZone) && room === exerciseZone;
  const clutter = clutterIndex(live);

  return {
    room,
    detections: enriched,
    ctx: {
      glare: lighting.glare,
      dark_floor_high: lighting.dark_floor_pct >= 25,
      dark_bed_path: room === 'bedroom' && lighting.dark_floor_pct >= 25,
      clutter_high: clutter > thresholds.clutter_index_max,
      exercise_blocked: inZone && clutter > thresholds.exercise_clutter_max,
      in_exercise_zone: inZone,
      in_bed_path: Boolean(shot && shot.path === 'bed_to_toilet_path'),
    },
    checklist,
    profile,
    verified_controls: [],
  };
}

/**
 * Clutter Image Rating (CIR)-aligned estimate, 1..9, from the clutter index.
 * The CIR (Frost et al., 2008) is a validated 9-point pictorial scale rated by people; this
 * mapping is an UNVALIDATED heuristic so reports can speak the same language as clinicians.
 * Upper bounds of clutter-index bands for CIR levels 1..8 (above the last = 9).
 */
export const CIR_BANDS = [0.02, 0.05, 0.08, 0.12, 0.18, 0.26, 0.36, 0.5];

export function cirEstimate(clutter) {
  if (typeof clutter !== 'number' || Number.isNaN(clutter)) return null;
  const i = CIR_BANDS.findIndex((upper) => clutter <= upper);
  return i === -1 ? 9 : i + 1;
}

/**
 * Convert a point annotation (percent coordinates, as used by the prototype's ROOMS markers)
 * into a detection-shaped record with verdict 'added', so it flows through the same rules.
 * The box is centred on the marker; its size defaults to 14% x 12% of the frame.
 */
export function annotationToDetection(a, index) {
  const w = (a.w ?? 14) / 100;
  const hh = (a.h ?? 12) / 100;
  const x = Math.min(1 - w, Math.max(0, a.x / 100 - w / 2));
  const y = Math.min(1 - hh, Math.max(0, a.y / 100 - hh / 2));
  return {
    id: `ref${index}`,
    cls: a.cls,
    conf: 1,
    bbox: [x, y, w, hh],
    verdict: 'added',
    source: 'reference',
    label: a.label || null,
    reference_risk: a.risk || null,
    flags: { on_floor: a.on_floor, in_walkway: a.in_walkway },
  };
}
