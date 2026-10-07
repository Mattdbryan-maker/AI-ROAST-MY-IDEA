import { describe, expect, it } from "vitest";
import { parsePartialJson } from "@/lib/partial-json";

describe("parsePartialJson", () => {
  it("parses complete documents with nothing open", () => {
    const doc = { a: "x", b: [1, 2, { c: true, d: null }], e: "quote \" and \\ and é" };
    const { value, open } = parsePartialJson(JSON.stringify(doc));
    expect(value).toEqual(doc);
    expect(open.size).toBe(0);
  });

  it("keeps the partial trailing string and marks its path open", () => {
    const { value, open } = parsePartialJson('{"title":"Uber for D');
    expect(value).toEqual({ title: "Uber for D" });
    expect(open.has("title")).toBe(true);
    expect(open.has("")).toBe(true);
  });

  it("tracks nested open paths", () => {
    const { value, open } = parsePartialJson('{"takes":[{"persona":"investor","points":["one","tw');
    expect(value).toEqual({ takes: [{ persona: "investor", points: ["one", "tw"] }] });
    expect([...open].sort()).toEqual(["", "takes", "takes.0", "takes.0.points", "takes.0.points.1"]);
  });

  it("drops unfinished keys, numbers and literals", () => {
    expect(parsePartialJson('{"a":"b","sc').value).toEqual({ a: "b" });
    expect(parsePartialJson('{"a":"b","score":7').value).toEqual({ a: "b" });
    expect(parsePartialJson('{"a":"b","score":72,').value).toEqual({ a: "b", score: 72 });
    expect(parsePartialJson('{"ok":tr').value).toEqual({});
  });

  it("never splits an escape sequence", () => {
    expect(parsePartialJson('{"a":"x\\').value).toEqual({ a: "x" });
    expect(parsePartialJson('{"a":"x\\u00').value).toEqual({ a: "x" });
  });

  it("agrees with JSON.parse at every prefix of a real document", () => {
    const doc = JSON.stringify({ t: "Title", takes: [{ p: "investor", pts: ["a, b", "c"], s: 61 }], d: [] });
    for (let n = 0; n <= doc.length; n++) {
      expect(() => parsePartialJson(doc.slice(0, n))).not.toThrow();
    }
    expect(parsePartialJson(doc).value).toEqual(JSON.parse(doc));
  });

  it("handles empty input", () => {
    expect(parsePartialJson("")).toMatchObject({ value: undefined });
  });
});
