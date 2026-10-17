import { errorResponse } from "@/lib/api-helpers";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";
import { BETA_COOKIE, BETA_TTL_SEC, codeMatches, cookieHeader, loadAccessConfig, signToken } from "@/lib/shared/access";

// Codes are long and random, but a guessing run is still capped per client and per instance.
const attempts = createRateLimiter({ limit: 10, windowMs: 10 * 60 * 1000 });

/** Exchanges an invite code for a signed, expiring cookie. The check happens here, on the server. */
export async function POST(request: Request) {
  const access = loadAccessConfig();
  if (!access.gateEnabled || access.misconfigured || !access.signingSecret) {
    return errorResponse("unavailable", "The invite gate isn't configured on this server.");
  }
  const rl = attempts(clientKey(request));
  if (!rl.ok) return errorResponse("rate_limited", "Too many attempts. Try again in a few minutes.", { "Retry-After": String(rl.retryAfterSeconds) });

  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    if (typeof body.code === "string") code = body.code.slice(0, 200);
  } catch {
    return errorResponse("invalid_input", "Request body must be JSON.");
  }
  if (!code || !codeMatches(code, access.betaCodes)) return errorResponse("unauthorized", "That invite code isn't valid.");

  const token = await signToken("beta", access.signingSecret, BETA_TTL_SEC);
  const secure = process.env.NODE_ENV === "production";
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookieHeader(BETA_COOKIE, token, BETA_TTL_SEC, secure), "Cache-Control": "no-store" } });
}
