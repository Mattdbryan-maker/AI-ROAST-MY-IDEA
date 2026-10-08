import { AnthropicClient } from "../src/lib/ai/anthropic";
import { DemoProvider } from "../src/lib/ai/demo/engine";
import type { LlmClient } from "../src/lib/ai/llm";
import { ModelRoastProvider, type DebateMode, type UsageRecord } from "../src/lib/ai/model-provider";
import { OllamaClient, type ThinkSetting } from "../src/lib/ai/ollama";
import type { RoastProvider } from "../src/lib/ai/provider";

/**
 * A benchmark target is written as a compact spec:
 *
 *   demo
 *   anthropic:claude-haiku-5-5
 *   anthropic:claude-sonnet-5-5?effort=medium&fix=claude-opus-5-5
 *   ollama:qwen3.5:4b
 *   ollama:qwen3.5:9b?think=true&debate=multi&host=http://gpu-box:11434
 *
 * Options: effort (anthropic), think / host / ctx (ollama), debate=single|multi,
 * fix=<model for FIX MY IDEA>.
 */
export interface Target {
  spec: string;
  provider: "demo" | "anthropic" | "ollama";
  model: string;
  fixModel: string;
  debateMode: DebateMode;
  paid: boolean;
  build(onUsage: (u: UsageRecord) => void): { roast: RoastProvider; client?: LlmClient };
}

export function parseTarget(spec: string, env: Record<string, string | undefined> = process.env): Target {
  const [head, query = ""] = spec.split("?");
  const params = new URLSearchParams(query);
  const colon = head.indexOf(":");
  const provider = (colon === -1 ? head : head.slice(0, colon)).trim();
  const model = colon === -1 ? "" : head.slice(colon + 1).trim();
  const debate = (params.get("debate") ?? "single") as DebateMode;
  if (debate !== "single" && debate !== "multi") throw new Error(`${spec}: debate must be single or multi`);

  if (provider === "demo") {
    return {
      spec,
      provider,
      model: "demo-engine",
      fixModel: "demo-engine",
      debateMode: "single",
      paid: false,
      // The demo streams at a fixed simulated speed; for the benchmark run it at full speed.
      build: () => ({ roast: new DemoProvider({ cps: 0 }) }),
    };
  }

  if (provider === "anthropic") {
    if (!model) throw new Error(`${spec}: give a model, e.g. anthropic:claude-haiku-5-5`);
    const fixModel = params.get("fix") ?? model;
    return {
      spec,
      provider,
      model,
      fixModel,
      debateMode: debate,
      paid: true,
      build: (onUsage) => {
        const apiKey = env.ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
        const effort = params.get("effort") ?? env.ANTHROPIC_EFFORT;
        const client = new AnthropicClient({ apiKey, model, effort });
        const fixClient = fixModel !== model ? new AnthropicClient({ apiKey, model: fixModel, effort }) : undefined;
        return { roast: new ModelRoastProvider(client, { debateMode: debate, fixClient, onUsage }), client };
      },
    };
  }

  if (provider === "ollama") {
    if (!model) throw new Error(`${spec}: give a model, e.g. ollama:qwen3.5:4b`);
    const fixModel = params.get("fix") ?? model;
    const thinkRaw = params.get("think") ?? env.OLLAMA_THINK ?? "false";
    const think: ThinkSetting = thinkRaw === "true" ? true : thinkRaw === "false" ? false : (thinkRaw as ThinkSetting);
    const host = params.get("host") ?? env.OLLAMA_HOST;
    const numCtx = Number(params.get("ctx") ?? env.OLLAMA_NUM_CTX ?? 8192);
    return {
      spec,
      provider,
      model,
      fixModel,
      debateMode: debate,
      paid: false,
      build: (onUsage) => {
        const client = new OllamaClient({ host, model, think, numCtx });
        const fixClient = fixModel !== model ? new OllamaClient({ host, model: fixModel, think, numCtx }) : undefined;
        return { roast: new ModelRoastProvider(client, { debateMode: debate, fixClient, onUsage }), client };
      },
    };
  }

  throw new Error(`Unknown provider in target "${spec}" (use demo, anthropic:… or ollama:…)`);
}
