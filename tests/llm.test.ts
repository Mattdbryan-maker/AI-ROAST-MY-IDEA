import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ThinkTagStripper, cleanModelText, toJsonSchema } from "@/lib/ai/llm";
import { ClosingBraceHolder, DebateLineSanitizer } from "@/lib/ai/model-provider";
import { ModelRoastSchema, planDebate } from "@/lib/ai/prompts";

describe("ThinkTagStripper", () => {
  it.each([1, 2, 3, 7, 50])("removes reasoning split across chunks of %i chars", (size) => {
    const text = '<think>I should be careful about the "price".</think>{"title":"Ok"} and <think>more</think>done';
    const s = new ThinkTagStripper();
    let out = "";
    for (let i = 0; i < text.length; i += size) out += s.push(text.slice(i, i + size));
    out += s.end();
    expect(out).toBe('{"title":"Ok"} and done');
  });

  it("passes ordinary text, including a lone '<', straight through", () => {
    const s = new ThinkTagStripper();
    expect(s.push("a < b and <thin") + s.push("g>") + s.end()).toBe("a < b and <thing>");
  });

  it("drops an unterminated reasoning block", () => {
    const s = new ThinkTagStripper();
    expect(s.push("<think>never closes") + s.end()).toBe("");
  });
});

describe("cleanModelText", () => {
  it("strips reasoning and code fences", () => {
    expect(cleanModelText('<think>hmm</think>\n```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

describe("toJsonSchema", () => {
  it("produces a plain JSON schema with properties in streaming order", () => {
    const schema = toJsonSchema(ModelRoastSchema);
    expect(schema.$schema).toBeUndefined();
    expect(Object.keys(schema.properties as object)).toEqual([
      "title",
      "summary",
      "takes",
      "debate",
      "strengths",
      "weaknesses",
      "biggestRisk",
      "biggestOpportunity",
      "closingLine",
    ]);
    const take = ((schema.properties as Record<string, { items: { properties: object } }>).takes.items.properties);
    // The score comes last so the UI streams arguments before numbers.
    expect(Object.keys(take).at(-1)).toBe("score");
    expect(toJsonSchema(z.object({ a: z.string() }))).toMatchObject({ type: "object", required: ["a"] });
  });
});

describe("ClosingBraceHolder", () => {
  it.each([1, 3, 9])("holds back only the final brace (chunk size %i)", (size) => {
    const json = '{"a":{"b":[1,{"c":"}"}]},"d":"x"}  ';
    const h = new ClosingBraceHolder();
    let out = "";
    for (let i = 0; i < json.length; i += size) out += h.push(json.slice(i, i + size));
    out += h.finish();
    expect(JSON.parse(`${out},"e":2}`)).toEqual({ a: { b: [1, { c: "}" }] }, d: "x", e: 2 });
  });
});

describe("DebateLineSanitizer", () => {
  const run = (text: string, size = 4) => {
    const s = new DebateLineSanitizer("engineer");
    let streamed = "";
    for (let i = 0; i < text.length; i += size) streamed += s.push(text.slice(i, i + size));
    const { tail, line } = s.finish();
    return { streamed: streamed + tail, line };
  };

  it.each([
    ['KERNEL: "Two weeks to build, two years to debug, STERLING."', "Two weeks to build, two years to debug, STERLING."],
    ["**KERNEL** — Fine, HYPE has a point about the hook.", "Fine, HYPE has a point about the hook."],
    ["Wrong, WALLET. The API costs eat the margin.\nHYPE: wait", "Wrong, WALLET. The API costs eat the margin."],
    ["Short.", "Short."],
    ["The founders' fees", "The founders' fees"],
  ])("cleans %j", (input, expected) => {
    const { streamed, line } = run(input);
    expect(line).toBe(expected);
    expect(streamed).toBe(expected);
  });
});

describe("planDebate", () => {
  it("opens with the harshest critic against the biggest fan and gives everyone a turn", () => {
    const plan = planDebate([
      { persona: "investor", score: 70 },
      { persona: "engineer", score: 30 },
      { persona: "marketer", score: 55 },
      { persona: "customer", score: 40 },
    ]);
    expect(plan.map((t) => t.speaker)).toEqual(["engineer", "investor", "customer", "engineer", "marketer"]);
    expect(plan[0].instruction).toContain("STERLING");
  });
});
