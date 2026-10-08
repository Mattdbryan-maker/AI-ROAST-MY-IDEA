# Models and operating costs

What it costs to run a roast, which models are candidates, and what evidence is still needed before choosing one.

**Status:** no live model has been benchmarked yet. The build environment had no Anthropic API key and couldn't download local models. Everything below labelled *estimate* comes from measured prompt sizes and published prices. The benchmark framework (`bench/`) is built to replace these estimates with measurements: see [Evidence still needed](#evidence-still-needed).

## What one journey consumes

Character counts were measured from the current prompts (`PROMPT_VERSION 2026-10-08.2`) and a typical output. Token counts are **estimates**: about 3.1 characters per token on current Claude models, whose tokenizer produces roughly 30% more tokens than older ones.

| Call | Input | Output (visible) | Hidden reasoning |
|---|---|---|---|
| Roast (one generation) | ~8,200 chars ≈ **2,600 tokens**, of which ~2,000 is the system prompt (cacheable) | ~4,000–6,000 chars ≈ **1,300–2,000 tokens** | 0–1,500 tokens at `effort: low` (unknown until measured) |
| FIX MY IDEA | ~5,200 chars ≈ **1,700 tokens** | ~2,500–3,500 chars ≈ **800–1,100 tokens** | 0–1,000 tokens |
| Multi-call debate (experimental) | 5 calls × ~6,000 chars ≈ **5 × 1,900 tokens** | 5 × ~40 tokens | 0–300 tokens each |

Output tokens dominate the cost on every Claude model, because output costs 5× input.

## Claude: price per journey (estimate)

Prices verified on 2026-10-08 from <https://platform.claude.com/docs/en/about-claude/pricing> (USD per million tokens, standard tier):

| Model | Input | Output | Cache read |
|---|---|---|---|
| Claude Opus 5.5 (`claude-opus-5-5`, current default) | $4 | $20 | $0.20 |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | $2 | $10 | $0.10 |
| Claude Haiku 5.5 (`claude-haiku-5-5`), prompts ≤100K tokens | $0.10 | $0.50 | $0.01 |

Applying the token ranges above (low end = no reasoning, high end = maximum assumed reasoning):

| Model | Roast | FIX MY IDEA | Full journey (roast + FIX) | Per 10,000 journeys | Multi-call debate adds |
|---|---|---|---|---|---|
| Opus 5.5 | $0.036–0.080 | $0.023–0.049 | **$0.06–0.13** | **$600–1,300** | ~$0.04–0.07 |
| Sonnet 5.5 | $0.018–0.040 | $0.011–0.025 | **$0.03–0.065** | **$300–650** | ~$0.02–0.035 |
| Haiku 5.5 | $0.0009–0.0020 | $0.0006–0.0012 | **$0.0015–0.0032** | **$15–32** | ~$0.001–0.002 |

**What this means:** Opus 5.5 is roughly 40× the price of Haiku 5.5 for the same journey. A viral day with 10,000 roasts would cost around $1,000 on Opus and around $25 on Haiku. Opus is hard to justify as the default for anonymous public traffic unless the blinded review shows a clear quality gap that users would notice. Sonnet 5.5 sits in between at about half of Opus.

Prompt caching is already on (the system prompt is marked `cache_control`), so repeat traffic pays the cache-read rate for ~2,000 input tokens. That saves under 10% of a journey, because output dominates.

### Recommendation (pending evidence)

1. **Keep `claude-opus-5-5` as the code default for now** and change it only on evidence. This is deliberate: switching the model is a product decision, and the blinded review is the evidence it needs.
2. **Benchmark Haiku 5.5 and Sonnet 5.5 first.** If Haiku's blinded scores are within ~0.5 of the others on humour, specificity and debate, use Haiku for public roasts.
3. **Use a stronger model where it pays.** FIX MY IDEA runs only when a user asks for it and benefits most from reasoning. `ANTHROPIC_FIX_MODEL` lets the roast run on Haiku and FIX on Sonnet (or Opus).
4. **Keep `effort: low`.** The output is short creative writing, not multi-step reasoning, and lower effort cuts both latency and hidden-token cost. Benchmark `effort=medium` on the chosen model before raising it.

### Implementation notes (verified against current API docs)

