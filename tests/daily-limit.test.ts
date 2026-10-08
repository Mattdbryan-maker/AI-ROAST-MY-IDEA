import { afterEach, describe, expect, it, vi } from "vitest";
import { RoastRequestSchema } from "@/lib/types";

const req = (ip: string) =>
  new Request("http://x/api/roast", {
    method: "POST",
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    body: JSON.stringify({ idea: "A subscription box of houseplants for people who kill them." }),
  });

async function load(daily?: string) {
  vi.resetModules();
  if (daily === undefined) delete process.env.DAILY_AI_REQUEST_LIMIT;
  else process.env.DAILY_AI_REQUEST_LIMIT = daily;
  return import("@/lib/api-helpers");
}

afterEach(() => {
  delete process.env.DAILY_AI_REQUEST_LIMIT;
  vi.resetModules();
});

describe("DAILY_AI_REQUEST_LIMIT", () => {
  it("caps total requests across different IPs, with a clear 429", async () => {
    const { parseAiRequest } = await load("2");
    expect((await parseAiRequest(req("1.1.1.1"), RoastRequestSchema)).ok).toBe(true);
    expect((await parseAiRequest(req("2.2.2.2"), RoastRequestSchema)).ok).toBe(true);
    const blocked = await parseAiRequest(req("3.3.3.3"), RoastRequestSchema);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.response.status).toBe(429);
      expect(blocked.response.headers.get("Retry-After")).toBeTruthy();
      expect(JSON.stringify(await blocked.response.json())).toContain("rate_limited");
    }
  });

  it("is off by default", async () => {
    const { parseAiRequest } = await load(undefined);
    for (let i = 0; i < 5; i++) expect((await parseAiRequest(req(`9.9.9.${i}`), RoastRequestSchema)).ok).toBe(true);
  });

  it("still rejects invalid input without needing a provider", async () => {
    const { parseAiRequest } = await load("100");
    const bad = new Request("http://x", { method: "POST", body: "not json" });
    const result = await parseAiRequest(bad, RoastRequestSchema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });
});
