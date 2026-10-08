import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { demoRoastJson } from "@/lib/ai/demo/engine";
import type { UsageRecord } from "@/lib/ai/model-provider";
import { InvalidResponseError } from "@/lib/ai/provider";
import { streamRoastEvents } from "@/lib/ai/stream";
import type { RoastStreamEvent } from "@/lib/stream-events";
import { PERSONA_IDS, RoastSchema } from "@/lib/types";

/**
 * Regression: Haiku answered with character names (STERLING, KERNEL, HYPE, WALLET)
 * in debate[n].speaker. The SDK's own Zod parse rejected them with an untyped
 * AnthropicError, which neither retry path recognised, and the billed tokens
 * were never reported. These tests drive the REAL SDK (mocked fetch, SSE bytes).
 */

const NAMES = ["STERLING", "KERNEL", "HYPE", "WALLET"] as const;
const IDEA = "A subscription box of houseplants for people who kill houseplants, £15/month.";
const USAGE = { input_tokens: 1500, output_tokens: 900, cache_read_input_tokens: 400 };

type Json = Record<string, unknown> & { debate: { speaker: string; line: string }[] };

/** A valid model payload whose debate speakers are rewritten by `speakerFor`. */
function payload(speakerFor: (id: string, i: number) => string): string {
  const json = JSON.parse(demoRoastJson(IDEA)) as Json;
  json.debate = json.debate.map((d, i) => ({ ...d, speaker: speakerFor(d.speaker, i) }));
  return JSON.stringify(json);
}
const withNames = () => payload((id) => NAMES[PERSONA_IDS.indexOf(id as (typeof PERSONA_IDS)[number])]);

