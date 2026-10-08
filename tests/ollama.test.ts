import { afterEach, describe, expect, it } from "vitest";
import { startMockOllama, type MockOllama, type MockOllamaOptions } from "../scripts/mock-ollama";
import type { UsageRecord } from "@/lib/ai/model-provider";
import { ModelRoastProvider } from "@/lib/ai/model-provider";
import { OllamaClient, normalizeOllamaHost, type OllamaClientOptions } from "@/lib/ai/ollama";
import { InvalidResponseError, ProviderError } from "@/lib/ai/provider";
import { streamRoastEvents } from "@/lib/ai/stream";
import { demoRoast } from "@/lib/ai/demo/engine";
import type { RoastStreamEvent } from "@/lib/stream-events";
import { FixResultSchema, RoastSchema } from "@/lib/types";

const IDEA = "An AI app that writes your wedding speech from a 5-minute voice interview. £29 per speech.";

let mock: MockOllama | null = null;
afterEach(async () => {
  await mock?.close();
  mock = null;
});

async function setup(mockOptions: MockOllamaOptions = {}, clientOptions: OllamaClientOptions = {}) {
  mock = await startMockOllama({ cps: 0, ...mockOptions });
  const client = new OllamaClient({ host: mock.url, model: "mock-qwen", ...clientOptions });
  return { client, mock };
}

