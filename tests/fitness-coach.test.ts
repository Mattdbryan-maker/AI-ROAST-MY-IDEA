import { describe, expect, it, vi } from "vitest";
import { arithmeticErrors, biographyClaims, marketStatClaims } from "@/lib/ai/checks";
import type { LlmClient, LlmRequest } from "@/lib/ai/llm";
import { ModelRoastProvider } from "@/lib/ai/model-provider";
import { normalizeFix } from "@/lib/ai/normalize";
import { FIX_SYSTEM_PROMPT, PROMPT_VERSION, ROAST_SYSTEM_PROMPT, buildFixUserMessage } from "@/lib/ai/prompts";
import { InvalidResponseError } from "@/lib/ai/provider";
import { overallScore, verdictFor } from "@/lib/scoring";
import type { Roast } from "@/lib/types";
import { demoRoast } from "@/lib/ai/demo/engine";

/**
 * Phase 5 regression: the AI fitness coach.
 *
 * A recorded browser run produced a 39/100 KILL with these reasoning errors. The original transcript is
 * not stored, so the failure strings below are RECONSTRUCTED from the owner's description of it, not
 * quoted model output. What this file can honestly test is (1) the deterministic checks that exist, (2) the
 * wiring (a rejected response is retried with its reason), and (3) that the prompts carry the rules.
 * Whether a live model actually obeys them is only established by reading real output: see
 * docs/editorial-review-fitness-coach.md.
 */
const IDEA =
  "I'm building an AI fitness coach that creates personalised gym programmes and automatically adjusts them using workout performance. It will cost £9.99 per month and target people who want to build muscle without paying for a personal trainer.";

describe("the fitness coach failures: what the prompts now instruct", () => {
  const both = `${ROAST_SYSTEM_PROMPT}\n${FIX_SYSTEM_PROMPT}`;

  it("A. no invented competitor prices and no category-error price comparison", () => {
    expect(ROAST_SYSTEM_PROMPT).toContain("Never state a price, range or rate for a competitor or substitute");
    expect(ROAST_SYSTEM_PROMPT).toContain("Compare like with like");
    expect(ROAST_SYSTEM_PROMPT).toContain("category error");
    expect(ROAST_SYSTEM_PROMPT).toContain("never states what a competitor or substitute costs"); // the investor's own "never"
  });

  it("B. retention, churn, conversion, revenue and profit are kept apart, with assumptions labelled", () => {
    for (const term of ["retention", "churn", "conversion", "revenue", "profit"]) expect(ROAST_SYSTEM_PROMPT).toContain(term);
    expect(ROAST_SYSTEM_PROMPT).toContain("Lifetime value is price × months retained");
    expect(ROAST_SYSTEM_PROMPT).toContain("retention is always an assumption");
    expect(ROAST_SYSTEM_PROMPT).toContain("Never invent acquisition costs, churn benchmarks or market averages");
  });

  it("C. critics judge what is written; missing details become questions; the simplest workable version is assumed", () => {
    expect(ROAST_SYSTEM_PROMPT).toContain("Criticise only what is written");
    expect(ROAST_SYSTEM_PROMPT).toContain("ask it as a question");
    expect(ROAST_SYSTEM_PROMPT).toContain("manual logging");
    expect(ROAST_SYSTEM_PROMPT).toContain("Never invents requirements the pitch didn't ask for (wearables, integrations");
  });

  it("D. each FIX change answers a named objection, changes little, and never presents the original as new", () => {
    expect(FIX_SYSTEM_PROMPT).toContain("answer one specific objection from the roast");
    expect(FIX_SYSTEM_PROMPT).toContain("Change as little as needed");
    expect(FIX_SYSTEM_PROMPT).toContain("Never present something the original pitch already did as a new change");
    expect(FIX_SYSTEM_PROMPT).toContain("never \"fix\" a flaw the critics only assumed");
    expect(FIX_SYSTEM_PROMPT).toContain("scoreNote");
  });

  it("the FIX message hands the model the roast's strengths so it keeps what already works", () => {
    const roast = demoRoast(IDEA);
    const message = buildFixUserMessage(IDEA, roast);
    expect(message).toContain("Strengths to keep:");
    expect(message).toContain(roast.strengths[0]);
  });

  it("BUILD IT is explicitly reachable, and the personalities are kept", () => {
    expect(ROAST_SYSTEM_PROMPT).toContain("deserves 65-85 and BUILD IT");
    expect(ROAST_SYSTEM_PROMPT).toContain("headlines under ~110 characters");
    for (const phrase of ["his cruelty is arithmetic", "dry technical jokes", "not every business needs to go viral", "challenges anything that sounds good but has no personal value"]) {
      expect(ROAST_SYSTEM_PROMPT).toContain(phrase);
    }
    void both;
  });

  it("the prompt version moved, so benchmark reports can tell which wording they measured", () => {
    expect(PROMPT_VERSION).toBe("2026-10-09.1");
  });
});

