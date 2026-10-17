import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signToken, BETA_COOKIE, PASS_COOKIE } from "@/lib/shared/access";
import { keys } from "@/lib/shared/admission";
import { MemoryStore, type SharedStore } from "@/lib/shared/store";
import { RoastRequestSchema } from "@/lib/types";

/**
 * End-to-end behaviour of the request pipeline in a production configuration
 * (NODE_ENV=production, Anthropic provider), using the real api-helpers with a
 * fake shared store and no network. MOCKED INFRASTRUCTURE: these prove our code's
 * decisions; the hosted smoke test proves the real Upstash/Vercel/Anthropic path.
 */

const SENTINEL = "ZEBRA-SENTINEL-PITCH";
const IDEA = `A subscription box for people who keep killing houseplants ${SENTINEL}`;
const SECRET = "x".repeat(48);

const PROD: Record<string, string> = {
  NODE_ENV: "production",
  AI_PROVIDER: "anthropic",
  ANTHROPIC_API_KEY: "FAKEKEY-DO-NOT-LEAK-0123456789",
  UPSTASH_REDIS_REST_URL: "https://fake.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "fake-token-0123456789",
};

function post(ip: string, body: unknown = { idea: IDEA }, headers: Record<string, string> = {}) {
  return new Request("https://app.example/api/roast/stream", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, host: "app.example", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function load(env: Record<string, string> = PROD, store: SharedStore | null = new MemoryStore(() => Date.now())) {
  vi.resetModules();
  for (const k of Object.keys(process.env)) if (/^(UPSTASH|KV_REST|BETA_|ACCESS_|TURNSTILE|DAILY_|MONTHLY_|VISITOR_|MAX_CONCURRENT|RATE_LIMIT|RESERVE_|ALLOW_|ANTHROPIC_|AI_PROVIDER|SHOW_AI)/.test(k)) vi.stubEnv(k, undefined as unknown as string);
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const storeMod = await import("@/lib/shared/store");
  storeMod.overrideStoreForTests(store);
  const api = await import("@/lib/api-helpers");
  return { api, store, storeMod };
}

let logs: string[];
beforeEach(() => {
  logs = [];
  for (const level of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")));
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("production without the shared limiter", () => {
  it("refuses to run paid inference when the limiter is not configured (fails closed)", async () => {
    const { api } = await load({ ...PROD, UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "" });
    const run = vi.fn();
    const res = await api.handleAiRequest(post("198.51.100.1"), RoastRequestSchema, run);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: "unavailable" } });
    expect(run).not.toHaveBeenCalled();
  });

  it("only the explicit single-process opt-out re-enables instance-local limits", async () => {
    const { api } = await load({ ...PROD, UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", ALLOW_INSTANCE_LOCAL_LIMITS: "true" });
    const run = vi.fn(async () => ({ ok: true }));
    const res = await api.handleAiRequest(post("198.51.100.2"), RoastRequestSchema, run);
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("refuses when the store is configured but down", async () => {
    const down: SharedStore = {
      kind: "upstash",
      incrMany: async () => {
        throw new Error("fetch failed: ECONNREFUSED https://fake.upstash.io secret-token-detail");
      },
      getMany: async () => [],
      acquireSlot: async () => false,
      releaseSlot: async () => {},
      activeSlots: async () => 0,
    };
    const { api } = await load(PROD, down);
    const run = vi.fn();
    const res = await api.handleAiRequest(post("198.51.100.3"), RoastRequestSchema, run);
    expect(res.status).toBe(503);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/ECONNREFUSED|upstash|secret-token/i);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("production request pipeline", () => {
  it("admits a request, runs it once, records success and frees the slot", async () => {
    const { api, store } = await load();
    const run = vi.fn(async () => ({ hello: "world" }));
    const res = await api.handleAiRequest(post("198.51.100.4"), RoastRequestSchema, run);
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
    expect(await store!.activeSlots(keys.slots)).toBe(0);
    expect((await store!.getMany([keys.stat("roast_ok", Date.now())]))[0]).toBe(1);
  });

  it("a provider failure returns a clean error, never a made-up success, and still frees the slot", async () => {
    const { api, store } = await load();
    const { ProviderError } = await import("@/lib/ai");
    const res = await api.handleAiRequest(post("198.51.100.5"), RoastRequestSchema, async () => {
      throw new ProviderError("The AI provider failed: 529 overloaded FAKEKEY-DO-NOT-LEAK-0123456789");
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toMatchObject({ error: { code: "provider_error" } });
    expect(body).not.toHaveProperty("mode");
    expect(body).not.toHaveProperty("takes");
    expect(JSON.stringify(body)).not.toContain("DO-NOT-LEAK");
    expect(await store!.activeSlots(keys.slots)).toBe(0);
    expect((await store!.getMany([keys.stat("roast_fail", Date.now())]))[0]).toBe(1);
  });

  it("does not show provider detail to users in production", async () => {
    const { api } = await load();
    const { ProviderError } = await import("@/lib/ai");
    const err = api.toPublicError(new ProviderError("upstream said: key sk-ant-xyz invalid"));
    expect(err.message).not.toContain("sk-ant");
    expect(err.message).not.toContain("[");
  });

  it("limits one visitor to 3 roasts a day with a clear 429, and other visitors are unaffected", async () => {
    const { api } = await load({ ...PROD, RATE_LIMIT_PER_10_MIN: "50" });
    const ok = vi.fn(async () => ({}));
    for (let i = 0; i < 3; i++) expect((await api.handleAiRequest(post("198.51.100.6"), RoastRequestSchema, ok)).status).toBe(200);
    const blocked = await api.handleAiRequest(post("198.51.100.6"), RoastRequestSchema, ok);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(ok).toHaveBeenCalledTimes(3);
    expect((await api.handleAiRequest(post("198.51.100.7"), RoastRequestSchema, ok)).status).toBe(200);
  });

  it("counts FIX requests as their own allowance", async () => {
    const { api } = await load({ ...PROD, VISITOR_DAILY_ROASTS: "1", VISITOR_DAILY_FIXES: "1", RATE_LIMIT_PER_10_MIN: "50" });
    const ok = async () => ({});
    expect((await api.handleAiRequest(post("198.51.100.8"), RoastRequestSchema, ok, "roast")).status).toBe(200);
    expect((await api.handleAiRequest(post("198.51.100.8"), RoastRequestSchema, ok, "fix")).status).toBe(200);
    expect((await api.handleAiRequest(post("198.51.100.8"), RoastRequestSchema, ok, "fix")).status).toBe(429);
  });

  it("holds the global request allowance across many visitors (spend boundary)", async () => {
    const { api } = await load({ ...PROD, DAILY_SPEND_LIMIT_USD: "0.03", RESERVE_PER_REQUEST_USD: "0.01" });
    const ok = async () => ({});
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await api.handleAiRequest(post(`198.51.100.${20 + i}`), RoastRequestSchema, ok)).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429, 429]);
  });

  it("lets only MAX_CONCURRENT_AI generations run at once, however many arrive together", async () => {
    const { api } = await load({ ...PROD, MAX_CONCURRENT_AI: "4" });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let started = 0;
    const run = async () => {
      started++;
      await gate;
      return {};
    };
    const pending = Array.from({ length: 12 }, (_, i) => api.handleAiRequest(post(`198.51.100.${60 + i}`), RoastRequestSchema, run));
    await vi.waitFor(() => expect(started).toBe(4));
    await new Promise((r) => setTimeout(r, 30));
    expect(started).toBe(4);
    release();
    const statuses = (await Promise.all(pending)).map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 200)).toHaveLength(4);
    expect(statuses.filter((s) => s === 429)).toHaveLength(8);
  });
});

describe("invalid requests never reach the shared store", () => {
  async function countingStore() {
    const inner = new MemoryStore(() => Date.now());
    let calls = 0;
    const store: SharedStore = {
      kind: "upstash",
      incrMany: (o) => (calls++, inner.incrMany(o)),
      getMany: (k) => (calls++, inner.getMany(k)),
      acquireSlot: (p, i, m, t) => (calls++, inner.acquireSlot(p, i, m, t)),
      releaseSlot: (p, i) => inner.releaseSlot(p, i),
      activeSlots: (p) => inner.activeSlots(p),
    };
    return { store, calls: () => calls };
  }

  it.each([
    ["not JSON", "this is not json"],
    ["too short", { idea: "tiny" }],
    ["wrong type", { idea: 42 }],
    ["missing idea", {}],
    ["oversized idea", { idea: "x".repeat(1300) }],
    ["oversized body", { idea: IDEA, junk: "y".repeat(70_000) }],
  ])("rejects %s with 400 before any counter is touched", async (_name, body) => {
    const { store, calls } = await countingStore();
    const { api } = await load(PROD, store);
    const run = vi.fn();
    const res = await api.handleAiRequest(post("198.51.100.90", body as never), RoastRequestSchema, run);
    expect(res.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
    expect(calls()).toBe(0);
  });

  it("rejects a cross-site browser POST", async () => {
    const { api } = await load();
    const run = vi.fn();
    const res = await api.handleAiRequest(post("198.51.100.91", { idea: IDEA }, { origin: "https://evil.example" }), RoastRequestSchema, run);
    expect(res.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it("accepts a same-origin browser POST", async () => {
    const { api } = await load();
    const res = await api.handleAiRequest(post("198.51.100.92", { idea: IDEA }, { origin: "https://app.example" }), RoastRequestSchema, async () => ({}));
    expect(res.status).toBe(200);
  });
});

describe("invite gate and human check (server side)", () => {
  const GATED = { ...PROD, BETA_ACCESS_CODES: "alpha-code-1,beta-code-2", ACCESS_SIGNING_SECRET: SECRET };

  it("blocks direct API calls without an invite cookie", async () => {
    const { api } = await load(GATED);
    const run = vi.fn();
    const res = await api.handleAiRequest(post("198.51.100.100"), RoastRequestSchema, run);
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("accepts a valid signed invite cookie, and rejects a forged or expired one", async () => {
    const { api } = await load(GATED);
    const good = await signToken("beta", SECRET, 3600);
    const forged = (await signToken("beta", "y".repeat(48), 3600));
    const expired = await signToken("beta", SECRET, -10);
    const wrongKind = await signToken("pass", SECRET, 3600);
    const ok = async () => ({});
    const withCookie = (c: string, ip: string) => post(ip, { idea: IDEA }, { cookie: `${BETA_COOKIE}=${encodeURIComponent(c)}` });
    expect((await api.handleAiRequest(withCookie(good, "198.51.100.101"), RoastRequestSchema, ok)).status).toBe(200);
    expect((await api.handleAiRequest(withCookie(forged, "198.51.100.102"), RoastRequestSchema, ok)).status).toBe(401);
    expect((await api.handleAiRequest(withCookie(expired, "198.51.100.103"), RoastRequestSchema, ok)).status).toBe(401);
    expect((await api.handleAiRequest(withCookie(wrongKind, "198.51.100.104"), RoastRequestSchema, ok)).status).toBe(401);
  });

  it("fails closed when the gate is on but the signing secret is missing or weak", async () => {
    const { api } = await load({ ...PROD, BETA_ACCESS_CODES: "alpha-code-1", ACCESS_SIGNING_SECRET: "short" });
    const run = vi.fn();
    const res = await api.handleAiRequest(post("198.51.100.105"), RoastRequestSchema, run);
    expect(res.status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });

  it("requires a human-check pass on the paid endpoints when Turnstile is configured", async () => {
    const { api, store } = await load({ ...PROD, TURNSTILE_SECRET_KEY: "ts-secret", ACCESS_SIGNING_SECRET: SECRET });
    const run = vi.fn(async () => ({}));
    const denied = await api.handleAiRequest(post("198.51.100.106"), RoastRequestSchema, run);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: { code: "verification_required" } });
    expect(run).not.toHaveBeenCalled();
    expect((await store!.getMany([keys.requests(Date.now())]))[0]).toBe(0);

    const pass = await signToken("pass", SECRET, 600);
    const ok = await api.handleAiRequest(post("198.51.100.106", { idea: IDEA }, { cookie: `${PASS_COOKIE}=${pass}` }), RoastRequestSchema, run);
    expect(ok.status).toBe(200);
  });
});

describe("secrets and logs", () => {
  it("never writes the pitch or the API key to the logs, on success, failure or refusal", async () => {
    const { api } = await load({ ...PROD, VISITOR_DAILY_ROASTS: "1", RATE_LIMIT_PER_10_MIN: "50" });
    const { ProviderError } = await import("@/lib/ai");
    await api.handleAiRequest(post("198.51.100.110"), RoastRequestSchema, async () => ({}));
    await api.handleAiRequest(post("198.51.100.110"), RoastRequestSchema, async () => ({})); // refused: daily
    await api.handleAiRequest(post("198.51.100.111"), RoastRequestSchema, async () => {
      throw new ProviderError("provider failed");
    });
    await api.handleAiRequest(post("198.51.100.112"), RoastRequestSchema, async () => {
      throw new Error("boom");
    });
    const all = logs.join("\n");
    expect(logs.length).toBeGreaterThan(0);
    expect(all).not.toContain(SENTINEL);
    expect(all).not.toContain("DO-NOT-LEAK");
    expect(all).not.toContain("198.51.100"); // raw client addresses are not logged either
  });
});
