"use client";

import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { PERSONAS } from "@/lib/personas";
import { sfx } from "@/lib/sfx";
import type { PersonaTake, Roast } from "@/lib/types";
import { useAccent } from "../ui/Atmosphere";
import { Button } from "../ui/Button";
import { PersonaSigil } from "../ui/PersonaSigil";
import { CountUp, ScoreRing } from "../ui/Score";
import { Typewriter } from "../ui/Typewriter";

const READ_TIME = 6; // seconds a finished testimony stays up before auto-advancing

export function Trial({ roast, onComplete, onSkip }: { roast: Roast; onComplete: () => void; onSkip: () => void }) {
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [paused, setPaused] = useState(false);
  const take = roast.takes[index];
  const persona = PERSONAS[take.persona];
  const reduced = useReducedMotion();
  const timer = useMotionValue(0);
  const last = index === roast.takes.length - 1;

  useAccent(persona.rgb);

  const next = useCallback(() => {
    if (last) onComplete();
    else {
      sfx.play("whoosh");
      setDone(false);
      timer.set(0);
      setIndex((i) => i + 1);
    }
  }, [last, onComplete, timer]);

  // Auto-advance once a testimony has fully landed, unless the viewer is hovering/reading.
  useEffect(() => {
    if (!done || paused) return;
    const controls = animate(timer, 1, {
      duration: READ_TIME * (1 - timer.get()),
      ease: "linear",
      onComplete: next,
    });
    return () => controls.stop();
  }, [done, paused, next, timer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-4 pb-10 pt-6 sm:px-8 sm:pt-10">
      {/* Progress */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <p className="shrink-0 font-mono text-[11px] uppercase tracking-[0.3em] text-muted">
          Testimony <span className="text-bone">{String(index + 1).padStart(2, "0")}</span>/04
        </p>
        <div className="order-last flex basis-full gap-1.5 sm:order-none sm:flex-1 sm:basis-auto" aria-hidden>
          {roast.takes.map((t, i) => (
            <Segment key={t.persona} state={i < index ? "done" : i === index ? "active" : "todo"} color={PERSONAS[t.persona].color} timer={timer} />
          ))}
        </div>
        <button onClick={onSkip} className="ml-auto shrink-0 font-mono text-[11px] uppercase tracking-[0.2em] text-muted transition hover:text-bone">
          Skip to verdict →
        </button>
      </div>

      {/* Light sweep on each new witness */}
      {!reduced && (
        <motion.div
          key={`sweep-${index}`}
          aria-hidden
          className="pointer-events-none fixed inset-y-0 z-30 w-[40vw]"
          style={{ background: `linear-gradient(90deg, transparent, rgb(${persona.rgb} / 0.18), transparent)` }}
          initial={{ left: "-40vw" }}
          animate={{ left: "110vw" }}
          transition={{ duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
        />
      )}

      <AnimatePresence mode="wait">
        <motion.section
          key={take.persona}
          initial={reduced ? false : { opacity: 0, x: 60, filter: "blur(14px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, x: -60, filter: "blur(14px)" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          aria-label={`${persona.name}, ${persona.role}`}
          className="mt-8 grid gap-8 sm:mt-12 lg:grid-cols-[0.8fr_1.4fr] lg:gap-14"
        >
          <Identity take={take} />
          <Testimony take={take} onDone={() => setDone(true)} />
        </motion.section>
      </AnimatePresence>

      <div className="mt-10 flex items-center justify-end gap-3">
        <span className="hidden font-mono text-[10px] uppercase tracking-[0.25em] text-dim sm:inline">{paused && done ? "Paused while you read" : "→ key to advance"}</span>
        <Button variant={done ? "primary" : "secondary"} onClick={next}>
          {last ? "The panel deliberates" : "Next witness"}
          <span aria-hidden>→</span>
        </Button>
      </div>
    </div>
  );
}

function Segment({ state, color, timer }: { state: "done" | "active" | "todo"; color: string; timer: ReturnType<typeof useMotionValue<number>> }) {
  const width = useTransform(timer, (v) => `${Math.max(8, v * 100)}%`);
  return (
    <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
      {state === "done" && <div className="absolute inset-0" style={{ background: color }} />}
      {state === "active" && <motion.div className="absolute inset-y-0 left-0" style={{ background: color, width, boxShadow: `0 0 10px ${color}` }} />}
    </div>
  );
}

function Identity({ take }: { take: PersonaTake }) {
  const p = PERSONAS[take.persona];
  return (
    <div className="flex items-center gap-5 lg:flex-col lg:items-start lg:gap-6">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 140, damping: 16, delay: 0.1 }}>
        <PersonaSigil persona={take.persona} size={160} active className="hidden lg:block" />
        <PersonaSigil persona={take.persona} size={84} active className="lg:hidden" />
      </motion.div>
      <div className="min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">{p.role}</p>
        <h2
          className="mt-2 font-display text-[clamp(3.2rem,10vw,7rem)] uppercase leading-[0.9] tracking-wide"
          style={{ color: p.color, textShadow: `0 0 50px rgb(${p.rgb} / 0.45)` }}
        >
          {p.name}
        </h2>
        <p className="mt-3 max-w-xs text-sm text-muted lg:text-base">{p.tagline}</p>
      </div>
    </div>
  );
}

function Testimony({ take, onDone }: { take: PersonaTake; onDone: () => void }) {
  const p = PERSONAS[take.persona];
  const [headlineDone, setHeadlineDone] = useState(false);
  const [scoreShown, setScoreShown] = useState(false);
  const pointDelay = 0.85;
  const reduced = useReducedMotion();
  const finishedRef = useRef(false);

  // Score lands after the last argument.
  useEffect(() => {
    if (!headlineDone) return;
    const t = setTimeout(() => setScoreShown(true), reduced ? 0 : (take.points.length * pointDelay + 0.4) * 1000);
    return () => clearTimeout(t);
  }, [headlineDone, take.points.length, reduced]);

  return (
    <div className="flex flex-col">
      <blockquote
        className="relative border-l-2 pl-5 text-[clamp(1.5rem,3.4vw,2.6rem)] font-medium leading-[1.15] tracking-[-0.01em] text-bone sm:pl-7"
        style={{ borderColor: p.color }}
      >
        <span aria-hidden className="absolute -left-1 -top-6 font-display text-6xl leading-none opacity-40" style={{ color: p.color }}>
          “
        </span>
        <Typewriter text={take.headline} cps={42} delay={0.45} onDone={() => setHeadlineDone(true)} />
      </blockquote>

      <ol className="mt-8 space-y-4">
        {take.points.map((point, i) => (
          <motion.li
            key={point}
            initial={{ opacity: 0, clipPath: "inset(0 100% 0 0)", y: 6 }}
            animate={headlineDone ? { opacity: 1, clipPath: "inset(0 0% 0 0)", y: 0 } : undefined}
            transition={{ delay: reduced ? 0 : i * pointDelay, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="flex gap-4 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 backdrop-blur-sm sm:p-5"
          >
            <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: p.color }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="text-[15px] leading-relaxed text-bone/85 sm:text-base">{point}</p>
          </motion.li>
        ))}
      </ol>

      <AnimatePresence>
        {scoreShown && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="mt-8 flex items-center gap-5"
          >
            <ScoreRing score={take.score} size={84} stroke={6} color={p.color}>
              <CountUp
                value={take.score}
                className="font-display text-3xl"
                onTick={(n) => n % 4 === 0 && sfx.play("tick")}
                onDone={() => {
                  if (!finishedRef.current) {
                    finishedRef.current = true;
                    onDone();
                  }
                }}
              />
            </ScoreRing>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted">{p.name}&apos;s score</p>
              <p className="mt-1 font-display text-2xl uppercase tracking-wide text-bone">
                {take.score < 45 ? "Wants it dead" : take.score < 72 ? "Wants changes" : "Would back it"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
