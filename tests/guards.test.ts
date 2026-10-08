import { afterEach, describe, expect, it, vi } from "vitest";
import { RoastRequestSchema } from "@/lib/types";
import { acquireSlot, activeGenerations, estimateCostUsd, loadGuards, recordUsage, resetGuardsForTests, spentTodayUsd } from "@/lib/guards";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";

const headers = (h: Record<string, string>) => new Request("http://x", { headers: h });

describe("clientKey: which address is trusted", () => {
  it("uses exactly the configured edge header when CLIENT_IP_HEADER is set, ignoring spoofable ones", () => {
    const req = headers({ "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "6.6.6.6", "x-real-ip": "7.7.7.7" });
    expect(clientKey(req, { CLIENT_IP_HEADER: "X-Vercel-Forwarded-For", NODE_ENV: "production" })).toBe("203.0.113.9");
  });

  it("a configured header that is missing does not fall back to a client-controlled one", () => {
    expect(clientKey(headers({ "x-forwarded-for": "6.6.6.6" }), { CLIENT_IP_HEADER: "cf-connecting-ip", NODE_ENV: "production" })).toBe("unknown");
  });

  it("in production takes the LAST x-forwarded-for entry, which the nearest proxy wrote, not the client", () => {
    const req = headers({ "x-forwarded-for": "1.2.3.4 , 5.6.7.8, 203.0.113.9" });
    expect(clientKey(req, { NODE_ENV: "production" })).toBe("203.0.113.9");
  });

  it("a client rotating the first entry does not get a fresh bucket in production", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    const results = ["10.0.0.1", "10.0.0.2", "10.0.0.3"].map((spoof) => limiter(clientKey(headers({ "x-forwarded-for": `${spoof}, 203.0.113.9` }), { NODE_ENV: "production" })));
    expect(results.map((r) => r.ok)).toEqual([true, true, false]);
  });

  it("outside production the first entry is used (handy for local testing)", () => {
    expect(clientKey(headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }), { NODE_ENV: "development" })).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then a shared bucket", () => {
    expect(clientKey(headers({ "x-real-ip": "9.9.9.9" }), {})).toBe("9.9.9.9");
    expect(clientKey(headers({}), {})).toBe("anonymous");
  });
});

describe("rate limiter memory bound", () => {
  it("puts new clients in a shared overflow bucket once the table is full, so spoofed keys can't grow memory", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    for (let i = 0; i < 10_000; i++) limiter(`k${i}`);
    // The table is full: two brand-new clients now share one bucket and the second is limited.
    expect(limiter("fresh-a").ok).toBe(true);
    expect(limiter("fresh-b").ok).toBe(false);
    // Known clients keep their own bucket.
    expect(limiter("k5").ok).toBe(false);
  });
});

