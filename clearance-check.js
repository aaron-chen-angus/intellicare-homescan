/* intelliCARE Home Scan clearance check. Include in any exercise app hosted under the same origin:
 *   <script src="https://<user>.github.io/intellicare-home-scan/clearance-check.js"></script>
 *   const c = homeScanClearance();   // { ok, status, expiresAt, reason }
 *   if (!c.ok) location.href = homeScanUrl(location.href);  // sends the user to scan, then back here
 */
function homeScanClearance() {
  let r = null;
  try { r = JSON.parse(localStorage.getItem('intellicare.homeScan.clearance') || 'null'); } catch (e) { /* unreadable = none */ }
  if (!r || !r.status) return { ok: false, status: 'NOT_ISSUED', reason: 'no-record' };
  const h = (s) => { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(16).padStart(8, '0'); };
  if (h([r.status, r.issuedAt, r.expiresAt, r.participantId, r.scanId].join('|')) !== r.hash) return { ok: false, status: r.status, reason: 'tampered' };
  if (new Date(r.expiresAt) <= new Date()) return { ok: false, status: r.status, reason: 'expired' };
  const ok = r.status === 'CLEARED' || r.status === 'CLEARED_WITH_ADVISORY';
  return { ok, status: r.status, expiresAt: r.expiresAt, scanId: r.scanId, reason: ok ? '' : 'blocked' };
}
/** Build the Home Scan URL that returns to `back` with ?clearance=<status>&scanId=<id>. */
function homeScanUrl(back, base) {
  return (base || new URL('./', document.currentScript ? document.currentScript.src : location.href).href) + '?returnTo=' + encodeURIComponent(back);
}
