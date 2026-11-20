/**
 * ingest.js - one path for every photo (camera capture or gallery upload):
 * canvas -> JPEG (no EXIF/GPS) -> Shot record -> IndexedDB, assigned to its shot id.
 */
import { fileToCanvas, canvasToBlob } from './camera.js';
import { measureSource, evaluateQuality } from './quality.js';
import { saveShot } from './state.js';

/**
 * Save a canvas as the photo for a shot.
 * @param {{canvas:HTMLCanvasElement, room:string, shot:object, quality:object, source:'camera'|'upload'}} p
 */
export async function storeShot({ canvas, room, shot, quality, source, extra = {} }) {
  const blob = await canvasToBlob(canvas);
  const record = {
    ...extra,
    shot_id: shot.id,
    room,
    shot_type: shot.id,
    required: shot.required,
    orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
    captured_at: new Date().toISOString(),
    width: canvas.width,
    height: canvas.height,
    quality,
    source,
    inference_ms: null,
    image_ref: null,
    blob,
  };
  await saveShot(record);
  return record;
}

/** Decode an uploaded file (EXIF orientation applied), score its quality and store it. */
export async function ingestFile(file, room, shot, qualityThresholds) {
  if (!file.type.startsWith('image/')) throw new Error('Not an image file');
  const canvas = await fileToCanvas(file);
  const m = measureSource(canvas, { w: canvas.width, h: canvas.height }, qualityThresholds.blur_frame_px);
  const result = evaluateQuality({ ...m, roll: null, pitch: null, floor_pct: null, people: false }, qualityThresholds);
  const quality = { brightness: Math.round(m.brightness), blur_var: Math.round(m.blur_var), roll: null, pitch: null, floor_pct: null, override: !result.ready };
  return storeShot({ canvas, room, shot, quality, source: 'upload' });
}
