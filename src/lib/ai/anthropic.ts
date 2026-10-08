import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { cleanModelText, type LlmClient, type LlmRequest, type LlmUsage } from "./llm";
import { ModelRoastProvider, type ModelRoastProviderOptions } from "./model-provider";
import { InvalidResponseError, ProviderError, type RoastChunk } from "./provider";

/**
 * Claude via the Anthropic SDK.
 *
 * Request shape (unchanged from v1): adaptive thinking with an explicit effort
 * level, structured outputs from the Zod schema, a prompt-cached system prompt,
 * and server-side refusal fallbacks on the models that support them.
 */

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

/**
 * Models that accept `fallbacks: "default"` on the Claude API. Claude Haiku 5.5
 * has no server-side fallback (sending it would be pointless), so it's not here.
 */
const SERVER_FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export interface AnthropicClientOptions {
  apiKey: string;
  model?: string;
  effort?: string;
  /** Opt out of server-side refusal fallbacks (e.g. when proxying through a gateway that rejects the field). */
  serverFallback?: boolean;
  /** Injectable for tests. */
  client?: Anthropic;
}

export class AnthropicClient implements LlmClient {
  readonly provider = "anthropic";
  readonly model: string;
  readonly effort: Effort;
  private readonly client: Anthropic;
  private readonly serverFallback: boolean;

  constructor(opts: AnthropicClientOptions) {
    // The SDK retries 408/409/429/5xx and connection errors on its own.
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, maxRetries: 2, timeout: 120_000 });
    this.model = opts.model?.trim() || DEFAULT_ANTHROPIC_MODEL;
    // Low effort by default: the panel's output is short and users are watching a loading sequence.
    this.effort = EFFORTS.includes(opts.effort as Effort) ? (opts.effort as Effort) : "low";
    this.serverFallback = (opts.serverFallback ?? true) && SERVER_FALLBACK_MODELS.has(this.model);
  }

  async complete(req: LlmRequest): Promise<string> {
    let message;
    try {
      message = await this.client.beta.messages.create(this.params(req), { signal: req.signal });
    } catch (err) {
      throw mapApiError(err);
    }
    req.onUsage?.(usageOf(message.usage));
    checkStopReason(message.stop_reason);
    const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
    const clean = cleanModelText(text);
    if (!clean) throw new InvalidResponseError("Model returned no text");
    return clean;
  }

  /**
   * Streams the response text. Thinking blocks are skipped; if the server falls
   * back to another model mid-response, a `fallback` block starts the content
   * over, which we surface as a restart.
   */
  async *stream(req: LlmRequest): AsyncGenerator<RoastChunk> {
    let sawText = false;
    try {
      const stream = this.client.beta.messages.stream(this.params(req), { signal: req.signal });
      for await (const event of stream) {
        if (event.type === "content_block_start" && event.content_block.type === "fallback" && sawText) {
          sawText = false;
          yield { type: "restart" };
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          sawText = true;
          yield { type: "text", text: event.delta.text };
        }
      }
      const final = await stream.finalMessage();
      req.onUsage?.(usageOf(final.usage));
      checkStopReason(final.stop_reason);
    } catch (err) {
      throw mapApiError(err);
    }
  }

  async describe(): Promise<Record<string, unknown>> {
    return { model: this.model, effort: this.effort, serverFallback: this.serverFallback };
  }

  private params(req: LlmRequest): MessageCreateParamsNonStreaming {
    const params: MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: req.maxTokens ?? 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: this.effort, ...(req.schema ? { format: zodOutputFormat(req.schema) } : {}) },
      // Stable system prompt first so it can be served from the prompt cache.
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: req.user }],
    };
    if (this.serverFallback) {
      params.betas = ["server-side-fallback-2026-07-01"];
      params.fallbacks = "default";
    }
    return params;
  }
}

/** Claude-backed roast provider. Kept as a named class for callers and tests that construct it directly. */
export class AnthropicProvider extends ModelRoastProvider {
  constructor(opts: AnthropicClientOptions & { fixModel?: string } & Omit<ModelRoastProviderOptions, "fixClient">) {
    const client = new AnthropicClient(opts);
    const fixClient = opts.fixModel && opts.fixModel !== client.model ? new AnthropicClient({ ...opts, model: opts.fixModel }) : undefined;
    super(client, { ...opts, fixClient });
  }
}

function usageOf(usage: unknown): LlmUsage {
  const u = (usage ?? {}) as Record<string, number | null | undefined>;
  return {
    inputTokens: u.input_tokens ?? undefined,
    outputTokens: u.output_tokens ?? undefined,
    cacheReadTokens: u.cache_read_input_tokens ?? undefined,
    cacheWriteTokens: u.cache_creation_input_tokens ?? undefined,
  };
}

function checkStopReason(stopReason: string | null) {
  if (stopReason === "refusal") throw new ProviderError("The panel refused to judge this one.", "refused", false);
  if (stopReason === "max_tokens") throw new InvalidResponseError("Model response was cut off");
}

/** Typed SDK errors → our provider errors. Anything already ours passes through. */
function mapApiError(err: unknown): unknown {
  if (err instanceof ProviderError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new ProviderError("The AI provider rejected the API key.", "provider_error", false);
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new ProviderError(`The AI provider doesn't recognise the model: ${err.message}`, "provider_error", false);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ProviderError("The AI provider is rate limiting us. Try again in a moment.");
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new ProviderError(`The AI provider rejected the request: ${err.message}`, "provider_error", false);
  }
  if (err instanceof Anthropic.APIError) {
    return new ProviderError(`The AI provider failed: ${err.message}`);
  }
  return err;
}
