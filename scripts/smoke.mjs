#!/usr/bin/env node
/**
 * Smoke test for a running deployment (local `next start`, a Vercel preview, or production).
 *
 *   node scripts/smoke.mjs --base https://your-preview.vercel.app --invite YOUR-CODE
 *   node scripts/smoke.mjs --base http://localhost:3000 --expect-fail-closed
 *   node scripts/smoke.mjs --base https://your-preview.vercel.app --invite YOUR-CODE --live
 *
 * Without --live it makes NO paid AI request. --live runs ONE real roast and ONE FIX (about $0.002 on Haiku)
 * and reports how long they took, which verifies the functions finish inside the host's duration limit.
 *
 * Vercel Deployment Protection (if on) sits in front of all of this: pass its bypass secret with
 * --bypass <secret> (Protection Bypass for Automation) so the script can reach the app at all.
 */
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : (args[i + 1] ?? true);
};
const base = String(opt("base") ?? "").replace(/\/$/, "");
const invite = opt("invite");
const live = args.includes("--live");
const expectFailClosed = args.includes("--expect-fail-closed");
const bypass = opt("bypass");
if (!base) {
  console.error("usage: node scripts/smoke.mjs --base <url> [--invite <code>] [--bypass <vercel-bypass-secret>] [--live] [--expect-fail-closed]");
  process.exit(2);
}

const jar = new Map();
let failures = 0;
const ok = (name, pass, detail = "") => {
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

async function http(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  if (bypass) headers["x-vercel-protection-bypass"] = String(bypass);
  const res = await fetch(base + path, { redirect: "manual", ...init, headers });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return res;
}
const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const IDEA = "A subscription box of houseplants for people who keep killing their houseplants.";

// 1. Public pages and security headers
const home = await http("/");
const gated = home.status >= 300 && home.status < 400;
ok("home page responds", home.status === 200 || gated, `status ${home.status}${gated ? " (redirect to invite page)" : ""}`);
const headersOf = (await http(gated ? "/beta" : "/")).headers;
ok("Content-Security-Policy header", Boolean(headersOf.get("content-security-policy")));
ok("X-Content-Type-Options: nosniff", headersOf.get("x-content-type-options") === "nosniff");
ok("X-Frame-Options / frame-ancestors", Boolean(headersOf.get("x-frame-options")));
ok("Referrer-Policy", Boolean(headersOf.get("referrer-policy")));
if (base.startsWith("https://")) ok("Strict-Transport-Security", Boolean(headersOf.get("strict-transport-security")));
ok("X-Powered-By is hidden", !headersOf.get("x-powered-by"));
for (const p of ["/privacy", "/terms", "/contact"]) ok(`${p} is reachable`, (await http(p)).status === 200);

// 2. Status never leaks secrets
const status = await http("/api/status");
const statusText = await status.text();
ok("/api/status responds", status.status === 200, statusText.slice(0, 120));
ok("/api/status shows no key or host", !/sk-ant|api[_-]?key|upstash|redis/i.test(statusText));

// 3. Paid endpoints cannot be reached around the gate
if (invite) {
  const direct = await http("/api/roast/stream", json({ idea: IDEA }));
  ok("AI endpoint refuses a request with no invite cookie", direct.status === 401, `status ${direct.status}`);
  const wrong = await http("/api/beta/enter", json({ code: "definitely-not-the-code" }));
  ok("wrong invite code is rejected", wrong.status === 401, `status ${wrong.status}`);
  const right = await http("/api/beta/enter", json({ code: String(invite) }));
  ok("right invite code is accepted", right.status === 200, `status ${right.status}`);
  const cookie = right.headers.getSetCookie?.().join(";") ?? "";
  ok("invite cookie is HttpOnly", /HttpOnly/i.test(cookie));
  if (base.startsWith("https://")) ok("invite cookie is Secure", /Secure/i.test(cookie));
}

// 4. Input validation and cross-site protection (no paid call is made: these are rejected first)
const bad = await http("/api/roast/stream", { method: "POST", headers: { "content-type": "application/json" }, body: "not json" });
ok("malformed body is a clean 400", bad.status === 400, `status ${bad.status}`);
const short = await http("/api/roast/stream", json({ idea: "hi" }));
ok("too-short idea is a clean 400", short.status === 400, `status ${short.status}`);
const huge = await http("/api/roast/stream", json({ idea: "x".repeat(5000) }));
ok("oversized idea is rejected", huge.status === 400, `status ${huge.status}`);
const cross = await http("/api/roast/stream", { ...json({ idea: IDEA }), headers: { "content-type": "application/json", origin: "https://evil.example" } });
ok("cross-site POST is refused", cross.status === 403 || cross.status === 401, `status ${cross.status}`);
const stats = await http("/api/admin/stats");
ok("operator stats are not public", stats.status === 404 || stats.status === 401, `status ${stats.status}`);

// 5. Fail-closed check (only meaningful when the shared limiter is deliberately absent)
if (expectFailClosed) {
  const res = await http("/api/roast/stream", json({ idea: IDEA }));
  ok("with no shared limiter the paid endpoint refuses (503)", res.status === 503, `status ${res.status}`);
}

// 6. One real journey (opt-in; costs about $0.002 on Haiku)
if (live) {
  const started = Date.now();
  const res = await http("/api/roast/stream", json({ idea: IDEA }));
  ok("live roast accepted", res.status === 200, `status ${res.status}`);
  let done = null;
  let errorEvent = null;
  const decoder = new TextDecoder();
  let buf = "";
  if (res.body) {
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.type === "done") done = ev.roast;
        if (ev.type === "error") errorEvent = ev;
      }
    }
  }
  const roastSecs = ((Date.now() - started) / 1000).toFixed(1);
  ok("live roast completed with a verdict", Boolean(done && Number.isInteger(done.overall) && done.verdict), `${roastSecs}s${errorEvent ? `, error: ${errorEvent.code}` : ""}`);
  ok("live roast came from the real model (mode: ai)", done?.mode === "ai", `mode ${done?.mode}`);
  if (done) {
    const t2 = Date.now();
    const fix = await http("/api/fix", json({ idea: IDEA, roast: done }));
    const fixJson = await fix.json().catch(() => null);
    ok("live FIX completed", fix.status === 200 && Boolean(fixJson?.pitch), `${((Date.now() - t2) / 1000).toFixed(1)}s, status ${fix.status}`);
    ok("live FIX came from the real model (mode: ai)", fixJson?.mode === "ai", `mode ${fixJson?.mode}`);
  }
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
process.exit(failures ? 1 : 0);
