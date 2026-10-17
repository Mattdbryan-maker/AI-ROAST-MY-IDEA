/**
 * Shared admission control for every request that can spend money.
 *
 * One call to `admit` decides, against counters held in the shared store (so
 * every serverless instance sees the same numbers):
 *
 *   1. burst        requests per visitor per 10 minutes
 *   2. visitor/day  roasts and FIX requests per visitor per UTC day
 *   3. global/day   all AI requests per UTC day
 *   4. spend/day    reserved dollars per UTC day
 *   5. spend/month  reserved dollars per UTC month
 *   6. concurrency  generations running at once, across all instances
 *
 * The counters are bumped with INCRBY and the returned value is checked, so two
 * simultaneous requests can never both take the last unit of an allowance: the
 * increment is atomic, and the loser sees a value over the limit and backs out.
 *
 * Spend is RESERVED up front at a conservative flat price per request instead of
 * being reconciled afterwards. Reconciling would need the request's real usage to
 * reach this module, and a function that dies mid-stream would leave the money
 * unaccounted for. A reservation errs high, never low, and is never refunded:
 * a request that fails after the model started is still billed by the provider.
 * Real token usage is logged and counted separately for monitoring (stats.ts).
 *
 * Any store error denies the request ("unavailable"). Spend controls that quietly
 * switch off when Redis is down are not controls.
 */
import { createHash } from "node:crypto";
import type { SharedStore } from "./store";

export type Kind = "roast" | "fix";

export interface Policy {
  /** Requests per visitor per 10 minutes (retries and rejected attempts included). */
  perClient10Min: number;
  /** Per visitor per UTC day. 0 = off. */
  perClientDaily: Record<Kind, number>;
  /** All AI requests per UTC day. 0 = off. */
  dailyRequests: number;
  /** Reserved USD per UTC day. 0 = off. */
  dailySpendUsd: number;
  /** Reserved USD per UTC month. 0 = off. */
  monthlySpendUsd: number;
  /** Flat price reserved for each admitted request. */
  reservePerRequestUsd: number;
  /** Generations at once, all instances together. 0 = off. */
  maxConcurrent: number;
  /** A slot frees itself after this long even if never released. Must exceed the route's maxDuration. */
  slotTtlMs: number;
}

type Env = Record<string, string | undefined>;

const num = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/**
 * Defaults are sized for a protected beta of roughly 10-20 invited testers:
 * 3 roasts and 3 FIX runs each per day, about 150 requests a day in total, and
 * at most $2 a day or $20 a month of reserved spend (a reservation is 5-10x the
 * measured cost of a request, so real spend should be a fraction of that).
 */
export function loadPolicy(env: Env = process.env): Policy {
  return {
    perClient10Min: num(env.RATE_LIMIT_PER_10_MIN, 10),
    perClientDaily: { roast: num(env.VISITOR_DAILY_ROASTS, 3), fix: num(env.VISITOR_DAILY_FIXES, 3) },
    dailyRequests: num(env.DAILY_AI_REQUEST_LIMIT, 150),
    dailySpendUsd: num(env.DAILY_SPEND_LIMIT_USD, 2),
    monthlySpendUsd: num(env.MONTHLY_SPEND_LIMIT_USD, 20),
    reservePerRequestUsd: num(env.RESERVE_PER_REQUEST_USD, 0.01),
    maxConcurrent: num(env.MAX_CONCURRENT_AI, 4),
    slotTtlMs: 150_000,
  };
}

export type DenyReason = "client_burst" | "client_daily" | "global_requests" | "daily_spend" | "monthly_spend" | "concurrency" | "unavailable";

export type Outcome = "ok" | "fail" | "cancelled";

export type Admission =
  | { ok: true; finish(outcome: Outcome): Promise<void> }
  | { ok: false; reason: DenyReason; retryAfterSec: number };

const MICRO = 1_000_000;
const usdToMicro = (usd: number) => Math.round(usd * MICRO);

export const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const utcMonth = (ms: number) => utcDate(ms).slice(0, 7);

/** An opaque, non-reversible visitor id: the raw address is never stored. */
export function hashClient(client: string, salt: string): string {
  return createHash("sha256").update(`${salt}|${client}`).digest("hex").slice(0, 20);
}

function secondsUntilNextUtcDay(ms: number): number {
  const d = new Date(ms);
  return Math.max(1, Math.ceil((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - ms) / 1000));
}

