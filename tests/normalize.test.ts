import { describe, expect, it } from "vitest";
import { cleanText, extractJson, normalizeFix, normalizeRoast } from "@/lib/ai/normalize";
import { InvalidResponseError } from "@/lib/ai/provider";
import { RoastSchema } from "@/lib/types";

const take = (persona: string, score: unknown = 50) => ({
  persona,
  score,
  headline: `${persona} headline`,
  points: ["one", "two", "three", "four"],
  strength: "good",
  weakness: "bad",
});

const rawRoast = () => ({
  title: "Test Idea",
  summary: "A test.",
  takes: [take("customer", 80), take("investor", "70"), take("ENGINEER", 140), take("marketer", -5)],
  debate: [
    { speaker: "investor", line: "a" },
    { speaker: "kernel", line: "b" },
    { speaker: "nobody", line: "dropped" },
    { speaker: "customer", line: "c" },
  ],
  strengths: ["s1", "s2", "s2", "s3", "s4"],
  weaknesses: ["w1", "w2"],
  biggestRisk: "risk",
  biggestOpportunity: "opp",
  closingLine: "bye",
  overall: 99, // must be ignored
  verdict: "BUILD", // must be ignored
});

describe("normalizeRoast", () => {
  it("repairs safely repairable output into a valid roast", () => {
    const roast = normalizeRoast(rawRoast(), "ai");
    expect(() => RoastSchema.parse(roast)).not.toThrow();
    expect(roast.takes.map((t) => t.persona)).toEqual(["investor", "engineer", "marketer", "customer"]);
    expect(roast.takes.map((t) => t.score)).toEqual([70, 100, 0, 80]);
    expect(roast.takes[0].points).toHaveLength(3);
    expect(roast.debate.map((d) => d.speaker)).toEqual(["investor", "engineer", "customer"]);
    expect(roast.strengths).toEqual(["s1", "s2", "s3"]);
  });

  it("computes overall and verdict itself instead of trusting the model", () => {
    const roast = normalizeRoast(rawRoast(), "ai");
    expect(roast.overall).not.toBe(99);
    expect(roast.overall).toBe(Math.round(70 * 0.28 + 100 * 0.18 + 0 * 0.22 + 80 * 0.32));
    expect(roast.verdict).toBe("FIX");
  });

  it("rejects output missing a persona", () => {
    const raw = rawRoast();
    raw.takes = raw.takes.slice(0, 3);
    expect(() => normalizeRoast(raw, "ai")).toThrow(InvalidResponseError);
  });

  it.each([null, "text", [], {}])("rejects non-roast input %#", (raw) => {
    expect(() => normalizeRoast(raw, "ai")).toThrow(InvalidResponseError);
  });
});

describe("normalizeFix", () => {
  const rawFix = {
    title: "Better",
    tagline: "Sharper",
    pitch: "A pitch.",
    changes: [1, 2, 3].map((i) => ({ area: `A${i}`, before: "b", after: "a", why: "w", persona: i === 1 ? "sterling" : "??" })),
    firstSteps: ["1", "2", "3", "4"],
    projectedScores: { investor: 90, engineer: 80, marketer: "70", customer: 300 },
  };

  it("normalises a fix and recomputes the projection", () => {
    const fix = normalizeFix(rawFix, "ai");
    expect(fix.changes[0].persona).toBe("investor");
    expect(fix.changes[1].persona).toBe("customer");
    expect(fix.projectedScores.customer).toBe(100);
    expect(fix.firstSteps).toHaveLength(3);
    expect(fix.projectedVerdict).toBe("BUILD");
  });

  it("rejects a fix with too few changes", () => {
    expect(() => normalizeFix({ ...rawFix, changes: rawFix.changes.slice(0, 2) }, "ai")).toThrow(InvalidResponseError);
  });
});

describe("text helpers", () => {
  it("caps length on a word boundary", () => {
    const out = cleanText("the quick brown fox jumps over the lazy dog", 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith("…")).toBe(true);
  });

  it("only strips quotes that wrap the whole string", () => {
    expect(cleanText('"wrapped"', 50)).toBe("wrapped");
    expect(cleanText("'Uber for X' is old", 50)).toBe("'Uber for X' is old");
  });

  it("extracts JSON wrapped in prose or code fences", () => {
    expect(extractJson('Sure!\n```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson("no json here")).toThrow(InvalidResponseError);
  });
});
