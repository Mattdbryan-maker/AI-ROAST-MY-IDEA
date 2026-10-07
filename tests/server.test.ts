import { describe, expect, it } from "vitest";
import { resolveProviderName } from "@/lib/ai";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";

describe("provider selection", () => {
  it("falls back to the demo panel without a key", () => {
    expect(resolveProviderName({} as NodeJS.ProcessEnv)).toBe("demo");
    expect(resolveProviderName({ AI_PROVIDER: "anthropic" } as unknown as NodeJS.ProcessEnv)).toBe("demo");
  });

  it("uses Anthropic when a key is present unless demo is forced", () => {
    expect(resolveProviderName({ ANTHROPIC_API_KEY: "k" } as unknown as NodeJS.ProcessEnv)).toBe("anthropic");
    expect(resolveProviderName({ ANTHROPIC_API_KEY: "k", AI_PROVIDER: "demo" } as unknown as NodeJS.ProcessEnv)).toBe("demo");
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window, then blocks until reset", () => {
    const check = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(check("a", 0).ok).toBe(true);
    expect(check("a", 10).ok).toBe(true);
    const blocked = check("a", 20);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(check("b", 20).ok).toBe(true);
    expect(check("a", 1001).ok).toBe(true);
  });

  it("keys on the first forwarded IP", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" } });
    expect(clientKey(req)).toBe("1.2.3.4");
  });
});
