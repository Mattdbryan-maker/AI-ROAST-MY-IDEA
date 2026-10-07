/**
 * Builds the whole experience as ONE self-contained HTML page that runs the
 * demo panel in the browser: no server, no API routes, no API key.
 * Useful for quick demos and for hosts that only serve static files.
 *
 *   npm run build:standalone   →  dist/standalone/ai-roast-my-idea.html
 *
 * The page contains its own CSS and JS inline and loads fonts from Google Fonts.
 * The share card PNG and share links need the server, so the standalone build
 * swaps them for an in-page card and a "copy result" button.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "dist/standalone");
const tmpCss = join(outDir, ".tailwind.css");
mkdirSync(outDir, { recursive: true });

// 1. CSS: compile the app's Tailwind stylesheet (classes are detected from src/).
execFileSync(join(root, "node_modules/.bin/tailwindcss"), ["-i", join(root, "src/app/globals.css"), "-o", tmpCss, "--minify"], {
  cwd: root,
  stdio: "inherit",
});
const css = readFileSync(tmpCss, "utf8");
rmSync(tmpCss);

// 2. JS: bundle React, the UI and the demo engine into one script.
const result = await build({
  entryPoints: [join(root, "src/standalone/main.tsx")],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: true,
  jsx: "automatic",
  tsconfig: join(root, "tsconfig.json"),
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_STANDALONE_DEMO": '"1"',
  },
  alias: { "server-only": join(root, "tests/stubs/empty.ts") },
  logLevel: "warning",
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

// 3. Page. Fonts come from Google Fonts; the app's font variables point at them.
const html = `<title>AI Roast My Idea</title>
<meta name="description" content="Pitch an idea to four AI critics and get a verdict: KILL IT, FIX IT or BUILD IT.">
<meta name="theme-color" content="#050507">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap">
<style>${css}</style>
<style>
  /* Unlayered on purpose: beats any host reset wrapped around this page. */
  :root {
    color-scheme: dark;
    --font-anton: "Anton", Impact, "Arial Narrow", sans-serif;
    --font-grotesk: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
    --font-jetbrains: "JetBrains Mono", ui-monospace, monospace;
  }
  html, body { background: #050507; color: #f2efe8; margin: 0; }
  body { font-family: var(--font-grotesk); font-size: 16px; line-height: 1.5; min-height: 100dvh; }
</style>
<div id="root"></div>
<script>${js}</script>
`;

const outFile = join(outDir, "ai-roast-my-idea.html");
writeFileSync(outFile, html);
console.log(`Standalone demo → ${outFile} (${(html.length / 1024).toFixed(0)} KB)`);
