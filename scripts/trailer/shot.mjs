// usage: node scripts/trailer/shot.mjs <html> <out.png> [w] [h] [query]
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const [html, out, w = 1800, h = 1500, q = ""] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on("pageerror", (e) => console.error("PAGEERROR", e.message));
p.on("console", (m) => m.type() === "error" && console.error("CONSOLE", m.text()));
await p.goto(pathToFileURL(resolve(html)).href + q);
await p.waitForTimeout(500);
await p.screenshot({ path: out });
await b.close();
