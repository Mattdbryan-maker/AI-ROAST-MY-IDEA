"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { analysisLog } from "@/lib/ai/demo/analyze";
import { PERSONAS, PERSONA_ORDER } from "@/lib/personas";
import { sfx } from "@/lib/sfx";
import { PersonaSigil } from "../ui/PersonaSigil";

const SEQUENCES = {
  roast: {
    steps: ["Assembling panel", "Analysing market", "Checking feasibility", "Searching for flaws", "Preparing roast"],
    stalling: [
      "Cross-examining assumptions",
      "Consulting spreadsheets",
      "Sharpening knives",
      "Arguing amongst themselves",
      "Drafting insults (constructive)",
    ],
    label: "Case file",
  },
  fix: {
    steps: ["Extracting criticism", "Finding the wedge", "Fixing the business model", "Cutting the scope", "Re-pitching the panel"],
    stalling: ["Stress-testing version 2", "Arguing with Sterling", "Rewriting slide nine", "Removing buzzwords"],
    label: "Rebuild",
  },
} as const;

const STEP_MS = 850;
const STALL_MS = 1500;

const KEYWORD =
  /^(ai|app|apps|platform|marketplace|subscription|blockchain|nft|uber|airbnb|b2b|saas|commission|month|monthly|users?|customers?|businesses|restaurants|wearable|device|community|social|dating|free|premium|booking|walkers?|plants?|speech)$|^[£$€]?\d+[%k]?$/i;

export function Analyzing({
  idea,
  ready,
  caseTitle,
  variant = "roast",
  onComplete,
}: {
  idea: string;
  ready: boolean;
  /** The panel's name for the idea, once it has streamed in. */
  caseTitle?: string;
  variant?: keyof typeof SEQUENCES;
  onComplete: () => void;
}) {
  const seq = SEQUENCES[variant];
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const log = useMemo(() => analysisLog(idea), [idea]);
  const caseNo = useMemo(() => {
    let h = 7;
    for (const ch of idea) h = (h * 31 + ch.charCodeAt(0)) % 100000;
    return String(h).padStart(5, "0");
  }, [idea]);

  const base = seq.steps.length;
  const stalling = step >= base;
  const label = stalling ? seq.stalling[(step - base) % seq.stalling.length] : seq.steps[step];
  const finished = ready && step >= base - 1;

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (finished) {
      const t = setTimeout(() => onCompleteRef.current(), reduced ? 200 : 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setStep((s) => s + 1);
      sfx.play("tick");
    }, step >= base - 1 ? STALL_MS : STEP_MS);
    return () => clearTimeout(t);
  }, [step, finished, base, reduced]);

  const progress = finished ? 100 : Math.min(92, Math.round(((step + 1) / (base + 0.6)) * 100) + Math.max(0, step - base) * 2);
  const words = useMemo(() => idea.slice(0, 320).split(/(\s+)/), [idea]);

  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 content-center gap-8 px-4 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.35fr_1fr] lg:gap-12 lg:pb-24">
      <div className="flex flex-col">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">
          {seq.label} #{caseNo} <span className="text-dim">·</span>{" "}
          <span className="text-[rgb(var(--accent))]">{finished ? "complete" : "in progress"}</span>
        </p>
        <AnimatePresence>
          {caseTitle && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 font-mono text-[11px] uppercase tracking-[0.3em] text-bone/80"
            >
              <span className="text-dim">Re:</span> {caseTitle}
            </motion.p>
          )}
        </AnimatePresence>

        <div className="relative mt-4 h-[2.1em] overflow-hidden font-display text-[clamp(2.4rem,7vw,5.6rem)] uppercase leading-none" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.h1
              key={finished ? "done" : label}
              initial={reduced ? false : { y: "100%", opacity: 0, filter: "blur(10px)" }}
              animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
              exit={{ y: "-100%", opacity: 0, filter: "blur(10px)" }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-0 top-0 leading-[1.02]"
            >
              {finished ? (variant === "roast" ? "The panel is ready" : "Version 2 is ready") : label}
              <span className="text-[rgb(var(--accent))]">{finished ? "." : "…"}</span>
            </motion.h1>
          </AnimatePresence>
        </div>

        <div className="mt-6 flex items-center gap-4">
          <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-[rgb(var(--accent))] shadow-[0_0_14px_rgb(var(--accent))]"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
          <span className="w-12 text-right font-mono text-sm tabular-nums text-bone">{progress}%</span>
        </div>

        {/* The pitch, under the scanner */}
        <div className="relative mt-8 overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-md sm:p-6">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Exhibit A — the pitch</p>
          <p className="text-base leading-relaxed text-bone/70 sm:text-lg">
            {words.map((w, i) =>
              KEYWORD.test(w.replace(/[^\w£$€%]/g, "")) ? (
                <mark key={i} className="relative isolate rounded bg-transparent px-0.5 text-white">
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 -z-10 origin-left rounded bg-[rgb(var(--accent)/0.28)]"
                    initial={reduced ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.6 + (i % 17) * 0.18, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  />
                  {w}
                </mark>
              ) : (
                <span key={i}>{w}</span>
              ),
            )}
            {idea.length > 320 && "…"}
          </p>
          {!reduced && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 h-16 -translate-y-full"
              style={{
                background: "linear-gradient(to bottom, transparent, rgb(var(--accent) / 0.08) 90%, rgb(var(--accent) / 0.85) 100%)",
              }}
              animate={{ top: ["0%", "130%"] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.2 }}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        {/* System log */}
        <div className="rounded-2xl border border-white/10 bg-black/50 p-5 font-mono text-[12px] leading-6 backdrop-blur-md">
          <p className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-dim">
            <span>Tribunal log</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-kill" /> live
            </span>
          </p>
          <ul className="space-y-0.5">
            {log.slice(0, Math.min(log.length, 2 + step * 2)).slice(-8).map((line, i) => (
              <motion.li
                key={line}
                initial={reduced ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: (i % 2) * 0.25 }}
                className={line.includes("NOT FOUND") || line.includes("elevated") || line.includes("sighs") ? "text-kill" : "text-bone/70"}
              >
                <span className="text-[rgb(var(--accent))]">›</span> {line}
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Panel connecting */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-md">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Panel status</p>
          <ul className="grid grid-cols-4 gap-2">
            {PERSONA_ORDER.map((id, i) => {
              const online = step > i || finished;
              return (
                <li key={id} className="flex flex-col items-center gap-2 text-center">
                  <PersonaSigil persona={id} size={52} active={online} dim={!online} />
                  <span className="font-display text-sm tracking-wide" style={{ color: online ? PERSONAS[id].color : undefined }}>
                    {PERSONAS[id].name}
                  </span>
                  <span className={`font-mono text-[9px] uppercase tracking-[0.2em] ${online ? "text-bone/70" : "text-dim"}`}>
                    {online ? (variant === "roast" ? "seated" : "reviewing") : "joining"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
