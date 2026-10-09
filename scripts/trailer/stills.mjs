// usage: node scripts/trailer/stills.mjs <outDir> t1 t2 ...   (renders full-size stills of the stage at those times)
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { mkdirSync } from "node:fs";
const [out, ...ts] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on("pageerror", (e) => console.error("PAGEERROR", e.message));
p.on("console", (m) => m.type() === "error" && console.error("CONSOLE", m.text()));
await p.goto(pathToFileURL(resolve("scripts/trailer/stage.html")).href);
await p.waitForFunction(() => window.SCENE_READY && window.FONTS_READY, null, { timeout: 15000 });
for (const t of ts) {
  await p.evaluate((x) => window.renderFrame(x), +t);
  await p.screenshot({ path: join(out, `t${String(t).replace(".", "_")}.png`) });
  console.log("still", t);
}
await b.close();
