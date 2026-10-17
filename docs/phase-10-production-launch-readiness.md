# Phase 10: production launch readiness

Date: 2026-10-17. Branch: `phase-10-release-candidate`. Nothing has been pushed, merged, deployed, purchased or published, and no hosted site exists.

Evidence labels used throughout:

- **Verified locally**: run on this machine against the real code, real HTTP, and the real production build.
- **Mocked**: the logic is real, the infrastructure behind it (Redis, Cloudflare, Anthropic) was replaced by a fake. It proves our decisions, not the provider's behaviour.
- **Unverified**: not testable without credentials or a hosted deployment. Stated as such.

---

## A. Executive summary

**What is complete.** The paid AI endpoints are now guarded by a shared, fail-closed admission layer: per-visitor and global limits, reserved spend (day and month), and a cross-instance concurrency pool, all held in one Upstash Redis store so every serverless instance sees the same numbers. Production refuses to guess its configuration (provider must be explicit, only `claude-haiku-5-5` is accepted). An optional server-side invite gate and Cloudflare Turnstile pass are implemented, along with security headers, draft privacy/terms/contact pages, anonymous analytics, an operator stats endpoint, a secret scanner and a hosted smoke-test script. All existing work (prompts, streaming, validation, cinematic UI) is untouched.

**What remains.** Only things that need your accounts or your decision: a Vercel project, an Upstash database, an Anthropic workspace with a spend limit, invite codes, your legal name and contact email, and approval to push. Nothing in the code is blocked.

**Ready for a protected beta?** **CONDITIONAL GO**: yes, once the external configuration in section I is done and the hosted smoke test in section I.5 passes. The code paths that depend on Upstash, Cloudflare, Vercel and live Anthropic were exercised with mocks or a deliberately broken store, not against the real services.

---

## B. Repository audit

| Item | Finding |
|---|---|
| Directory | `C:\Users\MattD\Development\AI-ROAST-MY-IDEA-phase2` (verified) |
| Remote | `https://github.com/Mattdbryan-maker/AI-ROAST-MY-IDEA.git` (public) |
| Branch at start | `phase-2-ai-intelligence`, HEAD `bf1e6a2` ("Phase 6: cinematic trailer…"), **9 commits ahead of `origin/phase-2-ai-intelligence`** (`b50985b`) |
| Uncommitted at start | one untracked file, `docs/COURTROOM_OPENING_PROOF_v2.mp4` (18.8 MB). **Not committed**; `*.mp4`, `*.webm`, `*.wav` are now git-ignored. |
| Open PR | #1 "Phase 2: Ollama/Qwen provider, model benchmark, smarter panel", base `main`, head `phase-2-ai-intelligence` at `b50985b`, state OPEN, mergeable |
| Divergence | `main` (`856cf31`) is an ancestor of HEAD: 0 commits behind, 14 ahead. `git merge-tree` produces a clean tree: **no conflicts**. The remote Phase 2 branch is also an ancestor: a fast-forward push is possible. |
| What is unpushed | Phases 3B-6 (Haiku fixes, guards, daily caps, release-candidate hardening, honest loading text, launch media scripts, cinematic trailer scripts), 80 files, ~6k lines |
| Release candidate | New local branch `phase-10-release-candidate` = the old HEAD plus two Phase 10 commits. The old branch is untouched. |
| Secrets in history | Scanned every commit's added lines for Anthropic keys, GitHub tokens, AWS keys, Slack tokens and private keys: **none**. `.env.local` is git-ignored (it holds only Ollama settings, no API key). Verified locally. |
| Large files | Largest tracked file is a 921 KB PNG (`artifacts/phase-5-launch/…COVER_V1.png`). No video or audio is tracked. `/artifacts/` is ignored. |

