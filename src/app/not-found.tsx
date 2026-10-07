import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-muted">404 · case dismissed</p>
      <h1 className="mt-3 font-display text-6xl uppercase leading-[0.9]">Nothing to see here</h1>
      <p className="mt-4 text-muted">This verdict doesn&apos;t exist — or the link got mangled on its way to you.</p>
      <Link href="/" className="mt-10 rounded-full bg-[#ff4d2e] px-7 py-4 font-display text-lg uppercase tracking-[0.08em] text-black">
        Roast an idea
      </Link>
    </main>
  );
}
