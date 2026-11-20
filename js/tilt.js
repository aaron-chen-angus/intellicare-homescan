/**
 * tilt.js - device tilt (roll / pitch) for the spirit level and quality gate.
 *
 * tiltFromEuler() is pure. startTilt()/requestTiltPermission() wrap the browser API and
 * are only touched when called, so this module can be imported in tests.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/**
 * Convert W3C deviceorientation angles to camera pitch and roll.
 * Uses the gravity vector in device coordinates, so it works in portrait and landscape.
 *  - pitch: elevation of the back camera. 0 = level, negative = looking down.
 *  - roll: rotation about the optical axis relative to the screen's "up". 0 = level.
 * Returns null roll when the camera looks almost straight up/down (roll undefined).
 *
 * @param {number} beta  degrees, front-back tilt
 * @param {number} gamma degrees, left-right tilt
 * @param {number} screenAngle screen.orientation.angle (0, 90, 180, 270)
 * @returns {{pitch:number, roll:number|null}|null}
 */
export function tiltFromEuler(beta, gamma, screenAngle = 0) {
  if (typeof beta !== 'number' || typeof gamma !== 'number' || Number.isNaN(beta) || Number.isNaN(gamma)) return null;
  const b = beta * RAD;
  const g = gamma * RAD;
  const a = screenAngle * RAD;
  // Gravity (pointing down) expressed in device axes.
  const gx = Math.cos(b) * Math.sin(g);
  const gy = -Math.sin(b);
  const gz = -Math.cos(b) * Math.cos(g);
  // The back camera looks along device -z; its world-vertical component equals gz,
  // so elevation = asin(gz) (0 level, -90 straight down).
  const pitch = Math.asin(Math.max(-1, Math.min(1, gz))) * DEG;
  // "Down" of the screen in device axes for this screen rotation.
  const dx = -Math.sin(a);
  const dy = -Math.cos(a);
  const mag = Math.hypot(gx, gy);
  if (mag < 0.1) return { pitch, roll: null };
  const roll = Math.atan2(gx * dy - gy * dx, gx * dx + gy * dy) * DEG;
  return { pitch, roll };
}

/** Current screen rotation in degrees. */
export function screenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  return typeof window.orientation === 'number' ? (window.orientation + 360) % 360 : 0;
}

/**
 * iOS 13+ requires an explicit permission request from a user gesture.
 * @returns {Promise<'granted'|'denied'|'unsupported'>}
 */
export async function requestTiltPermission() {
  if (typeof DeviceOrientationEvent === 'undefined') return 'unsupported';
  if (typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      return (await DeviceOrientationEvent.requestPermission()) === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  return 'granted';
}

/**
 * Listen to tilt changes. Values are low-pass filtered to calm sensor jitter.
 * onUpdate({pitch, roll}) is called only when the sensor delivers real numbers.
 * @returns {{stop:()=>void}}
 */
export function startTilt(onUpdate) {
  let smooth = null;
  const handler = (e) => {
    const raw = tiltFromEuler(e.beta, e.gamma, screenAngle());
    if (!raw) return; // desktop browsers fire one event with null angles
    smooth = smooth && raw.roll !== null && smooth.roll !== null
      ? { pitch: smooth.pitch + 0.3 * (raw.pitch - smooth.pitch), roll: smooth.roll + 0.3 * (raw.roll - smooth.roll) }
      : raw;
    onUpdate(smooth);
  };
  window.addEventListener('deviceorientation', handler);
  return { stop: () => window.removeEventListener('deviceorientation', handler) };
}
