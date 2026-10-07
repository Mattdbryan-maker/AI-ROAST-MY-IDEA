import type { FixResult, Roast } from "../types";

/** A piece of a streaming roast: raw JSON text, or a signal that the response restarted (e.g. a model fallback). */
export type RoastChunk = { type: "text"; text: string } | { type: "restart" };

/**
 * The only contract the rest of the app knows about. Swap providers by
 * implementing this interface and registering it in `./index.ts`.
 */
export interface RoastProvider {
  readonly name: string;
  readonly mode: "ai" | "demo";
  roast(idea: string, signal?: AbortSignal): Promise<Roast>;
  /** Streams the roast as raw JSON text in the shape of ModelRoastSchema. See ./stream.ts. */
  roastStream(idea: string, signal?: AbortSignal): AsyncIterable<RoastChunk>;
  fix(idea: string, roast: Roast, signal?: AbortSignal): Promise<FixResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: "provider_error" | "invalid_response" | "refused" = "provider_error",
    readonly retryable = true,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class InvalidResponseError extends ProviderError {
  constructor(message: string) {
    super(message, "invalid_response", true);
    this.name = "InvalidResponseError";
  }
}
