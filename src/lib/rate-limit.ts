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

/** Most distinct clients tracked at once. Past this, new clients share one bucket, so rotating spoofed addresses can't grow memory. */
const MAX_KEYS = 10_000;

export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const buckets = new Map<string, Bucket>();

  return function check(requestedKey: string, now = Date.now()): RateLimitResult {
    // Opportunistic cleanup so the map can't grow forever.
    if (buckets.size > MAX_KEYS / 2) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    const key = buckets.has(requestedKey) || buckets.size < MAX_KEYS ? requestedKey : "__overflow__";
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

/**
 * Who is calling, for rate limiting. A client can put anything in a header, so
 * what is trustworthy depends on the platform in front of the app:
 *
 * - CLIENT_IP_HEADER set (e.g. "x-vercel-forwarded-for", "cf-connecting-ip",
 *   "fly-client-ip"): use exactly that header. Set it to the header your edge
 *   overwrites on every request; it is then not spoofable.
 * - Otherwise, in production, use the LAST x-forwarded-for entry: the address
 *   the nearest proxy saw, which a client cannot forge. (The first entry is
 *   whatever the client claimed.) With no proxy at all every header is forgeable.
 * - Outside production the first entry is used, which is convenient for local testing.
 */
export function clientKey(request: Request, env: Record<string, string | undefined> = process.env): string {
  const header = env.CLIENT_IP_HEADER?.trim().toLowerCase();
  if (header) return request.headers.get(header)?.split(",")[0]?.trim() || "unknown";
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (forwarded?.length) return env.NODE_ENV === "production" ? forwarded[forwarded.length - 1] : forwarded[0];
  return request.headers.get("x-real-ip")?.trim() || "anonymous";
}
