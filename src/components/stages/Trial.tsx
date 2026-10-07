"use client";

import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveRoast, LiveTake } from "@/lib/live-roast";
import { PERSONAS, PERSONA_ORDER } from "@/lib/personas";
import { sfx } from "@/lib/sfx";
import type { PersonaId } from "@/lib/types";
import { useAccent } from "../ui/Atmosphere";
import { Button } from "../ui/Button";
import { PersonaSigil } from "../ui/PersonaSigil";
import { CountUp, ScoreRing } from "../ui/Score";
import { Typewriter } from "../ui/Typewriter";

const READ_TIME = 6; // seconds a finished testimony stays up before auto-advancing

/**
 * The four testimonies. Takes come from the live stream: a witness can take the
 * stand while their testimony is still being written, and their words type out
 * as they arrive. The score only lands once their take is complete.
 */
export function Trial({ live, onComplete, onSkip }: { live: LiveRoast; onComplete: () => void; onSkip: () => void }) {
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const timer = useMotionValue(0);
  const last = index === 3;
  const streaming = !live.roast;

  // Who sits in each seat: whoever the panel delivered, then the rest in the usual order.
  const seats = useMemo<PersonaId[]>(() => {
    const delivered = live.takes.map((t) => t.persona);
    return [...delivered, ...PERSONA_ORDER.filter((id) => !delivered.includes(id))].slice(0, 4);
  }, [live.takes]);
  const personaId = seats[index];
  const persona = PERSONAS[personaId];
  const take = live.takes[index];

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
        <p className="flex shrink-0 items-center gap-3 font-mono text-[11px] uppercase tracking-[0.3em] text-muted">
          <span>
            Testimony <span className="text-bone">{String(index + 1).padStart(2, "0")}</span>/04
          </span>
          {streaming && <LiveBadge />}
        </p>
        <div className="order-last flex basis-full gap-1.5 sm:order-none sm:flex-1 sm:basis-auto" aria-hidden>
          {seats.map((id, i) => (
            <Segment key={i} state={i < index ? "done" : i === index ? "active" : "todo"} color={PERSONAS[id].color} timer={timer} />
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
          key={`${live.generation}-${index}`}
          initial={reduced ? false : { opacity: 0, x: 60, filter: "blur(14px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, x: -60, filter: "blur(14px)" }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          aria-label={`${persona.name}, ${persona.role}`}
          className="mt-8 grid gap-8 sm:mt-12 lg:grid-cols-[0.8fr_1.4fr] lg:gap-14"
        >
          <Identity persona={personaId} />
          {take && (take.headline || take.final) ? (
            <Testimony take={take} onDone={() => setDone(true)} />
          ) : (
            <Waiting persona={personaId} />
          )}
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

export function LiveBadge({ label = "Live" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-kill/40 bg-kill/10 px-2 py-0.5 text-[9px] tracking-[0.25em] text-kill">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-kill" />
      {label}
    </span>
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

function Identity({ persona }: { persona: PersonaId }) {
  const p = PERSONAS[persona];
  return (
    <div className="flex items-center gap-5 lg:flex-col lg:items-start lg:gap-6">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 140, damping: 16, delay: 0.1 }}>
        <PersonaSigil persona={persona} size={160} active className="hidden lg:block" />
        <PersonaSigil persona={persona} size={84} active className="lg:hidden" />
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

/** Shown while a witness is on the stand but hasn't started speaking yet. */
function Waiting({ persona }: { persona: PersonaId }) {
  const p = PERSONAS[persona];
  return (
    <div className="flex flex-col justify-center" aria-live="polite">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">
        {p.name} is gathering their thoughts
      </p>
      <div className="mt-6 flex gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-3 w-3 rounded-full"
            style={{ background: p.color, boxShadow: `0 0 14px ${p.color}` }}
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -6, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}

function Testimony({ take, onDone }: { take: LiveTake; onDone: () => void }) {
  const p = PERSONAS[take.persona];
  const final = take.final;
  const headline = final?.headline ?? take.headline;
  const points = final?.points ?? take.points;
  // How many pieces have finished typing: 0 = headline still typing, n = headline + (n - 1) points.
  const [typed, setTyped] = useState(0);
  const markTyped = (n: number) => setTyped((t) => Math.max(t, n));
  const finishedRef = useRef(false);
  const scoreShown = !!final && typed >= final.points.length + 1;

  return (
    <div className="flex flex-col">
      {!final && (
        <p className="mb-4 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-muted">
          <LiveBadge label="Speaking" />
        </p>
      )}
      <blockquote
        className="relative border-l-2 pl-5 text-[clamp(1.5rem,3.4vw,2.6rem)] font-medium leading-[1.15] tracking-[-0.01em] text-bone sm:pl-7"
        style={{ borderColor: p.color }}
      >
        <span aria-hidden className="absolute -left-1 -top-6 font-display text-6xl leading-none opacity-40" style={{ color: p.color }}>
          “
        </span>
        <Typewriter text={headline} cps={42} delay={0.45} streaming={!final && !take.headlineDone} onDone={() => markTyped(1)} />
      </blockquote>

      <ol className="mt-8 space-y-4">
        {points.map((point, i) =>
          typed >= i + 1 ? (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="flex gap-4 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 backdrop-blur-sm sm:p-5"
            >
              <span className="font-mono text-xs font-semibold tabular-nums" style={{ color: p.color }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <p className="text-[15px] leading-relaxed text-bone/85 sm:text-base">
                <Typewriter text={point} cps={95} caret streaming={!final && i >= take.pointsDone} onDone={() => markTyped(i + 2)} />
              </p>
            </motion.li>
          ) : null,
        )}
      </ol>

      <AnimatePresence>
        {scoreShown && final && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
            className="mt-8 flex items-center gap-5"
          >
            <ScoreRing score={final.score} size={84} stroke={6} color={p.color}>
              <CountUp
                value={final.score}
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
                {final.score < 45 ? "Wants it dead" : final.score < 72 ? "Wants changes" : "Would back it"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
