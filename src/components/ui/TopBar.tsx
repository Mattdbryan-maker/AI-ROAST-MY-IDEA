"use client";

import { useEffect, useState } from "react";
import { sfx } from "@/lib/sfx";

export function TopBar({ mode, onHome }: { mode: "ai" | "demo" | null; onHome: () => void }) {
  const [sound, setSound] = useState(false);

  useEffect(() => {
    const unsubscribe = sfx.subscribe(setSound);
    sfx.init();
    return unsubscribe;
  }, []);

  return (
    <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 pt-4 sm:px-8 sm:pt-6">
      <button onClick={onHome} className="group flex items-center gap-3" aria-label="AI Roast My Idea — home">
        <Mark />
        <span className="font-display text-lg leading-none tracking-wide sm:text-xl">
          AI ROAST <span className="text-[rgb(var(--accent))] transition-colors duration-700">MY IDEA</span>
        </span>
      </button>
      <div className="flex items-center gap-2 sm:gap-3">
        {mode && (
          <span
            className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted sm:inline-flex"
            title={mode === "demo" ? "Running the offline demo panel. Add an API key for live AI roasts." : "Live AI panel"}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${mode === "ai" ? "bg-build" : "bg-fix"} animate-pulse`} />
            {mode === "ai" ? "Live AI panel" : "Demo panel"}
          </span>
        )}
        <button
          onClick={() => sfx.setEnabled(!sound)}
          aria-pressed={sound}
          aria-label={sound ? "Mute sound effects" : "Enable sound effects"}
          className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-muted transition hover:border-white/30 hover:text-bone"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5z" />
            {sound ? (
              <>
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M19 5a10 10 0 0 1 0 14" />
              </>
            ) : (
              <path d="m22 9-6 6M16 9l6 6" />
            )}
          </svg>
        </button>
      </div>
    </header>
  );
}

function Mark() {
  return (
    <span className="relative grid h-9 w-9 place-items-center rounded-lg border border-[rgb(var(--accent)/0.5)] bg-[rgb(var(--accent)/0.12)] shadow-[0_0_24px_-4px_rgb(var(--accent)/0.8)] transition-colors duration-700">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 2c1 3.5 5 5.5 5 10.5A5 5 0 0 1 12 18a5 5 0 0 1-5-5.5c0-2 1-3.5 2-4.5.3 1.7 1.2 2.7 2.3 3C10.6 8 11 5 12 2Z"
          fill="rgb(var(--accent))"
        />
        <path d="M7 21h10" stroke="rgb(var(--accent))" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
