import { describe, expect, it } from "vitest";
import { admit, hashClient, keys, loadPolicy, type Policy } from "@/lib/shared/admission";
import { MemoryStore, UpstashStore, type PipelineLike, type RedisLike, type SharedStore } from "@/lib/shared/store";
import { readStats } from "@/lib/shared/stats";

/**
 * These tests run the REAL admission logic against an in-memory implementation of
 * the shared-store interface. They prove the counting, boundary, concurrency and
 * fail-closed behaviour of OUR code. They do not prove Upstash itself; that is
 * covered by the hosted smoke test (docs/phase-10-production-launch-readiness.md).
 */

const T0 = Date.UTC(2026, 9, 17, 12, 0, 0);

const policy = (over: Partial<Policy> = {}): Policy => ({
  perClient10Min: 100,
  perClientDaily: { roast: 100, fix: 100 },
  dailyRequests: 1000,
  dailySpendUsd: 100,
  monthlySpendUsd: 1000,
  reservePerRequestUsd: 0.01,
  maxConcurrent: 0,
  slotTtlMs: 150_000,
  ...over,
});

let n = 0;
const id = () => `req-${++n}`;
const run = (store: SharedStore, p: Policy, over: { kind?: "roast" | "fix"; client?: string; now?: number } = {}) =>
  admit({ store, policy: p, kind: over.kind ?? "roast", client: over.client ?? "visitor-a", now: over.now ?? T0, requestId: id() });

describe("shared admission: per-visitor limits", () => {
  it("allows the daily roast quota, then refuses with a retry time until the next UTC day", async () => {
    const store = new MemoryStore(() => T0);
    const p = policy({ perClientDaily: { roast: 3, fix: 3 } });
    for (let i = 0; i < 3; i++) expect((await run(store, p)).ok).toBe(true);
    const fourth = await run(store, p);
    expect(fourth).toMatchObject({ ok: false, reason: "client_daily" });
    if (!fourth.ok) expect(fourth.retryAfterSec).toBe(12 * 3600);
  });

  it("counts roasts and FIX runs separately, and visitors independently", async () => {
    const store = new MemoryStore(() => T0);
    const p = policy({ perClientDaily: { roast: 1, fix: 1 } });
    expect((await run(store, p, { kind: "roast" })).ok).toBe(true);
    expect((await run(store, p, { kind: "fix" })).ok).toBe(true);
    expect((await run(store, p, { kind: "roast" })).ok).toBe(false);
    expect((await run(store, p, { kind: "fix" })).ok).toBe(false);
    expect((await run(store, p, { client: "visitor-b" })).ok).toBe(true);
  });

  it("resets the daily quota on the next UTC day", async () => {
    const store = new MemoryStore(() => T0);
    const p = policy({ perClientDaily: { roast: 1, fix: 1 } });
    expect((await run(store, p)).ok).toBe(true);
    expect((await run(store, p)).ok).toBe(false);
    expect((await run(store, p, { now: T0 + 24 * 3600_000 })).ok).toBe(true);
  });

  it("applies the 10-minute burst limit and keeps counting rejected attempts", async () => {
    const store = new MemoryStore(() => T0);
    const p = policy({ perClient10Min: 2 });
    expect((await run(store, p)).ok).toBe(true);
    expect((await run(store, p)).ok).toBe(true);
    expect(await run(store, p)).toMatchObject({ ok: false, reason: "client_burst" });
    // Hammering does not earn the visitor a fresh allowance: the rejected attempt still counted.
    expect(await run(store, p)).toMatchObject({ ok: false, reason: "client_burst" });
    // The next 10-minute window starts clean.
    expect((await run(store, p, { now: T0 + 10 * 60_000 })).ok).toBe(true);
  });
});

