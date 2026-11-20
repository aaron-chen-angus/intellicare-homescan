/**
 * state.js - settings (localStorage) plus shots and analyses (IndexedDB, mirrored in memory
 * so screens can read synchronously). Photos never leave this device from here.
 */
import * as db from './db.js';

const KEY = 'intellicare.homeScan.settings';
const defaults = { lang: 'en', largeText: false, highContrast: false, exerciseZone: 'living', tutorialSeen: false };

let settings = { ...defaults };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}'));
} catch {
  // Corrupt or blocked storage: keep defaults.
}

export const getSettings = () => ({ ...settings });

export function setSettings(patch) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode or quota: the setting still applies for this visit.
  }
  applyVisualSettings();
}

export function applyVisualSettings() {
  const root = document.documentElement;
  root.classList.toggle('large-text', settings.largeText);
  root.classList.toggle('high-contrast', settings.highContrast);
}

// ---------- Shots and analyses ----------
const shots = new Map();
const analyses = new Map();
let persistent = true;

/** Load stored shots and analyses. Falls back to memory-only if IndexedDB is unavailable. */
/** Shot ids from the earlier position-specific protocol, mapped onto the three-corner protocol. */
const LEGACY_SHOT_IDS = {
  bedroom_door: 'bedroom_1', bedroom_bedside: 'bedroom_2', bedroom_corner: 'bedroom_3',
  kitchen_entrance: 'kitchen_1', kitchen_stove: 'kitchen_2', kitchen_sink: 'kitchen_3',
  dining_entrance: 'dining_1', dining_far: 'dining_2',
  living_entrance: 'living_1', living_sofa: 'living_2', living_exercise: 'living_3',
};

export async function initStore() {
  try {
    const stored = await db.getAll('shots');
    for (const s of stored) {
      const next = LEGACY_SHOT_IDS[s.shot_id];
      if (next && !stored.some((x) => x.shot_id === next)) {
        // Keep the photo, rename it, and let it be re-analysed under the new id.
        const old = s.shot_id;
        const moved = { ...s, shot_id: next, shot_type: next };
        await db.put('shots', moved);
        await db.del('shots', old);
        await db.del('analyses', old);
        shots.set(next, moved);
      } else if (!next) {
        shots.set(s.shot_id, s);
      }
    }
    for (const a of await db.getAll('analyses')) if (shots.has(a.shot_id)) analyses.set(a.shot_id, a);
  } catch {
    persistent = false;
  }
}

export const isPersistent = () => persistent;

/** Save or replace a shot (Shot schema + blob). Re-taking a shot discards its old analysis. */
export async function saveShot(shot) {
  shots.set(shot.shot_id, shot);
  analyses.delete(shot.shot_id);
  if (!persistent) return;
  try {
    await db.put('shots', shot);
    await db.del('analyses', shot.shot_id);
  } catch {
    persistent = false;
  }
}

export const getShot = (id) => shots.get(id) || null;

export function capturedIds(room) {
  const ids = new Set();
  for (const s of shots.values()) if (!room || s.room === room) ids.add(s.shot_id);
  return ids;
}

export async function saveAnalysis(analysis) {
  analyses.set(analysis.shot_id, analysis);
  if (persistent) {
    try { await db.put('analyses', analysis); } catch { persistent = false; }
  }
}

export const getAnalysis = (id) => analyses.get(id) || null;

/** All analyses of a room (for room totals). */
export const roomAnalyses = (room) => [...analyses.values()].filter((a) => a.room === room);

/** Delete every photo and analysis from this device. */
export async function clearAll() {
  shots.clear();
  analyses.clear();
  try {
    await db.clear('shots');
    await db.clear('analyses');
  } catch {
    // Memory already cleared; nothing else to do.
  }
}
