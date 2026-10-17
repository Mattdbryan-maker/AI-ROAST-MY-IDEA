import "server-only";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import type { ApiError, ApiErrorCode } from "./types";
import { ProviderError } from "./ai";
import { acquireSlot, loadGuards, spentTodayUsd } from "./guards";
import { clientKey, createRateLimiter } from "./rate-limit";
import { BETA_COOKIE, PASS_COOKIE, loadAccessConfig, readCookie, verifyToken } from "./shared/access";
import { admit, hashClient, loadPolicy, type DenyReason, type Kind, type Outcome } from "./shared/admission";
import { sharedMode } from "./shared/mode";
import { bump } from "./shared/stats";
import { getStore } from "./shared/store";

const STATUS: Record<ApiErrorCode, number> = {
  invalid_input: 400,
  unauthorized: 401,
  verification_required: 403,
  rate_limited: 429,
  provider_error: 502,
  invalid_response: 502,
  refused: 422,
  unavailable: 503,
  internal: 500,
};

export function errorResponse(code: ApiErrorCode, message: string, headers?: HeadersInit, status?: number): Response {
  const body: ApiError = { error: { code, message } };
  return Response.json(body, { status: status ?? STATUS[code], headers: { "Cache-Control": "no-store", ...Object.fromEntries(new Headers(headers)) } });
}

/** Maps anything thrown while running the AI to a safe, user-facing error. Logs the detail server-side. */
export function toPublicError(err: unknown): ApiError["error"] {
  if (err instanceof ProviderError) {
    console.error(`[ai] ${err.code}: ${err.message}`);
    const misconfigured = err.message.startsWith("Server misconfigured");
    const message = misconfigured
      ? "The panel isn't set up on this server yet."
      : err.code === "refused"
        ? "The panel refused to judge this one. Try a different idea."
        : err.code === "invalid_response"
          ? "The panel got into a fistfight and returned nonsense. Please try again."
          : "The panel walked out (AI provider error). Please try again.";
    // Locally, show the operator the real reason (e.g. "Run: ollama pull qwen3.5:4b"). Never in production.
    const detail = process.env.NODE_ENV !== "production" || process.env.SHOW_AI_ERRORS === "true" ? ` [${err.message}]` : "";
    return { code: misconfigured ? "unavailable" : err.code, message: message + detail };
  }
  console.error("[ai] unexpected error", err);
  return { code: "internal", message: "Something broke backstage. Please try again." };
}

// â”€â”€ Layer 0: instance-local seatbelt (unchanged behaviour; the only layer outside shared mode) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const guards = loadGuards();
const limiter = createRateLimiter({ limit: guards.perClientPer10Min, windowMs: 10 * 60 * 1000 });
const dailyLimiter = guards.dailyRequests > 0 ? createRateLimiter({ limit: guards.dailyRequests, windowMs: 24 * 60 * 60 * 1000 }) : null;
/** Cheap pre-filter in front of the shared store: floods are turned away without a network call. Looser than the shared limit on purpose. */
const prefilter = createRateLimiter({ limit: Math.max(30, guards.perClientPer10Min * 3), windowMs: 10 * 60 * 1000 });

export type ParsedAiRequest<S extends z.ZodType> =
  | { ok: true; data: z.infer<S>; release: (outcome?: Outcome) => Promise<void> | void }
  | { ok: false; response: Response };

