"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { PERSONAS, PERSONA_ORDER } from "@/lib/personas";
import { IDEA_MAX_LENGTH, IDEA_MIN_LENGTH } from "@/lib/types";
import { Button } from "../ui/Button";
import { PersonaSigil } from "../ui/PersonaSigil";

export const EXAMPLE_IDEAS: { label: string; idea: string }[] = [
  {
    label: "Uber for dog walking",
    idea: "Uber for dog walking. Busy professionals book a vetted local walker in under 60 seconds, track the walk on a live map, and we take a 20% commission on every booking.",
  },
  {
    label: "AI wedding speeches",
    idea: "An AI app that writes your wedding speech. You do a 5-minute voice interview about the couple, it writes a funny, personal speech and coaches your delivery. £29 per speech.",
  },
  {
    label: "Houseplant subscription",
    idea: "A subscription box of indestructible houseplants for people who keep killing houseplants. £15/month, each plant comes with a QR code linking to care videos.",
  },
  {
    label: "NFT sourdough",
    idea: "A blockchain-verified NFT marketplace for sourdough starters. Every starter gets an on-chain pedigree and owners vote on new flavours through a DAO.",
  },
  {
    label: "Restaurant waste SaaS",
    idea: "B2B SaaS for small independent restaurants that predicts tomorrow's covers from bookings, weather and local events, then tells the chef exactly how much stock to order so less food gets thrown away. £79/month per site.",
  },
  {
    label: "Anti-dating app",
    idea: "A dating app for people who hate dating apps: no swiping, no profiles. Once a week you get matched into a group of six for a real-world dinner.",
  },
];

const HEADLINE_TOP = ["THINK", "YOUR", "IDEA", "IS", "GOOD?"];

