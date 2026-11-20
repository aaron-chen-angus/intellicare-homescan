/**
 * state.js - app settings store (persisted in localStorage).
 * Session data (photos, hazards, corrections) moves to IndexedDB in the data-layer task.
 */
const KEY = 'intellicare.homeScan.settings';

const defaults = {
  lang: 'en',
  largeText: false,
  highContrast: false,
  crt: false,
  exerciseZone: 'living',
};

let settings = { ...defaults };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(KEY) || '{}'));
} catch {
  // Corrupt or blocked storage: keep defaults.
}

export const getSettings = () => ({ ...settings });

/** Update one or more settings, persist them and apply the visual ones to <html>. */
export function setSettings(patch) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode or quota: the setting still applies for this visit.
  }
  applyVisualSettings();
}

/** Reflect display preferences as classes on <html> (CSS reads these). */
export function applyVisualSettings() {
  const root = document.documentElement;
  root.classList.toggle('large-text', settings.largeText);
  root.classList.toggle('high-contrast', settings.highContrast);
  root.classList.toggle('crt', settings.crt);
}
