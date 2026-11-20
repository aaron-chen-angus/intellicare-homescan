# KIRO MASTER PROMPT — intelliCARE Home Scan

> Paste everything below the line into Kiro as a new **Spec** request. Kiro should produce `requirements.md` (EARS format), `design.md` and `tasks.md`, plus the steering files in Section 14.

---

## 0. ROLE & OUTCOME

You are a senior full-stack engineer, computer-vision engineer and occupational-safety specialist. Build **intelliCARE Home Scan**: a browser-only web app that lets seniors (or caregivers) photograph four rooms of their home, runs on-device computer-vision object detection to find hazards, scores every hazard on an industry-standard risk matrix, and issues a **Pre-Exercise Home Safety Clearance** that is **compulsory before any intelliCARE exercise session**. The UI is a retro 8-bit console game. It deploys as static files on **GitHub Pages**.

Generate a full Kiro spec first (requirements → design → tasks), then implement task by task. Requirements must use EARS syntax (`WHEN <trigger> THE SYSTEM SHALL <response>`; `IF <condition> THEN THE SYSTEM SHALL …`; `WHILE <state> …`). Every requirement must have numbered acceptance criteria that map to tasks.

---

## 1. CONTEXT (what exists today)

- **Current Flutter module** (`HomeScanningHome.dart`, `HomeScanningCamera.dart`): an intro page → camera page that takes one photo with `camera` package, bakes EXIF orientation, POSTs it to a backend (`ProgramApiService.homeScanningInference`) which returns an annotated image, then shows Download / Retake. It has no room categories, no risk scoring, no data capture, no gamification, and depends on a server.
- **Prototype** `github.com/aaron-chen-angus/fallsafe-home-scan`: single `index.html`, portrait-only, walks through 4 HDB room photos (`images/`) with **manually placed** hazard markers stored in a `ROOMS` object (x/y %). No automated detection.
- **The new app replaces both**: inference moves on-device (no backend required), adds room categories, photo guidance, risk matrix, data collection, clearance gating and gamification. Reuse the prototype's 4 room photos + `ROOMS` hazard markers as the **Training Level** (Section 9).

Preserve from the Flutter version: orientation correction, pause preview on capture, Retake, Download annotated result, retry on camera error, i18n keys (`home_scanning.*`).

---

## 2. HARD TECHNICAL CONSTRAINTS

1. **No build step, no npm install, no server.** Plain HTML/CSS/JS with native ES modules. Third-party libraries loaded from CDN with **pinned versions** (jsDelivr/unpkg) and SRI hashes where available.
2. Must run from GitHub Pages (`https://<user>.github.io/intellicare-home-scan/`). HTTPS is available, so `getUserMedia` works.
3. Model files live in `/models/` in the repo (each < 50 MB; GitHub hard limit 100 MB). Cache them with a **Service Worker** (Cache Storage) so second launch works offline. App is an installable **PWA** (`manifest.webmanifest`).
4. All inference runs **in the browser** (WebGPU → WASM fallback). No image leaves the device unless the user explicitly consents (Section 11).
5. Target devices: iPad (primary, deployed in community/nursing settings), Android tablets/phones, iPhone, desktop Chrome/Edge/Safari. Must hit ≥ 3 FPS live preview on a mid-range 2022 iPad and complete a single-photo full analysis in < 6 s.
6. Any Python needed (model export) is delivered as a **Google Colab notebook** (`/tools/export_models.ipynb`) — the developer cannot install software locally.

---

## 3. COMPUTER VISION PIPELINE (best-practice, multi-stage)

Design a layered pipeline. Each stage is a separate JS module with a clear interface, timed and logged.

### Stage A — Capture quality gate (before shutter is enabled)
Run on a downscaled frame every 250 ms:
- **Brightness**: mean luminance (Rec.709). Reject < 60/255 or > 230/255 → prompt "Turn on lights / open curtains" or "Avoid pointing at window".
- **Blur**: variance of Laplacian on a 320 px greyscale frame; threshold configurable (start 100). Reject below.
- **Tilt / level**: `DeviceOrientationEvent` (request permission on iOS). Show an on-screen spirit level; warn if roll > 8° or pitch outside −25°…+10° (camera should look slightly down to capture floor).
- **Floor coverage**: once depth/segmentation is loaded, estimate % of frame that is floor; require ≥ 35 %.
- **People in frame**: if YOLO detects `person`, ask the user to clear the room (privacy + occlusion).
- Show a 3-light "READY" indicator (Light / Steady / Floor). Shutter glows only when all green; allow an override "Take anyway" that flags `quality_override=true` in data.

