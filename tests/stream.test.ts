import { describe, expect, it } from "vitest";
import { DemoProvider, demoRoast, demoRoastJson } from "@/lib/ai/demo/engine";
import { InvalidResponseError, ProviderError, type RoastChunk, type RoastProvider } from "@/lib/ai/provider";
import { RoastStreamAssembler, streamRoastEvents } from "@/lib/ai/stream";
import type { RoastStreamEvent } from "@/lib/stream-events";
import { RoastSchema } from "@/lib/types";

const IDEA = "Uber for dog walking. Busy professionals book a vetted walker in 60 seconds; we take 20% commission.";

function feedAll(text: string, chunkSize: number) {
  const asm = new RoastStreamAssembler("demo");
  const events: RoastStreamEvent[] = [];
  for (let i = 0; i < text.length; i += chunkSize) events.push(...asm.feed(text.slice(i, i + chunkSize)));
  return { events, roast: asm.finish() };
}

async function collect(iter: AsyncIterable<RoastStreamEvent>) {
  const out: RoastStreamEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

function fakeProvider(attempts: string[][], restartFirst = false): RoastProvider & { calls: number } {
  return {
    name: "fake",
    mode: "ai",
    calls: 0,
    async roast() {
      throw new Error("unused");
    },
    async fix() {
      throw new Error("unused");
    },
    async *roastStream(): AsyncGenerator<RoastChunk> {
      const chunks = attempts[this.calls++] ?? [];
      for (const [i, text] of chunks.entries()) {
        if (restartFirst && i === 2) yield { type: "restart" };
        yield { type: "text", text };
      }
    },
  };
}

const chunk = (s: string, n = 7) => Array.from({ length: Math.ceil(s.length / n) }, (_, i) => s.slice(i * n, i * n + n));

describe("RoastStreamAssembler", () => {
  it.each([1, 5, 64])("emits meta, live progress, four takes and the debate (chunk size %i)", (size) => {
    const { events, roast } = feedAll(demoRoastJson(IDEA), size);
    const types = events.map((e) => e.type);

    expect(types[0]).toBe("meta");
    expect(types.filter((t) => t === "meta")).toHaveLength(1);
    expect(types.filter((t) => t === "take")).toHaveLength(4);
    expect(types.filter((t) => t === "progress").length).toBeGreaterThan(size === 64 ? 4 : 40);
    expect(types.at(-1)).toBe("debate");

    // Progress for take N always precedes take N, and takes arrive in order.
    const takeIdx = events.flatMap((e, i) => (e.type === "take" ? [i] : []));
    events.forEach((e, i) => {
      if (e.type === "progress") expect(i).toBeLessThan(takeIdx[e.index]);
    });

    // What streamed live matches the final, validated roast.
    const expected = demoRoast(IDEA);
    const takes = events.filter((e): e is Extract<RoastStreamEvent, { type: "take" }> => e.type === "take").map((e) => e.take);
    expect(takes).toEqual(expected.takes);
    expect(roast).toEqual(expected);
  });

  it("only grows live text — no partial numbers or broken escapes", () => {
    const { events } = feedAll(demoRoastJson(IDEA), 3);
    let last = "";
    for (const e of events) {
      if (e.type !== "progress" || e.index !== 0) continue;
      expect(e.headline.startsWith(last.slice(0, Math.max(0, last.length - 1)))).toBe(true);
      last = e.headline;
      expect(e.pointsDone).toBeLessThanOrEqual(e.points.length);
    }
  });

  it("rejects a malformed take as soon as it closes", () => {
    const asm = new RoastStreamAssembler("ai");
    expect(() => asm.feed('{"title":"x","summary":"y","takes":[{"persona":"investor","headline":"h","points":["only one"],"strength":"s","weakness":"w","score":5}')).toThrow(
      InvalidResponseError,
    );
  });

  it("rejects a response that ends early", () => {
    const asm = new RoastStreamAssembler("ai");
    asm.feed(demoRoastJson(IDEA).slice(0, 500));
    expect(() => asm.finish()).toThrow(InvalidResponseError);
  });
});

describe("streamRoastEvents", () => {
  it("streams the demo panel end to end", async () => {
    const events = await collect(streamRoastEvents(new DemoProvider({ cps: 0 }), IDEA));
    expect(events[0]).toEqual({ type: "start", mode: "demo" });
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    expect(() => RoastSchema.parse((done as { roast: unknown }).roast)).not.toThrow();
  });

  it("retries once after an unusable response, announcing a reset", async () => {
    const good = chunk(demoRoastJson(IDEA));
    const provider = fakeProvider([['{"title":"x","summary":"y","takes":[]}'], good]);
    const events = await collect(streamRoastEvents(provider, IDEA));
    expect(provider.calls).toBe(2);
    expect(events.filter((e) => e.type === "reset")).toHaveLength(1);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("gives up after the retry fails too", async () => {
    const bad = ['{"title":"x"'];
    await expect(collect(streamRoastEvents(fakeProvider([bad, bad]), IDEA))).rejects.toThrow(InvalidResponseError);
  });

  it("starts over cleanly when the provider restarts mid-stream (model fallback)", async () => {
    const json = demoRoastJson(IDEA);
    // First two chunks are a declined attempt's partial output, then the restart, then the full response.
    const provider = fakeProvider([['{"title":"Declined', ' attempt","sum', ...chunk(json)]], true);
    const events = await collect(streamRoastEvents(provider, IDEA));
    expect(events.filter((e) => e.type === "reset")).toHaveLength(1);
    const meta = events.find((e) => e.type === "meta");
    expect(meta).toMatchObject({ title: demoRoast(IDEA).title });
    expect(events.at(-1)?.type).toBe("done");
  });

  it("propagates provider errors (e.g. refusals) without retrying", async () => {
    const provider: RoastProvider = {
      ...fakeProvider([]),
      async *roastStream() {
        yield { type: "text" as const, text: "{" };
        throw new ProviderError("no", "refused", false);
      },
    };
    await expect(collect(streamRoastEvents(provider, IDEA))).rejects.toMatchObject({ code: "refused" });
  });
});
