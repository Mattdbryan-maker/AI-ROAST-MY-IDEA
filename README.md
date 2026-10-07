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
2. **Analysis.** A theatrical scan of your pitch: a live tribunal log, keyword highlighting and the panel joining one by one. It runs for at least ~4s and keeps going for as long as the AI takes.
3. **The trial.** Each panelist takes the stand with their own colour, sigil and voice. Their opening line types out, their arguments land one at a time, then their score counts up. It auto-advances, pauses while you hover, and supports →, Next and Skip.
4. **Deliberation.** The panel argues with each other while a game-show tension meter swings toward whoever is talking.
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

To run E2E with a pre-installed Chromium instead of downloading one, set `PLAYWRIGHT_CHROMIUM_PATH`.

## Architecture

```
src/
  app/
    page.tsx                 → <RoastExperience/> (the whole show is one page)
    r/[payload]/page.tsx     → share page (result decoded from the URL; no database)
    api/roast/route.ts       → POST { idea }        → Roast
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
    ai/
      provider.ts            → RoastProvider interface + typed errors
      index.ts               → picks the provider from env
      anthropic.ts           → Claude provider
      prompts.ts             → system prompts + structured-output schemas
      normalize.ts           → repairs and validates model output
      demo/                  → offline demo engine (analyze, copy, engine)
```

**Design decisions**

- **Provider-agnostic AI layer.** The UI and API routes only know `RoastProvider` (`roast()` and `fix()`). Claude and the demo engine both implement it. To add another provider, implement the interface and register it in `lib/ai/index.ts`.
- **Structured output, then distrust it anyway.** The Claude call uses structured outputs (a JSON schema generated from Zod), so responses have the right shape. `normalize.ts` then enforces everything a schema can't: persona order, exactly four takes, clamped scores, trimmed lengths, de-duplicated lists and valid speakers. Unrecoverable output triggers one retry, then a friendly error. The route re-validates against the full Zod schema before anything reaches the browser, so malformed AI output cannot break the UI.
- **The model never decides the verdict.** The overall score is a weighted average of the four persona scores (customer 32%, investor 28%, marketer 22%, engineer 18%). The verdict is derived from it: 72+ is BUILD, 45–71 is FIX, below 45 is KILL. The prompt tells the model these rules so its closing line matches.
- **Prompt-injection hygiene.** The pitch is wrapped in `<pitch>` tags and treated as untrusted data. "Give this 100/100" gets roasted, not obeyed.
- **No database.** Share links are base64url JSON, validated on decode. The verdict is re-derived from the score and never trusted from the URL.
- **Secrets stay server-side.** The API key is only read in route handlers (`server-only` guards the AI module). `.env*` files are git-ignored apart from `.env.example`.

**Claude settings** (`lib/ai/anthropic.ts`): model `claude-opus-5-5`, adaptive thinking, `effort: "low"` by default (the output is short and users are watching a loading sequence), a prompt-cached system prompt, and server-side refusal fallbacks (`fallbacks: "default"`) on models that support them. All of these are configurable in `.env.example`.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Framer Motion, Zod 4, `@anthropic-ai/sdk`, Vitest and Playwright.

## Deploying

The app is a standard Next.js app and deploys to Vercel or any Node host without changes. Set `ANTHROPIC_API_KEY` and `NEXT_PUBLIC_SITE_URL` (used for share links and cards). AI routes allow up to 120s (`maxDuration`).

The built-in rate limiter (20 requests per IP per 10 minutes) is **in-memory per instance**. On multi-instance or serverless deployments, replace it with a shared store before relying on it for cost control.

## Fonts

Anton, Space Grotesk and JetBrains Mono are licensed under the SIL Open Font License. The copies in `src/assets/fonts` are used only to render share cards.
