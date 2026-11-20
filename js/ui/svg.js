/**
 * svg.js - turn a static SVG markup string (authored in this repo, never user input)
 * into a live SVG element. Gradient/clip ids are made unique per instance so the same
 * illustration can appear several times on one page.
 */
let uid = 0;

export function svgFromString(markup, { label, className } = {}) {
  const id = `s${++uid}`;
  const unique = markup.replace(/\$\$/g, id); // "$$" inside markup = instance id
  const doc = new DOMParser().parseFromString(unique, 'image/svg+xml');
  const svg = document.importNode(doc.documentElement, true);
  if (className) svg.setAttribute('class', className);
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  return svg;
}
