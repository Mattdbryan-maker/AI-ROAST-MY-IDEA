import { STANDALONE } from "./runtime";

/**
 * Anonymous event counting. Sends only an event name ("visit" or "share") to
 * /api/event, which increments a daily counter. No cookie, no identifier, no
 * idea text and no third party is involved, and the browser's Do Not Track and
 * Global Privacy Control signals are honoured.
 */
export type TrackedEvent = "visit" | "share";

function optedOut(): boolean {
  if (typeof navigator === "undefined") return true;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === "1" || nav.globalPrivacyControl === true;
}

export function track(name: TrackedEvent): void {
  if (STANDALONE || optedOut()) return;
  try {
    if (name === "visit") {
      // Once per browser tab session, not on every render or navigation.
      if (sessionStorage.getItem("ar_visit") === "1") return;
      sessionStorage.setItem("ar_visit", "1");
    }
  } catch {
    /* storage blocked: count the visit anyway */
  }
  void fetch("/api/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
    keepalive: true,
  }).catch(() => {});
}
