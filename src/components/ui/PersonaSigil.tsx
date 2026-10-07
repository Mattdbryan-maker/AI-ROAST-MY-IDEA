"use client";

import { motion, useReducedMotion } from "framer-motion";
import { PERSONAS } from "@/lib/personas";
import type { PersonaId } from "@/lib/types";

/**
 * Each panelist is an abstract "AI entity": a glowing orb with an orbiting
 * ring and a persona-specific glyph. Same construction, different identity.
 */
export function PersonaSigil({
  persona,
  size = 96,
  active = false,
  dim = false,
  className = "",
}: {
  persona: PersonaId;
  size?: number;
  active?: boolean;
  dim?: boolean;
  className?: string;
}) {
  const p = PERSONAS[persona];
  const reduced = useReducedMotion();
  const spin = reduced ? undefined : { rotate: 360 };

  return (
    <div
      className={`relative shrink-0 transition-[filter,opacity] duration-700 ${dim ? "opacity-35 grayscale-[0.6]" : ""} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {/* Halo */}
      <motion.div
        className="absolute inset-[-30%] rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, rgb(${p.rgb} / 0.55), transparent 65%)` }}
        animate={reduced ? undefined : { opacity: active ? [0.65, 1, 0.65] : [0.25, 0.4, 0.25], scale: active ? [1, 1.08, 1] : 1 }}
        transition={{ duration: active ? 1.8 : 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg viewBox="0 0 100 100" className="relative h-full w-full overflow-visible">
        <defs>
          <radialGradient id={`core-${persona}`} cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={p.color} stopOpacity="0.35" />
            <stop offset="70%" stopColor={p.color} stopOpacity="0.06" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="44" fill={`url(#core-${persona})`} stroke={p.color} strokeOpacity="0.35" strokeWidth="0.8" />
        <motion.g
          style={{ originX: "50px", originY: "50px" }}
          animate={spin}
          transition={{ duration: active ? 8 : 22, repeat: Infinity, ease: "linear" }}
        >
          <circle
            cx="50"
            cy="50"
            r="48"
            fill="none"
            stroke={p.color}
            strokeWidth="1.4"
            strokeDasharray="2 7 18 7"
            strokeLinecap="round"
            opacity="0.8"
          />
          <circle cx="50" cy="2" r="2" fill={p.color} />
        </motion.g>
        <g stroke={p.color} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <Glyph persona={persona} color={p.color} />
        </g>
      </svg>
    </div>
  );
}

function Glyph({ persona, color }: { persona: PersonaId; color: string }) {
  switch (persona) {
    case "investor":
      // A cut diamond over an ascending line: value, scrutinised.
      return (
        <>
          <path d="M50 24 L68 44 L50 76 L32 44 Z" />
          <path d="M32 44 H68 M42 44 L50 76 L58 44 M41 33 L44 44 M59 33 L56 44" strokeWidth="1.6" opacity="0.8" />
        </>
      );
    case "engineer":
      // Hexagonal chip with code brackets.
      return (
        <>
          <path d="M50 22 L74 36 V64 L50 78 L26 64 V36 Z" />
          <path d="M44 42 L36 50 L44 58 M56 42 L64 50 L56 58" strokeWidth="2.2" />
        </>
      );
    case "marketer":
      // Broadcast: a source radiating arcs.
      return (
        <>
          <circle cx="38" cy="50" r="5" fill={color} stroke="none" />
          <path d="M50 38 A16 16 0 0 1 50 62" />
          <path d="M58 30 A26 26 0 0 1 58 70" opacity="0.75" />
          <path d="M66 22 A36 36 0 0 1 66 78" opacity="0.45" />
        </>
      );
    case "customer":
      // An eye: the person who actually has to want it.
      return (
        <>
          <path d="M24 50 Q50 24 76 50 Q50 76 24 50 Z" />
          <circle cx="50" cy="50" r="9" />
          <circle cx="50" cy="50" r="3.5" fill={color} stroke="none" />
        </>
      );
  }
}
