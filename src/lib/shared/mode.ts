import { loadAiConfig } from "../ai/config";
import { upstashCredentials } from "./store";

type Env = Record<string, string | undefined>;

export interface SharedMode {
  /** Production on a paid provider: the shared limiter is mandatory and its absence fails requests. */
  required: boolean;
  /** Upstash credentials are present. */
  configured: boolean;
  /** Use the shared admission path (otherwise the instance-local guards in guards.ts apply). */
  use: boolean;
}

/**
 * The shared limiter is mandatory exactly where money is at stake: production
 * with the Anthropic provider. Demo and Ollama cost nothing, so local
 * development, the e2e suites and self-hosted Ollama keep the instance-local
 * guards. ALLOW_INSTANCE_LOCAL_LIMITS=true is an explicit opt-out for a
 * single-process self-hosted deployment; it is never the default.
 */
export function sharedMode(env: Env = process.env): SharedMode {
  let paidProduction = false;
  if (env.NODE_ENV === "production") {
    try {
      paidProduction = loadAiConfig(env).provider === "anthropic";
    } catch {
      // A broken AI configuration fails on its own; treat it as paid so nothing is lenient meanwhile.
      paidProduction = true;
    }
  }
  const required = paidProduction && env.ALLOW_INSTANCE_LOCAL_LIMITS !== "true";
  const configured = upstashCredentials(env) !== null;
  return { required, configured, use: required || configured };
}
