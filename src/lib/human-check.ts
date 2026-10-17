/**
 * Client side of the Cloudflare Turnstile human check. The browser only collects
 * a token; the server verifies it (POST /api/pass) and issues the signed pass the
 * paid endpoints require. Skipping this code gains an attacker nothing.
 *
 * Runs only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set and the server answers
 * "verification_required". The widget runs in `interaction-only` mode, so most
 * visitors never see anything.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const humanCheckConfigured = () => Boolean(SITE_KEY);

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const el = document.createElement("script");
    el.src = SCRIPT_SRC;
    el.async = true;
    el.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    el.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(el);
  });
  return scriptPromise;
}

/** Runs the check and asks the server for a pass. Resolves on success, rejects with a user-readable Error. */
export async function acquireHumanPass(): Promise<void> {
  if (!SITE_KEY) throw new Error("The human check isn't set up on this server yet.");
  const turnstile = await loadScript().catch(() => {
    throw new Error("Couldn't load the human check. Check your connection and try again.");
  });

  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483000";
  document.body.appendChild(holder);
  let widgetId: string | undefined;
  try {
    const token = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("The human check timed out. Please try again.")), 60_000);
      widgetId = turnstile.render(holder, {
        sitekey: SITE_KEY,
        appearance: "interaction-only",
        theme: "dark",
        callback: (t: string) => {
          clearTimeout(timer);
          resolve(t);
        },
        "error-callback": () => {
          clearTimeout(timer);
          reject(new Error("The human check failed. Please try again."));
        },
      });
    });
    const res = await fetch("/api/pass", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(json?.error?.message ?? "The human check didn't pass. Please try again.");
    }
  } finally {
    if (widgetId) turnstile.remove(widgetId);
    holder.remove();
  }
}
