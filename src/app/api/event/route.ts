import { checkBetaGate } from "@/lib/api-helpers";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";
import { CLIENT_EVENTS, bump, type ClientEvent } from "@/lib/shared/stats";
import { upstashCredentials } from "@/lib/shared/store";

const limiter = createRateLimiter({ limit: 40, windowMs: 10 * 60 * 1000 });

/**
 * Counts two anonymous browser events, "visit" and "share". Only the event name
 * is accepted: no idea text, no identifiers, no cookies are read or stored.
 */
export async function POST(request: Request) {
  const gate = await checkBetaGate(request);
  if (gate) return gate;
  if (!limiter(clientKey(request)).ok) return new Response(null, { status: 204 });
  try {
    const { name } = (await request.json()) as { name?: unknown };
    if (typeof name === "string" && (CLIENT_EVENTS as readonly string[]).includes(name as ClientEvent) && upstashCredentials()) {
      await bump(`event_${name}`);
    }
  } catch {
    /* a malformed analytics ping is simply dropped */
  }
  return new Response(null, { status: 204 });
}