- **Haiku 5.5 has no server-side refusal fallback**, so the client doesn't send `fallbacks` for it. Opus 5.5 and Sonnet 5.5 get `fallbacks: "default"`.
- **No sampling parameters.** Haiku 5.5, Sonnet 5.5 and Opus 5.5 reject non-default `temperature` and `top_p`, so the client sends none.
- **Thinking.** Adaptive thinking is on with an explicit effort level. Thinking blocks are skipped when reading the response, and their tokens count toward `max_tokens`, which is set high (16,000) so reasoning can't truncate the JSON.
- **Structured outputs** (`output_config.format`) are supported on all three models.

## Local Qwen (Ollama): cost model

There is no per-call fee. The costs are:

- **Hardware you already own:** effectively free per roast. Suitable for development, demos and personal use.
- **A GPU server for public traffic:** you pay for the machine whether or not anyone roasts. An always-on cloud GPU commonly runs to several hundred dollars a month or more (check current pricing). At, say, $500 a month that breaks even against Haiku 5.5 (~$0.0025 a journey) only at ~200,000 journeys a month, and against Opus 5.5 (~$0.10) at ~5,000. One GPU also serves only a few roasts at a time.
- **Latency is the hidden cost:** see [the speed simulation](#how-model-speed-affects-the-show). A slow model makes the live panel wait.

For a public V1, a hosted API model is almost certainly cheaper and simpler than running GPUs. Local Qwen is valuable for development, offline demos and privacy-sensitive use, and as a fallback if API costs ever spike. Benchmark quality before relying on it.

### Candidate local models

| Model | Why consider it |
|---|---|
| `qwen3.5:4b` (default) | Fits an 8 GB GPU; current-generation small Qwen with a thinking switch. |
| `qwen3.5:9b` | Same family, more capacity for humour and structure; needs ~8 GB+ VRAM. |
| `qwen3:30b-a3b-instruct-2507` | Mixture-of-experts with ~3B active parameters: often fast even on CPU with 32 GB RAM, but a ~19 GB download. |

Reasoning ("thinking") is **off** by default (`OLLAMA_THINK=false`). The panel's output is short creative writing, and reasoning on a local model adds a long silent pause before the first panelist speaks. Reasoning text is never shown even when on: Ollama returns it in a separate field, which the client discards, and any `<think>` tags leaking into the content are stripped. Benchmark `?think=true` if quality looks thin.

## How model speed affects the show

`bench/results/` contains a speed simulation using the mock Ollama server at three assumed speeds. Its timings are simulated, not measured on real models; it tests how the *frontend* copes. The summary is in the PR description and in that run's `report.md`. The key thresholds:

- The analysis sequence covers the first ~4.3 s. A model whose first panelist speaks within ~4 s adds **no visible wait**.
- Each testimony takes ~10–15 s to perform (typing plus reading). A model producing at least ~100 characters per second (≈ 30 tokens/s) stays ahead of the show. Slower models make viewers watch a live caret mid-sentence. That still works, because the words stream as written, but it's slower.
- Below ~50 characters per second (≈ 12–15 tokens/s, typical of a 4B model on CPU), viewers wait noticeably between panelists. That's fine for local use but not for the public experience.

## Evidence still needed

To pick the production model with evidence, run the following. Step 1 is expected to cost about $1–2 in total (10 ideas × 3 Claude models, with FIX). The benchmark's pre-run *pessimistic* estimate is about $3.20, so it needs `--budget-usd 4`. Haiku alone costs a few cents.

```bash
# 1. Claude candidates (needs ANTHROPIC_API_KEY; prints a cost estimate and stops unless you add --yes)
npm run bench -- --targets anthropic:claude-haiku-5-5,anthropic:claude-sonnet-5-5,anthropic:claude-opus-5-5 --budget-usd 4 --yes

# 2. Debate mode on the leading candidate
npm run bench -- --targets "anthropic:claude-haiku-5-5,anthropic:claude-haiku-5-5?debate=multi" --yes

# 3. Local Qwen on your machine (free)
npm run bench -- --targets "ollama:qwen3.5:4b,ollama:qwen3.5:9b"
```

Then complete the blinded review (`blind-review.html`) for each run and score it (`npm run bench:score`). Decide using:

1. **Human quality scores**, especially humour, specificity and debate. Differences under ~0.5 on this sample size are noise.
2. **Time to first speech and longest panelist wait** from the report.
3. **Measured cost per journey.**
