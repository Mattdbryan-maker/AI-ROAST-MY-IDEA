/**
 * Runs once when the server starts. Logs the effective AI configuration and the
 * abuse/cost limits (never keys) so an operator can see, in the first log line,
 * which model is live and which protections are on.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadAiConfig } = await import("@/lib/ai/config");
  const { loadGuards } = await import("@/lib/guards");
  const { loadAccessConfig } = await import("@/lib/shared/access");
  const { loadPolicy } = await import("@/lib/shared/admission");
  const { sharedMode } = await import("@/lib/shared/mode");
  const guards = loadGuards();
  const mode = sharedMode();
  const access = loadAccessConfig();

  let ai: Record<string, unknown>;
  try {
    const config = loadAiConfig();
    ai = config.provider === "demo" ? { provider: "demo" } : { provider: config.provider, model: config.model, fixModel: config.fixModel, debate: config.debateMode };
  } catch (err) {
    console.error(`[boot] AI configuration error: ${err instanceof Error ? err.message : String(err)}. Roasts will fail until this is fixed; the app will not fall back to the demo.`);
    return;
  }
  console.info(
    `[boot] ${JSON.stringify({
      ai,
      limiter: mode.use ? { shared: true, store: mode.configured ? "upstash" : "MISSING", policy: loadPolicy() } : { shared: false, guards: { ...guards, maxBodyChars: undefined } },
      betaGate: access.gateEnabled,
      humanCheck: access.turnstileEnabled,
    })}`,
  );

  if (process.env.NODE_ENV === "production") {
    if (mode.required && !mode.configured) {
      console.error("[boot] The shared rate limiter is required for the paid provider but UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL / KV_REST_API_TOKEN) are not set. Every roast and FIX request will be refused until they are.");
    }
    if (access.misconfigured) {
      console.error("[boot] BETA_ACCESS_CODES or TURNSTILE_SECRET_KEY is set but ACCESS_SIGNING_SECRET is missing or shorter than 32 characters. Protected requests will be refused.");
    }
    if (ai.provider === "anthropic" && !access.gateEnabled) {
      console.warn("[boot] No invite gate (BETA_ACCESS_CODES) is active: protect the deployment with Vercel Deployment Protection, or this site is open to anyone with the URL.");
    }
    if (ai.provider === "anthropic" && !access.turnstileEnabled) {
      console.warn("[boot] Cloudflare Turnstile is not configured (TURNSTILE_SECRET_KEY): required before a public launch, optional for an invite-only beta.");
    }
    if (ai.provider === "anthropic" && !process.env.VERCEL && !guards.clientIpHeader) {
      console.warn("[boot] CLIENT_IP_HEADER is not set: per-client rate limiting uses the last x-forwarded-for entry, which is only trustworthy behind exactly one proxy that appends it.");
    }
    if (ai.provider === "anthropic" && mode.required === false) {
      console.warn("[boot] ALLOW_INSTANCE_LOCAL_LIMITS=true: limits are per instance only and do not bound spend across serverless instances.");
    }
    if (ai.provider === "demo") {
      console.warn("[boot] AI_PROVIDER=demo in production: visitors get scripted roasts, not AI output.");
    }
  }
}
