# Media validation

Verified on the delivered file `AI_ROAST_MY_IDEA_CINEMATIC_V2.mp4`.

## Technical (ffprobe / ffmpeg)

| Check | Result |
|---|---|
| Container / video | MP4, H.264 High, `yuv420p`, limited ("tv") range, **1080 × 1920**, **30 fps**, ~5.6 Mb/s |
| Audio | AAC-LC, 44.1 kHz, stereo, ~197 kb/s |
| Duration | **34.80 s** (target 25 – 35 s) |
| Size | 25.2 MB, `+faststart` |
| Full decode (`ffmpeg -f null`) | **clean, no errors** |
| Cover | `AI_ROAST_MY_IDEA_CINEMATIC_COVER_V2.png`, 1080 × 1920 |
| Subtitles | `AI_ROAST_MY_IDEA_CINEMATIC_V2.srt`, 15 cues generated from the same timeline as the animation (on-screen text and dialogue cards; there is no spoken narration) |
| Black frames (`blackdetect`) | **none** (one 0.17 s near-black gap at the end-card opening was found and fixed) |
| Static holds ≥ 0.5 s (`freezedetect`) | three, all inside the **real-app segment** (28.5 – 29.1, 29.5 – 30.1, 30.9 – 31.7 s): the genuine UI settling between its own animations. The animated sections have none. |
| Dead audio (< −40 dB for ≥ 0.3 s) | none |

## Audio, measured (no listening: see limits below)

| Measure | Value |
|---|---|
| Integrated loudness | **−13.8 LUFS** (social target about −14) |
| Loudness range | 3.8 LU |
| Peak | −0.8 dBFS (after AAC) |

| Beat | Mean / max (dB) | What it shows |
|---|---|---|
| Hook (1 – 3 s) | −17.0 / −3.4 | Drone, heartbeat, hit |
| **Silence 1** (4.9 – 5.3 s) | **−26.5** / −14.5 | The deliberate comic silence, about 10 dB under the scene |
| Sterling's line | −16.8 / −1.8 | |
| Kernel blue-screen | −16.4 / −0.5 | |
| **Silence 2** (18.2 – 18.8 s) | **−27.8** / −11.4 | The pre-verdict silence |
| **Stamp impact** (19.85 – 20.35 s) | −10.3 / −2.7 | Loudest event in the film |
| Real-app reveal | −14.2 / −2.4 | Bright bed, so energy doesn't drop at the reveal |
| End sting | −17.8 / −4.0 | |

Dynamics are deliberate: tension → silence → impact → bright reveal → sting.

## Visual review performed

I inspected, as images: the character sheets (all 4 judges × 6 poses), stills at every act boundary and key beat, a half-second contact sheet of the whole film, and full-resolution frames of the cover and the opening frame. Review changed the film. Defects found and fixed:

| Defect | Found by | Fix |
|---|---|---|
| Frame 0 washed out and blurred (flash + whip blur on the first frame) | still of t = 0 | flash starts on frame 1; no blur on frame 0 |
| Hook text collided with Sterling's head; Sterling's bench clipped Hype's quiff | still at 1.2 s | layout shifted; camera retargeted |
| Judges' arms hidden behind bodies; left/right swing signs inverted; stamp pointed the wrong way when raised | first character sheet | draw order, sign convention, stamp counter-rotation |
| Dialogue card chip overlapped the card and clipped the role label | still at 8.6 s | card layout rebuilt |
| Verdict panel covered Sterling's face; later covered the stamp lift | stills at 18.8 / 19.6 s | panel moved down, faded before the push-in |
| FIX card sat on Wallet's face during his "NO WALLET" reaction | still at 24.8 s | split into a top banner + a separate score panel with its own timing |
| "+22 POINTS" collided with the second stamp and the judges' faces; end-card lines collided | stills at 26.6 / 33 s | stamp clears first; text moved into the gap; end card re-laid out inside the safe zone |
| Calculator "£0.00" upside-down; cuffs drawn off the sleeves | Sterling expression sheet | counter-rotation sign; cuff position |
| **Real-app clips landed on blank / loading UI** (the FIX clip started on the "rebuilding" blur) | whole-film contact sheet | source times re-chosen from the raw recording, frame by frame |
| "THE REAL APP" chip overlapped the app's own heading | contact sheet | merged into the bottom disclosure plate |
| A clip-duration total (4.9 s) didn't match the 4.8 s slot | the render script's own guard refused to build | durations corrected |
| Near-black gap at 31.8 s; frozen final hold | `blackdetect` / `freezedetect` | white flash into immediate eyes; slow push on the end card |
| Audio: planned silence not silent; real-app segment dead; +0.3 dBFS peak | signal analysis | riser cut earlier, reveal bed added, EBU R128 normalisation |

## Safe areas

By construction: nothing essential above y 250 or below y 1470 (see `storyboard.md`). Checked from the layout constants and the frames; **not** tested inside Instagram, TikTok or YouTube Shorts.

## NOT verified: read this

- **I did not watch the film at speed or listen to it.** My tools extract frames and measure signals. Comic *timing* (whether the silence is the right length, whether the stamp feels like an event, how the synthesised "voices" sound) is judged from the cue list and level measurements, not heard. **The owner's first real viewing is the first real test of timing and sound.**
- The synthesised voices and effects are pitched babble and simple tones. They may sound cheap or grating on a phone speaker; that is a subjective risk I cannot rule out.
- The animation is 2.5D layered vector, not 3D. Acting is real (anticipation, holds, reactions) but limb movement is simple and lip movement is open/close only. I believe it is entertaining and original; whether it reaches "premium animated-film" quality is the owner's call, and I do not think it fully does.
- Platform behaviour (compression, overlays, captions) is untested.
- The real-app footage replays stored output and shows an invented founder backstory in the FIX pitch for about 1 s (see the manifest).
