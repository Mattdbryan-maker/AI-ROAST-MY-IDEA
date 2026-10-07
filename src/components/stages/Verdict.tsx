"use client";

import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { VERDICT_COPY } from "@/lib/scoring";
import { sfx } from "@/lib/sfx";
import type { Roast } from "@/lib/types";
import { useAccent } from "../ui/Atmosphere";
import { CountUp, ScoreRing } from "../ui/Score";
import { Typewriter } from "../ui/Typewriter";
import { Results } from "./Results";

type Phase = "hush" | "count" | "slam" | "settled";

export function Verdict({
  roast,
  instant = false,
  onFix,
  onShare,
  onRestart,
  onReplay,
}: {
  roast: Roast;
  instant?: boolean;
  onFix: () => void;
  onShare: () => void;
  onRestart: () => void;
  onReplay: () => void;
}) {
  const reduced = useReducedMotion();
  const skip = instant || !!reduced;
  const [phase, setPhase] = useState<Phase>(skip ? "settled" : "hush");
  const shake = useAnimationControls();
  const v = VERDICT_COPY[roast.verdict];
  const [ringSize, setRingSize] = useState(260);

  useAccent(phase === "slam" || phase === "settled" ? v.rgb : "120 120 140");

  useEffect(() => {
    const update = () => setRingSize(window.innerWidth < 640 ? 210 : 280);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (phase !== "hush") return;
    const t = setTimeout(() => setPhase("count"), 2300);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "slam") return;
    sfx.play("boom");
    void shake.start({
      x: [0, -14, 12, -9, 7, -4, 2, 0],
      y: [0, 6, -5, 4, -2, 1, 0, 0],
      transition: { duration: 0.55, ease: "easeOut" },
    });
    const t = setTimeout(() => setPhase("settled"), 900);
    return () => clearTimeout(t);
  }, [phase, shake]);

  const revealed = phase === "slam" || phase === "settled";

  return (
    <motion.div animate={shake} className="relative w-full">
      {/* Hush: the room goes dark before the number */}
      <AnimatePresence>
        {phase === "hush" && (
          <motion.div
            key="hush"
            className="fixed inset-0 z-40 grid place-items-center bg-black/85 px-6 text-center backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
          >
            <div>
              <motion.div
                aria-hidden
                className="mx-auto mb-8 h-24 w-24 rounded-full"
                style={{ background: "radial-gradient(circle, rgb(255 77 46 / 0.8), transparent 70%)" }}
                animate={{ scale: [1, 1.35, 1, 1.5, 1], opacity: [0.4, 1, 0.4, 1, 0.3] }}
                transition={{ duration: 2.1, times: [0, 0.15, 0.4, 0.55, 1] }}
              />
              <p className="font-mono text-xs uppercase tracking-[0.5em] text-muted">All rise</p>
              <h1 className="mt-4 font-display text-[clamp(2.2rem,7vw,5rem)] uppercase leading-[0.95]">
                <Typewriter text="The panel has reached a decision" cps={26} caret={false} />
              </h1>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Flash + shockwave on the slam */}
      <AnimatePresence>
        {phase === "slam" && (
          <motion.div
              key="flash"
              aria-hidden
              className="pointer-events-none fixed inset-0 z-40"
              style={{ background: `radial-gradient(circle at 50% 55%, ${v.color}, white 60%)` }}
              initial={{ opacity: 0.85 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
        )}
      </AnimatePresence>

      <section className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-5xl flex-col items-center justify-center px-4 py-10 text-center sm:px-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-muted">The verdict on</p>
        <h2 className="mt-2 max-w-3xl font-display text-[clamp(1.6rem,4.5vw,3rem)] uppercase leading-none tracking-wide text-bone">
          {roast.title}
        </h2>

        <div className="relative mt-8">
          {phase !== "hush" && (
            <ScoreRing score={roast.overall} size={ringSize} stroke={10} duration={skip ? 0 : 2.6} delay={skip ? 0 : 0.2}>
              <div className="flex flex-col items-center">
                <span
                  className="font-display text-[clamp(5rem,16vw,8.5rem)] leading-none"
                  style={{ color: revealed ? v.color : undefined, textShadow: revealed ? `0 0 60px rgb(${v.rgb} / 0.6)` : undefined }}
                >
                  {skip ? (
                    roast.overall
                  ) : (
                    <CountUp
                      value={roast.overall}
                      duration={2.6}
                      delay={0.2}
                      onTick={(n) => n % 3 === 0 && sfx.play("tick")}
                      onDone={() => setTimeout(() => setPhase((p) => (p === "count" ? "slam" : p)), 450)}
                    />
                  )}
                </span>
                <span className="-mt-1 font-mono text-sm tracking-[0.3em] text-muted">/ 100</span>
              </div>
            </ScoreRing>
          )}
          {phase === "slam" && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-[calc(100%+3.5rem)] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-4"
              style={{ borderColor: v.color }}
              initial={{ scale: 0.2, opacity: 1 }}
              animate={{ scale: 7, opacity: 0 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            />
          )}
        </div>

        <div className="relative mt-8 h-[clamp(5.5rem,14vw,8.5rem)]" aria-live="assertive">
          {revealed && (
            <motion.div
              initial={skip ? false : { scale: 3.2, opacity: 0, rotate: -14 }}
              animate={{ scale: 1, opacity: 1, rotate: -4 }}
              transition={{ type: "spring", stiffness: 380, damping: 18, mass: 1.1 }}
              className="inline-block rounded-xl border-[5px] px-6 py-1 sm:px-9"
              style={{
                borderColor: v.color,
                color: v.color,
                boxShadow: `0 0 60px -10px ${v.color}, inset 0 0 40px -18px ${v.color}`,
                background: `rgb(${v.rgb} / 0.08)`,
              }}
            >
              <span className="sr-only">Verdict: </span>
              <span className="font-display text-[clamp(3.6rem,11vw,7rem)] uppercase leading-[1.05] tracking-[0.04em]">{v.label}</span>
            </motion.div>
          )}
        </div>

        <div className="mt-8 min-h-[4.5rem] max-w-2xl">
          {phase === "settled" && (
            <motion.p
              initial={skip ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xl font-medium leading-snug text-bone sm:text-2xl"
            >
              <Typewriter text={`“${roast.closingLine}”`} cps={50} instant={skip} caret={false} />
            </motion.p>
          )}
        </div>

        {phase === "settled" && (
          <motion.a
            href="#breakdown"
            initial={skip ? false : { opacity: 0 }}
            animate={{ opacity: 1, y: [0, 6, 0] }}
            transition={{ opacity: { delay: 1.2 }, y: { repeat: Infinity, duration: 1.8, delay: 1.2 } }}
            className="mt-6 font-mono text-[11px] uppercase tracking-[0.3em] text-muted hover:text-bone"
          >
            Full breakdown ↓
          </motion.a>
        )}
      </section>

      {phase === "settled" && (
        <Results roast={roast} delay={skip ? 0 : 0.6} onFix={onFix} onShare={onShare} onRestart={onRestart} onReplay={onReplay} />
      )}
    </motion.div>
  );
}

