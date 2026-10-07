"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { PERSONAS, PERSONA_ORDER } from "@/lib/personas";
import { VERDICT_COPY } from "@/lib/scoring";
import type { FixResult, Roast } from "@/lib/types";
import { useAccent } from "../ui/Atmosphere";
import { Button } from "../ui/Button";
import { PersonaSigil } from "../ui/PersonaSigil";
import { CountUp } from "../ui/Score";

const ease = [0.16, 1, 0.3, 1] as const;

export function FixResultView({
  roast,
  fix,
  onRetrial,
  onBack,
  onRestart,
}: {
  roast: Roast;
  fix: FixResult;
  onRetrial: (pitch: string) => void;
  onBack: () => void;
  onRestart: () => void;
}) {
  const reduced = useReducedMotion();
  const before = VERDICT_COPY[roast.verdict];
  const after = VERDICT_COPY[fix.projectedVerdict];
  const delta = fix.projectedOverall - roast.overall;
  const [copied, setCopied] = useState(false);
  useAccent(after.rgb);

  const enter = (delay: number) => ({
    initial: reduced ? false : ({ opacity: 0, y: 26, filter: "blur(8px)" } as const),
    animate: { opacity: 1, y: 0, filter: "blur(0px)" },
    transition: { delay, duration: 0.8, ease },
  });
  const inView = (delay = 0) => ({
    initial: reduced ? false : ({ opacity: 0, y: 26 } as const),
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-60px" },
    transition: { delay, duration: 0.7, ease },
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${fix.title}\n${fix.tagline}\n\n${fix.pitch}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the pitch is still selectable on screen */
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <motion.p {...enter(0)} className="text-center font-mono text-[11px] uppercase tracking-[0.35em] text-muted">
        Idea 2.0 · rebuilt from the panel&apos;s objections
      </motion.p>

      <div className="mt-5 text-center">
        <motion.p {...enter(0.1)} className="relative inline-block font-display text-xl uppercase tracking-wide text-dim sm:text-2xl">
          {roast.title}
          <motion.span
            aria-hidden
            className="absolute left-0 top-1/2 h-[3px] w-full origin-left bg-kill"
            initial={reduced ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.6, duration: 0.5, ease }}
          />
        </motion.p>
        <motion.h1
          {...enter(0.9)}
          className="mx-auto mt-2 max-w-4xl font-display text-[clamp(2.6rem,8vw,6rem)] uppercase leading-[0.9] text-shadow-glow"
          style={{ color: after.color }}
        >
          {fix.title}
        </motion.h1>
        <motion.p {...enter(1.1)} className="mx-auto mt-4 max-w-2xl text-lg text-bone/80 sm:text-xl">
          {fix.tagline}
        </motion.p>
      </div>

      {/* Before → after score */}
      <motion.div {...enter(1.3)} className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-4 sm:gap-8">
        <div className="text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Before</p>
          <p className="font-display text-6xl leading-none text-dim sm:text-7xl">{roast.overall}</p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: before.color }}>
            {before.label}
          </p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <motion.svg width="64" height="24" viewBox="0 0 64 24" fill="none" aria-hidden className="text-muted">
            <motion.path
              d="M2 12h56M50 4l8 8-8 8"
              stroke="currentColor"
              strokeWidth="2"
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 1.6, duration: 0.6 }}
            />
          </motion.svg>
          <span
            className="rounded-full px-3 py-1 font-mono text-xs font-semibold"
            style={{ background: `rgb(${after.rgb} / 0.15)`, color: after.color }}
          >
            {delta >= 0 ? "+" : ""}
            {delta} projected
          </span>
        </div>
        <div className="text-center">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted">After</p>
          <p className="font-display text-6xl leading-none sm:text-7xl" style={{ color: after.color, textShadow: `0 0 40px rgb(${after.rgb} / 0.6)` }}>
            <CountUp value={fix.projectedOverall} from={roast.overall} delay={1.7} duration={1.6} />
          </p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.25em]" style={{ color: after.color }}>
            {after.label}
          </p>
        </div>
      </motion.div>

      {/* The new pitch */}
      <motion.div {...enter(1.6)} className="glow-border mt-12 rounded-3xl bg-[#0c0c12]/85 p-6 backdrop-blur-xl sm:p-9" data-active="true">
        <div className="flex items-center justify-between gap-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">The new pitch</p>
          <button onClick={copy} className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted transition hover:text-bone" aria-live="polite">
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-4 text-lg leading-relaxed text-bone sm:text-xl">{fix.pitch}</p>
      </motion.div>

      {/* What changed */}
      <motion.h2 {...inView()} className="mt-16 font-display text-4xl uppercase leading-none sm:text-5xl">
        What changed — and why
      </motion.h2>
      <div className="mt-6 grid gap-4">
        {fix.changes.map((change, i) => {
          const p = PERSONAS[change.persona];
          return (
            <motion.article
              key={change.area + i}
              {...inView(i * 0.06)}
              className="grid gap-4 rounded-2xl border border-white/[0.08] bg-[#0c0c12]/75 p-5 backdrop-blur-md sm:grid-cols-[180px_1fr] sm:gap-6 sm:p-6"
            >
              <div className="flex items-center gap-3 sm:flex-col sm:items-start">
                <span className="font-display text-2xl uppercase leading-none tracking-wide">{change.area}</span>
                <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                  <PersonaSigil persona={change.persona} size={22} />
                  Answers <span style={{ color: p.color }}>{p.name}</span>
                </span>
              </div>
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-dim line-through decoration-kill/60">{change.before}</p>
                <p className="text-base font-medium leading-relaxed text-bone sm:text-lg">
                  <span className="mr-2" style={{ color: after.color }}>
                    →
                  </span>
                  {change.after}
                </p>
                <p className="text-sm leading-relaxed text-muted">{change.why}</p>
              </div>
            </motion.article>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Panel re-score */}
        <motion.div {...inView()} className="rounded-2xl border border-white/[0.08] bg-[#0c0c12]/75 p-6 backdrop-blur-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">Projected panel re-score</p>
          <ul className="mt-5 space-y-4">
            {PERSONA_ORDER.map((id) => {
              const p = PERSONAS[id];
              const old = roast.takes.find((t) => t.persona === id)?.score ?? 0;
              const next = fix.projectedScores[id];
              return (
                <li key={id}>
                  <div className="mb-1.5 flex items-center justify-between font-mono text-xs">
                    <span style={{ color: p.color }}>{p.name}</span>
                    <span className="tabular-nums text-muted">
                      {old} → <span className="text-bone">{next}</span>
                    </span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-white/20" style={{ width: `${old}%` }} />
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ background: p.color, boxShadow: `0 0 10px ${p.color}` }}
                      initial={reduced ? false : { width: `${old}%` }}
                      whileInView={{ width: `${next}%` }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3, duration: 1.2, ease }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </motion.div>

        {/* Next moves */}
        <motion.div {...inView(0.08)} className="rounded-2xl border border-white/[0.08] bg-[#0c0c12]/75 p-6 backdrop-blur-md">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">Your next three moves</p>
          <ol className="mt-5 space-y-4">
            {fix.firstSteps.map((step, i) => (
              <li key={step} className="flex gap-4">
                <span className="font-display text-3xl leading-none" style={{ color: after.color }}>
                  {i + 1}
                </span>
                <p className="text-[15px] leading-relaxed text-bone/85">{step}</p>
              </li>
            ))}
          </ol>
        </motion.div>
      </div>

      <motion.div {...inView()} className="mt-14 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Button variant="primary" onClick={() => onRetrial(fix.pitch)} className="w-full font-display !text-lg !tracking-[0.08em] sm:w-auto">
          Put version 2 on trial
        </Button>
        <Button onClick={onBack} className="w-full sm:w-auto">
          ← Back to verdict
        </Button>
        <Button variant="ghost" onClick={onRestart}>
          Roast another idea
        </Button>
      </motion.div>
      <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
        Projected scores are the panel&apos;s estimate, not a promise. Go prove them.
      </p>
    </div>
  );
}
