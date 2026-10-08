/**
 * Model benchmark: runs the same pitches through each target exactly as the app
 * does (the real streaming pipeline, validation and retries), and records
 * timings, reliability, token usage, estimated cost and the outputs themselves.
 *
 *   npm run bench -- --targets demo,ollama:qwen3.5:4b --ideas all
 *   npm run bench -- --targets anthropic:claude-haiku-5-5,anthropic:claude-sonnet-5-5 --budget-usd 1 --yes
 *
 * Paid targets never run without --yes; without it you get the plan and a cost
 * estimate (a dry run). Runs are sequential by default so latency isn't skewed.
 * See bench/README.md.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { UsageRecord } from "../src/lib/ai/model-provider";
import { PROMPT_VERSION } from "../src/lib/ai/prompts";
import { ProviderError } from "../src/lib/ai/provider";
import { streamRoastEvents } from "../src/lib/ai/stream";
import type { FixResult, Roast } from "../src/lib/types";
import { writeBlindReview } from "./blind";
import { analyseRoast, type Heuristics } from "./heuristics";
import { BENCH_IDEAS, type BenchIdea } from "./ideas";
import { ANTHROPIC_PRICES, BUDGET_ASSUMPTIONS, costOf, type TokenUsage } from "./pricing";
import { renderReport } from "./report";
import { parseTarget, type Target } from "./targets";

export interface RunRecord {
  target: string;
  provider: Target["provider"];
  model: string;
  fixModel: string;
  debateMode: Target["debateMode"];
  ideaId: string;
  category: string;
  repeat: number;
  ok: boolean;
  failedAt?: "roast" | "fix";
  errorCode?: string;
  errorMessage?: string;
  /** Times the pipeline started over (retry after invalid output, or a model fallback). */
  resets: number;
  /** Milliseconds from the request being sent. */
  timings: {
    metaMs?: number;
    firstSpeechMs?: number;
    takeMs: number[];
    debateFirstMs?: number;
    roastDoneMs?: number;
    fixMs?: number;
  };
  usage: Partial<Record<UsageRecord["purpose"], TokenUsage & { calls: number; loadMs?: number; evalMs?: number }>>;
  costUsd: { roast: number | null; fix: number | null; journey: number | null };
  heuristics?: Heuristics;
  roast?: Roast;
  fix?: FixResult;
}

export interface BenchRun {
  startedAt: string;
  promptVersion: string;
  args: Record<string, unknown>;
  targets: { spec: string; provider: string; model: string; fixModel: string; debateMode: string; runtime?: Record<string, unknown> }[];
  ideas: BenchIdea[];
  records: RunRecord[];
  skipped: number;
  notes: string[];
}

function parseArgs(argv: string[]) {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const has = (name: string) => argv.includes(`--${name}`);
  const ideasArg = get("ideas") ?? "all";
  return {
    targets: (get("targets") ?? "demo").split(",").map((s) => s.trim()).filter(Boolean),
    ideas: ideasArg === "all" ? BENCH_IDEAS : BENCH_IDEAS.filter((i) => ideasArg.split(",").includes(i.id)),
    repeat: Math.max(1, Number(get("repeat") ?? 1)),
    fix: !has("no-fix"),
    budgetUsd: Number(get("budget-usd") ?? 2),
    yes: has("yes"),
    concurrency: Math.min(4, Math.max(1, Number(get("concurrency") ?? 1))),
    out: get("out"),
    label: get("label") ?? "",
  };
}

/** Pessimistic pre-run estimate for paid targets; actual cost is measured. */
function estimateJourneyUsd(target: Target, withFix: boolean): number {
  if (!target.paid) return 0;
  const est = (model: string, u: TokenUsage) => costOf("anthropic", model, u) ?? Number.POSITIVE_INFINITY;
  let usd = est(target.model, BUDGET_ASSUMPTIONS.roast);
  if (target.debateMode === "multi") usd += 5 * est(target.model, BUDGET_ASSUMPTIONS.debateTurn);
  if (withFix) usd += est(target.fixModel, BUDGET_ASSUMPTIONS.fix);
  return usd;
}

