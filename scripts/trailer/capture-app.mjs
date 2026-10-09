// Captures the REAL running app (next start) replaying the stored Haiku sourdough-NFT result, for the Phase 6 trailer.
//
// Content: the stored Claude Haiku 5.5 output from the 2026-10-08 benchmark (bench/results/..., prompt
// version 2026-10-08.4), replayed through the app's own streaming endpoints with Playwright route
// interception. The UI, animations and pacing are the real app; the model output is prerecorded, NOT a fresh
// live session. No API call is made.
//
//   node scripts/trailer/capture-app.mjs mobile|desktop   (app must be listening on $PORT, default 3200)

import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const kind = process.argv[2];
if (!["mobile", "desktop"].includes(kind)) throw new Error("usage: capture-app.mjs mobile|desktop");
const PORT = process.env.PORT ?? "3200";
const OUT = join("artifacts", "phase-6-cinematic", "raw");
mkdirSync(OUT, { recursive: true });

const results = JSON.parse(readFileSync("bench/results/2026-10-08T19-08-52-final-10/results.json", "utf8"));
const record = results.records.find((r) => r.ideaId === "bad-nft-sourdough" && /haiku/.test(r.target));
const idea = results.ideas.find((i) => i.id === "bad-nft-sourdough").pitch;
const { roast, fix } = record;

const ndjson = [
  { type: "start", mode: "ai" },
  { type: "meta", title: roast.title, summary: roast.summary },
  ...roast.takes.map((take, index) => ({ type: "take", index, take })),
  { type: "debate", lines: roast.debate, lastDone: true },
  { type: "done", roast: { ...roast, mode: "ai" } },
]
  .map((e) => JSON.stringify(e))
  .join("\n");

const marks = {};
const t0 = Date.now();
const mark = (name) => {
  marks[name] = (Date.now() - t0) / 1000;
  console.log(name.padEnd(22), marks[name].toFixed(1));
};

const browser = await chromium.launch();
const mobile = kind === "mobile";
// Mobile: the real app runs in a 540px-wide iframe (so it gets its genuine phone layout) scaled 2x inside a
// 1080x1920 page, which records as a crisp 9:16 video. Desktop: a plain 1920x1080 page.
const size = mobile ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
const context = await browser.newContext({ viewport: size, recordVideo: { dir: join(OUT, kind + "-video"), size } });
const page = await context.newPage();
mark("video_start"); // the recording begins here; the edit uses it to line marks up with video time

// Replay the stored output through the real endpoints.
await page.route("**/api/roast/stream", (route) => route.fulfill({ status: 200, contentType: "application/x-ndjson", body: `${ndjson}\n` }));
await page.route("**/api/fix", (route) => route.fulfill({ json: { ...fix, mode: "ai" } }));

const url = `http://localhost:${PORT}/`;
let ui = page;
let frame = page;
if (mobile) {
  await page.setContent(
    `<body style="margin:0;background:#050507;overflow:hidden"><iframe src="${url}" style="width:540px;height:960px;border:0;transform:scale(2);transform-origin:0 0"></iframe></body>`,
  );
  ui = page.frameLocator("iframe");
  frame = page.frames().find((fr) => fr !== page.mainFrame());
} else {
  await page.goto(url);
}
await ui.getByLabel(/pitch your idea/i).waitFor();
await page.waitForTimeout(2500); // landing animation
mark("landing");

await ui.getByLabel(/pitch your idea/i).click();
mark("typing_start");
await page.keyboard.type(idea, { delay: 18 });
mark("typing_end");
await page.waitForTimeout(500);
await ui.getByRole("button", { name: /put it on trial/i }).click();
mark("submitted");

await ui.getByText(/testimony/i).first().waitFor({ timeout: 60_000 });
mark("trial_started");
// Each judge plays for real for a few seconds, then the app's own "Next witness" control advances.
for (const [i, name] of ["sterling", "kernel", "hype", "wallet"].entries()) {
  await page.waitForTimeout(i === 0 ? 11_000 : 9_000);
  mark(`${name}_end`);
  await ui.getByRole("button", { name: i < 3 ? /next witness/i : /the panel deliberates/i }).click();
  if (i < 3) await page.waitForTimeout(1200);
  mark(`${name}_next`);
}
// The debate plays out on its own and auto-advances to the verdict.
mark("debate_start");
await ui.getByText(/^(KILL IT|FIX IT|BUILD IT)$/).waitFor({ timeout: 120_000 });
mark("verdict");
await page.waitForTimeout(6000);
mark("verdict_settled");
await ui.getByText(/how they voted/i).waitFor({ timeout: 30_000 });
await page.waitForTimeout(2500);
mark("scorecards");
await ui.getByRole("button", { name: /fix my idea/i }).first().click();
mark("fix_clicked");
await ui.getByText(/what changed/i).waitFor({ timeout: 60_000 });
mark("fix_visible");
await page.waitForTimeout(3500);
// Walk the FIX page like a viewer scrolling.
const height = await frame.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < height; y += mobile ? 260 : 320) {
  await frame.evaluate((top) => window.scrollTo({ top, behavior: "smooth" }), y);
  await page.waitForTimeout(650);
}
mark("fix_scrolled");
await page.waitForTimeout(1500);

writeFileSync(join(OUT, `${kind}-marks.json`), JSON.stringify(marks, null, 2));
await page.screenshot({ path: join(OUT, `${kind}-final.png` ) });
const video = page.video();
await context.close(); // flushes the video
console.log(kind, "video:", await video.path());
await browser.close();
