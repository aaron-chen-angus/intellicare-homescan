# intelliCARE Home Scan

Browser-only home hazard scan with a Pre-Exercise Safety Clearance. Plain HTML/CSS/JS, no build step.
Spec: `.kiro/specs/intellicare-home-scan/` (requirements, design, tasks). Steering: `.kiro/steering/`.

## What works today
- Illustrated house map, room mission boards with "where to stand" floor plans, and an 8-step photo tutorial.
- Take photos with the camera (quality gate: light, steadiness, tilt) **or upload from the gallery**, per shot
  or several at once per room. Laptops without a camera use upload.
- Each saved photo is checked on the device: object detection (TF.js COCO-SSD for now), lighting and
  glare analysis, and 74 data-driven hazard rules scored on the 5x5 risk matrix. You confirm or reject findings.
- Photos and results are stored in this browser (IndexedDB) and never uploaded. Settings > Delete all photos.

## Run locally
ES modules need http, not `file://`:
```
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```
Then open http://localhost:8080/ . (`python -m http.server 8080` also works if Python is installed.)

## Tests
- Unit tests: open `/tests/tests.html`, or `powershell -ExecutionPolicy Bypass -File tests/run-headless.ps1`.
- End-to-end (photo saved to shot, analysis, persistence): serve the app, then open `/tests/e2e.html`.

## Deploy to GitHub Pages
Push to a repo named `intellicare-home-scan`, then Settings > Pages > Deploy from branch > `main` / root.
All paths are relative, so it works under `https://<user>.github.io/intellicare-home-scan/`.
The first analysis downloads the detection model (about 5 MB) from jsDelivr / Google storage; later runs reuse the browser cache.

## Use the clearance in another intelliCARE app
Include `clearance-check.js` and call `homeScanClearance()`; it returns `{ ok, status, expiresAt, reason }`.

*Screening aid, not a substitute for an occupational therapist's home assessment.*
