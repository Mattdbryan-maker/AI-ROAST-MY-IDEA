# Phase 4 report: release-candidate hardening

Branch `phase-2-ai-intelligence`, started from `901b6cf`. Prompt version `2026-10-08.5`. Not pushed, merged or deployed.

## A. Verdict

**CONDITIONAL GO for a small controlled beta.** Do not launch until the three "Remaining blockers" below are cleared. The largest is that **the live Haiku browser journey was not run**: no `ANTHROPIC_API_KEY` was available in this environment (the owner moved Claude Code to a subscription login, and the key was removed from the session). Nothing in this report claims a live result from the new prompts or checks.

## B. Commits and files

Final HEAD is reported in the hand-off message (the commit includes this report). Files changed:

- Source: `src/lib/types.ts`, `src/lib/ai/{normalize,checks,prompts,model-provider,anthropic,stream,index,pricing}.ts`, `src/lib/{guards,rate-limit,api-helpers}.ts`, `src/instrumentation.ts`, `src/app/api/roast/stream/route.ts`, `src/app/globals.css`
- Bench: `bench/heuristics.ts`, `bench/pricing.ts` (re-export; table moved to `src/lib/ai/pricing.ts`)
- Tests: new `tests/{truncation,grounding,guards}.test.ts`; updated `tests/{anthropic,config,fix-quality}.test.ts`, `e2e/journey.spec.ts`, `playwright.config.ts`
- Docs/config: `.env.example`, `docs/models-and-costs.md`, this report

## C. Truncation and invented biographies

**Root cause of the two remaining ellipses.** Phase 3B fixed only `firstSteps` and `pitch`. `tagline` (limit 140) and `changes[].after` (limit 280) still went through `cleanText`, which cuts and appends `…`. The prompt did not give Haiku those limits either. The two real cases: the secondhand-fashion tagline and the super-app change's "after" (cut right before "still requires a…").

**Fix.**
- One `LIMITS` table in `types.ts` is the single source for the Zod schemas, the normaliser, the live stream and the prompt wording. Schema and UI agree because the UI renders whatever the schema accepts.
- Every FIX field is now rejected (so the one retry runs), never cut. Limits were raised only where genuinely too tight (tagline 200, before 320, after 480, why 420), with the prompt asking for less (~110 / 200 / 300 / 280).
- The roast is already on screen when it is normalised, so over-long roast text loses whole trailing sentences, never words, with no ellipsis. If even the first sentence is too long the response is rejected and retried.
- The retry now tells the model why the first attempt was rejected.
- The schema counts code points, matching the normaliser (emoji count as one).

**Invented biographies.** Of 20 stored Haiku FIXes, 5 invented founder backstory ("I'm Sam and I've spent years…", "I keep killing houseplants", "I bake sourdough at home", "a human writer (me, at first)"). Three layers:
1. Prompt: explicit rule with those examples; open with the customer or product, never a backstory.
2. Pitch: invented sentences are cut out whole; if the same sentence also carries a price or percentage, or too little pitch remains, the response is rejected and retried instead.
3. Tagline, changes and steps: a biography found there is rejected and retried.
Facts the user supplied are preserved (a name or experience stated in the original pitch is allowed; a bare "I'd like to build…" is not a fact). The same detector run over the stored Qwen results: 0 hits. Over Haiku: exactly the 5 known cases.

**Tests** (`tests/truncation.test.ts`, `tests/grounding.test.ts`) use the exact failing strings. The two cut strings in the benchmark were already truncated, so the full sentences are my reconstruction, and the test asserts each is longer than the old limit.

## D. Content quality and business reasoning

- Arithmetic checker now evaluates whole chains (`40 × £15 × 12 = £7,200`). The earlier two-term check wrongly flagged that correct product; fixed. Only written-out equations are checked; prose arithmetic is not.
- New detector for market statistics stated as fact ("62% of consumers…", "£Xbn market", "studies show", "according to"). It found 0 in the stored outputs, so it is a guard, not a fix for an observed failure. Framed assumptions and figures from the pitch are exempt.
- Projected scores: gain cap lowered 25 → 20, absolute ceiling 85, prompt asks +5 to +15.
- Prompts: costs must appear in each change's `after`; customer behaviour must be hedged; every number traceable to the pitch or labelled an assumption.
- Personality: the self-reference rule now has wrong/right examples (the stored Haiku output had 8 self-references, e.g. "STERLING's maths holds" from the investor) and a line protecting the four voices. Persona definitions were not touched. **Whether the dialogue is still funny is not verified**: no new model output was generated. Judge this in the first live run.
- Roast output ceiling lowered 16000 → 8000 tokens (a roast is about 1.5–2k).

## E. Live Haiku browser results

**Not run. Blocked: no API key in the environment.** No timings, screenshots or charges exist for a live journey. Estimated charge if run: about $0.003 per journey (measured ≈$0.002 earlier), well under the $0.03 allowance. See section L.

## F. Mocked browser results (not live-model validation)

Playwright against the demo provider with intercepted responses. New tests render every roast and FIX field at its **maximum** length with a unique end marker, on desktop and mobile, and check each marker is visible, nothing is clipped and there is no horizontal overflow. They found one real bug: a long URL in a pitch or step made the mobile page scroll sideways (434px of text in a 332px box). Fixed with `overflow-wrap: anywhere` on `body`; no other visual change.

