import Link from "next/link";
import type { ReactNode } from "react";

const operator = process.env.NEXT_PUBLIC_OPERATOR_NAME?.trim();
const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

/** Who runs the site. Never invented: until the owner sets these, the pages say so plainly. */
export const OPERATOR = operator || null;
export const CONTACT_EMAIL = contactEmail || null;

export function ContactLine() {
  return CONTACT_EMAIL ? (
    <a className="underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>
      {CONTACT_EMAIL}
    </a>
  ) : (
    <strong className="text-fix">[Contact email not set yet: the owner must set NEXT_PUBLIC_CONTACT_EMAIL before launch]</strong>
  );
}

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14 text-bone">
      <Link href="/" className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted underline-offset-4 hover:underline">
        ← AI Roast My Idea
      </Link>
      <h1 className="mt-6 font-display text-[clamp(2.4rem,8vw,3.6rem)] uppercase leading-[0.95]">{title}</h1>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.25em] text-dim">Last updated {updated}</p>
      <p className="mt-6 rounded-xl border border-fix/40 bg-fix/10 px-4 py-3 text-sm text-muted" role="note">
        <strong className="text-bone">Draft for the beta.</strong> The site owner must review this page (and have it checked by a qualified adviser) before public launch.
      </p>
      <div className="mt-8 space-y-5 leading-relaxed text-muted [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:uppercase [&_h2]:text-bone [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-bone">
        {children}
      </div>
    </main>
  );
}
