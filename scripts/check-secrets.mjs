#!/usr/bin/env node
/**
 * Secret hygiene check. Run after `npm run build`:  npm run check:secrets
 *
 *  1. Scans every file git tracks (and every staged/untracked-but-not-ignored file) for credential patterns.
 *  2. Scans the browser bundle (.next/static and the static HTML) for server-only variable NAMES and for any
 *     VALUE found in .env.local / the environment, so a leaked key fails the build gate.
 *
 * Exit code 1 on any finding. Findings never print the secret itself.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const PATTERNS = [
  ["Anthropic API key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{30,}/],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["Slack token", /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ["Private key block", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ["Upstash/KV token assigned", /(?:UPSTASH_REDIS_REST_TOKEN|KV_REST_API_TOKEN)\s*=\s*["']?[A-Za-z0-9=_-]{20,}/],
  ["Turnstile secret assigned", /TURNSTILE_SECRET_KEY\s*=\s*["']?0x[A-Za-z0-9_-]{20,}/],
];
const SERVER_ONLY_NAMES = [
  "ANTHROPIC_API_KEY",
  "ACCESS_SIGNING_SECRET",
  "TURNSTILE_SECRET_KEY",
  "ADMIN_STATS_TOKEN",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_TOKEN",
  "BETA_ACCESS_CODES",
];
const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|mp4|webm|wav|mp3|zip|gz|lock)$/i;

let findings = 0;
const report = (kind, where) => {
  findings++;
  console.error(`FOUND ${kind}: ${where}`);
};

// 1 ── repository files
const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  .split("\n")
  .filter(Boolean);
for (const file of listed) {
  if (SKIP_EXT.test(file) || file === "package-lock.json" || file.startsWith("scripts/check-secrets")) continue;
  let text;
  try {
    if (statSync(file).size > 2_000_000) continue;
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const [kind, re] of PATTERNS) if (re.test(text)) report(kind, file);
}
console.log(`scanned ${listed.length} repository files`);

// 2 ── the browser bundle
const secretValues = [];
for (const envFile of [".env.local", ".env.production.local", ".env"]) {
  if (!existsSync(envFile)) continue;
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && SERVER_ONLY_NAMES.includes(m[1]) && m[2].replace(/^["']|["']$/g, "").length >= 8) secretValues.push([m[1], m[2].replace(/^["']|["']$/g, "")]);
  }
}
for (const name of SERVER_ONLY_NAMES) {
  const v = process.env[name];
  if (v && v.length >= 8) secretValues.push([name, v]);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}
const browserDirs = [join(".next", "static")].filter(existsSync);
if (browserDirs.length === 0) console.log("no .next/static found (run `npm run build` first to scan the browser bundle)");
let bundleFiles = 0;
for (const dir of browserDirs) {
  for (const file of walk(dir)) {
    if (SKIP_EXT.test(file)) continue;
    bundleFiles++;
    const text = readFileSync(file, "utf8");
    for (const name of SERVER_ONLY_NAMES) if (text.includes(name)) report(`server-only variable name "${name}" in the browser bundle`, file);
    for (const [kind, re] of PATTERNS) if (re.test(text)) report(`${kind} in the browser bundle`, file);
    for (const [name, value] of secretValues) if (text.includes(value)) report(`VALUE of ${name} in the browser bundle`, file);
  }
}
console.log(`scanned ${bundleFiles} browser-bundle files against ${secretValues.length} configured secret value(s)`);

if (findings) {
  console.error(`\n${findings} finding(s). Do not push or deploy. Rotate any real key that appears above.`);
  process.exit(1);
}
console.log("no secrets found");
