/**
 * Lightweight, deterministic text analysis of a pitch.
 *
 * Powers the demo panel (so it reacts to what was actually written) and the
 * "system log" shown during the analysis sequence. No network, no model.
 */

export type Category =
  | "pets"
  | "food"
  | "fitness"
  | "dating"
  | "education"
  | "health"
  | "travel"
  | "finance"
  | "eco"
  | "parents"
  | "creator"
  | "productivity"
  | "gaming"
  | "fashion"
  | "home"
  | "music";

export interface Signals {
  words: number;
  ai: boolean;
  crypto: boolean;
  marketplace: boolean;
  subscription: boolean;
  social: boolean;
  hardware: boolean;
  app: boolean;
  b2b: boolean;
  regulated: boolean;
  realtime: boolean;
  monetization: boolean;
  audience: boolean;
  pain: boolean;
  buzzwords: string[];
  uberFor: string | null;
  /** Who the pitch says it's for, e.g. "busy professionals", if stated. */
  forWhom: string | null;
  category: Category | null;
}

const has = (text: string, re: RegExp) => re.test(text);

const CATEGORY_PATTERNS: [Category, RegExp][] = [
  ["pets", /\b(pets?|dogs?|cats?|puppy|puppies|kitten|vet|walkers?)\b/],
  ["dating", /\b(dating|date|singles?|relationship|romance|match(es|ing)? (people|singles))\b/],
  ["fitness", /\b(fitness|gym|workout|exercise|running|yoga|training|athletes?)\b/],
  ["food", /\b(food|meals?|recipes?|cook(ing)?|restaurants?|grocer(y|ies)|kitchen|chefs?|dinner|lunch|coffee|bakery|sourdough)\b/],
  ["education", /\b(students?|learn(ing)?|teach(ers|ing)?|school|university|course|tutor(ing)?|exam|homework|education)\b/],
  ["health", /\b(health|medical|doctor|patients?|therapy|mental|sleep|symptoms?|clinic|wellness|medication)\b/],
  ["travel", /\b(travel|trips?|holiday|vacation|flights?|hotels?|tourists?|itinerar(y|ies))\b/],
  ["finance", /\b(financ(e|ial)|money|budget(ing)?|invest(ing|ment)?|savings?|bank(ing)?|tax(es)?|debt|loans?|payments?)\b/],
  ["eco", /\b(eco|sustainab(le|ility)|climate|carbon|recycl(e|ing)|waste|green|second.?hand|upcycl)/],
  ["parents", /\b(parents?|kids?|children|toddlers?|babies|baby|family|families|childcare)\b/],
  ["creator", /\b(creators?|influencers?|youtubers?|tiktok|content|followers|newsletter|podcast)\b/],
  ["gaming", /\b(gam(e|es|ing|ers?)|esports|twitch|console)\b/],
  ["fashion", /\b(fashion|clothes|clothing|outfits?|wardrobe|style|sneakers|vintage)\b/],
  ["home", /\b(home|house|renovation|diy|plumbers?|cleaning|furniture|plants?|garden(ing)?|landlords?|tenants?)\b/],
  ["music", /\b(music|musicians?|bands?|songs?|playlists?|concerts?|gigs?|artists?)\b/],
  ["productivity", /\b(productivity|tasks?|to-?do|calendar|meetings?|notes|emails?|workflow|freelancers?|remote work)\b/],
];

const BUZZWORDS = [
  "revolutionary",
  "disrupt",
  "synergy",
  "leverage",
  "ecosystem",
  "game-changing",
  "game changer",
  "next-gen",
  "next generation",
  "seamless",
  "world's first",
  "paradigm",
  "cutting-edge",
  "innovative",
  "web3",
  "metaverse",
  "10x",
  "frictionless",
];

