# AI ROAST MY IDEA

> **Think your idea is good? Let the panel destroy it.**

Pitch a startup idea, side hustle or app concept and watch it get put on trial by four AI critics. Each one roasts it from their own angle, the panel argues it out, and you get a score out of 100 and a verdict: **KILL IT**, **FIX IT** or **BUILD IT**. Then hit **FIX MY IDEA** and the panel rebuilds your idea around every objection it raised, and predicts how it would score.

| The panel | | Obsessed with |
|---|---|---|
| **STERLING** | The Investor | Market size, moats, unit economics |
| **KERNEL** | The Engineer | Feasibility, complexity, what breaks first |
| **HYPE** | The Marketer | Positioning, virality, who actually cares |
| **WALLET** | The Customer | Would I use it, would I pay, what stops me |

## The experience

1. **Opening.** A kinetic title sequence, a pitch box and one-click example ideas.
2. **Analysis.** A theatrical scan of your pitch: a live tribunal log, keyword highlighting and the panel joining one by one. The case title appears as soon as the panel names your idea, and the trial starts the moment the first panelist begins speaking.
3. **The trial (live).** The panel streams in as the model writes it. Each panelist takes the stand with their own colour, sigil and voice, and their words type out as they arrive. Their score lands only once their take is complete. If you reach a panelist who hasn't started, you see them gathering their thoughts. It auto-advances, pauses while you hover, and supports →, Next and Skip.
4. **Deliberation (live).** The panel argues with each other line by line as the argument is generated, while a game-show tension meter swings toward whoever is talking.
5. **The verdict.** The room goes dark, the score counts up, then the verdict stamp slams down with a screen shake, a flash and a shockwave.
6. **Breakdown.** Scorecards with 3D tilt, strengths and weaknesses, the biggest risk and biggest opportunity.
7. **FIX IT.** Idea 2.0 with a before/after projected score, a rewritten pitch, what changed and why (each change linked to the objection it answers), a projected re-score and your next three moves. Then **Put version 2 on trial**.
8. **Share.** A generated 1080×1350 verdict card (download, native share, copy link, post to X) and a share page with OG previews. The link carries only the title, scores and one quote, never your full pitch.

