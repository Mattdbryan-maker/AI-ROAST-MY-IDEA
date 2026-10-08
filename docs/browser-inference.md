# Can users run Qwen in their own browser?

**Question:** could a small Qwen model run on the user's device with WebGPU, so a roast costs us nothing?

**Verdict: not as the main experience in V1. Possibly later as an opt-in "run it on my device" mode for capable desktops.** The blockers are a multi-gigabyte first-visit download, uneven device support (especially on phones), a context window too small for our prompt, and small-model quality that is unproven for humour. None of these is solved by engineering effort on our side alone.

This is a desk assessment. No proof of concept was built: the build environment had no GPU and could not download model weights, so any browser code would have been untested. That fails the bar of "only if it can be completed safely".

## The technology

| Option | What it is | Qwen support (verified 2026-10-08) |
|---|---|---|
| **WebLLM** (MLC) | WebGPU inference engine with an OpenAI-style API and JSON-schema-constrained output (`response_format`) | Prebuilt Qwen3 (0.6B–8B) and Qwen3.5 (0.8B–9B) builds, per its `prebuiltAppConfig` |
| **Transformers.js v4** (Hugging Face, ONNX Runtime Web) | General ML in the browser, WebGPU backend | Community ONNX exports of Qwen3.5 small models exist; ONNX Runtime added WebGPU support for Qwen3.5 |
| Chrome built-in AI (Prompt API) | Browser-provided model (Gemini Nano), supports structured output | Not Qwen, Chrome-only, and model choice isn't ours |

## Measured facts (from WebLLM's model config)

| Model build | GPU memory required | Context window |
|---|---|---|
| Qwen3.5-0.8B q4f16 | ~1.6 GB | 4,096 tokens |
| Qwen3.5-2B q4f16 | ~2.2 GB | 4,096 tokens |
| Qwen3.5-4B q4f16 | ~3.9 GB | 4,096 tokens |
| Qwen3.5-9B q4f16 | ~6.4 GB | 4,096 tokens |
| Qwen3-4B q4f16 | ~3.4 GB | 4,096 tokens |

The download is roughly the size of the model weights: about 0.5 GB for 0.8B and 2–2.5 GB for 4B. It happens once per device and is then cached, though browsers can evict it.

## Assessment against the brief

| Factor | Finding | Impact |
|---|---|---|
| **Download** | 0.5–2.5 GB before the first roast, typically one to several minutes even on fast broadband, plus shader compilation. | Kills the "paste an idea, watch the show" first impression. Unacceptable as a default for a viral, first-visit product. |
| **Context window** | WebLLM's Qwen builds use 4,096 tokens. One roast needs ~2,600 tokens of prompt (≈2,000 system + schema) plus ~1,500–2,000 tokens of output, so it doesn't fit reliably. | The prompt would have to be cut roughly in half, which costs persona and debate quality. Custom builds with larger context mean more memory. |
| **Desktop support** | WebGPU ships in Chrome/Edge 113+, Safari 26 (macOS 26), and Firefox 141+ on Windows. | Reasonable coverage on modern desktops with a decent GPU. |
| **Mobile support** | iOS needs iOS 26+ (Safari 26). Android Chrome 121+ supports WebGPU only on some GPUs (Android 12+, Qualcomm/ARM), and Firefox Android lacks it. Phone memory limits make 2B+ models fragile; tabs get killed. | Most social-media traffic is mobile. Many of those visitors would fail or fall back. |
| **Speed** | Not measured here: no GPU was available. Published browser figures for these exact builds are scarce. Expect useful speed on recent dedicated or Apple-silicon GPUs and slow speed on integrated or mobile GPUs. | Needs on-device measurement. The [speed thresholds in models-and-costs.md](models-and-costs.md#how-model-speed-affects-the-show) apply: ~30 tokens/s keeps up with the show. |
| **Quality** | Only 0.8B–4B fits typical devices. Humour, persona separation and debate are exactly the skills small models do worst. | Unknown. Run the server benchmark on `qwen3.5:2b` / `qwen3.5:4b` via Ollama first: if those don't pass the blinded review, the browser versions won't either. |
| **Structured output** | WebLLM supports JSON schema constraints (XGrammar), so the same validation pipeline would apply. | Good. Malformed output is handled exactly as on the server. |
| **Cinematic experience** | The existing streaming UI would work unchanged if the browser engine fed the same event stream. | Good once loaded. The download is the problem. |
| **Licence** | Qwen3 and Qwen3.5 open weights are Apache 2.0 (commercial use allowed). Avoid Qwen2.5-3B and -72B, which use the more restrictive Qwen licence. | No blocker if the Apache-licensed builds are used. |
| **Cost to us** | Zero inference cost per roast, but someone hosts ~2 GB of weights. Hugging Face's CDN is free today, while self-hosting has bandwidth costs. | The saving is real, but compare it with Haiku 5.5 at ~$0.002–0.003 a journey. |

## Recommendation

1. **Don't build it for V1.** At Haiku 5.5 prices, the API cost of a full journey is a fraction of a cent. Browser inference would save very little and cost a multi-gigabyte download, mobile failures and probably weaker roasts.
2. **Gate a future decision on evidence we can collect cheaply now:** benchmark `ollama:qwen3.5:2b` and `ollama:qwen3.5:4b` with a shortened prompt. If they score close to the API models in the blinded review, a browser mode becomes worth prototyping.
3. **If built later**, make it an explicit opt-in for desktop browsers with WebGPU. Show the download size up front, run it in a Web Worker, keep the server panel as the default, and never fall back silently between them.
