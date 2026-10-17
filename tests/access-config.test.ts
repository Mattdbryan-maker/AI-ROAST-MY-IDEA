import { describe, expect, it, vi } from "vitest";
import { ConfigError, loadAiConfig } from "@/lib/ai/config";
import {
  TURNSTILE_VERIFY_URL,
  codeMatches,
  cookieHeader,
  loadAccessConfig,
  readCookie,
  safeEqual,
  signToken,
  verifyToken,
  verifyTurnstile,
} from "@/lib/shared/access";
import { sharedMode } from "@/lib/shared/mode";

const SECRET = "s".repeat(40);

describe("signed tokens", () => {
  it("verifies a fresh token and rejects tampering, expiry, the wrong secret and the wrong purpose", async () => {
    const now = 1_800_000_000_000;
    const t = await signToken("beta", SECRET, 60, now);
    expect(await verifyToken("beta", t, SECRET, now + 1000)).toBe(true);
    expect(await verifyToken("beta", t, SECRET, now + 61_000)).toBe(false);
    expect(await verifyToken("beta", t, "z".repeat(40), now)).toBe(false);
    expect(await verifyToken("pass", t, SECRET, now)).toBe(false);
    const [exp, sig] = t.split(".");
    expect(await verifyToken("beta", `${Number(exp) + 999999}.${sig}`, SECRET, now)).toBe(false);
    expect(await verifyToken("beta", `${exp}.${sig.slice(0, -2)}AA`, SECRET, now)).toBe(false);
  });

  it.each([undefined, null, "", "garbage", ".", "abc.def", "1.", "NaN.x"])("rejects malformed token %s", async (bad) => {
    expect(await verifyToken("beta", bad as string, SECRET)).toBe(false);
  });

  it("never verifies without a secret", async () => {
    const t = await signToken("beta", SECRET, 60);
    expect(await verifyToken("beta", t, null)).toBe(false);
  });
});

