/**
 * Cheap, deterministic checks on model text. They exist to catch the specific
 * failures seen in real benchmark output, not to prove an LLM right: a check
 * that fires means "this text is not safe to show", never "everything else is
 * verified". Regexes are deliberately narrow so a false alarm costs one retry
 * at worst.
 */

// ── Arithmetic ──────────────────────────────────────────────────────────────

/** Parses "£1,200", "50k", "$3m", "12" to a number; null when it isn't one. */
function parseAmount(raw: string): number | null {
  const m = raw.replace(/[£$€,\s]/g, "").match(/^(\d+(?:\.\d+)?)(k|m|bn)?$/i);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, bn: 1e9 }[(m[2] ?? "").toLowerCase() as "k" | "m" | "bn"] ?? 1;
  return Number(m[1]) * mult;
}

const AMOUNT = String.raw`[£$€]?\d[\d,]*(?:\.\d+)?\s?(?:k|m|bn)?`;
const OPERATOR = String.raw`[×x*/÷+−-]`;
// A whole chain of terms ("40 walkers × £15 × 12 = £7,200"), so a correct long product is never judged by its last two terms.
const EQUATION = new RegExp(String.raw`(${AMOUNT}(?:\s*${OPERATOR}\s*${AMOUNT})+)\s*=\s*(${AMOUNT})`, "gi");
const TERM_SPLIT = new RegExp(String.raw`\s*(${OPERATOR})\s*(?=[£$€]?\d)`, "i");

/**
 * Explicit equations in the text ("£79 × 12 = £950") whose result is wrong
 * (beyond 1% rounding). Only equations written out with operators and "=" are
 * checked, so arithmetic buried in prose is not covered. A chain is evaluated
 * only when all its operators are of one kind (all × and ÷, or all + and −);
 * mixed chains are skipped rather than guessed at.
 */
export function arithmeticErrors(text: string): string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(EQUATION)) {
    const [whole, chain, claimed] = m;
    // "40 walkers × £15 × 12 = £7,200": the chain started earlier, with a word in it we can't evaluate. Skip, don't guess.
    if (/(?:^|[\s\d])[×x*/÷+−-]$/i.test(text.slice(0, m.index).trimEnd())) continue;
    const pieces = chain.split(TERM_SPLIT);
    const terms = pieces.filter((_, i) => i % 2 === 0).map((t) => parseAmount(t.trim()));
    const ops = pieces.filter((_, i) => i % 2 === 1).map((o) => o.toLowerCase());
    const result = parseAmount(claimed.trim());
    if (result === null || terms.some((t) => t === null)) continue;
    const multiplicative = ops.every((o) => "×x*/÷".includes(o));
    const additive = ops.every((o) => "+−-".includes(o));
    if (!multiplicative && !additive) continue;
    let want = terms[0] as number;
    ops.forEach((o, i) => {
      const next = terms[i + 1] as number;
      want = o === "×" || o === "x" || o === "*" ? want * next : o === "/" || o === "÷" ? want / next : o === "+" ? want + next : want - next;
    });
    if (Number.isNaN(want)) continue;
    if (Math.abs(want - result) > Math.max(0.01 * Math.abs(want), 0.005)) bad.push(whole.trim());
  }
  return bad;
}

// ── Market statistics stated as fact ────────────────────────────────────────

/** Words that frame a number as an assumption rather than a finding. */
export const HEDGES = /\b(if|say|assume|assuming|assumption|roughly|maybe|could|around|about|perhaps|guess|ballpark|suppose|imagine|suppose|test|unverified|illustrat\w+)\b|~/i;

const POPULATION = String.raw`(?:people|consumers|adults|users|customers|households|restaurants|shoppers|businesses|companies|freelancers|owners|workers|employees|millennials|gen\s?z|americans|britons|brits|commuters|cyclists|couples|brides|parents|startups|smes?|smbs?|retailers|drivers|renters|homeowners)`;

const STAT_PATTERNS: RegExp[] = [
  // "62% of consumers", "7 in 10 restaurants"
  new RegExp(String.raw`\b\d+(?:\.\d+)?\s?(?:%|percent|per cent)\s+of\s+(?:all\s+|UK\s+|US\s+|British\s+|American\s+|small\s+)?${POPULATION}\b`, "i"),
  new RegExp(String.raw`\b\d+\s+in\s+(?:\d+|ten)\s+(?:${POPULATION})\b`, "i"),
  // "a $40 billion market"
  /[£$€]\s?\d[\d.,]*\s?(?:billion|trillion|bn|tn|million)\s+(?:\w+\s+){0,3}(?:market|industry|sector|economy|opportunity)\b/i,
  /\b(?:market|industry|sector)\s+(?:is|was|will be|is expected to be|is projected to be)\s+(?:worth|valued at|estimated at)\b/i,
  // Appeals to research that does not exist in this pipeline
  /\b(?:studies|research|surveys?|reports?|analysts?|statistics|data)\s+(?:show|shows|showed|found|find|suggest|suggests|indicate|indicates|predict|predicts|confirm)\b/i,
  /\baccording to\b/i,
];