### Stage B — Object detection (primary)
- **Primary model: YOLO-World v2 (small) exported to ONNX with a baked custom hazard vocabulary** (open-vocabulary detection lets us detect home-hazard classes that COCO lacks — rugs, cables, power strips, grab bars, stairs, mats). Run with **ONNX Runtime Web** (`onnxruntime-web`, WebGPU EP, WASM fallback). Input 640×640 letterbox, NMS in JS (IoU 0.45), per-class confidence thresholds stored in `config/thresholds.json`.
- **Secondary/fallback model: YOLO11n (COCO-80) ONNX** — fast, used for live preview overlay and as fallback if YOLO-World fails to load. If ONNX fails entirely, fall back to TF.js COCO-SSD from CDN.
- The Colab notebook must: install `ultralytics`, load `yolov8s-worldv2.pt`, call `set_classes()` with the vocabulary below, export ONNX (opset 12+, `simplify=True`, FP16 where supported), also export `yolo11n.onnx`, and write `models/labels.json`. Note the **AGPL-3.0 licence** of Ultralytics in README (fine for an open-source research repo).

**Hazard vocabulary (baked into YOLO-World; extend in `config/vocabulary.json`):**
```
Trip/Slip: rug, floor mat, bath mat, doormat, loose carpet, electrical cable, extension cord, power cord on floor,
           shoes on floor, slippers, clothes on floor, bag on floor, box on floor, toy, newspaper, clutter pile,
           pet bowl, pet, door threshold, step, stairs, raised platform, wet floor, puddle
Furniture: chair, stool, step stool, ladder, low coffee table, sofa, bed, dining table, side table, cabinet,
           wardrobe, shelf, bookshelf, chair with wheels, rocking chair, glass table, sharp-cornered table
Support/Aids: grab bar, handrail, walking frame, walking stick, wheelchair, night light, light switch, lamp
Electrical/Fire: power strip, multi-plug adaptor, overloaded socket, wall socket, heater, fan, kettle, stove,
           gas stove, induction cooker, microwave, oven, toaster, rice cooker, iron, candle, joss stick holder,
           smoke detector, gas cylinder
Impact/Falling objects: heavy item on high shelf, vase, mirror, picture frame, television, potted plant,
           knife, scissors, glass bottle, open cabinet door, open drawer
Entanglement/Strangulation: curtain cord, blind cord, hanging cable, laundry pole, clothes hanger rack, hose
Lighting: dark area, window glare
Kitchen/Wet: sink, refrigerator, dish rack, cleaning chemical bottle, bucket, mop
```

### Stage C — Scene understanding (contextual signals)
- **Monocular depth** with **Depth Anything V2 Small** (quantised, via **Transformers.js** from CDN) → detect floor-level discontinuities (thresholds/steps), estimate whether an object is **on the floor** (bbox bottom touches floor plane) vs elevated, estimate **clear walkway width** in the lower third of the frame, and estimate **object height above floor** (for high shelves / bed height, relative only — label as estimate).
- **Floor segmentation**: derive a floor mask from depth gradient + lower-frame colour clustering (or a lightweight segmentation model if Kiro finds a suitable ONNX one ≤ 30 MB). Used for clutter density and walkway analysis.
- **Lighting analysis**: luminance histogram + 4×4 grid; flag regions < 40/255 as "dark zone"; flag specular highlights on floor (> 245 clustered blobs within floor mask) as possible **glare / wet / polished floor**.
- **Clutter index**: count and area of small objects intersecting floor mask ÷ floor area.
- **Proximity rules**: bbox IoU/distance between pairs (e.g. cable ↔ walkway, curtain ↔ stove/heater, power strip ↔ sink, rug ↔ doorway).

