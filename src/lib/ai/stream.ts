import { parsePartialJson } from "../partial-json";
import type { RoastStreamEvent } from "../stream-events";
import { RoastSchema, type DebateLine, type PersonaId, type Roast } from "../types";
import { cleanText, normalizeDebate, normalizeRoast, normalizeTake, personaId } from "./normalize";
import { InvalidResponseError, type RoastChunk, type RoastProvider } from "./provider";

/**
 * Turns a streaming model response (raw JSON text) into UI events.
 *
 * After every chunk the whole prefix is re-parsed with a partial JSON parser
 * — the response is a few KB, so this is cheap — and the assembler emits only
 * what changed: title/summary once they're final, live progress for the take
 * being written, each take once it's complete and validated, and the debate
 * as it grows. `finish()` validates the whole thing exactly like the
 * non-streaming path.
 */
export class RoastStreamAssembler {
  private text = "";
  private metaSent = false;
  private takesSent = 0;
  private personasSeen = new Set<PersonaId>();
  private lastProgress = "";
  private lastDebate = "";

  constructor(private readonly mode: Roast["mode"]) {}

  feed(chunk: string): RoastStreamEvent[] {
    this.text += chunk;
    const { value, open } = parsePartialJson(this.text);
    if (!value || typeof value !== "object") return [];
    const doc = value as Record<string, unknown>;
    const events: RoastStreamEvent[] = [];
    const closed = (path: string) => !open.has(path);

    if (!this.metaSent && typeof doc.title === "string" && typeof doc.summary === "string" && closed("title") && closed("summary")) {
      this.metaSent = true;
      events.push({ type: "meta", title: cleanText(doc.title, 64), summary: cleanText(doc.summary, 240) });
    }

    const takes = Array.isArray(doc.takes) ? doc.takes : [];
    for (let index = this.takesSent; index < takes.length; index++) {
      const raw = takes[index] as Record<string, unknown> | undefined;
      if (!raw || typeof raw !== "object") break;

      if (closed(`takes.${index}`)) {
        const take = normalizeTake(raw);
        if (!take) throw new InvalidResponseError(`Take ${index + 1} was incomplete`);
        if (this.personasSeen.has(take.persona)) throw new InvalidResponseError(`Duplicate take from the ${take.persona}`);
        this.personasSeen.add(take.persona);
        this.takesSent = index + 1;
        this.lastProgress = "";
        events.push({ type: "take", index, take });
        continue;
      }

      // The take currently being written.
      const persona = closed(`takes.${index}.persona`) ? personaId(raw.persona) : null;
      if (!persona) break;
      const points = Array.isArray(raw.points) ? raw.points.filter((p): p is string => typeof p === "string") : [];
      const pointsOpen = !closed(`takes.${index}.points`);
      const progress: RoastStreamEvent = {
        type: "progress",
        index,
        persona,
        headline: liveText(raw.headline, 180),
        headlineDone: typeof raw.headline === "string" && closed(`takes.${index}.headline`),
        points: points.slice(0, 3).map((p) => liveText(p, 320)),
        pointsDone: Math.min(3, pointsOpen ? points.filter((_, i) => closed(`takes.${index}.points.${i}`)).length : points.length),
      };
      const key = JSON.stringify(progress);
      if (key !== this.lastProgress && (progress.headline || progress.points.length)) {
        this.lastProgress = key;
        events.push(progress);
      }
      break;
    }

    if (this.takesSent >= 4 && Array.isArray(doc.debate)) {
      const lines = normalizeDebate(doc.debate.filter((d, i) => closed(`debate.${i}.speaker`) && (d as { line?: unknown })?.line !== undefined));
      const lastIndex = doc.debate.length - 1;
      const lastDone = !open.has("debate") || closed(`debate.${lastIndex}`);
      const key = JSON.stringify([lines, lastDone]);
      if (lines.length && key !== this.lastDebate) {
        this.lastDebate = key;
        events.push({ type: "debate", lines: lines as DebateLine[], lastDone });
      }
    }
    return events;
  }

  finish(): Roast {
    const { value, open } = parsePartialJson(this.text);
    if (open.size > 0) throw new InvalidResponseError("Model response ended early");
    return normalizeRoast(value, this.mode);
  }
}

/** Whitespace-normalise partial text without trimming the growing end or adding an ellipsis. */
function liveText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").replace(/^\s+/, "").slice(0, max);
}

/**
 * Runs a provider's stream through the assembler, with one automatic retry if
 * the response turns out unusable. A retry (or a server-side model fallback)
 * is announced with a `reset` event so the client can start over cleanly.
 */
export async function* streamRoastEvents(provider: RoastProvider, idea: string, signal?: AbortSignal): AsyncGenerator<RoastStreamEvent> {
  yield { type: "start", mode: provider.mode };
  for (let attempt = 0; ; attempt++) {
    let assembler = new RoastStreamAssembler(provider.mode);
    try {
      for await (const chunk of provider.roastStream(idea, signal) as AsyncIterable<RoastChunk>) {
        if (chunk.type === "restart") {
          assembler = new RoastStreamAssembler(provider.mode);
          yield { type: "reset", reason: "The panel switched seats. Starting over." };
          continue;
        }
        yield* assembler.feed(chunk.text);
      }
      // Belt and braces: the final roast must satisfy the same schema as the JSON API.
      yield { type: "done", roast: RoastSchema.parse(assembler.finish()) };
      return;
    } catch (err) {
      if (err instanceof InvalidResponseError && attempt === 0) {
        console.warn(`[ai] invalid streamed response, retrying once: ${err.message}`);
        yield { type: "reset", reason: "The panel lost its notes. Starting over." };
        continue;
      }
      throw err;
    }
  }
}
