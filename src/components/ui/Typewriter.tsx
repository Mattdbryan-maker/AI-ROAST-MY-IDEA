"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

function commonPrefixLength(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

/**
 * Progressive text reveal that also works on text that is still streaming in.
 *
 * - Static text types out at `cps`.
 * - With `streaming`, `text` may keep growing: typing continues from where it
 *   was (never restarts), waits with a live caret when it catches up, and only
 *   calls `onDone` once streaming has finished and everything is shown.
 * - If the text is revised (not just extended), typing resumes from the
 *   longest shared prefix.
 *
 * The unrevealed remainder is rendered invisibly so layout stays stable, and
 * screen readers get the full text.
 */
export function Typewriter({
  text,
  cps = 55,
  delay = 0,
  instant = false,
  caret = true,
  streaming = false,
  onDone,
  className = "",
}: {
  text: string;
  /** Characters per second. */
  cps?: number;
  delay?: number;
  instant?: boolean;
  caret?: boolean;
  /** More text may still arrive. */
  streaming?: boolean;
  onDone?: () => void;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const skip = instant || !!reduced;
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const prevText = useRef("");
  const started = useRef(false);
  const doneFor = useRef<string | null>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const finish = () => {
      if (!streaming && doneFor.current !== text) {
        doneFor.current = text;
        doneRef.current?.();
      }
    };
    if (skip) {
      finish();
      return;
    }
    countRef.current = Math.min(countRef.current, commonPrefixLength(prevText.current, text));
    prevText.current = text;

    let raf = 0;
    let last = 0;
    const startAt = performance.now() + (started.current ? 0 : delay * 1000);
    const tick = (now: number) => {
      if (now < startAt) {
        raf = requestAnimationFrame(tick);
        return;
      }
      started.current = true;
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      countRef.current = Math.min(text.length, countRef.current + dt * cps);
      setCount(Math.floor(countRef.current));
      if (countRef.current >= text.length) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, cps, delay, skip, streaming]);

  const shown = skip ? text.length : Math.min(count, text.length);
  const typing = shown < text.length || streaming;

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, shown)}
        {caret && typing && (shown > 0 || streaming) && (
          <span className="ml-[1px] inline-block h-[0.9em] w-[0.08em] translate-y-[0.1em] animate-pulse bg-current align-baseline" />
        )}
        <span className="opacity-0">{text.slice(shown)}</span>
      </span>
    </span>
  );
}
