import { z } from "zod";

/**
 * Domain types shared by the server (AI layer) and the client (UI).
 *
 * Every payload that crosses a trust boundary — model output, request bodies,
 * share links — is validated against these schemas before it is used.
 */

export const PERSONA_IDS = ["investor", "engineer", "marketer", "customer"] as const;
export const PersonaIdSchema = z.enum(PERSONA_IDS);
export type PersonaId = z.infer<typeof PersonaIdSchema>;

export const VERDICTS = ["KILL", "FIX", "BUILD"] as const;
export const VerdictSchema = z.enum(VERDICTS);
export type Verdict = z.infer<typeof VerdictSchema>;

export const IDEA_MIN_LENGTH = 12;
export const IDEA_MAX_LENGTH = 1200;

export const IdeaSchema = z
  .string()
  .trim()
  .min(IDEA_MIN_LENGTH, `Give the panel a bit more to work with (at least ${IDEA_MIN_LENGTH} characters).`)
  .max(IDEA_MAX_LENGTH, `Keep the pitch under ${IDEA_MAX_LENGTH} characters — investors stop reading anyway.`);

/** Length is counted in characters (code points), the same way the normaliser counts, so an emoji is one. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((s) => [...s].length <= max, `Must be at most ${max} characters`);

/**
 * The one place text limits live. The schemas below, the normaliser, the live
 * stream and the prompts' length guidance all read from here, so they cannot
 * drift apart. Each limit sits well above what the prompts ask the model for
 * (see ai/prompts.ts), because the normaliser never cuts text to fit: an
 * over-limit string is rejected (and the request retried) or, in the roast,
 * loses whole trailing sentences. See ai/normalize.ts.
 */
export const LIMITS = {
  title: 64,
  summary: 240,
  headline: 180,
  point: 320,
  strength: 240,
  weakness: 240,
  debateLine: 240,
  listItem: 240,
  risk: 320,
  opportunity: 320,
  closingLine: 200,
  fixArea: 48,
  fixTagline: 200,
  fixBefore: 320,
  fixAfter: 480,
  fixWhy: 420,
  fixScoreNote: 320,
  /** A step ends with its pass/fail threshold, so it is never cut. */
  fixStep: 420,
  /** The close of the pitch carries its qualifications, so it is never cut. */
  fixPitch: 1400,
} as const;

export const PersonaTakeSchema = z.object({
  persona: PersonaIdSchema,
  score: z.number().int().min(0).max(100),
  headline: text(LIMITS.headline),
  points: z.array(text(LIMITS.point)).min(2).max(3),
  strength: text(LIMITS.strength),
  weakness: text(LIMITS.weakness),
});
export type PersonaTake = z.infer<typeof PersonaTakeSchema>;

export const DebateLineSchema = z.object({
  speaker: PersonaIdSchema,
  line: text(LIMITS.debateLine),
});
export type DebateLine = z.infer<typeof DebateLineSchema>;

export const RoastSchema = z.object({
  title: text(LIMITS.title),
  summary: text(LIMITS.summary),
  takes: z.array(PersonaTakeSchema).length(4),
  debate: z.array(DebateLineSchema).min(3).max(6),
  strengths: z.array(text(LIMITS.listItem)).min(2).max(3),
  weaknesses: z.array(text(LIMITS.listItem)).min(2).max(3),
  biggestRisk: text(LIMITS.risk),
  biggestOpportunity: text(LIMITS.opportunity),
  closingLine: text(LIMITS.closingLine),
  overall: z.number().int().min(0).max(100),
  verdict: VerdictSchema,
  mode: z.enum(["ai", "demo"]),
});
export type Roast = z.infer<typeof RoastSchema>;

export const FixChangeSchema = z.object({
  area: text(LIMITS.fixArea),
  before: text(LIMITS.fixBefore),
  after: text(LIMITS.fixAfter),
  why: text(LIMITS.fixWhy),
  persona: PersonaIdSchema,
});
export type FixChange = z.infer<typeof FixChangeSchema>;

export const PersonaScoresSchema = z.object({
  investor: z.number().int().min(0).max(100),
  engineer: z.number().int().min(0).max(100),
  marketer: z.number().int().min(0).max(100),
  customer: z.number().int().min(0).max(100),
});
export type PersonaScores = z.infer<typeof PersonaScoresSchema>;

export const FIX_STEP_MAX = LIMITS.fixStep;
export const FIX_PITCH_MAX = LIMITS.fixPitch;

export const FixResultSchema = z.object({
  title: text(LIMITS.title),
  tagline: text(LIMITS.fixTagline),
  pitch: text(FIX_PITCH_MAX),
  changes: z.array(FixChangeSchema).min(3).max(5),
  firstSteps: z.array(text(FIX_STEP_MAX)).min(3).max(3),
  projectedScores: PersonaScoresSchema,
  projectedOverall: z.number().int().min(0).max(100),
  projectedVerdict: VerdictSchema,
  /** Why the overall moves as projected, and the trade-off for any critic who falls. Optional so older results still validate. */
  scoreNote: text(LIMITS.fixScoreNote).optional(),
  mode: z.enum(["ai", "demo"]),
});
export type FixResult = z.infer<typeof FixResultSchema>;

export const RoastRequestSchema = z.object({ idea: IdeaSchema });
export const FixRequestSchema = z.object({ idea: IdeaSchema, roast: RoastSchema });

export type ApiErrorCode =
  | "invalid_input"
  | "rate_limited"
  | "provider_error"
  | "invalid_response"
  | "refused"
  | "internal";

export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}
