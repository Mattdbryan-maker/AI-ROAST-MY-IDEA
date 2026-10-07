import type { PersonaId, PersonaScores, Verdict } from "./types";

/**
 * The overall score and verdict are computed deterministically from the four
 * persona scores rather than trusted from the model. This keeps the headline
 * number consistent with what the panel actually said.
 */

export const VERDICT_THRESHOLDS = {
  /** Anything at or above this is BUILD IT. */
  build: 72,
  /** Anything at or above this (and below build) is FIX IT. Below is KILL IT. */
  fix: 45,
} as const;

/** Persona weighting — the customer and the money matter slightly more. */
export const PERSONA_WEIGHTS: Record<PersonaId, number> = {
  investor: 0.28,
  engineer: 0.18,
  marketer: 0.22,
  customer: 0.32,
};

export function clampScore(value: unknown, fallback = 50): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function overallScore(scores: PersonaScores): number {
  let total = 0;
  for (const [id, weight] of Object.entries(PERSONA_WEIGHTS) as [PersonaId, number][]) {
    total += clampScore(scores[id]) * weight;
  }
  return clampScore(total);
}

export function verdictFor(score: number): Verdict {
  if (score >= VERDICT_THRESHOLDS.build) return "BUILD";
  if (score >= VERDICT_THRESHOLDS.fix) return "FIX";
  return "KILL";
}

export function scoresFromTakes(takes: { persona: PersonaId; score: number }[]): PersonaScores {
  const scores: PersonaScores = { investor: 50, engineer: 50, marketer: 50, customer: 50 };
  for (const take of takes) scores[take.persona] = clampScore(take.score);
  return scores;
}

export const VERDICT_COPY: Record<Verdict, { label: string; blurb: string; color: string; rgb: string }> = {
  KILL: {
    label: "KILL IT",
    blurb: "The panel recommends a dignified burial.",
    color: "#ff3b3b",
    rgb: "255 59 59",
  },
  FIX: {
    label: "FIX IT",
    blurb: "There's something here. It's just wearing the wrong clothes.",
    color: "#ffb020",
    rgb: "255 176 32",
  },
  BUILD: {
    label: "BUILD IT",
    blurb: "Against all odds, the panel wants to see this exist.",
    color: "#2bff88",
    rgb: "43 255 136",
  },
};

/** Colour for an arbitrary score — used by rings and counters while they animate. */
export function scoreColor(score: number): string {
  return VERDICT_COPY[verdictFor(score)].color;
}
