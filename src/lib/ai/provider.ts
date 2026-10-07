import type { FixResult, Roast } from "../types";

/**
 * The only contract the rest of the app knows about. Swap providers by
 * implementing this interface and registering it in `./index.ts`.
 */
export interface RoastProvider {
  readonly name: string;
  readonly mode: "ai" | "demo";
  roast(idea: string, signal?: AbortSignal): Promise<Roast>;
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
