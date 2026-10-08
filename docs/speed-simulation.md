# How model speed affects the show (simulation)

**This is a simulation, not a model benchmark.** The mock Ollama server (`scripts/mock-ollama.ts`) replayed the demo engine's text over the real Ollama protocol at three assumed speeds, through the real Ollama client and streaming pipeline (`npm run bench`, run on 2026-10-08, prompts `2026-10-08.2`, 3 ideas each, FIX included). The speeds are assumptions chosen to represent typical setups. **They are not measurements of any real model**, and the text is not AI. What it does measure is how the app's pipeline and the cinematic pacing behave at each speed.

| Scenario | Assumed speed | Assumed first-token delay | Roughly like |
|---|---|---|---|
| Fast | 300 chars/s (≈75 tokens/s) | 0.8 s | A small model on a good GPU, or a fast API model |
| Medium | 150 chars/s (≈38 tokens/s) | 2.5 s | A mid-size local model on a consumer GPU |
| Slow | 50 chars/s (≈12 tokens/s) | 15 s | A 4B model on CPU only |

## Results

All 12 journeys completed with no restarts.

| Scenario | First speech | Roast complete | FIX complete | First testimony on screen* | Longest wait on a panelist* | Debate wait* |
|---|---|---|---|---|---|---|
| Fast | 1.4 s | 14.0 s | 9.1 s | 4.8 s | none | none |
| Medium | 3.5 s | 29.0 s | 19.2 s | 4.8 s | none | none |
| Medium, `DEBATE_MODE=multi` | 3.5 s | 40.2 s | 19.3 s | 4.8 s | none | none |
| Slow | 17.9 s | 94.1 s | 65.2 s | 18.4 s | 7.2 s | 17.1 s |

\* Estimated from the measured timings and the UI's pacing, assuming the viewer doesn't skip. Medians of 3 runs.

A real-browser run of the slow scenario confirmed the behaviour: the analysis sequence stalled gracefully ("Questioning assumptions…") and the trial started at 19.2 s. A panelist reached before their model output showed "gathering their thoughts", with no errors.

## What it means

- **Up to ~40 tokens/s with a first token within ~4 s, the model is invisible.** The 4.3 s analysis sequence covers the start, and the show's pacing (typing plus reading) stays ahead of generation.
- **The multi-call debate costs ~11 s of generation at medium speed but no visible wait,** because the debate is written while the viewer watches the testimonies. A viewer who presses *Skip to verdict* does wait for it ("The panel is still arguing").
- **At CPU-class speeds (~12 tokens/s) the experience degrades but stays intact.** There's an 18 s analysis, then pauses on later panelists and before the debate. That's acceptable for local or personal use, but not for the public experience.
- Measure real models on real hardware with `npm run bench` (see `bench/README.md`). The report's "What a viewer would experience" table applies the same estimate to real timings.