export const keys = {
  burst: (client: string, ms: number) => `ar:burst:${client}:${Math.floor(ms / 600_000)}`,
  daily: (client: string, kind: Kind, ms: number) => `ar:vday:${utcDate(ms)}:${kind}:${client}`,
  requests: (ms: number) => `ar:day:${utcDate(ms)}:requests`,
  spendDay: (ms: number) => `ar:day:${utcDate(ms)}:reserved_micro`,
  spendMonth: (ms: number) => `ar:month:${utcMonth(ms)}:reserved_micro`,
  slots: "ar:slots",
  stat: (name: string, ms: number) => `ar:stat:${utcDate(ms)}:${name}`,
};

const DAY = 60 * 60 * 24;

export interface AdmitInput {
  store: SharedStore;
  policy: Policy;
  kind: Kind;
  /** Hashed visitor id. */
  client: string;
  now?: number;
  /** Unique per request; names the concurrency slot. */
  requestId: string;
}

export async function admit({ store, policy, kind, client, now = Date.now(), requestId }: AdmitInput): Promise<Admission> {
  const reserve = usdToMicro(policy.reservePerRequestUsd);
  try {
    const dailyLimit = policy.perClientDaily[kind];
    const ops = [
      { key: keys.burst(client, now), by: 1, ttlSec: 900 },
      { key: keys.daily(client, kind, now), by: 1, ttlSec: 2 * DAY },
      { key: keys.requests(now), by: 1, ttlSec: 3 * DAY },
      { key: keys.spendDay(now), by: reserve, ttlSec: 3 * DAY },
      { key: keys.spendMonth(now), by: reserve, ttlSec: 40 * DAY },
    ];
    const [burst, vday, requests, spendDay, spendMonth] = await store.incrMany(ops);

    let deny: DenyReason | null = null;
    let retryAfterSec = 60;
    if (policy.monthlySpendUsd > 0 && spendMonth > usdToMicro(policy.monthlySpendUsd)) {
      deny = "monthly_spend";
      retryAfterSec = 3600;
    } else if (policy.dailySpendUsd > 0 && spendDay > usdToMicro(policy.dailySpendUsd)) {
      deny = "daily_spend";
      retryAfterSec = secondsUntilNextUtcDay(now);
    } else if (policy.dailyRequests > 0 && requests > policy.dailyRequests) {
      deny = "global_requests";
      retryAfterSec = secondsUntilNextUtcDay(now);
    } else if (dailyLimit > 0 && vday > dailyLimit) {
      deny = "client_daily";
      retryAfterSec = secondsUntilNextUtcDay(now);
    } else if (policy.perClient10Min > 0 && burst > policy.perClient10Min) {
      deny = "client_burst";
      retryAfterSec = Math.max(1, Math.ceil((((Math.floor(now / 600_000) + 1) * 600_000) - now) / 1000));
    }

    if (!deny && policy.maxConcurrent > 0) {
      const got = await store.acquireSlot(keys.slots, requestId, policy.maxConcurrent, policy.slotTtlMs);
      if (!got) {
        deny = "concurrency";
        retryAfterSec = 10;
      }
    }

    if (deny) {
      // Hand back what this attempt took. The burst counter is kept on purpose: hammering stays expensive.
      await store.incrMany([
        { key: keys.daily(client, kind, now), by: -1, ttlSec: 2 * DAY },
        { key: keys.requests(now), by: -1, ttlSec: 3 * DAY },
        { key: keys.spendDay(now), by: -reserve, ttlSec: 3 * DAY },
        { key: keys.spendMonth(now), by: -reserve, ttlSec: 40 * DAY },
        { key: keys.stat(`denied_${deny}`, now), by: 1, ttlSec: 45 * DAY },
      ]);
      return { ok: false, reason: deny, retryAfterSec };
    }

    let finished = false;
    return {
      ok: true,
      async finish(outcome) {
        if (finished) return;
        finished = true;
        try {
          if (policy.maxConcurrent > 0) await store.releaseSlot(keys.slots, requestId);
          await store.incrMany([
            { key: keys.stat(`${kind}_${outcome}`, now), by: 1, ttlSec: 45 * DAY },
            { key: keys.stat("admitted", now), by: 1, ttlSec: 45 * DAY },
          ]);
        } catch (err) {
          // The slot expires by itself (slotTtlMs); never let bookkeeping break a finished response.
          console.error(JSON.stringify({ evt: "admission_finish_failed", message: err instanceof Error ? err.message : "unknown" }));
        }
      },
    };
  } catch (err) {
    console.error(JSON.stringify({ evt: "shared_store_unavailable", message: err instanceof Error ? err.message : "unknown" }));
    return { ok: false, reason: "unavailable", retryAfterSec: 30 };
  }
}
