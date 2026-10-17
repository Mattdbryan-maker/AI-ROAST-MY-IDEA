/**
 * The shared counter store behind rate limits, spend reservations, concurrency
 * slots and aggregate statistics.
 *
 * Production uses Upstash Redis over its REST API, which works from serverless
 * functions without connection management. The same interface is implemented in
 * memory for local development, tests and single-process self-hosting.
 *
 * Every key this app writes carries its time bucket in its name (for example a
 * UTC date), so a TTL only garbage-collects: it never decides whether a window
 * is over. That keeps the logic correct even if a TTL is refreshed.
 */
import { Redis } from "@upstash/redis";

export interface CounterOp {
  key: string;
  by: number;
  /** Seconds until the key may be discarded. */
  ttlSec: number;
}

export interface SharedStore {
  readonly kind: "upstash" | "memory";
  /** Adds `by` to each counter atomically per key and returns the new values, in order. One round trip. */
  incrMany(ops: CounterOp[]): Promise<number[]>;
  /** Current values (0 when absent). */
  getMany(keys: string[]): Promise<number[]>;
  /**
   * Takes one of at most `max` slots in a shared pool. Returns false when the
   * pool is full. A slot expires by itself after `ttlMs`, so a function that
   * dies without releasing cannot hold the pool shut.
   */
  acquireSlot(pool: string, id: string, max: number, ttlMs: number): Promise<boolean>;
  releaseSlot(pool: string, id: string): Promise<void>;
  /** Slots currently held (for monitoring). */
  activeSlots(pool: string): Promise<number>;
}

// ── Upstash ────────────────────────────────────────────────────────────────

/** Minimal slice of the Upstash client that we use, so tests can substitute it. */
export interface PipelineLike {
  incrby(key: string, n: number): PipelineLike;
  expire(key: string, seconds: number): PipelineLike;
  zremrangebyscore(key: string, min: number | string, max: number | string): PipelineLike;
  zadd(key: string, member: { score: number; member: string }): PipelineLike;
  zcard(key: string): PipelineLike;
  zrem(key: string, ...members: string[]): PipelineLike;
  exec(): Promise<unknown[]>;
}

export interface RedisLike {
  pipeline(): PipelineLike;
  mget<T extends unknown[]>(...keys: string[]): Promise<T>;
}

export class UpstashStore implements SharedStore {
  readonly kind = "upstash" as const;
  constructor(private readonly redis: RedisLike) {}

  async incrMany(ops: CounterOp[]): Promise<number[]> {
    if (ops.length === 0) return [];
    const p = this.redis.pipeline();
    for (const op of ops) {
      p.incrby(op.key, op.by);
      p.expire(op.key, op.ttlSec);
    }
    const results = await p.exec();
    // Results alternate INCRBY, EXPIRE.
    return ops.map((_, i) => Number(results[i * 2]));
  }

  async getMany(keys: string[]): Promise<number[]> {
    if (keys.length === 0) return [];
    const values = await this.redis.mget<(number | string | null)[]>(...keys);
    return values.map((v) => (v === null || v === undefined ? 0 : Number(v)));
  }

  async acquireSlot(pool: string, id: string, max: number, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const p = this.redis.pipeline();
    p.zremrangebyscore(pool, "-inf", now);
    p.zadd(pool, { score: now + ttlMs, member: id });
    p.zcard(pool);
    p.expire(pool, Math.ceil(ttlMs / 1000) + 60);
    const results = await p.exec();
    const size = Number(results[2]);
    if (size > max) {
      // Over the cap: give the slot back. If two requests race here both may back out, which errs towards refusing.
      await this.redis.pipeline().zrem(pool, id).exec();
      return false;
    }
    return true;
  }

  async releaseSlot(pool: string, id: string): Promise<void> {
    await this.redis.pipeline().zrem(pool, id).exec();
  }

  async activeSlots(pool: string): Promise<number> {
    const now = Date.now();
    const p = this.redis.pipeline();
    p.zremrangebyscore(pool, "-inf", now);
    p.zcard(pool);
    const results = await p.exec();
    return Number(results[1]);
  }
}

// ── Memory ─────────────────────────────────────────────────────────────────

export class MemoryStore implements SharedStore {
  readonly kind = "memory" as const;
  private readonly counters = new Map<string, { value: number; expiresAt: number }>();
  private readonly pools = new Map<string, Map<string, number>>();

  constructor(private readonly now: () => number = Date.now) {}

  async incrMany(ops: CounterOp[]): Promise<number[]> {
    const t = this.now();
    this.sweep(t);
    return ops.map((op) => {
      const cur = this.counters.get(op.key);
      const value = (cur && cur.expiresAt > t ? cur.value : 0) + op.by;
      this.counters.set(op.key, { value, expiresAt: t + op.ttlSec * 1000 });
      return value;
    });
  }

  async getMany(keys: string[]): Promise<number[]> {
    const t = this.now();
    return keys.map((k) => {
      const cur = this.counters.get(k);
      return cur && cur.expiresAt > t ? cur.value : 0;
    });
  }

  async acquireSlot(pool: string, id: string, max: number, ttlMs: number): Promise<boolean> {
    const t = this.now();
    const slots = this.pools.get(pool) ?? new Map<string, number>();
    this.pools.set(pool, slots);
    for (const [k, exp] of slots) if (exp <= t) slots.delete(k);
    if (slots.size >= max) return false;
    slots.set(id, t + ttlMs);
    return true;
  }

  async releaseSlot(pool: string, id: string): Promise<void> {
    this.pools.get(pool)?.delete(id);
  }

  async activeSlots(pool: string): Promise<number> {
    const t = this.now();
    const slots = this.pools.get(pool);
    if (!slots) return 0;
    for (const [k, exp] of slots) if (exp <= t) slots.delete(k);
    return slots.size;
  }

  private sweep(t: number) {
    if (this.counters.size < 5000) return;
    for (const [k, c] of this.counters) if (c.expiresAt <= t) this.counters.delete(k);
  }
}

// ── Configuration ──────────────────────────────────────────────────────────

type Env = Record<string, string | undefined>;

/**
 * Upstash credentials. The Vercel Marketplace integration injects KV_REST_API_*;
 * a database created directly at Upstash gives UPSTASH_REDIS_REST_*. Either works.
 */
export function upstashCredentials(env: Env = process.env): { url: string; token: string } | null {
  const url = (env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL)?.trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN)?.trim();
  return url && token ? { url, token } : null;
}

let memorySingleton: MemoryStore | null = null;
let cached: { key: string; store: SharedStore } | null = null;

let override: SharedStore | null = null;

/** Test hook: route every getStore() call to a fake (a MemoryStore, or one that fails on purpose). */
export function overrideStoreForTests(store: SharedStore | null) {
  override = store;
}

/** The configured store: Upstash when credentials exist, otherwise one in-memory store per process. */
export function getStore(env: Env = process.env): SharedStore {
  if (override) return override;
  const creds = upstashCredentials(env);
  if (!creds) return (memorySingleton ??= new MemoryStore());
  const key = `${creds.url}|${creds.token.length}`;
  if (cached?.key === key) return cached.store;
  const store = new UpstashStore(new Redis({ url: creds.url, token: creds.token, retry: { retries: 1, backoff: () => 100 } }) as unknown as RedisLike);
  cached = { key, store };
  return store;
}

/** Test hook. */
export function resetStoreForTests() {
  memorySingleton = null;
  cached = null;
}
