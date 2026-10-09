// Exports the four judges as reusable assets: a standalone SVG per judge (neutral pose), an expression sheet per
// judge, a line-up and the courtroom group shot. The rig itself (characters.js) is the animation source.
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
const OUT = join("artifacts", "phase-6-cinematic", "characters");
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
p.on("pageerror", (e) => console.error("PAGEERROR", e.message));
await p.goto(pathToFileURL(resolve("scripts/trailer/export.html")).href);
await p.waitForFunction(() => window.EXPORT_READY, null, { timeout: 15000 });
const ids = ["sterling", "kernel", "hype", "wallet"];
for (const id of ids) {
  const svg = await p.evaluate((i) => window.exportSvg(i), id);
  writeFileSync(join(OUT, `${id}.svg`), svg);
  await p.evaluate((i) => window.showSheet(i), id);
  await p.screenshot({ path: join(OUT, `${id}-expressions.png`) });
}
await p.evaluate(() => window.showLineup());
await p.screenshot({ path: join(OUT, "lineup.png") });
await b.close();
// group shot from the trailer stage
const b2 = await chromium.launch();
const p2 = await b2.newPage({ viewport: { width: 1080, height: 1920 } });
await p2.goto(pathToFileURL(resolve("scripts/trailer/stage.html")).href);
await p2.waitForFunction(() => window.SCENE_READY && window.FONTS_READY, null, { timeout: 15000 });
await p2.evaluate(() => { window.renderFrame(1.2); });
await p2.screenshot({ path: join(OUT, "group-shot.png") });
await b2.close();
console.log("characters exported to", OUT);
