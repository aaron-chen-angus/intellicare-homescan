/**
 * app.js - boot, config loading and hash router.
 * Routes: / (title), /map, /room/<id>, /help, /settings.
 * Hash routing keeps deep links working on GitHub Pages without server rewrites.
 */
import { setLanguage, t } from './i18n.js';
import { getSettings, applyVisualSettings } from './state.js';
import { h, announce } from './ui/components.js';
import * as screens from './ui/screens.js';

const root = document.getElementById('app');
const config = {};

/** Fetch a config JSON relative to this module (works under /<repo>/ on GitHub Pages). */
async function loadConfig(name) {
  const res = await fetch(new URL(`../config/${name}.json`, import.meta.url));
  if (!res.ok) throw new Error(`Cannot load config/${name}.json (${res.status})`);
  return res.json();
}

const ctx = {
  config,
  go: (path) => { location.hash = '#' + path; },
  back: () => history.back(),
  rerender: () => render(),
};

/** Resolve the current hash to a screen and mount it. */
function render() {
  const path = location.hash.replace(/^#/, '') || '/';
  const [, first, arg] = path.split('/');
  let screen;
  if (path === '/') screen = screens.title(ctx);
  else if (first === 'map') screen = screens.map(ctx);
  else if (first === 'room' && config.app.rooms.includes(arg)) screen = screens.room(ctx, arg);
  else if (first === 'help') screen = screens.help(ctx);
  else if (first === 'settings') screen = screens.settings(ctx);
  else screen = screens.notFound(ctx);

  root.replaceChildren(screen.node);
  document.title = `${screen.title} | intelliCARE Home Scan`;
  announce(screen.title);
  const heading = screen.node.querySelector('h1');
  if (heading) heading.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

async function boot() {
  try {
    [config.app, config.guides, config.matrix] = await Promise.all([
      loadConfig('app'), loadConfig('shot_guides'), loadConfig('risk_matrix'),
    ]);
    applyVisualSettings();
    // The skip link moves focus instead of changing the hash (the hash is the router's).
    document.getElementById('skip').addEventListener('click', (e) => {
      e.preventDefault();
      const main = document.getElementById('main');
      if (main) { main.setAttribute('tabindex', '-1'); main.focus(); }
    });
    await setLanguage(getSettings().lang);
    window.addEventListener('hashchange', render);
    render();
  } catch (e) {
    // Config or locale could not load (offline first visit, bad deploy): show a retry.
    root.replaceChildren(h('main', { class: 'screen center' },
      h('h1', {}, 'intelliCARE Home Scan'),
      h('p', {}, t('home_scanning.error_generic', { error: e.message })),
      h('button', { class: 'btn', onclick: () => location.reload() }, t('home_scanning.retry'))));
  }
}

boot();
