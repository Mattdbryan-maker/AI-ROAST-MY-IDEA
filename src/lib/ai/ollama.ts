import { ThinkTagStripper, cleanModelText, toJsonSchema, type LlmClient, type LlmRequest, type LlmUsage } from "./llm";
import { InvalidResponseError, ProviderError, type RoastChunk } from "./provider";

/**
 * Local inference through Ollama's native /api/chat endpoint (not the
 * OpenAI-compatible one, which lacks `think` and schema-constrained `format`).
 *
 * - Streams NDJSON and yields only `message.content`; `message.thinking`
 *   (reasoning) is discarded, and stray `<think>` tags in content are stripped.
 * - Constrains output with a JSON schema via `format`. Ollama's grammar ignores
 *   schema descriptions, so the schema is also given to the model in the prompt.
 * - Three timeouts: first token (covers loading the model into memory), idle
 *   gap between chunks, and an overall cap. All are cancellable by the caller.
 */

export const DEFAULT_OLLAMA_HOST = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = "qwen3.5:4b";

export type ThinkSetting = boolean | "low" | "medium" | "high";

export interface OllamaClientOptions {
  host?: string;
  model?: string;
  /** Reasoning mode. Off by default: it adds latency and the UI never shows it. */
  think?: ThinkSetting;
  keepAlive?: string;
  numCtx?: number;
  temperature?: number;
  firstTokenTimeoutMs?: number;
  idleTimeoutMs?: number;
  totalTimeoutMs?: number;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

interface ChatChunk {
  message?: { content?: string; thinking?: string };
  done?: boolean;
  done_reason?: string;
  error?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  load_duration?: number;
  prompt_eval_duration?: number;
  eval_duration?: number;
}

/**
 * Accepts the forms people actually put in OLLAMA_HOST: "localhost:11434",
 * "0.0.0.0" (a bind address, not something to connect to), or a full URL.
 */
export function normalizeOllamaHost(raw: string | undefined): string {
  let host = (raw ?? "").trim();
  if (!host) return DEFAULT_OLLAMA_HOST;
  if (!/^https?:\/\//i.test(host)) host = `http://${host}`;
  const url = new URL(host);
  if (url.hostname === "0.0.0.0" || url.hostname === "[::]") url.hostname = "127.0.0.1";
  if (!url.port && url.protocol === "http:") url.port = "11434";
  return url.origin;
}

const nsToMs = (ns?: number) => (typeof ns === "number" ? Math.round(ns / 1e6) : undefined);

export class OllamaClient implements LlmClient {
  readonly provider = "ollama";
  readonly model: string;
  readonly host: string;
  private readonly opts: Required<Omit<OllamaClientOptions, "host" | "model" | "fetch">>;
  private readonly fetchImpl: typeof fetch;
  /** Set when the server rejects the `think` field (older Ollama or a model without the switch). */
  private omitThink = false;

  constructor(options: OllamaClientOptions = {}) {
    this.host = normalizeOllamaHost(options.host);
    this.model = options.model?.trim() || DEFAULT_OLLAMA_MODEL;
    this.fetchImpl = options.fetch ?? fetch;
    this.opts = {
      think: options.think ?? false,
      keepAlive: options.keepAlive ?? "30m",
      numCtx: options.numCtx ?? 8192,
      temperature: options.temperature ?? 0.7,
      firstTokenTimeoutMs: options.firstTokenTimeoutMs ?? 120_000,
      idleTimeoutMs: options.idleTimeoutMs ?? 45_000,
      totalTimeoutMs: options.totalTimeoutMs ?? 300_000,
    };
  }

  async complete(req: LlmRequest): Promise<string> {
    let text = "";
    for await (const chunk of this.stream(req)) {
      text = chunk.type === "restart" ? "" : text + chunk.text;
    }
    return cleanModelText(text);
  }

  async *stream(req: LlmRequest): AsyncGenerator<RoastChunk> {
    const timer = new StreamTimer(this.opts, req.signal);
    let reader: ReadableStreamDefaultReader<string> | undefined;
    try {
      const res = await this.post(req, timer.signal);
      reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      const stripper = new ThinkTagStripper();
      let buffer = "";
      let finished = false;

      while (!finished) {
        const { value, done } = await timer.race(reader.read());
        if (done) break;
        buffer += value;
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const chunk = parseChunk(line);
          if (chunk.error) throw new ProviderError(`Ollama error: ${chunk.error}`);
          timer.gotData();
          const content = chunk.message?.content;
          if (content) {
            const visible = stripper.push(content);
            if (visible) yield { type: "text", text: visible };
          }
          if (chunk.done) {
            finished = true;
            const tail = stripper.end();
            if (tail) yield { type: "text", text: tail };
            req.onUsage?.(usageOf(chunk));
            if (chunk.done_reason === "length") {
              throw new InvalidResponseError("The model ran out of output tokens (raise OLLAMA_NUM_CTX or shorten the prompt)");
            }
            break;
          }
        }
      }
      if (!finished) throw new InvalidResponseError("The Ollama stream ended before the model finished");
    } catch (err) {
      throw timer.explain(err, this);
    } finally {
      timer.dispose();
      // Always close the connection, including when the consumer stops early: Ollama stops generating when it closes.
      void reader?.cancel().catch(() => {});
    }
  }

  private body(req: LlmRequest, stream: boolean) {
    let system = req.system;
    let format: Record<string, unknown> | undefined;
    if (req.schema) {
      format = toJsonSchema(req.schema);
      // Ollama turns the schema into a grammar and drops its descriptions, which carry
      // instructions (counts, lengths). Show the model the schema too, as Ollama recommends.
      system += `\n\nRespond with a single JSON object that follows this JSON schema exactly:\n${JSON.stringify(format)}`;
    }
    return {
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: req.user },
      ],
      stream,
      ...(format ? { format } : {}),
      ...(this.omitThink ? {} : { think: this.opts.think }),
      keep_alive: this.opts.keepAlive,
      options: {
        temperature: this.opts.temperature,
        top_p: 0.8,
        top_k: 20,
        num_ctx: this.opts.numCtx,
        ...(req.maxTokens ? { num_predict: req.maxTokens } : {}),
      },
    };
  }

  private async post(req: LlmRequest, signal: AbortSignal): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.host}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.body(req, true)),
          signal,
        });
      } catch (err) {
        if (signal.aborted) throw err;
        throw new ProviderError(
          `Can't reach Ollama at ${this.host}. Is it running? Start it with "ollama serve" or the Ollama app.`,
          "provider_error",
          false,
        );
      }
      if (res.ok && res.body) return res;

      const message = await errorMessage(res);
      if (res.status === 404 || /not found/i.test(message)) {
        throw new ProviderError(`Ollama doesn't have the model "${this.model}". Run: ollama pull ${this.model}`, "provider_error", false);
      }
      // Older servers or models without a thinking switch reject `think`; retry once without it.
      if (res.status === 400 && !this.omitThink && /think/i.test(message)) {
        this.omitThink = true;
        continue;
      }
      throw new ProviderError(`Ollama rejected the request (${res.status}): ${message}`, "provider_error", res.status >= 500);
    }
    throw new ProviderError("Ollama rejected the request", "provider_error", false);
  }

  async describe(): Promise<Record<string, unknown>> {
    const info: Record<string, unknown> = { host: this.host, model: this.model, think: this.opts.think, numCtx: this.opts.numCtx };
    try {
      const [version, show, ps] = await Promise.all([
        this.fetchImpl(`${this.host}/api/version`).then((r) => r.json()),
        this.fetchImpl(`${this.host}/api/show`, { method: "POST", body: JSON.stringify({ model: this.model }) }).then((r) => r.json()),
        this.fetchImpl(`${this.host}/api/ps`).then((r) => r.json()),
      ]);
      info.ollamaVersion = version?.version;
      info.details = show?.details;
      info.capabilities = show?.capabilities;
      const loaded = (ps?.models ?? []).find((m: { name?: string; model?: string }) => m.name === this.model || m.model === this.model);
      if (loaded) {
        info.loadedSizeBytes = loaded.size;
        info.loadedVramBytes = loaded.size_vram;
      }
    } catch {
      info.describeError = "Could not query Ollama for model details";
    }
    return info;
  }
}