describe("guard defaults", () => {
  it("production on the Anthropic provider gets a daily request and spend cap without any configuration", () => {
    const g = loadGuards({ NODE_ENV: "production", AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" });
    expect(g.dailyRequests).toBe(1000);
    expect(g.dailySpendUsd).toBe(5);
    expect(g.maxConcurrent).toBe(8);
    expect(g.perClientPer10Min).toBe(20);
  });

  it("local development and the free providers are unlimited by default", () => {
    expect(loadGuards({ NODE_ENV: "development", AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" })).toMatchObject({ dailyRequests: 0, dailySpendUsd: 0 });
    expect(loadGuards({ NODE_ENV: "production", AI_PROVIDER: "ollama" })).toMatchObject({ dailyRequests: 0, dailySpendUsd: 0 });
    expect(loadGuards({ NODE_ENV: "production" })).toMatchObject({ dailyRequests: 0, dailySpendUsd: 0 });
  });

  it("explicit values win, and 0 switches a default cap off", () => {
    const base = { NODE_ENV: "production", AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" };
    expect(loadGuards({ ...base, DAILY_AI_REQUEST_LIMIT: "50", DAILY_SPEND_LIMIT_USD: "0.5" })).toMatchObject({ dailyRequests: 50, dailySpendUsd: 0.5 });
    expect(loadGuards({ ...base, DAILY_AI_REQUEST_LIMIT: "0", DAILY_SPEND_LIMIT_USD: "0" })).toMatchObject({ dailyRequests: 0, dailySpendUsd: 0 });
  });

  it("junk values fall back to the default instead of disabling a limit", () => {
    expect(loadGuards({ NODE_ENV: "production", AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k", DAILY_SPEND_LIMIT_USD: "lots", DAILY_AI_REQUEST_LIMIT: "-5" })).toMatchObject({ dailyRequests: 1000, dailySpendUsd: 5 });
  });

  it("reads CLIENT_IP_HEADER lower-cased", () => {
    expect(loadGuards({ CLIENT_IP_HEADER: " CF-Connecting-IP " }).clientIpHeader).toBe("cf-connecting-ip");
    expect(loadGuards({}).clientIpHeader).toBeNull();
  });
});

describe("generation slots", () => {
  afterEach(resetGuardsForTests);

  it("refuses work beyond the cap and frees a slot exactly once", () => {
    const a = acquireSlot(2)!;
    const b = acquireSlot(2)!;
    expect(acquireSlot(2)).toBeNull();
    expect(activeGenerations()).toBe(2);
    a();
    a(); // double release must not free a second slot
    expect(activeGenerations()).toBe(1);
    expect(acquireSlot(2)).not.toBeNull();
    b();
  });
});

describe("spend ledger", () => {
  afterEach(resetGuardsForTests);

  it("prices Haiku from the table and logs one JSON line per call", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const usd = recordUsage({ purpose: "roast", provider: "anthropic", model: "claude-haiku-5-5", usage: { inputTokens: 2000, outputTokens: 1500 } });
    expect(usd).toBeCloseTo((2000 * 0.1 + 1500 * 0.5) / 1e6, 8);
    expect(spentTodayUsd()).toBeCloseTo(usd, 8);
    const line = JSON.parse(info.mock.calls[0][0] as string);
    expect(line).toMatchObject({ evt: "ai_usage", purpose: "roast", model: "claude-haiku-5-5", inputTokens: 2000, outputTokens: 1500 });
    expect(JSON.stringify(line)).not.toMatch(/key|secret|sk-ant/i);
    info.mockRestore();
  });

  it("local models cost nothing", () => {
    expect(estimateCostUsd("ollama", "qwen3.5:4b", { inputTokens: 1e6, outputTokens: 1e6 })).toBe(0);
  });

  it("an unknown paid model is priced at the most expensive known rate, never as free", () => {
    const unknown = estimateCostUsd("anthropic", "claude-future-9", { inputTokens: 1000, outputTokens: 1000 });
    expect(unknown).toBeGreaterThan(estimateCostUsd("anthropic", "claude-haiku-5-5", { inputTokens: 1000, outputTokens: 1000 }) * 10);
  });

  it("starts a new day at zero", () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const day1 = Date.UTC(2026, 9, 8, 23, 0);
    recordUsage({ purpose: "fix", provider: "anthropic", model: "claude-haiku-5-5", usage: { outputTokens: 1000 } }, day1);
    expect(spentTodayUsd(day1)).toBeGreaterThan(0);
    expect(spentTodayUsd(day1 + 2 * 3600_000)).toBe(0);
  });
});

const req = (body: string, ip = "1.1.1.1") =>
  new Request("http://x/api/roast", { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body });
const goodBody = JSON.stringify({ idea: "A subscription box of houseplants for people who kill them." });

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const k of ["DAILY_AI_REQUEST_LIMIT", "DAILY_SPEND_LIMIT_USD", "MAX_CONCURRENT_AI", "RATE_LIMIT_PER_10_MIN"]) delete process.env[k];
  Object.assign(process.env, env);
  return { api: await import("@/lib/api-helpers"), guards: await import("@/lib/guards") };
}

afterEach(() => {
  for (const k of ["DAILY_AI_REQUEST_LIMIT", "DAILY_SPEND_LIMIT_USD", "MAX_CONCURRENT_AI", "RATE_LIMIT_PER_10_MIN"]) delete process.env[k];
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("parseAiRequest", () => {
  it("rejects an oversized body before parsing it", async () => {
    const { api } = await load({});
    const huge = JSON.stringify({ idea: "x".repeat(70_000) });
    const out = await api.parseAiRequest(req(huge), RoastRequestSchema);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.response.status).toBe(400);
      expect(JSON.stringify(await out.response.json())).toContain("too large");
    }
  });

  it("malformed requests don't use up the daily allowance", async () => {
    const { api } = await load({ DAILY_AI_REQUEST_LIMIT: "1" });
    for (let i = 0; i < 5; i++) expect((await api.parseAiRequest(req("not json", `2.2.2.${i}`), RoastRequestSchema)).ok).toBe(false);
    expect((await api.parseAiRequest(req(JSON.stringify({ idea: "short" }), "3.3.3.3"), RoastRequestSchema)).ok).toBe(false);
    const ok = await api.parseAiRequest(req(goodBody, "4.4.4.4"), RoastRequestSchema);
    expect(ok.ok).toBe(true);
    if (ok.ok) ok.release();
    const blocked = await api.parseAiRequest(req(goodBody, "5.5.5.5"), RoastRequestSchema);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.response.status).toBe(429);
  });

  it("stops serving once today's estimated spend reaches the cap", async () => {
    const { api, guards } = await load({ DAILY_SPEND_LIMIT_USD: "0.001" });
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const first = await api.parseAiRequest(req(goodBody, "6.6.6.1"), RoastRequestSchema);
    expect(first.ok).toBe(true);
    if (first.ok) first.release();
    guards.recordUsage({ purpose: "roast", provider: "anthropic", model: "claude-haiku-5-5", usage: { inputTokens: 3000, outputTokens: 4000 } }); // ≈ $0.0023
    const blocked = await api.parseAiRequest(req(goodBody, "6.6.6.2"), RoastRequestSchema);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.response.headers.get("Retry-After")).toBeTruthy();
  });

  it("answers 429 'packed' when every generation slot is taken, and frees a slot on release", async () => {
    const { api } = await load({ MAX_CONCURRENT_AI: "1" });
    const first = await api.parseAiRequest(req(goodBody, "7.7.7.1"), RoastRequestSchema);
    expect(first.ok).toBe(true);
    const second = await api.parseAiRequest(req(goodBody, "7.7.7.2"), RoastRequestSchema);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.response.status).toBe(429);
      expect(JSON.stringify(await second.response.json())).toContain("packed");
    }
    if (first.ok) first.release();
    const third = await api.parseAiRequest(req(goodBody, "7.7.7.3"), RoastRequestSchema);
    expect(third.ok).toBe(true);
    if (third.ok) third.release();
  });

  it("handleAiRequest releases its slot even when the work throws", async () => {
    const { api, guards } = await load({ MAX_CONCURRENT_AI: "1" });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await api.handleAiRequest(req(goodBody, "8.8.8.1"), RoastRequestSchema, async () => {
      throw new Error("boom");
    });
    expect(res.status).toBe(500);
    expect(guards.activeGenerations()).toBe(0);
  });
});

describe("releasing()", () => {
  it("frees the slot when a stream is cancelled part-way, finishes, or fails", async () => {
    const { api } = await load({});
    async function* events() {
      yield 1;
      yield 2;
      yield 3;
    }
    for (const mode of ["cancel", "finish", "fail"] as const) {
      const release = vi.fn();
      const stream = api.releasing(
        mode === "fail"
          ? (async function* () {
              yield 1;
              throw new Error("x");
            })()
          : events(),
        release,
      );
      try {
        if (mode === "cancel") {
          await stream.next();
          await stream.return(undefined);
        } else {
          for await (const _ of stream) void _;
        }
      } catch {
        /* expected for "fail" */
      }
      expect(release, mode).toHaveBeenCalledTimes(1);
    }
  });
});

describe("misconfiguration is reported plainly, and never as a demo", () => {
  it("shows a setup message instead of 'AI provider error' for a missing key", async () => {
    const { api } = await load({});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ProviderError } = await import("@/lib/ai");
    const out = api.toPublicError(new ProviderError("Server misconfigured: AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set", "provider_error", false));
    expect(out.message).toContain("isn't set up on this server yet");
  });
});
