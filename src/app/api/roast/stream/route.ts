import { getProvider } from "@/lib/ai";
import { streamRoastEvents } from "@/lib/ai/stream";
import { ndjsonResponse, parseAiRequest } from "@/lib/api-helpers";
import { RoastRequestSchema } from "@/lib/types";

export const maxDuration = 120;

/**
 * Streams the panel live as newline-delimited JSON events (see lib/stream-events.ts).
 * Validation and rate-limit failures are ordinary JSON error responses.
 */
export async function POST(request: Request) {
  const input = await parseAiRequest(request, RoastRequestSchema);
  if (!input.ok) return input.response;

  // Stop generating (and paying for) tokens as soon as the viewer goes away.
  const controller = new AbortController();
  request.signal.addEventListener("abort", () => controller.abort(), { once: true });

  return ndjsonResponse(streamRoastEvents(getProvider(), input.data.idea, controller.signal), () => controller.abort());
}