### Stage D — Hazard rules engine (deterministic, explainable)
Convert detections + context into **hazard instances** using a JSON rule file `config/hazard_rules.json`. Each rule: `id, room[], trigger (classes + spatial conditions), hazard_type, mechanism, base_severity, base_likelihood, controls[], evidence_text, reference`. Example rules (implement ≥ 60 across the 4 rooms):
- `TRIP-RUG-01`: rug/mat on floor AND (in walkway OR within 1 m of doorway OR curled edge low-confidence) → Trip, S3 L4.
- `TRIP-CABLE-01`: cable/extension cord crossing floor mask in walkway → Trip + Electrical, S3 L4.
- `ELEC-STRIP-01`: power strip/multi-plug with ≥ 3 plugged devices OR daisy-chained → Electrical/Fire, S4 L3.
- `ELEC-WET-01`: power strip / socket within 1 m of sink → Electrical, S5 L2.
- `FIRE-CURTAIN-01`: curtain/towel/cloth within 0.5 m of stove/heater/candle/joss holder → Fire/Burn, S5 L2.
- `IMPACT-SHELF-01`: heavy item / TV / mirror on high shelf or unsecured tall furniture → Impact, S4 L2.
- `ENTANGLE-CORD-01`: looped blind/curtain cord reachable from floor or bed → Entanglement/Strangulation, S5 L2.
- `FALL-STOOL-01`: step stool / ladder / chair used as step in kitchen → Fall from height, S4 L3.
- `FALL-BED-01` (bedroom): no night light / lamp detected near bed AND dark zone on bed-to-door path → Fall (night-time), S4 L4.
- `FALL-SUPPORT-01`: no grab bar / handrail detected near bed, sofa or kitchen work area for a user who reports mobility aid → Fall, S4 L3.
- `LIGHT-DARK-01`: ≥ 25 % of floor mask is dark zone → Fall, S3 L4.
- `CLUTTER-01`: clutter index above threshold → Trip, S3 L4.
- `WALKWAY-01`: estimated clear path < 0.9 m (or < 1.2 m if walking frame/wheelchair) → Fall/Impact, S3 L4.
- `GLARE-01`: floor glare/possible wet surface → Slip, S3 L3.
- `SHARP-01`: glass/sharp-cornered table in walkway → Impact laceration on fall, S3 L3.
- `PET-01`: pet or pet bowl in walkway → Trip, S3 L3.
Rules are data, not code, so clinicians can tune them without touching JS.

### Stage E — Human-in-the-loop verification (mandatory)
CV cannot see everything. After each room:
1. Show annotated photo; user taps each detection to **Confirm / Not a hazard / Wrong label (pick correct)**. Store corrections (feeds dataset, Section 10).
2. User can **draw a box** to add a missed hazard and choose its class.
3. Room **checklist** for items not reliably visible (Section 5). Answers feed the same risk engine.
Final room score = confirmed CV hazards + manual additions + checklist hazards.

---

## 4. ROOM CAPTURE PROTOCOL & PHOTO GUIDES

Rooms (fixed categories): **Bedroom, Kitchen, Dining Room, Living Room**. User selects the room first (big pixel-art room cards). The Living Room is also the default **Exercise Zone** (user may reassign the Exercise Zone to any room).

**Universal rules (shown as an animated 8-bit tutorial before first scan, re-viewable via "?"):**
1. Turn on all main lights; open curtains; avoid shooting directly into a bright window.
2. Clear people and pets out of the frame.
3. **Do not tidy first** — photograph the room as it normally is (we are assessing real risk).
4. Hold the device at **chest height (~1.2–1.5 m)**, tilted slightly down so **the floor fills at least one-third of the frame**.
5. Use **landscape orientation** for room shots (wider field of view); portrait allowed for tall items (shelves, wardrobes).
6. Hold still for 2 seconds until all READY lights are green.
7. No flash (causes glare and false wet-floor detections).
8. Take **all required shots**; optional detail shots earn bonus XP.

**Per-room shot list** (each shot has a ghost-outline overlay diagram showing framing):

