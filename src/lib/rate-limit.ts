/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * Good enough to stop casual abuse of a single instance. On serverless or
 * multi-instance deployments each instance keeps its own counters — swap this
 * for a shared store (e.g. Redis/Upstash) before relying on it for cost control.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const buckets = new Map<string, Bucket>();

  return function check(key: string, now = Date.now()): RateLimitResult {
    // Opportunistic cleanup so the map can't grow forever.
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    const ok = bucket.count <= limit;
    return {
      ok,
      remaining: Math.max(0, limit - bucket.count),
      retryAfterSeconds: ok ? 0 : Math.ceil((bucket.resetAt - now) / 1000),
    };
  };
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
}
