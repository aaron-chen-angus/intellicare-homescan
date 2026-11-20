/**
 * i18n.js - tiny JSON-locale translator.
 * Keys are flat strings ("home_scanning.retake", "hs.room.kitchen"). Named arguments
 * use {name} placeholders, matching the Flutter easy_localization convention.
 * English is always loaded as the fallback.
 */
const dictionaries = {};
let current = 'en';

async function load(lang) {
  if (dictionaries[lang]) return;
  const res = await fetch(new URL(`../locales/${lang}.json`, import.meta.url));
  if (!res.ok) throw new Error(`Cannot load locale ${lang}: ${res.status}`);
  dictionaries[lang] = await res.json();
}

/** Load English plus the requested language and make it current. */
export async function setLanguage(lang) {
  await load('en');
  if (lang !== 'en') {
    try {
      await load(lang);
    } catch {
      lang = 'en'; // unreachable locale file: stay in English rather than break the UI
    }
  }
  current = lang;
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;
  return current;
}

export const getLanguage = () => current;

/**
 * Translate a key. Missing keys fall back to English, then to the key itself,
 * so a gap in a locale file is visible but never breaks a screen.
 */
export function t(key, args = {}) {
  const raw = (dictionaries[current] && dictionaries[current][key]) ?? (dictionaries.en && dictionaries.en[key]) ?? key;
  return raw.replace(/\{(\w+)\}/g, (m, name) => (args[name] !== undefined ? String(args[name]) : m));
}
