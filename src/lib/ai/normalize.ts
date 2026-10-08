import { LIMITS, PERSONA_IDS, type DebateLine, type FixChange, type FixResult, type PersonaId, type PersonaTake, type Roast } from "../types";
import { clampScore, overallScore, scoresFromTakes, verdictFor } from "../scoring";
import { arithmeticErrors, biographyClaims, marketStatClaims, splitSentences, stripBiography } from "./checks";
import { InvalidResponseError } from "./provider";

/**
 * Model output is never trusted as-is. These functions turn "probably the
 * right shape" JSON into a guaranteed-valid Roast / FixResult, repairing what
 * is safely repairable (clamping, trimming, de-duplicating, reordering) and
 * throwing InvalidResponseError for anything that would break the UI.
 */

type Loose = Record<string, unknown>;

const isObj = (v: unknown): v is Loose => typeof v === "object" && v !== null && !Array.isArray(v);

/** Collapse whitespace, strip wrapping quotes/markdown and cap length on a word boundary. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  let s = value.replace(/\s+/g, " ").trim();
  s = s.replace(/^\*\*|\*\*$/g, "").trim();
  // Strip quotes only when they wrap the whole string, so 'quoted phrases' at the start survive.
  const wrapped = s.match(/^["“](.*)["”]$/);
  if (wrapped) s = wrapped[1].trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–-]+$/, "")}…`;
}

const length = (s: string) => [...s].length;

/**
 * Roast text over its limit. Trailing whole sentences are dropped until it fits
 * (never a word-level cut, never an ellipsis), because the roast is already on
 * screen by the time it is normalised and a restart would ruin the show. If the
 * first sentence alone is over the limit there is nothing safe to keep: the
 * response is rejected so the existing retry runs.
 */
export function fitText(value: unknown, max: number, what: string): string {
  const s = cleanText(value, Number.MAX_SAFE_INTEGER);
  if (length(s) <= max) return s;
  let kept = "";
  for (const sentence of splitSentences(s)) {
    const next = kept ? `${kept} ${sentence}` : sentence;
    if (length(next) > max) break;
    kept = next;
  }
  if (!kept) throw new InvalidResponseError(`Model response ${what} was too long (${length(s)} > ${max} characters)`);
  return kept;
}

/**
 * Like cleanText, but never cuts. Text whose end carries the meaning (a step's
 * pass/fail threshold, the close of a pitch) is rejected as an invalid response
 * when it is over the limit, so the existing retry runs instead of the user
 * seeing advice that stops mid-sentence.
 */
export function wholeText(value: unknown, max: number, what: string): string {
  const s = cleanText(value, Number.MAX_SAFE_INTEGER);
  if (length(s) > max) throw new InvalidResponseError(`Model response ${what} was too long (${length(s)} > ${max} characters)`);
  return s;
}

function textList(value: unknown, max: number, limit: number, what: string): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const t = fitText(item, max, what);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length === limit) break;
  }
  return out;
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((t) => {
    const key = t.toLowerCase();
    if (!t || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function personaId(value: unknown): PersonaId | null {
  if (typeof value !== "string") return null;
  const v = value.toLowerCase().trim();
  if ((PERSONA_IDS as readonly string[]).includes(v)) return v as PersonaId;
  // Tolerate the model using character names or roles instead of ids.
  const aliases: Record<string, PersonaId> = {
    sterling: "investor",
    "the investor": "investor",
    kernel: "engineer",
    "the engineer": "engineer",
    hype: "marketer",
    "the marketer": "marketer",
    wallet: "customer",
    "the customer": "customer",
  };
  return aliases[v] ?? null;
}

function require<T>(value: T | null | undefined | "", what: string): T {
  if (value === null || value === undefined || value === "") {
    throw new InvalidResponseError(`Model response missing ${what}`);
  }
  return value;
}

/** Extract a JSON object from text that may be wrapped in prose or code fences. */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) throw new InvalidResponseError("Model response contained no JSON object");
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      throw new InvalidResponseError("Model response JSON could not be parsed");
    }
  }
}

/** One persona's take, or null if it can't be shown safely. */
export function normalizeTake(t: unknown): PersonaTake | null {
  if (!isObj(t)) return null;
  const id = personaId(t.persona);
  const points = textList(t.points, LIMITS.point, 3, "point");
  const headline = fitText(t.headline, LIMITS.headline, "headline");
  const strength = fitText(t.strength, LIMITS.strength, "strength");
  const weakness = fitText(t.weakness, LIMITS.weakness, "weakness");
  if (!id || !headline || points.length < 2 || !strength || !weakness) return null;
  return { persona: id, score: clampScore(t.score), headline, points, strength, weakness };
}

