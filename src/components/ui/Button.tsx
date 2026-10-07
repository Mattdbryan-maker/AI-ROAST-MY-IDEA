"use client";

import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 rounded-full font-mono text-[13px] font-semibold uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed disabled:opacity-40";

const variants: Record<Variant, string> = {
  primary:
    "btn-shine bg-[rgb(var(--accent))] px-7 py-4 text-black shadow-[0_0_0_1px_rgb(var(--accent)/0.6),0_10px_40px_-8px_rgb(var(--accent)/0.75)] hover:shadow-[0_0_0_1px_rgb(var(--accent)),0_14px_60px_-6px_rgb(var(--accent)/0.95)]",
  secondary:
    "border border-white/15 bg-white/[0.04] px-6 py-4 text-bone backdrop-blur-md hover:border-white/35 hover:bg-white/[0.08]",
  ghost: "px-3 py-2 text-muted hover:text-bone",
};

export const Button = forwardRef<HTMLButtonElement, HTMLMotionProps<"button"> & { variant?: Variant }>(
  function Button({ variant = "secondary", className = "", ...props }, ref) {
    return (
      <motion.button
        ref={ref}
        whileHover={props.disabled ? undefined : { scale: 1.03, y: -1 }}
        whileTap={props.disabled ? undefined : { scale: 0.97 }}
        transition={{ type: "spring", stiffness: 420, damping: 24 }}
        className={`${base} ${variants[variant]} ${className}`}
        {...props}
      />
    );
  },
);
