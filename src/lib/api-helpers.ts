import "server-only";
import type { z } from "zod";
import type { ApiError, ApiErrorCode } from "./types";
import { ProviderError } from "./ai";
import { clientKey, createRateLimiter } from "./rate-limit";

const STATUS: Record<ApiErrorCode, number> = {
  invalid_input: 400,
  rate_limited: 429,
  provider_error: 502,
  invalid_response: 502,
  refused: 422,
  internal: 500,
};

export function errorResponse(code: ApiErrorCode, message: string, headers?: HeadersInit): Response {
  const body: ApiError = { error: { code, message } };
  return Response.json(body, { status: STATUS[code], headers });
}

const limiter = createRateLimiter({
  limit: Number(process.env.RATE_LIMIT_PER_10_MIN ?? 20),
  windowMs: 10 * 60 * 1000,
});

/** Shared request pipeline for the AI routes: rate limit → parse → validate → run → map errors. */
export async function handleAiRequest<S extends z.ZodType, R>(
  request: Request,
  schema: S,
  run: (input: z.infer<S>, signal: AbortSignal) => Promise<R>,
): Promise<Response> {
  const rl = limiter(clientKey(request));
  if (!rl.ok) {
    return errorResponse(
      "rate_limited",
      "The panel needs a breather. Try again in a few minutes.",
      { "Retry-After": String(rl.retryAfterSeconds) },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return errorResponse("invalid_input", "Request body must be JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return errorResponse("invalid_input", parsed.error.issues[0]?.message ?? "Invalid request.");
  }

  try {
    const result = await run(parsed.data, request.signal);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ProviderError) {
      console.error(`[ai] ${err.code}: ${err.message}`);
      const message =
        err.code === "refused"
          ? "The panel refused to judge this one. Try a different idea."
          : err.code === "invalid_response"
            ? "The panel got into a fistfight and returned nonsense. Please try again."
            : "The panel walked out (AI provider error). Please try again.";
      return errorResponse(err.code, message);
    }
    console.error("[ai] unexpected error", err);
    return errorResponse("internal", "Something broke backstage. Please try again.");
  }
}
