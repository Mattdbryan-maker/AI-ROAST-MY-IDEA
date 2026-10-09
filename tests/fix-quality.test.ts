import { describe, expect, it, vi } from "vitest";
import { analyseRoast, arithmeticErrors, isUnterminated } from "../bench/heuristics";
import { demoRoast } from "@/lib/ai/demo/engine";
import type { LlmClient, LlmRequest } from "@/lib/ai/llm";
import { ModelRoastProvider } from "@/lib/ai/model-provider";
import { MAX_PROJECTED_GAIN, capProjectedScores, normalizeFix, wholeText } from "@/lib/ai/normalize";
import { FIX_SYSTEM_PROMPT, PROMPT_VERSION, ROAST_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { InvalidResponseError } from "@/lib/ai/provider";
import { FIX_PITCH_MAX, FIX_STEP_MAX, FixResultSchema } from "@/lib/types";

const idea = "A subscription box of houseplants for people who kill houseplants, £15/month.";
const roast = demoRoast(idea);

/** The shape of the real Haiku steps that were cut at 240 characters in the benchmark. */
const LONG_STEP =
  "Run the free draft past 12 best men on a real upcoming speech; pass if at least 8 say they would pay £29 for the polished version, and if fewer, test whether the rehearsal coach alone or the fact-check step is the draw before building anything else.";

const rawFix = (over: Record<string, unknown> = {}) => ({
  title: "Better Plants",
  tagline: "Plants that forgive you",
  pitch: "A pitch.",
  changes: [1, 2, 3].map((i) => ({ area: `Area ${i}`, before: "before", after: "after", why: "why", persona: "investor" })),
  firstSteps: ["Step one.", "Step two.", "Step three."],
  projectedScores: { investor: 60, engineer: 60, marketer: 60, customer: 60 },
  ...over,
});

describe("FIX text is never cut mid-sentence", () => {
  it("keeps a long step whole, threshold and conditional included (this was cut at 240 before)", () => {
    expect(LONG_STEP.length).toBeGreaterThan(240);
    const fix = normalizeFix(rawFix({ firstSteps: [LONG_STEP, "Step two.", "Step three."] }), "ai");
    expect(fix.firstSteps[0]).toBe(LONG_STEP);
    expect(fix.firstSteps[0]).toContain("pass if at least 8");
    expect(fix.firstSteps[0].endsWith("…")).toBe(false);
    expect(FixResultSchema.safeParse(fix).success).toBe(true);
  });

  it("accepts a step of exactly the limit and rejects one a character over, rather than truncating", () => {
    const at = "a".repeat(FIX_STEP_MAX - 1) + ".";
    expect(normalizeFix(rawFix({ firstSteps: [at, "b.", "c."] }), "ai").firstSteps[0]).toHaveLength(FIX_STEP_MAX);
    expect(() => normalizeFix(rawFix({ firstSteps: [at + "x", "b.", "c."] }), "ai")).toThrow(InvalidResponseError);
  });

  it("counts characters, not UTF-16 units (emoji, pound signs, curly quotes, accents)", () => {
    // An astral character is 2 UTF-16 units; the limit applies to what a reader sees.
    const emojiOnly = "😀".repeat(FIX_STEP_MAX);
    expect(emojiOnly.length).toBe(FIX_STEP_MAX * 2);
    expect(wholeText(emojiOnly, FIX_STEP_MAX, "step")).toBe(emojiOnly);
    expect(() => wholeText(emojiOnly + "😀", FIX_STEP_MAX, "step")).toThrow(InvalidResponseError);
    const mixed = "Ask 10 café owners in Zürich — “would you pay £29?” 😀 Pass if 4 say yes.";
    expect(wholeText(mixed, FIX_STEP_MAX, "step")).toBe(mixed);
  });

  it("keeps a full-length pitch and rejects an over-long one", () => {
    const pitch = "Sentence about the plan. ".repeat(40).trim();
    expect(pitch.length).toBeLessThanOrEqual(FIX_PITCH_MAX);
    expect(normalizeFix(rawFix({ pitch }), "ai").pitch).toBe(pitch);
    expect(() => normalizeFix(rawFix({ pitch: `${pitch} ${pitch}` }), "ai")).toThrow(InvalidResponseError);
  });

  it("still collapses whitespace and wrapping quotes, and de-duplicates steps", () => {
    const fix = normalizeFix(rawFix({ firstSteps: ['  "Call   ten owners."  ', "Call ten owners.", "Two.", "Three.", "Four."] }), "ai");
    expect(fix.firstSteps).toEqual(["Call ten owners.", "Two.", "Three."]);
  });

  it("treats malformed step lists as invalid responses", () => {
    expect(() => normalizeFix(rawFix({ firstSteps: "not a list" }), "ai")).toThrow(InvalidResponseError);
    expect(() => normalizeFix(rawFix({ firstSteps: ["only one"] }), "ai")).toThrow(InvalidResponseError);
    expect(() => normalizeFix(rawFix({ firstSteps: [1, null, {}] }), "ai")).toThrow(InvalidResponseError);
  });
});

describe("FIX retry policy", () => {
  const stub = (replies: string[]) => {
    const complete = vi.fn(async (req: LlmRequest) => {
      void req;
      const next = replies.shift();
      if (next === undefined) throw new Error("unexpected extra request");
      return next;
    });
    const client = { provider: "test", model: "m", complete, stream: () => (async function* () {})() } as unknown as LlmClient;
    return { client, complete };
  };

  it("retries once when a step is over-long, then returns the valid fix", async () => {
    const tooLong = JSON.stringify(rawFix({ firstSteps: ["x".repeat(FIX_STEP_MAX + 1), "b.", "c."] }));
    const good = JSON.stringify(rawFix({ firstSteps: [LONG_STEP, "b.", "c."] }));
    const { client, complete } = stub([tooLong, good]);
    const fix = await new ModelRoastProvider(client).fix(idea, roast);
    expect(complete).toHaveBeenCalledTimes(2);
    expect(fix.firstSteps[0]).toBe(LONG_STEP);
  });

  it("gives up with an invalid-response error after the one retry (no silent cut-off)", async () => {
    const tooLong = JSON.stringify(rawFix({ firstSteps: ["x".repeat(FIX_STEP_MAX + 1), "b.", "c."] }));
    const { client, complete } = stub([tooLong, tooLong]);
    await expect(new ModelRoastProvider(client).fix(idea, roast)).rejects.toMatchObject({ code: "invalid_response" });
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("retries once on malformed JSON, then fails rather than looping", async () => {
    const { client, complete } = stub(["not json at all", '{"title": ']);
    await expect(new ModelRoastProvider(client).fix(idea, roast)).rejects.toBeInstanceOf(InvalidResponseError);
    expect(complete).toHaveBeenCalledTimes(2);
  });
});

describe("conservative projected scores", () => {
  const before = Object.fromEntries(roast.takes.map((t) => [t.persona, t.score])) as Record<string, number>;
  const all100 = { investor: 100, engineer: 100, marketer: 100, customer: 100 };

  it("caps each persona's rise and recomputes the overall score", () => {
    const greedy = normalizeFix(rawFix({ projectedScores: all100 }), "ai");
    const capped = capProjectedScores(greedy, roast);
    for (const id of ["investor", "engineer", "marketer", "customer"] as const) {
      expect(capped.projectedScores[id]).toBeLessThanOrEqual(before[id] + MAX_PROJECTED_GAIN);
    }
    expect(capped.projectedOverall).toBeLessThan(greedy.projectedOverall);
  });

  it("leaves honest projections untouched", () => {
    const honest = normalizeFix(
      rawFix({ projectedScores: { investor: before.investor + 10, engineer: before.engineer + 5, marketer: before.marketer, customer: before.customer + 15 } }),
      "ai",
    );
    expect(capProjectedScores(honest, roast)).toEqual(honest);
  });

  it("is applied by the provider", async () => {
    const complete = vi.fn(async () => JSON.stringify(rawFix({ projectedScores: all100 })));
    const provider = new ModelRoastProvider({ provider: "t", model: "m", complete, stream: () => (async function* () {})() } as unknown as LlmClient);
    const fix = await provider.fix(idea, roast);
    expect(fix.projectedScores.investor).toBeLessThanOrEqual(before.investor + MAX_PROJECTED_GAIN);
  });
});

describe("benchmark heuristics catch what they used to miss", () => {
  it("flags truncated and unterminated FIX text (the old check only looked at the roast)", () => {
    const fix = normalizeFix(rawFix(), "ai");
    const clean = analyseRoast(idea, roast, fix);
    const cut = analyseRoast(idea, roast, { ...fix, firstSteps: ["Pre-sell to ten owners; pass if at least 8…", "Call five owners; if fewer than", fix.firstSteps[2]] });
    expect(cut.truncatedStrings).toBe(clean.truncatedStrings + 1);
    expect(cut.unterminatedStrings).toBe(clean.unterminatedStrings + 1);
  });

  it("detects wrong written-out arithmetic and accepts right arithmetic", () => {
    expect(arithmeticErrors("£79 × 12 = £948 a year")).toEqual([]);
    expect(arithmeticErrors("£79 x 12 = £850 a year")).toHaveLength(1);
    expect(arithmeticErrors("1,000 / 4 = 250 and 50k + 25k = 75k")).toEqual([]);
    expect(arithmeticErrors("10 + 5 = 20")).toHaveLength(1);
    expect(arithmeticErrors("no equations here, 3 of 4 said yes")).toEqual([]);
  });

  it("recognises unterminated text", () => {
    expect(isUnterminated("It ends properly.")).toBe(false);
    expect(isUnterminated('He said "no."')).toBe(false);
    expect(isUnterminated("if at least 8 describe waste as")).toBe(true);
  });

  it("counts a persona naming themselves", () => {
    const edited = { ...roast, debate: roast.debate.map((d, i) => (i === 0 ? { ...d, speaker: "investor" as const, line: "STERLING insists it is fine." } : d)) };
    const base = analyseRoast(idea, { ...roast, debate: roast.debate.map((d, i) => (i === 0 ? { ...d, speaker: "investor" as const, line: "It is fine." } : d)) });
    expect(analyseRoast(idea, edited).selfReferences).toBe(base.selfReferences + 1);
  });
});

describe("prompt contract", () => {
  it("keeps the speaker-id rule and the quality rules, under a new prompt version", () => {
    expect(ROAST_SYSTEM_PROMPT).toContain('must be exactly one of "investor", "engineer", "marketer" or "customer"');
    expect(ROAST_SYSTEM_PROMPT).toContain("Arithmetic must be exactly right");
    expect(ROAST_SYSTEM_PROMPT).toContain("Never refer to your own persona by name");
    expect(FIX_SYSTEM_PROMPT).toContain("never more than +20");
    expect(FIX_SYSTEM_PROMPT).toContain("Finish every step; never trail off");
    expect(FIX_SYSTEM_PROMPT).toContain("what each change costs");
    expect(PROMPT_VERSION).toBe("2026-10-09.1");
  });
});

describe("speaker labels written inside debate lines", () => {
  it("strips a leading label but keeps names used in the dialogue", async () => {
    const { normalizeDebate } = await import("@/lib/ai/normalize");
    const lines = normalizeDebate([
      { speaker: "investor", line: "STERLING: KERNEL, you keep saying engineering is trivial." },
      { speaker: "engineer", line: "**KERNEL** - Fine, STERLING, the real problem is finding customers." },
      { speaker: "marketer", line: "Hype: is what this needs, said nobody sensible." },
      { speaker: "customer", line: "WALLET's right, but I would not pay." },
    ]);
    expect(lines.map((l) => l.line)).toEqual([
      "KERNEL, you keep saying engineering is trivial.",
      "Fine, STERLING, the real problem is finding customers.",
      "Hype: is what this needs, said nobody sensible.",
      "WALLET's right, but I would not pay.",
    ]);
  });
});