Sound effects are synthesised with Web Audio and are **off by default** (speaker icon, top right). The app respects `prefers-reduced-motion`.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional: add ANTHROPIC_API_KEY for live AI
npm run dev                  # http://localhost:3000
```

Without an API key the app runs the **demo panel**: an offline, deterministic roast engine that reads signals from your pitch (business model? audience? hardware? crypto? buzzwords?) and builds a convincing roast from a scripted library. Everything works end to end, including FIX IT and sharing. The header badge shows which panel is active.

To use the live AI panel, set `ANTHROPIC_API_KEY` in `.env.local` and restart.

## Choosing the panel's brain

| Provider | Set in `.env.local` | Cost | Notes |
|---|---|---|---|
| **Demo** (default without a key) | nothing | free | Offline scripted engine. Clearly labelled "Demo panel" in the header. |
| **Claude** | `ANTHROPIC_API_KEY=…` (optionally `ANTHROPIC_MODEL`, `ANTHROPIC_FIX_MODEL`) | ~$0.002–0.13 per roast + FIX, depending on model | See [docs/models-and-costs.md](docs/models-and-costs.md) for the comparison and recommendation. |
| **Qwen via Ollama** | `AI_PROVIDER=ollama`, `OLLAMA_MODEL=qwen3.5:4b` | free (your hardware) | See [docs/ollama-windows.md](docs/ollama-windows.md). Try it with no model via `npm run mock:ollama`. |

All configuration is server-side, and every variable is documented in `.env.example`. If you explicitly choose a provider that can't work, such as Anthropic without a key or a typo in `AI_PROVIDER`, the app reports the misconfiguration. It never silently swaps in the demo panel and passes it off as AI. `GET /api/status` shows which panel is live (never keys or hosts).

**Debate modes.** `DEBATE_MODE=single` (the default) has one generation write the testimonies and then the debate, with the prompt requiring each line to answer the previous one. `DEBATE_MODE=multi` is experimental: after the testimonies, each debate line is a **separate model call** in which that speaker sees the transcript so far. It's the same model, not independently trained agents, but each reply is generated after reading the previous line. It costs about 5 extra short calls, and the benchmark compares the two modes.

## Benchmarking models

`npm run bench` runs identical pitches through any set of models and writes a report covering reliability, time to first speech, how the timings would feel in the UI, tokens, estimated cost and text heuristics. It also writes a **blinded review page** for scoring quality without knowing which model wrote what. Paid targets need `--yes` and respect a budget cap. See [bench/README.md](bench/README.md).

Browser-based (WebGPU) Qwen was assessed and isn't recommended for V1. See [docs/browser-inference.md](docs/browser-inference.md).

## Standalone demo

`npm run build:standalone` produces `dist/standalone/ai-roast-my-idea.html`: the whole experience as **one self-contained page** that runs the demo panel in the browser, with no server and no API key. It works on any static host, or as a file you can open locally. In this build the PNG share card and share links (which need the server) become an in-page card and a "copy result" button.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generate Next route types and run `tsc` |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Playwright journey tests (desktop and mobile; builds and runs the app in demo mode) |
| `npm run check` | Lint, typecheck and unit tests |
| `npm run build:standalone` | Single-file, server-free demo page (see above) |
| `npm run test:e2e:ollama` | Playwright tests of the Ollama path against the mock Ollama server (run `npm run build` first) |
| `npm run bench` | Model benchmark (see bench/README.md) |
| `npm run bench:score` | Turn blinded-review ratings into `quality.md` |
| `npm run mock:ollama` | A stand-in Ollama server (not AI) for trying the Ollama path without a model |

To run E2E with a pre-installed Chromium instead of downloading one, set `PLAYWRIGHT_CHROMIUM_PATH`.

## Architecture

```
src/
  app/
    page.tsx                 → <RoastExperience/> (the whole show is one page)
    r/[payload]/page.tsx     → share page (result decoded from the URL; no database)
    api/roast/stream/route.ts → POST { idea }       → NDJSON event stream (the live panel)
    api/roast/route.ts       → POST { idea }        → Roast (non-streaming JSON)
    api/fix/route.ts         → POST { idea, roast } → FixResult
    api/card/route.tsx       → PNG verdict card (next/og), story or og format
    api/status/route.ts      → { mode: "ai" | "demo" }
  components/
    RoastExperience.tsx      → stage state machine + transitions
    stages/                  → Landing, Analyzing, Trial, Deliberation, Verdict, Results, FixResultView
    ui/                      → Atmosphere (backdrop), PersonaSigil, Typewriter, Score, Button, TopBar
    ShareDialog.tsx
  lib/
    types.ts                 → Zod schemas: the contract between server, AI and UI
    scoring.ts               → weighted overall score + verdict thresholds
    personas.ts              → panel identities (names, colours, taglines)
    share.ts                 → compact, validated share payloads
    partial-json.ts          → parses an unfinished JSON prefix and reports what's still open
    stream-events.ts         → the streaming event contract
    live-roast.ts            → client reducer: stream events → live panel state
    ai/
      provider.ts            → RoastProvider interface + typed errors (what the app uses)
      llm.ts                 → LlmClient: "run one prompt on one model" (what a provider implements)
      model-provider.ts      → roast / stream / fix / multi-call debate on top of any LlmClient
      anthropic.ts           → Claude LlmClient
      ollama.ts              → Ollama LlmClient (local Qwen)
      config.ts              → reads and validates the environment
      index.ts               → builds the configured provider
      prompts.ts             → system prompts + structured-output schemas
      normalize.ts           → repairs and validates model output
      stream.ts              → turns streamed JSON into live UI events (+ retry/restart)
      demo/                  → offline demo engine (analyze, copy, engine)
