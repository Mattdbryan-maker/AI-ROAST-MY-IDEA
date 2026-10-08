/**
 * Price table for cost ESTIMATES. Measured token counts × these prices.
 *
 * Source: https://platform.claude.com/docs/en/about-claude/pricing
 * Verified: 2026-10-08. Re-check before relying on a report for budgeting.
 * Prices are USD per million tokens, standard (not batch), global routing.
 */
export const PRICES_VERIFIED_ON = "2026-10-08";
export const PRICES_SOURCE = "https://platform.claude.com/docs/en/about-claude/pricing";

export interface Price {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheRead: number;
}

export const ANTHROPIC_PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite5m: 5, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite5m: 2.5, cacheRead: 0.1 },
  // Prompts up to 100K tokens (ours are ~3-5K). Above that the rate is $0.50 / $2.50.
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheWrite5m: 0.125, cacheRead: 0.01 },
  "claude-opus-5": { input: 5, output: 25, cacheWrite5m: 6.25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite5m: 2.5, cacheRead: 0.2 },
};

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** USD for one request, or null when the model has no known price. Local models cost $0 in API fees. */
export function costOf(provider: string, model: string, u: TokenUsage): number | null {
  if (provider === "ollama" || provider === "demo") return 0;
  const p = ANTHROPIC_PRICES[model];
  if (!p) return null;
  // Anthropic's input_tokens excludes cached tokens, which are billed separately.
  return (
    ((u.inputTokens ?? 0) * p.input + (u.outputTokens ?? 0) * p.output + (u.cacheWriteTokens ?? 0) * p.cacheWrite5m + (u.cacheReadTokens ?? 0) * p.cacheRead) /
    1_000_000
  );
}

/**
 * Conservative per-journey token assumptions used only for the pre-run budget
 * check (actual usage is measured during the run). Deliberately generous.
 */
export const BUDGET_ASSUMPTIONS = {
  roast: { inputTokens: 4000, outputTokens: 5000 },
  fix: { inputTokens: 2500, outputTokens: 4000 },
  debateTurn: { inputTokens: 3500, outputTokens: 800 },
};