describe("the fitness coach failures: what the deterministic checks can catch", () => {
  it("B. the reconstructed lifetime-value sums are wrong, and are flagged", () => {
    // £9.99 × 3 months = £29.97, not £28; and 40% of that is £11.99, not £28.
    expect(arithmeticErrors("Over three months that is £9.99 × 3 = £28 of lifetime value.")).toHaveLength(1);
    expect(arithmeticErrors("With 40% retention, £9.99 × 3 × 0.4 = £28 a customer.")).toHaveLength(1);
  });

  it("B. a correct, labelled version is not flagged", () => {
    expect(arithmeticErrors("Assume everyone stays three months: £9.99 × 3 = £29.97 of revenue, not profit.")).toEqual([]);
    expect(arithmeticErrors("£9.99 × 12 = £119.88 a year")).toEqual([]);
  });

  it("B. an invented market statistic about gym habits is flagged, a labelled assumption is not", () => {
    expect(marketStatClaims("Studies show 70% of people quit a gym app within a month.", IDEA)).toHaveLength(1);
    expect(marketStatClaims("Say 40% are still paying after month three; that is an assumption to test.", IDEA)).toEqual([]);
  });

  it("the user's own figures are never treated as invented", () => {
    expect(marketStatClaims("At £9.99 per month the plan costs £119.88 a year.", IDEA)).toEqual([]);
  });

  it("the pitch's own first person is not a founder biography, and an invented one is", () => {
    expect(biographyClaims("I'm building an AI coach that adjusts each programme from logged workouts.", IDEA)).toEqual([]);
    expect(biographyClaims("I spent ten years as a personal trainer and saw this every day.", IDEA)).toHaveLength(1);
  });
});

describe("the fitness coach failures: score consistency", () => {
  const rawFix = (extra: Record<string, unknown> = {}) => ({
    title: "Progress Coach",
    tagline: "A coach that notices when your lifts stall.",
    pitch:
      "I'm building a gym programme app for people who train alone and stall. You log each session in under a minute, and the app changes next week's weights and sets from what you actually lifted. The first month is free, then £9.99 a month. I start with one gym community and ask thirty lifters to follow the plan for six weeks, counting how many still log week six.",
    changes: [1, 2, 3].map((i) => ({ area: `Area ${i}`, before: "Before.", after: "After, at a cost of about two weeks of work.", why: "Answers the retention objection.", persona: "investor" })),
    firstSteps: ["Recruit 30 lifters; pass if 12 log week six, otherwise stop.", "Time the logging; pass if under a minute.", "Ask 10 testers; pass if 4 say they would pay."],
    projectedScores: { investor: 55, engineer: 60, marketer: 58, customer: 62 },
    ...extra,
  });

  it("overall and verdict are always recomputed from the four persona scores, never trusted from the model", () => {
    const fix = normalizeFix({ ...rawFix(), projectedOverall: 99, projectedVerdict: "BUILD" }, "ai");
    expect(fix.projectedOverall).toBe(overallScore(fix.projectedScores));
    expect(fix.projectedVerdict).toBe(verdictFor(fix.projectedOverall));
    expect(fix.projectedVerdict).not.toBe("BUILD");
  });

  it("a genuinely good idea can reach BUILD IT", () => {
    expect(verdictFor(overallScore({ investor: 74, engineer: 70, marketer: 78, customer: 76 }))).toBe("BUILD");
  });

  it("a score note is kept whole and carried through", () => {
    const fix = normalizeFix(rawFix({ scoreNote: "Investor moves most because the sum now rests on a stated retention assumption." }), "ai");
    expect(fix.scoreNote).toContain("stated retention assumption");
  });

  it("an over-long score note is rejected, not cut", () => {
    expect(() => normalizeFix(rawFix({ scoreNote: "x".repeat(400) }), "ai")).toThrow(InvalidResponseError);
  });

  it("a fall with no explanation is retried, and the retry note says exactly why", async () => {
    const roast = demoRoast(IDEA);
    const falling = rawFix({ projectedScores: { investor: 1, engineer: 90, marketer: 90, customer: 90 } });
    const explained = rawFix({ projectedScores: { investor: 1, engineer: 90, marketer: 90, customer: 90 }, scoreNote: "The investor falls: the free first month delays all revenue." });
    const seen: LlmRequest[] = [];
    const responses = [falling, explained];
    const client: LlmClient = {
      provider: "test",
      model: "test",
      async complete(req) {
        seen.push(req);
        return JSON.stringify(responses[seen.length - 1]);
      },
      async *stream() {},
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fix = await new ModelRoastProvider(client).fix(IDEA, roast as Roast);
    expect(seen).toHaveLength(2);
    expect(seen[1].user).toContain("scoreNote does not explain the trade-off");
    expect(fix.scoreNote).toContain("free first month");
  });
});