| Room | Required shots | Must include in frame | Optional detail shots |
|---|---|---|---|
| **Bedroom** | 1. From doorway looking in. 2. From bedside looking back toward the door (the night-time exit path). 3. Opposite corner. | Whole bed + both sides of floor, bed-to-door path, light switch, bedside table, any rugs, wardrobe base, cables near bed | Bed height side-on; bedside lamp/night light; wardrobe top shelves; curtain/blind cords |
| **Kitchen** | 1. From entrance. 2. Facing the stove/cooking area. 3. Facing the sink/wet area. | Full floor, stove + surroundings (curtains, towels), sink + nearby sockets, upper cabinets, any stool/ladder | Gas cylinder/hose; power points on counter; floor mat by sink; cleaning chemicals storage |
| **Dining Room** | 1. From entrance. 2. From the far side of the table. | Table, all chairs (and spacing), floor under/around table, walkway to kitchen, overhead light, any cables | Chair stability (side view); glass table edges; floor transition to kitchen |
| **Living Room** | 1. From entrance. 2. From the sofa looking out. 3. **Exercise Zone**: stand back to capture a ≥ 2 m × 2 m clear floor area. | Sofa, coffee table, rugs, TV area and cables, walkways, windows, fan/heater | Power strips behind TV; tall shelves; floor around exercise zone; door thresholds/balcony step |

Exercise Zone validation: depth-based estimate of free floor ≥ 2 m × 2 m (relative estimate) with no trip hazards inside; otherwise prompt to move furniture and re-shoot.

---

## 5. ROOM CHECKLISTS (non-visual items)

Big Yes / No / Not sure pixel buttons, read aloud via Web Speech API. Draw items from established home-fall-safety instruments (CDC STEADI "Check for Safety", HSSAT, Westmead Home Safety Assessment, HOME FAST) and Singapore HDB EASE (Enhancement for Active Seniors) features. Minimum items:

- **All rooms**: Can you reach a light switch at the entrance? Are floors non-slippery when wet? Any loose floor tiles or raised thresholds? Do you use a walking aid at home? Is there a working phone/alarm reachable from the floor?
- **Bedroom**: Night light on path to toilet? Lamp reachable from bed? Bed height lets feet rest flat on floor with knees at ~90°? Grab bar/support near bed? Anything stored under bed that sticks out?
- **Kitchen**: Frequently used items between waist and shoulder height? Do you climb on chairs/stools? Smoke/heat detector present? Gas leak detector/cylinder hose checked? Anti-slip mat by sink?
- **Dining**: Chairs stable with armrests? Table stable when leaned on? Floor transitions level?
- **Living**: Cables run along walls (not across floor)? Rugs taped/anti-slip backed? Sofa height easy to stand from? Windows with grilles/locks?

**User profile modifiers** (asked once, editable): age band, falls in past 12 months (0 / 1 / ≥2), fear of falling, walking aid, vision impairment, lives alone, takes ≥ 4 medications (yes/no only — no names), cognitive concerns (caregiver-reported). These adjust **likelihood** (Section 6), not severity.

---

## 6. RISK ASSESSMENT MATRIX (industry standard)

Base the method on **ISO 31000:2018** (risk management process) and **ISO 45001** hazard identification, with an explicit mapping to the **Singapore WSH Council Code of Practice on Risk Management** 3×3 matrix. Process: **Hazard Identification → Risk Evaluation (S × L) → Risk Control (Hierarchy of Controls) → Residual Risk → Review**. Store the full matrix in `config/risk_matrix.json`.

### 6.1 Hazard taxonomy
`FALL_SAME_LEVEL` (trip/slip), `FALL_FROM_HEIGHT` (stool, ladder, bed), `IMPACT_STRUCK_BY` (falling objects, tipping furniture), `IMPACT_STRUCK_AGAINST` (sharp corners, glass), `ENTANGLEMENT_STRANGULATION`, `ELECTRICAL`, `FIRE_BURN_SCALD`, `CHEMICAL`, `LIGHTING_VISIBILITY`, `ERGONOMIC_REACH` (overreaching), `EMERGENCY_ACCESS` (blocked exits, no alarm).

### 6.2 Severity (S) — consequence to an older adult
| S | Level | Descriptor |
|---|---|---|
| 1 | Negligible | No injury / discomfort only |
| 2 | Minor | Bruise, minor cut; first aid at home |
| 3 | Moderate | Sprain, laceration needing clinic visit; temporary loss of mobility |
| 4 | Major | Fracture (wrist, hip), head injury, burns; hospital admission; lasting loss of independence |
| 5 | Catastrophic | Life-threatening injury, long lie, death; permanent disability |

