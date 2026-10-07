import type { ApiErrorCode, DebateLine, PersonaId, PersonaTake, Roast } from "./types";

/**
 * Events streamed by POST /api/roast/stream as newline-delimited JSON.
 *
 *   start → meta → (progress* → take)×4 → debate* → done
 *
 * `progress` carries the take currently being written (partial text);
 * `take` is that persona's validated, final take. `reset` means the server
 * is starting the roast over (e.g. a retry) and the client should discard
 * everything it has received so far.
 */
export type RoastStreamEvent =
  | { type: "start"; mode: Roast["mode"] }
  | { type: "meta"; title: string; summary: string }
  | {
      type: "progress";
      index: number;
      persona: PersonaId;
      headline: string;
      headlineDone: boolean;
      points: string[];
      /** How many of `points` are finished. */
      pointsDone: number;
    }
  | { type: "take"; index: number; take: PersonaTake }
  | { type: "debate"; lines: DebateLine[]; lastDone: boolean }
  | { type: "done"; roast: Roast }
  | { type: "reset"; reason: string }
  | { type: "error"; code: ApiErrorCode; message: string };
