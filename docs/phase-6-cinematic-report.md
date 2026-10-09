# Phase 6 report: the cinematic AI tribunal

Branch `phase-2-ai-intelligence`. Nothing pushed, merged, deployed or published. No paid service or API request.

## A. Executive verdict

**Completed, as a strong draft for owner review. Not cleared for publication.**

- The trailer exists, plays, and is a different kind of film from V1: four original animated judges, a courtroom, a verdict that is an event, and a real-app reveal. It is **not** a screen recording or a slideshow.
- It meets the creative direction in structure and content (hook, accused, roast, verdict, twist, product reveal, end card; three character-driven gags with setup and payoff; silent-readable reaction moments; sound design built around silence and impact).
- It does **not** reach premium 3D/film-trailer polish. With no 3D package, image generator or paid animation tool, the judges are 2.5D layered-vector rigs written in code. I think they are distinctive, expressive and funny, but this is the ceiling of the method and I have said so rather than claim otherwise.
- **Needs owner review:** (1) watch and listen to it: timing and the synthesised sound were judged from data, not heard; (2) decide whether the animation quality is enough or whether to commission/produce higher-fidelity characters (the rig and character bible make that a drop-in); (3) the real-app clips replay older stored output (see E); (4) the launch prerequisites from Phase 4/5 are unchanged and still block any public traffic.

## B. Character designs

Four original judges with one shared design language (same outline weight, glossy "screen" faces, top-left key light, one signature colour each). Full detail in `artifacts/phase-6-cinematic/character-bible.md`.

| Judge | Design | Silhouette | Distinct animations built |
|---|---|---|---|
| **STERLING** (gold) | Gold-plated head, monocle, tailored suit, stamp, hologram calculator, luxury throne | tall arched throne | brow raise, calculator "£0.00", laugh, creaking stamp lift, slam, disgust (glasses) |
| **KERNEL** (cyan) | Battered CRT monitor head, cables, fan, warning lamp, temperature gauge | small boxy monitor | glitch, ERR, overheating (steam, sparks, fan), blue-screen crash, reboot, eye-roll |
| **HYPE** (pink) | Violet hologram entertainer, quiff, visor shades, notification bubbles | floating tapered hologram | shades fly on/off, notification storm, pose, squash/stretch, deflation |
| **WALLET** (mint) | Worn bifold-wallet robot, big eyes, receipts, plaster, opening flap | tall stitched rectangle | panic (sweat, shake), deadpan, opens empty wallet (1p), throws receipt, leaves, peeks back |

**Consistency evidence:** `characters/lineup.png` and `characters/group-shot.png` show all four together; each has a six-pose `…-expressions.png`. **Source assets** (`artifacts/phase-6-cinematic/characters/`): `sterling.svg`, `kernel.svg`, `hype.svg`, `wallet.svg`, the expression sheets, the line-up, the group shot. **Reusable rig:** `scripts/trailer/characters.js` (tracked in Git): a judge is posed by a flat list of numbers, so new scenes are data.

## C. The trailer

- **File:** `C:\Users\MattD\Development\AI-ROAST-MY-IDEA-phase2\artifacts\phase-6-cinematic\AI_ROAST_MY_IDEA_CINEMATIC_V2.mp4`
- 1080 × 1920, 30 fps, H.264 High `yuv420p`, 34.8 s, AAC-LC stereo 44.1 kHz, −13.8 LUFS, peak −0.8 dBFS, full decode clean, no black frames.
- **Structure:** hook (0 – 3.4) → the accused (3.4 – 7.2) → the roast, four judges (7.2 – 18.1) → the verdict (18.1 – 22.0) → the twist (22.0 – 27.0) → the real app (27.0 – 31.8) → end card (31.8 – 34.8). Shot-by-shot in `storyboard.md`.

## D. What is different from V1

| | V1 | V2 |
|---|---|---|
| Subject | the website | four animated judges |
| Footage | ~100% app recording | ~86% animation, 13.8% (4.8 s) real app |
| New storytelling | explainer captions | setup/payoff comedy; deliberate silence; a verdict that is an event; a twist that stays honest (41, still KILL IT) |
| New animation | none | per-judge rigs, acting beats, camera push-ins, cuts and whip blur, impact shake |
| New comedy | none | Kernel blue-screens; Wallet leaves and peeks back; Hype's shades fly off and on; Sterling's "£0.00" and stamp; "NO TOKENS. NO WALLET."; "+22 POINTS. STILL DEAD." |
| Sound | a drone | synthesised per-character voices, effects for every beat, two silences, a verdict impact, a bright reveal bed, a closing sting |

## E. Authenticity

Full manifest: `artifacts/phase-6-cinematic/media-source-manifest.md`.

