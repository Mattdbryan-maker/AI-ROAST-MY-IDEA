"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Posts the invite code to the server, which checks it and sets a signed cookie. Nothing is verified in the browser. */
export function BetaForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/beta/enter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(json?.error?.message ?? "Something went wrong. Please try again.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 flex w-full flex-col gap-3">
      <label htmlFor="code" className="sr-only">
        Invite code
      </label>
      <input
        id="code"
        type="password"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Invite code"
        className="w-full rounded-2xl border border-white/10 bg-[#0c0c12]/85 px-5 py-4 text-center text-lg text-bone placeholder:text-dim focus:border-white/30 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy || code.trim().length === 0}
        className="rounded-2xl bg-[rgb(var(--accent,255_77_46))] px-6 py-4 font-display text-lg uppercase tracking-[0.08em] text-black disabled:opacity-50"
      >
        {busy ? "Checking…" : "Enter"}
      </button>
      {error && (
        <p role="alert" className="text-kill">
          {error}
        </p>
      )}
    </form>
  );
}
