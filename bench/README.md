# Model benchmark

Compares models on identical pitches, using the app's real pipeline (streaming, validation, retries), and produces:

| File | What it is |
|---|---|
| `report.md` | Reliability, speed, viewer-experience estimate, tokens, estimated cost, text heuristics, failures |
| `results.json` | Every measurement and every output, for your own analysis |
| `blind-review.html` | Offline page to score outputs **without knowing which model wrote them** |
| `blind-key.json` | Maps the A/B/C labels back to models. Don't open it until you've scored. |
| `quality.md` | Written by `npm run bench:score` from your exported ratings |

Results go to `bench/results/<timestamp>[-label]/` (git-ignored; commit a report deliberately if you want to keep it).

## Running it

```bash
npm run bench -- --targets <spec,spec,…> [--ideas all|id,id] [--repeat N] [--no-fix] [--budget-usd 2] [--yes] [--label name]
```

Target specs:

| Spec | Meaning |
|---|---|
| `demo` | The offline scripted engine, a pipeline baseline (not AI) |
| `anthropic:claude-haiku-5-5` | Claude via the API (needs `ANTHROPIC_API_KEY`) |
| `anthropic:claude-sonnet-5-5?effort=medium&fix=claude-opus-5-5` | Options: `effort`, `fix` (model for FIX MY IDEA), `debate` |
| `ollama:qwen3.5:4b` | Local model via Ollama (`OLLAMA_HOST` or `?host=`) |
| `ollama:qwen3.5:9b?think=true&debate=multi&ctx=12288` | Options: `think`, `debate`, `ctx`, `host`, `fix` |

`debate=multi` runs the experimental multi-call debate (one call per debate line) so you can compare it with the default single-generation debate.

### Cost safety

- **Paid targets never run without `--yes`.** Without it you get the plan and a pessimistic cost estimate, and nothing is sent.
- **A budget cap.** The run refuses to start if the pessimistic estimate exceeds `--budget-usd` (default $2), and stops early if *measured* spend crosses it.
- **Limited concurrency and retries.** Jobs run one at a time by default (`--concurrency` up to 4, and only for API targets). Each job retries at most once, inside the pipeline, exactly as the app does.

A full Claude run (10 ideas × Haiku, Sonnet and Opus, with FIX) is expected to cost about $1–2. Its pessimistic pre-run estimate is ~$3.20, so pass `--budget-usd 4`. A Haiku-only run costs a few cents.

## The ideas

`bench/ideas.ts` holds 10 fixed pitches: a realistic SaaS, two consumer AI apps (wedding speeches, second-hand fashion), a marketplace, a local service, a subscription, a technically hard startup, an obviously bad idea, a vague pitch and a prompt-injection attempt. Don't edit existing ideas, because that makes old reports incomparable; add new ones instead.

## Reading the report

- **Measured:** timings, success rate, restarts, token counts.
- **Estimated:** costs (measured tokens × `bench/pricing.ts`, verified 2026-10-08) and the viewer timeline (measured timings × the UI's pacing).
- **Heuristic:** grounding, debate engagement, possible invented figures, clichés and voice overlap. These flag things to look at, not quality. A high "possible invented figures" count means *go and read those lines*.
- **Quality** comes only from the blinded human review.

## Blinded review

1. Open `blind-review.html` (it works offline; ratings are saved in the browser).
2. For each idea, read panels A, B, C… and score them 1–5 on the rubric (`RUBRIC.md`).
3. Press **Export ratings** to save `ratings.json`.
4. `npm run bench:score -- bench/results/<run> path/to/ratings.json` writes `quality.md`.

Labels are shuffled per idea, so the same model isn't always "A". For a fairer verdict, ask someone else to score as well and compare.
