# Phase 5 report: intelligence refinement, validation and launch media

Branch `phase-2-ai-intelligence`, from Phase 4 HEAD `857c337`. Prompt version `2026-10-09.1`. Not pushed, merged, deployed or published.

## A. Executive verdict

- **Phase 5 status: complete offline; live validation blocked.** Every engineering change, test gate, and media deliverable was produced. The live Haiku run did not happen: no `ANTHROPIC_API_KEY` was available, and no paid request was made.
- **Release readiness: CONDITIONAL GO for a small controlled beta, same as Phase 4, with one more condition made explicit:** the prompt changes below are untested against the real model and must be checked against `docs/editorial-review-fitness-coach.md` before anyone sees them.
- **Media: technically finished, approved-for-review DRAFTS, not publication-ready.** They are real app footage with a replay of earlier real Haiku output, clearly labelled, with no public URL.

## B. Engineering changes

Final HEAD is given in the hand-off message (the commit contains this report).

| Area | Change and reason |
|---|---|
| `src/lib/ai/prompts.ts` | Prompt version `2026-10-09.1`. Rules against stating any competitor or substitute price, comparing unlike products, mixing up retention/churn/conversion/revenue/profit, inventing CAC or benchmarks, and criticising features the pitch never mentioned (ask instead; assume the simplest workable version). FIX: every change answers a named objection, change as little as needed, never present the original as new, never "fix" an assumed flaw. Personas sharpened per the brief (STERLING's cruelty is arithmetic; KERNEL never invents requirements and asks pointed questions; HYPE finds the angle and does not demand virality; WALLET reacts as a customer). Explicit "BUILD IT is reachable" and a "short and quotable" instruction. FIX also receives the roast's strengths ("keep what works"). |
| `src/lib/types.ts`, `normalize.ts`, `FixResultView.tsx` | New optional `scoreNote` on a FIX: why the overall moves, and the trade-off for any critic whose projected score falls. If a projected score falls with no note, the response is rejected and retried with that reason. The note is shown under the re-score panel (one small paragraph; no other UI change). Overall and verdict are still always recomputed from the four scores. |
| `src/lib/ai/checks.ts` | Fixed a hole found by the new tests: a pitch saying "I'm building…" counted as a stated founder fact, which would have allowed an invented "I spent ten years as a trainer". Founder facts now need a statement of experience, not just first person. |
| `Analyzing.tsx`, `demo/analyze.ts` | Loading text no longer claims work the app does not do. The "Tribunal log" is a local keyword scan, so "market detected", "competitors · enumerating", "Analysing market", "Checking feasibility", "Finding competitors", "Consulting spreadsheets", "Checking the maths" were reworded to what really happens ("topic", "price or revenue · mentioned", "Reading the pitch", "Briefing the panel"). Tone kept. |
| `globals.css`, `Trial.tsx` | **A regression from my Phase 4 mobile fix:** a global `overflow-wrap: anywhere` split the persona name "STERLING" into "STERLIN / G" on a 1920 px desktop. Found while capturing footage. The rule is now scoped to body text and headings, and the persona-name heading is excluded (it needs its natural min-content width). The long-URL mobile fix is preserved. |
| Tests / e2e | `tests/fitness-coach.test.ts` (new); a 1920 px desktop test that persona names stay on one line; `e2e` max-length tests still pass. |
| `scripts/launch/` | `capture.mjs`, `render.mjs`, `cover.mjs`: the reproducible media pipeline (no new dependencies; uses Playwright and ffmpeg already present). |

## C. Intelligence corrections (what is and is not proven)

The earlier fitness-coach recording's transcript is not in the repository, so the failing strings in the tests are **reconstructed from the owner's description**, and the tests say so.

- **A. Commercial comparison.** Prompt-level only: no competitor prices; compare like with like; conditional framing; fair verdicts (BUILD IT reachable). A deterministic price-claim detector was deliberately **not** added: it would need brittle matching of what counts as a competitor and would reject valid writing.
- **B. Lifetime-value reasoning.** The existing arithmetic check (which now handles whole chains such as `£9.99 × 3 × 0.4 = £28`) and the unverified-statistic check catch the reconstructed errors in tests. Retention and churn confusion is prompt-level only.
- **C. Invented requirements.** Prompt-level only: criticise what is written, ask when a detail is missing, assume manual logging.
- **D. FIX logic and score consistency.** Partly deterministic: score cap +20 and ceiling 85 (Phase 4); falling scores must carry a `scoreNote` or the response is retried; overall and verdict are recomputed. "Every change answers a real objection" and "does not restate the original" are prompt-level; nothing in code can verify them.
- **Dialogue and personality.** Prompt-level. Whether the lines are funnier, less self-referential or more distinct is **unmeasured**; no model output was generated this phase. Use the checklist in `docs/editorial-review-fitness-coach.md`.

Honest summary: the deterministic parts are tested and cannot regress silently; the reasoning improvements are instructions to a model and are unproven until a real run is read.

## D. Testing

| Gate | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **254/254** (20 files; was 237) |
| `npm run build` | succeeds |
| `npm run test:e2e` (demo provider, mocked responses, desktop + mobile) | **13/13** |
| `npm run test:e2e:ollama` (mock Ollama server) | **3/3** |

Categories: unit and deterministic tests run on every commit; the browser tests use the demo provider and intercepted responses (mocked); the Ollama tests use a mock server, not a real Qwen; the only real Haiku output in this phase is the recorded benchmark data used in the video; **no newly authorised real Haiku test ran**. Remaining uncertainty: real-model behaviour on the new prompts, including whether the stricter checks raise the retry or failure rate.

## E. Application experience

Observed in the recordings (desktop 1920×1080, mobile 540×960 CSS px at 2×), from a replayed stream, so first-token latency of a real model is **not** represented:
- Analysis screen runs about 6 s before the first judge; the first judge's headline types within about 3 s of appearing; the skip and "next witness" controls work. With a slow model the app keeps cycling its stalling messages, now all honest or purely theatrical ("Sharpening knives").
- Long pitches, 64-character unbroken titles and URLs wrap on mobile and desktop (e2e covered).
- Bugs found and fixed: the "STERLIN/G" wrap (section B). Observed but not changed: nothing else.
- Screenshots: `bench/results/evidence/phase4-*-max-length-*.png` (Phase 4), plus the frame sheets in `artifacts/phase-5-launch/` (`sheet_reel.png`, `sheet_demo.png`) and `raw/*-final.png`.

## F. Media deliverables (absolute paths)

- `C:\Users\MattD\Development\AI-ROAST-MY-IDEA-phase2\artifacts\phase-5-launch\AI_ROAST_MY_IDEA_LAUNCH_REEL_V1.mp4` — 1080×1920, 31.6 s, 30 fps, H.264 High + AAC
- `…\AI_ROAST_MY_IDEA_DEMO_V1.mp4` — 1920×1080, 67.5 s, 30 fps, H.264 High + AAC
- `…\AI_ROAST_MY_IDEA_COVER_V1.png` — 1080×1920
- `…\AI_ROAST_MY_IDEA_LAUNCH_REEL_V1.srt` (and `…_DEMO_V1.srt`)
- `…\posting-package.md`, `…\media-validation.md`

Source authenticity: real app UI, replaying the recorded real Haiku 5.5 bike-repair roast and FIX from the 2026-10-08 benchmark; nothing live; nothing fabricated; the previous flawed fitness-coach run was not used. The on-screen label says "SAMPLE SESSION · real Claude Haiku 5.5 output, recorded earlier, replayed in the live app". Details and the exact edits that change timing are in `media-validation.md`. Both videos decode cleanly and were checked with ffprobe; I reviewed frames, but did not watch or listen in real time (see "Not verified" there).

The idea shown is a bench idea, not a user's. The sample session is the strongest honest option without a live key; a fresh capture would be better (see I).

## G. Launch readiness

**CONDITIONAL GO** for a small controlled beta. Blockers, most severe first:

1. **Anthropic console spend limit not confirmed set.** The in-app caps ($5/day, 1000 requests/day per instance by default in production) are estimates and per instance.
2. **No shared rate limiting.** Phase 4's per-instance counters, trusted-IP header (`CLIENT_IP_HEADER`) and concurrency cap protect one long-lived server only. **Smallest production-ready fix** (not built; needs your approval and a free/low-cost account): host on a platform that supplies a trusted client-IP header (Vercel: `x-vercel-forwarded-for`), add **Upstash Redis** with `@upstash/ratelimit` (sliding window per IP, plus a daily global counter incremented by estimated spend), and set `CLIENT_IP_HEADER` to the platform header. Until then: run a **single instance** only.
3. **Real-model behaviour unverified on the new prompts** (section C). Run one live journey and apply the editorial checklist before beta.
4. Hosting not chosen or stable; no public URL checked.
5. Optional: alerting beyond logs, an uptime check on `/api/status`, a captured live run to replace the replay footage.

Prerequisites are unchanged from Phase 4, section K (`AI_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL=claude-haiku-5-5`, `NEXT_PUBLIC_SITE_URL`, recommended `CLIENT_IP_HEADER`, `DAILY_SPEND_LIMIT_USD`, `DAILY_AI_REQUEST_LIMIT`, `MAX_CONCURRENT_AI`, `RATE_LIMIT_PER_10_MIN`, `SHOW_AI_ERRORS=false`). No traffic should be directed to the app, and no post made, until 1–4 are done and you approve.

## H. Cost

**No paid external API request was made in Phase 5**, so no application API charges. No key was used or exposed. Claude Code ran on the owner's subscription session; nothing was routed through API billing by me. Estimated cost of the one live smoke journey still owed: about $0.003.

## I. Single next owner action

Set the key for one PowerShell session only and run the live smoke journey, then read it against `docs/editorial-review-fitness-coach.md`:

```powershell
cd C:\Users\MattD\Development\AI-ROAST-MY-IDEA-phase2
$env:ANTHROPIC_API_KEY = "<key>"; $env:AI_PROVIDER = "anthropic"; $env:DAILY_SPEND_LIMIT_USD = "0.03"
npm run build; npm start
```

Run the AI fitness-coach pitch from the checklist through to FIX (about $0.003). If it passes, the same session can be re-recorded with `scripts/launch/` for a non-replay version of the video.

## Recommendation

Is it ready for a small controlled beta? **Not yet, but close:** the code, tests, cost guards and launch media are in place; what prevents launch is one live run to check the new prompts, a console spend limit, and (if you deploy beyond a single server) shared rate limiting. The launch video can be reviewed now but should not be posted until those are done and its replayed footage is either replaced or kept with the disclosure.

## Independent verification pass (2026-10-09)

A second session re-checked the claims above rather than redoing the work. HEAD at the start was `b5ce50d`.

- **Gates re-run:** lint clean, typecheck clean, `npm test` 254/254, build succeeds, `test:e2e` 13/13, `test:e2e:ollama` 3/3 (mock Ollama server). The first `test:e2e` attempt failed with timeouts while other CPU-heavy commands were running in parallel; on a clean rerun it passed 13/13, so that was contention, not a code fault.
- **Validators against real output.** All 46 stored real Haiku and Qwen FIX/roast outputs in `bench/results/` were replayed through the current `normalizeRoast` and `normalizeFix` with grounding context. 46/46 roasts pass; 45/46 FIXes pass. The one rejection is a real Haiku FIX (wedding-speech idea) whose pitch says "a human writer (me, at first) reads your draft…": the `(me, …)` pattern in `checks.ts` treats it as an invented founder claim. That sentence is listed as an intended invented-biography case in `tests/grounding.test.ts`, so I left the rule alone. It is a judgement call for the owner: about 1 in 46 replayed outputs would cost one retry. If it should be allowed, narrow the pattern to `(me, a former …)`-style descriptions.
- **Media defects found and fixed** (caption legibility, a stray text fragment in the hook frame, an orphaned caption word): see `artifacts/phase-5-launch/media-validation.md`, "Verification pass". `scripts/launch/render.mjs` is the only code change.
- **Unchanged conclusions:** no live Haiku run occurred and no paid request was made; the videos are review drafts built on replayed (not live) output; launch readiness stays CONDITIONAL GO with the same blockers (console spend limit, shared rate limiting, one live run against the new prompts).