describe("shared admission: global and spend limits", () => {
  it("shares the global daily request allowance across visitors", async () => {
    const store = new MemoryStore(() => T0);
    const p = policy({ dailyRequests: 3 });
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await run(store, p, { client: `v${i}` }));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false, false]);
    expect(results[3]).toMatchObject({ reason: "global_requests" });
  });

  it("stops exactly at the spend boundary: $0.05 at $0.01 each admits five, not six", async () => {
    const store = new MemoryStore(() => T0);
    const p = policy({ dailySpendUsd: 0.05 });
    const results = [];
    for (let i = 0; i < 8; i++) results.push(await run(store, p, { client: `v${i}` }));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
    expect(results[5]).toMatchObject({ ok: false, reason: "daily_spend" });
  });

  it("enforces the monthly spend ceiling across days", async () => {
    const store = new MemoryStore(() => T0);
    const p = policy({ monthlySpendUsd: 0.03, dailySpendUsd: 100 });
    const day = (d: number) => T0 + d * 24 * 3600_000;
    expect((await run(store, p, { now: day(0), client: "a" })).ok).toBe(true);
    expect((await run(store, p, { now: day(1), client: "b" })).ok).toBe(true);
    expect((await run(store, p, { now: day(2), client: "c" })).ok).toBe(true);
    expect(await run(store, p, { now: day(3), client: "d" })).toMatchObject({ ok: false, reason: "monthly_spend" });
  });

  it("does not let refused attempts eat the allowance (the reservation is handed back)", async () => {
    const store = new MemoryStore(() => T0);
    const p = policy({ perClientDaily: { roast: 1, fix: 1 }, dailySpendUsd: 0.02 });
    expect((await run(store, p, { client: "a" })).ok).toBe(true);
    // Visitor a is refused 20 times; each refusal must refund its reservation.
    for (let i = 0; i < 20; i++) expect((await run(store, p, { client: "a" })).ok).toBe(false);
    // The second admitted request fits in the remaining $0.01, and then the day is full.
    expect((await run(store, p, { client: "b" })).ok).toBe(true);
    expect((await run(store, p, { client: "c" })).ok).toBe(false);
    const [reserved] = await store.getMany([keys.spendDay(T0)]);
    expect(reserved).toBe(20_000);
  });
});

describe("shared admission: concurrency", () => {
  it("never admits more than the allowance when 40 requests arrive at once", async () => {
    const store = new MemoryStore(() => T0);
    const p = policy({ dailySpendUsd: 0.1, dailyRequests: 7 });
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => run(store, p, { client: `v${i}` })));
    expect(results.filter((r) => r.ok)).toHaveLength(7);
    const [reserved, requests] = await store.getMany([keys.spendDay(T0), keys.requests(T0)]);
    expect(requests).toBe(7);
    expect(reserved).toBe(7 * 10_000);
  });

  it("caps simultaneous generations across 'instances' sharing one store, and frees a slot on finish", async () => {
    const store = new MemoryStore(() => T0);
    const p = policy({ maxConcurrent: 3 });
    // Two separate callers (as two serverless instances would be) hitting the same store.
    const instanceA = Array.from({ length: 5 }, (_, i) => run(store, p, { client: `a${i}` }));
    const instanceB = Array.from({ length: 5 }, (_, i) => run(store, p, { client: `b${i}` }));
    const all = await Promise.all([...instanceA, ...instanceB]);
    const admitted = all.filter((r) => r.ok);
    expect(admitted).toHaveLength(3);
    expect(all.find((r) => !r.ok)).toMatchObject({ reason: "concurrency" });
    expect(await store.activeSlots(keys.slots)).toBe(3);

    const first = admitted[0];
    if (first.ok) await first.finish("ok");
    expect(await store.activeSlots(keys.slots)).toBe(2);
    expect((await run(store, p, { client: "late" })).ok).toBe(true);
  });

  it("releases the slot exactly once even if finish is called twice", async () => {
    const store = new MemoryStore(() => T0);
    const p = policy({ maxConcurrent: 1 });
    const a = await run(store, p);
    if (!a.ok) throw new Error("expected admission");
    await a.finish("ok");
    await a.finish("fail");
    expect(await store.activeSlots(keys.slots)).toBe(0);
    const [ok, fail] = await store.getMany([keys.stat("roast_ok", T0), keys.stat("roast_fail", T0)]);
    expect([ok, fail]).toEqual([1, 0]);
  });

  it("a slot abandoned by a crashed function frees itself after the TTL", async () => {
    let now = T0;
    const store = new MemoryStore(() => now);
    const p = policy({ maxConcurrent: 1, slotTtlMs: 150_000 });
    expect((await run(store, p, { now })).ok).toBe(true); // never finished
    expect((await run(store, p, { now, client: "b" })).ok).toBe(false);
    now = T0 + 151_000;
    expect((await run(store, p, { now, client: "c" })).ok).toBe(true);
  });

  it("returns the slot and the reservation when a request is refused after taking it", async () => {
    const store = new MemoryStore(() => T0);
    const p = policy({ maxConcurrent: 1, perClientDaily: { roast: 5, fix: 5 } });
    const held = await run(store, p, { client: "a" });
    expect(held.ok).toBe(true);
    for (let i = 0; i < 5; i++) expect(await run(store, p, { client: "b" })).toMatchObject({ ok: false, reason: "concurrency" });
    const [visitorDaily, requests] = await store.getMany([keys.daily("b", "roast", T0), keys.requests(T0)]);
    expect(visitorDaily).toBe(0);
    expect(requests).toBe(1);
  });
});

