import type { RoastStreamEvent } from "./stream-events";
import type { ApiError, FixResult, Roast } from "./types";

export class RoastApiError extends Error {
  constructor(
    message: string,
    readonly code: ApiError["error"]["code"] | "network",
  ) {
    super(message);
    this.name = "RoastApiError";
  }
}

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new RoastApiError("Couldn't reach the panel. Check your connection and try again.", "network");
  }
  const json = (await res.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  if (!res.ok || !json || json.error) {
    throw new RoastApiError(json?.error?.message ?? "Something went wrong. Please try again.", json?.error?.code ?? "internal");
  }
  return json;
}

export const requestRoast = (idea: string, signal?: AbortSignal) => post<Roast>("/api/roast", { idea }, signal);

export const requestFix = (idea: string, roast: Roast, signal?: AbortSignal) =>
  post<FixResult>("/api/fix", { idea, roast }, signal);

/**
 * Streams a roast from /api/roast/stream, calling `onEvent` for each event as
 * it arrives. Resolves with the final roast; rejects with RoastApiError.
 */
export async function streamRoast(idea: string, onEvent: (event: RoastStreamEvent) => void, signal?: AbortSignal): Promise<Roast> {
  let res: Response;
  try {
    res = await fetch("/api/roast/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify({ idea }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new RoastApiError("Couldn't reach the panel. Check your connection and try again.", "network");
  }
  if (!res.ok || !res.body) {
    const json = (await res.json().catch(() => null)) as Partial<ApiError> | null;
    throw new RoastApiError(json?.error?.message ?? "Something went wrong. Please try again.", json?.error?.code ?? "internal");
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let final: Roast | null = null;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line) as RoastStreamEvent;
        if (event.type === "error") throw new RoastApiError(event.message, event.code);
        if (event.type === "done") final = event.roast;
        onEvent(event);
      }
    }
  } catch (err) {
    if (err instanceof RoastApiError || (err as Error).name === "AbortError") throw err;
    throw new RoastApiError("The connection to the panel dropped. Please try again.", "network");
  }
  if (!final) throw new RoastApiError("The connection to the panel dropped. Please try again.", "network");
  return final;
}
