"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { VERDICT_COPY } from "@/lib/scoring";
import { encodeShare, toSharePayload } from "@/lib/share";
import type { Roast } from "@/lib/types";
import { Button } from "./ui/Button";

export function ShareDialog({ roast, open, onClose }: { roast: Roast; open: boolean; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const encoded = useMemo(() => encodeShare(toSharePayload(roast)), [roast]);
  const v = VERDICT_COPY[roast.verdict];
  // Only ever rendered client-side (after a roast exists), so window is available.
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const shareUrl = `${origin}/r/${encoded}`;
  const cardUrl = `/api/card?d=${encoded}&f=story`;
  const shareText = `The AI panel gave my idea "${roast.title}" ${roast.overall}/100. Verdict: ${v.label}.`;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  const flash = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 2200);
  };

  const fetchCard = async () => {
    const res = await fetch(cardUrl);
    if (!res.ok) throw new Error("card failed");
    return res.blob();
  };

  const download = async () => {
    try {
      const blob = await fetchCard();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `roast-${roast.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      flash("Card downloaded");
    } catch {
      flash("Couldn't generate the card — try again");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      flash("Link copied");
    } catch {
      flash("Copy blocked — long-press the link instead");
    }
  };

  const nativeShare = async () => {
    try {
      const blob = await fetchCard();
      const file = new File([blob], "ai-roast-verdict.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText, url: shareUrl });
      } else {
        await navigator.share({ title: "AI ROAST MY IDEA", text: shareText, url: shareUrl });
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") flash("Sharing isn't available here — copy the link instead");
    }
  };

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-md sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
            initial={{ y: 60, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative grid max-h-[92dvh] w-full max-w-3xl gap-6 overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0b0b10] p-5 sm:grid-cols-[280px_minmax(0,1fr)] sm:rounded-3xl sm:p-7"
          >
            <div className="relative mx-auto w-full max-w-[260px] sm:max-w-none">
              <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                {!imgLoaded && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-white/[0.06] to-transparent" />}
                {/* eslint-disable-next-line @next/next/no-img-element -- dynamic, generated PNG */}
                <img
                  src={cardUrl}
                  alt={`Share card: ${roast.title}, ${roast.overall} out of 100, ${v.label}`}
                  className={`h-full w-full object-cover transition-opacity duration-500 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                  onLoad={() => setImgLoaded(true)}
                />
              </div>
            </div>
            <div className="flex min-w-0 flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted">Share the verdict</p>
                  <h2 id="share-title" className="mt-1 font-display text-4xl uppercase leading-none">
                    Show the world
                  </h2>
                </div>
                <button
                  ref={closeRef}
                  onClick={onClose}
                  aria-label="Close"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-muted transition hover:text-bone"
                >
                  ✕
                </button>
              </div>
              <p className="mt-3 text-sm text-muted">
                A card made for stories and timelines. The link opens a result page for your friends — your full pitch stays private.
              </p>

              <div className="mt-6 grid gap-2.5">
                {canNativeShare && (
                  <Button variant="primary" onClick={nativeShare}>
                    Share…
                  </Button>
                )}
                <Button variant={canNativeShare ? "secondary" : "primary"} onClick={download}>
                  Download card (PNG)
                </Button>
                <div className="grid grid-cols-2 gap-2.5">
                  <Button onClick={copyLink}>Copy link</Button>
                  <a
                    href={tweet}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.04] px-6 py-4 font-mono text-[13px] font-semibold uppercase tracking-[0.18em] text-bone transition hover:border-white/35 hover:bg-white/[0.08]"
                  >
                    Post on 𝕏
                  </a>
                </div>
              </div>
              <div className="mt-4 truncate rounded-xl border border-white/[0.07] bg-black/40 px-3 py-2 font-mono text-[11px] text-dim" title={shareUrl}>
                {shareUrl}
              </div>
              <p className="mt-3 h-5 font-mono text-[11px] uppercase tracking-[0.2em] text-build" aria-live="polite">
                {status}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