### 6.3 Likelihood (L)
| L | Level | Descriptor |
|---|---|---|
| 1 | Rare | Could occur only in exceptional circumstances |
| 2 | Unlikely | Could occur at some time (≈ yearly) |
| 3 | Possible | Might occur (≈ monthly exposure with some chance) |
| 4 | Likely | Will probably occur (daily exposure, e.g. on main walkway) |
| 5 | Almost certain | Expected to occur (constant exposure + vulnerable user) |

**Likelihood modifiers** (from profile + CV confidence; cap at 5, floor at 1):
+1 if ≥ 1 fall in past 12 months; +1 if walking aid OR vision impairment (max +1 combined); +1 if hazard is in bed-to-toilet path or Exercise Zone; −1 if a verified control is present (e.g. anti-slip backing confirmed). CV confidence < 0.4 and unconfirmed → hazard shown as "Possible — please check", excluded from score until confirmed.

### 6.4 Risk Rating = S × L (5×5)
| | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| **S5** | 5 M | 10 H | 15 H | 20 E | 25 E |
| **S4** | 4 L | 8 M | 12 H | 16 H | 20 E |
| **S3** | 3 L | 6 M | 9 M | 12 H | 15 H |
| **S2** | 2 L | 4 L | 6 M | 8 M | 10 H |
| **S1** | 1 L | 2 L | 3 L | 4 L | 5 M |

Bands: **Low 1–4 (green)** acceptable, monitor · **Medium 5–9 (yellow)** fix within 2 weeks · **High 10–16 (orange)** fix before exercising in that room · **Extreme 20–25 (red)** stop; fix immediately; notify caregiver.
Provide a toggle to display the **WSH 3×3 view** (Severity Minor/Moderate/Major × Likelihood Remote/Occasional/Frequent; Low 1–2, Medium 3–4, High 6–9) with a documented mapping (S1–2→1, S3→2, S4–5→3; L1–2→1, L3→2, L4–5→3).

### 6.5 Controls & residual risk
Every rule lists controls ordered by the **Hierarchy of Controls**: Elimination → Substitution → Engineering → Administrative → PPE/personal aids. E.g. rug: remove rug (E) → replace with low-pile anti-slip rug (S) → tape edges/anti-slip underlay (Eng) → keep walkway clear habit (Admin) → non-slip footwear (PPE). Each control has an expected reduction (ΔL or ΔS) so the app shows **residual risk** after the user commits to a fix.

### 6.6 Aggregation
- Room Risk = highest hazard rating in room (worst-case principle) + count by band.
- **Home Safety Score (0–100)** for gamification only = 100 − weighted sum (Extreme 25, High 10, Medium 4, Low 1), floor 0. Never let the score hide an Extreme hazard.
- Output a **Risk Register** table: ID, room, photo thumbnail, hazard, type, mechanism, S, L, rating, band, controls, owner, due date, status, residual rating.

---

## 7. PRE-EXERCISE CLEARANCE GATE (compulsory)

- **Clearance states**: `CLEARED` (green), `CLEARED_WITH_ADVISORY` (yellow — Medium hazards only), `BLOCKED` (any Extreme anywhere, or any High in the Exercise Zone or bed-to-toilet path).
- Clearance requires all 4 rooms scanned with all required shots and checklists complete.
- Validity: **7 days** (configurable) or until the user reports a change (moved home, new furniture, recent fall) → forced rescan.
- BLOCKED shows the exact fixes needed; user fixes, then **re-shoots only the affected shot** to verify (CV must no longer detect the hazard, or user + caregiver attests with a photo).
- Expose clearance to other intelliCARE apps: write `localStorage['intellicare.homeScan.clearance']` = `{status, issuedAt, expiresAt, participantId, scanId, hash}` (all `*.github.io/<repo>` apps under the same account share an origin, so the Lab apps — Sit-to-Stand, TUG, FSST, SIP, Arm Curl — can read it). Also provide a `?returnTo=<url>` parameter so an exercise app can redirect here and receive `?clearance=<status>&scanId=…` back. Provide a 15-line JS snippet `clearance-check.js` other apps can include.
- Always display disclaimer: *screening aid, not a substitute for an occupational therapist's home assessment.*

