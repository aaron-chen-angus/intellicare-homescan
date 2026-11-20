/**
 * quality.js - Stage A capture quality gate.
 *
 * Pure metric and decision functions (testable without a DOM) plus a monitor that samples a
 * <video> every 250 ms. Thresholds come from config/thresholds.json (quality section).
 */

/** Mean Rec.709 luminance (0..255) of an RGBA pixel array. */
export function meanLuminance(rgba) {
  const n = rgba.length / 4;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < rgba.length; i += 4) sum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
  return sum / n;
}

/** Rec.709 greyscale of an RGBA array as a Float32Array. */
export function toGrey(rgba) {
  const grey = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) grey[j] = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
  return grey;
}

/** Variance of the 4-neighbour Laplacian of a greyscale image. Low value = blurry. */
export function laplacianVariance(grey, w, h) {
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * grey[i] - grey[i - 1] - grey[i + 1] - grey[i - w] - grey[i + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * Judge the metrics against thresholds.
 * @param {{brightness:number|null, blur_var:number|null, roll:number|null, pitch:number|null,
 *          floor_pct:number|null, people?:boolean}} m  null = not measurable yet
 * @param {object} th config.thresholds.quality
 * @returns {{lights:{light:string, steady:string, floor:string}, prompts:string[], ready:boolean}}
 *   light state is 'ok' | 'bad' | 'unknown'. 'unknown' (sensor or depth missing) does not block.
 */
export function evaluateQuality(m, th) {
  const prompts = [];

  let light = 'ok';
  if (m.brightness === null || m.brightness === undefined) light = 'unknown';
  else if (m.brightness < th.brightness_min) { light = 'bad'; prompts.push('hs.q.too_dark'); }
  else if (m.brightness > th.brightness_max) { light = 'bad'; prompts.push('hs.q.too_bright'); }

  let steady = 'ok';
  const blurBad = m.blur_var === null || m.blur_var === undefined ? false : m.blur_var < th.blur_var_min;
  if (blurBad) prompts.push('hs.q.blurry');
  const rollKnown = typeof m.roll === 'number';
  const rollBad = rollKnown && Math.abs(m.roll) > th.roll_max_deg;
  if (rollBad) prompts.push('hs.q.tilt_roll');
  if (blurBad || rollBad) steady = 'bad';
  else if (m.blur_var === null || m.blur_var === undefined) steady = 'unknown';

  let floor = 'ok';
  const pitchKnown = typeof m.pitch === 'number';
  let floorBad = false;
  if (pitchKnown && m.pitch > th.pitch_max_deg) { floorBad = true; prompts.push('hs.q.tilt_down'); }
  if (pitchKnown && m.pitch < th.pitch_min_deg) { floorBad = true; prompts.push('hs.q.tilt_up'); }
  if (typeof m.floor_pct === 'number' && m.floor_pct < th.floor_pct_min) { floorBad = true; prompts.push('hs.q.floor_low'); }
  if (floorBad) floor = 'bad';
  else if (!pitchKnown && typeof m.floor_pct !== 'number') floor = 'unknown';

  const people = !!m.people;
  if (people) prompts.push('hs.q.people');

  const ready = light !== 'bad' && steady !== 'bad' && floor !== 'bad' && !people;
  return { lights: { light, steady, floor }, prompts, ready };
}

/**
 * Tracks how long the READY state has held. The shutter arms after `holdMs` (2 s by default)
 * of continuous green, matching the "hold still for 2 seconds" photo rule.
 */
export function createReadyTracker(holdMs) {
  let since = null;
  return {
    update(ready, now) {
      if (!ready) { since = null; return { armed: false, progress: 0 }; }
      if (since === null) since = now;
      const held = now - since;
      return { armed: held >= holdMs, progress: Math.min(1, held / holdMs) };
    },
    reset() { since = null; },
  };
}

/**
 * Measure brightness and blur of a video/canvas/image on a downscaled copy.
 * @param {CanvasImageSource} source
 * @param {{w:number,h:number}} size intrinsic size of source
 * @param {number} frameW work width (spec: 320 px)
 * @param {HTMLCanvasElement} [work] reusable canvas
 */
export function measureSource(source, size, frameW, work) {
  const canvas = work || document.createElement('canvas');
  const w = frameW;
  const h = Math.max(1, Math.round((frameW * size.h) / size.w));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return { brightness: meanLuminance(data), blur_var: laplacianVariance(toGrey(data), w, h) };
}

/**
 * Sample a <video> every `interval_ms` and report {metrics, result}.
 * getTilt() -> {roll, pitch} | null;  getPeople() -> boolean (detector wires in later).
 */
export function createQualityMonitor({ video, thresholds, getTilt, getPeople = () => false, getFloorPct = () => null, onUpdate }) {
  let timer = null;
  const work = document.createElement('canvas');
  const tick = () => {
    if (video.readyState < 2 || video.paused || !video.videoWidth) return;
    const frame = measureSource(video, { w: video.videoWidth, h: video.videoHeight }, thresholds.blur_frame_px, work);
    const tilt = getTilt() || {};
    const metrics = {
      brightness: frame.brightness,
      blur_var: frame.blur_var,
      roll: typeof tilt.roll === 'number' ? tilt.roll : null,
      pitch: typeof tilt.pitch === 'number' ? tilt.pitch : null,
      floor_pct: getFloorPct(),
      people: getPeople(),
    };
    onUpdate({ metrics, result: evaluateQuality(metrics, thresholds) });
  };
  return {
    start() { if (!timer) timer = setInterval(tick, thresholds.interval_ms); },
    stop() { clearInterval(timer); timer = null; },
  };
}
