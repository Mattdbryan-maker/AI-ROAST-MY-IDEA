// Builds the 1080x1920 social cover from real frames of the app recording (see render.mjs / capture.mjs).
//   node scripts/launch/cover.mjs
//
// Needs artifacts/phase-5-launch/work/cover/{s,k,h,w,v}.png: full-size mobile frames (sterling, kernel, hype,
// wallet testimonies, and the verdict). They are cropped here; nothing is drawn that is not in the app.

import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join("artifacts", "phase-5-launch", "work", "cover");
const OUT = join("artifacts", "phase-5-launch", "AI_ROAST_MY_IDEA_COVER_V1.png");

// Crops (x, y, w, h in the 1080x1920 frame): the persona identity block, and the verdict ring + stamp.
const crop = (name, [x, y, w, h]) => {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", join(DIR, `${name}.png`), "-vf", `crop=${w}:${h}:${x}:${y}`, join(DIR, `${name}_c.png`)]);
  return `data:image/png;base64,${readFileSync(join(DIR, `${name}_c.png`)).toString("base64")}`;
};
const persona = { s: crop("s", [30, 280, 700, 190]), k: crop("k", [30, 280, 700, 190]), h: crop("h", [30, 280, 700, 190]), w: crop("w", [30, 280, 700, 190]) };
const verdict = crop("v", [0, 290, 1080, 1000]);
const font = (file) => readFileSync(join("src", "assets", "fonts", file)).toString("base64");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Anton;src:url(data:font/woff;base64,${font("anton-400.woff")}) format("woff")}
@font-face{font-family:Mono;src:url(data:font/woff;base64,${font("jetbrains-mono-500.woff")}) format("woff")}
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1920px;background:#050507;position:relative;overflow:hidden;font-family:Anton}
.glow{position:absolute;inset:0;background:radial-gradient(900px 700px at 50% 38%,rgba(255,77,46,.28),transparent 70%),radial-gradient(700px 600px at 50% 85%,rgba(255,190,60,.10),transparent 70%)}
.chip{position:absolute;top:120px;left:0;right:0;text-align:center;font-family:Mono;font-size:30px;letter-spacing:.32em;color:#9a9aa6;text-transform:uppercase}
h1{position:absolute;top:175px;left:0;right:0;text-align:center;font-weight:400;font-size:150px;line-height:.98;color:#fff;text-transform:uppercase;letter-spacing:.01em;text-shadow:0 0 60px rgba(255,77,46,.35)}
h1 em{font-style:normal;color:#ff4d2e}
.verdict{position:absolute;top:660px;left:210px;width:660px;border-radius:28px;overflow:hidden;border:2px solid rgba(255,190,60,.35);box-shadow:0 0 90px rgba(255,150,40,.25)}
.verdict img{width:660px;display:block}
.grid{position:absolute;top:1310px;left:70px;right:70px;display:grid;grid-template-columns:1fr 1fr;gap:18px}
.grid div{border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.12);background:#0a0a10}
.grid img{width:100%;display:block}
.foot{position:absolute;top:1700px;left:0;right:0;text-align:center;font-family:Mono;font-size:21px;letter-spacing:.08em;color:#8a8a96;text-transform:uppercase}
</style></head><body>
<div class="glow"></div>
<div class="chip">An AI experiment</div>
<h1>Four AI judges<br>vs your<br><em>business idea</em></h1>
<div class="verdict"><img src="${verdict}"></div>
<div class="grid"><div><img src="${persona.s}"></div><div><img src="${persona.k}"></div><div><img src="${persona.h}"></div><div><img src="${persona.w}"></div></div>
<div class="foot">AI Roast My Idea · screenshots from the app · sample session</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: OUT });
await browser.close();
console.log(OUT);