- **Real historical Haiku output** (benchmark 2026-10-08, prompt `.4`): the pitch; the 19/100 KILL IT verdict and the four persona scores 18/22/24/14; the FIX title and the projected 41 (KILL IT); and three quotes verbatim (Sterling, Kernel, Hype). Wallet's quote is a verbatim tail with the first clause dropped. "NO TOKENS. NO WALLET." is shortened from the real FIX pitch. All adaptations are marked.
- **Real application footage:** 4.8 s of the actual app, replaying the stored output through its own endpoints (the app ran in `AI_PROVIDER=demo`; nothing was generated). It is on-screen labelled "SAMPLE SESSION… replayed… Not a fresh request."
- **Promotional animation (not an app feature):** all judge acting, props and the courtroom. The app's judges are not animated characters.
- **Disclose before publishing:** the stored FIX pitch visible for about 1 s on the last app clip opens with an **invented founder backstory** ("I bake sourdough at home…") from the older prompt; today's safeguards would strip it. A fresh capture on the current prompts would remove it.
- No fabricated results, testimonials or statistics.

## F. Verification

Details and numbers in `artifacts/phase-6-cinematic/media-validation.md`.

- **Decoding:** full decode clean. **Format:** as in C.
- **Frames:** every act boundary and key beat, a half-second contact sheet of the whole film, character sheets, the cover. Review found and fixed 13 defects (listed in the validation document), including real-app clips that had landed on blank UI.
- **Sound (by measurement only):** both silences about 10 – 12 dB under their scenes; the stamp is the loudest event; the reveal has a musical bed; no dead audio; −13.8 LUFS.
- **Captions:** a 15-cue `.srt` generated from the same timeline.
- **Safe areas:** by layout constants (nothing essential above y 250 or below y 1470); not tested in the platforms.
- **Code gates:** `npx eslint .` clean (0 errors, 0 warnings), `npx tsc --noEmit` clean. No application source (`src/`) changed, so the app's unit/e2e results from Phase 5 are unaffected.
- **Not verified:** I did not watch or listen in real time; the sound and comic timing are the largest remaining subjective risk. Platform rendering untested.

### Acceptance test

| Criterion | Assessment |
|---|---|
| First frame powerful, premise clear without sound | Yes: a finished lit courtroom, four distinct judges, a legible hook, and Kernel/Wallet already in character on frame 0 |
| Each judge recognisable; one visual universe | Yes (silhouette and colour; shared outline, screens and lighting) |
| Expressions readable on a phone | Yes in close-ups; small in the wide shot |
| Characters meaningfully animated, not repositioned portraits | Yes: rigged limbs, faces, props and effects; but simple, not film-grade |
| Verdict feels like an event | Yes (silence, slow stamp lift, slam, flash, shockwave, shake, red wash) |
| Substantially different from V1 | Yes |
| At least one joke with a visual payoff; ≥ 2 silent-readable moments | Yes (Kernel's crash; Wallet's empty wallet and exit; "STILL DEAD"; six silent-readable beats) |
| Pacing varied | Yes (fast cuts, held silences, a slow stamp lift) |
| Product clear; website visibly real; results authentic; CTA reason | The app reveal is real and labelled; the CTA is "WOULD IT SURVIVE?" with no URL (none exists) |
| Production quality | Clean decode, correct format, no black gaps, no dead audio, no text collisions after review |
| Would someone who doesn't know the app enjoy it? | I believe so, but that is the owner's judgement, not something I could test |

## G. Cost and external services

**None.** No paid Anthropic API request, voice service, stock asset or music was used. All footage was drawn or recorded locally; all audio was synthesised in code; fonts are the app's own. Claude Code ran on the owner's subscription session.

## H. Final assets (absolute paths)

`C:\Users\MattD\Development\AI-ROAST-MY-IDEA-phase2\artifacts\phase-6-cinematic\`
- `AI_ROAST_MY_IDEA_CINEMATIC_V2.mp4`
- `AI_ROAST_MY_IDEA_CINEMATIC_COVER_V2.png`
- `AI_ROAST_MY_IDEA_CINEMATIC_V2.srt`
- `storyboard.md`, `creative-direction.md`, `character-bible.md`, `media-source-manifest.md`, `media-validation.md`
- `characters\` (`sterling.svg`, `kernel.svg`, `hype.svg`, `wallet.svg`, four `*-expressions.png`, `lineup.png`, `group-shot.png`)
- `raw\mobile-raw.webm` (the real-app recording), `work\` (intermediate renders), `stills\`

Rebuild: `node scripts/trailer/render.mjs frames`, `node scripts/trailer/audio.mjs`, `node scripts/trailer/render.mjs compose`, `node scripts/trailer/cover.mjs`, `node scripts/trailer/export-characters.mjs`, `node scripts/trailer/srt.mjs` (the app must be serving on port 3200 only to *re-capture*: `node scripts/trailer/capture-app.mjs mobile`). The `artifacts/` folder is gitignored (V1 is untouched); the source and text documents are committed.

## I. Next owner action

**Watch `AI_ROAST_MY_IDEA_CINEMATIC_V2.mp4` on your phone with sound on and tell me three things:** does the opening make you stay; does the stamp feel like an event; and are the character "voices" charming or irritating. Those are the three judgements I could not make. Everything else (re-capturing the app clip on the current prompts, replacing voices, or upgrading the animation) follows from your answers.

Publication remains blocked by the launch prerequisites in `docs/phase-5-final-report.md` (console spend limit, shared rate limiting, a live verification run) and by the absence of a public URL.
