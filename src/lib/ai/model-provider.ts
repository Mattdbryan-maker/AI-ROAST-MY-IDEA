import type { FixResult, PersonaId, Roast } from "../types";
import type { LlmClient, LlmPurpose, LlmRequest, LlmUsage } from "./llm";
import { extractJson, normalizeFix, normalizeRoast, normalizeTake } from "./normalize";
import {
  DEBATE_TURN_SYSTEM_PROMPT,
  FIX_SYSTEM_PROMPT,
  ModelFixSchema,
  ModelRoastSchema,
  ModelRoastStageOneSchema,
  ROAST_SYSTEM_PROMPT,
  buildDebateTurnMessage,
  buildFixUserMessage,
  buildRoastUserMessage,
  buildStageOneUserMessage,
  planDebate,
} from "./prompts";
import { InvalidResponseError, type RoastChunk, type RoastProvider } from "./provider";

/**
 * A RoastProvider backed by any LlmClient (Claude, Qwen via Ollama, ...).
 *
 * Debate modes:
 * - "single" (default): one generation writes the testimonies and the debate.
 *   Cheapest and fastest; the model simulates the cross-talk.
 * - "multi" (experimental): one generation writes everything except the
 *   debate, then each debate line is a separate call in which that speaker
 *   sees the transcript so far. Costs ~5 extra short calls. Its stream is
 *   stitched into the same JSON shape, so the UI and validation are unchanged.
 */

export type DebateMode = "single" | "multi";

export interface UsageRecord {
  purpose: LlmPurpose;
  provider: string;
  model: string;
  usage: LlmUsage;
}

export interface ModelRoastProviderOptions {
  debateMode?: DebateMode;
  /** A different (e.g. cheaper or stronger) model for FIX MY IDEA. Defaults to the roast model. */
  fixClient?: LlmClient;
  /** Usage observer, used by the benchmark. */
  onUsage?: (record: UsageRecord) => void;
}

const ROAST_MAX_TOKENS = 16000;
const FIX_MAX_TOKENS = 16000;
const DEBATE_TURN_MAX_TOKENS = 2000;

export class ModelRoastProvider implements RoastProvider {
  readonly mode = "ai" as const;
  readonly debateMode: DebateMode;
  private readonly fixClient: LlmClient;

  constructor(
    readonly client: LlmClient,
    private readonly options: ModelRoastProviderOptions = {},
  ) {
    this.debateMode = options.debateMode ?? "single";
    this.fixClient = options.fixClient ?? client;
  }

  get name(): string {
    return this.client.provider;
  }

  /** "ollama:qwen3.5:4b", "anthropic:claude-haiku-5-5" … */
  get label(): string {
    return `${this.client.provider}:${this.client.model}`;
  }

  async roast(idea: string, signal?: AbortSignal): Promise<Roast> {
    return withRetry(async () => {
      if (this.debateMode === "multi") {
        let text = "";
        for await (const chunk of this.roastStream(idea, signal)) text = chunk.type === "restart" ? "" : text + chunk.text;
        return normalizeRoast(extractJson(text), "ai");
      }
      const raw = await this.client.complete(
        this.request("roast", { system: ROAST_SYSTEM_PROMPT, user: buildRoastUserMessage(idea), schema: ModelRoastSchema, maxTokens: ROAST_MAX_TOKENS, signal }),
      );
      return normalizeRoast(extractJson(raw), "ai");
    });
  }

  roastStream(idea: string, signal?: AbortSignal): AsyncIterable<RoastChunk> {
    if (this.debateMode === "multi") return this.multiDebateStream(idea, signal);
    return this.client.stream(
      this.request("roast", { system: ROAST_SYSTEM_PROMPT, user: buildRoastUserMessage(idea), schema: ModelRoastSchema, maxTokens: ROAST_MAX_TOKENS, signal }),
    );
  }

  async fix(idea: string, roast: Roast, signal?: AbortSignal): Promise<FixResult> {
    return withRetry(async () => {
      const raw = await this.fixClient.complete(
        this.request("fix", { system: FIX_SYSTEM_PROMPT, user: buildFixUserMessage(idea, roast), schema: ModelFixSchema, maxTokens: FIX_MAX_TOKENS, signal }, this.fixClient),
      );
      return normalizeFix(extractJson(raw), "ai");
    });
  }

  private request(purpose: LlmPurpose, req: Omit<LlmRequest, "purpose" | "onUsage">, client: LlmClient = this.client): LlmRequest {
    return {
      ...req,
      purpose,
      onUsage: (usage) => this.options.onUsage?.({ purpose, provider: client.provider, model: client.model, usage }),
    };
  }

