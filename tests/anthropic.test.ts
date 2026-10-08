import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { demoRoastJson } from "@/lib/ai/demo/engine";
import { ProviderError } from "@/lib/ai/provider";
import { RoastSchema } from "@/lib/types";

/** A model-shaped response built from the demo engine, so it's realistic and valid. */
const modelJson = () => demoRoastJson("A subscription box of houseplants for people who kill houseplants, £15/month.");

function fakeClient(responses: { text?: string; stop_reason?: string }[]) {
  const create = vi.fn();
  for (const r of responses) {
    create.mockResolvedValueOnce({
      stop_reason: r.stop_reason ?? "end_turn",
      content: r.text === undefined ? [] : [{ type: "thinking", thinking: "" }, { type: "text", text: r.text }],
    });
  }
  const client = { beta: { messages: { create } } } as unknown as Anthropic;
  return { client, create };
}

describe("AnthropicProvider", () => {
  it("sends a structured-output request and returns a validated roast", async () => {
    const { client, create } = fakeClient([{ text: modelJson() }]);
    const provider = new AnthropicProvider({ apiKey: "test", client });
    const roast = await provider.roast("A subscription box of houseplants.");

    expect(() => RoastSchema.parse(roast)).not.toThrow();
    expect(roast.mode).toBe("ai");
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.output_config.effort).toBe("low");
    expect(params.thinking).toEqual({ type: "adaptive" });
    expect(params.fallbacks).toBe("default");
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.messages[0].content).toContain("<pitch>");
  });

  it("retries once when the model returns something unusable", async () => {
    const { client, create } = fakeClient([{ text: '{"title": "half a roast"}' }, { text: modelJson() }]);
    const roast = await new AnthropicProvider({ apiKey: "test", client }).roast("An idea worth retrying.");
    expect(create).toHaveBeenCalledTimes(2);
    expect(roast.takes).toHaveLength(4);
  });

  it("surfaces refusals as a non-retryable provider error", async () => {
    const { client } = fakeClient([{ stop_reason: "refusal" }]);
    await expect(new AnthropicProvider({ apiKey: "test", client }).roast("Something unacceptable.")).rejects.toMatchObject({
      code: "refused",
    } satisfies Partial<ProviderError>);
  });

  it("omits server fallbacks for models that don't support them", async () => {
    const { client, create } = fakeClient([{ text: modelJson() }]);
    await new AnthropicProvider({ apiKey: "test", client, model: "claude-haiku-5-5" }).roast("Fallback check idea.");
    expect(create.mock.calls[0][0].fallbacks).toBeUndefined();
    expect(create.mock.calls[0][0].betas).toBeUndefined();
  });
});

describe("AnthropicProvider.roastStream", () => {
  function streamingClient(events: unknown[], stopReason = "end_turn") {
    const stream = vi.fn(() => ({
      async *[Symbol.asyncIterator]() {
        yield* events;
      },
      finalMessage: async () => ({ stop_reason: stopReason }),
    }));
    return { client: { beta: { messages: { stream } } } as unknown as Anthropic, stream };
  }
  const text = (t: string) => ({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: t } });

  it("yields text deltas, skips thinking, and restarts on a fallback block", async () => {
    const { client, stream } = streamingClient([
      { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } },
      text('{"title":'),
      { type: "content_block_start", index: 2, content_block: { type: "fallback" } },
      text('{"title":"ok"}'),
    ]);
    const chunks = [];
    for await (const c of new AnthropicProvider({ apiKey: "t", client }).roastStream("An idea to stream.")) chunks.push(c);
    expect(chunks).toEqual([
      { type: "text", text: '{"title":' },
      { type: "restart" },
      { type: "text", text: '{"title":"ok"}' },
    ]);
    const params = (stream.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(params.fallbacks).toBe("default");
  });

  it("raises a refusal after the stream ends", async () => {
    const { client } = streamingClient([text("{")], "refusal");
    const consume = async () => {
      for await (const _ of new AnthropicProvider({ apiKey: "t", client }).roastStream("Refused idea here.")) void _;
    };
    await expect(consume()).rejects.toMatchObject({ code: "refused" });
  });
});

describe("AnthropicProvider (phase 2)", () => {
  it("routes FIX MY IDEA to a separate model when configured, and reports usage", async () => {
    const fixJson = JSON.stringify({
      title: "Better",
      tagline: "Sharper",
      pitch: "A pitch.",
      changes: [1, 2, 3].map((i) => ({ area: `A${i}`, before: "b", after: "a", why: "w", persona: "investor" })),
      firstSteps: ["1", "2", "3"],
      projectedScores: { investor: 70, engineer: 70, marketer: 70, customer: 70 },
    });
    const create = vi.fn().mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: fixJson }],
      usage: { input_tokens: 1200, output_tokens: 800, cache_read_input_tokens: 900 },
    });
    const client = { beta: { messages: { create } } } as unknown as Anthropic;
    const usage: unknown[] = [];
    const provider = new AnthropicProvider({ apiKey: "t", client, model: "claude-haiku-5-5", fixModel: "claude-sonnet-5-5", onUsage: (u) => usage.push(u) });
    const { demoRoast } = await import("@/lib/ai/demo/engine");
    await provider.fix("An idea worth fixing.", demoRoast("An idea worth fixing."));
    expect(create.mock.calls[0][0].model).toBe("claude-sonnet-5-5");
    expect(usage[0]).toMatchObject({ purpose: "fix", model: "claude-sonnet-5-5", usage: { inputTokens: 1200, outputTokens: 800, cacheReadTokens: 900 } });
  });

  it("sends Haiku requests without fallbacks or sampling parameters", async () => {
    const { client, create } = fakeClient([{ text: modelJson() }]);
    await new AnthropicProvider({ apiKey: "t", client, model: "claude-haiku-5-5" }).roast("A cheap and cheerful idea.");
    const params = create.mock.calls[0][0];
    expect(params.fallbacks).toBeUndefined();
    expect(params.temperature).toBeUndefined();
    expect(params.top_p).toBeUndefined();
  });

  it("asks for plain text (no output format) for a debate turn", async () => {
    const { AnthropicClient } = await import("@/lib/ai/anthropic");
    const { client, create } = fakeClient([{ text: "Fine, HYPE, but the margin still dies." }]);
    const text = await new AnthropicClient({ apiKey: "t", client }).complete({ system: "s", user: "u", purpose: "debate", maxTokens: 2000 });
    expect(text).toBe("Fine, HYPE, but the margin still dies.");
    expect(create.mock.calls[0][0].output_config.format).toBeUndefined();
    expect(create.mock.calls[0][0].max_tokens).toBe(2000);
  });
});
