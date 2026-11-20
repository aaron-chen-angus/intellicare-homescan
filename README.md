# intelliCARE Home Scan

Browser-only home hazard scan with a Pre-Exercise Safety Clearance. Plain HTML/CSS/JS, no build step.
Spec: `.kiro/specs/intellicare-home-scan/` (requirements, design, tasks). Steering: `.kiro/steering/`.

## Status
Tasks 1 and 2 are done (see `tasks.md`): design system, responsive shell, i18n (EN/中文/BM/தமிழ்),
risk matrix, 70+ data-driven hazard rules, rules engine, clearance logic, `clearance-check.js`.
Camera, detector, depth, verification, gamification, data layer and PWA caching are the next tasks.

## Run locally
ES modules need http, not `file://`. Use any static server, for example `python -m http.server 8080`, then open http://localhost:8080/.

## Tests
Open `/tests/tests.html` in a browser, or run `powershell -ExecutionPolicy Bypass -File tests/run-headless.ps1` (uses installed Chrome/Edge).
With Node installed: `node tests/run-node.mjs`.

## Deploy to GitHub Pages
Push to a repo named `intellicare-home-scan`, then Settings > Pages > Deploy from branch > `main` / root.
All paths are relative, so it works under `https://<user>.github.io/intellicare-home-scan/`.

## Use the clearance in another intelliCARE app
Include `clearance-check.js` and call `homeScanClearance()`; it returns `{ ok, status, expiresAt, reason }`.

*Screening aid, not a substitute for an occupational therapist's home assessment.*
