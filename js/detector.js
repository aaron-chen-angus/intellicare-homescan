/**
 * detector.js - Stage B object detection.
 *
 * Current backend: TF.js COCO-SSD (the spec's last-resort fallback), loaded on demand from a
 * pinned CDN with SRI. The YOLO-World / YOLO11n ONNX models (task 4) plug in ahead of it once
 * tools/export_models.ipynb has produced /models/*.onnx. Everything runs in the browser.
 */

const LIBS = [
  { src: 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js', integrity: 'sha384-vE8hbVJ4lezako5rlvE7bY0BVzWlFhZncPlckrqNwcUQpVtgbENTgZ8TBbnPjZre' },
  { src: 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js', integrity: 'sha384-7qLdgfEQyO9ZQi9ArRHigK+IBto4XPk468jAqc+fnsXaZIcMAhQeLwzggRK7aESl' },
];
export const MODEL_NAME = 'coco-ssd@2.2.3 (lite_mobilenet_v2)';

let loading = null;

function loadScript({ src, integrity }) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.integrity = integrity;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.append(s);
  });
}

/** Load libraries and model once. Resolves to the model. */
export function loadDetector() {
  if (!loading) {
    loading = (async () => {
      for (const lib of LIBS) await loadScript(lib);
      return window.cocoSsd.load({ base: 'lite_mobilenet_v2' });
    })().catch((e) => {
      loading = null; // allow a retry later
      throw e;
    });
  }
  return loading;
}

/**
 * Detect objects. Returns detections with normalised bboxes [x, y, w, h] (0..1) and the
 * vocabulary class (via config/coco_map.json); unmapped classes keep their COCO name.
 */
export async function detect(canvas, cocoMap, minScore = 0.3) {
  const model = await loadDetector();
  const t0 = performance.now();
  const raw = await model.detect(canvas, 40, minScore);
  const ms = Math.round(performance.now() - t0);
  const W = canvas.width;
  const H = canvas.height;
  const detections = raw.map((d, i) => ({
    id: `d${i}`,
    coco: d.class,
    cls: cocoMap[d.class] || d.class,
    mapped: Boolean(cocoMap[d.class]),
    conf: Math.round(d.score * 1000) / 1000,
    bbox: [d.bbox[0] / W, d.bbox[1] / H, d.bbox[2] / W, d.bbox[3] / H],
    verdict: null,
  }));
  return { detections, ms };
}
