import { checkBetaGate, errorResponse } from "@/lib/api-helpers";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";
import { PASS_COOKIE, PASS_TTL_SEC, cookieHeader, loadAccessConfig, signToken, verifyTurnstile } from "@/lib/shared/access";

const checks = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });

/**
 * Verifies a Cloudflare Turnstile token on the server and, if it is genuine,
 * sets a short-lived signed "human pass" cookie that the paid endpoints require.
 * Calling the AI endpoints directly with no pass gets a 403, so a script cannot skip the check.
 */
export async function POST(request: Request) {
  const access = loadAccessConfig();
  if (!access.turnstileEnabled) return Response.json({ ok: true, required: false }, { headers: { "Cache-Control": "no-store" } });
  if (access.misconfigured || !access.signingSecret || !access.turnstileSecret) return errorResponse("unavailable", "Verification isn't configured on this server.");

  const gate = await checkBetaGate(request);
  if (gate) return gate;

  const client = clientKey(request);
  const rl = checks(client);
  if (!rl.ok) return errorResponse("rate_limited", "Too many attempts. Try again in a few minutes.", { "Retry-After": String(rl.retryAfterSeconds) });

  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    if (typeof body.token === "string") token = body.token;
  } catch {
    return errorResponse("invalid_input", "Request body must be JSON.");
  }
  const ok = await verifyTurnstile(token, access.turnstileSecret, client);
  if (!ok) return errorResponse("verification_required", "The human check didn't pass. Please try again.");

  const pass = await signToken("pass", access.signingSecret, PASS_TTL_SEC);
  const secure = process.env.NODE_ENV === "production";
  return Response.json({ ok: true, required: true }, { headers: { "Set-Cookie": cookieHeader(PASS_COOKIE, pass, PASS_TTL_SEC, secure), "Cache-Control": "no-store" } });
}
