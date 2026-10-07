"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { RoastApiError, requestFix, requestRoast } from "@/lib/client-api";
import { sfx } from "@/lib/sfx";
import type { FixResult, Roast } from "@/lib/types";
import { ShareDialog } from "./ShareDialog";
import { Analyzing } from "./stages/Analyzing";
import { Deliberation } from "./stages/Deliberation";
import { FixResultView } from "./stages/FixResultView";
import { Landing } from "./stages/Landing";
import { Trial } from "./stages/Trial";
import { Verdict } from "./stages/Verdict";
import { Atmosphere, useAccent } from "./ui/Atmosphere";
import { Button } from "./ui/Button";
import { TopBar } from "./ui/TopBar";

/**
 * The whole experience is one page driven by a small state machine:
 *
 *   landing → analyzing → trial → deliberation → verdict ⇄ fixing → fixed
 *                  ↘ error ↙                        ↑ (skip)
 */
type Stage =
  | { name: "landing" }
  | { name: "analyzing" }
  | { name: "trial" }
  | { name: "deliberation" }
  | { name: "verdict"; instant: boolean }
  | { name: "fixing" }
  | { name: "fixed" }
  | { name: "error"; message: string; retry: "roast" | "fix" };

export function RoastExperience() {
  const [stage, setStage] = useState<Stage>({ name: "landing" });
  const [idea, setIdea] = useState("");
  const [roast, setRoast] = useState<Roast | null>(null);
  const [fix, setFix] = useState<FixResult | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [mode, setMode] = useState<"ai" | "demo" | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((s: { mode: "ai" | "demo" }) => setMode(s.mode))
      .catch(() => setMode(null));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [stage.name]);

  const go = useCallback((next: Stage) => setStage(next), []);

  const startRoast = useCallback(
    (pitch: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIdea(pitch);
      setRoast(null);
      setFix(null);
      sfx.play("whoosh");
      go({ name: "analyzing" });
      requestRoast(pitch, controller.signal)
        .then((r) => {
          setRoast(r);
          setMode(r.mode);
        })
        .catch((err: unknown) => {
          if ((err as Error).name === "AbortError") return;
          go({
            name: "error",
            message: err instanceof RoastApiError ? err.message : "Something went wrong. Please try again.",
            retry: "roast",
          });
        });
    },
    [go],
  );

  const startFix = useCallback(() => {
    if (!roast) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setFix(null);
    sfx.play("whoosh");
    go({ name: "fixing" });
    requestFix(idea, roast, controller.signal)
      .then(setFix)
      .catch((err: unknown) => {
        if ((err as Error).name === "AbortError") return;
        go({
          name: "error",
          message: err instanceof RoastApiError ? err.message : "Something went wrong. Please try again.",
          retry: "fix",
        });
      });
  }, [idea, roast, go]);

  const restart = useCallback(() => {
    abortRef.current?.abort();
    setRoast(null);
    setFix(null);
    go({ name: "landing" });
  }, [go]);

  return (
    <MotionConfig reducedMotion="user">
      <Atmosphere />
      {stage.name === "landing" && <LandingAccent />}
      <div className="relative z-10 flex min-h-dvh flex-col">
        <TopBar mode={mode} onHome={restart} />
        <main className="flex flex-1 flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={stage.name === "verdict" ? "verdict" : stage.name}
              className="flex flex-1 flex-col"
              initial={{ opacity: 0, scale: 1.03, filter: "blur(12px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.97, filter: "blur(12px)" }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            >
              {stage.name === "landing" && <Landing initialIdea={idea} onSubmit={startRoast} />}

              {stage.name === "analyzing" && (
                <Analyzing idea={idea} ready={roast !== null} onComplete={() => go({ name: "trial" })} />
              )}

              {stage.name === "trial" && roast && (
                <Trial roast={roast} onComplete={() => go({ name: "deliberation" })} onSkip={() => go({ name: "verdict", instant: false })} />
              )}

              {stage.name === "deliberation" && roast && (
                <Deliberation roast={roast} onComplete={() => go({ name: "verdict", instant: false })} />
              )}

              {stage.name === "verdict" && roast && (
                <Verdict
                  roast={roast}
                  instant={stage.instant}
                  onFix={startFix}
                  onShare={() => setShareOpen(true)}
                  onRestart={restart}
                  onReplay={() => go({ name: "trial" })}
                />
              )}

              {stage.name === "fixing" && (
                <Analyzing idea={idea} ready={fix !== null} variant="fix" onComplete={() => go({ name: "fixed" })} />
              )}

              {stage.name === "fixed" && roast && fix && (
                <FixResultView
                  roast={roast}
                  fix={fix}
                  onRetrial={startRoast}
                  onBack={() => go({ name: "verdict", instant: true })}
                  onRestart={restart}
                />
              )}

              {stage.name === "error" && (
                <ErrorView
                  message={stage.message}
                  onRetry={() => (stage.retry === "fix" ? startFix() : startRoast(idea))}
                  onHome={() => go({ name: "landing" })}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
        {stage.name === "landing" && <Footer />}
      </div>
      {roast && <ShareDialog roast={roast} open={shareOpen} onClose={() => setShareOpen(false)} />}
    </MotionConfig>
  );
}

function LandingAccent() {
  useAccent("255 77 46");
  return null;
}

function ErrorView({ message, onRetry, onHome }: { message: string; onRetry: () => void; onHome: () => void }) {
  useAccent("255 59 59");
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-kill">Mistrial</p>
      <h1 className="mt-3 font-display text-[clamp(2.6rem,8vw,4.5rem)] uppercase leading-[0.9]">The panel walked out</h1>
      <p className="mt-5 text-lg text-muted" role="alert">
        {message}
      </p>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
        <Button onClick={onHome}>Edit my pitch</Button>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 mx-auto w-full max-w-7xl px-4 pb-8 pt-4 text-center font-mono text-[10px] uppercase tracking-[0.25em] text-dim sm:px-8">
      For entertainment and honest feedback. The panel is harsh on ideas, never on people.
    </footer>
  );
}