---

## 8. UI / UX — 8-BIT RETRO CONSOLE STYLE

**Aesthetic**: original 8-bit, 1980s home-console-era look (NES-like palette limits, pixel fonts, chiptune). **Do not use any Nintendo characters, logos, sprites, sounds or trademarks** — create an **original mascot** (e.g. "Safi", a pixel-art helper robot/hard-hat inspector) and original sprites.
- Font: "Press Start 2P" (Google Fonts) for headings/buttons; a readable pixel-ish font (e.g. "VT323" or system sans at ≥ 18 px) for body text — readability for seniors overrides retro purity.
- Palette: 16-colour limited palette defined as CSS variables; risk colours must still pass **WCAG AA contrast** and be paired with icons/text (never colour alone).
- Components: pixel-border dialog boxes with typewriter text, chunky 3D press buttons (min **56×56 px** touch targets), HP-heart bar, coin counter, XP bar, CRT scanline overlay (toggle off; respects `prefers-reduced-motion`).
- Detection overlay: pixel-corner bounding boxes colour-coded by band, with blinking "!" sprite on Extreme/High; tap to open hazard card.
- Screens: Title ("PRESS START") → Profile/Consent → World Map (house floor plan with 4 room "levels" + locked "EXERCISE" door) → Room briefing (shot list) → Camera → Analysis ("SCANNING…" pixel progress) → Results/verify → Checklist → Room cleared fanfare → Home Report → Clearance.
- Audio: WebAudio-synthesised chiptune SFX (no copyrighted samples); mute toggle; optional voice narration (Web Speech API) in the selected language.
- **Responsive & fluid**: CSS Grid + container queries + `clamp()` typography + `dvh/svh` units + `env(safe-area-inset-*)`. Layout rules:
  - **Portrait**: camera preview top (16:9 letterboxed), controls bottom bar.
  - **Landscape**: preview left/centre, controls in a right-side rail; the shutter stays under the thumb.
  - Listen to `screen.orientation` / `matchMedia('(orientation: …)')`; re-layout without restarting the camera stream; correctly map video frames to canvas on rotation.
  - Works 320 px phone → 13" iPad → 27" desktop. No horizontal scroll.
- **Accessibility**: large text mode, high-contrast mode, keyboard navigation, ARIA live regions for detection announcements, focus rings, all images with alt text.
- **i18n**: English, 简体中文, Bahasa Melayu, தமிழ். Use JSON locale files keyed to match the Flutter `home_scanning.*` keys where they exist.

---

## 9. GAMIFICATION (purposeful, not trivialising)

Rewards must reinforce **accurate scanning and real fixes**, never reward ignoring hazards.
- **Levels**: each room is a level; completing all required shots + checklist = "LEVEL CLEAR". Kitchen is the "boss level" (most hazard types).
- **XP**: +10 per guideline-compliant photo (all READY lights green), +5 per optional detail shot, +3 per detection verified (confirm/reject), +15 per missed hazard the user adds, +50 per hazard **fixed and verified by re-shoot**.
- **Coins & HP hearts**: home starts at 5 hearts; Extreme = −2, High = −1; hearts restored by fixes. Coins unlock cosmetic mascot outfits and room themes only.
- **Badges** (pixel medals): *First Scan*, *Eagle Eye* (added a missed hazard), *Cable Tamer*, *Rug Wrangler*, *Night Light Knight*, *Kitchen Boss Defeated*, *Clean Sweep* (all rooms ≤ Medium), *Safety Streak* (weekly re-scan 4 weeks running), *Exercise Unlocked*.
- **Training Level — "Hazard Hunter"**: a spot-the-hazard mini-game using the prototype's 4 HDB room photos and `ROOMS` markers; timed taps, combo multiplier, teaches what hazards look like before real scanning. Unlocked from the World Map; optional but grants a starting badge.
- **Quests**: the Risk Register becomes a quest log ("QUEST: Tame the TV cables — Reward 50 XP"). Due dates from Section 6.4 bands.
- **Optional leaderboard** (cohort mode, e.g. Active Ageing Centre group): nickname only, ranks by XP from verified fixes — off by default.
- Celebration animations obey reduced-motion setting.

