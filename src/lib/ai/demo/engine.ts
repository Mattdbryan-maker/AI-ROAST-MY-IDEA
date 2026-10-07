import { PERSONAS, PERSONA_ORDER } from "../../personas";
import { clampScore, overallScore, verdictFor } from "../../scoring";
import type { FixChange, FixResult, PersonaId, PersonaTake, Roast, Verdict } from "../../types";
import { cleanText, normalizeFix, normalizeRoast } from "../normalize";
import type { RoastProvider } from "../provider";
import { analyzeIdea, createRng, deriveTitle, hashString, type Signals } from "./analyze";
import {
  CLOSING_LINES,
  DEFAULT_OPPORTUNITY,
  DEFAULT_RISK,
  MARKETS,
  OPPORTUNITIES,
  RISKS,
  SCRIPTS,
  type MarketContext,
  type Rule,
} from "./copy";

/**
 * Demo panel: a deterministic, offline roast generator.
 *
 * It reads signals from the pitch (business model? audience? hardware?
 * crypto?...) and assembles persona takes from a scripted library, so the
 * full product can be explored without an API key. Same pitch → same roast.
 * Its output goes through the same normaliser as real model output.
 */

type Rng = () => number;

interface Ctx extends MarketContext {
  x: string;
  title: string;
}

