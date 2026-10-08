# Running the panel on Qwen locally (Windows + Ollama)

This guide gets AI ROAST MY IDEA running on a local Qwen model on a Windows PC, with no API key and no per-roast cost. Allow 15–30 minutes, mostly for the model download.

> Nothing here was run on a real model during development: the build environment had no GPU and couldn't download models. The integration is tested against a protocol-faithful mock Ollama server, so the steps below are the first real run. If something doesn't match, the troubleshooting section covers the likely causes.

## 1. Check your hardware

| Model | Download (approx.) | Comfortable on | Notes |
|---|---|---|---|
| `qwen3.5:4b` (default) | ~3 GB | 8 GB GPU, or 16 GB RAM on CPU | Best starting point. |
| `qwen3.5:9b` | ~6–7 GB | 8–12 GB GPU | Likely better roasts; slower. |
| `qwen3.5:2b` | ~2 GB | Most laptops, CPU OK | Fast, but expect weaker humour and structure. |

Download sizes for the Qwen 3.5 tags are approximate (secondary sources; check `ollama.com/library/qwen3.5` before pulling). On CPU only, expect each roast to take minutes rather than seconds. Benchmark it (step 6) before judging the experience.

**Licence:** Qwen 3.5 open-weight models are released under Apache 2.0 (commercial use allowed). Check the model card for the exact tag you use, because some older Qwen 2.5 sizes (3B, 72B) use a different, more restrictive Qwen licence.

## 2. Install Ollama

1. Download the Windows installer from <https://ollama.com/download> and run it. Ollama runs in the background (tray icon) and serves on `http://127.0.0.1:11434`.
2. Open **PowerShell** and check it's running:

   ```powershell
   ollama --version          # needs a recent version; Qwen 3.5 requires roughly 0.17.4 or later (current is 0.40.x)
   curl.exe http://127.0.0.1:11434/api/version
   ```

## 3. Download the model

```powershell
ollama pull qwen3.5:4b
ollama run qwen3.5:4b "Say hello in five words."   # quick sanity check (Ctrl+D to exit)
```

If `pull` says the model *requires a newer version of Ollama*, update Ollama and restart it from the tray.

## 4. Point the app at Ollama

In the project folder, create or edit `.env.local`:

```ini
AI_PROVIDER=ollama
OLLAMA_MODEL=qwen3.5:4b
# Optional:
# OLLAMA_HOST=127.0.0.1:11434   # default
# OLLAMA_FIX_MODEL=qwen3.5:9b    # a different model for FIX MY IDEA
# OLLAMA_THINK=false             # reasoning off (default): faster, and the UI never shows it anyway
# DEBATE_MODE=multi              # experimental: one call per debate line
```

Then:

```powershell
npm install
npm run dev
```

Open <http://localhost:3000>. The header badge should say **Live AI panel**. `http://localhost:3000/api/status` should report `{"mode":"ai","provider":"ollama","model":"qwen3.5:4b"}`.

The first roast after starting Ollama loads the model into memory, which can take 10–60 seconds. The analysis screen keeps going until the first panelist speaks. After that the model stays loaded for 30 minutes (`OLLAMA_KEEP_ALIVE`).

## 5. Try it without a model (optional)

To see the Ollama path working before downloading anything, run the mock server, which replays the demo engine over the real Ollama protocol:

```powershell
npm run mock:ollama -- --port 11500 --cps 150 --first-token-ms 2000
# in another terminal, with .env.local containing:
#   AI_PROVIDER=ollama
#   OLLAMA_HOST=127.0.0.1:11500
#   OLLAMA_MODEL=mock-qwen
npm run dev
```

The mock isn't AI. Use it to check connectivity and to feel how a slow model affects the show (lower `--cps`).

## 6. Benchmark your machine

```powershell
npm run bench -- --targets ollama:qwen3.5:4b --ideas all
npm run bench -- --targets "ollama:qwen3.5:4b,ollama:qwen3.5:9b" --ideas ai-wedding-speech,marketplace-dog-walking,bad-nft-sourdough
```

Results land in `bench/results/<timestamp>/`. Read `report.md`, then open `blind-review.html` to score the outputs without knowing which model wrote them (see `bench/README.md`).

## Troubleshooting

| Symptom (in the app or the dev server log) | Cause and fix |
|---|---|
| "Can't reach Ollama at http://127.0.0.1:11434" | Ollama isn't running. Start it from the Start menu (or `ollama serve`). If you changed the port, set `OLLAMA_HOST`. |
| "Ollama doesn't have the model … Run: ollama pull …" | Pull it: `ollama pull qwen3.5:4b`. Check the exact tag with `ollama list`. |
| "Ollama didn't start answering within 120s" | The model is still loading, or it's too big for your memory and Ollama is swapping. Try a smaller model, or raise `OLLAMA_FIRST_TOKEN_TIMEOUT_MS`. |
| "The connection to Ollama dropped mid-answer" | Usually out of memory. Check `ollama ps` and the Ollama logs (`%LOCALAPPDATA%\Ollama\server.log`). Use a smaller model or lower `OLLAMA_NUM_CTX`. |
| "ran out of output tokens" | Raise `OLLAMA_NUM_CTX` (default 8192), e.g. to 12288. |
| "The panel got into a fistfight and returned nonsense" | The model produced JSON the app couldn't use, twice. More likely with very small models (≤2B). Try a larger model. |
| Roasts are very slow | Check `ollama ps`: the `PROCESSOR` column should say `100% GPU`. If it says CPU, the model doesn't fit in VRAM. |
| `OLLAMA_HOST=0.0.0.0` in your environment | That's a bind address for the Ollama server. The app automatically connects to `127.0.0.1` instead. |
| Ollama on another PC on your network | Set `OLLAMA_HOST=192.168.x.x:11434` in the app, and on that PC set `OLLAMA_HOST=0.0.0.0` and allow port 11434 through Windows Firewall. |

In development the error screen shows the technical reason in square brackets. Production builds hide it unless `SHOW_AI_ERRORS=true`.