function sse(text: string, usage = USAGE, stopReason = "end_turn"): string {
  const ev = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify({ type, ...(data as object) })}\n\n`;
  const chunks = text.match(/[\s\S]{1,48}/g) ?? [];
  return [
    ev("message_start", { message: { id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [], stop_reason: null, usage: { input_tokens: usage.input_tokens, output_tokens: 1, cache_read_input_tokens: usage.cache_read_input_tokens } } }),
    ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } }),
    ...chunks.map((t) => ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: t } })),
    ev("content_block_stop", { index: 0 }),
    ev("message_delta", { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: usage.output_tokens } }),
    ev("message_stop", {}),
  ].join("");
}

/** Real SDK client; each request consumes the next scripted response text. */
function setup(texts: string[], model = "claude-haiku-5-5") {
  const queue = [...texts];
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const text = queue.shift();
    if (text === undefined) throw new Error("unexpected extra request");
    const body = JSON.parse(String(init?.body));
    if (body.stream) return new Response(sse(text), { status: 200, headers: { "content-type": "text/event-stream" } });
    return Response.json({ id: "msg_1", type: "message", role: "assistant", model, content: [{ type: "text", text }], stop_reason: "end_turn", usage: USAGE });
  });
  const client = new Anthropic({ apiKey: "test-key", fetch: fetchMock as unknown as typeof fetch, maxRetries: 0 });
  const usage: UsageRecord[] = [];
  const provider = new AnthropicProvider({ apiKey: "test-key", client, model, onUsage: (u) => usage.push(u) });
  return { provider, fetchMock, usage };
}

async function collect(gen: AsyncIterable<RoastStreamEvent>) {
  const events: RoastStreamEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("Haiku speaker identifiers (streaming, real SDK parse path)", () => {
  it("accepts each character name in speaker and delivers canonical ids to the UI", async () => {
    const { provider } = setup([withNames()]);
    const events = await collect(streamRoastEvents(provider, IDEA));

    const done = events.find((e) => e.type === "done");
    expect(done?.type === "done" && RoastSchema.safeParse(done.roast).success).toBe(true);
    const roast = done?.type === "done" ? done.roast : undefined;
    expect(roast!.debate.every((d) => (PERSONA_IDS as readonly string[]).includes(d.speaker))).toBe(true);
    // All four named characters appear as speakers, each normalised to its own id.
    const raw = JSON.parse(withNames()) as Json;
    for (const [i, name] of NAMES.entries()) {
      expect(raw.debate.some((d) => d.speaker === name)).toBe(true);
      expect(roast!.debate.some((d) => d.speaker === PERSONA_IDS[i])).toBe(true);
    }
    // Live debate events carry canonical ids only, and the other animation events still fire.
    const live = events.filter((e) => e.type === "debate").flatMap((e) => (e.type === "debate" ? e.lines : []));
    expect(live.length).toBeGreaterThan(0);
    expect(live.every((l) => (PERSONA_IDS as readonly string[]).includes(l.speaker))).toBe(true);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["start", "meta", "progress", "take", "debate", "done"]));
    expect(events.some((e) => e.type === "reset")).toBe(false);
  });

  it("maps character names in a take's persona field too, and keeps dialogue names untouched", async () => {
    const json = JSON.parse(demoRoastJson(IDEA)) as Json & { takes: { persona: string }[] };
    json.takes = json.takes.map((t, i) => ({ ...t, persona: NAMES[i] }));
    const { provider } = setup([JSON.stringify(json)]);
    const roast = await provider.roast(IDEA);
    expect(roast.takes.map((t) => t.persona)).toEqual([...PERSONA_IDS]);
    expect(roast.debate.map((d) => d.line)).toEqual((JSON.parse(demoRoastJson(IDEA)) as Json).debate.map((d) => d.line).slice(0, 6));
  });

  it("still accepts canonical ids", async () => {
    const { provider } = setup([demoRoastJson(IDEA)]);
    const events = await collect(streamRoastEvents(provider, IDEA));
    expect(events.at(-1)?.type).toBe("done");
  });

  it("does not weaken validation: unknown speakers are rejected after exactly one retry", async () => {
    const bad = payload(() => "NARRATOR");
    const { provider, fetchMock } = setup([bad, bad]);
    const events: RoastStreamEvent[] = [];
    await expect(
      (async () => {
        for await (const e of streamRoastEvents(provider, IDEA)) events.push(e);
      })(),
    ).rejects.toBeInstanceOf(InvalidResponseError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events.filter((e) => e.type === "reset")).toHaveLength(1);
    expect(events.some((e) => e.type === "done")).toBe(false);
  });

  it("recovers when the retry produces a valid response", async () => {
    const { provider, fetchMock } = setup([payload(() => "NARRATOR"), withNames()]);
    const events = await collect(streamRoastEvents(provider, IDEA));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events.filter((e) => e.type === "reset")).toHaveLength(1);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("treats the SDK's structured-output parse failure as a recoverable invalid response", async () => {
    const parseFailure = new Anthropic.AnthropicError("Failed to parse structured output: speaker invalid enum value");
    const good = withNames();
    let calls = 0;
    const stream = vi.fn(() => {
      calls++;
      return {
        async *[Symbol.asyncIterator]() {
          if (calls === 1) throw parseFailure;
          yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: good } };
        },
        finalMessage: async () => ({ stop_reason: "end_turn", usage: USAGE }),
      };
    });
    const client = { beta: { messages: { stream } } } as unknown as Anthropic;
    const provider = new AnthropicProvider({ apiKey: "t", client });
    const events = await collect(streamRoastEvents(provider, IDEA));
    expect(stream).toHaveBeenCalledTimes(2);
    expect(events.filter((e) => e.type === "reset")).toHaveLength(1);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("does not retry non-recoverable errors", async () => {
    const stream = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        throw new Anthropic.AuthenticationError(401, {}, "bad key", new Headers());
      },
      finalMessage: async () => ({}),
    }));
    const client = { beta: { messages: { stream } } } as unknown as Anthropic;
    const provider = new AnthropicProvider({ apiKey: "t", client });
    await expect(collect(streamRoastEvents(provider, IDEA))).rejects.toMatchObject({ code: "provider_error", retryable: false });
    expect(stream).toHaveBeenCalledTimes(1);
  });
});

describe("usage accounting for failed requests", () => {
  it("reports the tokens of every attempt, including ones that fail validation", async () => {
    const bad = payload(() => "NARRATOR");
    const { provider, usage } = setup([bad, bad]);
    await expect(collect(streamRoastEvents(provider, IDEA))).rejects.toBeInstanceOf(InvalidResponseError);
    expect(usage).toHaveLength(2);
    for (const u of usage) {
      expect(u).toMatchObject({ purpose: "roast", provider: "anthropic", model: "claude-haiku-5-5", usage: { inputTokens: 1500, outputTokens: 900, cacheReadTokens: 400 } });
    }
  });

  it("reports usage once per request when the stream succeeds", async () => {
    const { provider, usage } = setup([withNames()]);
    await collect(streamRoastEvents(provider, IDEA));
    expect(usage).toHaveLength(1);
  });

  it("reports usage when the stream fails mid-way after tokens were generated", async () => {
    const events = [
      { type: "message_start", message: { usage: { input_tokens: 1200, output_tokens: 1 } } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: '{"title":' } },
      { type: "message_delta", delta: {}, usage: { output_tokens: 300 } },
    ];
    const stream = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield* events;
        throw new Anthropic.AnthropicError("Failed to parse structured output: boom");
      },
      finalMessage: async () => ({}),
    }));
    const client = { beta: { messages: { stream } } } as unknown as Anthropic;
    const usage: UsageRecord[] = [];
    const provider = new AnthropicProvider({ apiKey: "t", client, onUsage: (u) => usage.push(u) });
    const consume = async () => {
      for await (const _ of provider.roastStream(IDEA)) void _;
    };
    await expect(consume()).rejects.toBeInstanceOf(InvalidResponseError);
    expect(usage).toHaveLength(1);
    expect(usage[0].usage).toMatchObject({ inputTokens: 1200, outputTokens: 300 });
  });
});

describe("non-streaming roast with character names", () => {
  it("normalises speakers and retries once on unusable output", async () => {
    const { provider, fetchMock, usage } = setup([payload(() => "NARRATOR"), withNames()]);
    const roast = await provider.roast(IDEA);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(roast.debate.every((d) => (PERSONA_IDS as readonly string[]).includes(d.speaker))).toBe(true);
    expect(usage).toHaveLength(2);
  });
});
