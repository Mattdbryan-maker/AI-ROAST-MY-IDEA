import type { Metadata } from "next";
import { BetaForm } from "./BetaForm";

export const metadata: Metadata = { title: "Invite only — AI ROAST MY IDEA", robots: { index: false, follow: false } };

export default function BetaPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-6 py-16 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-muted">Closed session</p>
      <h1 className="mt-3 font-display text-[clamp(2.6rem,10vw,4rem)] uppercase leading-[0.9]">The tribunal is invite-only</h1>
      <p className="mt-5 text-muted">AI Roast My Idea is in a private beta. Enter the invite code you were sent.</p>
      <BetaForm />
    </main>
  );
}
