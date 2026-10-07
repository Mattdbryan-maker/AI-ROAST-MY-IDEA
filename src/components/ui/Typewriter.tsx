"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Progressive text reveal. The unrevealed remainder is rendered invisibly so
 * the layout never jumps while text "types" in. Screen readers get the full
 * text immediately.
 */
export function Typewriter({
  text,
  cps = 55,
  delay = 0,
  instant = false,
  caret = true,
  onDone,
  className = "",
}: {
  text: string;
  /** Characters per second. */
  cps?: number;
  delay?: number;
  instant?: boolean;
  caret?: boolean;
  onDone?: () => void;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const skip = instant || reduced;
  // Progress is stored against the text it belongs to, so a new text starts from zero without a reset effect.
  const [progress, setProgress] = useState({ text, count: 0 });
  const count = skip ? text.length : progress.text === text ? progress.count : 0;
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (skip) {
      doneRef.current?.();
      return;
    }
    let raf = 0;
    let start = 0;
    let finished = false;
    const tick = (now: number) => {
      if (!start) start = now + delay * 1000;
      const n = Math.max(0, Math.floor(((now - start) / 1000) * cps));
      setProgress({ text, count: Math.min(n, text.length) });
      if (n >= text.length) {
        if (!finished) {
          finished = true;
          doneRef.current?.();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, cps, delay, skip]);

  const typing = count < text.length;

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, count)}
        {caret && typing && count > 0 && (
          <span className="ml-[1px] inline-block h-[0.9em] w-[0.08em] translate-y-[0.1em] animate-pulse bg-current align-baseline" />
        )}
        <span className="opacity-0">{text.slice(count)}</span>
      </span>
    </span>
  );
}