async function runOne(target: Target, idea: BenchIdea, repeat: number, withFix: boolean): Promise<RunRecord> {
  const usage: RunRecord["usage"] = {};
  const costs = { roast: 0 as number | null, fix: 0 as number | null };
  const onUsage = (u: UsageRecord) => {
    const slot = (usage[u.purpose] ??= { calls: 0 });
    slot.calls++;
    for (const k of ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens"] as const) {
      if (u.usage[k] !== undefined) slot[k] = (slot[k] ?? 0) + u.usage[k]!;
    }
    if (u.usage.loadMs !== undefined) slot.loadMs = (slot.loadMs ?? 0) + u.usage.loadMs;
    if (u.usage.evalMs !== undefined) slot.evalMs = (slot.evalMs ?? 0) + u.usage.evalMs;
    const c = costOf(u.provider, u.model, u.usage);
    const key = u.purpose === "fix" ? "fix" : "roast";
    costs[key] = c === null || costs[key] === null ? null : costs[key]! + c;
  };

  const record: RunRecord = {
    target: target.spec,
    provider: target.provider,
    model: target.model,
    fixModel: target.fixModel,
    debateMode: target.debateMode,
    ideaId: idea.id,
    category: idea.category,
    repeat,
    ok: false,
    resets: 0,
    timings: { takeMs: [] },
    usage,
    costUsd: { roast: null, fix: null, journey: null },
  };

  const { roast: provider } = target.build(onUsage);
  const t0 = performance.now();
  const at = () => Math.round(performance.now() - t0);
  try {
    for await (const event of streamRoastEvents(provider, idea.pitch)) {
      if (event.type === "reset") {
        record.resets++;
        record.timings = { takeMs: [] };
      } else if (event.type === "meta") record.timings.metaMs ??= at();
      else if (event.type === "progress" && event.headline) record.timings.firstSpeechMs ??= at();
      else if (event.type === "take") record.timings.takeMs[event.index] = at();
      else if (event.type === "debate") record.timings.debateFirstMs ??= at();
      else if (event.type === "done") {
        record.timings.roastDoneMs = at();
        record.roast = event.roast;
      }
    }
  } catch (err) {
    record.failedAt = "roast";
    record.errorCode = err instanceof ProviderError ? err.code : "internal";
    record.errorMessage = err instanceof Error ? err.message : String(err);
  }

  if (record.roast && withFix) {
    const t1 = performance.now();
    try {
      record.fix = await provider.fix(idea.pitch, record.roast);
      record.timings.fixMs = Math.round(performance.now() - t1);
    } catch (err) {
      record.failedAt = "fix";
      record.errorCode = err instanceof ProviderError ? err.code : "internal";
      record.errorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  record.ok = !!record.roast && (!withFix || !!record.fix);
  if (record.roast) record.heuristics = analyseRoast(idea.pitch, record.roast, record.fix);
  record.costUsd = {
    roast: costs.roast,
    fix: withFix ? costs.fix : 0,
    journey: costs.roast === null || costs.fix === null ? null : costs.roast + (withFix ? costs.fix : 0),
  };
  return record;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = args.targets.map((spec) => parseTarget(spec));
  if (!args.ideas.length) throw new Error("No ideas selected");

  const jobs = targets.flatMap((target) => args.ideas.flatMap((idea) => Array.from({ length: args.repeat }, (_, r) => ({ target, idea, repeat: r + 1 }))));
  const estimate = targets.reduce((sum, t) => sum + estimateJourneyUsd(t, args.fix) * args.ideas.length * args.repeat, 0);

  console.log(`\nBenchmark plan — prompts ${PROMPT_VERSION}`);
  for (const t of targets) {
    const per = estimateJourneyUsd(t, args.fix);
    const price = t.provider === "anthropic" && !ANTHROPIC_PRICES[t.model] ? " (no price on file: cost will show as unknown)" : "";
    console.log(`  ${t.spec.padEnd(48)} ${args.ideas.length * args.repeat} journeys  ≤ $${per.toFixed(4)} each (pessimistic estimate)${price}`);
  }
  console.log(`  Total ${jobs.length} journeys, pessimistic paid estimate ≤ $${estimate.toFixed(4)}, budget $${args.budgetUsd.toFixed(2)}\n`);

  const paid = targets.some((t) => t.paid);
  if (paid && !args.yes) {
    console.log("Dry run: paid targets need --yes to run. Nothing was sent.");
    return;
  }
  if (estimate > args.budgetUsd) {
    console.error(`Estimated cost exceeds --budget-usd ${args.budgetUsd}. Raise the budget or run fewer ideas/targets.`);
    process.exitCode = 1;
    return;
  }

  const run: BenchRun = {
    startedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    args: { ...args, ideas: args.ideas.map((i) => i.id) },
    targets: [],
    ideas: args.ideas,
    records: [],
    skipped: 0,
    notes: [],
  };

  // Concurrency only for remote APIs; local models are run one at a time.
  const local = jobs.filter((j) => j.target.provider !== "anthropic");
  const remote = jobs.filter((j) => j.target.provider === "anthropic");
  let spent = 0;
  let stop = false;

  const execute = async (job: (typeof jobs)[number]) => {
    if (stop) {
      run.skipped++;
      return;
    }
    process.stdout.write(`  ${job.target.spec} · ${job.idea.id} #${job.repeat} … `);
    const record = await runOne(job.target, job.idea, job.repeat, args.fix);
    run.records.push(record);
    spent += record.costUsd.journey ?? 0;
    const status = record.ok ? "ok" : `FAILED (${record.failedAt}: ${record.errorMessage})`;
    console.log(`${status} · first speech ${record.timings.firstSpeechMs ?? "–"}ms · roast ${record.timings.roastDoneMs ?? "–"}ms · $${(record.costUsd.journey ?? 0).toFixed(4)}`);
    if (spent > args.budgetUsd) {
      stop = true;
      run.notes.push(`Stopped early: measured spend $${spent.toFixed(4)} exceeded the $${args.budgetUsd} budget.`);
    }
  };

  for (const job of local) await execute(job);
  for (let i = 0; i < remote.length; i += args.concurrency) await Promise.all(remote.slice(i, i + args.concurrency).map(execute));

  // Runtime details (e.g. Ollama model size and memory) after the model has been loaded.
  for (const t of targets) {
    const { client } = t.provider === "anthropic" && !process.env.ANTHROPIC_API_KEY ? { client: undefined } : t.build(() => {});
    run.targets.push({ spec: t.spec, provider: t.provider, model: t.model, fixModel: t.fixModel, debateMode: t.debateMode, runtime: await client?.describe?.() });
  }

  const stamp = run.startedAt.replace(/[:.]/g, "-").slice(0, 19);
  const outDir = args.out ?? join("bench", "results", `${stamp}${args.label ? `-${args.label}` : ""}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "results.json"), JSON.stringify(run, null, 2));
  writeFileSync(join(outDir, "report.md"), renderReport(run));
  writeBlindReview(run, outDir);
  console.log(`\nWrote ${outDir}/report.md, results.json, blind-review.html and blind-key.json`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
