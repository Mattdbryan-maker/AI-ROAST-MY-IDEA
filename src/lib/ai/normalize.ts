import { PERSONA_IDS, type DebateLine, type FixChange, type FixResult, type PersonaId, type PersonaTake, type Roast } from "../types";
import { clampScore, overallScore, scoresFromTakes, verdictFor } from "../scoring";
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

function textList(value: unknown, max: number, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const t = cleanText(item, max);
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length === limit) break;
  }
  return out;
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
  const points = textList(t.points, 320, 3);
  const headline = cleanText(t.headline, 180);
  const strength = cleanText(t.strength, 240);
  const weakness = cleanText(t.weakness, 240);
  if (!id || !headline || points.length < 2 || !strength || !weakness) return null;
  return { persona: id, score: clampScore(t.score), headline, points, strength, weakness };
}

export function normalizeDebate(value: unknown): DebateLine[] {
  return (Array.isArray(value) ? value : [])
    .filter(isObj)
    .map((d) => ({ speaker: personaId(d.speaker), line: cleanText(d.line, 240) }))
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

  const strengths = textList(raw.strengths, 240, 3);
  const weaknesses = textList(raw.weaknesses, 240, 3);
  if (strengths.length < 2 || weaknesses.length < 2) {
    throw new InvalidResponseError("Model response needs at least two strengths and weaknesses");
  }

  const overall = overallScore(scoresFromTakes(takes));

  return {
    title: require(cleanText(raw.title, 64), "title"),
    summary: require(cleanText(raw.summary, 240), "summary"),
    takes,
    debate,
    strengths,
    weaknesses,
    biggestRisk: require(cleanText(raw.biggestRisk, 320), "biggestRisk"),
    biggestOpportunity: require(cleanText(raw.biggestOpportunity, 320), "biggestOpportunity"),
    closingLine: require(cleanText(raw.closingLine, 200), "closingLine"),
    overall,
    verdict: verdictFor(overall),
    mode,
  };
}

export function normalizeFix(raw: unknown, mode: FixResult["mode"]): FixResult {
  if (!isObj(raw)) throw new InvalidResponseError("Model response was not an object");

  const changes: FixChange[] = (Array.isArray(raw.changes) ? raw.changes : [])
    .filter(isObj)
    .map((c) => ({
      area: cleanText(c.area, 48),
      before: cleanText(c.before, 240),
      after: cleanText(c.after, 280),
      why: cleanText(c.why, 320),
      persona: personaId(c.persona) ?? "customer",
    }))
    .filter((c) => c.area && c.before && c.after && c.why)
    .slice(0, 5);
  if (changes.length < 3) throw new InvalidResponseError("Fix response needs at least three changes");

  const firstSteps = textList(raw.firstSteps, 240, 3);
  if (firstSteps.length < 3) throw new InvalidResponseError("Fix response needs three first steps");

  const ps = isObj(raw.projectedScores) ? raw.projectedScores : {};
  const projectedScores = {
    investor: clampScore(ps.investor),
    engineer: clampScore(ps.engineer),
    marketer: clampScore(ps.marketer),
    customer: clampScore(ps.customer),
  };
  const projectedOverall = overallScore(projectedScores);

  return {
    title: require(cleanText(raw.title, 64), "title"),
    tagline: require(cleanText(raw.tagline, 140), "tagline"),
    pitch: require(cleanText(raw.pitch, 1100), "pitch"),
    changes,
    firstSteps,
    projectedScores,
    projectedOverall,
    projectedVerdict: verdictFor(projectedOverall),
    mode,
  };
}
