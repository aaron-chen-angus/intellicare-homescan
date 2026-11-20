/**
 * camera.js - getUserMedia, frame capture, gallery upload and download.
 *
 * Preserves the Flutter module's behaviours: orientation is baked into captured pixels,
 * the preview pauses on capture, Retake resumes it, results can be downloaded, and camera
 * errors surface with a retry. Nothing here uploads anywhere.
 */

/** Camera failure with a machine-readable reason: 'denied' | 'none' | 'error'. */
export class CameraError extends Error {
  constructor(reason, cause) {
    super(cause && cause.message ? cause.message : reason);
    this.reason = reason;
    this.cause = cause;
  }
}

/**
 * Open the rear camera into <video>. Resolves when playback starts.
 * Rotating the device does not require calling this again: the stream keeps running and
 * the video element reports new dimensions through its `resize` event.
 */
export async function startCamera(video) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new CameraError('none');
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (e) {
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw new CameraError('denied', e);
    if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') throw new CameraError('none', e);
    throw new CameraError('error', e);
  }
  video.muted = true; // required for autoplay on iOS
  video.setAttribute('playsinline', '');
  video.srcObject = stream;
  try {
    await video.play();
  } catch (e) {
    stopCamera(video);
    throw new CameraError('error', e);
  }
  return stream;
}

/** Stop all tracks and detach the stream. Safe to call repeatedly. */
export function stopCamera(video) {
  const stream = video.srcObject;
  if (stream && stream.getTracks) stream.getTracks().forEach((tr) => tr.stop());
  video.srcObject = null;
}

/** Scale (w,h) so the longer side is at most maxSide. */
export function fitSize(w, h, maxSide) {
  const s = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}

/** Copy the current video frame to a canvas (already upright: browsers rotate camera frames). */
export function captureFrame(video, maxSide = 1920) {
  const { w, h } = fitSize(video.videoWidth, video.videoHeight, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(video, 0, 0, w, h);
  return canvas;
}

/**
 * Decode an uploaded image file into a canvas with EXIF orientation applied
 * (the equivalent of the Flutter module's bakeOrientation).
 */
export async function fileToCanvas(file, maxSide = 1920) {
  let source;
  let width;
  let height;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    width = source.width;
    height = source.height;
  } catch {
    // Older Safari: fall back to an <img>, which applies EXIF rotation itself.
    const url = URL.createObjectURL(file);
    try {
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Unreadable image'));
        img.src = url;
      });
      width = source.naturalWidth;
      height = source.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  const { w, h } = fitSize(width, height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(source, 0, 0, w, h);
  if (source.close) source.close();
  return canvas;
}

/** JPEG blob from a canvas. Canvas export carries no EXIF/GPS metadata. */
export function canvasToBlob(canvas, quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', quality);
  });
}

/** Trigger a browser download of a blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