const DENIALS: Record<DenyReason, { message: string; status: number }> = {
  client_burst: { message: "The panel needs a breather. Try again in a few minutes.", status: 429 },
  client_daily: { message: "You've used today's trials. Come back tomorrow for more.", status: 429 },
  global_requests: { message: "The panel has done its quota for today. Come back tomorrow.", status: 429 },
  daily_spend: { message: "The panel has done its quota for today. Come back tomorrow.", status: 429 },
  monthly_spend: { message: "The beta's AI budget is used up for now. Please check back later.", status: 429 },
  concurrency: { message: "The panel is packed right now. Try again in a few seconds.", status: 429 },
  unavailable: { message: "The panel is closed for a moment while we fix a problem. Please try again soon.", status: 503 },
};

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // not a browser cross-site request; the other layers still apply
  try {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Ensures the caller holds a valid invite (when the beta gate is on). Shared by the proxy-independent route check. */
export async function checkBetaGate(request: Request): Promise<Response | null> {
  const access = loadAccessConfig();
  if (access.misconfigured) {
    console.error("[access] BETA_ACCESS_CODES or TURNSTILE_SECRET_KEY is set but ACCESS_SIGNING_SECRET is missing or shorter than 32 characters");
    return errorResponse("unavailable", DENIALS.unavailable.message);
  }
  if (!access.gateEnabled) return null;
  const ok = await verifyToken("beta", readCookie(request.headers.get("cookie"), BETA_COOKIE), access.signingSecret);
  return ok ? null : errorResponse("unauthorized", "This beta is invite-only.");
}

/**
 * Every protection that applies before money is spent, in order:
 *
 *   same-origin â†’ invite gate â†’ body size â†’ instance pre-filter â†’ parse and
 *   validate â†’ human-verification pass â†’ shared admission (burst, per-visitor
 *   daily, global daily, reserved spend, concurrency).
 *
 * Malformed requests are turned away before they touch the shared store.
 * On success the caller owns a slot and MUST call `release(outcome)` when the work ends.
 */
export async function parseAiRequest<S extends z.ZodType>(request: Request, schema: S, kind: Kind = "roast"): Promise<ParsedAiRequest<S>> {
  const mode = sharedMode();
  const access = loadAccessConfig();

  if (!sameOrigin(request)) return { ok: false, response: errorResponse("unauthorized", "Cross-site requests are not allowed.", undefined, 403) };

  const gate = await checkBetaGate(request);
  if (gate) return { ok: false, response: gate };

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > guards.maxBodyChars * 4) return { ok: false, response: errorResponse("invalid_input", "That request is too large.") };

  const client = clientKey(request);

  if (mode.use) {
    const pre = prefilter(client);
    if (!pre.ok) {
      return { ok: false, response: errorResponse("rate_limited", DENIALS.client_burst.message, { "Retry-After": String(pre.retryAfterSeconds) }) };
    }
  } else {
    const rl = limiter(client);
    if (!rl.ok) {
      return {
        ok: false,
        response: errorResponse("rate_limited", "The panel needs a breather. Try again in a few minutes.", { "Retry-After": String(rl.retryAfterSeconds) }),
      };
    }
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

  if (access.turnstileEnabled) {
    const ok = await verifyToken("pass", readCookie(request.headers.get("cookie"), PASS_COOKIE), access.signingSecret);
    if (!ok) {
      void bump("denied_verification");
      return { ok: false, response: errorResponse("verification_required", "Please complete the quick human check.") };
    }
  }

  // â”€â”€ Shared (production) path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (mode.use) {
    if (!mode.configured) {
      // Required but missing: fail closed. Never run paid inference with no shared allowance behind it.
      console.error(JSON.stringify({ evt: "shared_limiter_missing", detail: "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL / KV_REST_API_TOKEN) are not set" }));
      return { ok: false, response: errorResponse("unavailable", DENIALS.unavailable.message) };
    }
    const store = getStore();
    const salt = access.signingSecret ?? "ar-client-salt";
    const admission = await admit({ store, policy: loadPolicy(), kind, client: hashClient(client, salt), requestId: randomUUID() });
    if (!admission.ok) {
      const d = DENIALS[admission.reason];
      console.warn(JSON.stringify({ evt: "admission_denied", reason: admission.reason, kind }));
      return {
        ok: false,
        response: errorResponse(admission.reason === "unavailable" ? "unavailable" : "rate_limited", d.message, { "Retry-After": String(admission.retryAfterSec) }, d.status),
      };
    }
    return { ok: true, data: parsed.data, release: (outcome = "ok") => admission.finish(outcome) };
  }

  // â”€â”€ Instance-local path (demo, Ollama, development, explicit single-process opt-out) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  return { ok: true, data: parsed.data, release: () => release() };
}

/** Shared pipeline for the JSON (non-streaming) AI routes. */
export async function handleAiRequest<S extends z.ZodType, R>(
  request: Request,
  schema: S,
  run: (input: z.infer<S>, signal: AbortSignal) => Promise<R>,
  kind: Kind = "roast",
): Promise<Response> {
  const input = await parseAiRequest(request, schema, kind);
  if (!input.ok) return input.response;
  let outcome: Outcome = "ok";
  try {
    const result = await run(input.data, request.signal);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    outcome = request.signal.aborted ? "cancelled" : "fail";
    const error = toPublicError(err);
    return errorResponse(error.code, error.message);
  } finally {
    await input.release(outcome);
  }
}

/** Yields the events and releases the generation slot when the stream finishes, fails or is cancelled. */
export async function* releasing<E>(events: AsyncIterable<E>, release: (outcome?: Outcome) => Promise<void> | void): AsyncGenerator<E> {
  let outcome: Outcome = "cancelled";
  try {
    for await (const event of events) {
      const type = (event as { type?: string } | null)?.type;
      if (type === "done") outcome = "ok";
      else if (type === "error") outcome = "fail";
      yield event;
    }
  } catch (err) {
    outcome = "fail";
    throw err;
  } finally {
    await release(outcome);
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
