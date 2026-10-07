import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Atmosphere, SetAccent } from "@/components/ui/Atmosphere";
import { PersonaSigil } from "@/components/ui/PersonaSigil";
import { PERSONAS, PERSONA_ORDER } from "@/lib/personas";
import { VERDICT_COPY } from "@/lib/scoring";
import { decodeShare } from "@/lib/share";

// Share pages are tiny and fully determined by the URL; render them on request (crawlers get complete HTML).
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/r/[payload]">): Promise<Metadata> {
  const { payload } = await params;
  const p = decodeShare(payload);
  if (!p) return { title: "AI ROAST MY IDEA" };
  const v = VERDICT_COPY[p.d];
  const title = `“${p.t}” scored ${p.s}/100 — ${v.label}`;
  const description = `The AI panel has spoken: “${p.q}” Think your idea is better? Put it on trial.`;
  const image = { url: `/api/card?d=${payload}&f=og`, width: 1200, height: 630, alt: title };
  return {
    title: `${title} · AI ROAST MY IDEA`,
    description,
    openGraph: { title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default async function SharedResult({ params }: PageProps<"/r/[payload]">) {
  const { payload } = await params;
  const p = decodeShare(payload);
  if (!p) notFound();
  const v = VERDICT_COPY[p.d];
  const quoted = PERSONAS[p.w];

  return (
    <>
      <Atmosphere />
      <SetAccent rgb={v.rgb} />
      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center px-4 py-14 text-center sm:px-8">
        <Link href="/" className="font-display text-xl tracking-wide">
          AI ROAST <span style={{ color: v.color }}>MY IDEA</span>
        </Link>
        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.35em] text-muted">The panel&apos;s verdict on</p>
        <h1 className="mt-2 font-display text-[clamp(2.2rem,7vw,4.5rem)] uppercase leading-[0.92]">{p.t}</h1>

        <div className="mt-8 flex items-end gap-2">
          <span className="font-display text-[clamp(6rem,22vw,10rem)] leading-[0.85]" style={{ color: v.color, textShadow: `0 0 60px rgb(${v.rgb} / 0.55)` }}>
            {p.s}
          </span>
          <span className="mb-3 font-mono text-lg text-muted">/100</span>
        </div>
        <div
          className="mt-6 inline-block -rotate-3 rounded-xl border-[5px] px-7 py-0.5 font-display text-[clamp(3rem,10vw,5rem)] uppercase leading-[1.1]"
          style={{ borderColor: v.color, color: v.color, boxShadow: `0 0 60px -12px ${v.color}` }}
        >
          {v.label}
        </div>

        <ul className="mt-12 grid w-full max-w-lg gap-3 text-left">
          {PERSONA_ORDER.map((id, i) => (
            <li key={id} className="flex items-center gap-3">
              <PersonaSigil persona={id} size={30} />
              <span className="w-24 font-display text-lg tracking-wide" style={{ color: PERSONAS[id].color }}>
                {PERSONAS[id].name}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full" style={{ width: `${p.p[i]}%`, background: PERSONAS[id].color }} />
              </span>
              <span className="w-8 text-right font-display text-lg tabular-nums">{p.p[i]}</span>
            </li>
          ))}
        </ul>

        <blockquote className="mt-12 max-w-xl border-l-4 pl-5 text-left text-xl font-medium leading-snug" style={{ borderColor: quoted.color }}>
          “{p.q}”
          <footer className="mt-2 font-mono text-[11px] uppercase tracking-[0.25em]" style={{ color: quoted.color }}>
            — {quoted.name}, {quoted.role}
          </footer>
        </blockquote>

        <Link
          href="/"
          className="btn-shine mt-14 inline-flex items-center gap-2 rounded-full bg-[rgb(var(--accent))] px-8 py-4 font-display text-lg uppercase tracking-[0.08em] text-black shadow-[0_10px_40px_-8px_rgb(var(--accent)/0.75)] transition hover:scale-[1.03]"
        >
          Think yours is better? Put it on trial →
        </Link>
      </main>
    </>
  );
}
