/**
 * Server-side access control: the invite gate for the protected beta and the
 * human-verification pass for the paid endpoints.
 *
 * Both are signed, expiring cookies. The signature uses Web Crypto so the same
 * code runs in the proxy and in route handlers. A cookie can only be minted by
 * a server that holds ACCESS_SIGNING_SECRET, after it has checked an invite code
 * or a Cloudflare Turnstile token. Nothing here is a client-side check: the
 * browser holds a ticket it cannot forge.
 */

export const BETA_COOKIE = "ar_beta";
export const PASS_COOKIE = "ar_pass";
export const BETA_TTL_SEC = 14 * 24 * 3600;
export const PASS_TTL_SEC = 30 * 60;

type Env = Record<string, string | undefined>;
type Kind = "beta" | "pass";

export interface AccessConfig {
  /** Invite codes for the protected beta. Empty = gate off. */
  betaCodes: string[];
  gateEnabled: boolean;
  turnstileSecret: string | null;
  turnstileEnabled: boolean;
  signingSecret: string | null;
  /** The gate or Turnstile is on but cannot work (no usable signing secret): everything protected fails closed. */
  misconfigured: boolean;
}

const MIN_SECRET_LENGTH = 32;

export function loadAccessConfig(env: Env = process.env): AccessConfig {
  const betaCodes = (env.BETA_ACCESS_CODES ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  const signingSecret = env.ACCESS_SIGNING_SECRET?.trim() || null;
  const turnstileSecret = env.TURNSTILE_SECRET_KEY?.trim() || null;
  const gateEnabled = betaCodes.length > 0;
  const turnstileEnabled = turnstileSecret !== null;
  const misconfigured = (gateEnabled || turnstileEnabled) && (!signingSecret || signingSecret.length < MIN_SECRET_LENGTH);
  return { betaCodes, gateEnabled, turnstileSecret, turnstileEnabled, signingSecret, misconfigured };
}

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

/** Compares without exiting early on the first differing character. */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function signToken(kind: Kind, secret: string, ttlSec: number, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + ttlSec;
  return `${exp}.${await hmac(secret, `${kind}.${exp}`)}`;
}

export async function verifyToken(kind: Kind, token: string | undefined | null, secret: string | null, now = Date.now()): Promise<boolean> {
  if (!token || !secret) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isInteger(exp) || exp * 1000 < now) return false;
  return safeEqual(token.slice(dot + 1), await hmac(secret, `${kind}.${exp}`));
}

export function codeMatches(input: string, codes: string[]): boolean {
  let ok = false;
  for (const code of codes) if (safeEqual(input.trim(), code)) ok = true;
  return ok;
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

export function cookieHeader(name: string, value: string, maxAgeSec: number, secure: boolean): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

// ── Cloudflare Turnstile ───────────────────────────────────────────────────

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Server-side verification of a Turnstile token. Tokens are single use and last
 * five minutes, so a replayed or stolen one fails. Any error or timeout is a
 * failure: verification never "passes open".
 */
export async function verifyTurnstile(
  token: string,
  secret: string,
  remoteIp: string | undefined,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp && remoteIp !== "unknown" && remoteIp !== "anonymous") body.set("remoteip", remoteIp);
    const res = await fetchImpl(TURNSTILE_VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
