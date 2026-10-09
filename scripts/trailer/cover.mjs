// Renders the social cover (1080x1920) from the same scene engine as the trailer.
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
const out = join("artifacts", "phase-6-cinematic", "AI_ROAST_MY_IDEA_CINEMATIC_COVER_V2.png");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
p.on("pageerror", (e) => console.error("PAGEERROR", e.message));
await p.goto(pathToFileURL(resolve("scripts/trailer/stage.html")).href);
await p.waitForFunction(() => window.SCENE_READY && window.FONTS_READY, null, { timeout: 15000 });
await p.evaluate(() => window.renderCover());
await p.screenshot({ path: out });
await b.close();
console.log("wrote", out);
