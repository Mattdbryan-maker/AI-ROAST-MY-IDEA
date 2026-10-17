/**
 * Aggregate, anonymous operational counters: how many roasts and FIX runs
 * succeeded or failed, how many requests each limit turned away, tokens and
 * estimated cost, and the two browser events we count (visit, share).
 *
 * Only counts are stored: never an idea, an address, a cookie or any
 * identifier. Counters live in the shared store under daily keys and expire
 * after 45 days.
 */
import { keys, utcDate, utcMonth } from "./admission";
import { getStore, type SharedStore } from "./store";

export const CLIENT_EVENTS = ["visit", "share"] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];

export const STAT_NAMES = [
  "admitted",
  "roast_ok",
  "roast_fail",
  "roast_cancelled",
  "fix_ok",
  "fix_fail",
  "fix_cancelled",
  "denied_client_burst",
  "denied_client_daily",
  "denied_global_requests",
  "denied_daily_spend",
  "denied_monthly_spend",
  "denied_concurrency",
  "denied_unavailable",
  "denied_verification",
  "tokens_in",
  "tokens_out",
  "est_cost_micro",
  "event_visit",
  "event_share",
] as const;
export type StatName = (typeof STAT_NAMES)[number];

const TTL = 45 * 24 * 3600;

/** Best effort: a monitoring counter must never break or delay a user's request. */
export async function bump(name: StatName | string, by = 1, store: SharedStore = getStore(), now = Date.now()): Promise<void> {
  try {
    await store.incrMany([{ key: keys.stat(name, now), by, ttlSec: TTL }]);
  } catch {
    /* intentionally ignored */
  }
}

/** Adds a provider call's real token usage and estimated cost to today's counters (one round trip, best effort). */
export async function recordUsageStats(usage: { inputTokens: number; outputTokens: number; usd: number }, store: SharedStore = getStore(), now = Date.now()): Promise<void> {
  try {
    await store.incrMany([
      { key: keys.stat("tokens_in", now), by: usage.inputTokens, ttlSec: TTL },
      { key: keys.stat("tokens_out", now), by: usage.outputTokens, ttlSec: TTL },
      { key: keys.stat("est_cost_micro", now), by: Math.round(usage.usd * 1e6), ttlSec: TTL },
    ]);
  } catch {
    /* intentionally ignored */
  }
}

export interface DayStats {
  date: string;
  counts: Record<string, number>;
  estCostUsd: number;
}

export async function readStats(days: number, store: SharedStore = getStore(), now = Date.now()) {
  const n = Math.min(Math.max(1, Math.floor(days)), 30);
  const dates = Array.from({ length: n }, (_, i) => utcDate(now - i * 86_400_000));
  const flat = dates.flatMap((d) => STAT_NAMES.map((name) => keys.stat(name, Date.parse(`${d}T12:00:00Z`))));
  const reservedKeys = [keys.requests(now), keys.spendDay(now), keys.spendMonth(now)];
  const [values, reserved, active] = await Promise.all([store.getMany(flat), store.getMany(reservedKeys), store.activeSlots(keys.slots)]);
  const perDay: DayStats[] = dates.map((date, di) => {
    const counts: Record<string, number> = {};
    STAT_NAMES.forEach((name, ni) => (counts[name] = values[di * STAT_NAMES.length + ni]));
    return { date, counts, estCostUsd: Number(((counts.est_cost_micro ?? 0) / 1e6).toFixed(4)) };
  });
  return {
    generatedAt: new Date(now).toISOString(),
    today: {
      date: utcDate(now),
      requestsAdmitted: reserved[0],
      reservedSpendUsd: Number((reserved[1] / 1e6).toFixed(4)),
    },
    month: { month: utcMonth(now), reservedSpendUsd: Number((reserved[2] / 1e6).toFixed(4)) },
    activeGenerations: active,
    days: perDay,
  };
}
