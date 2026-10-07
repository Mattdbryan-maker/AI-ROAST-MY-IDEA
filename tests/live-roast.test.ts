import { describe, expect, it } from "vitest";
import { DemoProvider, demoRoast } from "@/lib/ai/demo/engine";
import { streamRoastEvents } from "@/lib/ai/stream";
import { EMPTY_LIVE, liveFromRoast, liveReducer, type LiveRoast } from "@/lib/live-roast";

const IDEA = "An AI app that writes your wedding speech from a 5-minute voice interview. £29 per speech.";

describe("liveReducer", () => {
  it("rebuilds the final roast from the event stream", async () => {
    let state: LiveRoast = EMPTY_LIVE;
    let sawPartial = false;
    for await (const e of streamRoastEvents(new DemoProvider({ cps: 0 }), IDEA)) {
      state = liveReducer(state, e);
      if (state.takes.some((t) => !t.final && t.headline)) sawPartial = true;
    }
    expect(sawPartial).toBe(true);
    expect(state.roast).toEqual(demoRoast(IDEA));
    expect(state.takes.every((t) => t.final)).toBe(true);
    expect(state).toEqual(liveFromRoast(demoRoast(IDEA)));
  });

  it("ignores late progress for a finished take, and clears on reset", () => {
    const roast = demoRoast(IDEA);
    let state = liveReducer(EMPTY_LIVE, { type: "take", index: 0, take: roast.takes[0] });
    state = liveReducer(state, { type: "progress", index: 0, persona: "investor", headline: "x", headlineDone: false, points: [], pointsDone: 0 });
    expect(state.takes[0].final).toEqual(roast.takes[0]);

    const reset = liveReducer(state, { type: "reset", reason: "retry" });
    expect(reset.takes).toEqual([]);
    expect(reset.generation).toBe(state.generation + 1);
  });
});
