import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { demoRoast } from "@/lib/ai/demo/engine";
import { ProviderError } from "@/lib/ai/provider";
import { RoastSchema } from "@/lib/types";

/** A model-shaped response built from the demo engine, so it's realistic and valid. */
function modelJson() {
  const { overall: _o, verdict: _v, mode: _m, ...rest } = demoRoast("A subscription box of houseplants for people who kill houseplants, £15/month.");
  return JSON.stringify(rest);
}

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
