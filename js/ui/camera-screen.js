/**
 * camera-screen.js - live capture with the Stage A quality gate.
 *
 * States: starting -> live -> review (frozen frame) -> [use | retake | download].
 * An error state (denied / no camera / failure) offers Retry and gallery upload.
 * Portrait: preview on top, controls below. Landscape: preview left, control rail right
 * (layout.css). Rotating the device never restarts the stream.
 */
import { h, announce } from './components.js';
import { buildGhost } from './ghost.js';
import { t } from '../i18n.js';
import { saveShot, capturedIds } from '../state.js';
import { findShot, nextRequired } from '../shots.js';
import { startCamera, stopCamera, captureFrame, fileToCanvas, canvasToBlob, downloadBlob } from '../camera.js';
import { createQualityMonitor, createReadyTracker, evaluateQuality, measureSource } from '../quality.js';
import { startTilt } from '../tilt.js';

const LIGHT_ICON = { ok: 'OK', bad: 'X', unknown: '?' };
const LIGHT_CLASS = { ok: 'LOW', bad: 'EXTREME', unknown: 'MEDIUM' };

/** @returns {{title:string, node:HTMLElement, cleanup:()=>void}|null} null when the shot is unknown */
export function cameraScreen(ctx, roomId, shotId) {
  const guides = ctx.config.guides;
  const shot = findShot(guides, roomId, shotId);
  if (!shot) return null;
  const th = ctx.config.thresholds.quality;
  const shotTitle = shot.label ? t(shot.label) : shot.text;

  // ---- state ----
  let mode = 'starting'; // starting | live | review | error
  let streamActive = false;
  let tilt = { roll: null, pitch: null };
  let last = null; // { metrics, result }
  let armed = false;
  let captured = null; // { canvas, source, quality }
  const tracker = createReadyTracker(th.hold_still_ms);

  // ---- elements ----
  const video = h('video', { playsinline: true, autoplay: true, 'aria-label': t('home_scanning.app_bar_title') });
  video.muted = true;
  const ghost = buildGhost(shot.ghost);
  const bubble = h('span', { class: 'bubble' });
  const levelText = h('span', { class: 'level-text' }, '--');
  const level = h('div', { class: 'level', 'aria-hidden': 'true' }, h('div', { class: 'level-bar' }, h('span', { class: 'level-ok' }), bubble), levelText);
  const overlayMsg = h('div', { class: 'preview-msg', role: 'status' });
  const preview = h('div', { class: 'preview', style: '--ar:1.7778' }, video, ghost, level, overlayMsg);
  const lights = h('div', { class: 'lights', role: 'group', 'aria-label': 'READY' });
  const prompt = h('p', { class: 'prompt', role: 'status', 'aria-live': 'polite' });
  const hint = h('p', { class: 'muted' }, t('hs.cam.rotate'));
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const progress = h('div', { class: 'bar', 'aria-hidden': 'true' }, h('span', { style: 'width:0%' }));
  const shutter = h('button', { class: 'btn shutter', 'aria-disabled': 'true', onclick: () => { if (armed) capture(false); } }, t('hs.cam.shutter'));
  const anyway = h('button', { class: 'btn ghost', onclick: () => capture(true) }, t('hs.cam.take_anyway'));
  const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', tabindex: '-1', onchange: onFile });
  const upload = h('button', { class: 'btn secondary', onclick: () => fileInput.click() }, t('hs.cam.upload'));
  const retry = h('button', { class: 'btn', onclick: () => start() }, t('home_scanning.retry'));
  const useBtn = h('button', { class: 'btn', onclick: usePhoto }, t('hs.cam.use'));
  const retakeBtn = h('button', { class: 'btn ghost', onclick: retake }, t('home_scanning.retake'));
  const downloadBtn = h('button', { class: 'btn secondary', onclick: download }, t('home_scanning.download'));
  const liveControls = h('div', { class: 'controls-group' }, lights, prompt, progress, shutter, anyway, hint);
  const reviewControls = h('div', { class: 'controls-group' }, useBtn, retakeBtn, downloadBtn);
  const errorControls = h('div', { class: 'controls-group' }, retry);
  const controls = h('div', { class: 'controls' },
    h('p', { class: 'pixel shot-title' }, shotTitle),
    liveControls, reviewControls, errorControls, upload, fileInput, status);

  const back = h('button', { class: 'btn ghost', onclick: () => ctx.go('/room/' + roomId), 'aria-label': t('hs.back') }, '< ' + t('hs.back'));
  const node = h('div', { class: 'screen' },
    h('header', { class: 'topbar' }, back, h('h1', { tabindex: '-1' }, t('hs.room.' + roomId))),
    h('main', { id: 'main', class: 'camera-layout' }, h('div', { class: 'preview-pane' }, preview), controls));

  // ---- rendering ----
  function show(el, on) { el.hidden = !on; }

  function render() {
    show(liveControls, mode === 'live' || mode === 'starting');
    show(reviewControls, mode === 'review');
    show(errorControls, mode === 'error');
    show(level, mode === 'live');
    show(upload, mode !== 'review');
    overlayMsg.hidden = mode !== 'starting' && mode !== 'error';
    renderLights();
  }

  function renderLights() {
    const l = last ? last.result.lights : { light: 'unknown', steady: 'unknown', floor: 'unknown' };
    const mk = (name, state) => h('span', { class: 'chip ' + LIGHT_CLASS[state], 'data-state': state },
      h('span', { 'aria-hidden': 'true' }, LIGHT_ICON[state]), t('hs.cam.light_' + name));
    lights.replaceChildren(mk('light', l.light), mk('steady', l.steady), mk('floor', l.floor));
    shutter.classList.toggle('ready', armed);
    shutter.setAttribute('aria-disabled', armed ? 'false' : 'true');
    anyway.hidden = armed || mode !== 'live';
    progress.firstChild.style.width = `${Math.round((tracker.progress || 0) * 100)}%`;
    const first = last && last.result.prompts[0];
    prompt.textContent = first ? t(first) : last && last.result.ready ? (armed ? t('hs.q.all_good') : t('hs.q.hold')) : '';
  }

  /** Match the preview box to the stream's real aspect ratio (changes on rotation). */
  function syncAspect() {
    if (video.videoWidth && video.videoHeight) preview.style.setProperty('--ar', (video.videoWidth / video.videoHeight).toFixed(4));
  }
  const portraitQuery = window.matchMedia('(orientation: portrait)');
  const onOrientation = () => { hint.hidden = !portraitQuery.matches; syncAspect(); };
  portraitQuery.addEventListener('change', onOrientation);
  video.addEventListener('resize', syncAspect);
  video.addEventListener('loadedmetadata', syncAspect);
  onOrientation();

  // ---- sensors and monitor ----
  const tiltListener = startTilt((v) => {
    tilt = v;
    if (typeof v.roll === 'number') {
      const pct = Math.max(-1, Math.min(1, v.roll / 15)) * 50;
      bubble.style.left = `${50 + pct}%`;
      levelText.textContent = `${v.roll.toFixed(0)}\u00B0`;
      level.classList.toggle('level-bad', Math.abs(v.roll) > th.roll_max_deg);
    }
  });
  const monitor = createQualityMonitor({
    video,
    thresholds: th,
    getTilt: () => tilt,
    onUpdate: (u) => {
      last = u;
      const tr = tracker.update(u.result.ready, performance.now());
      armed = tr.armed;
      tracker.progress = tr.progress;
      renderLights();
    },
  });

  // ---- actions ----
  async function start() {
    mode = 'starting';
    overlayMsg.textContent = t('home_scanning.initializing_camera');
    render();
    try {
      await startCamera(video);
      streamActive = true;
      mode = 'live';
      syncAspect();
      monitor.start();
    } catch (e) {
      streamActive = false;
      mode = 'error';
      overlayMsg.textContent = e.reason === 'denied' ? t('hs.cam.denied')
        : e.reason === 'none' ? t('hs.cam.none')
        : t('home_scanning.camera_init_failed', { error: e.message });
      announce(overlayMsg.textContent);
    }
    render();
  }

  function capture(override) {
    if (mode !== 'live' || !video.videoWidth) return;
    const m = last ? last.metrics : {};
    const canvas = captureFrame(video);
    video.pause(); // freeze the preview while reviewing
    captured = {
      canvas,
      source: 'camera',
      quality: { brightness: m.brightness ?? null, blur_var: m.blur_var ?? null, roll: tilt.roll, pitch: tilt.pitch, floor_pct: m.floor_pct ?? null, override },
    };
    enterReview();
  }

  async function onFile() {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const canvas = await fileToCanvas(file);
      const m = measureSource(canvas, { w: canvas.width, h: canvas.height }, th.blur_frame_px);
      const result = evaluateQuality({ ...m, roll: null, pitch: null, floor_pct: null, people: false }, th);
      if (streamActive) video.pause();
      monitor.stop();
      captured = {
        canvas, source: 'upload',
        quality: { brightness: m.brightness, blur_var: m.blur_var, roll: null, pitch: null, floor_pct: null, override: !result.ready },
      };
      enterReview();
    } catch (e) {
      status.textContent = t('home_scanning.error_generic', { error: e.message });
    }
  }

  function enterReview() {
    mode = 'review';
    monitor.stop();
    captured.canvas.className = 'frozen';
    preview.append(captured.canvas);
    status.textContent = '';
    render();
    announce(shotTitle + ': ' + t('hs.cam.photo_taken'));
  }

  function retake() {
    if (captured) captured.canvas.remove();
    captured = null;
    tracker.reset();
    armed = false;
    tracker.progress = 0;
    status.textContent = '';
    if (streamActive) {
      video.play();
      mode = 'live';
      monitor.start();
    } else {
      mode = 'error';
    }
    render();
  }

  async function download() {
    try {
      downloadBlob(await canvasToBlob(captured.canvas), `${shot.id}.jpg`);
      status.textContent = t('home_scanning.image_saved');
    } catch (e) {
      status.textContent = t('home_scanning.download_error', { error: e.message });
    }
  }

  async function usePhoto() {
    try {
      const { canvas, quality } = captured;
      const blob = await canvasToBlob(canvas);
      saveShot({
        shot_id: shot.id,
        room: roomId,
        shot_type: shot.id,
        required: shot.required,
        orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
        captured_at: new Date().toISOString(),
        quality,
        source: captured.source,
        inference_ms: null,
        image_ref: null,
        blob,
      });
      announce(t('hs.cam.shot_done'));
      const next = shot.required ? nextRequired(guides, roomId, capturedIds(roomId)) : null;
      ctx.go(next ? `/camera/${roomId}/${next.id}` : '/room/' + roomId);
    } catch (e) {
      status.textContent = t('home_scanning.error_generic', { error: e.message });
    }
  }

  setTimeout(start, 0); // after the node is mounted

  return {
    title: shotTitle,
    node,
    cleanup() {
      monitor.stop();
      tiltListener.stop();
      portraitQuery.removeEventListener('change', onOrientation);
      stopCamera(video);
    },
  };
}
