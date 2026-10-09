# Media validation and source manifest

All files are in `artifacts/phase-5-launch/`. Rebuild with `scripts/launch/` (`capture.mjs`, `render.mjs`, `cover.mjs`); the raw captures are in `raw/`. This folder is gitignored except the text deliverables.

## Verdict: technically complete, DRAFT for review. Not cleared for publication.

Publication is held for the reasons in `posting-package.md`: the footage is a replay of earlier real output (not a fresh live capture), no public URL exists, and launch prerequisites are open.

## Source manifest (what each shot is)

| Class | Meaning here |
|---|---|
| **Real app UI** | Recorded from the production build (`next start`) in headless Chromium. Real components, animations, pacing, skip and "next witness" controls. |
| **Prerecorded real model output** | The Claude Haiku 5.5 roast and FIX for "mobile bike repair van" from `bench/results/2026-10-08T19-08-52-final-10/results.json` (prompt version `2026-10-08.4`), fed to the app by intercepting `/api/roast/stream` and `/api/fix`. |
| **Live** | **None.** No live model request was made for any asset. |
| **Mocked / staged** | The interception itself. The app was started with `AI_PROVIDER=demo`; no API call, no key. The stream's `start` event says `mode: "ai"`, so the app shows its "Live AI panel" badge as it would for AI output. The video's on-screen label states it is a replay. |
| **Added by the edit** | Cuts, speed-ups, burned-in captions, the SAMPLE SESSION label, original synthesised audio (drone, ticks, one low hit), and the cover layout. |

Edits that change timing but not content (all disclosed here, none changes what any judge said):
- Reel: typing sped 3.4×, the analysis screen 2.4×, the debate 1.5×. Each judge is shown for about 3 s, i.e. mostly the opening lines being typed, at 1×.
- Reel cold open (0–2.6 s) is the verdict screen taken from later in the session, then the story starts from the beginning.
- Demo: judges at 1.4×, debate 3.2×, typing 3×, FIX page 1.6–2×.
- Caption quotes are exact sentences from the recorded output, trimmed to one sentence where the original is longer: KERNEL's is the second sentence of its headline ("The hard part is not fixing bikes. It is fixing them on a pavement…"); WALLET's is the end of its headline ("…I would never tell my partner what it cost."). The 52/100 verdict and the FIX projection 52 → 68 are the recorded values, and the app itself labels the projection as the panel's estimate.

Reel segment timeline (output seconds | speed | source second in `mobile-raw.webm`):

| Segment | Output | Speed | Source |
|---|---|---|---|
| hook (verdict screen) | 0–2.6 | 1× | 89.75 |
| typing the idea | 2.6–4.6 | 3.4× | 3.47 |
| panel assembling | 4.6–6.4 | 2.4× | 10.23 |
| STERLING | 6.4–9.1 | 1× | 16.4 |
| KERNEL | 9.1–12.0 | 1× | 28.78 |
| HYPE | 12.0–15.0 | 1× | 43.47 |
| WALLET | 15.0–18.0 | 1× | 49.78 |
| debate | 18.0–21.2 | 1.5× | 64.04 |
| verdict | 21.2–25.2 | 1× | 91.85 |
| FIX MY IDEA | 25.2–28.8 | 1× | 106.95 |
| call to action | 28.8–31.6 | 1× | 113.29 |

(`reel-timeline.json` and `demo-timeline.json` hold the machine-readable versions.)

## Technical verification (ffprobe / ffmpeg, run on the final files)

| File | Container / video | Audio | Duration | Decode |
|---|---|---|---|---|
| `AI_ROAST_MY_IDEA_LAUNCH_REEL_V1.mp4` | H.264 High, yuv420p, **1080×1920**, 30 fps | AAC-LC, 44.1 kHz mono, peak −0.6 dB | 31.6 s | full decode, no errors |
| `AI_ROAST_MY_IDEA_DEMO_V1.mp4` | H.264 High, yuv420p, **1920×1080**, 30 fps | AAC-LC, 44.1 kHz mono, peak −0.8 dB | 67.5 s | full decode, no errors |
| `AI_ROAST_MY_IDEA_COVER_V1.png` | PNG, **1080×1920** | n/a | n/a | n/a |

`+faststart` is set. No watermark; no letterboxing (both videos fill the frame). Sizes are 13 MB (reel) and 22 MB (demo).

## Visual review performed

I reviewed contact sheets (about one frame per 1.3–2.5 s) of both videos and individual frames at the cuts, and revised the edit from them: the hook was moved to the verdict stamp; the verdict caption was shortened so it no longer covered the typed closing line; the FIX shot was moved so the score has finished counting to 68 (an earlier cut showed 63/67 against a caption saying 68); the CTA was lifted off the app's button; the cut alignment was fixed after a drift was found; and the disclosure label was moved off the app header in the demo. The cover was reviewed at thumbnail size and re-laid-out twice.

Creative-gate answers, honestly: the first frame is the verdict stamp ("FIX IT", 52/100) under the hook text, which reads without sound; the four judges are distinct by colour and name; the sandwich line and "never tell my partner what it cost" are the amusing ones; the verdict is the payoff; FIX MY IDEA's 52 → 68 is shown; the CTA is "Would your business idea survive? Link coming soon" (no URL invented). The opening 2 seconds are a still-ish verdict screen rather than motion, which is a weakness to judge on a real phone.

## Not verified (be aware)

- **Not watched or listened to in real time.** Review was frame-based. I measured the audio level but have not listened to it; the bed is deliberately quiet (mean about −28 dB) and the hit may be too subtle or too sharp on a phone speaker.
- **Safe areas** were set by position (captions sit between roughly y 1190–1500 of 1920; the label at y 1548) from commonly cited platform overlay sizes, not checked inside Instagram, TikTok or YouTube.
- **Subtitles** (`.srt`) are generated from the same list as the burned-in captions; timings match by construction, but I did not load them in a platform uploader. The captions are burned in, so the `.srt` is optional.
- The footage was recorded on a machine under test load; a few frames show the app mid-transition (blur-in). None shows an error.
- The app's persona-name wrap fix and the `overflow-wrap` change were made during this phase. The desktop footage was recorded after the persona-name fix; the later heading-wrap refinement does not affect these screens.

## Verification pass (2026-10-09, after the first render)

Re-probed both files (unchanged: H.264 High yuv420p, 1080×1920 and 1920×1080, 30 fps, AAC-LC; 31.6 s and 67.5 s; full decode with no errors) and re-read frames at the cuts. Defects found in the first render, all fixed by re-rendering from the retained raw footage:

- **Caption legibility.** Captions and the SAMPLE SESSION label sat on a 42% / 55% black box, so dense app text (the FIX pitch, the first-steps list) showed through and collided with them: the "FIX MY IDEA rebuilds it" caption and the "Would your business idea survive?" CTA were hard to read, and the CTA caption hid half of step 3. The boxes are now 94% (reel) / 85% (demo) opaque.
- **Stray fragment in frame 1.** The app's own closing-line quote peeked out beside the hook caption as a lone "“On". The hook now has a full-width opaque band starting just below the FIX IT stamp (the first version of the band clipped the stamp; moved down).
- **Orphaned word.** The demo's last caption wrapped to a single-word second line ("it."). Reworded to "New pitch, what changed and why, plus three steps to test it." (the demo `.srt` follows automatically).

Still not verified: I did not watch the videos at speed or listen to the audio, and the safe areas were not checked inside Instagram, TikTok or YouTube.
