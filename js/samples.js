/**
 * samples.js - "Load sample home": the four prototype room photos with their reference
 * hazard labels (config/samples.json), stored exactly like user photos so the full pipeline
 * and the consolidated report can be tested end to end.
 */
import { fileToCanvas } from './camera.js';
import { storeShot } from './ingest.js';
import { findShot } from './shots.js';

/** Fetch an image from the local copy first, then the remote prototype repository. */
async function fetchImage(base, remote, file) {
  for (const url of [new URL(base + file, document.baseURI).href, remote + file]) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.type.startsWith('image/') || blob.size > 1000) return blob;
      }
    } catch {
      // try the next source
    }
  }
  throw new Error(`Sample photo ${file} could not be downloaded`);
}

/**
 * Load all samples. Returns the list of {room, shotId} stored.
 * @param {object} ctx app context (config, loadConfig)
 * @param {(p:{done:number,total:number,file?:string})=>void} onProgress
 */
export async function loadSampleHome(ctx, onProgress = () => {}) {
  const cfg = await ctx.loadConfig('samples');
  const stored = [];
  let done = 0;
  for (const s of cfg.samples) {
    onProgress({ done, total: cfg.samples.length, file: s.file });
    const shot = findShot(ctx.config.guides, s.room, s.shot);
    if (!shot) continue;
    const blob = await fetchImage(cfg.local_base, cfg.remote_base, s.file);
    const canvas = await fileToCanvas(blob);
    await storeShot({
      canvas, room: s.room, shot, source: 'sample',
      quality: { brightness: null, blur_var: null, roll: null, pitch: null, floor_pct: null, override: false },
      extra: { reference: s.annotations, sample_file: s.file },
    });
    stored.push({ room: s.room, shotId: s.shot });
    done++;
  }
  onProgress({ done, total: cfg.samples.length });
  return stored;
}
