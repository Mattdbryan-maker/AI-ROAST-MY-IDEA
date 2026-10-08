import type { FixResult, Roast } from "../src/lib/types";
import { PERSONAS } from "../src/lib/personas";

/**
 * Cheap, deterministic text checks. They flag symptoms (generic takes, debate
 * lines that ignore each other, unhedged numbers) for a human to look at.
 * They are NOT quality scores and must not be read as proof of quality —
 * that's what the blinded human review is for.
 */

const STOPWORDS = new Set(
  "about above after again against also because been before being below between both but could does doing down during each from further have having here into itself just more most other over same should some such than that their them then there these they this those through under until very what when where which while will with would your yours ours the and for are not you can our its was were has had who how all any few nor only own out per too off once why".split(" "),
);

const CLICHES = ["bold move", "i'm out", "shark tank", "solution looking for a problem", "game-changer", "game changer", "disrupt", "at the end of the day", "move the needle", "synergy", "leverage social media", "go viral"];
const HEDGES = /\b(if|say|assume|assuming|roughly|maybe|could|around|about|perhaps|guess|ballpark|suppose)\b|~/i;

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []).filter((w) => !STOPWORDS.has(w));
}

const jaccard = (a: Set<string>, b: Set<string>) => {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
};

export interface Heuristics {
  /** Share of testimonies that mention at least one distinctive word from the pitch. Higher = more grounded. */
  pitchGrounding: number;
  /** Share of debate lines (after the first) that name another panelist or pick up the previous line's words. */
  debateEngagement: number;
  /** Whether anyone in the debate concedes a point. */
  debateHasConcession: boolean;
  /** Numbers/percentages/money not in the pitch and not framed as an assumption. Each one deserves a human look. */
  possibleInventedFigures: number;
  /** Stock phrases the prompt bans. */
  clicheHits: number;
  /** Mean word overlap between the four testimonies (0-1). Lower = more distinct voices. */
  personaOverlap: number;
  /** Strings the normaliser had to cut short (the model ignored length guidance). */
  truncatedStrings: number;
}

export function analyseRoast(pitch: string, roast: Roast, fix?: FixResult | null): Heuristics {
  const pitchWords = new Set(words(pitch).filter((w) => w.length >= 5));
  const takeText = roast.takes.map((t) => [t.headline, ...t.points].join(" "));
  const pitchGrounding = takeText.filter((t) => words(t).some((w) => pitchWords.has(w))).length / roast.takes.length;

  const names = Object.values(PERSONAS).map((p) => p.name.toLowerCase());
  const engaged = roast.debate.slice(1).filter((line, i) => {
    const prev = roast.debate[i];
    const lower = line.line.toLowerCase();
    const namesOther = names.some((n) => lower.includes(n) && n !== PERSONAS[line.speaker].name.toLowerCase());
    const prevWords = new Set(words(prev.line));
    const shared = words(line.line).filter((w) => prevWords.has(w)).length;
    return namesOther || shared >= 2;
  }).length;
  const debateEngagement = roast.debate.length > 1 ? engaged / (roast.debate.length - 1) : 0;
  const debateHasConcession = roast.debate.some((l) => /\b(fair|fine|granted|you're right|youre right|i'll give you|agreed|point taken|true,)/i.test(l.line));

  const allText = [...takeText, ...roast.debate.map((d) => d.line), roast.biggestRisk, roast.biggestOpportunity, ...(fix ? [fix.pitch, ...fix.firstSteps] : [])];
  let possibleInventedFigures = 0;
  for (const text of allText) {
    for (const m of text.matchAll(/[£$€]?\d[\d,.]*\s?(%|k\b|m\b|bn\b|million|billion|percent)?/gi)) {
      const token = m[0].trim();
      if (!/[%£$€kmb]|million|billion|percent/i.test(token)) continue; // plain counts are fine
      if (pitch.includes(token.replace(/\s/g, ""))) continue;
      const before = text.slice(Math.max(0, (m.index ?? 0) - 60), m.index);
      if (HEDGES.test(before)) continue;
      possibleInventedFigures++;
    }
  }

  const lowerAll = allText.join(" ").toLowerCase();
  const clicheHits = CLICHES.reduce((n, c) => n + (lowerAll.split(c).length - 1), 0);

  const sets = takeText.map((t) => new Set(words(t)));
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      total += jaccard(sets[i], sets[j]);
      pairs++;
    }
  }
  const personaOverlap = pairs ? total / pairs : 0;

  const strings = [...roast.takes.flatMap((t) => [t.headline, ...t.points, t.strength, t.weakness]), ...roast.debate.map((d) => d.line)];
  const truncatedStrings = strings.filter((s) => s.endsWith("…")).length;

  return { pitchGrounding, debateEngagement, debateHasConcession, possibleInventedFigures, clicheHits, personaOverlap, truncatedStrings };
}
