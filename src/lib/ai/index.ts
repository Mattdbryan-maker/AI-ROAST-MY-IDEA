import "server-only";
import { AnthropicProvider } from "./anthropic";
import { DemoProvider } from "./demo/engine";
import type { RoastProvider } from "./provider";

export type { RoastProvider } from "./provider";
export { ProviderError, InvalidResponseError } from "./provider";

/**
 * Picks the AI provider from environment configuration.
 *
 *   AI_PROVIDER=anthropic | demo   (default: anthropic when ANTHROPIC_API_KEY is set, otherwise demo)
 *
 * To add a provider: implement RoastProvider and add a case below.
 */
export function resolveProviderName(env: NodeJS.ProcessEnv = process.env): "anthropic" | "demo" {
  const requested = env.AI_PROVIDER?.trim().toLowerCase();
  if (requested === "demo") return "demo";
  if (requested === "anthropic") return env.ANTHROPIC_API_KEY ? "anthropic" : "demo";
  return env.ANTHROPIC_API_KEY ? "anthropic" : "demo";
}

let cached: RoastProvider | null = null;

export function getProvider(): RoastProvider {
  if (cached) return cached;
  const name = resolveProviderName();
  if (name === "anthropic") {
    cached = new AnthropicProvider({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      model: process.env.ANTHROPIC_MODEL,
      effort: process.env.ANTHROPIC_EFFORT,
      serverFallback: process.env.ANTHROPIC_SERVER_FALLBACK !== "false",
    });
  } else {
    if (process.env.AI_PROVIDER === "anthropic") {
      console.warn("[ai] AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing — using the demo panel.");
    }
    cached = new DemoProvider({ cps: Number(process.env.DEMO_STREAM_CPS ?? 450) });
  }
  return cached;
}
