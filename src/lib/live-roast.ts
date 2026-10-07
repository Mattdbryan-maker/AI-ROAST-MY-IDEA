import type { RoastStreamEvent } from "./stream-events";
import type { DebateLine, PersonaId, PersonaTake, Roast } from "./types";

/**
 * Client-side state for a roast that is still streaming in. Takes are kept in
 * the order the panel delivered them; `final` is set once a take is complete
 * and validated, and `roast` once the whole verdict is in.
 */
export interface LiveTake {
  persona: PersonaId;
  headline: string;
  headlineDone: boolean;
  points: string[];
  pointsDone: number;
  final?: PersonaTake;
}

export interface LiveRoast {
  mode?: Roast["mode"];
  title?: string;
  summary?: string;
  takes: LiveTake[];
  debate: DebateLine[];
  debateLastDone: boolean;
  roast?: Roast;
  /** Bumped on every server reset so views can restart cleanly. */
  generation: number;
}

export const EMPTY_LIVE: LiveRoast = { takes: [], debate: [], debateLastDone: false, generation: 0 };

export function liveFromRoast(roast: Roast): LiveRoast {
  return {
    mode: roast.mode,
    title: roast.title,
    summary: roast.summary,
    takes: roast.takes.map(takeFromFinal),
    debate: roast.debate,
    debateLastDone: true,
    roast,
    generation: 0,
  };
}

function takeFromFinal(take: PersonaTake): LiveTake {
  return {
    persona: take.persona,
    headline: take.headline,
    headlineDone: true,
    points: take.points,
    pointsDone: take.points.length,
    final: take,
  };
}

export function liveReducer(state: LiveRoast, event: RoastStreamEvent | { type: "clear" }): LiveRoast {
  switch (event.type) {
    case "clear":
      return { ...EMPTY_LIVE, generation: state.generation + 1 };
    case "start":
      return { ...state, mode: event.mode };
    case "reset":
      return { ...EMPTY_LIVE, mode: state.mode, generation: state.generation + 1 };
    case "meta":
      return { ...state, title: event.title, summary: event.summary };
    case "progress": {
      if (state.takes[event.index]?.final) return state;
      const takes = [...state.takes];
      takes[event.index] = {
        persona: event.persona,
        headline: event.headline,
        headlineDone: event.headlineDone,
        points: event.points,
        pointsDone: event.pointsDone,
      };
      return { ...state, takes };
    }
    case "take": {
      const takes = [...state.takes];
      takes[event.index] = takeFromFinal(event.take);
      return { ...state, takes };
    }
    case "debate":
      return { ...state, debate: event.lines, debateLastDone: event.lastDone };
    case "done": {
      // Keep the delivery order of takes for the trial; make sure each has its final version.
      const byPersona = new Map(event.roast.takes.map((t) => [t.persona, t]));
      const seen = state.takes.filter((t) => byPersona.has(t.persona)).map((t) => takeFromFinal(byPersona.get(t.persona)!));
      const missing = event.roast.takes.filter((t) => !seen.some((s) => s.persona === t.persona)).map(takeFromFinal);
      return {
        ...state,
        mode: event.roast.mode,
        title: event.roast.title,
        summary: event.roast.summary,
        takes: [...seen, ...missing],
        debate: event.roast.debate,
        debateLastDone: true,
        roast: event.roast,
      };
    }
    case "error":
      return state;
  }
}