/** A leading uppercase "STERLING:" / "**HYPE** -" label the model wrote inside the dialogue. The speaker field already says who is talking. */
const SPEAKER_LABEL = /^\s*(?:\*\*)?(?:STERLING|KERNEL|HYPE|WALLET)(?:\*\*)?\s*[:\-–—]\s+/;

export function normalizeDebate(value: unknown): DebateLine[] {
  return (Array.isArray(value) ? value : [])
    .filter(isObj)
    .map((d) => ({ speaker: personaId(d.speaker), line: fitText(typeof d.line === "string" ? d.line.replace(SPEAKER_LABEL, "") : d.line, LIMITS.debateLine, "debate line") }))
    .filter((d): d is DebateLine => d.speaker !== null && d.line.length > 0)
    .slice(0, 6);
}

export function normalizeRoast(raw: unknown, mode: Roast["mode"]): Roast {
  if (!isObj(raw)) throw new InvalidResponseError("Model response was not an object");

  const takesRaw = Array.isArray(raw.takes) ? raw.takes : [];
  const byPersona = new Map<PersonaId, PersonaTake>();
  for (const t of takesRaw) {
    const take = normalizeTake(t);
    if (take && !byPersona.has(take.persona)) byPersona.set(take.persona, take);
  }
  const takes = PERSONA_IDS.map((id) => require(byPersona.get(id), `a take from the ${id}`));

  const debate = normalizeDebate(raw.debate);
  if (debate.length < 3) throw new InvalidResponseError("Model response debate too short");

  const strengths = textList(raw.strengths, LIMITS.listItem, 3, "strength");
  const weaknesses = textList(raw.weaknesses, LIMITS.listItem, 3, "weakness");
  if (strengths.length < 2 || weaknesses.length < 2) {
    throw new InvalidResponseError("Model response needs at least two strengths and weaknesses");
  }

  const overall = overallScore(scoresFromTakes(takes));

  return {
    title: require(fitText(raw.title, LIMITS.title, "title"), "title"),
    summary: require(fitText(raw.summary, LIMITS.summary, "summary"), "summary"),
    takes,
    debate,
    strengths,
    weaknesses,
    biggestRisk: require(fitText(raw.biggestRisk, LIMITS.risk, "biggestRisk"), "biggestRisk"),
    biggestOpportunity: require(fitText(raw.biggestOpportunity, LIMITS.opportunity, "biggestOpportunity"), "biggestOpportunity"),
    closingLine: require(fitText(raw.closingLine, LIMITS.closingLine, "closingLine"), "closingLine"),
    overall,
    verdict: verdictFor(overall),
    mode,
  };
}

export interface FixContext {
  /** The user's original pitch. Enables the checks that compare the FIX against it (founder facts, quoted figures). */
  idea: string;
}

/** What is wrong with a FIX that is well-formed but not safe to show. Each message doubles as the retry note to the model. */
function groundingProblems(fix: FixResult, idea: string): string[] {
  const problems: string[] = [];
  const everything = [fix.tagline, fix.pitch, ...fix.firstSteps, ...fix.changes.flatMap((c) => [c.before, c.after, c.why])];

  const bio = everything.flatMap((t) => biographyClaims(t, idea));
  if (bio.length) {
    problems.push(
      `it invents facts about the founder ("${bio[0].slice(0, 90)}"): never give the founder a name, career, years of experience or personal story the original pitch did not state`,
    );
  }

  const stats = everything.flatMap((t) => marketStatClaims(t, idea));
  if (stats.length) {
    problems.push(`it states an unverified statistic or study as fact ("${stats[0].slice(0, 90)}"): remove it or frame it as an assumption to test`);
  }

  const bad = arithmeticErrors(everything.join(" | "));
  if (bad.length) problems.push(`the arithmetic is wrong ("${bad[0]}"): recompute it or make the point in words`);
  return problems;
}

/** A pitch with an invented backstory removed must still be a pitch. */
const MIN_PITCH_AFTER_STRIP = 200;