  /**
   * Streams stage 1 as-is (minus its closing brace), then appends
   * `,"debate":[…]}` with each line streamed live from its own call.
   */
  private async *multiDebateStream(idea: string, signal?: AbortSignal): AsyncGenerator<RoastChunk> {
    const holder = new ClosingBraceHolder();
    let stageOneText = "";
    for await (const chunk of this.client.stream(
      this.request("roast", { system: ROAST_SYSTEM_PROMPT, user: buildStageOneUserMessage(idea), schema: ModelRoastStageOneSchema, maxTokens: ROAST_MAX_TOKENS, signal }),
    )) {
      if (chunk.type === "restart") {
        holder.reset();
        stageOneText = "";
        yield chunk;
        continue;
      }
      stageOneText += chunk.text;
      const out = holder.push(chunk.text);
      if (out) yield { type: "text", text: out };
    }

    const stageOne = extractJson(stageOneText) as { title?: unknown; takes?: unknown };
    const takes = (Array.isArray(stageOne.takes) ? stageOne.takes : []).map(normalizeTake);
    if (takes.length < 4 || takes.some((t) => !t) || new Set(takes.map((t) => t!.persona)).size !== 4) {
      throw new InvalidResponseError("Stage one did not produce four valid testimonies");
    }
    const validTakes = takes as Roast["takes"];
    yield { type: "text", text: holder.finish() };
    yield { type: "text", text: ',"debate":[' };

    const transcript: Roast["debate"] = [];
    for (const [i, turn] of planDebate(validTakes).entries()) {
      yield { type: "text", text: `${i ? "," : ""}{"speaker":${JSON.stringify(turn.speaker)},"line":"` };
      const line = new DebateLineSanitizer(turn.speaker);
      for await (const chunk of this.client.stream(
        this.request("debate", {
          system: DEBATE_TURN_SYSTEM_PROMPT,
          user: buildDebateTurnMessage(idea, { title: String(stageOne.title ?? ""), takes: validTakes }, transcript, turn),
          maxTokens: DEBATE_TURN_MAX_TOKENS,
          signal,
        }),
      )) {
        // Text already shown can't be taken back, so a mid-turn restart fails the whole attempt (and is retried).
        if (chunk.type === "restart") throw new InvalidResponseError("A debate turn restarted mid-stream");
        const delta = line.push(chunk.text);
        if (delta) yield { type: "text", text: escapeJsonString(delta) };
      }
      const { tail, line: final } = line.finish();
      if (!final) throw new InvalidResponseError(`Debate turn ${i + 1} was empty`);
      yield { type: "text", text: `${escapeJsonString(tail)}"}` };
      transcript.push({ speaker: turn.speaker, line: final });
    }
    yield { type: "text", text: "]}" };
  }
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof InvalidResponseError) {
      console.warn(`[ai] invalid response, retrying once: ${err.message}`);
      return fn();
    }
    throw err;
  }
}

const escapeJsonString = (text: string) => JSON.stringify(text).slice(1, -1);

/**
 * Passes streamed JSON through, but holds back a trailing `}` (and whitespace)
 * so the final closing brace of the object can be removed and more keys added.
 */
export class ClosingBraceHolder {
  private held = "";

  push(text: string): string {
    const combined = this.held + text;
    const tail = combined.match(/[\s}]*$/)?.[0] ?? "";
    this.held = tail;
    return combined.slice(0, combined.length - tail.length);
  }

  /** Everything except the final `}`. */
  finish(): string {
    const idx = this.held.lastIndexOf("}");
    if (idx === -1) throw new InvalidResponseError("Stage one JSON was not closed");
    const out = this.held.slice(0, idx);
    this.held = "";
    return out;
  }

  reset() {
    this.held = "";
  }
}

/**
 * Turns a model's free-text debate reply into one clean line, live:
 * drops a leading speaker label or quote, stops at the first line break,
 * and holds back a possible closing quote. Only ever appends, so it can
 * stream; `finish()` returns whatever was held back.
 */
export class DebateLineSanitizer {
  private raw = "";
  private emitted = "";
  private readonly label: RegExp;

  constructor(speaker: PersonaId) {
    const names = ["STERLING", "KERNEL", "HYPE", "WALLET", speaker].join("|");
    this.label = new RegExp(`^\\s*(?:\\*\\*)?(?:${names})(?:\\*\\*)?\\s*[:\\-–—]\\s*`, "i");
  }

  private current(final: boolean): string {
    // Until a few words are in, a speaker label ("KERNEL:") can't be told apart from speech.
    if (!final && this.raw.trimStart().length < 16 && !this.raw.includes("\n")) return "";
    let text = this.raw.replace(this.label, "").replace(/^\s*["“']+/, "").trimStart();
    const lineBreak = text.indexOf("\n");
    if (lineBreak > 0) text = text.slice(0, lineBreak);
    text = text.replace(/\s+/g, " ");
    return final ? text.replace(/["”'\s]+$/, "") : text.replace(/["”']+\s*$/, "");
  }

  push(text: string): string {
    this.raw += text;
    const next = this.current(false);
    if (!next.startsWith(this.emitted)) return "";
    const delta = next.slice(this.emitted.length);
    this.emitted = next;
    return delta;
  }

  /** The held-back remainder to emit, and the complete line. */
  finish(): { tail: string; line: string } {
    const final = this.current(true);
    const tail = final.startsWith(this.emitted) ? final.slice(this.emitted.length) : "";
    this.emitted += tail;
    return { tail, line: this.emitted.trim() };
  }
}