---

## 10. DATA COLLECTION (research-grade)

### 10.1 Consent & identity
- First-run consent screen (English + 中文 at minimum) with separate tick boxes: (a) use the app, (b) store scan results for research, (c) store photos, (d) allow photos for AI model training. Consent version + timestamp recorded.
- **Participant ID** (pseudonymous, e.g. `HS-XXXX`) entered or generated; optional site/cohort code. **No names, NRIC, addresses or phone numbers collected.**
- Before any photo is stored, run on-device **face detection (MediaPipe Face Detector, CDN)** and blur faces; strip EXIF/GPS from saved JPEGs.

### 10.2 Storage
- Local-first: **IndexedDB** for sessions, photos (if consented) and corrections; works offline; queue syncs when online.
- Optional sync to **Google Sheets via Google Apps Script web app** (`doPost`), POST as `text/plain` JSON to avoid CORS preflight; endpoint URL set in `config/app.json`. Provide the full `Code.gs` with sheet setup (tabs: `Sessions`, `Hazards`, `Detections`, `Checklist`, `Events`), plus optional Google Drive folder upload for consented photos (base64 → Drive).
- Exports from the Admin screen: **CSV** (per table), **JSON** (full session), **PDF report** (jsPDF from CDN: cover, clearance status, per-room annotated photos, Risk Register, controls, disclaimer), **annotated JPEGs**, and a **YOLO-format training dataset ZIP** (JSZip from CDN: `images/`, `labels/*.txt` with normalised `class cx cy w h`, `data.yaml`) built from user-verified boxes — closes the loop for fine-tuning a custom model later in Colab.

### 10.3 Data schema (implement exactly; version it)
```
Session { schema_version, session_id, participant_id, cohort_code, consent{version, flags, ts},
          profile{age_band, falls_12m, fear_of_falling, walking_aid, vision_impaired, lives_alone,
                  polypharmacy, cognitive_concern}, device{ua, platform, screen, orientation, webgpu},
          model_versions{detector, fallback, depth, rules, matrix}, started_at, completed_at,
          home_safety_score, clearance_status, clearance_expires_at, xp, badges[] }
Shot { shot_id, session_id, room, shot_type, orientation, captured_at, quality{brightness, blur_var,
       roll, pitch, floor_pct, override}, inference_ms, image_ref|null }
Detection { det_id, shot_id, class, confidence, bbox_norm[x,y,w,h], on_floor, in_walkway, depth_rel,
            user_verdict(confirmed|rejected|relabelled|added), relabel_class }
Hazard { hazard_id, session_id, room, source(cv|manual|checklist), rule_id, hazard_type, mechanism,
         S, L_base, L_modifiers[], L_final, rating, band, controls[], committed_control, due_date,
         status(open|fixed|verified|accepted), residual_rating, verified_shot_id }
ChecklistAnswer { session_id, room, item_id, answer(yes|no|unsure), ts }
Event { session_id, ts, type, payload }   // analytics: screen views, retakes, overrides, time-on-task
```

### 10.4 Admin / Researcher mode
PIN-protected screen: view all local sessions, filter by cohort, export, clear data, tune thresholds (writes to localStorage overrides of `config/*.json`), view model performance stats (precision proxy = confirmed ÷ (confirmed + rejected) per class).

---

## 11. PRIVACY, SAFETY, ETHICS
- Default: nothing leaves the device. Photos stored only with explicit consent (c). Clear "Delete all my data" button.
- Align with Singapore **PDPA** principles (consent, purpose limitation, retention, protection) and IRB requirements; record consent version.
- Detection is advisory; every flagged hazard is explained (rule + evidence) and user-verifiable. Show the disclaimer on the report and clearance screen.
- Extreme hazards and "fall in past 12 months" → recommend referral to an OT / community home-modification service (e.g. HDB EASE) — wording configurable.

---