async function collect(iter: AsyncIterable<RoastStreamEvent>) {
  const out: RoastStreamEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

describe("normalizeOllamaHost", () => {
  it.each([
    [undefined, "http://127.0.0.1:11434"],
    ["", "http://127.0.0.1:11434"],
    ["localhost:11434", "http://localhost:11434"],
    ["0.0.0.0", "http://127.0.0.1:11434"],
    ["0.0.0.0:11500", "http://127.0.0.1:11500"],
    ["http://gpu-box.lan:11434/", "http://gpu-box.lan:11434"],
    ["https://ollama.example.com", "https://ollama.example.com"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeOllamaHost(input)).toBe(expected);
  });
});

describe("OllamaClient through the roast pipeline", () => {
  it("streams a schema-constrained roast with thinking off and the schema in the prompt", async () => {
    const { client, mock } = await setup();
    const events = await collect(streamRoastEvents(new ModelRoastProvider(client), IDEA));
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    expect(() => RoastSchema.parse((done as { roast: unknown }).roast)).not.toThrow();
    expect(events.filter((e) => e.type === "progress").length).toBeGreaterThan(10);

    const body = mock.requests.find((r) => r.path === "/api/chat")!.body;
    expect(body.stream).toBe(true);
    expect(body.think).toBe(false);
    expect((body.format as { properties: object }).properties).toHaveProperty("takes");
    expect((body.options as { num_ctx: number }).num_ctx).toBe(8192);
    const system = (body.messages as { role: string; content: string }[])[0].content;
    expect(system).toContain("JSON schema");
    expect(system).toContain('"takes"');
  });

  it("never lets reasoning reach the stage: thinking chunks are dropped", async () => {
    const { client } = await setup({ thinkingChars: 400 }, { think: true });
    const events = await collect(streamRoastEvents(new ModelRoastProvider(client), IDEA));
    expect(events.at(-1)?.type).toBe("done");
    expect(JSON.stringify(events)).not.toContain("Weighing the market");
  });

  it("strips <think> tags that leak into the content", async () => {
    const { client } = await setup({ leakThinkTags: true });
    const text = await client.complete({ system: "s", user: "<pitch>x</pitch>", purpose: "debate" });
    expect(text).not.toContain("<think>");
    expect(text).not.toContain("consider the pitch");
  });

  it("retries without `think` when the server or model rejects it", async () => {
    const { client, mock } = await setup({ rejectThink: true });
    const roast = await new ModelRoastProvider(client).roast(IDEA);
    expect(roast.takes).toHaveLength(4);
    const chats = mock.requests.filter((r) => r.path === "/api/chat");
    expect("think" in chats[0].body).toBe(true);
    expect("think" in chats[1].body).toBe(false);
  });

  it("reports usage from the final chunk", async () => {
    const { client } = await setup();
    const usage: UsageRecord[] = [];
    await new ModelRoastProvider(client, { onUsage: (u) => usage.push(u) }).roast(IDEA);
    expect(usage[0]).toMatchObject({ purpose: "roast", provider: "ollama", model: "mock-qwen" });
    expect(usage[0].usage.outputTokens).toBeGreaterThan(100);
    expect(usage[0].usage.inputTokens).toBeGreaterThan(100);
  });

  it("produces a valid FIX MY IDEA result", async () => {
    const { client } = await setup();
    const fix = await new ModelRoastProvider(client).fix(IDEA, demoRoast(IDEA));
    expect(() => FixResultSchema.parse(fix)).not.toThrow();
    expect(fix.mode).toBe("ai");
  });
});

describe("OllamaClient failures", () => {
  it("explains a missing model with the pull command", async () => {
    const { client } = await setup({}, { model: "qwen3.5:9b" });
    await expect(new ModelRoastProvider(client).roast(IDEA)).rejects.toThrow(/ollama pull qwen3\.5:9b/);
  });

  it("explains when Ollama isn't running", async () => {
    const { mock } = await setup();
    const url = mock.url;
    await mock.close();
    const client = new OllamaClient({ host: url, model: "mock-qwen" });
    await expect(client.complete({ system: "s", user: "u", purpose: "roast" })).rejects.toThrow(/Can't reach Ollama/);
  });

  it("surfaces an error line sent mid-stream", async () => {
    const { client } = await setup({ failAfterChars: 200, failMode: "error" });
    await expect(collect(streamRoastEvents(new ModelRoastProvider(client), IDEA))).rejects.toThrow(/unexpected EOF/);
  });

  it("surfaces a dropped connection mid-stream", async () => {
    const { client } = await setup({ failAfterChars: 200, failMode: "cut", cps: 4000 });
    await expect(collect(streamRoastEvents(new ModelRoastProvider(client), IDEA))).rejects.toThrow(/dropped mid-answer|ended before/);
  });

  it("gives up on a model that stalls mid-answer", async () => {
    const { client } = await setup({ stallAfterChars: 30 }, { idleTimeoutMs: 300 });
    await expect(client.complete({ system: "s", user: "<pitch>x</pitch>", purpose: "debate" })).rejects.toThrow(/stopped responding/);
  });

  it("gives up when the first token takes too long (e.g. a model too big to load)", async () => {
    const { client } = await setup({ firstTokenMs: 1500 }, { firstTokenTimeoutMs: 200 });
    const started = Date.now();
    await expect(client.complete({ system: "s", user: "u", purpose: "roast" })).rejects.toThrow(/didn't start answering/);
    expect(Date.now() - started).toBeLessThan(1400);
  });

  it("treats output that isn't JSON as invalid, retries once, then fails", async () => {
    const { client, mock } = await setup({ malformed: true });
    const events: RoastStreamEvent[] = [];
    await expect(
      (async () => {
        for await (const e of streamRoastEvents(new ModelRoastProvider(client), IDEA)) events.push(e);
      })(),
    ).rejects.toThrow(InvalidResponseError);
    expect(events.filter((e) => e.type === "reset")).toHaveLength(1);
    expect(mock.requests.filter((r) => r.path === "/api/chat")).toHaveLength(2);
  });

  it("treats a response cut off by the output limit as invalid", async () => {
    const { client } = await setup({ truncate: true });
    await expect(client.complete({ system: "s", user: "<pitch>x</pitch>", purpose: "debate" })).rejects.toThrow(/ran out of output tokens/);
  });

  it("stops the request when the viewer cancels", async () => {
    const { client, mock } = await setup({ cps: 300 });
    const controller = new AbortController();
    const seen: string[] = [];
    const run = (async () => {
      for await (const chunk of client.stream({ system: "s", user: `<pitch>${IDEA}</pitch>`, purpose: "roast", signal: controller.signal })) {
        if (chunk.type === "text") seen.push(chunk.text);
        if (seen.length === 5) controller.abort();
      }
    })();
    await expect(run).rejects.toThrow(/abort/i);
    expect(seen.length).toBe(5);
    expect(mock.requests.filter((r) => r.path === "/api/chat")).toHaveLength(1);
  });

  it("is never silently replaced by the demo panel", async () => {
    const { client } = await setup({}, { model: "missing" });
    const err = await new ModelRoastProvider(client).roast(IDEA).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
  });
});

describe("multi-call debate over Ollama", () => {
  it("runs stage one plus one call per debate turn and stitches a valid roast", async () => {
    const { client, mock } = await setup();
    const events = await collect(streamRoastEvents(new ModelRoastProvider(client, { debateMode: "multi" }), IDEA));
    const done = events.at(-1) as Extract<RoastStreamEvent, { type: "done" }>;
    expect(done.type).toBe("done");
    expect(done.roast.debate).toHaveLength(5);
    const chats = mock.requests.filter((r) => r.path === "/api/chat");
    expect(chats).toHaveLength(6);
    // Stage one asks for no debate; turns are plain text.
    expect((chats[0].body.format as { properties: object }).properties).not.toHaveProperty("debate");
    expect(chats.slice(1).every((c) => !("format" in c.body))).toBe(true);
    // Each turn sees the transcript so far.
    const lastTurn = (chats[5].body.messages as { content: string }[])[1].content;
    expect(lastTurn).toContain(done.roast.debate[3].line.slice(0, 20));
    // The debate streamed in live, line by line.
    expect(events.filter((e) => e.type === "debate").length).toBeGreaterThan(5);
  });
});