export function Landing({
  initialIdea,
  onSubmit,
}: {
  initialIdea: string;
  onSubmit: (idea: string) => void;
}) {
  const [idea, setIdea] = useState(initialIdea);
  const [touched, setTouched] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const reduced = useReducedMotion();

  const trimmed = idea.trim();
  const tooShort = trimmed.length < IDEA_MIN_LENGTH;
  const remaining = IDEA_MAX_LENGTH - idea.length;

  useEffect(() => {
    // Desktop only: don't throw the keyboard up on mobile on arrival.
    if (window.matchMedia("(min-width: 768px)").matches) {
      const t = setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 1600);
      return () => clearTimeout(t);
    }
  }, []);

  const submit = () => {
    setTouched(true);
    if (!tooShort) onSubmit(trimmed);
  };

  const word = (i: number) => ({
    initial: reduced ? false : { y: "110%", rotate: 4 },
    animate: { y: "0%", rotate: 0 },
    transition: { delay: 0.15 + i * 0.07, duration: 0.9, ease: [0.16, 1, 0.3, 1] as const },
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-16 pt-6 sm:px-8 sm:pt-8">
      <motion.p
        initial={reduced ? false : { opacity: 0, letterSpacing: "0.6em" }}
        animate={{ opacity: 1, letterSpacing: "0.32em" }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
        className="mb-6 flex items-center gap-3 font-mono text-[10px] uppercase text-muted sm:text-xs"
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[rgb(var(--accent))] shadow-[0_0_10px_rgb(var(--accent))]" />
        The tribunal is now in session
      </motion.p>

      <h1 className="text-center font-display uppercase leading-[0.86] tracking-[-0.01em]">
        <span className="sr-only">Think your idea is good? Let the panel destroy it.</span>
        <span aria-hidden className="flex flex-wrap justify-center gap-x-[0.22em] text-[clamp(3rem,10vw,6.75rem)]">
          {HEADLINE_TOP.map((w, i) => (
            <span key={w} className="inline-block overflow-hidden pb-[0.04em]">
              <motion.span className="inline-block" {...word(i)}>
                {w}
              </motion.span>
            </span>
          ))}
        </span>
        <span aria-hidden className="mt-2 block overflow-hidden pb-[0.06em] text-[clamp(1.9rem,6vw,4.25rem)]">
          <motion.span
            className="sweep-text text-shadow-glow inline-block"
            initial={reduced ? false : { y: "110%", opacity: 0 }}
            animate={{ y: "0%", opacity: 1 }}
            transition={{ delay: 0.75, duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            Let the panel destroy it.
          </motion.span>
        </span>
      </h1>

      <motion.p
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1, duration: 0.8 }}
        className="mt-5 max-w-xl text-center text-base text-muted sm:text-lg"
      >
        Four AI critics. One brutal verdict. Feedback that&apos;s actually useful — and a fix for whatever survives.
      </motion.p>

      <motion.form
        initial={reduced ? false : { opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 1.25, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="glow-border mt-8 w-full max-w-3xl rounded-[28px] bg-[#0c0c12]/85 p-2 shadow-[0_40px_120px_-40px_rgb(var(--accent)/0.5)] backdrop-blur-xl"
        data-active={trimmed.length > 0}
      >
        <label htmlFor="pitch" className="flex items-center justify-between px-5 pt-4 font-mono text-[11px] uppercase tracking-[0.25em] text-muted">
          <span>
            <span className="text-[rgb(var(--accent))]">●</span> Pitch your idea
          </span>
          <span className={`tabular-nums ${remaining < 100 ? "text-fix" : ""}`} aria-live="polite">
            {idea.length}/{IDEA_MAX_LENGTH}
          </span>
        </label>
        <textarea
          id="pitch"
          ref={textareaRef}
          value={idea}
          maxLength={IDEA_MAX_LENGTH}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={4}
          placeholder="What is it, who is it for, and how does it make money? The more you tell the panel, the sharper the roast."
          aria-invalid={touched && tooShort}
          aria-describedby="pitch-hint"
          className="block min-h-[120px] w-full resize-none bg-transparent px-5 py-3 text-lg leading-relaxed text-bone placeholder:text-dim focus:outline-none focus-visible:outline-none sm:min-h-[130px] sm:text-xl"
        />
        <div className="flex flex-col-reverse items-stretch gap-3 px-3 pb-3 sm:flex-row sm:items-center sm:justify-between sm:pl-5">
          <p id="pitch-hint" className={`text-center font-mono text-[11px] tracking-wider sm:text-left ${touched && tooShort ? "text-kill" : "hidden text-dim sm:block"}`}>
            {touched && tooShort
              ? `A little more, please — at least ${IDEA_MIN_LENGTH} characters.`
              : (
                  <>
                    <kbd className="rounded border border-white/10 px-1.5 py-0.5">⌘</kbd> +{" "}
                    <kbd className="rounded border border-white/10 px-1.5 py-0.5">Enter</kbd> to submit
                  </>
                )}
          </p>
          <Button type="submit" variant="primary" className="font-display !text-lg !tracking-[0.08em] sm:!text-xl">
            Put it on trial
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Button>
        </div>
      </motion.form>

      <motion.div
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 0.8 }}
        className="mt-6 flex w-full max-w-3xl flex-col items-center gap-3"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">or try one of these</span>
        <div className="no-scrollbar -mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-full sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
          {EXAMPLE_IDEAS.map((ex) => (
            <motion.button
              key={ex.label}
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setIdea(ex.idea);
                setTouched(false);
                textareaRef.current?.focus({ preventScroll: true });
              }}
              className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-muted backdrop-blur transition-colors hover:border-[rgb(var(--accent)/0.6)] hover:text-bone"
            >
              {ex.label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      <PanelLineup />
    </div>
  );
}

function PanelLineup() {
  const reduced = useReducedMotion();
  return (
    <section aria-labelledby="panel-heading" className="mt-20 w-full sm:mt-24">
      <div className="mb-8 flex items-center gap-4">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/15" />
        <h2 id="panel-heading" className="font-mono text-[11px] uppercase tracking-[0.35em] text-muted">
          Tonight&apos;s panel
        </h2>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/15" />
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {PERSONA_ORDER.map((id, i) => {
          const p = PERSONAS[id];
          return (
            <motion.li
              key={id}
              initial={reduced ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -4 }}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 backdrop-blur-sm transition-colors hover:border-white/20 sm:p-5"
              style={{ boxShadow: `inset 0 1px 0 rgb(${p.rgb} / 0.12)` }}
            >
              <div
                className="pointer-events-none absolute inset-x-0 -top-20 h-40 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                style={{ background: `radial-gradient(circle, rgb(${p.rgb} / 0.35), transparent 70%)` }}
              />
              <div className="relative flex items-center gap-3 sm:gap-4">
                <PersonaSigil persona={id} size={52} />
                <div className="min-w-0">
                  <p className="font-display text-xl leading-none tracking-wide sm:text-2xl" style={{ color: p.color }}>
                    {p.name}
                  </p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{p.role}</p>
                </div>
              </div>
              <p className="relative mt-4 text-sm leading-snug text-bone/80">{p.tagline}</p>
              <p className="relative mt-2 hidden font-mono text-[10px] uppercase tracking-[0.15em] text-dim sm:block">{p.focus}</p>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
