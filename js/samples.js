/**
 * samples.js - "Load sample home": twelve test photos (three per room) from config/samples.json,
 * stored exactly like user photos so the full pipeline and the consolidated report can be tested
 * end to end. Photos with reference labels carry them on the shot record.
 */
import { fileToCanvas } from './camera.js';
import { storeShot } from './ingest.js';
import { findShot } from './shots.js';

/** Candidate URLs for a sample: local copy first, then the remote source. */
export function sampleUrls(cfg, s) {
  if (s.url) return [s.url];
  return [new URL(cfg.local_base + s.file, document.baseURI).href, cfg.remote_base + s.file];
}

async function fetchImage(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { mode: 'cors' });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.type.startsWith('image/')) return blob;
      }
    } catch {
      // try the next source
    }
  }
  throw new Error('download failed');
}

/**
 * Load all samples. A photo that cannot be downloaded is skipped; the call fails only if none load.
 * @returns {Promise<{stored:{room:string,shotId:string}[], failed:string[]}>}
 */
export async function loadSampleHome(ctx, onProgress = () => {}) {
  const cfg = await ctx.loadConfig('samples');
  const stored = [];
  const failed = [];
  let done = 0;
  for (const s of cfg.samples) {
    onProgress({ done, total: cfg.samples.length });
    const shot = findShot(ctx.config.guides, s.room, s.shot);
    try {
      if (!shot) throw new Error(`unknown shot ${s.shot}`);
      const canvas = await fileToCanvas(await fetchImage(sampleUrls(cfg, s)));
      await storeShot({
        canvas, room: s.room, shot, source: 'sample',
        quality: { brightness: null, blur_var: null, roll: null, pitch: null, floor_pct: null, override: false },
        extra: { reference: s.annotations || [], sample_credit: s.credit || null },
      });
      stored.push({ room: s.room, shotId: s.shot });
    } catch {
      failed.push(s.shot);
    }
    done++;
  }
  onProgress({ done, total: cfg.samples.length });
  if (!stored.length) throw new Error('No sample photos could be downloaded. Check the internet connection.');
  return { stored, failed };
}
