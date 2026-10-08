import type { BenchRun, RunRecord } from "./run";
import { PRICES_SOURCE, PRICES_VERIFIED_ON } from "./pricing";

/**
 * Renders a benchmark run as Markdown. Every number is labelled as measured
 * (timings, success, tokens), estimated (cost, viewer timeline) or heuristic.
 */

const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const worst = (xs: number[]) => (xs.length ? Math.max(...xs) : undefined);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const secs = (ms?: number) => (ms === undefined ? "–" : `${(ms / 1000).toFixed(1)}s`);
const usd = (n?: number | null) => (n === undefined || n === null ? "unknown" : n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(5)}` : `$${n.toFixed(4)}`);
const pct = (n?: number) => (n === undefined ? "–" : `${Math.round(n * 100)}%`);
const num = (n?: number) => (n === undefined ? "–" : Math.round(n).toLocaleString("en-GB"));
const defined = <T>(xs: (T | undefined | null)[]) => xs.filter((x): x is T => x !== undefined && x !== null);

// The UI's pacing, used to estimate when a viewer reaches each panelist (see Trial.tsx / Analyzing.tsx).
const ANALYSIS_MIN_MS = 4300;
const HEADLINE_CPS = 42;
const POINTS_CPS = 95;
const SCORE_REVEAL_MS = 1500;
const READ_TIME_MS = 6000;

/**
 * Estimated viewer timeline for one run: when the viewer arrives at each
 * testimony (auto-advance, no skipping) versus when that testimony's text was
 * complete. A positive wait means the panelist would still be "speaking live"
 * when the viewer got there — fine in moderation, bad if long.
 */
function viewerTimeline(r: RunRecord) {
  if (!r.roast || r.timings.firstSpeechMs === undefined) return undefined;
  let arrive = Math.max(r.timings.firstSpeechMs, ANALYSIS_MIN_MS) + 500;
  const waits: number[] = [];
  r.roast.takes.forEach((take, i) => {
    const doneAt = r.timings.takeMs[i];
    const speak = (take.headline.length / HEADLINE_CPS + take.points.join("").length / POINTS_CPS) * 1000;
    waits.push(Math.max(0, (doneAt ?? 0) - (arrive + speak)));
    arrive = Math.max(arrive + speak, doneAt ?? 0) + SCORE_REVEAL_MS + READ_TIME_MS;
  });
  const debateWait = Math.max(0, (r.timings.roastDoneMs ?? 0) - arrive);
  return { maxPanelistWait: Math.max(...waits), debateWait, verdictReadyAt: Math.max(arrive, r.timings.roastDoneMs ?? 0) };
}

export function renderReport(run: BenchRun): string {
  const byTarget = new Map<string, RunRecord[]>();
  for (const r of run.records) byTarget.set(r.target, [...(byTarget.get(r.target) ?? []), r]);
  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  push(
    `# Model benchmark — ${run.startedAt.slice(0, 16).replace("T", " ")} UTC`,
    "",
    `Prompts: \`${run.promptVersion}\` · Ideas: ${run.ideas.length} · Repeats: ${run.args.repeat} · FIX MY IDEA: ${run.args.fix ? "included" : "skipped"}`,
    "",
    "> **How to read this.** Timings, success rates and token counts are **measured** in this run. Costs are **estimates** (measured tokens × the",
    `> price table verified ${PRICES_VERIFIED_ON}, ${PRICES_SOURCE}). The viewer timeline is an **estimate** from the UI's pacing. The heuristics`,
    "> flag symptoms for a human to check; they are **not** quality scores. Output quality comes from the blinded human review",
    "> (`blind-review.html`), which is pending until someone completes it.",
    "",
  );
  if (run.records.some((r) => r.provider === "demo")) {
    push("> The `demo` target is the offline scripted engine, run at full speed. It's a pipeline baseline, not AI, and its timings say nothing about any model.", "");
  }
  if (run.records.some((r) => r.model.startsWith("mock"))) {
    push("> `mock-*` targets are the mock Ollama server (scripts/mock-ollama.ts) replaying the demo engine at a configured speed. They exercise the real Ollama client and pipeline; their timings are simulated and their text is not AI.", "");
  }
  for (const note of run.notes) push(`> ⚠ ${note}`, "");
  if (run.skipped) push(`> ⚠ ${run.skipped} journeys were skipped (budget stop).`, "");

  push("## Targets", "", "| Target | Provider | Roast model | FIX model | Debate | Runtime details |", "|---|---|---|---|---|---|");
  for (const t of run.targets) {
    const rt = t.runtime ?? {};
    const details = rt.details as { parameter_size?: string; quantization_level?: string } | undefined;
    const bits = [
      details?.parameter_size && `${details.parameter_size} params`,
      details?.quantization_level,
      typeof rt.loadedSizeBytes === "number" && `${(rt.loadedSizeBytes / 1e9).toFixed(1)} GB loaded`,
      typeof rt.loadedVramBytes === "number" && `${(rt.loadedVramBytes / 1e9).toFixed(1)} GB in VRAM`,
      rt.ollamaVersion && `Ollama ${rt.ollamaVersion}`,
      rt.effort && `effort ${rt.effort}`,
      rt.think !== undefined && `think ${rt.think}`,
    ].filter(Boolean);
    push(`| \`${t.spec}\` | ${t.provider} | ${t.model} | ${t.fixModel} | ${t.debateMode} | ${bits.join(", ") || "–"} |`);
  }

  push(
    "",
    "## Reliability and speed (measured)",
    "",
    "Times are from sending the request. *First speech* is when the first panelist's words start streaming — the moment that matters most for the experience.",
    "",
    "| Target | Journeys | Completed | Restarts | First speech (median / worst) | 4 testimonies done (median) | Roast complete (median / worst) | FIX (median / worst) |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const [target, rs] of byTarget) {
    const ok = rs.filter((r) => r.ok);
    const first = defined(rs.map((r) => r.timings.firstSpeechMs));
    const takes = defined(rs.map((r) => r.timings.takeMs[3]));
    const done = defined(rs.map((r) => r.timings.roastDoneMs));
    const fix = defined(rs.map((r) => r.timings.fixMs));
    push(
      `| \`${target}\` | ${rs.length} | ${ok.length}/${rs.length} (${pct(ok.length / rs.length)}) | ${rs.reduce((n, r) => n + r.resets, 0)} | ${secs(median(first))} / ${secs(worst(first))} | ${secs(median(takes))} | ${secs(median(done))} / ${secs(worst(done))} | ${secs(median(fix))} / ${secs(worst(fix))} |`,
    );
  }

  push(
    "",
    "### What a viewer would experience (estimate)",
    "",
    `Estimated from the measured timings and the UI's pacing (analysis sequence ≥ ${ANALYSIS_MIN_MS / 1000}s, typing at ${HEADLINE_CPS}/${POINTS_CPS} chars/s, ${READ_TIME_MS / 1000}s reading pause), assuming the viewer never skips.`,
    "*Longest panelist wait* is how long a viewer would watch a panelist's live caret waiting for the model; *debate wait* is extra time before the debate could finish.",
    "",
    "| Target | First testimony on screen (median) | Longest panelist wait (median / worst) | Debate wait (median / worst) |",
    "|---|---|---|---|",
  );
  for (const [target, rs] of byTarget) {
    const tl = defined(rs.map(viewerTimeline));
    const first = defined(rs.map((r) => (r.timings.firstSpeechMs === undefined ? undefined : Math.max(r.timings.firstSpeechMs, ANALYSIS_MIN_MS) + 500)));
    push(
      `| \`${target}\` | ${secs(median(first))} | ${secs(median(tl.map((t) => t.maxPanelistWait)))} / ${secs(worst(tl.map((t) => t.maxPanelistWait)))} | ${secs(median(tl.map((t) => t.debateWait)))} / ${secs(worst(tl.map((t) => t.debateWait)))} |`,
    );
  }

  push(
    "",
    "## Economics",
    "",
    "Token counts are **measured** (as reported by the provider; Claude output tokens include hidden reasoning). Costs are **estimates** from those counts. Local models have no per-call API fee; their cost is hardware and electricity (see the runtime details above and docs/models-and-costs.md).",
    "",
    "| Target | Roast tokens in / out (mean) | FIX tokens in / out (mean) | Cost per roast (mean) | Cost per roast + FIX (mean) | Per 1,000 full journeys |",
    "|---|---|---|---|---|---|",
  );
  for (const [target, rs] of byTarget) {
    const ok = rs.filter((r) => r.ok);
    const sumIn = (r: RunRecord) => (r.usage.roast?.inputTokens ?? 0) + (r.usage.roast?.cacheReadTokens ?? 0) + (r.usage.roast?.cacheWriteTokens ?? 0) + (r.usage.debate?.inputTokens ?? 0);
    const roastIn = mean(ok.map(sumIn));
    const roastOut = mean(ok.map((r) => (r.usage.roast?.outputTokens ?? 0) + (r.usage.debate?.outputTokens ?? 0)));
    const fixIn = mean(ok.filter((r) => r.usage.fix).map((r) => (r.usage.fix?.inputTokens ?? 0) + (r.usage.fix?.cacheReadTokens ?? 0)));
    const fixOut = mean(ok.filter((r) => r.usage.fix).map((r) => r.usage.fix?.outputTokens ?? 0));
    const costs = ok.map((r) => r.costUsd);
    const unknown = costs.some((c) => c.journey === null);
    const perRoast = unknown ? null : mean(costs.map((c) => c.roast ?? 0));
    const perJourney = unknown ? null : mean(costs.map((c) => c.journey ?? 0));
    push(
      `| \`${target}\` | ${num(roastIn)} / ${num(roastOut)} | ${num(fixIn)} / ${num(fixOut)} | ${usd(perRoast)} | ${usd(perJourney)} | ${perJourney === null || perJourney === undefined ? "unknown" : usd(perJourney * 1000)} |`,
    );
  }
  const local = run.records.filter((r) => r.provider === "ollama" && r.ok);
  if (local.length) {
    push("", "Local runtime timings (measured by Ollama, summed over all calls in a journey's roast):", "", "| Target | Model load (median) | Generation time (median) |", "|---|---|---|");
    for (const [target, rs] of byTarget) {
      if (rs[0].provider !== "ollama") continue;
      push(`| \`${target}\` | ${secs(median(defined(rs.map((r) => r.usage.roast?.loadMs))))} | ${secs(median(defined(rs.map((r) => r.usage.roast?.evalMs))))} |`);
    }
  }

  push(
    "",
    "## Text heuristics (automated — symptoms, not quality)",
    "",
    "Grounding: share of testimonies using a distinctive word from the pitch. Engagement: share of debate lines that answer the previous speaker. Possible invented figures: money/percentages not in the pitch and not framed as an assumption — check each by hand. Overlap: word overlap between the four voices (lower = more distinct).",
    "",
    "| Target | Grounding | Debate engagement | Debates with a concession | Possible invented figures (total) | Clichés (total) | Voice overlap | Truncated strings |",
    "|---|---|---|---|---|---|---|---|",
  );
  for (const [target, rs] of byTarget) {
    const h = defined(rs.map((r) => r.heuristics));
    push(
      `| \`${target}\` | ${pct(mean(h.map((x) => x.pitchGrounding)))} | ${pct(mean(h.map((x) => x.debateEngagement)))} | ${h.filter((x) => x.debateHasConcession).length}/${h.length} | ${h.reduce((n, x) => n + x.possibleInventedFigures, 0)} | ${h.reduce((n, x) => n + x.clicheHits, 0)} | ${mean(h.map((x) => x.personaOverlap))?.toFixed(2) ?? "–"} | ${h.reduce((n, x) => n + x.truncatedStrings, 0)} |`,
    );
  }

  const failures = run.records.filter((r) => !r.ok);
  if (failures.length) {
    push("", "## Failures", "", "| Target | Idea | Stage | Code | Message |", "|---|---|---|---|---|");
    for (const f of failures) push(`| \`${f.target}\` | ${f.ideaId} | ${f.failedAt} | ${f.errorCode} | ${(f.errorMessage ?? "").replace(/\|/g, "\\|").slice(0, 160)} |`);
  }

  push(
    "",
    "## Quality (human, blinded) — pending",
    "",
    "1. Open `blind-review.html` in a browser. Outputs are shuffled per idea and labelled A, B, C… with no model names.",
    "2. Score each against the rubric (bench/RUBRIC.md) and press **Export ratings**.",
    `3. Run \`npm run bench:score -- <this folder> <ratings.json>\` to add a quality table to \`quality.md\`.`,
    "",
  );
  return lines.join("\n");
}