export function normalizeFix(raw: unknown, mode: FixResult["mode"], context?: FixContext): FixResult {
  if (!isObj(raw)) throw new InvalidResponseError("Model response was not an object");

  // FIX text is business advice: a qualification, a cost or a pass/fail threshold at the end of a
  // field is the part that matters, so an over-long field is rejected (and retried), never cut.
  const changes: FixChange[] = (Array.isArray(raw.changes) ? raw.changes : [])
    .filter(isObj)
    .map((c) => ({
      area: wholeText(c.area, LIMITS.fixArea, "change area"),
      before: wholeText(c.before, LIMITS.fixBefore, "change 'before'"),
      after: wholeText(c.after, LIMITS.fixAfter, "change 'after'"),
      why: wholeText(c.why, LIMITS.fixWhy, "change 'why'"),
      persona: personaId(c.persona) ?? "customer",
    }))
    .filter((c) => c.area && c.before && c.after && c.why)
    .slice(0, 5);
  if (changes.length < 3) throw new InvalidResponseError("Fix response needs at least three changes");

  const firstSteps = dedupe((Array.isArray(raw.firstSteps) ? raw.firstSteps : []).map((step) => wholeText(step, LIMITS.fixStep, "first step"))).slice(0, 3);
  if (firstSteps.length < 3) throw new InvalidResponseError("Fix response needs three first steps");

  const ps = isObj(raw.projectedScores) ? raw.projectedScores : {};
  const projectedScores = {
    investor: clampScore(ps.investor),
    engineer: clampScore(ps.engineer),
    marketer: clampScore(ps.marketer),
    customer: clampScore(ps.customer),
  };
  const projectedOverall = overallScore(projectedScores);

  let pitch = require(wholeText(raw.pitch, LIMITS.fixPitch, "pitch"), "pitch");
  if (context) {
    // The pitch is the founder's own voice, so an invented backstory is cut out sentence by sentence
    // rather than costing a retry; if that leaves too little, the response is rejected.
    const stripped = stripBiography(pitch, context.idea);
    if (stripped.removed.length) {
      // A sentence that also states a price or a figure is business content: deleting it silently would lose it.
      if (stripped.removed.some((sentence) => /[£$€]\s?\d|\d\s?%/.test(sentence))) {
        throw new InvalidResponseError(`Fix pitch mixed an invented founder biography with business figures ("${stripped.removed[0].slice(0, 90)}"): never give the founder a name, career, years of experience or personal story the original pitch did not state`);
      }
      console.warn(`[ai] removed ${stripped.removed.length} invented founder-biography sentence(s) from the FIX pitch`);
      if (length(stripped.text) < MIN_PITCH_AFTER_STRIP) throw new InvalidResponseError("Fix pitch was mostly an invented founder biography");
      pitch = stripped.text;
    }
  }

  const fix: FixResult = {
    title: require(fitText(raw.title, LIMITS.title, "title"), "title"),
    tagline: require(wholeText(raw.tagline, LIMITS.fixTagline, "tagline"), "tagline"),
    pitch,
    changes,
    firstSteps,
    projectedScores,
    projectedOverall,
    projectedVerdict: verdictFor(projectedOverall),
    mode,
  };

  if (context) {
    const problems = groundingProblems(fix, context.idea);
    if (problems.length) throw new InvalidResponseError(`Fix response is not grounded: ${problems.join("; ")}`);
  }
  return fix;
}

/** The most any persona's projected score may rise over their roast score. */
export const MAX_PROJECTED_GAIN = 20;

/** No projected score, however good the fix, is allowed above this: some objections always remain. */
export const MAX_PROJECTED_SCORE = 85;

const ceiling = (projected: number, before: number) => Math.min(projected, before + MAX_PROJECTED_GAIN, Math.max(MAX_PROJECTED_SCORE, before));

/**
 * Keeps "after" scores believable: a fix can't lift one critic by more than
 * MAX_PROJECTED_GAIN points, or past MAX_PROJECTED_SCORE. Models routinely
 * promise 25-50 point jumps. Overall score and verdict are recomputed from the
 * capped scores.
 */
export function capProjectedScores(fix: FixResult, roast: Pick<Roast, "takes">): FixResult {
  const before = scoresFromTakes(roast.takes);
  const projectedScores = {
    investor: ceiling(fix.projectedScores.investor, before.investor),
    engineer: ceiling(fix.projectedScores.engineer, before.engineer),
    marketer: ceiling(fix.projectedScores.marketer, before.marketer),
    customer: ceiling(fix.projectedScores.customer, before.customer),
  };
  const projectedOverall = overallScore(projectedScores);
  return { ...fix, projectedScores, projectedOverall, projectedVerdict: verdictFor(projectedOverall) };
}
