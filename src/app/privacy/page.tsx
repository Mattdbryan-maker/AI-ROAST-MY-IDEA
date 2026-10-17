import type { Metadata } from "next";
import { ContactLine, LegalPage, OPERATOR } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy — AI ROAST MY IDEA" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="October 2026 (draft)">
      <p>
        This explains what happens to the business idea you type into AI Roast My Idea and what else the site records. Operator:{" "}
        {OPERATOR ?? <strong className="text-fix">[operator name not set yet]</strong>}. Questions: <ContactLine />.
      </p>

      <h2>Your idea</h2>
      <ul>
        <li>
          When you press &ldquo;Put it on trial&rdquo;, the text of your pitch is sent from our server to <strong>Anthropic&apos;s Claude API</strong>, which writes
          the judges&apos; responses. Anthropic processes it under its own terms and privacy policy; we do not control how it handles API data.
        </li>
        <li>
          <strong>We do not store your pitch or the roast in a database.</strong> They exist in your browser while you use the site. The server does not write
          the text of your pitch to its application logs.
        </li>
        <li>
          Our hosting provider (Vercel) handles every request and keeps its own operational logs, such as time, URL and IP address, under its own policy.
        </li>
        <li>Do not enter confidential information, trade secrets, or personal data about other people.</li>
      </ul>

      <h2>Sharing</h2>
      <p>
        A share link contains the roast&apos;s title, the scores, and one quote from a judge, encoded in the link itself. Anyone who has the link can see those.
        The full pitch is never put in a link.
      </p>

      <h2>Cookies and similar</h2>
      <ul>
        <li>No advertising or tracking cookies are used.</li>
        <li>During the invite-only beta the site sets a signed cookie that proves you entered a valid invite code, and, if the human check is on, a short-lived signed cookie that proves you passed it. Both are strictly necessary for the site to work and contain no personal information.</li>
        <li>Your browser&apos;s session storage records that this tab has already been counted as a visit.</li>
      </ul>

      <h2>Analytics and abuse protection</h2>
      <ul>
        <li>
          We count anonymous events (a visit, a share, a roast succeeded or failed, a FIX run) as daily totals. No identifier, address or idea text is stored with
          them. The browser&apos;s Do Not Track and Global Privacy Control settings are honoured for the visit and share counts.
        </li>
        <li>
          To limit abuse and cost we keep per-visitor usage counters for up to two days, keyed by a one-way hash of your IP address mixed with a secret. The
          address itself is not stored by this feature. The counters are held by Upstash (a Redis hosting service).
        </li>
        <li>
          If the human check is enabled, Cloudflare Turnstile runs in your browser and receives the signals it needs to tell people from bots, under Cloudflare&apos;s own policy.
        </li>
      </ul>

      <h2>Your choices</h2>
      <p>
        Because we do not keep your pitch or any account for you, there is normally nothing for us to delete. To ask about data we may hold, or to raise a
        concern, contact <ContactLine />.
      </p>
      <p>
        <strong>[Owner to complete with an adviser: legal basis for processing, any data-protection registration, international transfers, and your jurisdiction&apos;s rights wording.]</strong>
      </p>
    </LegalPage>
  );
}
