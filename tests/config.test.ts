import { describe, expect, it } from "vitest";
import { createProvider } from "@/lib/ai";
import { ConfigError, loadAiConfig, publicStatus } from "@/lib/ai/config";
import { DemoProvider } from "@/lib/ai/demo/engine";
import { ModelRoastProvider } from "@/lib/ai/model-provider";

describe("loadAiConfig", () => {
  it("defaults to the demo panel without any configuration", () => {
    expect(loadAiConfig({})).toMatchObject({ provider: "demo", demoCps: 450 });
  });

  it("picks Anthropic automatically when a key is present", () => {
    expect(loadAiConfig({ ANTHROPIC_API_KEY: "k" })).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5", fixModel: "claude-opus-5-5", debateMode: "single" });
  });

  it("supports a separate FIX MY IDEA model", () => {
    const c = loadAiConfig({ ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-haiku-5-5", ANTHROPIC_FIX_MODEL: "claude-sonnet-5-5" });
    expect(c).toMatchObject({ model: "claude-haiku-5-5", fixModel: "claude-sonnet-5-5" });
  });

  it("configures Ollama with sensible defaults", () => {
    expect(loadAiConfig({ AI_PROVIDER: "ollama" })).toMatchObject({
      provider: "ollama",
      host: "http://127.0.0.1:11434",
      model: "qwen3.5:4b",
      think: false,
      numCtx: 8192,
      keepAlive: "30m",
    });
  });

  it("reads Ollama overrides", () => {
    const c = loadAiConfig({ AI_PROVIDER: "ollama", OLLAMA_HOST: "0.0.0.0:11500", OLLAMA_MODEL: "qwen3.5:9b", OLLAMA_THINK: "true", OLLAMA_NUM_CTX: "16384", DEBATE_MODE: "multi" });
    expect(c).toMatchObject({ host: "http://127.0.0.1:11500", model: "qwen3.5:9b", think: true, numCtx: 16384, debateMode: "multi" });
  });

  it.each([
    [{ AI_PROVIDER: "anthropic" }, /ANTHROPIC_API_KEY is not set/],
    [{ AI_PROVIDER: "olama" }, /AI_PROVIDER must be/],
    [{ AI_PROVIDER: "ollama", OLLAMA_NUM_CTX: "lots" }, /OLLAMA_NUM_CTX must be a number/],
    [{ AI_PROVIDER: "ollama", OLLAMA_THINK: "maybe" }, /OLLAMA_THINK must be/],
    [{ AI_PROVIDER: "ollama", DEBATE_MODE: "chaos" }, /DEBATE_MODE must be/],
    [{ AI_PROVIDER: "ollama", OLLAMA_HOST: "http://" }, /OLLAMA_HOST is not a valid address/],
  ])("rejects configuration mistakes loudly: %j", (env, message) => {
    expect(() => loadAiConfig(env)).toThrow(ConfigError);
    expect(() => loadAiConfig(env)).toThrow(message);
  });
});

describe("createProvider", () => {
  it("builds the right provider for each config", () => {
    expect(createProvider(loadAiConfig({}))).toBeInstanceOf(DemoProvider);
    const anthropic = createProvider(loadAiConfig({ ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-haiku-5-5" }));
    expect(anthropic).toBeInstanceOf(ModelRoastProvider);
    expect((anthropic as ModelRoastProvider).label).toBe("anthropic:claude-haiku-5-5");
    const ollama = createProvider(loadAiConfig({ AI_PROVIDER: "ollama", DEBATE_MODE: "multi" }));
    expect((ollama as ModelRoastProvider).label).toBe("ollama:qwen3.5:4b");
    expect((ollama as ModelRoastProvider).debateMode).toBe("multi");
  });
});

describe("publicStatus", () => {
  it("never exposes keys or hosts", () => {
    const status = publicStatus({ ANTHROPIC_API_KEY: "sk-ant-secret", AI_PROVIDER: "anthropic" });
    expect(status).toEqual({ mode: "ai", provider: "anthropic", model: "claude-opus-5-5" });
    expect(JSON.stringify(publicStatus({ AI_PROVIDER: "ollama", OLLAMA_HOST: "secret-box:11434" }))).not.toContain("secret-box");
  });

  it("reports misconfiguration instead of pretending to be the demo", () => {
    expect(publicStatus({ AI_PROVIDER: "anthropic" })).toEqual({ mode: "misconfigured" });
  });
});