## G. Automated test results

| Gate | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | 237/237 (19 files) |
| `npm run build` | succeeds |
| `npm run test:e2e` | 12/12 (desktop + mobile) |
| `npm run test:e2e:ollama` | 3/3 (mock Ollama server) |

Two test-side lessons: a first e2e run failed 8 tests because the shared per-client limiter (20/10 min) correctly throttled the heavier suite, so the e2e server now sets `RATE_LIMIT_PER_10_MIN=1000`; and a locator bug in my own test (button relabelling after click).

## H. Desktop and mobile visual findings

Screenshots show max-length text wrapping inside the viewport at both sizes, with the URL wrapping rather than overflowing. I viewed the mobile FIX capture directly (long, as expected for max-length content). The cinematic UI was not redesigned. I did not visually inspect the desktop captures or the live provider badge.

## I. Security, rate limiting, cost, operations

Fixed and verified (unit tests, per instance):
- **Client IP trust.** `CLIENT_IP_HEADER` names the edge-controlled header; otherwise in production the last `x-forwarded-for` entry is used (the first is client-forged). Rotating a spoofed first entry no longer yields a fresh bucket. The limiter table is capped (10k keys, then a shared overflow bucket).
- **Daily caps.** In production on Anthropic, defaults apply with no configuration: 1000 requests/day and $5/day estimated spend per instance. Malformed requests are rejected before they consume the allowance.
- **Concurrency.** At most 8 simultaneous generations (`MAX_CONCURRENT_AI`); the slot is released on completion, failure or client disconnect.
- **Body limit** 64k characters; output ceilings 8000 tokens; unknown-price models are costed at the highest known rate, never free.
- **Visibility.** `src/instrumentation.ts` logs the effective model and limits at boot (never keys) and warns about a missing `CLIENT_IP_HEADER`, a non-Haiku model, or no caps. Each provider call logs one `ai_usage` JSON line.
- **Model.** Default is now `claude-haiku-5-5`; the missing-key case already errors clearly and never substitutes the demo (existing test). `.env.local` untouched and ignored.

**Not solved, by design:** all counters are in memory, per instance, and reset on restart. On serverless every instance counts separately. The spend figure is an estimate from reported tokens. None of this is a true global limit or an account cap.

Edge cases covered by tests: invalid JSON, oversize body, bad schema, malformed model JSON, provider failure, slot release on throw/cancel, retry exhaustion. Overlapping sessions are only covered at the slot level, not with a live concurrent load test.

## J. Launch blockers (most severe first)

1. **Account-level spend limit** in the Anthropic console. Required configuration; the in-app guards cannot replace it.
2. **Shared rate limiting.** If deployed on multiple instances or serverless, add a shared store (e.g. Upstash Redis) before relying on any limit. Single long-lived instance: acceptable for a small beta.
3. **Live Haiku validation not done.** The new prompts and rejection rules are unproven against the real model; stricter checks could raise the retry rate or the failure rate. Run the smoke test and watch for repeated retries.
4. Optional later: error-count alerting beyond logs, uptime check on `/api/status`, a "projected scores are estimates" hint on shared cards, an automated bench run to measure the new retry rate.

## K. Environment and prerequisites

Required: `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` (server-side secret), `ANTHROPIC_MODEL=claude-haiku-5-5` (also the default), `NEXT_PUBLIC_SITE_URL`.
Recommended: `CLIENT_IP_HEADER` (platform's edge header), `DAILY_SPEND_LIMIT_USD`, `DAILY_AI_REQUEST_LIMIT`, `MAX_CONCURRENT_AI`, `RATE_LIMIT_PER_10_MIN`. Leave `SHOW_AI_ERRORS=false`. Local development: `AI_PROVIDER=ollama` with `OLLAMA_MODEL=qwen3.5:4b` (unchanged). Plus the console spend limit above.

## L. One next action

Set the key for one shell only and run the live smoke test (≈$0.003):

```powershell
cd C:\Users\MattD\Development\AI-ROAST-MY-IDEA-phase2
$env:ANTHROPIC_API_KEY = "<key>"; $env:AI_PROVIDER = "anthropic"; $env:DAILY_SPEND_LIMIT_USD = "0.03"
npm run build; npm start
```

Open http://localhost:3000, confirm the badge says "Live AI panel", run one idea through to FIX, and check the server log for `ai_usage` lines and any "retrying once" warnings.

## M. Artifacts

Screenshots (local, gitignored): `bench/results/evidence/phase4-{roast,fix}-max-length-{desktop,mobile}.png`. Source benchmark: `bench/results/2026-10-08T19-08-52-final-10/`. Unit tests under `tests/`; e2e in `e2e/journey.spec.ts`.

## Recommendation

**Ready for a small controlled beta once the Anthropic console spend limit is set and one live Haiku journey has been watched through to FIX.** Neither has happened yet. The code, tests and cost controls are in place; what prevents launch today is that the real-model path has not been exercised since these changes, and that the only abuse protection is per-instance.
