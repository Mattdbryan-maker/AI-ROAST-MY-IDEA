import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import type { FixResult, Roast } from "../types";
import { extractJson, normalizeFix, normalizeRoast } from "./normalize";
import {
  FIX_SYSTEM_PROMPT,
  ModelFixSchema,
  ModelRoastSchema,
  ROAST_SYSTEM_PROMPT,
  buildFixUserMessage,
  buildRoastUserMessage,
} from "./prompts";
import { InvalidResponseError, ProviderError, type RoastProvider } from "./provider";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** Models that accept the server-side `fallbacks: "default"` parameter on the Claude API. */
const SERVER_FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  effort?: string;
  /** Opt out of server-side refusal fallbacks (e.g. when proxying through a gateway that rejects the field). */
  serverFallback?: boolean;
  /** Injectable for tests. */
  client?: Anthropic;
}

export class AnthropicProvider implements RoastProvider {
  readonly name = "anthropic";
  readonly mode = "ai" as const;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly effort: Effort;
  private readonly serverFallback: boolean;

  constructor(opts: AnthropicProviderOptions) {
    // The SDK retries 408/409/429/5xx and connection errors on its own.
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: 120_000 });
    this.model = opts.model || DEFAULT_ANTHROPIC_MODEL;
    // Low effort by default: the panel's output is short and users are watching a loading sequence.
    this.effort = EFFORTS.includes(opts.effort as Effort) ? (opts.effort as Effort) : "low";
    this.serverFallback = (opts.serverFallback ?? true) && SERVER_FALLBACK_MODELS.has(this.model);
  }

  async roast(idea: string, signal?: AbortSignal): Promise<Roast> {
    return this.withRetry(async () => {
      const raw = await this.complete(ROAST_SYSTEM_PROMPT, buildRoastUserMessage(idea), ModelRoastSchema, signal);
      return normalizeRoast(raw, "ai");
    });
  }

  async fix(idea: string, roast: Roast, signal?: AbortSignal): Promise<FixResult> {
    return this.withRetry(async () => {
      const raw = await this.complete(FIX_SYSTEM_PROMPT, buildFixUserMessage(idea, roast), ModelFixSchema, signal);
      return normalizeFix(raw, "ai");
    });
  }

  /** One extra attempt when the model returns something we can't safely render. */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof InvalidResponseError) {
        console.warn(`[anthropic] invalid response, retrying once: ${err.message}`);
        return fn();
      }
      throw err;
    }
  }

  private async complete(system: string, user: string, schema: z.ZodType, signal?: AbortSignal): Promise<unknown> {
    const params: MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: this.effort, format: zodOutputFormat(schema) },
      // Stable system prompt first so it can be served from the prompt cache.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    };
    if (this.serverFallback) {
      params.betas = ["server-side-fallback-2026-07-01"];
      params.fallbacks = "default";
    }

    let message;
    try {
      message = await this.client.beta.messages.create(params, { signal });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new ProviderError("The AI provider rejected the API key.", "provider_error", false);
      }
      if (err instanceof Anthropic.RateLimitError) {
        throw new ProviderError("The AI provider is rate limiting us. Try again in a moment.");
      }
      if (err instanceof Anthropic.BadRequestError) {
        throw new ProviderError(`The AI provider rejected the request: ${err.message}`, "provider_error", false);
      }
      if (err instanceof Anthropic.APIError) {
        throw new ProviderError(`The AI provider failed: ${err.message}`);
      }
      throw err;
    }

    if (message.stop_reason === "refusal") {
      throw new ProviderError("The panel refused to judge this one.", "refused", false);
    }
    if (message.stop_reason === "max_tokens") {
      throw new InvalidResponseError("Model response was cut off");
    }
    const text = message.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    if (!text) throw new InvalidResponseError("Model returned no text");
    return extractJson(text);
  }
}
