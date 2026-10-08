import { DEFAULT_ANTHROPIC_MODEL } from "./anthropic";
import type { DebateMode } from "./model-provider";
import { DEFAULT_OLLAMA_MODEL, normalizeOllamaHost, type ThinkSetting } from "./ollama";

/**
 * Reads AI configuration from environment variables (server-side only).
 *
 *   AI_PROVIDER = demo | anthropic | ollama
 *     unset → anthropic if ANTHROPIC_API_KEY is set, otherwise demo.
 *
 * An explicit choice that can't work (e.g. AI_PROVIDER=anthropic without a key,
 * or a typo) is an error, never a silent switch to the demo panel: the demo
 * must not be passed off as live AI.
 */

export type AiConfig =
  | { provider: "demo"; demoCps: number }
  | {
      provider: "anthropic";
      apiKey: string;
      model: string;
      fixModel: string;
      effort?: string;
      serverFallback: boolean;
      debateMode: DebateMode;
    }
  | {
      provider: "ollama";
      host: string;
      model: string;
      fixModel: string;
      think: ThinkSetting;
      keepAlive: string;
      numCtx: number;
      temperature: number;
      firstTokenTimeoutMs: number;
      idleTimeoutMs: number;
      debateMode: DebateMode;
    };

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

type Env = Record<string, string | undefined>;

const str = (env: Env, key: string) => env[key]?.trim() || undefined;

function num(env: Env, key: string, fallback: number, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number {
  const raw = str(env, key);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) throw new ConfigError(`${key} must be a number between ${min} and ${max} (got "${raw}")`);
  return n;
}

function debateMode(env: Env): DebateMode {
  const raw = (str(env, "DEBATE_MODE") ?? "single").toLowerCase();
  if (raw !== "single" && raw !== "multi") throw new ConfigError(`DEBATE_MODE must be "single" or "multi" (got "${raw}")`);
  return raw;
}

function think(env: Env): ThinkSetting {
  const raw = (str(env, "OLLAMA_THINK") ?? "false").toLowerCase();
  if (raw === "false" || raw === "0" || raw === "off") return false;
  if (raw === "true" || raw === "1" || raw === "on") return true;
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  throw new ConfigError(`OLLAMA_THINK must be false, true, low, medium or high (got "${raw}")`);
}

export function loadAiConfig(env: Env = process.env): AiConfig {
  const requested = str(env, "AI_PROVIDER")?.toLowerCase();
  const provider = requested ?? (str(env, "ANTHROPIC_API_KEY") ? "anthropic" : "demo");

  switch (provider) {
    case "demo":
      return { provider: "demo", demoCps: num(env, "DEMO_STREAM_CPS", 450, { min: 0, max: 100_000 }) };

    case "anthropic": {
      const apiKey = str(env, "ANTHROPIC_API_KEY");
      if (!apiKey) throw new ConfigError("AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set");
      const model = str(env, "ANTHROPIC_MODEL") ?? DEFAULT_ANTHROPIC_MODEL;
      return {
        provider: "anthropic",
        apiKey,
        model,
        fixModel: str(env, "ANTHROPIC_FIX_MODEL") ?? model,
        effort: str(env, "ANTHROPIC_EFFORT"),
        serverFallback: str(env, "ANTHROPIC_SERVER_FALLBACK")?.toLowerCase() !== "false",
        debateMode: debateMode(env),
      };
    }

    case "ollama": {
      const model = str(env, "OLLAMA_MODEL") ?? DEFAULT_OLLAMA_MODEL;
      let host: string;
      try {
        host = normalizeOllamaHost(str(env, "OLLAMA_HOST"));
      } catch {
        throw new ConfigError(`OLLAMA_HOST is not a valid address (got "${str(env, "OLLAMA_HOST")}")`);
      }
      return {
        provider: "ollama",
        host,
        model,
        fixModel: str(env, "OLLAMA_FIX_MODEL") ?? model,
        think: think(env),
        keepAlive: str(env, "OLLAMA_KEEP_ALIVE") ?? "30m",
        numCtx: num(env, "OLLAMA_NUM_CTX", 8192, { min: 2048, max: 262_144 }),
        temperature: num(env, "OLLAMA_TEMPERATURE", 0.7, { min: 0, max: 2 }),
        firstTokenTimeoutMs: num(env, "OLLAMA_FIRST_TOKEN_TIMEOUT_MS", 120_000, { min: 1000 }),
        idleTimeoutMs: num(env, "OLLAMA_IDLE_TIMEOUT_MS", 45_000, { min: 1000 }),
        debateMode: debateMode(env),
      };
    }

    default:
      throw new ConfigError(`AI_PROVIDER must be "demo", "anthropic" or "ollama" (got "${requested}")`);
  }
}

/** What the UI may know: never keys or hosts. */
export function publicStatus(env: Env = process.env): { mode: "ai" | "demo" | "misconfigured"; provider?: string; model?: string } {
  try {
    const config = loadAiConfig(env);
    if (config.provider === "demo") return { mode: "demo", provider: "demo" };
    return { mode: "ai", provider: config.provider, model: config.model };
  } catch {
    return { mode: "misconfigured" };
  }
}
