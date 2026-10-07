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
