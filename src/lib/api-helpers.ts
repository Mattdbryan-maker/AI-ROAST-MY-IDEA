import "server-only";
import type { z } from "zod";
import type { ApiError, ApiErrorCode } from "./types";
import { ProviderError } from "./ai";
import { acquireSlot, loadGuards, spentTodayUsd } from "./guards";
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

/** Maps anything thrown while running the AI to a safe, user-facing error. Logs the detail server-side. */
export function toPublicError(err: unknown): ApiError["error"] {
  if (err instanceof ProviderError) {
    console.error(`[ai] ${err.code}: ${err.message}`);
    const message =
      err.message.startsWith("Server misconfigured")
        ? "The panel isn't set up on this server yet."
        : err.code === "refused"
        ? "The panel refused to judge this one. Try a different idea."
        : err.code === "invalid_response"
          ? "The panel got into a fistfight and returned nonsense. Please try again."
          : "The panel walked out (AI provider error). Please try again.";
    // Locally, show the operator the real reason (e.g. "Run: ollama pull qwen3.5:4b"). Never in production.
    const detail = process.env.NODE_ENV !== "production" || process.env.SHOW_AI_ERRORS === "true" ? ` [${err.message}]` : "";
    return { code: err.code, message: message + detail };
  }
  console.error("[ai] unexpected error", err);
  return { code: "internal", message: "Something broke backstage. Please try again." };
}

const guards = loadGuards();
const limiter = createRateLimiter({ limit: guards.perClientPer10Min, windowMs: 10 * 60 * 1000 });
const dailyLimiter = guards.dailyRequests > 0 ? createRateLimiter({ limit: guards.dailyRequests, windowMs: 24 * 60 * 60 * 1000 }) : null;

export type ParsedAiRequest<S extends z.ZodType> = { ok: true; data: z.infer<S>; release: () => void } | { ok: false; response: Response };

/**
 * Per-client rate limit → parse → validate → instance-wide caps → concurrency slot.
 *
 * Order matters: malformed requests are rejected before they can use up the
 * daily allowance, and the allowance is checked before a slot is taken.
 * On success the caller owns a slot and MUST call \`release\` when the work ends.
 * Every cap here is per server instance (see guards.ts): not a global limit.
 */
export async function parseAiRequest<S extends z.ZodType>(request: Request, schema: S): Promise<ParsedAiRequest<S>> {
  const rl = limiter(clientKey(request));
  if (!rl.ok) {
    return {
      ok: false,
      response: errorResponse("rate_limited", "The panel needs a breather. Try again in a few minutes.", {
        "Retry-After": String(rl.retryAfterSeconds),
      }),
    };
  }

  let json: unknown;
  try {
    const body = await request.text();
    if (body.length > guards.maxBodyChars) return { ok: false, response: errorResponse("invalid_input", "That request is too large.") };
    json = JSON.parse(body);
  } catch {
    return { ok: false, response: errorResponse("invalid_input", "Request body must be JSON.") };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, response: errorResponse("invalid_input", parsed.error.issues[0]?.message ?? "Invalid request.") };
  }

  if (dailyLimiter && !dailyLimiter("all").ok) {
    console.warn(JSON.stringify({ evt: "daily_request_cap_reached", limit: guards.dailyRequests }));
    return {
      ok: false,
      response: errorResponse("rate_limited", "The panel has done its quota for today. Come back tomorrow.", { "Retry-After": "3600" }),
    };
  }
  if (guards.dailySpendUsd > 0 && spentTodayUsd() >= guards.dailySpendUsd) {
    console.warn(JSON.stringify({ evt: "daily_spend_cap_reached", limitUsd: guards.dailySpendUsd, estUsdToday: Number(spentTodayUsd().toFixed(4)) }));
    return {
      ok: false,
      response: errorResponse("rate_limited", "The panel has done its quota for today. Come back tomorrow.", { "Retry-After": "3600" }),
    };
  }
  const release = acquireSlot(guards.maxConcurrent);
  if (!release) {
    return { ok: false, response: errorResponse("rate_limited", "The panel is packed right now. Try again in a few seconds.", { "Retry-After": "10" }) };
  }
  return { ok: true, data: parsed.data, release };
}

/** Shared pipeline for the JSON (non-streaming) AI routes. */
export async function handleAiRequest<S extends z.ZodType, R>(
  request: Request,
  schema: S,
  run: (input: z.infer<S>, signal: AbortSignal) => Promise<R>,
): Promise<Response> {
  const input = await parseAiRequest(request, schema);
  if (!input.ok) return input.response;
  try {
    const result = await run(input.data, request.signal);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const error = toPublicError(err);
    return errorResponse(error.code, error.message);
  } finally {
    input.release();
  }
}

/** Yields the events and releases the generation slot when the stream finishes, fails or is cancelled. */
export async function* releasing<E>(events: AsyncIterable<E>, release: () => void): AsyncGenerator<E> {
  try {
    yield* events;
  } finally {
    release();
  }
}

/** Serialises an async stream of events as newline-delimited JSON. Errors become a final `error` event. */
export function ndjsonResponse<E>(events: AsyncIterable<E>, onCancel: () => void): Response {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) return controller.close();
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      } catch (err) {
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", ...toPublicError(err) })}\n`));
        controller.close();
      }
    },
    cancel() {
      onCancel();
      void iterator.return?.();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
