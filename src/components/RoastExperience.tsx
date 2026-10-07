"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { RoastApiError, requestFix, streamRoast } from "@/lib/client-api";
import { EMPTY_LIVE, liveReducer } from "@/lib/live-roast";
import { STANDALONE } from "@/lib/runtime";
import { sfx } from "@/lib/sfx";
import type { FixResult } from "@/lib/types";
import { ShareDialog } from "./ShareDialog";
import { Analyzing } from "./stages/Analyzing";
import { Deliberation } from "./stages/Deliberation";
import { FixResultView } from "./stages/FixResultView";
import { Landing } from "./stages/Landing";
import { LiveBadge, Trial } from "./stages/Trial";
import { Verdict } from "./stages/Verdict";
import { Atmosphere, useAccent } from "./ui/Atmosphere";
import { Button } from "./ui/Button";
import { TopBar } from "./ui/TopBar";

/**
 * The whole experience is one page driven by a small state machine:
 *
 *   landing → analyzing → trial → deliberation → verdict ⇄ fixing → fixed
 *                  ↘ error ↙                        ↑ (skip)
 *
 * The roast streams in live (see lib/live-roast.ts): the trial starts as soon
 * as the first panelist begins speaking, while the rest are still being written.
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
  const [live, dispatch] = useReducer(liveReducer, EMPTY_LIVE);
  const roast = live.roast ?? null;
  const [fix, setFix] = useState<FixResult | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [mode, setMode] = useState<"ai" | "demo" | null>(STANDALONE ? "demo" : null);
  const abortRef = useRef<AbortController | null>(null);
  const stageRef = useRef<Stage["name"]>("landing");
  useEffect(() => {
    stageRef.current = stage.name;
  }, [stage.name]);

  useEffect(() => {
    if (STANDALONE) return;
    fetch("/api/status")
      .then((r) => r.json())
      .then((s: { mode: "ai" | "demo" }) => setMode(s.mode))
      .catch(() => setMode(null));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [stage.name]);

  const go = useCallback((next: Stage) => setStage(next), []);
  // Stable stage transitions: the page re-renders on every stream event, and
  // stage timers must not be reset by a new callback identity each time.
  const toTrial = useCallback(() => go({ name: "trial" }), [go]);
  const toDeliberation = useCallback(() => go({ name: "deliberation" }), [go]);
  const toVerdict = useCallback(() => go({ name: "verdict", instant: false }), [go]);
  const toFixed = useCallback(() => go({ name: "fixed" }), [go]);

  const startRoast = useCallback(
    (pitch: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIdea(pitch);
      dispatch({ type: "clear" });
      setFix(null);
      sfx.play("whoosh");
      go({ name: "analyzing" });
      streamRoast(
        pitch,
        (event) => {
          dispatch(event);
          if (event.type === "start") setMode(event.mode);
          // The server is starting over (a retry): send the audience back to the analysis screen.
          if (event.type === "reset" && (stageRef.current === "trial" || stageRef.current === "deliberation")) {
            go({ name: "analyzing" });
          }
        },
        controller.signal,
      )
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
    dispatch({ type: "clear" });
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
                <Analyzing
                  key={live.generation}
                  idea={idea}
                  caseTitle={live.title}
                  ready={roast !== null || !!live.takes[0]?.headline}
                  onComplete={toTrial}
                />
              )}

              {stage.name === "trial" && (
                <Trial live={live} onComplete={toDeliberation} onSkip={toVerdict} />
              )}

              {stage.name === "deliberation" && (
                <Deliberation live={live} onComplete={toVerdict} />
              )}

              {stage.name === "verdict" && !roast && <AwaitingVerdict />}

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
                <Analyzing idea={idea} ready={fix !== null} variant="fix" onComplete={toFixed} />
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

/** Someone skipped ahead of the stream: hold the room until the panel finishes. */
function AwaitingVerdict() {
  useAccent("120 120 140");
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-20 text-center" aria-live="polite">
      <LiveBadge label="Still in session" />
      <h1 className="mt-6 font-display text-[clamp(2.4rem,8vw,4.5rem)] uppercase leading-[0.92]">The panel is still arguing</h1>
      <p className="mt-4 text-muted">The verdict lands the moment they agree.</p>
      <div className="mt-8 flex gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2.5 w-2.5 rounded-full bg-bone"
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
    </div>
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
