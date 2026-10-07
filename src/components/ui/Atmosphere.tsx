"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * The fixed, layered backdrop behind every stage: coloured spotlight,
 * perspective floor grid, drifting dust particles, scanlines, film grain and
 * a vignette. All colour comes from the --accent / --accent-color CSS vars.
 */
export function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="spotlight absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 h-[55vh] overflow-hidden opacity-70">
        <div className="floor-grid" />
      </div>
      <Particles />
      <div className="scanlines" />
      <div className="grain" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(0,0,0,0.75)_100%)]" />
    </div>
  );
}

function Particles() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;
    const count = window.innerWidth < 640 ? 34 : 70;
    const particles = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.6,
      speed: 0.004 + Math.random() * 0.012,
      sway: Math.random() * Math.PI * 2,
      alpha: 0.15 + Math.random() * 0.55,
    }));

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    let frame = 0;
    let accent = "255 77 46";
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      // Reading computed style is not free; refresh the accent a couple of times a second.
      if (frame++ % 30 === 0) {
        accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || accent;
      }
      for (const p of particles) {
        if (!reduced) {
          p.y -= p.speed * dt * 6;
          p.sway += dt * 0.6;
          if (p.y < -0.02) {
            p.y = 1.02;
            p.x = Math.random();
          }
        }
        const x = (p.x + Math.sin(p.sway) * 0.006) * w;
        const y = p.y * h;
        const twinkle = 0.6 + Math.sin(p.sway * 3) * 0.4;
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.r > 1.4 ? `rgb(${accent} / ${p.alpha * twinkle})` : `rgb(255 245 235 / ${p.alpha * twinkle * 0.7})`;
        ctx.fill();
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduced) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  return <canvas ref={ref} className="absolute inset-0" />;
}

/** Sets the global accent colour (channels like "255 77 46") used by the atmosphere and UI. */
export function useAccent(rgb: string) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", rgb);
    root.style.setProperty("--accent-color", `rgb(${rgb})`);
  }, [rgb]);
}

/** Component form of useAccent, for server-rendered pages. */
export function SetAccent({ rgb }: { rgb: string }) {
  useAccent(rgb);
  return null;
}