## 12. PROJECT STRUCTURE
```
/index.html
/manifest.webmanifest
/sw.js
/css/  tokens.css  layout.css  retro.css  components.css
/js/
  app.js            (router/state machine)
  state.js          (store + IndexedDB persistence)
  camera.js         (getUserMedia, capture, orientation, upload-from-gallery fallback)
  quality.js        (Stage A)
  detector.js       (ORT Web, YOLO-World + YOLO11n, letterbox, NMS, fallback COCO-SSD)
  depth.js          (Transformers.js Depth Anything V2)
  scene.js          (floor mask, lighting, clutter, walkway, proximity)
  rules.js          (Stage D engine)
  risk.js           (matrix, modifiers, aggregation, clearance)
  verify.js         (Stage E UI: confirm/reject/relabel/draw box)
  checklist.js  gamification.js  audio.js  i18n.js  report.js  export.js  sync.js  privacy.js
  ui/ (screens + components)
/config/ app.json  vocabulary.json  thresholds.json  hazard_rules.json  risk_matrix.json
         checklists.json  shot_guides.json  badges.json
/locales/ en.json zh.json ms.json ta.json
/models/ yolo_world_hazard.onnx  yolo11n.onnx  labels.json  README.md
/assets/ sprites/ (original pixel art)  shot-guides/ (ghost overlays)  training/ (prototype room photos)
/tools/ export_models.ipynb  apps_script/Code.gs
/tests/ tests.html (in-browser test runner, no npm)  fixtures/ (sample room images + expected hazards)
/clearance-check.js
/README.md
```

---

## 13. QUALITY, TESTING & ACCEPTANCE
- **Unit tests** in `tests/tests.html` (tiny assertion harness, runs in browser): risk matrix (all 25 cells → correct band), likelihood modifiers & caps, WSH 3×3 mapping, every rule in `hazard_rules.json` fires on a synthetic detection fixture and not on a negative fixture, NMS, letterbox math, clearance logic (all state transitions), schema validation, CSV/YOLO export format.
- **Fixture images**: include the 4 prototype room photos with expected hazard lists; report per-class hit/miss in the test page.
- **Performance budget**: first load (excluding models) < 300 KB JS/CSS; models lazy-loaded with progress bar; Lighthouse PWA + Accessibility ≥ 90.
- **Device matrix**: iPad Safari (portrait + landscape), Android Chrome phone, desktop Chrome; camera permission denied path; offline second launch; low-light rejection; rotation mid-capture.
- Graceful degradation: no WebGPU → WASM; no camera → upload photos; model load failure → fallback chain then manual-only mode with checklist (clearance still possible via manual + checklist, flagged `cv_unavailable`).

---

## 14. STEERING FILES TO CREATE
- `.kiro/steering/product.md` — purpose, users (seniors 60+, caregivers, researchers/clinicians), clearance gate rule, disclaimer.
- `.kiro/steering/tech.md` — no-build/no-npm constraint, CDN pinning, ORT Web + Transformers.js, GitHub Pages, offline PWA, performance budgets.
- `.kiro/steering/structure.md` — folder layout above, config-as-data rule (rules/matrix/checklists never hard-coded), naming conventions.
- `.kiro/steering/design-system.md` — 8-bit palette tokens, fonts, component specs, accessibility minimums, original-IP-only rule.

---

## 15. IMPLEMENTATION ORDER (tasks.md must follow)
1. Scaffold, steering, config JSONs, i18n, retro design system, responsive shell (portrait/landscape).
2. Risk matrix + rules engine + clearance logic **with tests first**.
3. Camera module + quality gate + shot guides + orientation handling + gallery upload fallback.
4. Colab export notebook; detector module (YOLO11n first, then YOLO-World), overlay rendering.
5. Depth + scene analysis; wire rules engine.
6. Verification UI + checklists + profile modifiers.
7. Gamification layer, Training Level from prototype, audio.
8. Data layer: consent, IndexedDB, face blur, exports (CSV/JSON/PDF/YOLO ZIP), Apps Script sync.
9. Clearance gate + `clearance-check.js` + returnTo flow.
10. PWA/service worker, performance, accessibility pass, device testing, README (deploy steps, model export, Apps Script setup, embedding, troubleshooting).

Deliver production-quality code, fully commented, with no placeholders or TODOs left in shipped files.