**Recommended integration path** (section J gives the commands): push `phase-10-release-candidate`, then either fast-forward the existing `phase-2-ai-intelligence` branch to it (this updates PR #1 in place and keeps history linear) or open a new PR from the release-candidate branch. I recommend updating PR #1, because its description is about the AI layer that these commits complete.

---

## C. Security

### C.1 What was wrong, and what replaced it

| Before | Problem in serverless | Now |
|---|---|---|
| In-memory per-IP limit | Each instance counted alone; resets on cold start | Shared Redis counters (burst, per-visitor daily) |
| In-memory daily request cap and spend ledger | Per instance; `DAILY_SPEND_LIMIT_USD=5` was really `5 × instances` | Shared global day and month reservation counters |
| In-memory concurrency (8) | Per instance | Shared slot pool (default 4 across all instances), slots self-expire after 150 s |
| `X-Forwarded-For` trust depended on config | Easy to spoof if misconfigured | On Vercel the app uses `x-vercel-forwarded-for` automatically (Vercel overwrites `x-forwarded-for` and never forwards a client-supplied value; see the Vercel "Request headers" page) |
| Missing key in production | Silently served canned **demo** roasts | `AI_PROVIDER` must be set; missing key is a clear 503 |
| Any `ANTHROPIC_MODEL` accepted | A typo or edit could select a 20-40x dearer model | Production accepts only `claude-haiku-5-5` unless `ANTHROPIC_ALLOWED_MODELS` is widened on purpose (applies to the FIX model too) |

The legacy in-memory guards still apply, unchanged, for demo, Ollama and development, so the existing behaviour and 254 earlier tests are intact.

### C.2 Layers

1. **Anthropic account controls** (owner action, section I.3). Verified from Anthropic's rate-limits page: a monthly spend limit you set is enforced; reaching it returns HTTP 400 `invalid_request_error` ("You have reached your specified API usage limits…"). Limits cannot be set on the default workspace, so create a dedicated workspace. Not verified: whether in-flight requests can overshoot, whether usage reporting lags, and whether email alerts exist (the page describes limits, not alerts). **Do not treat this as a guaranteed zero-overshoot ceiling, and do not treat an alert as a cap.**
2. **Application-wide limits (shared, atomic).** Each admitted request bumps five counters in one pipeline with `INCRBY` and checks the returned value, so two simultaneous requests cannot both take the last unit. The loser backs out and hands its reservation back.
3. **Per-visitor limits.** Burst per 10 minutes and a daily quota, with roasts and FIX counted separately. The visitor key is a salted SHA-256 of the client address, truncated; the address itself is never stored or logged.
4. **Monitoring** (section I.6): anonymous counters of outcomes, refusals by reason, tokens and estimated cost, readable at `/api/admin/stats`.

### C.3 Beta policy (all configurable, section I.2)

| Control | Default | Meaning |
|---|---|---|
| Journey | 1 roast + 1 FIX MY IDEA | Counted as two requests, each with its own allowance |
| `VISITOR_DAILY_ROASTS` / `VISITOR_DAILY_FIXES` | 3 / 3 | Per visitor per UTC day. Retries count, because a retry spends money |
| `RATE_LIMIT_PER_10_MIN` | 10 | Per visitor; rejected attempts also count |
| `DAILY_AI_REQUEST_LIMIT` | 150 | All visitors, per UTC day (15 testers × 6 = 90 expected peak) |
| `DAILY_SPEND_LIMIT_USD` | 2 | **Reserved** dollars per UTC day |
| `MONTHLY_SPEND_LIMIT_USD` | 20 | Reserved dollars per UTC month. Set the Anthropic limit a little above this |
| `RESERVE_PER_REQUEST_USD` | 0.01 | Flat reservation per admitted request |
| `MAX_CONCURRENT_AI` | 4 | Generations at once, all instances |

### C.4 How reservations, failures and retries are accounted

- A reservation is made **before** the model is called and is **never refunded** once the request is admitted: a request that fails or is cancelled after the model started is still billed by Anthropic. Requests refused by any limit hand their reservation back (tested).
- The flat $0.01 is a deliberately high price. The pessimistic budget assumption in `src/lib/ai/pricing.ts` is about $0.0029 per roast and $0.0024 per FIX on Haiku; measured cost was about $0.0019 per whole journey. The reservation therefore leaves roughly 3x headroom over the pessimistic estimate for the app's one internal retry and the SDK's retries. That headroom is an estimate, not a proof.
- Real token usage and estimated cost are counted separately (best effort, after the fact) for monitoring. The reservation is the control; the real-usage counter is the check that the reservation is high enough. If `est_cost_micro` per request trends towards 10,000 (= $0.01), raise `RESERVE_PER_REQUEST_USD`.
- Because the reservation is flat, day and month "spend" in the counters is an upper bound on what the app has allowed, not what Anthropic has billed. Anthropic's console is the source of truth for the bill.

### C.5 Failure behaviour (verified locally over real HTTP, section F)

| Situation | Result |
|---|---|
| Production, paid provider, **no Redis configured** | Every roast and FIX request: HTTP 503 "closed for a moment". No model call. Boot log says `store: MISSING` |
| Redis configured but **unreachable** | HTTP 503, no model call; the error shows no host, token or stack |
| Redis errors after counters but before the slot is taken | 503 (and the reservation is rolled back) |
| Bookkeeping fails after the response finished | Ignored; the slot expires by itself after 150 s |
| Function killed mid-stream (timeout) | Slot expires after 150 s (longer than the 120 s route limit) |
| Gate or Turnstile on, `ACCESS_SIGNING_SECRET` missing or under 32 characters | 503 for everything protected |
| Provider failure | Clean 502 with a friendly message; **never** a made-up roast or the demo panel |

### C.6 Request validation

Order of checks before any money or shared counter is touched: same-origin (a browser POST with a foreign `Origin` gets 403) → invite cookie → declared body size → per-instance pre-filter (a flood is turned away without a Redis call) → JSON parse and schema validation (idea 12-1,200 characters, body ≤ 64,000 characters) → Turnstile pass → shared admission. Verified: malformed, short, wrong-type, oversized and cross-site requests never reach the store (test counts store calls = 0).

### C.7 Bot protection

Cloudflare Turnstile, verified **server-side** (`/api/pass` calls Cloudflare's `siteverify`, then sets a signed, HttpOnly, 30-minute pass cookie that `/api/roast`, `/api/roast/stream` and `/api/fix` require). A script that calls the AI endpoints directly has no pass and gets 403, so the check cannot be skipped from the client. Tokens are single-use and expire after five minutes (from Cloudflare's documentation). The widget runs in `interaction-only` mode, so most visitors see nothing, and it works on mobile browsers. Credentials are needed (section I.4); it is off, and logged as a warning, until configured. **Required before a public launch, optional for an invite-only beta.** Not verified live: a real Turnstile round trip.

### C.8 Protected beta access (server-side, not cosmetic)

Two independent options; use both in sequence (section I.5):

- **Vercel Deployment Protection** (platform level). Verified from Vercel's docs: Vercel Authentication is available on all plans, but only lets Vercel account members in; "Standard Protection" leaves your production domain public; "All Deployments" protects it too. Password Protection is **$20/month per project on Pro and not available on Hobby**. Good for owner-only smoke tests; poor for outside testers, because each tester would need a Vercel seat (Pro developer seats are $20/user/month).
- **The app's invite gate** (`BETA_ACCESS_CODES` + `ACCESS_SIGNING_SECRET`). Server-side: `proxy.ts` redirects pages to `/beta` and answers API calls with 401, **and** the paid routes check the same signed cookie themselves, so a matcher mistake cannot expose them. Codes are compared in constant time; the cookie is HMAC-signed, HttpOnly, SameSite=Lax, Secure in production and expires in 14 days. Verified locally over real HTTP: no cookie → 401; wrong code → 401; right code → 200 with an HttpOnly cookie; forged, expired and wrong-purpose cookies rejected (tests).

### C.9 Remaining risks (stated plainly)

1. **Visitor identity is the IP address.** There are no accounts. Phones on one carrier or office networks share an IP and therefore a quota; a determined person with many IPs or a VPN can exceed a per-visitor quota. The **global** request, spend and concurrency caps still bound total cost. Reliable per-person quotas need accounts, which were out of scope.
2. **`/api/fix` takes the roast from the client.** It validates the shape, but someone can call it directly with a forged roast. They are still bound by the invite gate, the human pass, the FIX quota and the global caps.
3. **The reservation is flat.** If real cost per request rose above $0.01 (a prompt change, a longer idea) the day and month counters would understate spend. Monitor `est_cost_micro`.
4. **Upstash free-tier exhaustion** (500,000 commands a month) would make the limiter fail, and the app would then fail closed: safe for cost, but an outage. A flood is mitigated by the per-instance pre-filter and should also be limited with a Vercel WAF rule (section I.1).
5. **Per-instance pre-filter and card limiter** are in memory and approximate; they only protect the shared store and CPU, not spend.
6. **`/api/card` and `/r/[payload]` are public** (needed for sharing). The card renderer is CPU only, cached when the payload repeats, and limited per client per instance. Share links carry the roast's title, scores and one judge quote in the URL.
7. **CSP allows `'unsafe-inline'` scripts and styles.** A nonce-based policy would turn off static prerendering for every page. All other directives are tight. A harmless CSP report appears in the browser: Zod probes `Function("")` for its JIT mode and falls back when it is blocked.
8. **Logs.** The pitch and visitor addresses are not logged (tested). Provider error text is logged server-side and could, rarely, quote model output derived from a pitch. Vercel retains runtime logs for one hour on Hobby and one day on Pro (from Vercel's plan table).
9. **Dev-dependency advisories** (section F.4): none ship to users.
10. Not verified against real services: Redis semantics at scale, a Turnstile round trip, a live Haiku journey on Vercel, streaming through Vercel's network, and Vercel's header behaviour in your region.

---

## D. Hosting

### D.1 Findings (verified from Vercel's current documentation, 2026-10-17)

| Topic | Finding |
|---|---|
| Framework | Next.js 16.4.0 (App Router, Cache Components, Proxy). `next build` succeeds: static `/`, `/privacy`, `/terms`, `/contact`, `/beta`; dynamic API routes; "Proxy (Middleware)" detected |
| Function duration | Fluid compute: **Hobby 300 s default and maximum; Pro 300 s default, 800 s maximum**. The AI routes set `maxDuration = 120`. Measured on earlier phases: roast 14-27 s, FIX 11-15 s (Phase 3B and the two-idea Haiku run). So a full journey fits comfortably. Unverified on Vercel until the smoke test runs a live journey |
| Streaming | Node functions can stream (the NDJSON route already sets `no-transform`, `no-store` and `X-Accel-Buffering: no`). Unverified through Vercel's network until the smoke test |
| Request body | Vercel's limit is 4.5 MB; the app's own cap is 64 KB |
| Env vars | All AI configuration is server-side. Only `NEXT_PUBLIC_*` values reach the browser (site URL, Turnstile **site** key, operator name/email). The bundle scan found no server-only name or value in the browser bundle |
| Static assets | Fonts are self-hosted by `next/font`; share-card fonts are traced into the function via `outputFileTracingIncludes` (unverified until a hosted card renders) |
| Region | Functions default to `iad1`. Put the Upstash database in the same region, and choose the region near your testers |
| Hobby plan | **"restricts users to non-commercial, personal use only"** (Vercel fair-use). A free private beta by an individual is arguably personal, but this is a potentially commercial AI product |

### D.2 Recommended plan

**Vercel Pro** (`$20` per developer seat per month plus usage; one seat if you work alone). Reasons: commercial use is allowed, 800 s function ceiling, spend management, longer logs (1 day vs 1 hour). Do **not** buy Password Protection ($20/month/project): the app's invite gate does the same job without per-tester seats. Hobby is acceptable only for owner-only smoke testing, and the choice is yours; I have not purchased or activated anything.

### D.3 Configuration included

- Route-level `maxDuration = 120` (already present), security headers in `next.config.ts` (production only), `poweredByHeader: false`, `proxy.ts` invite gate, `instrumentation.ts` boot report.
- No `vercel.json` is needed. Set the Node.js version to a current LTS (the app requires ≥ 20.9; development ran on 24).
- Build command `npm run build`, no extra environment needed at build time except `NEXT_PUBLIC_*` values (they are baked in at build, so changing the contact email or Turnstile site key needs a redeploy).

---

## E. Code changes

Two commits on `phase-10-release-candidate` (hashes in section J).

| Files | Why | Tests |
|---|---|---|
| `src/lib/shared/store.ts` | Store interface; Upstash REST adapter (`@upstash/redis`); in-memory twin | `shared-admission.test.ts` (adapter against a recording fake) |
| `src/lib/shared/admission.ts` | The atomic admission algorithm and policy defaults | `shared-admission.test.ts`: per-visitor quotas, burst, global cap, spend boundary ($0.05 admits exactly 5), monthly cap, refunds, 40 simultaneous requests, two "instances" on one store, slot TTL, outages, hashing |
| `src/lib/shared/{access,mode,stats}.ts` | Signed cookies, Turnstile verification, when the limiter is mandatory, anonymous counters | `access-config.test.ts` (30 tests) |
| `src/lib/api-helpers.ts`, `src/app/api/{roast,roast/stream,fix}/route.ts` | The request pipeline in section C.6; FIX counted separately; outcomes recorded | `shared-api.test.ts` (23 tests, production env) |
| `src/lib/ai/config.ts` | Explicit provider and Haiku allow-list in production | `access-config.test.ts` |
| `src/lib/guards.ts`, `src/lib/rate-limit.ts` | Real-usage counters hook; Vercel client-IP header by default | existing `guards.test.ts` unchanged and green |
| `src/proxy.ts`, `src/app/beta/*`, `src/app/api/{beta/enter,pass,event,admin/stats}/route.ts` | Invite gate, human pass, anonymous events, operator stats | `shared-api.test.ts`, smoke script |
| `src/lib/{human-check,analytics,client-api}.ts`, `ShareDialog`, `RoastExperience` | Turnstile client with one retry; visit and share counters (honours Do Not Track and Global Privacy Control) | e2e |
| `next.config.ts`, `src/instrumentation.ts` | Headers; boot-time errors and warnings for every missing protection | smoke script checks headers |
| `src/app/{privacy,terms,contact}`, `LegalPage.tsx`, `Landing.tsx`, footer | Draft legal pages; "Four AI judges put your business idea on trial" line; AI-transparency note that is honest about demo vs live mode; footer contrast raised (Lighthouse found 3.1:1) | e2e, Lighthouse |
| `scripts/check-secrets.mjs`, `scripts/smoke.mjs`, `.env.example`, `.gitignore`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts` | Hygiene and tooling; lint ignores local-only trees; unit-test timeout raised (one test flaked against the 5 s default on the unmodified baseline); e2e limited to 2 workers | all |

Dependency added: `@upstash/redis` (maintained, REST-based, no connection pooling needed on serverless). No other dependency changed. Prompts, scoring, normalisation, streaming and the cinematic UI were not modified. The launch trailer was not touched.

---

## F. Test results

Run on the final committed state of the release candidate.

### F.1 Automated checks (verified locally; providers mocked as noted)

| Command | Result |
|---|---|
| `npm run lint` | 0 errors, 0 warnings |
| `npm run typecheck` | passes |
| `npm test` | **23 files, 330 tests, all pass** (254 pre-existing + 76 new) |
| `npm run build` | succeeds; routes listed in D.1 |
| `npm run test:e2e` | **13 passed, 1 skipped** (desktop and mobile Pixel 7). Runs against the offline demo panel |
| `npm run test:e2e:ollama` | **3 passed**. Real app and Ollama client against a **mock** Ollama server; no real model |
| `npm run check:secrets` | no secrets in 179 repository files; none in the browser bundle |
| `npm audit --omit=dev` | **0 vulnerabilities** in shipped dependencies |

Honest notes: with Playwright's default worker count, 8 of 14 e2e tests timed out on page load on this 15 GB machine; with 2 workers all pass. That is a load effect on animation-heavy pages, so the config now pins 2 workers. The one baseline unit-test flake (`daily-limit`, a cold import over 5 s) was fixed with a longer timeout, not by changing logic. The one skipped e2e test is the desktop-only wide-layout check, which skips itself on the mobile project by design.

I also checked that the new tests are sensitive: deliberately making the limiter fail open, or skipping the reservation refund, made 2 and 3 tests fail respectively, and the real code passes.

### F.2 Real HTTP checks of the production build (verified locally, `scripts/smoke.mjs`)

| Scenario (`next start`, dummy Anthropic key, no outbound model call) | Result |
|---|---|
| Paid provider, **no Redis** | all 17 checks pass, including 503 on a valid roast request; boot log reports `store: MISSING` |
| Invite gate on, Redis **unreachable** | all 21 checks pass: page redirects to `/beta` (307); API with no cookie 401; wrong code 401; right code 200 with HttpOnly cookie; valid roast with a valid cookie 503 (outage fails closed); malformed, short, oversized bodies 400; cross-site POST 403; `/api/admin/stats` 404; security headers present |

### F.3 Mobile, performance, accessibility (verified locally)

Lighthouse 12, mobile emulation with simulated throttling, production build, landing page: **Performance 80, Accessibility 96, Best Practices 93, SEO 100**. FCP 0.8 s, LCP 3.6 s, TBT 400 ms, CLS 0. The LCP element is the animated "Let the panel destroy it" line, which enters with an intentional 0.75 s delay and blur; I did not change the cinematic entrance. Total transfer 354 KiB, with about 118 KiB unused JavaScript (framer-motion). Fixed: footer text contrast (3.1:1 → muted colour). Not changed: 10-11 px mono labels flagged as small text (a deliberate part of the design), reduce-unused-JS. Reduced motion is honoured (`MotionConfig reducedMotion="user"` plus a CSS media query). Pixel 7 screenshots of `/beta`, the landing page with the new copy and footer, and `/privacy` show no horizontal overflow (`scrollWidth ≤ clientWidth`). I did not test slow-network behaviour or browser memory.

### F.4 Dependency review

Production dependencies: clean. Dev-only advisories remain (vitest and tinypool, `@tailwindcss/cli` through `@parcel/watcher`/`micromatch`/`braces`, `eslint-config-next` through `fast-glob`): 2 critical, 7 high, 1 moderate. They are build and test tools that do not run in production; the available fixes are major version bumps (for example vitest 5), which the brief told me not to do speculatively. Recommended follow-up: a separate PR bumping vitest and eslint-config-next with the suite as the safety net.

### F.5 Not tested live (do not infer from the above)

A real Upstash database; a real Turnstile token; a real Haiku request through this code on Vercel; real streaming through Vercel; Vercel Deployment Protection; the Anthropic console limit; the share card's font tracing on Vercel. All are covered by the smoke test in I.5.

---

## G. Economics

| Item | Figure | Status |
|---|---|---|
| Haiku cost per journey (roast + FIX) | about **$0.002** ($0.00186 on two ideas) | **Measured** on a prior two-idea run; the 10-idea Haiku benchmark was never run (blocked on the key in Phase 3B), so the larger-sample figure is **unverified** |
| Pessimistic ceiling per journey | $0.0052 | Estimated (token assumptions × the price table, last verified 2026-10-08; re-check) |
| Beta ceilings enforced by the app | $1.50/day (150 requests × $0.01), $20/month reserved | Enforced by code (tested with mocks); real spend should be a small fraction |
| Realistic beta spend | 15 testers × 3 journeys × $0.002 ≈ **$0.09 per day** | Estimated |
| Vercel Pro | $20 per developer seat per month, plus usage | From Vercel's plan page; usage on a small beta likely inside the included allowances, unverified |
| Vercel Hobby | $0, non-commercial only | From Vercel's plan page |
| Password Protection (not needed) | $20/month/project on Pro | From Vercel's deployment-protection page |
| Upstash Redis | Free tier: 500K commands/month, 250 MB; then $0.20 per 100K commands | From Upstash's pricing page |
| Commands used by the limiter | about 20 per admitted request, about 80,000 a month at 150 requests a day | **Estimated** from the code (not measured against Upstash) |
| Cloudflare Turnstile | free tier | Not verified in this session; check Cloudflare's current pricing |
| Domain | not purchased | n/a |

---

## H. User experience

- **First impression.** The landing page now says "Four AI judges put your business idea on trial" under the existing headline; the cinematic design, typography, palette and judges are unchanged.
- **Transparency.** The footer states that the judges are AI characters, that criticism is speculative and may be wrong, that they do not research competitors or verify market data, and, when the live model is in use, that the pitch is sent to Anthropic's Claude. In demo mode it says the roast is scripted. `/terms` repeats this in full.
- **Streaming, refresh, cancel.** The existing journey tests cover streaming, retry, and cancellation (aborting stops generation and billing). A browser refresh returns to the landing page: results are not stored server-side by design.
- **Errors.** New refusals read as plain language: "You've used today's trials. Come back tomorrow for more.", "The panel is packed right now…", "The beta's AI budget is used up for now.", "…closed for a moment while we fix a problem." No stack traces, hosts or keys appear in any response (tested).
- **Known rough edge.** A visitor who exhausts the daily quota is told to come back tomorrow; there is no countdown in the UI.
- **Mobile.** Pixel 7 e2e passes; new pages fit a 412 px viewport. Dark, high-contrast copy only; the legal pages are intentionally plain.

---

## I. Production checklist (owner actions, in order)

Nothing below has been done. Steps 1-4 can be done in any order before step 5.

### I.1 Vercel (hosting)

1. Create or choose a Vercel account; choose **Pro** (section D.2) or accept Hobby for owner-only testing.
2. Import the GitHub repository (after you approve the push, section J). Framework: Next.js. Production branch: `main`. For the first preview use branch `phase-10-release-candidate`.
3. Settings → Deployment Protection: set **All Deployments** with **Vercel Authentication** for the first smoke test.
4. Optional but recommended: a WAF rate-limit rule on `/api/*` (Hobby allows up to 3 custom rules, Pro up to 40) to protect the Redis command quota.
5. Settings → Environment Variables (Production and Preview): the table in section I.2.

### I.2 Environment variables

| Variable | Required | Value |
|---|---|---|
| `AI_PROVIDER` | yes | `anthropic` |
| `ANTHROPIC_API_KEY` | yes | A dedicated key from its own workspace (I.3). Never commit it |
| `ANTHROPIC_MODEL` | optional | `claude-haiku-5-5` (also the default; production rejects anything else) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | yes | From I.3b (or let the Vercel integration set `KV_REST_API_URL`/`KV_REST_API_TOKEN`) |
| `BETA_ACCESS_CODES` | yes for the tester beta | Comma-separated, 16+ random characters each |
| `ACCESS_SIGNING_SECRET` | yes with the gate or Turnstile | 32+ random characters: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `ADMIN_STATS_TOKEN` | recommended | 24+ random characters; enables `/api/admin/stats` |
| `NEXT_PUBLIC_SITE_URL` | yes | The deployed URL (used for share links and the card) |
| `NEXT_PUBLIC_OPERATOR_NAME`, `NEXT_PUBLIC_CONTACT_EMAIL` | yes before testers see the legal pages | Yours. Never invented |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | before public launch | From I.4 |
| `VISITOR_DAILY_ROASTS`, `VISITOR_DAILY_FIXES`, `RATE_LIMIT_PER_10_MIN`, `DAILY_AI_REQUEST_LIMIT`, `DAILY_SPEND_LIMIT_USD`, `MONTHLY_SPEND_LIMIT_USD`, `RESERVE_PER_REQUEST_USD`, `MAX_CONCURRENT_AI` | optional | Beta defaults are in C.3. A value of `0` turns that limit **off** (it does not mean "none allowed") |
| `SHOW_AI_ERRORS` | leave unset | Never `true` on a public deployment |
| `ALLOW_INSTANCE_LOCAL_LIMITS` | leave unset | Only for single-process self-hosting |

Use separate values for Preview and Production, and mark every secret "Sensitive" in Vercel. `CLIENT_IP_HEADER` is not needed on Vercel.

### I.3 External accounts

**a. Anthropic.** In the Console create a **new workspace** (limits cannot be set on the default workspace), create a key in it, and set the workspace and organization **monthly spend limits** a little above `MONTHLY_SPEND_LIMIT_USD` (for example $25). Check the Billing page for notification options. Revoking the key in the Console is the **instant kill switch** (Vercel environment changes only apply to new deployments).

**b. Upstash.** Create a free Redis database in the region of your Vercel functions (or add the Upstash integration from the Vercel Marketplace, which sets the variables for you). Copy the REST URL and token. Check Upstash's dashboard for command usage once the beta starts.

### I.4 Cloudflare Turnstile (before public launch)

Create a widget (Managed, allow your domain), copy the site key and secret into the two variables. Redeploy. The app then requires the human pass on every paid endpoint.

### I.5 Protected preview and smoke test

1. Push (J), let Vercel build the preview of `phase-10-release-candidate`, protected by Vercel Authentication.
2. Open the preview while signed in to Vercel and confirm the boot log (Project → Logs) shows `provider anthropic`, `model claude-haiku-5-5`, `store: upstash`, no `MISSING`.
3. From your machine run, with a Vercel "Protection Bypass for Automation" secret if protection is on (availability on Hobby unverified):
   `node scripts/smoke.mjs --base https://<preview-url> --invite <code> --bypass <secret>`
   Expect all PASS. This makes **no paid request**.
4. Prove fail-closed on the real platform: in a throwaway preview, remove the Upstash variables and run `node scripts/smoke.mjs --base <that url> --expect-fail-closed`. Expect PASS on the 503 check. Restore the variables.
5. Run one real journey (about $0.002): `node scripts/smoke.mjs --base <url> --invite <code> --live`. Expect the roast and FIX to complete and report `mode ai`; note the two durations (they must be well under 120 s) and confirm text streams progressively in a real phone browser.
6. In `GET /api/admin/stats` confirm `roast_ok` and `fix_ok` each rose by one, `store` says `upstash`, and `estCostUsd` looks like about $0.001-0.003 per request.
7. Exhaust the quota on purpose with a test invite code (4th roast) and confirm the friendly 429, then confirm the counters moved in Upstash.
8. Only then: for outside testers turn off Vercel protection on the production domain (Standard Protection) and rely on the invite gate, or add testers to Vercel. Share the invite codes privately.

### I.6 Observability: how you will see what is happening

| Question | Where |
|---|---|
| Roasts and FIX: ok, failed, cancelled; refusals by reason; tokens; estimated cost; today's and this month's reservations; active generations | `curl -H "Authorization: Bearer $ADMIN_STATS_TOKEN" "https://<site>/api/admin/stats?days=7"` (durable: kept 45 days) |
| Real spend | Anthropic Console → Usage and Billing (the source of truth for the bill) |
| Rate-limit events | Stats counters `denied_*`; Vercel logs search `"evt":"admission_denied"` |
| Limiter outages | Vercel logs: search `shared_store_unavailable` (the counters cannot record an outage while Redis is down, so the logs are the signal) |
| Generation failures | Vercel logs: lines starting `[ai]`; stats `roast_fail`/`fix_fail` |
| Unexpected errors | Vercel logs: `[ai] unexpected error` |
| Availability | An external uptime monitor on `/api/status` (public even behind the invite gate; behind Vercel Authentication it needs the bypass header) |
| Redis quota | Upstash dashboard |

Runtime logs are short-lived (1 hour on Hobby, 1 day on Pro), so rely on the stats endpoint for history.

### I.7 Legal and privacy (owner)

Provide: your legal name or business name, a contact email, a postal address if required, your jurisdiction and governing law. Have an adviser review `/privacy` and `/terms` (marked "Draft" on the page and containing bracketed placeholders). If you are in the UK, check with an adviser whether data-protection registration applies and whether the strictly-necessary-cookies position (only a signed access cookie and, optionally, a human-check cookie; no tracking cookies) needs a banner; I have not verified this.

---

## Release gates

| Area | Status | Basis |
|---|---|---|
| Application: production build | **PASS: Verified** | `npm run build`, e2e on the production build |
| AI model: Haiku explicitly configured | **PASS: Verified** (code and tests) | Default and only production-allowed model; boot log shows it. The real environment variable still needs setting (I.2) |
| Security: server-side secrets protected | **PASS: Verified** | Bundle and repo scans clean; keys only read server-side; tests assert no leakage in responses or logs |
| Rate limiting: shared, production-ready | **CONFIGURATION REQUIRED** | Implemented, fail-closed, tested against mocks and a broken store; needs a real Upstash database and the hosted smoke test |
| Spending: provider and app controls | **CONFIGURATION REQUIRED** | App layers verified with mocks; Anthropic workspace limit is an owner action |
| Reliability: journeys and failures | **PASS: Verified** (locally) | e2e demo and Ollama-mock journeys; failure cases tested; live Haiku on Vercel is under "Live deployment" |
| Hosting: Vercel-compatible | **CONFIGURATION REQUIRED** | Build output and limits checked against Vercel's docs; needs your Vercel project and plan |
| Mobile: responsive and usable | **PASS: Verified** | Pixel 7 e2e, screenshots, Lighthouse |
| Privacy: accurate disclosures | **CONFIGURATION REQUIRED** | Drafts written and accurate to the code; need owner details and review |
| Monitoring: basic visibility | **CONFIGURATION REQUIRED** | Stats endpoint and logs implemented; needs the store and token configured |
| GitHub: clean release candidate | **PASS: Verified** (locally) | No secrets, no large media, no conflicts; push needs your approval |
| Testing: automated checks | **PASS: Verified** | Section F |
| Live deployment: protected preview verified | **CONFIGURATION REQUIRED** | Not deployed; section I.5 is the procedure |

No gate is BLOCKED.

---

## J. Git and release state

| Item | State |
|---|---|
| Branch | `phase-10-release-candidate` (from `bf1e6a2`) |
| Commits made | `097e5fc` shared fail-closed admission layer · `d7b0be6` protected-beta surface · plus a docs commit for this file (hash in `git log`) |
| Pushed, merged, deployed | none |
| Untracked, deliberately not committed | `docs/COURTROOM_OPENING_PROOF_v2.mp4` (now git-ignored) |
| Trailer | `artifacts/phase-8-directors-cut/AI_ROAST_MY_IDEA_DIRECTORS_CUT_V2.mp4` untouched; the Phase 9 V3 files untouched |

**Next push and merge procedure (needs your explicit go-ahead):**

```powershell
cd C:\Users\MattD\Development\AI-ROAST-MY-IDEA-phase2
npm run check:secrets                      # must say "no secrets found"
git push origin phase-10-release-candidate # review the diff on GitHub first (public repo)
# Option A (recommended): update PR #1 in place with a fast-forward
git push origin phase-10-release-candidate:phase-2-ai-intelligence
# Option B: open a new PR from phase-10-release-candidate into main instead
```

After the protected preview passes (I.5), merge PR #1 into `main` on GitHub. Do not enable the production domain until I.5 step 8.

---

## K. Release decision

**CONDITIONAL GO**: ready for a protected deployment after the external configuration in section I and a passing hosted smoke test. There are no known technical blockers in the code. It is **not** ready for public launch: that additionally needs Turnstile, reviewed legal pages, a Vercel Pro plan decision, and a live-measured check that real cost per request stays well under the $0.01 reservation.

---

## L. Single next owner action

**Approve pushing `phase-10-release-candidate` to GitHub** (command in section J, Option A). It unblocks everything else: Vercel can then build a preview, and you can work through I.1-I.5 in order. Before pushing, skim the diff on GitHub, since the repository is public.