describe("helpers", () => {
  it("compares strings without short-circuiting", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
  it("matches invite codes exactly (trimmed), not by prefix", () => {
    expect(codeMatches(" alpha-code-1 ", ["alpha-code-1", "other"])).toBe(true);
    expect(codeMatches("alpha", ["alpha-code-1"])).toBe(false);
    expect(codeMatches("", ["alpha-code-1"])).toBe(false);
  });
  it("reads cookies and writes HttpOnly, SameSite cookies (Secure in production)", () => {
    expect(readCookie("a=1; ar_beta=tok%2E1; b=2", "ar_beta")).toBe("tok.1");
    expect(readCookie("a=1", "ar_beta")).toBeUndefined();
    const prod = cookieHeader("ar_beta", "v", 60, true);
    expect(prod).toMatch(/HttpOnly/);
    expect(prod).toMatch(/SameSite=Lax/);
    expect(prod).toMatch(/Secure/);
    expect(cookieHeader("ar_beta", "v", 60, false)).not.toMatch(/Secure/);
  });
});

describe("access configuration", () => {
  it("is off with nothing set", () => {
    expect(loadAccessConfig({})).toMatchObject({ gateEnabled: false, turnstileEnabled: false, misconfigured: false });
  });
  it("flags a gate or Turnstile with no usable signing secret", () => {
    expect(loadAccessConfig({ BETA_ACCESS_CODES: "a,b" }).misconfigured).toBe(true);
    expect(loadAccessConfig({ BETA_ACCESS_CODES: "a", ACCESS_SIGNING_SECRET: "short" }).misconfigured).toBe(true);
    expect(loadAccessConfig({ TURNSTILE_SECRET_KEY: "k" }).misconfigured).toBe(true);
    expect(loadAccessConfig({ BETA_ACCESS_CODES: "a, b ,", ACCESS_SIGNING_SECRET: SECRET })).toMatchObject({ betaCodes: ["a", "b"], misconfigured: false });
  });
});

describe("Turnstile verification (mocked Cloudflare)", () => {
  const reply = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response);

  it("passes only on success:true, and posts the secret, token and client address to Cloudflare's endpoint", async () => {
    const f = reply({ success: true });
    expect(await verifyTurnstile("tok", "sec", "203.0.113.9", f as unknown as typeof fetch)).toBe(true);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    const body = String(init.body);
    expect(body).toContain("secret=sec");
    expect(body).toContain("response=tok");
    expect(body).toContain("remoteip=203.0.113.9");
  });

  it("fails on a rejected token, an HTTP error, a network error and a timeout", async () => {
    expect(await verifyTurnstile("tok", "sec", "1.1.1.1", reply({ success: false, "error-codes": ["timeout-or-duplicate"] }) as unknown as typeof fetch)).toBe(false);
    expect(await verifyTurnstile("tok", "sec", "1.1.1.1", reply({ success: true }, false) as unknown as typeof fetch)).toBe(false);
    expect(await verifyTurnstile("tok", "sec", "1.1.1.1", (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toBe(false);
    const slow = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
    expect(await verifyTurnstile("tok", "sec", "1.1.1.1", slow, 20)).toBe(false);
  });

  it("rejects an empty or oversized token without calling Cloudflare", async () => {
    const f = reply({ success: true });
    expect(await verifyTurnstile("", "sec", "1.1.1.1", f as unknown as typeof fetch)).toBe(false);
    expect(await verifyTurnstile("x".repeat(2049), "sec", "1.1.1.1", f as unknown as typeof fetch)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("production AI configuration is safe by default", () => {
  const prod = { NODE_ENV: "production", AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" };

  it("selects claude-haiku-5-5 with no model variable set", () => {
    expect(loadAiConfig(prod)).toMatchObject({ provider: "anthropic", model: "claude-haiku-5-5", fixModel: "claude-haiku-5-5" });
  });

  it("refuses a missing provider in production instead of silently serving the demo", () => {
    expect(() => loadAiConfig({ NODE_ENV: "production" })).toThrow(ConfigError);
    expect(() => loadAiConfig({ NODE_ENV: "production", ANTHROPIC_API_KEY: "k" })).toThrow(/AI_PROVIDER is not set/);
  });

  it("fails clearly when the key is missing", () => {
    expect(() => loadAiConfig({ NODE_ENV: "production", AI_PROVIDER: "anthropic" })).toThrow(/ANTHROPIC_API_KEY is not set/);
  });

  it.each(["claude-sonnet-5-5", "claude-opus-5-5", "claude-fable-5-1"])("refuses the expensive model %s in production", (model) => {
    expect(() => loadAiConfig({ ...prod, ANTHROPIC_MODEL: model })).toThrow(/not an allowed production model/);
    expect(() => loadAiConfig({ ...prod, ANTHROPIC_FIX_MODEL: model })).toThrow(/ANTHROPIC_FIX_MODEL/);
  });

  it("allows another model only when the operator widens the list on purpose", () => {
    expect(loadAiConfig({ ...prod, ANTHROPIC_MODEL: "claude-sonnet-5-5", ANTHROPIC_ALLOWED_MODELS: "claude-haiku-5-5,claude-sonnet-5-5" })).toMatchObject({ model: "claude-sonnet-5-5" });
  });

  it("does not restrict development, and still allows an explicit demo", () => {
    expect(loadAiConfig({ NODE_ENV: "development", AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-opus-5-5" })).toMatchObject({ model: "claude-opus-5-5" });
    expect(loadAiConfig({ NODE_ENV: "production", AI_PROVIDER: "demo" })).toMatchObject({ provider: "demo" });
    expect(loadAiConfig({})).toMatchObject({ provider: "demo" });
  });
});

describe("when the shared limiter is mandatory", () => {
  const key = { AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" };
  it("is mandatory for the paid provider in production", () => {
    expect(sharedMode({ ...key, NODE_ENV: "production" })).toEqual({ required: true, configured: false, use: true });
    expect(sharedMode({ ...key, NODE_ENV: "production", UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" })).toEqual({ required: true, configured: true, use: true });
    expect(sharedMode({ ...key, NODE_ENV: "production", KV_REST_API_URL: "https://x", KV_REST_API_TOKEN: "t" }).configured).toBe(true);
  });
  it("is not required for free providers or development, but is used when credentials exist", () => {
    expect(sharedMode({ NODE_ENV: "production", AI_PROVIDER: "demo" }).use).toBe(false);
    expect(sharedMode({ NODE_ENV: "production", AI_PROVIDER: "ollama" }).use).toBe(false);
    expect(sharedMode({ ...key, NODE_ENV: "development" }).use).toBe(false);
    expect(sharedMode({ ...key, NODE_ENV: "development", UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" }).use).toBe(true);
  });
  it("treats a broken production configuration as paid, never as lenient", () => {
    expect(sharedMode({ NODE_ENV: "production" }).required).toBe(true);
  });
  it("can be opted out of only explicitly", () => {
    expect(sharedMode({ ...key, NODE_ENV: "production", ALLOW_INSTANCE_LOCAL_LIMITS: "true" }).required).toBe(false);
  });
});
