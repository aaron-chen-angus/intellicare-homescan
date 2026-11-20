/**
 * shots.js - pure helpers over config/shot_guides.json.
 * A "shot" is one required or optional photo within a room. `label` and `include` are i18n keys.
 */

/** All shots of a room: required first, then optional (ids "<room>_opt<n>"). */
export function shotList(guides, room) {
  const g = guides.rooms[room];
  if (!g) return [];
  const required = g.required.map((s) => ({ ...s, required: true }));
  const optional = g.optional.map((key, i) => ({ id: `${room}_opt${i + 1}`, label: key, include: null, required: false, ghost: [], cam: null }));
  return [...required, ...optional];
}

/** Find a shot by id within a room, or null. */
export function findShot(guides, room, id) {
  return shotList(guides, room).find((s) => s.id === id) || null;
}

/** First required shot not yet captured, or null when all are done. */
export function nextRequired(guides, room, capturedIds) {
  return shotList(guides, room).find((s) => s.required && !capturedIds.has(s.id)) || null;
}

/** Required-shot progress for a room. */
export function roomProgress(guides, room, capturedIds) {
  const req = shotList(guides, room).filter((s) => s.required);
  return { done: req.filter((s) => capturedIds.has(s.id)).length, total: req.length };
}

/**
 * Assign several uploaded files to shots: first the required shots still missing (in order),
 * then optional shots still missing. Returns [{file, shotId}] (extra files are dropped).
 */
export function assignUploads(guides, room, capturedIds, files) {
  const open = shotList(guides, room).filter((s) => !capturedIds.has(s.id));
  const ordered = [...open.filter((s) => s.required), ...open.filter((s) => !s.required)];
  return Array.from(files).slice(0, ordered.length).map((file, i) => ({ file, shotId: ordered[i].id }));
}