describe("shared admission: failure behaviour", () => {
  const broken = (): SharedStore => ({
    kind: "upstash",
    incrMany: async () => {
      throw new Error("connect ETIMEDOUT");
    },
    getMany: async () => {
      throw new Error("down");
    },
    acquireSlot: async () => {
      throw new Error("down");
    },
    releaseSlot: async () => {},
    activeSlots: async () => 0,
  });

  it("denies the request when the store is down (never fails open)", async () => {
    const r = await run(broken(), policy());
    expect(r).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("denies when the store dies after the counters but before the slot is taken", async () => {
    const inner = new MemoryStore(() => T0);
    const flaky: SharedStore = { ...inner, kind: "upstash", incrMany: (ops) => inner.incrMany(ops), getMany: (k) => inner.getMany(k), activeSlots: (p) => inner.activeSlots(p), releaseSlot: (p, i) => inner.releaseSlot(p, i), acquireSlot: async () => { throw new Error("boom"); } };
    expect(await run(flaky, policy({ maxConcurrent: 2 }))).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("does not throw if bookkeeping fails after the work is done", async () => {
    const inner = new MemoryStore(() => T0);
    let fail = false;
    const store: SharedStore = {
      kind: "upstash",
      incrMany: async (ops) => {
        if (fail) throw new Error("late failure");
        return inner.incrMany(ops);
      },
      getMany: (k) => inner.getMany(k),
      acquireSlot: (p, i, m, t) => inner.acquireSlot(p, i, m, t),
      releaseSlot: async () => {
        throw new Error("release failed");
      },
      activeSlots: (p) => inner.activeSlots(p),
    };
    const a = await run(store, policy({ maxConcurrent: 1 }));
    if (!a.ok) throw new Error("expected admission");
    fail = true;
    await expect(a.finish("ok")).resolves.toBeUndefined();
  });
});

describe("shared admission: privacy and monitoring", () => {
  it("hashes the visitor id: the raw address never reaches the store", async () => {
    const hashed = hashClient("203.0.113.9", "secret-salt");
    expect(hashed).toMatch(/^[0-9a-f]{20}$/);
    expect(hashed).not.toContain("203");
    expect(hashClient("203.0.113.9", "other-salt")).not.toBe(hashed);
    const store = new MemoryStore(() => T0);
    const seen: string[] = [];
    const spy: SharedStore = { ...store, kind: "memory", incrMany: (ops) => (seen.push(...ops.map((o) => o.key)), store.incrMany(ops)), getMany: (k) => store.getMany(k), acquireSlot: (p, i, m, t) => store.acquireSlot(p, i, m, t), releaseSlot: (p, i) => store.releaseSlot(p, i), activeSlots: (p) => store.activeSlots(p) };
    await admit({ store: spy, policy: policy(), kind: "roast", client: hashed, now: T0, requestId: "x" });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.join(" ")).not.toContain("203.0.113.9");
  });

  it("records outcomes and refusals so the operator can read them", async () => {
    const store = new MemoryStore(() => T0);
    const p = policy({ perClientDaily: { roast: 1, fix: 1 } });
    const a = await run(store, p);
    if (a.ok) await a.finish("ok");
    await run(store, p); // refused: client_daily
    const stats = await readStats(1, store, T0);
    expect(stats.days[0].counts).toMatchObject({ roast_ok: 1, admitted: 1, denied_client_daily: 1 });
    expect(stats.today.requestsAdmitted).toBe(1);
    expect(stats.today.reservedSpendUsd).toBe(0.01);
  });
});

describe("defaults", () => {
  it("are conservative for a 10-20 person beta", () => {
    const d = loadPolicy({});
    expect(d.perClientDaily).toEqual({ roast: 3, fix: 3 });
    expect(d.dailyRequests).toBe(150);
    expect(d.dailySpendUsd).toBe(2);
    expect(d.monthlySpendUsd).toBe(20);
    expect(d.maxConcurrent).toBe(4);
    expect(d.reservePerRequestUsd).toBe(0.01);
    expect(d.slotTtlMs).toBeGreaterThan(120_000); // longer than the routes' maxDuration
  });

  it("can be configured, and ignores nonsense values", () => {
    expect(loadPolicy({ VISITOR_DAILY_ROASTS: "5", DAILY_SPEND_LIMIT_USD: "0.5", MAX_CONCURRENT_AI: "2" })).toMatchObject({
      perClientDaily: { roast: 5, fix: 3 },
      dailySpendUsd: 0.5,
      maxConcurrent: 2,
    });
    expect(loadPolicy({ DAILY_SPEND_LIMIT_USD: "lots", DAILY_AI_REQUEST_LIMIT: "-4" })).toMatchObject({ dailySpendUsd: 2, dailyRequests: 150 });
  });
});

describe("Upstash adapter (against a recording fake of the client)", () => {
  function fakeRedis() {
    const calls: string[][] = [];
    const counters = new Map<string, number>();
    const pools = new Map<string, Map<string, number>>();
    const pipe = (): PipelineLike & { queue: (() => unknown)[] } => {
      const queue: (() => unknown)[] = [];
      const p: PipelineLike & { queue: (() => unknown)[] } = {
        queue,
        incrby(key, by) {
          calls.push(["INCRBY", key, String(by)]);
          queue.push(() => (counters.set(key, (counters.get(key) ?? 0) + by), counters.get(key)));
          return p;
        },
        expire(key, s) {
          calls.push(["EXPIRE", key, String(s)]);
          queue.push(() => 1);
          return p;
        },
        zremrangebyscore(key, _min, max) {
          calls.push(["ZREMRANGEBYSCORE", key]);
          queue.push(() => {
            const pool = pools.get(key);
            if (pool) for (const [m, s] of pool) if (s <= Number(max)) pool.delete(m);
            return 0;
          });
          return p;
        },
        zadd(key, member) {
          calls.push(["ZADD", key, member.member]);
          queue.push(() => (pools.set(key, (pools.get(key) ?? new Map()).set(member.member, member.score)), 1));
          return p;
        },
        zcard(key) {
          calls.push(["ZCARD", key]);
          queue.push(() => pools.get(key)?.size ?? 0);
          return p;
        },
        zrem(key, ...members) {
          calls.push(["ZREM", key, ...members]);
          queue.push(() => (members.forEach((m) => pools.get(key)?.delete(m)), 1));
          return p;
        },
        async exec() {
          return queue.map((f) => f());
        },
      };
      return p;
    };
    const redis: RedisLike = {
      pipeline: () => pipe(),
      mget: async <T extends unknown[]>(...keys: string[]) => keys.map((k) => counters.get(k) ?? null) as T,
    };
    return { redis, calls };
  }

  it("batches counters into one pipeline and parses the INCRBY results", async () => {
    const { redis, calls } = fakeRedis();
    const store = new UpstashStore(redis);
    const out = await store.incrMany([
      { key: "a", by: 2, ttlSec: 60 },
      { key: "b", by: 1, ttlSec: 60 },
    ]);
    expect(out).toEqual([2, 1]);
    expect(calls.map((c) => c[0])).toEqual(["INCRBY", "EXPIRE", "INCRBY", "EXPIRE"]);
    expect(await store.getMany(["a", "missing"])).toEqual([2, 0]);
  });

  it("holds and releases pool slots, backing out when over the cap", async () => {
    const { redis } = fakeRedis();
    const store = new UpstashStore(redis);
    expect(await store.acquireSlot("pool", "1", 2, 1000)).toBe(true);
    expect(await store.acquireSlot("pool", "2", 2, 1000)).toBe(true);
    expect(await store.acquireSlot("pool", "3", 2, 1000)).toBe(false);
    expect(await store.activeSlots("pool")).toBe(2);
    await store.releaseSlot("pool", "1");
    expect(await store.acquireSlot("pool", "3", 2, 1000)).toBe(true);
  });

  it("runs the whole admission flow through the adapter", async () => {
    const { redis } = fakeRedis();
    const store = new UpstashStore(redis);
    const p = policy({ dailySpendUsd: 0.03, maxConcurrent: 2 });
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => run(store, p, { client: `v${i}` })));
    expect(results.filter((r) => r.ok).length).toBeLessThanOrEqual(2);
    expect(results.filter((r) => r.ok).length).toBeGreaterThanOrEqual(1);
  });
});
