import { z } from "zod";
import type { RoastChunk } from "./provider";

/**
 * The narrow seam between the app and a model runtime.
 *
 * An LlmClient runs ONE prompt against ONE model and returns text (optionally
 * constrained to a JSON schema). Everything roast-specific — prompts, retries,
 * the debate, validation — lives above it in ModelRoastProvider, so adding a
 * provider means implementing `complete` and `stream` and nothing else.
 */

export type LlmPurpose = "roast" | "fix" | "debate";

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Local runtimes report timings; durations are in milliseconds. */
  loadMs?: number;
  promptEvalMs?: number;
  evalMs?: number;
}

export interface LlmRequest {
  system: string;
  user: string;
  /** When set, the response must be a JSON object matching this schema. Without it the response is plain text. */
  schema?: z.ZodType;
  /** Output budget, including any hidden reasoning the runtime counts against it. */
  maxTokens?: number;
  purpose: LlmPurpose;
  signal?: AbortSignal;
  /** Called once per request with whatever usage the runtime reports. */
  onUsage?: (usage: LlmUsage) => void;
}

export interface LlmClient {
  readonly provider: string;
  readonly model: string;
  complete(req: LlmRequest): Promise<string>;
  /** Streams the response text. A `restart` chunk means everything before it should be discarded. */
  stream(req: LlmRequest): AsyncIterable<RoastChunk>;
  /** Optional runtime details for benchmark reports (model size, quantisation, memory use...). */
  describe?(): Promise<Record<string, unknown>>;
}

/** JSON Schema for runtimes that take a raw schema (Ollama). */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

/**
 * Removes `<think>…</think>` blocks from streamed text.
 *
 * Runtimes are supposed to return reasoning in a separate field, but older
 * runtimes, custom Modelfiles and some templates leak it into the content.
 * Reasoning must never reach the stage, so this strips it even when the tags
 * are split across chunks.
 */
export class ThinkTagStripper {
  private buffer = "";
  private inside = false;

  push(text: string): string {
    this.buffer += text;
    let out = "";
    for (;;) {
      if (this.inside) {
        const end = this.buffer.indexOf("</think>");
        if (end === -1) {
          // Keep only a possible partial closing tag.
          this.buffer = this.buffer.slice(-"</think>".length + 1);
          return out;
        }
        this.buffer = this.buffer.slice(end + "</think>".length);
        this.inside = false;
        continue;
      }
      const start = this.buffer.indexOf("<think>");
      if (start === -1) {
        // Hold back a tail that could be the start of "<think>".
        const hold = partialTagSuffix(this.buffer, "<think>");
        out += this.buffer.slice(0, this.buffer.length - hold);
        this.buffer = this.buffer.slice(this.buffer.length - hold);
        return out;
      }
      out += this.buffer.slice(0, start);
      this.buffer = this.buffer.slice(start + "<think>".length);
      this.inside = true;
    }
  }

  /** Flushes anything held back once the stream has ended. */
  end(): string {
    const rest = this.inside ? "" : this.buffer;
    this.buffer = "";
    return rest;
  }
}

function partialTagSuffix(text: string, tag: string): number {
  for (let n = Math.min(tag.length - 1, text.length); n > 0; n--) {
    if (tag.startsWith(text.slice(-n))) return n;
  }
  return 0;
}

/** Strips reasoning and code fences from a complete (non-streamed) response. */
export function cleanModelText(text: string): string {
  const stripper = new ThinkTagStripper();
  const visible = stripper.push(text) + stripper.end();
  return visible
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}