function parseChunk(line: string): ChatChunk {
  try {
    return JSON.parse(line) as ChatChunk;
  } catch {
    throw new InvalidResponseError("Ollama sent a malformed stream line");
  }
}

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    return (JSON.parse(text) as { error?: string }).error ?? text;
  } catch {
    return text || res.statusText;
  }
}

function usageOf(chunk: ChatChunk): LlmUsage {
  return {
    inputTokens: chunk.prompt_eval_count,
    outputTokens: chunk.eval_count,
    loadMs: nsToMs(chunk.load_duration),
    promptEvalMs: nsToMs(chunk.prompt_eval_duration),
    evalMs: nsToMs(chunk.eval_duration),
  };
}

/**
 * Enforces the three timeouts and merges them with the caller's abort signal.
 * Timeouts become friendly ProviderErrors; a caller abort stays an AbortError.
 */
class StreamTimer {
  readonly signal: AbortSignal;
  private readonly controller = new AbortController();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private idle?: ReturnType<typeof setTimeout>;
  private reason: "first_token" | "idle" | "total" | null = null;
  private sawData = false;
  private rejectPending?: (err: unknown) => void;

  constructor(
    private readonly opts: { firstTokenTimeoutMs: number; idleTimeoutMs: number; totalTimeoutMs: number },
    external?: AbortSignal,
  ) {
    this.signal = external ? AbortSignal.any([external, this.controller.signal]) : this.controller.signal;
    this.arm("total", opts.totalTimeoutMs);
    this.idle = this.arm("first_token", opts.firstTokenTimeoutMs);
  }

