import { describe, expect, it } from "vitest";
import { demoRoast } from "@/lib/ai/demo/engine";
import type { LlmClient, LlmRequest } from "@/lib/ai/llm";
import { ModelRoastProvider } from "@/lib/ai/model-provider";
import { fitText, normalizeFix, normalizeRoast } from "@/lib/ai/normalize";
import { InvalidResponseError } from "@/lib/ai/provider";
import { FixResultSchema, LIMITS } from "@/lib/types";

/**
 * Phase 4 regression: the final Haiku benchmark (bench/results/2026-10-08T19-08-52-final-10) still
 * contained two FIX fields cut with an ellipsis, because normalizeFix sent `tagline` (limit 140) and
 * `changes[].after` (limit 280) through the cutting `cleanText`. The benchmark kept only the cut
 * strings; the full sentences below are the cut text completed in the obvious way, so each is longer
 * than the old limit it tripped over (asserted, so the reconstruction can't quietly become too short).
 */
const SECONDHAND_TAGLINE =
  "Tell us the three things you can't find in your wardrobe; we find the secondhand pieces that fit your size and budget and go with what you already own.";
const SUPER_APP_AFTER =
  "Connect a spreadsheet or one invoicing tool, send drafted reminders from the user's own email, and show a weekly outstanding list. Roughly 6 to 8 weeks for one engineer; regulated data handling is limited because it touches only invoice names and amounts, but still requires a data-processing agreement with each customer.";

const raw = (over: Record<string, unknown> = {}, change: Record<string, unknown> = {}) => ({
  title: "Better Idea",
  tagline: "A clear promise",
  pitch: "A pitch.",
  changes: [1, 2, 3].map((i) => ({ area: `Area ${i}`, before: "before", after: "after", why: "why", persona: "investor", ...change })),
  firstSteps: ["Step one.", "Step two.", "Step three."],
  projectedScores: { investor: 60, engineer: 60, marketer: 60, customer: 60 },
  ...over,
});

describe("the two truncations seen in the final Haiku benchmark", () => {
  it("fixture sanity: both really were over the old limits", () => {
    expect(SECONDHAND_TAGLINE.length).toBeGreaterThan(140);
    expect(SUPER_APP_AFTER.length).toBeGreaterThan(280);
  });

  it("keeps the secondhand-fashion tagline whole", () => {
    const fix = normalizeFix(raw({ tagline: SECONDHAND_TAGLINE }), "ai");
    expect(fix.tagline).toBe(SECONDHAND_TAGLINE);
    expect(fix.tagline).not.toContain("…");
    expect(FixResultSchema.safeParse(fix).success).toBe(true);
  });

  it("keeps the super-app recommendation whole, cost and caveat included", () => {
    const fix = normalizeFix(raw({}, { after: SUPER_APP_AFTER }), "ai");
    expect(fix.changes[0].after).toBe(SUPER_APP_AFTER);
    expect(fix.changes[0].after).toContain("6 to 8 weeks for one engineer");
    expect(fix.changes[0].after.endsWith("each customer.")).toBe(true);
    expect(FixResultSchema.safeParse(fix).success).toBe(true);
  });
});

describe("FIX fields are rejected, never cut", () => {
  const fields: [string, (v: string) => Record<string, unknown>, number][] = [
    ["tagline", (v) => raw({ tagline: v }), LIMITS.fixTagline],
    ["before", (v) => raw({}, { before: v }), LIMITS.fixBefore],
    ["after", (v) => raw({}, { after: v }), LIMITS.fixAfter],
    ["why", (v) => raw({}, { why: v }), LIMITS.fixWhy],
    ["pitch", (v) => raw({ pitch: v }), LIMITS.fixPitch],
    ["step", (v) => raw({ firstSteps: [v, "b.", "c."] }), LIMITS.fixStep],
  ];

  it.each(fields)("%s: exactly the limit is kept; one over is an invalid response", (_name, build, limit) => {
    const atLimit = "a".repeat(limit - 1) + ".";
    // The schema and the normaliser must agree: whatever the normaliser accepts, the response schema accepts.
    expect(FixResultSchema.safeParse(normalizeFix(build(atLimit), "ai")).success).toBe(true);
    expect(() => normalizeFix(build(atLimit + "x"), "ai")).toThrow(InvalidResponseError);
  });

  it("the UI-facing schema counts characters the way the normaliser does (emoji are one character)", () => {
    const emoji = "😀".repeat(LIMITS.fixTagline);
    const fix = normalizeFix(raw({ tagline: emoji }), "ai");
    expect(FixResultSchema.safeParse(fix).success).toBe(true);
  });
});

describe("roast text over its limit loses whole sentences, never words", () => {
  it("drops trailing sentences without an ellipsis", () => {
    const text = "The margin is thin. The churn is worse. And nobody has explained who delivers the plants on a rainy Tuesday.";
    const out = fitText(text, 45, "point");
    expect(out).toBe("The margin is thin. The churn is worse.");
    expect(out).not.toContain("…");
  });

  it("rejects when the first sentence alone is over the limit (nothing safe to keep)", () => {
    expect(() => fitText("word ".repeat(100).trim() + ".", 60, "point")).toThrow(InvalidResponseError);
  });

  it("leaves text under the limit untouched", () => {
    expect(fitText("  Short and sweet.  ", 100, "x")).toBe("Short and sweet.");
  });

  it("normalizeRoast never produces an ellipsis for an over-long field", () => {
    const base = demoRoast("A subscription box of houseplants for people who kill houseplants.");
    const long = "Sentence one is fine. " + "Sentence two keeps going and going and going. ".repeat(10);
    const roast = normalizeRoast({ ...base, biggestRisk: long, takes: base.takes.map((t) => ({ ...t, points: [long, ...t.points.slice(1)] })) }, "ai");
    const all = JSON.stringify(roast);
    expect(all).not.toContain("…");
    expect(roast.biggestRisk.startsWith("Sentence one is fine. ")).toBe(true);
    expect(roast.biggestRisk.endsWith("going.")).toBe(true); // ends on a sentence boundary, not mid-word
    expect(roast.biggestRisk.length).toBeLessThanOrEqual(LIMITS.risk);
  });
});

describe("an over-long FIX is retried once, and the model is told why", () => {
  const idea = "A subscription box of houseplants for people who kill houseplants, £15/month.";
  const roast = demoRoast(idea);
  const good = raw({ tagline: "Plants that forgive you" });
  const tooLong = raw({ tagline: "x".repeat(LIMITS.fixTagline + 1) });

  function client(responses: unknown[]) {
    const seen: LlmRequest[] = [];
    const c: LlmClient = {
      provider: "test",
      model: "test",
      async complete(req) {
        seen.push(req);
        return JSON.stringify(responses[seen.length - 1]);
      },
      async *stream() {},
    };
    return { c, seen };
  }

  it("retries with the rejection reason appended, then succeeds", async () => {
    const { c, seen } = client([tooLong, good]);
    const fix = await new ModelRoastProvider(c).fix(idea, roast);
    expect(fix.tagline).toBe("Plants that forgive you");
    expect(seen).toHaveLength(2);
    expect(seen[0].user).not.toContain("previous attempt");
    expect(seen[1].user).toContain("Your previous attempt was rejected");
    expect(seen[1].user).toContain("tagline was too long");
  });

  it("gives up after one retry", async () => {
    const { c, seen } = client([tooLong, tooLong, good]);
    await expect(new ModelRoastProvider(c).fix(idea, roast)).rejects.toBeInstanceOf(InvalidResponseError);
    expect(seen).toHaveLength(2);
  });
});
