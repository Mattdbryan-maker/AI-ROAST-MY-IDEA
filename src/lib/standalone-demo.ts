import { demoFix, DemoProvider } from "./ai/demo/engine";
import { streamRoastEvents } from "./ai/stream";
import type { RoastStreamEvent } from "./stream-events";
import { FixResultSchema, IdeaSchema, type FixResult, type Roast } from "./types";

/**
 * In-browser stand-ins for the API routes, used only by the standalone demo
 * build. They run the same demo engine and streaming pipeline as the server.
 */
export async function localStreamRoast(idea: string, onEvent: (event: RoastStreamEvent) => void, signal?: AbortSignal): Promise<Roast> {
  const pitch = IdeaSchema.parse(idea);
  let final: Roast | null = null;
  for await (const event of streamRoastEvents(new DemoProvider(), pitch, signal)) {
    if (event.type === "done") final = event.roast;
    onEvent(event);
  }
  if (!final) throw new Error("The demo panel stopped early");
  return final;
}

export async function localFix(idea: string, roast: Roast): Promise<FixResult> {
  await new Promise((resolve) => setTimeout(resolve, 900));
  return FixResultSchema.parse(demoFix(idea, roast));
}
