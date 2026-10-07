"use client";

import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { useState } from "react";
import { PERSONAS } from "@/lib/personas";
import { VERDICT_COPY } from "@/lib/scoring";
import type { PersonaTake, Roast } from "@/lib/types";
import { Button } from "../ui/Button";
import { PersonaSigil } from "../ui/PersonaSigil";
import { CountUp, ScoreRing } from "../ui/Score";

const rise = (delay: number, reduced: boolean | null) => ({
  initial: reduced ? false : ({ opacity: 0, y: 28 } as const),
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { delay, duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
});

export function Results({
  roast,
  delay = 0,
  onFix,
  onShare,
  onRestart,
  onReplay,
}: {
  roast: Roast;
  delay?: number;
  onFix: () => void;
  onShare: () => void;
  onRestart: () => void;
  onReplay: () => void;
}) {
  const reduced = useReducedMotion();
  const v = VERDICT_COPY[roast.verdict];

  return (
    <section id="breakdown" aria-label="Full breakdown" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 pb-28 sm:px-8 sm:pb-20">
      {/* Primary actions — sticky on small screens so they're always in reach */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="sticky bottom-3 z-30 mx-auto mb-16 flex w-full max-w-2xl gap-2 rounded-full border border-white/10 bg-[#0b0b10]/80 p-2 shadow-[0_20px_60px_-20px_black] backdrop-blur-xl sm:static sm:gap-3 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none sm:backdrop-blur-none"
      >
        <Button variant="primary" onClick={onFix} className="flex-[1.4] whitespace-nowrap !px-3 font-display !text-[15px] !tracking-[0.06em] sm:!text-lg">
          Fix my idea
        </Button>
        <Button onClick={onShare} className="flex-1 !px-3">
          Share
        </Button>
        <Button onClick={onRestart} className="flex-1 !px-3">
          <span className="sm:hidden">New</span>
          <span className="hidden sm:inline">Roast another</span>
        </Button>
      </motion.div>

      <motion.div {...rise(0, reduced)} className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">The scorecards</p>
          <h3 className="mt-1 font-display text-4xl uppercase leading-none sm:text-5xl">How they voted</h3>
        </div>
        <button onClick={onReplay} className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted transition hover:text-bone">
          ↺ Replay the trial
        </button>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {roast.takes.map((take, i) => (
          <motion.div key={take.persona} {...rise(i * 0.08, reduced)}>
            <PersonaCard take={take} />
          </motion.div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <motion.div {...rise(0, reduced)}>
          <ListCard title="What's working" items={roast.strengths} tone="good" />
        </motion.div>
        <motion.div {...rise(0.08, reduced)}>
          <ListCard title="What's broken" items={roast.weaknesses} tone="bad" />
        </motion.div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <motion.div {...rise(0, reduced)}>
          <BigCallout label="Biggest risk" text={roast.biggestRisk} color="#ff3b3b" rgb="255 59 59" icon="risk" />
        </motion.div>
        <motion.div {...rise(0.08, reduced)}>
          <BigCallout label="Biggest opportunity" text={roast.biggestOpportunity} color="#2bff88" rgb="43 255 136" icon="opportunity" />
        </motion.div>
      </div>

      <motion.div
        {...rise(0, reduced)}
        className="relative mt-16 overflow-hidden rounded-3xl border p-8 text-center sm:p-12"
        style={{ borderColor: `rgb(${v.rgb} / 0.35)`, background: `radial-gradient(ellipse at 50% 0%, rgb(${v.rgb} / 0.18), transparent 70%)` }}
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">Not the end of the story</p>
        <h3 className="mx-auto mt-3 max-w-2xl font-display text-[clamp(2rem,5vw,3.5rem)] uppercase leading-[0.95]">
          {roast.verdict === "BUILD" ? "Make a good idea bulletproof" : roast.verdict === "FIX" ? "Let the panel fix it" : "Rise from the ashes"}
        </h3>
        <p className="mx-auto mt-4 max-w-xl text-muted">
          FIX IT rebuilds your idea around every objection the panel raised — new target customer, business model and launch plan — and
          predicts how they&apos;d score version 2.
        </p>
        <Button variant="primary" onClick={onFix} className="mt-8 font-display !text-lg !tracking-[0.08em]">
          Fix my idea →
        </Button>
      </motion.div>

      {roast.mode === "demo" && (
        <p className="mt-10 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
          Demo panel · scripted offline engine · connect an AI provider for fully bespoke roasts
        </p>
      )}
    </section>
  );
}

function PersonaCard({ take }: { take: PersonaTake }) {
  const p = PERSONAS[take.persona];
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const rx = useSpring(useMotionValue(0), { stiffness: 200, damping: 20 });
  const ry = useSpring(useMotionValue(0), { stiffness: 200, damping: 20 });
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const glare = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgb(${p.rgb} / 0.22), transparent 55%)`;

  return (
    <motion.article
      onPointerMove={(e) => {
        if (reduced || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        ry.set((px - 0.5) * 10);
        rx.set(-(py - 0.5) * 10);
        gx.set(px * 100);
        gy.set(py * 100);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0c12]/80 p-5 backdrop-blur-md"
    >
      <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: glare }} />
      <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${p.color}, transparent)` }} />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PersonaSigil persona={take.persona} size={46} />
          <div className="min-w-0">
            <p className="font-display text-xl leading-none tracking-wide" style={{ color: p.color }}>
              {p.name}
            </p>
            <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.2em] text-muted">{p.role}</p>
          </div>
        </div>
        <ScoreRing score={take.score} size={58} stroke={4} delay={0.3}>
          <CountUp value={take.score} delay={0.3} className="font-display text-lg" />
        </ScoreRing>
      </div>
      <p className="relative mt-5 flex-1 text-[15px] font-medium leading-snug text-bone">“{take.headline}”</p>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative overflow-hidden"
          >
            <ul className="mt-4 space-y-3 border-t border-white/[0.07] pt-4 text-sm leading-relaxed text-bone/75">
              {take.points.map((pt) => (
                <li key={pt} className="flex gap-2">
                  <span style={{ color: p.color }}>›</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-2 text-sm">
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-[0.25em] text-build">Best thing</dt>
                <dd className="text-bone/80">{take.strength}</dd>
              </div>
              <div>
                <dt className="font-mono text-[9px] uppercase tracking-[0.25em] text-kill">Worst thing</dt>
                <dd className="text-bone/80">{take.weakness}</dd>
              </div>
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="relative mt-4 self-start font-mono text-[10px] uppercase tracking-[0.25em] text-muted transition hover:text-bone"
      >
        {open ? "− Less" : "+ Full testimony"}
      </button>
    </motion.article>
  );
}

function ListCard({ title, items, tone }: { title: string; items: string[]; tone: "good" | "bad" }) {
  const color = tone === "good" ? "text-build" : "text-kill";
  return (
    <div className="h-full rounded-2xl border border-white/[0.08] bg-[#0c0c12]/70 p-6 backdrop-blur-md">
      <p className={`font-mono text-[11px] uppercase tracking-[0.3em] ${color}`}>{title}</p>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-bone/85">
            <span className={`mt-0.5 font-mono text-sm ${color}`} aria-hidden>
              {tone === "good" ? "+" : "−"}
            </span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BigCallout({ label, text, color, rgb, icon }: { label: string; text: string; color: string; rgb: string; icon: "risk" | "opportunity" }) {
  return (
    <div
      className="relative h-full overflow-hidden rounded-2xl border p-6 sm:p-8"
      style={{ borderColor: `rgb(${rgb} / 0.3)`, background: `linear-gradient(135deg, rgb(${rgb} / 0.12), transparent 60%)` }}
    >
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-full" style={{ background: `rgb(${rgb} / 0.15)`, color }}>
          {icon === "risk" ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M12 3 2 21h20L12 3z" />
              <path d="M12 10v5M12 18h.01" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M3 17 9 11l4 4 8-8" />
              <path d="M15 7h6v6" />
            </svg>
          )}
        </span>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em]" style={{ color }}>
          {label}
        </p>
      </div>
      <p className="mt-4 text-lg font-medium leading-snug text-bone sm:text-xl">{text}</p>
    </div>
  );
}
