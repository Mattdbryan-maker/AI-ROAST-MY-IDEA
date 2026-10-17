import type { Metadata } from "next";
import { ContactLine, LegalPage, OPERATOR } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Contact — AI ROAST MY IDEA" };

export default function ContactPage() {
  return (
    <LegalPage title="Contact" updated="October 2026 (draft)">
      <p>
        Feedback, bug reports, privacy questions or a problem with a roast: write to <ContactLine />.
      </p>
      <p>Operator: {OPERATOR ?? <strong className="text-fix">[operator name not set yet]</strong>}.</p>
      <p>Please do not email confidential business details. Describe the problem instead, and what you expected.</p>
    </LegalPage>
  );
}