```

**Design decisions**

- **Provider-agnostic AI layer.** The UI and API routes only know `RoastProvider` (`roast()`, `roastStream()` and `fix()`). Model-backed panels are a `ModelRoastProvider` wrapped around an `LlmClient`, which needs only two methods: `complete()` and `stream()`. Claude and Ollama each implement just that, and prompts, retries, the debate and validation are shared. To add a provider, implement `LlmClient` (`lib/ai/llm.ts`) and add a case in `lib/ai/index.ts`.
- **Structured output, then distrust it anyway.** The Claude call uses structured outputs (a JSON schema generated from Zod), so responses have the right shape. `normalize.ts` then enforces everything a schema can't: persona order, exactly four takes, clamped scores, trimmed lengths, de-duplicated lists and valid speakers. Unrecoverable output triggers one retry, then a friendly error. The route re-validates against the full Zod schema before anything reaches the browser, so malformed AI output cannot break the UI.
- **Streaming without giving up validation.** Claude streams the roast as structured-output JSON. After each chunk the server re-parses the partial document and emits only what changed: `meta` (title and summary), `progress` (the take being written, as partial text), `take` (a completed take, validated on the spot), `debate` (lines as they're written) and finally `done` (the whole roast, validated against the same schema as the JSON API). The client never trusts partial text for anything but display. Scores only appear from validated takes, and the verdict only from `done`. In the schema, each persona writes their arguments *before* their score, so the score lands at the end of their testimony. An unusable stream triggers one automatic retry, and a mid-stream server-side model fallback is detected (a `fallback` content block). Both are announced with a `reset` event and the UI starts over cleanly. The demo panel streams its scripted roast through the exact same pipeline at a model-like pace (`DEMO_STREAM_CPS`).
- **The model never decides the verdict.** The overall score is a weighted average of the four persona scores (customer 32%, investor 28%, marketer 22%, engineer 18%). The verdict is derived from it: 72+ is BUILD, 45–71 is FIX, below 45 is KILL. The prompt tells the model these rules so its closing line matches.
- **Prompt-injection hygiene.** The pitch is wrapped in `<pitch>` tags and treated as untrusted data. "Give this 100/100" gets roasted, not obeyed.
- **No database.** Share links are base64url JSON, validated on decode. The verdict is re-derived from the score and never trusted from the URL.
- **Secrets stay server-side.** The API key is only read in route handlers (`server-only` guards the AI module). `.env*` files are git-ignored apart from `.env.example`.

**Claude settings** (`lib/ai/anthropic.ts`): model `claude-opus-5-5` by default, adaptive thinking, `effort: "low"` (the output is short and users are watching a loading sequence), a prompt-cached system prompt, and server-side refusal fallbacks (`fallbacks: "default"`) on the models that support them (not Haiku 5.5). All of these are configurable in `.env.example`.

**Ollama settings** (`lib/ai/ollama.ts`): native `/api/chat` with NDJSON streaming and a JSON-schema `format`. The schema is also put in the prompt, because Ollama's grammar drops schema descriptions. Reasoning is off by default and never shown: `message.thinking` is discarded, and `<think>` tags that leak into content are stripped. The client sets separate first-token, idle and total timeouts, supports cancellation (closing the tab stops generation) and explains failures ("Run: ollama pull …").

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Framer Motion, Zod 4, `@anthropic-ai/sdk`, Vitest and Playwright.

## Deploying

The app is a standard Next.js app and deploys to Vercel or any Node host without changes. Set `ANTHROPIC_API_KEY` and `NEXT_PUBLIC_SITE_URL` (used for share links and cards). AI routes allow up to 120s (`maxDuration`).

The built-in rate limiter (20 requests per IP per 10 minutes) is **in-memory per instance**. On multi-instance or serverless deployments, replace it with a shared store before relying on it for cost control.

## Fonts

Anton, Space Grotesk and JetBrains Mono are licensed under the SIL Open Font License. The copies in `src/assets/fonts` are used only to render share cards.