function fill(template: string, ctx: Ctx, extra: Record<string, string> = {}): string {
  const values: Record<string, string> = { ...ctx, ...extra };
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const pick = <T>(items: T[], rng: Rng): T => items[Math.floor(rng() * items.length)];
const matching = (rules: Rule[], s: Signals) => rules.filter((r) => r.when(s)).map((r) => r.text);

function personaScores(s: Signals, rng: Rng): Record<PersonaId, number> {
  const vague = s.words < 12;
  const detailed = s.words > 40;
  const buzz = s.buzzwords.length;
  const simple = !s.hardware && !s.crypto && !s.ai && !s.regulated;
  const b = (cond: boolean, n: number) => (cond ? n : 0);
  const jitter = () => Math.round((rng() - 0.5) * 14);

  const raw: Record<PersonaId, number> = {
    investor:
      52 + b(s.b2b, 8) + (s.monetization ? 9 : -8) + b(s.subscription, 3) - b(s.marketplace, 3) - b(s.crypto, 14) -
      b(s.hardware, 8) - b(s.ai, 3) - buzz * 4 - b(vague, 12) + b(s.audience, 4) + b(s.pain, 4) + b(detailed, 4),
    engineer:
      58 - b(s.hardware, 14) - b(s.crypto, 16) - b(s.ai, 5) - b(s.marketplace, 3) - b(s.regulated, 7) -
      b(s.realtime, 4) + b(simple, 6) - b(vague, 10) - b(s.social, 3) + b(detailed, 3),
    marketer:
      50 + (s.audience ? 10 : -8) + b(s.social, 6) + b(s.category !== null, 5) + b(s.ai, 4) - b(s.b2b, 4) - buzz * 5 -
      b(s.crypto, 10) + b(s.pain, 6) - b(vague, 10) - b(s.uberFor !== null, 3) + b(detailed, 3),
    customer:
      50 + b(s.pain, 12) - b(s.subscription, 6) - b(s.crypto, 14) - b(s.hardware, 6) - b(s.app, 3) - b(s.social, 3) +
      b(s.audience, 5) - b(vague, 10) - b(s.regulated, 3) + b(detailed, 3),
  };
  const out = {} as Record<PersonaId, number>;
  for (const id of PERSONA_ORDER) out[id] = Math.max(8, Math.min(92, clampScore(raw[id] + jitter())));
  return out;
}

function buildTake(id: PersonaId, score: number, s: Signals, ctx: Ctx, rng: Rng): PersonaTake {
  const script = SCRIPTS[id];
  const band = score < 45 ? "low" : score < 70 ? "mid" : "high";
  const specific = shuffle(matching(script.points, s), rng).slice(0, 2);
  const generic = shuffle(script.genericPoints, rng);
  const points = [...specific, ...generic].slice(0, 3).map((p) => fill(p, ctx));

  return {
    persona: id,
    score,
    headline: fill(pick(script.headlines[band], rng), ctx),
    points,
    strength: fill(pick([...matching(script.strengths, s), ...script.genericStrengths].slice(0, 3), rng), ctx),
    weakness: fill(pick([...matching(script.weaknesses, s), ...script.genericWeaknesses].slice(0, 3), rng), ctx),
  };
}

function buildDebate(takes: PersonaTake[], verdict: Verdict, ctx: Ctx) {
  const sorted = [...takes].sort((a, b) => a.score - b.score);
  const attacker = sorted[0].persona;
  const chimer = sorted[1].persona;
  const settler = sorted[2].persona;
  const defender = sorted[3].persona;
  const names = { a: PERSONAS[attacker].name, d: PERSONAS[defender].name };
  return [
    { speaker: attacker, line: fill(SCRIPTS[attacker].attack, ctx, names) },
    { speaker: defender, line: fill(SCRIPTS[defender].defend, ctx, names) },
    { speaker: chimer, line: fill(SCRIPTS[chimer].chime, ctx, names) },
    { speaker: attacker, line: fill(SCRIPTS[attacker].retort, ctx, names) },
    { speaker: settler, line: fill(SCRIPTS[settler].settle[verdict], ctx, names) },
  ];
}

function contextFor(idea: string, s: Signals): Ctx {
  const market = MARKETS[s.b2b ? "b2b" : (s.category ?? "default")];
  return {
    ...market,
    // If the pitch names its own audience, the panel uses it.
    audience: s.forWhom ?? market.audience,
    niche: s.forWhom && s.forWhom.split(" ").length >= 3 ? s.forWhom : market.niche,
    x: s.uberFor ?? "everything",
    title: deriveTitle(idea, s),
  };
}

export function demoRoast(idea: string): Roast {
  const s = analyzeIdea(idea);
  const rng = createRng(hashString(idea.trim().toLowerCase()));
  const ctx = contextFor(idea, s);
  const scores = personaScores(s, rng);
  const takes = PERSONA_ORDER.map((id) => buildTake(id, scores[id], s, ctx, rng));

  // The normaliser recomputes these too; we need the verdict up front to pick the right copy.
  const verdict = verdictFor(overallScore(scores));
  const byScoreDesc = [...takes].sort((a, b) => b.score - a.score);

  return normalizeRoast(
    {
      title: ctx.title,
      summary: cleanText(idea.split(/(?<=[.!?])\s/)[0], 220),
      takes,
      debate: buildDebate(takes, verdict, ctx),
      strengths: byScoreDesc.map((t) => t.strength).slice(0, 3),
      weaknesses: [...byScoreDesc].reverse().map((t) => t.weakness).slice(0, 3),
      biggestRisk: fill(matching(RISKS, s)[0] ?? DEFAULT_RISK, ctx),
      biggestOpportunity: fill(pick([...matching(OPPORTUNITIES, s).slice(0, 2), DEFAULT_OPPORTUNITY], rng), ctx),
      closingLine: pick(CLOSING_LINES[verdict], rng),
    },
    "demo",
  );
}

interface CandidateChange extends FixChange {
  priority: number;
  /** How this change reads inside the rewritten pitch. */
  pitchLine: string;
}

function fixCandidates(s: Signals, ctx: Ctx, roast: Roast): CandidateChange[] {
  const score = (id: PersonaId) => roast.takes.find((t) => t.persona === id)?.score ?? 50;
  const c: CandidateChange[] = [];

  c.push(
    s.audience
      ? {
          area: "Target customer",
          before: `A broad audience of ${ctx.audience}.`,
          after: `Launch only for ${ctx.niche} — the most desperate slice, already hacking together a workaround.`,
          why: "HYPE needs a tribe, not a demographic. The most desperate users forgive a rough v1 and tell their friends.",
          persona: "marketer",
          priority: 100 - score("marketer"),
          pitchLine: "",
        }
      : {
          area: "Target customer",
          before: "Aimed at everyone, which in practice means no one.",
          after: `Launch for ${ctx.niche}: people who feel this pain weekly and gather in the same online spaces.`,
          why: "HYPE couldn't market to 'people'. A niche gives you a message, a channel and word of mouth.",
          persona: "marketer",
          priority: 110 - score("marketer"),
          pitchLine: "",
        },
  );

  c.push({
    area: "Business model",
    before: s.monetization ? "A pricing idea that hasn't met a real customer yet." : "No clear way to make money.",
    after: s.marketplace
      ? "Take a commission only on completed bookings, and seed supply yourself in one location before scaling."
      : s.subscription
        ? "Offer a one-off option alongside an annual plan, so the price matches how often people actually need it."
        : "Charge from day one with a simple paid tier, and a free first use that proves the value in under a minute.",
    why: s.subscription
      ? "WALLET is subscription-fatigued; flexible pricing lowers the bar while STERLING still gets recurring revenue."
      : "STERLING couldn't find slide nine. Charging early proves demand better than any survey.",
    persona: "investor",
    priority: (s.monetization ? 70 : 120) - score("investor"),
    pitchLine: s.marketplace
      ? "We only earn when a booking completes, and we seed supply ourselves in one location first."
      : s.subscription
        ? "Pricing matches real usage: a one-off option for the curious and an annual plan for the committed."
        : "We charge from day one, with a free first use that proves the value in under a minute.",
  });

  c.push({
    area: "MVP scope",
    before: s.hardware
      ? "Custom hardware from day one."
      : s.crypto
        ? "Built on a blockchain."
        : "A full-featured product before anyone has used it.",
    after: s.hardware
      ? "Prototype the experience with an app and off-the-shelf devices before designing anything custom."
      : s.crypto
        ? "Drop the blockchain. Use a normal database and card payments; add verifiable records only if users ask."
        : s.ai
          ? "Use AI behind the scenes to deliver a finished result, with a human check on anything high-stakes."
          : "A two-week, mostly manual MVP: a landing page, a form, and you delivering the result by hand to the first 20 users.",
    why: "KERNEL wanted 80% of the scope cut. Doing it manually first tells you exactly what's worth automating.",
    persona: "engineer",
    priority: (s.hardware || s.crypto ? 120 : 90) - score("engineer"),
    pitchLine: s.hardware
      ? "We prove the experience with an app and off-the-shelf devices before building anything custom."
      : s.crypto
        ? "No blockchain, no tokens — just a product that works and takes normal payments."
        : s.ai
          ? "AI works behind the scenes to deliver a finished result, with a human check on anything high-stakes."
          : "Version one is a two-week, mostly manual service: we deliver results by hand to the first 20 customers and automate only what they actually use.",
  });

  c.push({
    area: "First experience",
    before: s.app ? "Download an app, sign up, then maybe see value." : "Sign up first, see value later.",
    after: s.app
      ? "A mobile-friendly web app with no download: try the core action instantly, sign up only to save the result."
      : "Value before sign-up: let people try the core action instantly, then ask them to save their result.",
    why: "WALLET won't fill in a form before seeing value. Removing friction is the cheapest growth there is.",
    persona: "customer",
    priority: 100 - score("customer"),
    pitchLine: "Anyone can try the core action instantly, no download and no sign-up wall.",
  });

  c.push({
    area: "Distribution",
    before: "'If we build it, they will come.'",
    after: `One owned channel: ${ctx.channel}, with content showing the before-and-after moment.`,
    why: "HYPE asked where user number one thousand comes from. One channel done well beats five done badly.",
    persona: "marketer",
    priority: 75 - score("marketer"),
    pitchLine: `Growth comes from one channel we can own: ${ctx.channel}.`,
  });

  if (s.ai || !s.hardware) {
    c.push({
      area: "Defensibility",
      before: "Nothing stops a copycat.",
      after: `Build a moat from niche data and reputation: every use makes the product smarter for ${ctx.niche}.`,
      why: "STERLING asked what stops a clone. Proprietary data and a loyal niche take years to copy.",
      persona: "investor",
      priority: (s.ai ? 85 : 65) - score("investor"),
      pitchLine: "Every customer makes the product smarter for the next, building a data moat copycats can't shortcut.",
    });
  }
  return c;
}

export function demoFix(idea: string, roast: Roast): FixResult {
  const s = analyzeIdea(idea);
  const rng = createRng(hashString(`fix:${idea.trim().toLowerCase()}`));
  const ctx = contextFor(idea, s);

  // Highest-priority changes first, but never more than two for the same persona.
  const counts: Partial<Record<PersonaId, number>> = {};
  const changes = fixCandidates(s, ctx, roast)
    .sort((a, b) => b.priority - a.priority)
    .filter((ch) => {
      counts[ch.persona] = (counts[ch.persona] ?? 0) + 1;
      return (counts[ch.persona] ?? 0) <= 2;
    })
    .slice(0, 4);

  const addressed = new Set(changes.map((ch) => ch.persona));
  const projectedScores = {} as Record<PersonaId, number>;
  for (const take of roast.takes) {
    const lift = addressed.has(take.persona) ? 12 + Math.round(rng() * 10) : 4 + Math.round(rng() * 5);
    projectedScores[take.persona] = Math.min(90, take.score + lift);
  }

  const title = `${roast.title} 2.0`;
  const pitch = [
    `${title} starts small and specific.`,
    s.forWhom && ctx.niche === s.forWhom
      ? `We're launching for ${ctx.niche} — and only them, at first.`
      : `Instead of chasing ${ctx.audience === "people" ? "everyone" : `all ${ctx.audience}`}, we're launching for ${ctx.niche}.`,
    ...changes.map((ch) => ch.pitchLine).filter(Boolean),
    "Once we own this niche, the data and reputation we build let us expand.",
  ].join(" ");

  return normalizeFix(
    {
      title,
      tagline: `The same insight, rebuilt for ${ctx.niche}.`,
      pitch,
      changes: changes.map(({ area, before, after, why, persona }) => ({ area, before, after, why, persona })),
      firstSteps: [
        `Interview ten ${ctx.niche} and ask how they deal with this today — and what it costs them.`,
        `Put up a one-page site with a price on it and drive 200 visitors from ${ctx.channel.split(" and ")[0]}. Count sign-ups, not likes.`,
        "Deliver the result by hand for the first five customers. Write down every step you'd hate to repeat — that's your roadmap.",
      ],
      projectedScores,
    },
    "demo",
  );
}

export class DemoProvider implements RoastProvider {
  readonly name = "demo";
  readonly mode = "demo" as const;

  async roast(idea: string): Promise<Roast> {
    return demoRoast(idea);
  }

  async fix(idea: string, roast: Roast): Promise<FixResult> {
    return demoFix(idea, roast);
  }
}
