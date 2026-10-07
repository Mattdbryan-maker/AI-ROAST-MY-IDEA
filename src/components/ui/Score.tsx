"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, useState } from "react";
import { scoreColor } from "@/lib/scoring";

/** Number that counts up from 0 (or `from`) to `value`. */
export function CountUp({
  value,
  from = 0,
  duration = 1.2,
  delay = 0,
  onTick,
  onDone,
  className = "",
}: {
  value: number;
  from?: number;
  duration?: number;
  delay?: number;
  onTick?: (n: number) => void;
  onDone?: () => void;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [count, setDisplay] = useState(from);
  const display = reduced ? value : count;

  useEffect(() => {
    if (reduced) {
      onDone?.();
      return;
    }
    let lastInt = from;
    const controls = animate(from, value, {
      duration,
      delay,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        const n = Math.round(v);
        if (n !== lastInt) {
          lastInt = n;
          setDisplay(n);
          onTick?.(n);
        }
      },
      onComplete: () => onDone?.(),
    });
    return () => controls.stop();
    // Callbacks intentionally excluded: restarting the count on every render would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, from, duration, delay, reduced]);

  return <span className={`tabular-nums ${className}`}>{display}</span>;
}

/** Circular gauge whose stroke fills and changes colour as the score climbs. */
export function ScoreRing({
  score,
  size = 72,
  stroke = 5,
  delay = 0,
  duration = 1.2,
  color,
  children,
}: {
  score: number;
  size?: number;
  stroke?: number;
  delay?: number;
  duration?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = useMotionValue(reduced ? score : 0);
  const offset = useTransform(progress, (v) => c - (v / 100) * c);
  const dynamicColor = useTransform(progress, (v) => color ?? scoreColor(v));

  useEffect(() => {
    if (reduced) {
      progress.set(score);
      return;
    }
    const controls = animate(progress, score, { duration, delay, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [score, delay, duration, reduced, progress]);

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90 overflow-visible" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          style={{ strokeDashoffset: offset, stroke: dynamicColor, filter: "drop-shadow(0 0 6px currentColor)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
