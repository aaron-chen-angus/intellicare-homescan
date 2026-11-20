/**
 * camera-screen.js - live capture with the Stage A quality gate.
 *
 * States: starting -> live -> review (frozen frame) -> use (store + analyse) | retake | download.
 * Error state (denied / no camera / failure) offers Retry and gallery upload, so laptops
 * without a camera can still complete every shot. Rotation never restarts the stream.
 */
import { h, announce, hud, toast } from './components.js';
import { buildGhost } from './ghost.js';
import { t } from '../i18n.js';
import { findShot } from '../shots.js';
import { startCamera, stopCamera, captureFrame, canvasToBlob, downloadBlob } from '../camera.js';
import { createQualityMonitor, createReadyTracker } from '../quality.js';
import { startTilt } from '../tilt.js';
import { storeShot, ingestFile } from '../ingest.js';

const ICON = { ok: '\u2713', bad: '\u2715', unknown: '\u2026' };

export function cameraScreen(ctx, roomId, shotId) {
  const shot = findShot(ctx.config.guides, roomId, shotId);
  if (!shot) return null;
  const th = ctx.config.thresholds.quality;
  const shotTitle = t(shot.label);

  let mode = 'starting'; // starting | live | review | error | saving
  let streamActive = false;
  let tilt = { roll: null, pitch: null };
  let last = null;
  let armed = false;
  let holdProgress = 0;
  let captured = null;
  const tracker = createReadyTracker(th.hold_still_ms);

  // ---- elements ----
  const video = h('video', { playsinline: true, autoplay: true, muted: true, 'aria-label': shotTitle });
  video.muted = true;
  const bubble = h('span', { class: 'bubble' });
  const levelText = h('span', {}, '--');
  const level = h('div', { class: 'level', 'aria-hidden': 'true' }, h('div', { class: 'level-bar' }, h('span', { class: 'level-ok' }), bubble), levelText);
  const overlayMsg = h('div', { class: 'preview-msg', role: 'status' }, t('home_scanning.initializing_camera'));
  const preview = h('div', { class: 'preview' }, video, buildGhost(shot.ghost), level, overlayMsg);
  const lights = h('div', { class: 'lights', role: 'group', 'aria-label': 'READY' });
  const prompt = h('p', { class: 'prompt', role: 'status', 'aria-live': 'polite' });
  const meter = h('div', { class: 'meter', 'aria-hidden': 'true' }, h('span', { style: 'width:0%' }));
  const hint = h('p', { class: 'muted' }, '\u21BB ' + t('hs.cam.rotate'));
  const status = h('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const shutter = h('button', { class: 'btn shutter', 'aria-disabled': 'true', onclick: () => { if (armed) capture(false); } }, '\uD83D\uDCF7 ' + t('hs.cam.shutter'));
  const anyway = h('button', { class: 'btn soft', onclick: () => capture(true) }, t('hs.cam.take_anyway'));
  const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true', onchange: onFile });
  const upload = h('button', { class: 'btn soft', onclick: () => fileInput.click() }, '\uD83D\uDDBC ' + t('hs.cam.upload'));
  const retry = h('button', { class: 'btn', onclick: () => start() }, t('home_scanning.retry'));
  const useBtn = h('button', { class: 'btn mint big', onclick: usePhoto }, '\u2713 ' + t('hs.cam.use'));
  const retakeBtn = h('button', { class: 'btn soft', onclick: retake }, t('home_scanning.retake'));
  const downloadBtn = h('button', { class: 'btn soft', onclick: download }, '\u2B07 ' + t('home_scanning.download'));

  const liveControls = h('div', { class: 'controls-group' }, lights, prompt, meter, shutter, anyway, hint);
  const reviewControls = h('div', { class: 'controls-group' }, h('p', { class: 'muted' }, t('hs.cam.review')), useBtn, retakeBtn, downloadBtn);
  const errorControls = h('div', { class: 'controls-group' }, retry);
  const controls = h('aside', { class: 'controls' },
    h('div', {}, h('span', { class: 'eyebrow' }, t('hs.room.' + roomId)), h('p', { class: 'shot-title' }, shotTitle),
      shot.include ? h('p', { class: 'muted' }, t('hs.must_include') + ': ' + t(shot.include)) : null),
    liveControls, reviewControls, errorControls, upload, fileInput, status);

  const node = h('div', { class: 'stage' },
    hud(ctx, { back: '/room/' + roomId }),
    h('main', { id: 'main', class: 'camera-layout' },
      h('h1', { class: 'sr-only', tabindex: '-1' }, shotTitle),
      h('div', { class: 'preview-pane' }, preview), controls));

  // ---- rendering ----
  function render() {
    liveControls.hidden = !(mode === 'live' || mode === 'starting');
    reviewControls.hidden = mode !== 'review';
    errorControls.hidden = mode !== 'error';
    level.hidden = mode !== 'live' || tilt.roll === null;
    upload.hidden = mode === 'review' || mode === 'saving';
    overlayMsg.hidden = !(mode === 'starting' || mode === 'error' || mode === 'saving');
    useBtn.disabled = mode === 'saving';
    renderLights();
  }

  function renderLights() {
    const l = last ? last.result.lights : { light: 'unknown', steady: 'unknown', floor: 'unknown' };
    const mk = (name, state) => h('span', { class: 'chip ' + state }, h('span', { 'aria-hidden': 'true' }, ICON[state]), t('hs.cam.light_' + name));
    lights.replaceChildren(mk('light', l.light), mk('steady', l.steady), mk('floor', l.floor));
    shutter.classList.toggle('ready', armed);
    shutter.setAttribute('aria-disabled', armed ? 'false' : 'true');
    anyway.hidden = armed || mode !== 'live';
    meter.firstChild.style.width = `${Math.round(holdProgress * 100)}%`;
    const first = last && last.result.prompts[0];
    prompt.textContent = first ? t(first) : last && last.result.ready ? (armed ? t('hs.q.all_good') : t('hs.q.hold')) : '';
  }

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
      bubble.style.left = `${50 + Math.max(-1, Math.min(1, v.roll / 15)) * 50}%`;
      levelText.textContent = `${v.roll.toFixed(0)}\u00B0`;
      level.classList.toggle('level-bad', Math.abs(v.roll) > th.roll_max_deg);
      if (mode === 'live') level.hidden = false;
    }
  });
  const monitor = createQualityMonitor({
    video, thresholds: th, getTilt: () => tilt,
    onUpdate: (u) => {
      last = u;
      const tr = tracker.update(u.result.ready, performance.now());
      armed = tr.armed;
      holdProgress = tr.progress;
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
    monitor.stop();
    captured = {
      canvas,
      quality: {
        brightness: m.brightness != null ? Math.round(m.brightness) : null,
        blur_var: m.blur_var != null ? Math.round(m.blur_var) : null,
        roll: tilt.roll, pitch: tilt.pitch, floor_pct: null, override,
      },
    };
    canvas.className = 'frozen';
    preview.append(canvas);
    mode = 'review';
    render();
    announce(shotTitle + ': ' + t('hs.cam.photo_taken'));
  }

  async function onFile() {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    mode = 'saving';
    overlayMsg.textContent = t('hs.cam.saving');
    render();
    try {
      await ingestFile(file, roomId, shot, th);
      toast(t('hs.cam.shot_done'));
      ctx.go(`/analyze/${roomId}/${shot.id}`);
    } catch (e) {
      mode = streamActive ? 'live' : 'error';
      status.textContent = t('home_scanning.error_generic', { error: e.message });
      render();
    }
  }

  function retake() {
    if (captured) captured.canvas.remove();
    captured = null;
    tracker.reset();
    armed = false;
    holdProgress = 0;
    status.textContent = '';
    if (streamActive) {
      video.play();
      mode = 'live';
      monitor.start();
    } else mode = 'error';
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
    if (!captured || mode === 'saving') return;
    mode = 'saving';
    overlayMsg.textContent = t('hs.cam.saving');
    render();
    try {
      await storeShot({ canvas: captured.canvas, room: roomId, shot, quality: captured.quality, source: 'camera' });
      toast(t('hs.cam.shot_done'));
      ctx.go(`/analyze/${roomId}/${shot.id}`);
    } catch (e) {
      mode = 'review';
      status.textContent = t('home_scanning.error_generic', { error: e.message });
      render();
    }
  }

  render();
  setTimeout(start, 0);

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
