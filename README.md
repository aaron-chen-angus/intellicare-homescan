# intelliCARE Home Scan

**Technical, Scientific and Clinical Manual**
Version 0.4 (pre-validation research prototype) · Browser-only progressive web application

> **Intended use.** intelliCARE Home Scan is a *screening aid* that helps older adults, caregivers and allied health or social care professionals identify and prioritise environmental hazards in the home before a home-based exercise programme. It is **not** a medical device. It does not diagnose any condition, including hoarding disorder, and it does not replace a home assessment by an occupational therapist (OT).

---

## Contents

1. [Purpose and scope](#1-purpose-and-scope)
2. [Clinical and scientific rationale](#2-clinical-and-scientific-rationale)
3. [Cluttered and hoarded homes](#3-cluttered-and-hoarded-homes)
4. [Assessment instruments that informed the content](#4-assessment-instruments-that-informed-the-content)
5. [Photo-capture protocol](#5-photo-capture-protocol)
6. [Risk assessment methodology](#6-risk-assessment-methodology)
7. [Computer-vision and analysis pipeline](#7-computer-vision-and-analysis-pipeline)
8. [Hazard rules engine](#8-hazard-rules-engine)
9. [Home Safety Report and analytics](#9-home-safety-report-and-analytics)
10. [Pre-exercise clearance gate](#10-pre-exercise-clearance-gate)
11. [Privacy, ethics and safety](#11-privacy-ethics-and-safety)
12. [Sample photographs for testing](#12-sample-photographs-for-testing)
13. [Software architecture](#13-software-architecture)
14. [Running, testing and deploying](#14-running-testing-and-deploying)
15. [Validation status, limitations and roadmap](#15-validation-status-limitations-and-roadmap)
16. [References](#16-references)

---

## 1. Purpose and scope

### 1.1 Problem

Falls are the leading cause of injury-related harm in older adults. Most occur at home and many involve an environmental factor such as a trip hazard, poor lighting or an unsafe transfer (Lord et al., 2006; World Health Organization [WHO], 2021). Home-based exercise is among the most effective fall-prevention interventions (Sherrington et al., 2019). Exercising at home, though, adds a new activity to an environment that may itself be hazardous. The intelliCARE programme therefore requires a **Pre-Exercise Home Safety Clearance** before any home exercise session.

### 1.2 What the application does

1. Guides the user to photograph four rooms (Bedroom, Kitchen, Dining Room, Living Room), three photos per room.
2. Checks photo quality as each photo is taken: lighting, blur and device tilt.
3. Analyses every photo **on the device**: object detection, lighting and glare analysis, a clutter estimate, and a deterministic, explainable rules engine of 75 rules.
4. Rates each hazard on a 5 × 5 Severity × Likelihood matrix (ISO 31000:2018), mapped to the Singapore Workplace Safety and Health (WSH) Council 3 × 3 matrix. Each hazard comes with controls ordered by the Hierarchy of Controls.
5. Lets the user confirm or reject each finding (human-in-the-loop).
6. Produces a consolidated **Home Safety Report**: a risk heat map, hazards by room and type, room profiles, priorities, a risk register, data-quality metrics, and CSV, JSON and PDF export.
7. Computes a clearance status (Cleared / Cleared with advice / Blocked) that other intelliCARE exercise applications can read.

### 1.3 Intended users

| User | Typical use |
|---|---|
| Older adults (60+) | Self-scan with large-text, multilingual, voice-friendly guidance |
| Family caregivers | Scan on behalf of the person; follow the fix list |
| Allied health and social care professionals (OT, physiotherapist, nurse, social worker, case manager) | Remote pre-screening, triage before a home visit, case documentation, progress monitoring |
| Researchers | Structured, exportable data; reference-label validation; configurable rules |

---

## 2. Clinical and scientific rationale

### 2.1 Home hazards and falls

Environmental factors contribute to falls through interactions between the person's capability and the demands of the environment. Trip and slip hazards, poor lighting, unsafe furniture heights and lack of support rails are the most commonly cited factors (Lord et al., 2006; Tinetti et al., 1988). A history of falling is one of the strongest single predictors of future falls (Tinetti et al., 1988). The app therefore raises likelihood for people who report a recent fall (Section 6.4).

### 2.2 Effectiveness of hazard assessment and modification

The evidence is strongest when hazard reduction is **targeted at people at higher risk** and delivered with professional input:

- A meta-analysis of randomised trials found environmental interventions reduced falls by about 21%, with larger effects in high-risk groups and with OT-delivered interventions (Clemson et al., 2008).
- The 2023 Cochrane review concluded that home fall-hazard reduction reduces the rate of falls in people at higher risk (for example, a recent fall or hospitalisation). It found little or no effect in unselected populations (Clemson et al., 2023).
- Randomised trials show benefit from OT home visits for assessment and modification (Cumming et al., 1999; Pighills et al., 2011). Home modification also supports participation in daily activities (Stark et al., 2017).
- The World Guidelines for Falls Prevention recommend home hazard assessment and intervention, delivered by a trained clinician, for older people at high risk (Montero-Odasso et al., 2022). Multifactorial and exercise interventions are the core of community falls prevention (Gillespie et al., 2012; Sherrington et al., 2019).

**Design implications.** The app is positioned as a **screening and triage** tool, not a stand-alone intervention:

- Profile risk factors raise likelihood.
- Extreme hazards, or a reported fall in the past 12 months, trigger a recommendation for an OT or a home-modification service such as HDB EASE (Housing & Development Board, n.d.).

### 2.3 Remote and photograph-based home assessment

Remote assessment is feasible and can identify many hazards without a home visit:

- In a telerehabilitation study, remote assessment identified most problems found on site (Sanford & Butterfield, 2005).
- A photography-based home assessment protocol, in which OTs rated photos taken by confidants, reached a sensitivity of 78.9% and a specificity of 84.9% for potential hazards, at about half the cost of a visit. Validity was weaker for **pathways** and **slippery surfaces** (Daniel et al., 2013).

These findings shape the protocol:

- **Multiple viewpoints** per room (three corners), so pathways are seen from different angles.
- A **floor-coverage** requirement: the floor should fill at least the lower third of the frame.
- **Glare detection**, as a cue for slippery or wet floors.
- **Human confirmation** of every automated finding.

### 2.4 The long lie and emergency access

Many very old people who fall cannot get up unaided, and lying on the floor for a long time is associated with serious harm (Fleming & Brayne, 2008). The rules and checklists therefore include emergency-access items, such as a phone or alarm reachable from the floor, and assign the highest severity (S5) to consequences that include a long lie.

### 2.5 Regional context

Falls research and prevention practice in Southeast Asia is growing but remains less developed than in Western settings (Romli et al., 2017). The tool is built for Singapore public housing (HDB) homes. It supports English, Simplified Chinese, Malay and Tamil, and maps its risk method onto the Singapore WSH Council risk matrix (Workplace Safety and Health Council, 2015).

---

## 3. Cluttered and hoarded homes

### 3.1 Why clutter matters for older adults

Hoarding disorder (HD) is defined by persistent difficulty discarding possessions, leading to clutter that compromises the use of living areas (Mataix-Cols et al., 2010). Pooled prevalence is about 2.5% (Postlethwaite et al., 2019). Hoarding symptoms often become more severe with age (Ayers et al., 2010). Among older adults, greater hoarding severity predicts greater functional disability (Ayers et al., 2014). Late-life HD is associated with risks of falls, fire, poor sanitation and medical illness (Ayers et al., 2015; Kim et al., 2001).

Hoarding is also a **community health and safety problem** with substantial social and economic burden (Frost et al., 2000; Tolin et al., 2008). Severe domestic squalor overlaps with hoarding but is a distinct construct (Halliday et al., 2000; Snowdon et al., 2007).

### 3.2 How professionals assess risk in hoarded homes

Practice in hoarded homes is multi-disciplinary. It typically involves social work, OT, fire services, housing and mental-health services, and frequently raises ethical tension between autonomy and safety (Bratiotis et al., 2011; Koenig et al., 2010). Established approaches the app aligns with:

| Practice principle | Evidence | How the app applies it |
|---|---|---|
| **Visual, room-by-room clutter rating** gives a shared language and reduces over- or under-reporting | Clutter Image Rating (CIR), a 9-point pictorial scale (Frost et al., 2008). Validated in older adults (Dozier & Ayers, 2015) and in Singapore (Sagayadevan et al., 2016) | Per-room **CIR-aligned clutter estimate (1 to 9)**, computed from floor coverage by loose objects (Section 7.4). It is an unvalidated heuristic, labelled as an estimate and **not** a CIR score. |
| **Focus on critical health and safety risks** rather than tidiness | A Delphi consensus of 34 multi-disciplinary experts identified 31 critical environmental risks, including blocked pathways and exits, combustibles near heat, and items at risk of toppling (Larkin et al., 2024) | Rules for walkway obstruction, clutter, blocked exits, fire proximity and falling objects; severity reflects consequence, not appearance |
| **Harm reduction** over forced clean-outs | Harm-reduction work with families (Tompkins, 2011); fire–health joint programmes (Kysow et al., 2020) | Controls ordered from most to least effective, with practical intermediate steps (clear a 0.9 m path, move combustibles away from heat). Non-judgemental language; "do not tidy first" so the assessment reflects real risk |
| **Distinguish squalor and sanitation** from clutter | Home Environment Index (Rasmussen et al., 2014); squalor research (Snowdon et al., 2007) | Out of scope for automated detection. The report recommends professional follow-up; the checklist captures key safety items |
| **Measure, then monitor change** | Saving Inventory-Revised (Frost et al., 2004); CIR (Frost et al., 2008) | Rescans re-run the pipeline; the risk register and exports support tracking over time |

### 3.3 Boundaries in hoarding situations

- The app **does not screen for or diagnose hoarding disorder**. A high clutter estimate means "many loose items cover the floor in these photos". It does not mean "this person hoards".
- Severe clutter, blocked exits, fire-load concerns or squalor should prompt referral to the appropriate service. Users should not attempt a large clean-out alone. The report's wording supports a collaborative, person-centred conversation (Bratiotis et al., 2011; Tompkins, 2011).

---

## 4. Assessment instruments that informed the content

| Instrument | Use in this app |
|---|---|
| **HOME FAST** (Mackenzie et al., 2000) | Hazard item selection: floors, mats, clutter, lighting, bathroom and bed transfers, footwear |
| **Westmead Home Safety Assessment** (Clemson et al., 1999) | Content-valid hazard domains and wording; person–environment fit |
| **CDC STEADI** (Stevens & Phelan, 2013) | Plain-language self-check items and fall-risk screening concepts |
| **HSSAT** and **HDB EASE** | Home-modification controls for Singapore homes: grab bars, ramps, anti-slip treatment (Housing & Development Board, n.d.) |
| Clinimetric review of home-hazard instruments (Romli et al., 2018) | Selection favoured instruments with reported validity and reliability |
| **CIR** (Frost et al., 2008), **HEATH / critical risks** (Larkin et al., 2024) | Clutter estimate and hoarding-relevant critical risks |

Checklist items (`config/checklists.json`) cover hazards cameras cannot reliably see: wet-floor slipperiness, bed height, night lights, gas checks and phone reachability. Each item has a defined "bad" answer that feeds the same rules engine as the camera findings.

---

## 5. Photo-capture protocol

Every home is different, so the protocol is **layout-agnostic**.

- **Three photos per room, each from a different corner**, or the doorway for the third, showing as much floor as possible. Room-specific prompts list what to try to include (for example, in the kitchen: the cooking area, sink and power points).
- **Universal rules**, shown as an illustrated eight-step tutorial:
  1. Lights on and curtains open.
  2. Clear people and pets out of the frame.
  3. **Do not tidy first.**
  4. Chest height, tilted slightly down, so the floor fills at least the lower third of the frame.
  5. Landscape orientation.
  6. Hold still for 2 s.
  7. No flash.
  8. Take every required photo.
- **Quality gate** (Section 7.1): three READY lights (Light, Steady, Floor). "Take photo anyway" is allowed and recorded as `quality.override = true`.
- **Gallery upload** is available for every photo and in bulk per room, so desktops and laptops without a camera can complete a scan.
- **Exercise Zone.** One room, by default the Living Room and changeable in Settings, is the Exercise Zone. Hazards in that room receive +1 likelihood, and loose floor clutter there obstructs the zone (Section 6.4).

Rationale: multiple viewpoints reduce occlusion and improve pathway visibility, the domain where photo-based assessment is weakest (Daniel et al., 2013).

---

## 6. Risk assessment methodology

### 6.1 Framework

The method follows the ISO 31000:2018 risk-management process (International Organization for Standardization [ISO], 2018a):

**Hazard identification → risk analysis and evaluation (S × L) → risk treatment (Hierarchy of Controls) → residual risk → monitoring and review.**

Hazard identification follows ISO 45001 principles (ISO, 2018b). Results are also shown in the Singapore WSH Council 3 × 3 format (Workplace Safety and Health Council, 2015). All parameters live in `config/risk_matrix.json`; nothing is hard-coded.

### 6.2 Hazard taxonomy

`FALL_SAME_LEVEL` (trip or slip) · `FALL_FROM_HEIGHT` · `IMPACT_STRUCK_BY` (falling or tipping objects) · `IMPACT_STRUCK_AGAINST` (sharp edges, glass) · `ENTANGLEMENT_STRANGULATION` · `ELECTRICAL` · `FIRE_BURN_SCALD` · `CHEMICAL` · `LIGHTING_VISIBILITY` · `ERGONOMIC_REACH` · `EMERGENCY_ACCESS`

### 6.3 Severity (S): consequence to an older adult

| S | Level | Descriptor |
|---|---|---|
| 1 | Negligible | No injury or discomfort only |
| 2 | Minor | Bruise or minor cut; first aid at home |
| 3 | Moderate | Sprain or laceration needing a clinic visit; temporary loss of mobility |
| 4 | Major | Fracture (wrist, hip), head injury or burns; hospital admission; lasting loss of independence |
| 5 | Catastrophic | Life-threatening injury, long lie or death; permanent disability |

Severity reflects the likely injury **given that the hazard is realised**. It is set per rule and is never changed by the user's profile.

### 6.4 Likelihood (L) and modifiers

| L | Level | Descriptor |
|---|---|---|
| 1 | Rare | Only in exceptional circumstances |
| 2 | Unlikely | Could occur at some time (about yearly) |
| 3 | Possible | Might occur (about monthly exposure) |
| 4 | Likely | Will probably occur (daily exposure, for example on the main walkway) |
| 5 | Almost certain | Expected to occur (constant exposure and a vulnerable person) |

`L_final = clamp(L_base + Σ modifiers, 1, 5)`. Each applied modifier is stored in `L_modifiers[]` for transparency.

| Modifier | Δ L | Rationale |
|---|---|---|
| ≥ 1 fall in the past 12 months | +1 | Prior falls strongly predict future falls (Tinetti et al., 1988) |
| Walking aid **or** vision impairment (combined at most +1) | +1 | Reduced capacity to avoid or recover from a trip (Lord et al., 2006) |
| Hazard in the Exercise Zone room, or on the bed-to-toilet path | +1 | Exposure during exercise or night-time mobility |
| Verified control in place | −1 | Treatment demonstrated by re-shoot or attestation |
| Unconfirmed AI detection with confidence < 0.4 | n/a | Shown as "Possible, please check" and **excluded from scoring** until confirmed |

### 6.5 Risk matrix (5 × 5) and action bands

Risk rating **R = S × L**.

| | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| **S5** | 5 M | 10 H | 15 H | 20 E | 25 E |
| **S4** | 4 L | 8 M | 12 H | 16 H | 20 E |
| **S3** | 3 L | 6 M | 9 M | 12 H | 15 H |
| **S2** | 2 L | 4 L | 6 M | 8 M | 10 H |
| **S1** | 1 L | 2 L | 3 L | 4 L | 5 M |

| Band | R | Action | Due |
|---|---|---|---|
| **Low** (green, ✓) | 1–4 | Acceptable; monitor | n/a |
| **Medium** (yellow, !) | 5–9 | Fix within 2 weeks | 14 days |
| **High** (orange, !!) | 10–16 | Fix before exercising in that room | 3 days |
| **Extreme** (red, ⚠) | 20–25 | Stop; fix immediately; notify the caregiver; refer to an OT | Immediately |

Colours always appear with an icon and a text label (WCAG; never colour alone).

### 6.6 WSH 3 × 3 view

Mapping: S1–2 → 1 (Minor), S3 → 2 (Moderate), S4–5 → 3 (Major); L1–2 → 1 (Remote), L3 → 2 (Occasional), L4–5 → 3 (Frequent). WSH bands: Low 1–2, Medium 3–4, High 6–9. The report toggles between the two views.

### 6.7 Risk treatment: Hierarchy of Controls

Every rule lists controls in this order: **Elimination → Substitution → Engineering → Administrative → PPE or personal aids** (National Institute for Occupational Safety and Health [NIOSH], n.d.). Each control carries an expected reduction (`dL`, `dS`) used to compute **residual risk** once the user commits to a fix. For example, for a rug on a walkway: remove it (E, ΔL −3) → low-pile anti-slip rug (S, −2) → tape or anti-slip underlay (Eng, −2) → keep the walkway clear (Admin, −1) → non-slip footwear (PPE, −1).

### 6.8 Aggregation

- **Room risk** is the highest active rating in the room (worst-case principle), plus counts by band.
- **Home Safety Score** (motivational only) = `max(0, 100 − (25·E + 10·H + 4·M + 1·L))`. If any Extreme hazard is active, the score is **capped at 40**, so a good-looking number can never hide an Extreme hazard.
- **Safety hearts** = `max(0, 5 − 2·E − 1·H)`.
- **Deduplication.** Detection-anchored hazards are unique per photo. Room-level hazards (dark floor, clutter, checklist answers) are counted once per room, keeping the highest rating.

### 6.9 Worked example (sample home, Living Room = Exercise Zone)

| Step | Value |
|---|---|
| Finding | Shoes and slippers on the walking path (`shoes on floor`, on floor, in walkway) |
| Rule | `TRIP-SHOES-01`: trip on items left in the walkway; S3, L_base 4 |
| Modifiers | +1 (Exercise Zone room) → L_final 5 |
| Rating | 3 × 5 = **15 → High** |
| Clearance effect | High hazard in the Exercise Zone → **Blocked** |
| First control | Eliminate: pick the items up (ΔL −3) → residual 3 × 2 = 6, Medium |

### 6.10 Known limitations of risk matrices

Risk matrices compress continuous risk into ordinal categories. They can give ties or reversals near band boundaries and depend on how S and L are defined (Cox, 2008; Duijm, 2015). Mitigations used here:

- Explicit, published S and L definitions.
- Raw S, L and R values are shown next to the band.
- A worst-case room roll-up.
- Every rating is traceable to a rule and its modifiers.
- A clinician reviews before any consequential decision.

---

## 7. Computer-vision and analysis pipeline

All inference runs **in the browser**. Photos are not uploaded.

```
capture/upload ─► Stage A quality gate ─► JPEG (no EXIF/GPS) ─► IndexedDB
                                                   │
analysis:  Stage C lighting ◄────────── photo ─────┤
           Stage B detection (on device) ──────────┤
           reference / user-added boxes ───────────┘
                     ▼
           facts (scene.js) ─► Stage D rules (rules.js) ─► scored hazards ─► Stage E user verification
                     ▼
           consolidated report (report.js)
```

### 7.1 Stage A: capture quality gate (`js/quality.js`, `js/tilt.js`)

Sampled every 250 ms on a 320 px-wide frame.

| Check | Method | Threshold |
|---|---|---|
| Brightness | Mean luminance, Rec. 709: Y = 0.2126 R + 0.7152 G + 0.0722 B (International Telecommunication Union [ITU], 2015) | 60 ≤ Y ≤ 230 |
| Sharpness | Variance of the 4-neighbour Laplacian (Pech-Pacheco et al., 2000) | ≥ 100 |
| Tilt | Gravity vector from `DeviceOrientationEvent` β, γ: g = (cos β sin γ, −sin β, −cos β cos γ). Pitch = asin(g_z); roll = signed angle between g and screen-down for the current screen rotation | \|roll\| ≤ 8°; −25° ≤ pitch ≤ +10° |
| Hold | Continuous READY state | 2 s |

Missing sensors (desktop, gallery upload) are reported as "unknown" and do not block.

### 7.2 Stage B: object detection (`js/detector.js`)

- **Current detector:** COCO-SSD with a MobileNetV2-lite backbone, in TensorFlow.js. It is loaded on demand from a pinned CDN with Subresource Integrity (Lin et al., 2014; Liu et al., 2016; Sandler et al., 2018; Smilkov et al., 2019).
- **Class mapping:** COCO classes are mapped onto the hazard vocabulary in `config/coco_map.json` (for example, couch → sofa, handbag or backpack → bag on floor, cat or dog → pet).
- **Known gap:** COCO has no classes for rugs, cables, power strips, mats, grab bars or thresholds, so these cannot be detected automatically yet. Checklists, reference labels and user confirmation cover the gap.
- **Planned:** open-vocabulary YOLO-World with the custom hazard vocabulary (Cheng et al., 2024) and monocular depth (Depth Anything V2; Yang et al., 2024). Both will run in ONNX Runtime Web, exported with `tools/export_models.ipynb`.

### 7.3 Stage C: scene signals (`js/scene.js`)

| Signal | Definition (normalised image coordinates) |
|---|---|
| Floor band | Lower third of the frame (y ≥ 2/3), the protocol's floor-coverage requirement. To be replaced by depth-based floor segmentation |
| On floor | Box bottom ≥ 0.717 |
| In walkway | Box bottom ≥ 0.80 and horizontal centre in [0.2, 0.8] |
| Proximity (estimate) | Gap between boxes × nominal frame width of 4 m |
| Dark floor | % of floor-band pixels with Y < 40; "dark" when ≥ 25% |
| Glare / possible wet floor | ≥ 0.5% of floor-band pixels with Y > 245 |
| Clutter index | Σ (width × height inside the floor band) of loose, on-floor, non-furniture objects ÷ floor-band area |
| Exercise Zone obstructed | Exercise Zone room **and** clutter index > 0.05 |

Human-labelled boxes (user additions, reference labels) may state `on_floor` / `in_walkway` explicitly. That judgement overrides the geometric heuristic.

### 7.4 CIR-aligned clutter estimate (heuristic)

| Clutter index ≤ | 0.02 | 0.05 | 0.08 | 0.12 | 0.18 | 0.26 | 0.36 | 0.50 | > 0.50 |
|---|---|---|---|---|---|---|---|---|---|
| Estimate | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |

The bands were chosen so that estimates of 4 or more coincide with the general clutter hazard threshold (0.12). This mapping has **not** been validated against the CIR (Frost et al., 2008). It is reported only as an estimate, to support conversation in clinicians' familiar terms.

### 7.5 Stage E: human verification

Each AI detection can be marked **Correct** or **Not a hazard**. Rejected detections are removed from rules and proximity, and the photo is rescored. Confirmed detections are trusted regardless of confidence. Verdicts are kept when a photo is re-analysed. This design guards against automation bias and complacency (Parasuraman & Manzey, 2010). It also produces labelled data: the precision proxy, and a future training set.

---

## 8. Hazard rules engine

Rules are **data** (`config/hazard_rules.json`, 75 rules), so clinicians can review and tune them without code changes. Each rule has an `id`, rooms, a `trigger`, a `hazard_type`, a mechanism, base S and L, controls, evidence text and a reference.

```json
{ "id": "TRIP-CABLE-01", "room": ["all"],
  "trigger": { "all": [ { "cls": ["electrical cable", "extension cord"], "on_floor": true, "in_walkway": true } ] },
  "hazard_type": "FALL_SAME_LEVEL", "base_severity": 3, "base_likelihood": 4,
  "controls": [ { "lvl": "E", "text": "Re-route the cable along the wall", "dL": -3 } ] }
```

**Trigger language.** `all` / `any` / `none` lists of conditions:

- class match: `cls`, with optional `on_floor`, `in_walkway`, `near {cls, max_m}` and `min_count`
- `absent` classes
- scene context: `ctx`
- checklist answers: `checklist`
- profile fields: `profile`

Rules are room-scoped (`room`) and either fire once per matching detection or once per room (`scope: "room"`). Every rule has an automatically generated positive and negative test fixture.

---

## 9. Home Safety Report and analytics

Opening the report analyses every photo not yet checked, as a batch, then shows:

| Section | Content |
|---|---|
| KPIs | Home Safety Score gauge, active hazards by band, photo coverage (taken / required / checked), provisional clearance, safety hearts |
| Risk heat map | 5 × 5 matrix with hazard counts per cell; toggle to the WSH 3 × 3 view |
| Hazard types | Donut chart by taxonomy |
| By room | Stacked bars by band |
| Room profiles | Worst band, counts, coverage, mean dark-floor %, CIR-aligned clutter estimate, photo thumbnails |
| Top priorities | Up to five Medium-or-higher hazards with the first two controls and due dates |
| Risk register | Every finding: photo, room, hazard, type, S, L, R, band, source, first control. Exportable as CSV |
| Data quality | Detector, objects detected, mean confidence, user confirmations and rejections, **precision proxy** = confirmed ÷ (confirmed + rejected), mean analysis time, findings by source |
| Validation | For labelled sample photos: share of reference hazards rated, and agreement between the team's label (high / medium / low) and the app's band (High or Extreme / Medium / Low) |
| Exports | Print or save as PDF (print stylesheet), CSV (RFC 4180, UTF-8 with BOM for Excel), JSON |

---

## 10. Pre-exercise clearance gate

| Status | Condition |
|---|---|
| **Cleared** | No active hazard above Low |
| **Cleared with advice** | Medium hazards, or High hazards outside the Exercise Zone room and the bed-to-toilet path |
| **Blocked** | Any Extreme hazard, or any High hazard in the Exercise Zone room or on the bed-to-toilet path |
| **Not issued** | Any required photo or checklist missing, or a change reported (moved home, new furniture, recent fall) |

Validity is 7 days (configurable). The record `{status, issuedAt, expiresAt, participantId, scanId, hash}` is written to `localStorage['intellicare.homeScan.clearance']`; the `hash` field is tamper-evident but is not a security control. Other apps include `clearance-check.js` and call `homeScanClearance()`.

The report currently shows a **provisional** status based on photos only, because the checklist screens are not yet implemented (Section 15).

---

## 11. Privacy, ethics and safety

- **On-device by default.** Photos and results are stored in the browser's IndexedDB and never uploaded. The Settings screen has "Delete all photos on this device".
- **No metadata.** Saved JPEGs are re-encoded from a canvas, which strips EXIF and GPS. No names, NRIC numbers, addresses or phone numbers are collected.
- **Planned:** granular consent (use; store results for research; store photos; allow photos for model training), on-device face blurring before storage, and optional sync. These will be designed to comply with Singapore's Personal Data Protection Act 2012 principles of consent, purpose limitation, protection and retention.
- **Explainability.** Every hazard shows the rule, the evidence, S × L, any modifiers and the controls.
- **Dignity.** The wording is neutral and non-stigmatising, especially for cluttered homes (Section 3). The app never labels a person.
- **Original IP.** All characters and illustrations are original. No third-party game assets are used.

---

## 12. Sample photographs for testing

**Settings → "Load sample home"**, or the report's empty state, downloads and stores 12 photos (three per room). It then builds the full report. You can also download the files below and upload them yourself through each room's **Upload** buttons.

| Room | Photo 1 (labelled, team-owned) | Photo 2 | Photo 3 |
|---|---|---|---|
| Bedroom | [bedroom.jpg](https://raw.githubusercontent.com/aaron-chen-angus/fallsafe-home-scan/main/images/bedroom.jpg), 4 labelled hazards | [Bregenz hoarded home, bedroom](https://commons.wikimedia.org/wiki/File:Bregenz-Cluttered_interiors_(compulsive_hoarding)-bedroom-05ASD.jpg): Asurnipal, CC BY-SA 4.0 | [Messy bedroom, New Orleans](https://commons.wikimedia.org/wiki/File:Messy_Bedroom_New_Orleans_Oct_2017_-_01.jpg): Infrogmation of New Orleans, CC BY 2.0 |
| Kitchen | [kitchen.jpg](https://raw.githubusercontent.com/aaron-chen-angus/fallsafe-home-scan/main/images/kitchen.jpg), 4 labelled hazards | [Bregenz hoarded home, kitchen](https://commons.wikimedia.org/wiki/File:Bregenz-Cluttered_interiors_(compulsive_hoarding)-kitchen-03ASD.jpg): Asurnipal, CC BY-SA 4.0 | [Messy kitchen sink](https://commons.wikimedia.org/wiki/File:Gfp-messy-kitchen-sink.jpg): Yinan Chen, public domain |
| Dining Room | [dining-room.jpg](https://raw.githubusercontent.com/aaron-chen-angus/fallsafe-home-scan/main/images/dining-room.jpg), 4 labelled hazards | [Bregenz hoarded home, dining room](https://commons.wikimedia.org/wiki/File:Bregenz-Cluttered_interiors_(compulsive_hoarding)-dining_room-06ASD.jpg): Asurnipal, CC BY-SA 4.0 | [Mess in the dining room](https://commons.wikimedia.org/wiki/File:Mess_in_the_dining_room.jpg): maria rocio, CC BY-SA 2.0 |
| Living Room | [living-room.jpg](https://raw.githubusercontent.com/aaron-chen-angus/fallsafe-home-scan/main/images/living-room.jpg), 4 labelled hazards | [Bregenz hoarded home, living room](https://commons.wikimedia.org/wiki/File:Bregenz-Cluttered_interiors_(compulsive_hoarding)-living_room-02ASD.jpg): Asurnipal, CC BY-SA 4.0 | [Hoarding living room](https://commons.wikimedia.org/wiki/File:Hoarding_living_room.jpg): Shadwwulf, CC BY 3.0 |

- **Photo 1** in each room comes from the FallSafe Home Scan prototype. The project team labelled 16 hazards in total; they appear in `config/samples.json` with the team's own risk ratings.
- **Photos 2 and 3** are unmodified Wikimedia Commons images, used under their stated licences with attribution. The report shows these credits whenever sample photos are in use.
- **Labels.** Labels apply only when the sample loader is used. If you upload the files manually, they are treated as ordinary user photos, analysed by the detector and lighting checks only.
- **Offline copy.** To serve the prototype photos from this repository, copy them into `assets/training/`. The loader tries that folder first.

---

## 13. Software architecture

**Constraints.** No build step, no npm, no server. The app is plain HTML, CSS and JavaScript using ES modules, deployable as static files to GitHub Pages. Third-party libraries load from a pinned CDN with Subresource Integrity (SRI), only when needed.

```
index.html  manifest.webmanifest  clearance-check.js
css/      tokens.css layout.css game.css components.css
js/       app.js (router) state.js db.js (IndexedDB) i18n.js
          camera.js quality.js tilt.js ingest.js shots.js samples.js
          detector.js scene.js rules.js risk.js analyze.js report.js
          ui/ screens.js camera-screen.js analysis-screen.js report-screen.js
              components.js characters.js house.js plan.js charts.js ghost.js tutorial-art.js svg.js
config/   app.json risk_matrix.json hazard_rules.json vocabulary.json coco_map.json
          thresholds.json checklists.json shot_guides.json samples.json
locales/  en.json zh.json ms.json ta.json
tests/    tests.html suite.js harness.js fixtures.js e2e.html run-headless.ps1 run-node.mjs
tools/    serve.ps1
.kiro/    steering/ and specs/ (requirements, design, tasks)
```

- **Pure logic modules** (`risk.js`, `rules.js`, `scene.js`, `report.js`, `shots.js`, `quality.js`, `tilt.js`) do not touch the DOM and are unit tested.
- **Configuration as data.** The matrix, rules, thresholds, vocabulary, checklists, shot guides and samples are all JSON.
- **Analysis versioning.** `ANALYSIS_VERSION` and the Exercise Zone setting are stored with each result. Stale results are recomputed automatically, and user verdicts are carried over.

---

## 14. Running, testing and deploying

**Local preview.** ES modules need HTTP, not `file://`:

```
powershell -ExecutionPolicy Bypass -File tools/serve.ps1        # http://localhost:8080/
```

`python -m http.server 8080` also works if Python is installed. `localhost` is a secure context, so the camera works.

**Unit tests** cover the matrix (all 25 cells), modifiers, WSH mapping, clearance transitions, every rule (positive and negative fixtures), quality metrics, tilt, scene facts, the samples, report aggregation, CSV and i18n parity. Run them in either of two ways:

- Open `/tests/tests.html`.
- Run `powershell -ExecutionPolicy Bypass -File tests/run-headless.ps1` (headless Chrome or Edge).

**End-to-end check.** Serve the app, then open `/tests/e2e.html`. It checks the full flow: photo → shot → analysis → persistence → sample home → consolidated report.

**Deploy to GitHub Pages.** Push the repository, then choose Settings → Pages → Deploy from branch (`main`, root). All paths are relative. The first analysis downloads the detector model (about 5 MB); later runs reuse the browser cache.

---

## 15. Validation status, limitations and roadmap

**Status.** Research prototype. The app has **not** been clinically validated. Metrics in the report are descriptive and do not establish diagnostic accuracy.

**Main limitations**

1. The COCO detector cannot see several key hazard classes (Section 7.2).
2. Floor, walkway and distance are 2-D heuristics without depth.
3. The clutter estimate is not a validated CIR score.
4. Checklists and the profile screens that feed several rules are not yet implemented, so clearance is provisional.
5. A single photo cannot assess dynamic factors: footwear in use, gait, or behaviour at night.

**Proposed validation** (following Daniel et al., 2013):

- Concurrent validity against on-site OT assessment using HOME FAST or the Westmead assessment: sensitivity, specificity and Cohen's κ per domain.
- Inter-rater agreement between app-assisted lay users and clinicians.
- Agreement of the clutter estimate with clinician-rated CIR.
- Usability and acceptability with older adults, with caregivers, and in hoarding-informed practice settings.

**Roadmap:** YOLO-World and depth (task 4/5) · checklists and profile (task 6) · gamification grounded in health-behaviour evidence (Johnson et al., 2016) (task 7) · consent, face blur, exports and sync (task 8) · clearance screen and returnTo flow (task 9) · offline service worker and accessibility audit (task 10).

---

## 16. References

Ayers, C. R., Ly, P., Howard, I., Mayes, T., Porter, B., & Iqbal, Y. (2014). Hoarding severity predicts functional disability in late-life hoarding disorder patients. *International Journal of Geriatric Psychiatry, 29*(7), 741–746. https://doi.org/10.1002/gps.4057

Ayers, C. R., Najmi, S., Mayes, T. L., & Dozier, M. E. (2015). Hoarding disorder in older adulthood. *The American Journal of Geriatric Psychiatry, 23*(4), 416–422. https://doi.org/10.1016/j.jagp.2014.05.009

Ayers, C. R., Saxena, S., Golshan, S., & Wetherell, J. L. (2010). Age at onset and clinical features of late life compulsive hoarding. *International Journal of Geriatric Psychiatry, 25*(2), 142–149. https://doi.org/10.1002/gps.2310

Bratiotis, C., Schmalisch, C. S., & Steketee, G. (2011). *The hoarding handbook: A guide for human service professionals*. Oxford University Press.

Cheng, T., Song, L., Ge, Y., Liu, W., Wang, X., & Shan, Y. (2024). YOLO-World: Real-time open-vocabulary object detection. In *Proceedings of the IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)* (pp. 16901–16911).

Clemson, L., Fitzgerald, M. H., & Heard, R. (1999). Content validity of an assessment tool to identify home fall hazards: The Westmead Home Safety Assessment. *British Journal of Occupational Therapy, 62*(4), 171–179. https://doi.org/10.1177/030802269906200407

Clemson, L., Mackenzie, L., Ballinger, C., Close, J. C. T., & Cumming, R. G. (2008). Environmental interventions to prevent falls in community-dwelling older people: A meta-analysis of randomized trials. *Journal of Aging and Health, 20*(8), 954–971. https://doi.org/10.1177/0898264308324672

Clemson, L., Stark, S., Pighills, A. C., Fairhall, N. J., Lamb, S. E., Ali, J., & Sherrington, C. (2023). Environmental interventions for preventing falls in older people living in the community. *Cochrane Database of Systematic Reviews, 2023*(3), Article CD013258. https://doi.org/10.1002/14651858.CD013258.pub2

Cox, L. A., Jr. (2008). What's wrong with risk matrices? *Risk Analysis, 28*(2), 497–512. https://doi.org/10.1111/j.1539-6924.2008.01030.x

Cumming, R. G., Thomas, M., Szonyi, G., Salkeld, G., O'Neill, E., Westbury, C., & Frampton, G. (1999). Home visits by an occupational therapist for assessment and modification of environmental hazards: A randomized trial of falls prevention. *Journal of the American Geriatrics Society, 47*(12), 1397–1402. https://doi.org/10.1111/j.1532-5415.1999.tb01556.x

Daniel, H., Oesch, P., Stuck, A. E., Born, S., Bachmann, S., & Schoenenberger, A. W. (2013). Evaluation of a novel photography-based home assessment protocol for identification of environmental risk factors for falls in elderly persons. *Swiss Medical Weekly, 143*, Article w13884. https://doi.org/10.4414/smw.2013.13884

Dozier, M. E., & Ayers, C. R. (2015). Validation of the Clutter Image Rating in older adults with hoarding disorder. *International Psychogeriatrics, 27*(5), 769–776.

Duijm, N. J. (2015). Recommendations on the use and design of risk matrices. *Safety Science, 76*, 21–31. https://doi.org/10.1016/j.ssci.2015.02.014

Fleming, J., & Brayne, C. (2008). Inability to get up after falling, subsequent time on floor, and summoning help: Prospective cohort study in people over 90. *BMJ, 337*, Article a2227. https://doi.org/10.1136/bmj.a2227

Frost, R. O., Steketee, G., & Grisham, J. (2004). Measurement of compulsive hoarding: Saving Inventory-Revised. *Behaviour Research and Therapy, 42*(10), 1163–1182. https://doi.org/10.1016/j.brat.2003.07.006

Frost, R. O., Steketee, G., Tolin, D. F., & Renaud, S. (2008). Development and validation of the Clutter Image Rating. *Journal of Psychopathology and Behavioral Assessment, 30*(3), 193–203. https://doi.org/10.1007/s10862-007-9068-7

Frost, R. O., Steketee, G., & Williams, L. (2000). Hoarding: A community health problem. *Health & Social Care in the Community, 8*(4), 229–234. https://doi.org/10.1046/j.1365-2524.2000.00245.x

Gillespie, L. D., Robertson, M. C., Gillespie, W. J., Sherrington, C., Gates, S., Clemson, L. M., & Lamb, S. E. (2012). Interventions for preventing falls in older people living in the community. *Cochrane Database of Systematic Reviews, 2012*(9), Article CD007146. https://doi.org/10.1002/14651858.CD007146.pub3

Halliday, G., Banerjee, S., Philpot, M., & Macdonald, A. (2000). Community study of people who live in squalor. *The Lancet, 355*(9207), 882–886. https://doi.org/10.1016/S0140-6736(99)06250-9

Housing & Development Board. (n.d.). *Enhancement for Active Seniors (EASE)*. Government of Singapore. https://www.hdb.gov.sg

International Organization for Standardization. (2018a). *Risk management — Guidelines* (ISO Standard No. 31000:2018).

International Organization for Standardization. (2018b). *Occupational health and safety management systems — Requirements with guidance for use* (ISO Standard No. 45001:2018).

International Telecommunication Union. (2015). *Parameter values for the HDTV standards for production and international programme exchange* (Recommendation ITU-R BT.709-6).

Johnson, D., Deterding, S., Kuhn, K.-A., Staneva, A., Stoyanov, S., & Hides, L. (2016). Gamification for health and wellbeing: A systematic review of the literature. *Internet Interventions, 6*, 89–106. https://doi.org/10.1016/j.invent.2016.10.002

Kim, H.-J., Steketee, G., & Frost, R. O. (2001). Hoarding by elderly people. *Health & Social Work, 26*(3), 176–184. https://doi.org/10.1093/hsw/26.3.176

Koenig, T. L., Chapin, R., & Spano, R. (2010). Using multidisciplinary teams to address ethical dilemmas with older adults who hoard. *Journal of Gerontological Social Work, 53*(2), 137–147. https://doi.org/10.1080/01634370903340353

Kysow, K., Bratiotis, C., Lauerman, J., & Woody, S. R. (2020). How can cities tackle hoarding? Examining an intervention program bringing together fire and health authorities in Vancouver. *Health & Social Care in the Community*.

Larkin, P., Bratiotis, C., & Woody, S. R. (2024). Assessment of critical health and safety risks in homes where hoarding is prevalent. *Journal of Community Health, 49*(1), 8–16.

Lin, T.-Y., Maire, M., Belongie, S., Hays, J., Perona, P., Ramanan, D., Dollár, P., & Zitnick, C. L. (2014). Microsoft COCO: Common objects in context. In D. Fleet, T. Pajdla, B. Schiele, & T. Tuytelaars (Eds.), *Computer Vision – ECCV 2014* (Lecture Notes in Computer Science, Vol. 8693, pp. 740–755). Springer. https://doi.org/10.1007/978-3-319-10602-1_48

Liu, W., Anguelov, D., Erhan, D., Szegedy, C., Reed, S., Fu, C.-Y., & Berg, A. C. (2016). SSD: Single shot MultiBox detector. In B. Leibe, J. Matas, N. Sebe, & M. Welling (Eds.), *Computer Vision – ECCV 2016* (Lecture Notes in Computer Science, Vol. 9905, pp. 21–37). Springer. https://doi.org/10.1007/978-3-319-46448-0_2

Lord, S. R., Menz, H. B., & Sherrington, C. (2006). Home environment risk factors for falls in older people and the efficacy of home modifications. *Age and Ageing, 35*(Suppl. 2), ii55–ii59. https://doi.org/10.1093/ageing/afl088

Mackenzie, L., Byles, J., & Higginbotham, N. (2000). Designing the Home Falls and Accidents Screening Tool (HOME FAST): Selecting the items. *British Journal of Occupational Therapy, 63*(6), 260–269. https://doi.org/10.1177/030802260006300604

Mataix-Cols, D., Frost, R. O., Pertusa, A., Clark, L. A., Saxena, S., Leckman, J. F., Stein, D. J., Matsunaga, H., & Wilhelm, S. (2010). Hoarding disorder: A new diagnosis for DSM-V? *Depression and Anxiety, 27*(6), 556–572. https://doi.org/10.1002/da.20693

Montero-Odasso, M., van der Velde, N., Martin, F. C., Petrovic, M., Tan, M. P., Ryg, J., Aguilar-Navarro, S., Alexander, N. B., Becker, C., Blain, H., Bourke, R., Cameron, I. D., Camicioli, R., Clemson, L., Close, J., Delbaere, K., Duan, L., Duque, G., Dyer, S. M., … Masud, T. (2022). World guidelines for falls prevention and management for older adults: A global initiative. *Age and Ageing, 51*(9), Article afac205. https://doi.org/10.1093/ageing/afac205

National Institute for Occupational Safety and Health. (n.d.). *Hierarchy of controls*. Centers for Disease Control and Prevention. https://www.cdc.gov/niosh/hierarchy-of-controls/

Parasuraman, R., & Manzey, D. H. (2010). Complacency and bias in human use of automation: An attentional integration. *Human Factors, 52*(3), 381–410. https://doi.org/10.1177/0018720810376055

Pech-Pacheco, J. L., Cristóbal, G., Chamorro-Martínez, J., & Fernández-Valdivia, J. (2000). Diatom autofocusing in brightfield microscopy: A comparative study. In *Proceedings of the 15th International Conference on Pattern Recognition* (Vol. 3, pp. 314–317). IEEE. https://doi.org/10.1109/ICPR.2000.903548

Pighills, A. C., Torgerson, D. J., Sheldon, T. A., Drummond, A. E., & Bland, J. M. (2011). Environmental assessment and modification to prevent falls in older people. *Journal of the American Geriatrics Society, 59*(1), 26–33. https://doi.org/10.1111/j.1532-5415.2010.03221.x

Postlethwaite, A., Kellett, S., & Mataix-Cols, D. (2019). Prevalence of hoarding disorder: A systematic review and meta-analysis. *Journal of Affective Disorders, 256*, 309–316. https://doi.org/10.1016/j.jad.2019.06.004

Rasmussen, J. L., Steketee, G., Frost, R. O., Tolin, D. F., & Brown, T. A. (2014). Assessing squalor in hoarding: The Home Environment Index. *Community Mental Health Journal, 50*(5), 591–596. https://doi.org/10.1007/s10597-013-9665-8

Romli, M. H., Mackenzie, L., Lovarini, M., Tan, M. P., & Clemson, L. (2018). The clinimetric properties of instruments measuring home hazards for older people at risk of falling: A systematic review. *Evaluation & the Health Professions, 41*(1), 82–128.

Romli, M. H., Tan, M. P., Mackenzie, L., Lovarini, M., Suttanon, P., & Clemson, L. (2017). Falls amongst older people in Southeast Asia: A scoping review. *Public Health, 145*, 96–112.

Sagayadevan, V., Lau, Y. W., Ong, C., Lee, S. P., Chong, S. A., & Subramaniam, M. (2016). Validation of the clutter image rating (CIR) scale among psychiatric outpatients in Singapore. *BMC Psychiatry, 16*, Article 407. https://doi.org/10.1186/s12888-016-1125-x

Sandler, M., Howard, A., Zhu, M., Zhmoginov, A., & Chen, L.-C. (2018). MobileNetV2: Inverted residuals and linear bottlenecks. In *Proceedings of the IEEE Conference on Computer Vision and Pattern Recognition* (pp. 4510–4520). https://doi.org/10.1109/CVPR.2018.00474

Sanford, J. A., & Butterfield, T. (2005). Using remote assessment to provide home modification services to underserved elders. *The Gerontologist, 45*(3), 389–398. https://doi.org/10.1093/geront/45.3.389

Sherrington, C., Fairhall, N. J., Wallbank, G. K., Tiedemann, A., Michaleff, Z. A., Howard, K., Clemson, L., Hopewell, S., & Lamb, S. E. (2019). Exercise for preventing falls in older people living in the community. *Cochrane Database of Systematic Reviews, 2019*(1), Article CD012424. https://doi.org/10.1002/14651858.CD012424.pub2

Smilkov, D., Thorat, N., Assogba, Y., Yuan, A., Kreeger, N., Yu, P., Zhang, K., Cai, S., Nielsen, E., Soergel, D., Bileschi, S., Terry, M., Nicholson, C., Gupta, S. N., Sirajuddin, S., Sculley, D., Monga, R., Corrado, G., Viégas, F. B., & Wattenberg, M. (2019). TensorFlow.js: Machine learning for the web and beyond. *Proceedings of Machine Learning and Systems, 1*, 309–321.

Snowdon, J., Shah, A., & Halliday, G. (2007). Severe domestic squalor: A review. *International Psychogeriatrics, 19*(1), 37–51. https://doi.org/10.1017/S1041610206004236

Stark, S., Keglovits, M., Arbesman, M., & Lieberman, D. (2017). Effect of home modification interventions on the participation of community-dwelling adults with health conditions: A systematic review. *American Journal of Occupational Therapy, 71*(2), 7102290010p1–7102290010p11. https://doi.org/10.5014/ajot.2017.018887

Stevens, J. A., & Phelan, E. A. (2013). Development of STEADI: A fall prevention resource for health care providers. *Health Promotion Practice, 14*(5), 706–714. https://doi.org/10.1177/1524839912463576

Tinetti, M. E., Speechley, M., & Ginter, S. F. (1988). Risk factors for falls among elderly persons living in the community. *New England Journal of Medicine, 319*(26), 1701–1707. https://doi.org/10.1056/NEJM198812293192604

Tolin, D. F., Frost, R. O., Steketee, G., Gray, K. D., & Fitch, K. E. (2008). The economic and social burden of compulsive hoarding. *Psychiatry Research, 160*(2), 200–211. https://doi.org/10.1016/j.psychres.2007.08.008

Tompkins, M. A. (2011). Working with families of people who hoard: A harm reduction approach. *Journal of Clinical Psychology, 67*(5), 497–506. https://doi.org/10.1002/jclp.20797

Workplace Safety and Health Council. (2015). *Code of practice on workplace safety and health (WSH) risk management*. Ministry of Manpower, Singapore.

World Health Organization. (2021). *Step safely: Strategies for preventing and managing falls across the life-course*. World Health Organization.

Yang, L., Kang, B., Huang, Z., Zhao, Z., Xu, X., Feng, J., & Zhao, H. (2024). Depth Anything V2. In *Advances in Neural Information Processing Systems 37*.

---

*Screening aid only. It is not a substitute for an occupational therapist's home assessment. In an emergency, call 995.*
