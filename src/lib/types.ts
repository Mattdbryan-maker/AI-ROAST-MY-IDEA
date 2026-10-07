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

const text = (max: number) => z.string().trim().min(1).max(max);

export const PersonaTakeSchema = z.object({
  persona: PersonaIdSchema,
  score: z.number().int().min(0).max(100),
  headline: text(180),
  points: z.array(text(320)).min(2).max(3),
  strength: text(240),
  weakness: text(240),
});
export type PersonaTake = z.infer<typeof PersonaTakeSchema>;

export const DebateLineSchema = z.object({
  speaker: PersonaIdSchema,
  line: text(240),
});
export type DebateLine = z.infer<typeof DebateLineSchema>;

export const RoastSchema = z.object({
  title: text(64),
  summary: text(240),
  takes: z.array(PersonaTakeSchema).length(4),
  debate: z.array(DebateLineSchema).min(3).max(6),
  strengths: z.array(text(240)).min(2).max(3),
  weaknesses: z.array(text(240)).min(2).max(3),
  biggestRisk: text(320),
  biggestOpportunity: text(320),
  closingLine: text(200),
  overall: z.number().int().min(0).max(100),
  verdict: VerdictSchema,
  mode: z.enum(["ai", "demo"]),
});
export type Roast = z.infer<typeof RoastSchema>;

export const FixChangeSchema = z.object({
  area: text(48),
  before: text(240),
  after: text(280),
  why: text(320),
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

export const FixResultSchema = z.object({
  title: text(64),
  tagline: text(140),
  pitch: text(1100),
  changes: z.array(FixChangeSchema).min(3).max(5),
  firstSteps: z.array(text(240)).min(3).max(3),
  projectedScores: PersonaScoresSchema,
  projectedOverall: z.number().int().min(0).max(100),
  projectedVerdict: VerdictSchema,
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
