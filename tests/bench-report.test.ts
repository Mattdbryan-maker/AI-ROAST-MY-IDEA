import { describe, expect, it } from "vitest";
import { costOf } from "../bench/pricing";
import { renderReport } from "../bench/report";
import type { BenchRun, RunRecord } from "../bench/run";

const usage = { inputTokens: 1500, outputTokens: 900, cacheReadTokens: 400, calls: 2 };

function failedRecord(over: Partial<RunRecord> = {}): RunRecord {
  const roast = costOf("anthropic", "claude-haiku-5-5", usage);
  return {
    target: "anthropic:claude-haiku-5-5",
    provider: "anthropic",
    model: "claude-haiku-5-5",
    fixModel: "claude-haiku-5-5",
    debateMode: "single",
    ideaId: "plants",
    category: "consumer",
    repeat: 1,
    ok: false,
    failedAt: "roast",
    errorCode: "invalid_response",
    errorMessage: "Model response debate too short",
    resets: 1,
    timings: { takeMs: [] },
    usage: { roast: usage },
    costUsd: { roast, fix: 0, journey: roast },
    ...over,
  };
}

const run = (records: RunRecord[]): BenchRun => ({
  startedAt: "2026-10-08T12:00:00.000Z",
  promptVersion: "test",
  args: { repeat: 1, fix: true },
  targets: [],
  ideas: [],
  records,
  skipped: 0,
  notes: [],
});

describe("benchmark report: failed requests are not free", () => {
  it("shows measured tokens and a non-zero estimated cost for a failed journey", () => {
    expect(costOf("anthropic", "claude-haiku-5-5", usage)).toBeGreaterThan(0);
    const md = renderReport(run([failedRecord()]));
    expect(md).toContain("## Failures");
    expect(md).toContain("1,900 / 900");
    expect(md).toMatch(/\| \$0\.000\d+ \|/);
    expect(md).not.toMatch(/invalid_response \| [^|]*\| \$0 \|/);
  });

  it("says 'unknown', never free, when a failed journey has no price on file", () => {
    const md = renderReport(run([failedRecord({ costUsd: { roast: null, fix: null, journey: null } })]));
    expect(md).toMatch(/\| unknown \| Model response debate too short/);
  });
});
