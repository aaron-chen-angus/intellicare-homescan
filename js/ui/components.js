/**
 * components.js - DOM helpers shared by all screens.
 * Elements are built with createElement/textContent (never innerHTML) so translated or
 * user-supplied strings cannot inject markup.
 */
import { character, wave } from './characters.js';
import { t } from '../i18n.js';

/** Hyperscript: h('button', {class:'btn', onclick: fn}, 'Text', childNode) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Typewriter text. Full text is available to screen readers immediately. */
export function typewriter(text, { speed = 16 } = {}) {
  const visible = h('span', { 'aria-hidden': 'true' });
  const box = h('span', { class: 'typewriter' }, h('span', { class: 'sr-only' }, text), visible);
  if (reducedMotion()) {
    visible.textContent = text;
    return box;
  }
  const caret = h('span', { class: 'caret' });
  let i = 0;
  const timer = setInterval(() => {
    if (!box.isConnected && i > 0) return clearInterval(timer);
    i += 2;
    visible.textContent = text.slice(0, i);
    visible.append(caret);
    if (i >= text.length) { clearInterval(timer); caret.remove(); visible.textContent = text; }
  }, speed);
  return box;
}

export function announce(message) {
  const live = document.getElementById('live');
  if (!live) return;
  live.textContent = '';
  requestAnimationFrame(() => { live.textContent = message; });
}

/** Short confirmation message at the bottom of the screen. */
export function toast(message, kind = 'ok') {
  let host = document.querySelector('.toast-host');
  if (!host) { host = h('div', { class: 'toast-host' }); document.body.append(host); }
  const el = h('div', { class: 'toast ' + kind, role: 'status' }, message);
  host.replaceChildren(el);
  setTimeout(() => el.remove(), 3200);
}

/** A cast member with a speech bubble. Tapping the character makes it wave. */
export function guide(kind, text, { name } = {}) {
  const who = name || t('hs.name.' + kind);
  const fig = character(kind, who);
  const figBtn = h('button', { style: 'background:none;border:0;padding:0;cursor:pointer', 'aria-label': who, onclick: () => wave(fig) }, fig);
  return h('div', { class: 'guide' }, figBtn,
    h('div', { class: 'bubble-say' }, h('span', { class: 'who' }, who), typewriter(text)));
}

/** Top HUD: back button, brand, progress meter, help and settings. */
export function hud(ctx, { back, progress } = {}) {
  return h('header', { class: 'hud', role: 'banner' },
    back
      ? h('button', { class: 'btn soft icon-btn', onclick: () => ctx.go(back), 'aria-label': t('hs.back') }, '\u2190')
      : null,
    h('div', { class: 'brand' }, h('span', {}, 'intelliCARE'), h('span', { class: 'muted' }, t('home_scanning.app_bar_title'))),
    progress !== undefined
      ? h('div', { class: 'meter', role: 'progressbar', 'aria-label': t('hs.hud.progress'), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': progress },
        h('span', { style: `width:${progress}%` }))
      : h('span', { class: 'spacer' }),
    h('button', { class: 'btn soft icon-btn', onclick: () => ctx.go('/help'), 'aria-label': t('hs.help') }, '?'),
    h('button', { class: 'btn soft icon-btn', onclick: () => ctx.go('/settings'), 'aria-label': t('hs.settings') }, '\u2699'));
}

export const disclaimer = () => h('p', { class: 'footer' }, t('hs.disclaimer'));

/** Band chip with icon + text (never colour alone). */
export function bandChip(band) {
  const icon = { LOW: '\u2713', MEDIUM: '!', HIGH: '!!', EXTREME: '\u26A0' }[band] || '?';
  return h('span', { class: 'chip ' + band }, h('span', { 'aria-hidden': 'true' }, icon), t('hs.band.' + band));
}
