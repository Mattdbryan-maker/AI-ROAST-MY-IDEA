import { z } from "zod";
import { PERSONA_ORDER } from "./personas";
import { PersonaIdSchema, VerdictSchema, type Roast } from "./types";
import { verdictFor } from "./scoring";

/**
 * Share links carry a compact, validated summary of a result in the URL
 * itself (base64url JSON), so results can be shared without a database.
 * Only the title, scores and one quote travel — never the full pitch.
 */

const score = z.number().int().min(0).max(100);

export const SharePayloadSchema = z.object({
  v: z.literal(1),
  t: z.string().trim().min(1).max(64),
  s: score,
  p: z.tuple([score, score, score, score]),
  q: z.string().trim().min(1).max(180),
  w: PersonaIdSchema,
  d: VerdictSchema.optional(),
});
export type SharePayload = z.infer<typeof SharePayloadSchema>;

export function toSharePayload(roast: Roast): SharePayload {
  const harshest = [...roast.takes].sort((a, b) => a.score - b.score)[0];
  return {
    v: 1,
    t: roast.title,
    s: roast.overall,
    p: PERSONA_ORDER.map((id) => roast.takes.find((t) => t.persona === id)?.score ?? 0) as SharePayload["p"],
    q: harshest.headline,
    w: harshest.persona,
  };
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export function encodeShare(payload: SharePayload): string {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeShare(encoded: string | null | undefined): (SharePayload & { d: NonNullable<SharePayload["d"]> }) | null {
  if (!encoded || encoded.length > 1200 || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const parsed = SharePayloadSchema.safeParse(JSON.parse(fromBase64Url(encoded)));
    if (!parsed.success) return null;
    // The verdict is always derived from the score, never trusted from the URL.
    return { ...parsed.data, d: verdictFor(parsed.data.s) };
  } catch {
    return null;
  }
}
