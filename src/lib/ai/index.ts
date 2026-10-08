import "server-only";
import { AnthropicClient } from "./anthropic";
import { ConfigError, loadAiConfig, type AiConfig } from "./config";
import { DemoProvider } from "./demo/engine";
import { ModelRoastProvider } from "./model-provider";
import { OllamaClient } from "./ollama";
import { ProviderError, type RoastProvider } from "./provider";

export type { RoastProvider } from "./provider";
export { ProviderError, InvalidResponseError } from "./provider";
export { publicStatus } from "./config";

/**
 * Builds the configured provider (see ./config.ts for the environment
 * variables). To add a provider: implement LlmClient (./llm.ts) and add a case.
 */
export function createProvider(config: AiConfig): RoastProvider {
  switch (config.provider) {
    case "demo":
      return new DemoProvider({ cps: config.demoCps });
    case "anthropic": {
      const client = new AnthropicClient(config);
      const fixClient = config.fixModel !== config.model ? new AnthropicClient({ ...config, model: config.fixModel }) : undefined;
      return new ModelRoastProvider(client, { debateMode: config.debateMode, fixClient });
    }
    case "ollama": {
      const client = new OllamaClient(config);
      const fixClient = config.fixModel !== config.model ? new OllamaClient({ ...config, model: config.fixModel }) : undefined;
      return new ModelRoastProvider(client, { debateMode: config.debateMode, fixClient });
    }
  }
}

let cached: RoastProvider | null = null;

/** The app's provider, built once per server process. Configuration errors surface as a ProviderError per request. */
export function getProvider(): RoastProvider {
  if (cached) return cached;
  try {
    cached = createProvider(loadAiConfig());
    return cached;
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[ai] configuration error: ${err.message}`);
      throw new ProviderError(`Server misconfigured: ${err.message}`, "provider_error", false);
    }
    throw err;
  }
}
