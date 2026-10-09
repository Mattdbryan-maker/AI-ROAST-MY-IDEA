import { describe, expect, it, vi } from "vitest";
import { arithmeticErrors, biographyClaims, ideaHasFounderFacts, marketStatClaims, stripBiography } from "@/lib/ai/checks";
import { demoRoast } from "@/lib/ai/demo/engine";
import type { LlmClient, LlmRequest } from "@/lib/ai/llm";
import { ModelRoastProvider } from "@/lib/ai/model-provider";
import { MAX_PROJECTED_GAIN, MAX_PROJECTED_SCORE, capProjectedScores, normalizeFix } from "@/lib/ai/normalize";
import { FIX_SYSTEM_PROMPT, ROAST_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { InvalidResponseError } from "@/lib/ai/provider";
import { scoresFromTakes } from "@/lib/scoring";

/**
 * Exact sentences from the final Haiku benchmark (bench/results/2026-10-08T19-08-52-final-10),
 * paired with the pitch each was written about. None of those pitches says anything about its author.
 */
const CASES = [
  {
    id: "saas-restaurant-waste",
    idea: "B2B SaaS for small independent restaurants that predicts tomorrow's covers from bookings, weather and local events, then tells the chef exactly how much stock to order so less food gets thrown away. £79/month per site.",
    invented: "I'm Sam and I've spent years watching good chefs bin perfectly edible stock on Monday mornings because they over-ordered for a Friday that never filled.",
  },
  {
    id: "marketplace-dog-walking",
    idea: "Uber for dog walking. Busy professionals book a vetted local walker in under 60 seconds, track the walk on a live map, and we take a 20% commission on every booking.",
    invented: "I have spent years watching dog owners juggle one neighbour's teenager, a kennel that is always full, and a group chat that drops the Tuesday walk.",
  },
  {
    id: "subscription-houseplants",
    idea: "A subscription box of indestructible houseplants for people who keep killing houseplants. £15/month, each plant comes with a QR code linking to care videos.",
    invented: "I keep killing houseplants, and so do most people I know.",
  },
  {
    id: "bad-nft-sourdough",
    idea: "A blockchain-verified NFT marketplace for sourdough starters. Every starter gets an on-chain pedigree and owners vote on new flavours through a DAO.",
    invented: "I bake sourdough at home and I kept losing track of where my starters came from and how they behaved over time.",
  },
  {
    id: "ai-wedding-speech",
    idea: "An AI app that writes your wedding speech. You do a 5-minute voice interview about the couple, it writes a funny, personal speech and coaches your delivery. £29 per speech.",
    invented: "Before the day, a human writer (me, at first) reads your draft and checks tone and facts for a flat fee of £49 on top of the base price.",
  },
];

describe("invented founder biographies (Haiku, final benchmark)", () => {
  it.each(CASES)("flags the invented sentence for $id", ({ idea, invented }) => {
    expect(biographyClaims(invented, idea)).toEqual([invented]);
  });

  it("leaves honest founder-voice sentences alone", () => {
    const idea = CASES[0].idea;
    for (const ok of [
      "I'm building a tool for kitchens that over-order on Mondays.",
      "I'm starting with 20 kitchens in one city, through a free bin audit.",
      "I would test whether the forecast beats a good chef's guess before I charge anyone.",
      "Here's what I'm building.",
      "We start with one London postcode area and hand-vet every walker.",
      "I'll learn that quickly, and if it fails I will change the wedge.",
    ]) {
      expect(biographyClaims(ok, idea)).toEqual([]);
    }
  });

  it("does not mistake a quoted customer objection for a founder claim", () => {
    expect(biographyClaims("Answers the 'pay before I've seen a saving' objection by making the saving visible first.", CASES[0].idea)).toEqual([]);
  });

  it("preserves founder facts the user supplied", () => {
    const idea = "I ran a café for ten years and kept throwing away pastries. I'd like to build an app that predicts tomorrow's footfall for bakeries, £30 a month.";
    expect(ideaHasFounderFacts(idea)).toBe(true);
    expect(biographyClaims("I've spent ten years running a café, so I know what gets binned.", idea)).toEqual([]);
    // A name the user gave is theirs to keep; a different one is invented.
    expect(biographyClaims("I'm Priya and I run a café.", `${idea} My name is Priya.`)).toEqual([]);
    expect(biographyClaims("I'm Sam and I run a café.", `${idea} My name is Priya.`)).toHaveLength(1);
  });

  it("a bare 'I'd like to…' in the pitch is not a founder fact", () => {
    expect(ideaHasFounderFacts("I'd like to build a houseplant subscription box for £15 a month.")).toBe(false);
    expect(biographyClaims("I have spent years watching people kill plants.", "I'd like to build a houseplant subscription box.")).toHaveLength(1);
  });

  it("removes only the invented sentences from a pitch and keeps the rest verbatim", () => {
    const rest = "Here's what I'm building. For the first four weeks, we sit alongside one kitchen and weigh their waste bins daily. We start with 20 kitchens in one city.";
    const { text, removed } = stripBiography(`${CASES[0].invented} ${rest}`, CASES[0].idea);
    expect(removed).toEqual([CASES[0].invented]);
    expect(text).toBe(rest);
  });
});

const rawFix = (pitch: string, extra: Record<string, unknown> = {}) => ({
  title: "Better Idea",
  tagline: "A clear promise to one customer.",
  pitch,
  changes: [1, 2, 3].map((i) => ({ area: `Area ${i}`, before: "Before.", after: "After, at a cost of about two weeks of work.", why: "Because.", persona: "investor" })),
  firstSteps: ["Ask 10 chefs; pass if 3 say yes, otherwise stop.", "Weigh bins for a week; pass if waste is over 5 kg.", "Offer a free audit to 5 kitchens; pass if 2 sign."],
  projectedScores: { investor: 60, engineer: 60, marketer: 60, customer: 60 },
  ...extra,
});

const PITCH_BODY =
  "Here's what I'm building. For the first four weeks, we sit alongside one kitchen, weigh their waste bins daily, and take their existing booking-app and till exports. We give them a simple order sheet for each day's likely covers, built from their own history and the weather. At the end of the month we show them the kilograms saved against their own baseline.";

describe("normalizeFix and the invented biography", () => {
  const { idea, invented } = CASES[0];

  it("cuts an invented opening out of the pitch and keeps everything else", () => {
    const fix = normalizeFix(rawFix(`${invented} ${PITCH_BODY}`), "ai", { idea });
    expect(fix.pitch).toBe(PITCH_BODY);
    expect(fix.pitch).not.toMatch(/\bSam\b|years/);
  });

  it("leaves a clean pitch byte-for-byte unchanged", () => {
    expect(normalizeFix(rawFix(PITCH_BODY), "ai", { idea }).pitch).toBe(PITCH_BODY);
  });

  it("rejects (for retry) rather than silently deleting a sentence that also carries a price", () => {
    const wedding = CASES[4];
    expect(() => normalizeFix(rawFix(`${wedding.invented} ${PITCH_BODY}`), "ai", { idea: wedding.idea })).toThrow(InvalidResponseError);
  });

  it("rejects a pitch that is nothing but backstory", () => {
    expect(() => normalizeFix(rawFix(`${invented} I'm Sam. I keep seeing it.`), "ai", { idea })).toThrow(InvalidResponseError);
  });

  it("rejects a biography smuggled into a change or step, where it can't be cut out", () => {
    const sneaky = rawFix(PITCH_BODY, { firstSteps: ["As a former chef I know this works; pass if 3 say yes.", "b.", "c."] });
    expect(() => normalizeFix(sneaky, "ai", { idea })).toThrow(/invents facts about the founder/);
  });

  it("does nothing when no context is given (demo engine, fixtures)", () => {
    expect(normalizeFix(rawFix(`${invented} ${PITCH_BODY}`), "demo").pitch).toContain("Sam");
  });
});

describe("prompts forbid invented founders", () => {
  it("the FIX prompt names the failure modes seen in the benchmark", () => {
    expect(FIX_SYSTEM_PROMPT).toContain("I'm Sam");
    expect(FIX_SYSTEM_PROMPT).toContain("I keep killing houseplants");
    expect(FIX_SYSTEM_PROMPT).toContain("Keep any fact about them the original pitch states");
    expect(FIX_SYSTEM_PROMPT).toContain("never with a backstory");
  });
});

describe("commercial reasoning checks", () => {
  it("arithmetic: wrong equations are caught, right ones (including long chains) are not", () => {
    expect(arithmeticErrors("£79 × 12 = £1,050")).toEqual(["£79 × 12 = £1,050"]);
    expect(arithmeticErrors("£79 × 12 = £948")).toEqual([]);
    // A correct chain that the earlier two-term check mis-read (final Haiku benchmark, dog walking).
    expect(arithmeticErrors("Example: 40 walkers × £15 × 12 = £7,200 a year")).toEqual([]);
    expect(arithmeticErrors("£15 × 12 × 40 = £7,200")).toEqual([]);
    expect(arithmeticErrors("£15 × 12 × 40 = £720")).toHaveLength(1);
    expect(arithmeticErrors("£1,000 + £500 − £200 = £1,300")).toEqual([]); // mixed operators: skipped, not guessed
  });

  it("market statistics: invented figures and appeals to research are caught", () => {
    const idea = "A houseplant subscription box, £15 a month.";
    for (const claim of [
      "62% of consumers say they have killed a houseplant.",
      "The UK houseplant market is worth £1.2 billion a year.",
      "Studies show people who watch care videos keep plants alive longer.",
      "According to industry data, 7 in 10 households want low-effort plants.",
      "It is a $40 billion market for restaurants alone.",
    ]) {
      expect(marketStatClaims(claim, idea), claim).toHaveLength(1);
    }
  });

  it("market statistics: pitch figures and framed assumptions are fine", () => {
    const idea = "We charge 20% of every booking from people who book walkers.";
    expect(marketStatClaims("We keep 20% of customers who book at least twice.", idea)).toEqual([]);
    expect(marketStatClaims("Say 30% of people who try the box buy a second plant; that is an assumption to test.", idea)).toEqual([]);
    expect(marketStatClaims("If 5% of visitors pay, the maths works.", idea)).toEqual([]);
    expect(marketStatClaims("A 5% fee on a £40 jacket is £2 a sale.", idea)).toEqual([]);
  });

  it("normalizeFix rejects an unverified statistic and wrong arithmetic, with a reason fit for a retry note", () => {
    const idea = CASES[2].idea;
    const stat = rawFix(`${PITCH_BODY} Studies show 62% of consumers abandon plant care within a month.`);
    expect(() => normalizeFix(stat, "ai", { idea })).toThrow(/unverified statistic/);
    const maths = rawFix(`${PITCH_BODY} At £15 × 12 = £150 a year per subscriber the box pays for itself.`);
    expect(() => normalizeFix(maths, "ai", { idea })).toThrow(/arithmetic is wrong/);
  });
});

describe("projected scores can't overstate viability", () => {
  const roast = demoRoast("A subscription box of houseplants for people who kill houseplants, £15/month.");
  const before = scoresFromTakes(roast.takes);
  const fixWith = (scores: Record<string, number>) => normalizeFix(rawFix(PITCH_BODY, { projectedScores: scores }), "ai");

  it("caps each critic's gain at MAX_PROJECTED_GAIN (20)", () => {
    expect(MAX_PROJECTED_GAIN).toBe(20);
    const capped = capProjectedScores(fixWith({ investor: 100, engineer: 100, marketer: 100, customer: 100 }), roast);
    for (const id of ["investor", "engineer", "marketer", "customer"] as const) {
      expect(capped.projectedScores[id]).toBeLessThanOrEqual(before[id] + MAX_PROJECTED_GAIN);
      expect(capped.projectedScores[id]).toBeLessThanOrEqual(Math.max(MAX_PROJECTED_SCORE, before[id]));
    }
  });

  it("never projects past 85, even for a critic who started high", () => {
    const high = { ...roast, takes: roast.takes.map((t) => ({ ...t, score: 80 })) };
    const capped = capProjectedScores(fixWith({ investor: 99, engineer: 99, marketer: 99, customer: 99 }), high);
    expect(Object.values(capped.projectedScores).every((s) => s <= MAX_PROJECTED_SCORE)).toBe(true);
  });

  it("respects a critic whose score falls, but only when the trade-off is explained", () => {
    const scores = { investor: before.investor + 5, engineer: 0, marketer: before.marketer, customer: before.customer + 1 };
    expect(() => capProjectedScores(fixWith(scores), roast)).toThrow(/scoreNote/);
    const explained = normalizeFix(rawFix(PITCH_BODY, { projectedScores: scores, scoreNote: "The engineer likes it less: the new tracking adds a second system to build." }), "ai");
    const capped = capProjectedScores(explained, roast);
    expect(capped.projectedScores.investor).toBe(before.investor + 5);
    expect(capped.projectedScores.engineer).toBe(0); // the model's own number is respected; the cap only lowers
    expect(capped.scoreNote).toContain("second system");
  });

  it("the FIX prompt asks for the same ceiling the code enforces", () => {
    expect(FIX_SYSTEM_PROMPT).toContain(`never more than +${MAX_PROJECTED_GAIN}`);
    expect(FIX_SYSTEM_PROMPT).toContain(`above ${MAX_PROJECTED_SCORE}`);
  });
});

describe("personality and self-reference prompt rules", () => {
  it("shows the model the wrong and right way to refer to itself, in the roast prompt", () => {
    expect(ROAST_SYSTEM_PROMPT).toContain("Wrong, from the investor");
    expect(ROAST_SYSTEM_PROMPT).toContain("My maths holds");
    expect(ROAST_SYSTEM_PROMPT).toContain("four people with different money, skills and habits");
  });

  it("keeps all four persona voices in the prompt", () => {
    for (const phrase of ["STERLING", "KERNEL", "HYPE", "WALLET", "Blunt, sarcastic", "culturally switched-on", "Plain-spoken"]) {
      expect(ROAST_SYSTEM_PROMPT.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });
});

describe("FIX retry carries the grounding reason to the model", () => {
  const { idea, invented } = CASES[4]; // the wedding case: biography + a price in the same sentence → retry, not deletion
  const roast = demoRoast(idea);

  it("rejects, retries once with a note, and returns the clean second answer", async () => {
    const seen: LlmRequest[] = [];
    const responses = [rawFix(`${invented} ${PITCH_BODY}`), rawFix(PITCH_BODY)];
    const client: LlmClient = {
      provider: "test",
      model: "test",
      async complete(req) {
        seen.push(req);
        return JSON.stringify(responses[seen.length - 1]);
      },
      async *stream() {},
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fix = await new ModelRoastProvider(client).fix(idea, roast);
    expect(fix.pitch).toBe(PITCH_BODY);
    expect(seen[1].user).toContain("invented founder biography");
  });
});
