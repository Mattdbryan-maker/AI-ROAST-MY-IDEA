import { describe, expect, it } from "vitest";
import { demoRoast } from "@/lib/ai/demo/engine";
import { decodeShare, encodeShare, toSharePayload } from "@/lib/share";

describe("share links", () => {
  const roast = demoRoast("An AI app that writes your wedding speech — £29 per speech. Ça marche? 🎤");

  it("round-trips a payload, including unicode", () => {
    const payload = { ...toSharePayload(roast), t: "Crème Brûlée Club 🎤" };
    const decoded = decodeShare(encodeShare(payload));
    expect(decoded).toMatchObject(payload);
  });

  it("derives the verdict from the score instead of trusting the URL", () => {
    const encoded = encodeShare({ ...toSharePayload(roast), s: 10, d: "BUILD" });
    expect(decodeShare(encoded)?.d).toBe("KILL");
  });

  it("uses the harshest panelist's line as the quote", () => {
    const payload = toSharePayload(roast);
    const min = Math.min(...roast.takes.map((t) => t.score));
    expect(roast.takes.find((t) => t.persona === payload.w)?.score).toBe(min);
  });

  it.each(["", "!!!", "abc", "x".repeat(2000), btoa('{"v":1,"t":"x","s":500}')])("rejects junk: %s", (junk) => {
    expect(decodeShare(junk)).toBeNull();
  });
});