  private arm(reason: "first_token" | "idle" | "total", ms: number) {
    const t = setTimeout(() => {
      this.reason = reason;
      this.controller.abort();
      this.rejectPending?.(new DOMException("timeout", "AbortError"));
    }, ms);
    this.timers.add(t);
    return t;
  }

  gotData() {
    this.sawData = true;
    if (this.idle) {
      clearTimeout(this.idle);
      this.timers.delete(this.idle);
    }
    this.idle = this.arm("idle", this.opts.idleTimeoutMs);
  }

  /** Awaits a read, but lets a timeout interrupt it even if the runtime ignores the abort. */
  race<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.rejectPending = reject;
      promise.then(resolve, reject);
    });
  }

  explain(err: unknown, client: OllamaClient): unknown {
    if (this.reason === "first_token" && !this.sawData) {
      return new ProviderError(
        `Ollama didn't start answering within ${Math.round(this.opts.firstTokenTimeoutMs / 1000)}s. The model "${client.model}" may still be loading, or be too large for this machine.`,
        "provider_error",
        false,
      );
    }
    if (this.reason === "idle") {
      return new ProviderError(`Ollama stopped responding for ${Math.round(this.opts.idleTimeoutMs / 1000)}s mid-answer.`, "provider_error", false);
    }
    if (this.reason === "total") {
      return new ProviderError(`Ollama took longer than ${Math.round(this.opts.totalTimeoutMs / 1000)}s to answer.`, "provider_error", false);
    }
    // The socket died under us (Ollama crashed, ran out of memory, or was restarted).
    if (err instanceof TypeError && !this.signal.aborted) {
      return new ProviderError("The connection to Ollama dropped mid-answer. Check the Ollama logs (it may have run out of memory).", "provider_error", false);
    }
    return err;
  }

  dispose() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
