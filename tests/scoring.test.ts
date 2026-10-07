import { describe, expect, it } from "vitest";
import { PERSONA_WEIGHTS, clampScore, overallScore, verdictFor } from "@/lib/scoring";

describe("scoring", () => {
  it("weights sum to 1", () => {
    expect(Object.values(PERSONA_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("maps scores to verdicts at the thresholds", () => {
    expect(verdictFor(0)).toBe("KILL");
    expect(verdictFor(44)).toBe("KILL");
    expect(verdictFor(45)).toBe("FIX");
    expect(verdictFor(71)).toBe("FIX");
    expect(verdictFor(72)).toBe("BUILD");
    expect(verdictFor(100)).toBe("BUILD");
  });

  it("averages uniform scores to themselves", () => {
    expect(overallScore({ investor: 60, engineer: 60, marketer: 60, customer: 60 })).toBe(60);
  });

  it("clamps junk", () => {
    expect(clampScore("87.6")).toBe(88);
    expect(clampScore(-3)).toBe(0);
    expect(clampScore(1e9)).toBe(100);
    expect(clampScore("nope", 42)).toBe(42);
  });
});
