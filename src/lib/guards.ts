import { loadAiConfig } from "./ai/config";
import { ANTHROPIC_PRICES, costOf } from "./ai/pricing";
import type { LlmUsage } from "./ai/llm";
import { recordUsageStats } from "./shared/stats";
import { upstashCredentials } from "./shared/store";

/**
 * Abuse and cost controls, all per server instance and in memory.
 *
 * What this is: a seatbelt that bounds a single instance's spend and load, and
 * leaves a log trail. What it is NOT: a global limit. On serverless or several
 * instances every instance counts separately and counters reset on restart, so
 * none of this replaces a spend limit set in the Anthropic console or a shared
 * rate-limit store. See docs/phase-4-release-candidate-report.md.
 */

type Env = Record<string, string | undefined>;

const numberFrom = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** True for a deployment that bills per request: production on a paid provider. */
function isPaidProduction(env: Env): boolean {
  if (env.NODE_ENV !== "production") return false;
  try {
    return loadAiConfig(env).provider === "anthropic";
  } catch {
    return false;
  }
}

export interface Guards {
  /** Requests per client per 10 minutes. */
  perClientPer10Min: number;
  /** All AI requests per UTC day on this instance. 0 = off. */
  dailyRequests: number;
  /** Estimated API spend per UTC day on this instance, in USD. 0 = off. */
  dailySpendUsd: number;
  /** Generations running at once on this instance. */
  maxConcurrent: number;
  /** Request body ceiling in characters. */
  maxBodyChars: number;
  /** Header to read the client address from (set by the platform's edge), or null. */
  clientIpHeader: string | null;
}

/**
 * Production on a paid provider gets conservative defaults without any
 * configuration (roughly 500 journeys, about $1-2 on Haiku, per instance per
 * day). Set a variable to 0 to turn a limit off, or to any number to move it.
 */
export function loadGuards(env: Env = process.env): Guards {
  const paid = isPaidProduction(env);
  return {
    perClientPer10Min: numberFrom(env.RATE_LIMIT_PER_10_MIN, 20),
    dailyRequests: numberFrom(env.DAILY_AI_REQUEST_LIMIT, paid ? 1000 : 0),
    dailySpendUsd: numberFrom(env.DAILY_SPEND_LIMIT_USD, paid ? 5 : 0),
    maxConcurrent: numberFrom(env.MAX_CONCURRENT_AI, 8),
    maxBodyChars: 64_000,
    clientIpHeader: env.CLIENT_IP_HEADER?.trim().toLowerCase() || null,
  };
}

// ── Concurrency ─────────────────────────────────────────────────────────────

let inFlight = 0;

/** Takes one generation slot, or returns null when the instance is full. Call the result exactly once to release it. */
export function acquireSlot(max: number): (() => void) | null {
  if (max > 0 && inFlight >= max) return null;
  inFlight++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlight--;
  };
}

export const activeGenerations = () => inFlight;

// ── Spend ledger ────────────────────────────────────────────────────────────

const utcDay = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

const ledger = { day: utcDay(), usd: 0, requests: 0 };

function rollover(now = Date.now()) {
  const day = utcDay(now);
  if (ledger.day !== day) Object.assign(ledger, { day, usd: 0, requests: 0 });
}

/** The most expensive price we know, used when a model has no price entry: unknown must never look free. */
const WORST_PRICE = Object.values(ANTHROPIC_PRICES).reduce((a, b) => (b.output > a.output ? b : a));

export function estimateCostUsd(provider: string, model: string, usage: LlmUsage): number {
  const known = costOf(provider, model, usage);
  if (known !== null) return known;
  return (
    ((usage.inputTokens ?? 0) * WORST_PRICE.input +
      (usage.outputTokens ?? 0) * WORST_PRICE.output +
      (usage.cacheWriteTokens ?? 0) * WORST_PRICE.cacheWrite5m +
      (usage.cacheReadTokens ?? 0) * WORST_PRICE.cacheRead) /
    1_000_000
  );
}

/** Adds one provider call to today's tally and logs it as a single JSON line (grep `ai_usage`). */
export function recordUsage(rec: { purpose: string; provider: string; model: string; usage: LlmUsage }, now = Date.now()): number {
  rollover(now);
  const usd = estimateCostUsd(rec.provider, rec.model, rec.usage);
  ledger.usd += usd;
  ledger.requests += 1;
  console.info(
    JSON.stringify({
      evt: "ai_usage",
      purpose: rec.purpose,
      provider: rec.provider,
      model: rec.model,
      inputTokens: rec.usage.inputTokens ?? 0,
      outputTokens: rec.usage.outputTokens ?? 0,
      estUsd: Number(usd.toFixed(6)),
      estUsdToday: Number(ledger.usd.toFixed(6)),
    }),
  );
  // Shared, anonymous token and cost counters for the operator (see shared/stats.ts). Only when a real store exists.
  if (upstashCredentials()) {
    void recordUsageStats({ inputTokens: rec.usage.inputTokens ?? 0, outputTokens: rec.usage.outputTokens ?? 0, usd });
  }
  return usd;
}

export function spentTodayUsd(now = Date.now()): number {
  rollover(now);
  return ledger.usd;
}

/** Test hook. */
export function resetGuardsForTests() {
  inFlight = 0;
  Object.assign(ledger, { day: utcDay(), usd: 0, requests: 0 });
}
