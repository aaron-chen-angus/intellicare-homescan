/**
 * app.js - boot, config loading and hash router.
 * Routes: /  /map  /room/<id>  /camera/<room>/<shot>  /analyze/<room>/<shot>  /help  /settings
 * Hash routing keeps deep links working on GitHub Pages without server rewrites.
 */
import { setLanguage, t } from './i18n.js';
import { getSettings, applyVisualSettings, initStore } from './state.js';
import { h, announce } from './ui/components.js';
import * as screens from './ui/screens.js';
import { cameraScreen } from './ui/camera-screen.js';
import { analysisScreen } from './ui/analysis-screen.js';
import { reportScreen } from './ui/report-screen.js';

const root = document.getElementById('app');
const config = {};
const configCache = {};
let cleanup = null; // teardown hook of the mounted screen

/** Fetch a config JSON relative to this module (works under /<repo>/ on GitHub Pages). Cached. */
function loadConfig(name) {
  if (!configCache[name]) {
    configCache[name] = fetch(new URL(`../config/${name}.json`, import.meta.url)).then((res) => {
      if (!res.ok) throw new Error(`Cannot load config/${name}.json (${res.status})`);
      return res.json();
    });
    configCache[name].catch(() => { delete configCache[name]; });
  }
  return configCache[name];
}

const ctx = {
  config,
  loadConfig,
  go: (path) => {
    if (location.hash === '#' + path) render();
    else location.hash = '#' + path;
  },
  back: () => history.back(),
  rerender: () => render(),
};

function resolve(path) {
  const parts = path.split('/');
  const [, first, a, b] = parts;
  const rooms = config.app.rooms;
  if (path === '/' || path === '') return screens.title(ctx);
  if (first === 'map') return screens.map(ctx);
  if (first === 'room' && rooms.includes(a)) return screens.room(ctx, a);
  if (first === 'camera' && rooms.includes(a)) return cameraScreen(ctx, a, b);
  if (first === 'analyze' && rooms.includes(a)) return analysisScreen(ctx, a, b) || screens.room(ctx, a);
  if (first === 'report') return reportScreen(ctx);
  if (first === 'help') return screens.help(ctx);
  if (first === 'settings') return screens.settings(ctx);
  return null;
}

function render() {
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  const screen = resolve(path) || screens.notFound(ctx);
  if (cleanup) cleanup(); // release camera/sensors of the screen we are leaving
  cleanup = screen.cleanup || null;
  root.replaceChildren(screen.node);
  document.title = `${screen.title} | intelliCARE Home Scan`;
  announce(screen.title);
  const heading = screen.node.querySelector('h1');
  if (heading) heading.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function boot() {
  try {
    [config.app, config.guides, config.matrix, config.thresholds] = await Promise.all([
      loadConfig('app'), loadConfig('shot_guides'), loadConfig('risk_matrix'), loadConfig('thresholds'),
    ]);
    applyVisualSettings();
    document.getElementById('skip').addEventListener('click', (e) => {
      e.preventDefault();
      const main = document.getElementById('main');
      if (main) { main.setAttribute('tabindex', '-1'); main.focus(); }
    });
    await Promise.all([setLanguage(getSettings().lang), initStore()]);
    window.addEventListener('hashchange', render);
    render();
  } catch (e) {
    root.replaceChildren(h('main', { class: 'stage center' },
      h('h1', {}, 'intelliCARE Home Scan'),
      h('p', {}, t('home_scanning.error_generic', { error: e.message })),
      h('button', { class: 'btn', onclick: () => location.reload() }, t('home_scanning.retry'))));
  }
}

boot();
