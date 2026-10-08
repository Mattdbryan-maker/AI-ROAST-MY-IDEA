/**
 * Runs once when the server starts. Logs the effective AI configuration and the
 * abuse/cost limits (never keys) so an operator can see, in the first log line,
 * which model is live and which protections are on.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadAiConfig } = await import("@/lib/ai/config");
  const { loadGuards } = await import("@/lib/guards");
  const guards = loadGuards();

  let ai: Record<string, unknown>;
  try {
    const config = loadAiConfig();
    ai = config.provider === "demo" ? { provider: "demo" } : { provider: config.provider, model: config.model, fixModel: config.fixModel, debate: config.debateMode };
  } catch (err) {
    console.error(`[boot] AI configuration error: ${err instanceof Error ? err.message : String(err)}. Roasts will fail until this is fixed; the app will not fall back to the demo.`);
    return;
  }
  console.info(`[boot] ${JSON.stringify({ ai, guards: { ...guards, maxBodyChars: undefined } })}`);

  if (process.env.NODE_ENV === "production") {
    if (!guards.clientIpHeader) {
      console.warn("[boot] CLIENT_IP_HEADER is not set: per-client rate limiting uses the last x-forwarded-for entry, which is only trustworthy behind exactly one proxy that appends it.");
    }
    if (ai.provider === "anthropic" && ai.model !== "claude-haiku-5-5") {
      console.warn(`[boot] ANTHROPIC_MODEL is ${String(ai.model)}, not claude-haiku-5-5: expect a much higher cost per roast. Intended?`);
    }
    if (ai.provider === "anthropic" && guards.dailySpendUsd === 0 && guards.dailyRequests === 0) {
      console.warn("[boot] No daily request or spend cap is active. Set DAILY_AI_REQUEST_LIMIT / DAILY_SPEND_LIMIT_USD and a spend limit in the Anthropic console.");
    }
  }
}
