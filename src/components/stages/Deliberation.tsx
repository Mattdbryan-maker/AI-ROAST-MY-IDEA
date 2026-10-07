"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { PERSONAS } from "@/lib/personas";
import { VERDICT_THRESHOLDS } from "@/lib/scoring";
import { sfx } from "@/lib/sfx";
import type { Roast } from "@/lib/types";
import { useAccent } from "../ui/Atmosphere";
import { Button } from "../ui/Button";
import { PersonaSigil } from "../ui/PersonaSigil";
import { Typewriter } from "../ui/Typewriter";

const LINE_GAP_MS = 650;
const AUTO_ADVANCE_MS = 2600;

export function Deliberation({ roast, onComplete }: { roast: Roast; onComplete: () => void }) {
  useAccent("255 77 46");
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(1);
  const [typed, setTyped] = useState(0);
  const allDone = typed >= roast.debate.length;
  const endRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  // Reveal the next line a beat after the previous one finishes typing.
  useEffect(() => {
    if (typed < shown || shown >= roast.debate.length) return;
    const t = setTimeout(() => setShown((s) => s + 1), reduced ? 0 : LINE_GAP_MS);
    return () => clearTimeout(t);
  }, [typed, shown, roast.debate.length, reduced]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  }, [shown, reduced]);

  useEffect(() => {
    if (!allDone) return;
    sfx.play("riser");
    ctaRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    const t = setTimeout(onComplete, AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [allDone, onComplete, reduced]);

  const speaking = roast.debate[Math.min(shown, roast.debate.length) - 1];
  const speakerScore = roast.takes.find((t) => t.persona === speaking.speaker)?.score ?? 50;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col px-4 pb-16 pt-6 sm:px-8 sm:pt-10">
      <div className="text-center">
        <p className="inline-flex items-center gap-2 rounded-full border border-kill/40 bg-kill/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-kill">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-kill" /> Closed session
        </p>
        <h1 className="mt-4 font-display text-[clamp(2.6rem,8vw,5.5rem)] uppercase leading-[0.9]">The panel deliberates</h1>
        <p className="mt-3 text-muted">Off the record. Mostly.</p>
      </div>

      <TensionMeter score={allDone ? 50 : speakerScore} speaker={allDone ? null : speaking.speaker} />

      <ul className="mt-10 flex flex-col gap-4" aria-live="polite">
        {roast.debate.slice(0, shown).map((line, i) => {
          const p = PERSONAS[line.speaker];
          const right = i % 2 === 1;
          return (
            <motion.li
              key={i}
              initial={reduced ? false : { opacity: 0, y: 16, x: right ? 24 : -24 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className={`flex items-start gap-3 sm:gap-4 ${right ? "flex-row-reverse text-right" : ""}`}
            >
              <PersonaSigil persona={line.speaker} size={44} active={i === shown - 1 && !allDone} />
              <div
                className={`max-w-[85%] rounded-2xl border bg-black/50 px-4 py-3 backdrop-blur-md sm:max-w-[75%] sm:px-5 sm:py-4 ${right ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                style={{ borderColor: `rgb(${p.rgb} / 0.3)`, boxShadow: `0 10px 40px -20px rgb(${p.rgb} / 0.6)` }}
              >
                <p className="font-display text-sm tracking-[0.12em]" style={{ color: p.color }}>
                  {p.name}
                </p>
                <p className="mt-1 text-left text-[15px] leading-relaxed text-bone/90 sm:text-base">
                  <Typewriter
                    text={line.line}
                    cps={60}
                    delay={0.2}
                    onDone={() => setTyped((t) => Math.max(t, i + 1))}
                  />
                </p>
              </div>
            </motion.li>
          );
        })}
      </ul>
      <div ref={endRef} />

      <motion.div
        initial={false}
        ref={ctaRef}
        animate={{ opacity: allDone ? 1 : 0, y: allDone ? 0 : 10 }}
        className="mt-12 flex flex-col items-center gap-5 text-center"
        aria-hidden={!allDone}
      >
        <p className="font-mono text-xs uppercase tracking-[0.35em] text-muted">The panel has reached a decision</p>
        <Button variant="primary" onClick={onComplete} disabled={!allDone} className="font-display !text-lg !tracking-[0.1em]">
          Reveal the verdict
        </Button>
      </motion.div>
    </div>
  );
}

/** Game-show style needle that swings toward whoever is talking. */
function TensionMeter({ score, speaker }: { score: number; speaker: keyof typeof PERSONAS | null }) {
  const reduced = useReducedMotion();
  return (
    <div className="sticky top-0 z-20 -mx-4 mt-8 bg-gradient-to-b from-[#050507] via-[#050507]/90 to-transparent px-4 pb-6 pt-4" aria-hidden>
      <div className="mx-auto w-full max-w-2xl">
      <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.3em]">
        <span className="text-kill">Kill it</span>
        <span className="text-fix">Fix it</span>
        <span className="text-build">Build it</span>
      </div>
      <div className="relative h-3 rounded-full">
        <div
          className="absolute inset-0 rounded-full opacity-70"
          style={{
            background: `linear-gradient(90deg, var(--color-kill) 0%, var(--color-kill) ${VERDICT_THRESHOLDS.fix - 6}%, var(--color-fix) ${VERDICT_THRESHOLDS.fix + 4}%, var(--color-fix) ${VERDICT_THRESHOLDS.build - 4}%, var(--color-build) ${VERDICT_THRESHOLDS.build + 6}%, var(--color-build) 100%)`,
          }}
        />
        <motion.div
          className="absolute top-1/2 h-7 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_18px_white]"
          animate={{ left: `${score}%` }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 7, mass: 1.2 }}
        />
      </div>
      <p className="mt-3 h-4 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted">
        {speaker ? (
          <>
            Leaning with <span style={{ color: PERSONAS[speaker].color }}>{PERSONAS[speaker].name}</span>
          </>
        ) : (
          "Undecided…"
        )}
      </p>
      </div>
    </div>
  );
}