export function analyzeIdea(idea: string): Signals {
  const t = ` ${idea.toLowerCase()} `;
  const words = idea.trim().split(/\s+/).filter(Boolean).length;
  const uber = t.match(/\b(?:uber|airbnb|tinder|netflix|spotify|linkedin|strava) for ([a-z][a-z' -]{1,40}?)(?=[,.;!?]| that | which | where | with | but |\s*$)/);

  return {
    words,
    ai: has(t, /\b(ai|a\.i\.|gpt|llm|chatbot|machine learning|artificial intelligence|agents?|neural)\b/),
    crypto: has(t, /\b(crypto|blockchain|nfts?|web3|tokens?|dao|bitcoin|ethereum|on-chain)\b/),
    marketplace: has(t, /\b(marketplace|two-sided|connects? (people|users|customers|buyers|owners|students|parents)|matches|book (a|local)|gig|freelance platform|uber for|airbnb for|rent (out|their))\b/),
    subscription: has(t, /\b(subscription|subscribe|monthly (fee|box|plan)|membership|per month|\/month|a month|box)\b/),
    social: has(t, /\b(social|community|friends|share|sharing|feed|followers|network|chat|groups?)\b/),
    hardware: has(t, /\b(device|hardware|wearable|sensor|robot|drone|gadget|smart (ring|watch|glasses|collar|bottle|mirror|bin|fridge|lock)|collar|3d.?print)/),
    app: has(t, /\b(app|mobile|ios|android|download)\b/),
    b2b: has(t, /\b(b2b|saas|businesses|companies|teams|enterprise|small business(es)?|smbs?|restaurants|agencies|employers|hr|clinics|landlords)\b/),
    regulated: has(t, /\b(medical|health|diagnos|therapy|insurance|bank|loans?|invest|legal|lawyers?|children|kids|pharma|prescription|mortgage)/),
    realtime: has(t, /\b(real-?time|live|gps|location|nearby|on-?demand|instantly)\b/),
    monetization: has(t, /(\$|£|€|\bprice|\bpricing|\bcharge|\bfees?\b|\bcommission|\bsubscription|\bper month|\brevenue|\bads\b|\badvertis|\bfreemium|\bpremium|\bpaid\b|\bsell\b|\bsales\b)/),
    audience: has(t, /\bfor ([a-z]+ )?(busy|young|new|first-time|small|independent|local|remote|working|single|older|elderly|students|parents|teachers|freelancers|developers|designers|creators|nurses|doctors|athletes|gamers|musicians|travellers|travelers|dog|cat|pet|home|people who|those who|anyone who|women|men|teens|kids|families|companies|businesses|teams|restaurants|landlords|renters)/),
    pain: has(t, /\b(tired of|hate|annoying|frustrat|waste|wasting|struggle|hard to|expensive|save time|saves time|never|forget|stress|overwhelm|pain|problem|nightmare|lonely|confusing|takes forever)/),
    buzzwords: BUZZWORDS.filter((b) => t.includes(b)),
    uberFor: uber ? uber[1].trim() : null,
    forWhom: extractForWhom(idea),
    category: CATEGORY_PATTERNS.find(([, re]) => re.test(t))?.[0] ?? null,
  };
}

const LEADING_FILLER =
  /^(so,?\s+)?(basically,?\s+)?(i (want|would like|'d like|am going|plan) to (build|make|create|start|launch)|my (startup |business )?idea is( to)?|the idea is( to)?|imagine|what if there (was|were|is)|what if|there should be|picture this:?|it'?s|this is|we('re| are) building)\s+/i;
const LEADING_ARTICLE = /^(an?|the)\s+/i;
const CLAUSE_BREAK = /\s+(?:based on|using|via|so that|so|because|in under|which means|and then|but)\s+|\s*[,;:()—–]\s*|\s+-\s+/i;
const FOR_WHO_BREAK = /\s+for (?:people|anyone|those|users|someone|everyone) (?:who|that)\s+/i;
const RELATIVE = /\s+(?:that|which|where|who)\s+/i;
const GENERIC_HEAD = /^(?:(?:ai|a\.i\.|b2b|saas|mobile|web|simple|new|online|smart|social|subscription|ai-powered)\s+)*(?:app|platform|website|site|service|tool|startup|company|product|saas|software|bot|chatbot|marketplace|extension)$/i;

const SMALL_WORDS = new Set(["a", "an", "the", "and", "or", "for", "of", "to", "in", "on", "with", "at", "by", "who", "that", "where", "which"]);
const TRAILING_TRIM = new Set([...SMALL_WORDS, "your", "my", "their", "his", "her", "its", "our", "is", "are", "can", "will"]);
const SPECIAL_CASE: Record<string, string> = { ai: "AI", b2b: "B2B", saas: "SaaS", nft: "NFT", uk: "UK", us: "US", diy: "DIY", gps: "GPS", hr: "HR" };

function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w, i) => {
      const special = SPECIAL_CASE[w.toLowerCase()];
      if (special) return special;
      if (i > 0 && SMALL_WORDS.has(w.toLowerCase())) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

const wordsOf = (s: string) => s.replace(/[^\p{L}\p{N}'’\- ]/gu, " ").split(/\s+/).filter(Boolean);

function trimTail(words: string[]): string[] {
  const out = [...words];
  while (out.length > 2 && TRAILING_TRIM.has(out[out.length - 1].toLowerCase())) out.pop();
  return out;
}

const fits = (s: string) => s.length <= 44 && wordsOf(s).length <= 9;

/** Turn the start of a pitch into a short working title, e.g. "Uber for Dog Walking". */
export function deriveTitle(idea: string, signals: Signals = analyzeIdea(idea)): string {
  if (signals.uberFor) {
    const brand = idea.match(/\b(uber|airbnb|tinder|netflix|spotify|linkedin|strava)\b/i)?.[1] ?? "Uber";
    const target = trimTail(signals.uberFor.split(" ").slice(0, 3)).join(" ");
    return titleCase(`${brand.charAt(0).toUpperCase()}${brand.slice(1).toLowerCase()} for ${target}`);
  }
  let s = (idea.trim().split(/[.!?\n]/)[0] ?? idea).trim();
  s = s.replace(LEADING_FILLER, "").replace(LEADING_ARTICLE, "");
  s = s.split(CLAUSE_BREAK)[0] ?? s;

  if (!fits(s)) s = s.split(FOR_WHO_BREAK)[0] ?? s;
  if (!fits(s)) {
    const [head] = s.split(RELATIVE);
    if (head && head !== s && wordsOf(head).length >= 2 && !GENERIC_HEAD.test(head.trim())) s = head;
  }
  let words = wordsOf(s);
  if (!fits(s)) words = words.slice(0, 6);
  // Keep it short enough for a headline, cutting on word boundaries only.
  while (words.length > 2 && words.join(" ").length > 44) words.pop();
  words = trimTail(words);
  const title = titleCase(words.join(" "));
  return title.length >= 3 ? title.slice(0, 48) : "Untitled Idea";
}

const AUDIENCE_LEAD =
  /\bfor ((?:busy|young|new|first-time|small|independent|local|remote|working|single|older|elderly|lonely|anxious|lazy|broke|tired|people|anyone|those|students|parents|teachers|freelancers|developers|designers|creators|nurses|doctors|athletes|gamers|musicians|travell?ers|dog|cat|pet|home|women|men|teens|families|companies|businesses|teams|restaurants|landlords|renters|couples|retirees|runners|cyclists|writers|artists|founders)\b[^,.;!?()]{0,60})/i;

/** "...for people who keep killing houseplants" → "people who keep killing houseplants". */
export function extractForWhom(idea: string): string | null {
  // Skip "Uber for dog walking"-style comparisons: that "for" names a service, not an audience.
  const m = [...idea.matchAll(new RegExp(AUDIENCE_LEAD.source, "gi"))].find(
    (match) => !/\b(uber|airbnb|tinder|netflix|spotify|linkedin|strava)\s*$/i.test(idea.slice(0, match.index)),
  );
  if (!m) return null;
  const words = m[1].trim().split(/\s+/);
  const stop = words.findIndex((w, i) => i > 0 && /^(and|so|but|with|by|using|via|in|at|on|to|from|for|that|which)$/i.test(w) && !/^(who|that)$/i.test(words[i - 1]));
  const kept = trimTail(stop > 0 ? words.slice(0, stop) : words.slice(0, 8)).slice(0, 8);
  const phrase = kept.join(" ").replace(/[^\p{L}\p{N}'’\- ]/gu, "").trim().toLowerCase();
  return phrase.length >= 4 ? phrase : null;
}

/** Short, punchy log lines for the analysis sequence. */
export function analysisLog(idea: string): string[] {
  const s = analyzeIdea(idea);
  const lines = [
    `pitch received · ${s.words} words`,
    s.category ? `market detected · ${s.category}` : "market detected · unclear (concerning)",
    s.monetization ? "business model · located" : "business model · NOT FOUND",
    s.audience ? "target customer · identified" : "target customer · \"everyone\" (assumed)",
    s.buzzwords.length ? `buzzwords detected · ${s.buzzwords.length} (${s.buzzwords.slice(0, 2).join(", ")})` : "buzzword density · acceptable",
  ];
  if (s.ai) lines.push("AI wrapper risk · elevated");
  if (s.crypto) lines.push("blockchain · detected · panel sighs");
  if (s.marketplace) lines.push("chicken-and-egg problem · likely");
  if (s.hardware) lines.push("hardware · capital requirements high");
  if (s.subscription) lines.push("subscription fatigue · checking");
  if (s.uberFor) lines.push(`"uber for ${s.uberFor}" · comparison logged`);
  lines.push("competitors · enumerating", "weak points · ranking", "roast · seasoning");
  return lines;
}

/** FNV-1a 32-bit hash: stable seed from any string. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — tiny deterministic PRNG. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