/**
 * Sentences that present a market statistic or an appeal to research as fact:
 * the model has no research to draw on, so anything like this is invented.
 * Exempt: figures the pitch itself gives, and figures framed as an assumption.
 */
export function marketStatClaims(text: string, idea = ""): string[] {
  return splitSentences(text).filter((sentence) =>
    STAT_PATTERNS.some((pattern) => {
      const m = pattern.exec(sentence);
      if (!m) return false;
      // Framing comes before the number ("say 30% …", "if 5% …"); a trailing "assumption to test" also counts.
      if (HEDGES.test(sentence.slice(Math.max(0, m.index - 80), m.index)) || /\b(?:assumption|to test|unverified)\b/i.test(sentence.slice(m.index))) return false;
      const figure = m[0].match(/\d+(?:\.\d+)?/)?.[0];
      return !(figure && new RegExp(String.raw`(?<![\d.])${figure.replace(".", "\.")}(?![\d])`).test(idea));
    }),
  );
}

// ── Invented founder biography ──────────────────────────────────────────────

/** Splits on sentence ends followed by whitespace, so "£2.40" and "3.5%" stay whole. */
export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?]["”')\]]?)\s+(?=\S)/).filter((s) => s.trim());
}

const NOT_A_NAME = new Set(
  "a an the building starting launching creating making not going now here proposing focusing targeting selling pitching trying testing designing looking using working planning aiming there still also only just sure happy thinking offering opening running cutting pricing keeping asking writing treating also".split(" "),
);

const NAME_CLAIM = /\b(?:I'm|I am|my name is|my name's|name's|call me|this is|founder,?|founded by|hi,? I'm)\s+([A-Z][a-z]{1,14})\b/g;

const EXPERIENCE_CLAIMS: RegExp[] = [
  /\b(?:I|we)(?:'ve| have)\s+(?:spent|worked|run|ran|founded|seen|watched|lived|sold|managed|led|learned|learnt|noticed|struggled|interviewed|built|been (?:a|an|the|in|doing|working|running))\b/i,
  /\bI\s+(?:spent|worked|ran|founded|managed|led|grew up|used to|keep|kept|bake|baked|noticed|watched|saw|learned|learnt|struggled|lost)\b/i,
  /\bmy\s+(?:\w+\s+){0,2}(?:years?|career|decade|background|experience|time (?:at|as|in)|previous|former|last (?:job|company|startup|employer))\b/i,
  /\bmy\s+(?:\d+|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)[- ]years?\b/i,
  /\b(?:I|me|my|we|our)\b[^.!?]{0,60}\b(?:\d+|several|many|ten|twenty|fifteen|two|three|five)\s+years?\s+(?:as|in|of|working|running|building|managing|experience)\b/i,
  /\bas a (?:former|ex-|lifelong|long-?time|seasoned|veteran)\b/i,
  /\((?:me|myself)\b/i,
];

/**
 * True when the user's own pitch states something about themselves ("I run a
 * café", "my ten years in logistics"), so the rewrite may build on it. A bare
 * "I'd like to build…" says nothing about experience and does not count.
 */
export function ideaHasFounderFacts(idea: string): boolean {
  return (
    EXPERIENCE_CLAIMS.some((pattern) => pattern.test(idea)) ||
    /\bI(?: was| run| ran| work| worked| own| owned| founded| manage| managed| teach| taught| sold)\b/i.test(idea) ||
    /\bmy\s+(?:\w+\s+){0,2}(?:years?|career|background|company|business|café|cafe|shop|restaurant|firm|team|clients?|customers?|job|degree|studio|practice)\b/i.test(idea)
  );
}

const QUOTED = /"[^"]*"|“[^”]*”|(?<!\w)'(?:[^']|(?<=\w)'(?=\w)){3,}?'(?!\w)/g;

/** Sentences that give the founder a name, a career or a personal story the user never supplied. */
export function biographyClaims(text: string, idea: string): string[] {
  const founderFacts = ideaHasFounderFacts(idea);
  const ideaLower = idea.toLowerCase();
  return splitSentences(text).filter((sentence) => {
    // A quoted phrase is someone else's words (a customer's objection), not a claim about the founder.
    const spoken = sentence.replace(QUOTED, " ");
    for (const m of spoken.matchAll(NAME_CLAIM)) {
      const name = m[1];
      if (NOT_A_NAME.has(name.toLowerCase())) continue;
      if (!new RegExp(String.raw`\b${name}\b`, "i").test(ideaLower)) return true;
    }
    return !founderFacts && EXPERIENCE_CLAIMS.some((pattern) => pattern.test(spoken));
  });
}

/** Removes invented-biography sentences from a founder-voice pitch. */
export function stripBiography(text: string, idea: string): { text: string; removed: string[] } {
  const removed = new Set(biographyClaims(text, idea));
  if (!removed.size) return { text, removed: [] };
  return { text: splitSentences(text).filter((s) => !removed.has(s)).join(" "), removed: [...removed] };
}
