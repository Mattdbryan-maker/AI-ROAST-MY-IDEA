/* eslint-disable @typescript-eslint/no-unused-vars -- animation sources keep a few scaffolding variables; behaviour is verified by the rendered output */
// Renders the Phase 6 trailer frames (parallel Chromium pages) and composites them with the real app footage.
//
//   node scripts/trailer/render.mjs frames [from] [to]   render stage frames to artifacts/phase-6-cinematic/work/frames
//   node scripts/trailer/render.mjs compose              cut the app clips, overlay, concatenate, mux audio.wav
//
// Source authenticity: the courtroom and the four judges are promotional animation drawn in code for this trailer.
// The app segment is the REAL app (next start) replaying the stored Haiku sourdough result (capture-app.mjs).
import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";

const TL = createRequire(import.meta.url)("./timeline.js");
const ROOT = join("artifacts", "phase-6-cinematic");
const WORK = join(ROOT, "work");
const FRAMES = join(WORK, "frames");
const OVER = join(WORK, "overlay");
const FPS = 30;
const mode = process.argv[2];

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts });
  if (r.status !== 0) { console.error(r.stderr?.slice(-3000)); throw new Error(`${cmd} failed`); }
  return r.stdout;
}

if (mode === "frames") {
  mkdirSync(FRAMES, { recursive: true });
  mkdirSync(OVER, { recursive: true });
  const total = Math.round(TL.duration * FPS);
  const from = +(process.argv[3] ?? 0), to = Math.min(+(process.argv[4] ?? total), total);
  const appA = Math.round(TL.act.app[0] * FPS), appB = Math.round(TL.act.app[1] * FPS);
  const workers = 4;
  const browser = await chromium.launch();
  const t0 = Date.now();
  let done = 0;
  await Promise.all(Array.from({ length: workers }, async (_, k) => {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    page.on("pageerror", (e) => console.error("PAGEERROR", e.message));
    await page.goto(pathToFileURL(resolve("scripts/trailer/stage.html")).href);
    await page.waitForFunction(() => window.SCENE_READY && window.FONTS_READY, null, { timeout: 20000 });
    for (let f = from + k; f < to; f += workers) {
      const t = f / FPS;
      await page.evaluate((x) => window.renderFrame(x), t);
      const name = String(f).padStart(4, "0");
      if (f >= appA && f < appB) await page.screenshot({ path: join(OVER, `${name}.png`), omitBackground: true });
      else await page.screenshot({ path: join(FRAMES, `${name}.jpg`), type: "jpeg", quality: 96 });
      if (++done % 60 === 0) console.log(`${done}/${to - from} frames, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    await page.close();
  }));
  await browser.close();
  console.log("frames done", ((Date.now() - t0) / 1000).toFixed(0) + "s");
}

if (mode === "compose") {
  const marks = JSON.parse(readFileSync(join(ROOT, "raw", "mobile-marks.json"), "utf8"));
  const SRC = join(ROOT, "raw", "mobile-raw.webm");
  const vs = marks.video_start ?? 0.6; // video time = mark time - video_start
  const m = (n, plus = 0) => marks[n] - vs + plus;
  const [A0, A1] = TL.act.app;
  // Real-app clips: [source start (seconds in mobile-raw.webm), output seconds, speed]. Start times were chosen by
  // inspecting the raw recording frame by frame (see media-validation.md): each lands on settled, content-rich UI.
  const clips = [
    [20.9, 1.1, 2.0], // the pitch being typed into the real app and finishing ("...through a DAO.")
    [56.0, 1.2, 1.4], // HYPE's real testimony typing: "Sourdough is a cult, but cults don't buy certificates for their pet yeast."
    [104.8, 1.2, 1], // the real verdict screen: 19 / 100, KILL IT
    [121.65, 1.3, 1], // the real FIX MY IDEA result: Starter Lineage Log, 19 -> 35 -> 41 (projected), KILL IT
  ];
  const sum = clips.reduce((a, c) => a + c[1], 0);
  if (Math.abs(sum - (A1 - A0)) > 0.02) throw new Error(`app clips total ${sum}s, expected ${A1 - A0}s`);
  const parts = [];
  clips.forEach(([s, d, v], i) => {
    const out = join(WORK, `app${i}.mp4`);
    sh("ffmpeg", ["-y", "-loglevel", "error", "-ss", s.toFixed(3), "-t", (d * v).toFixed(3), "-i", SRC, "-vf", `setpts=(PTS-STARTPTS)/${v},fps=30,scale=1080:1920,format=yuv420p`, "-an", "-c:v", "libx264", "-crf", "14", "-preset", "fast", "-t", d.toFixed(3), out]);
    parts.push(out);
  });
  const fwd = (p) => resolve(p).split(String.fromCharCode(92)).join("/");
  writeFileSync(join(WORK, "app-list.txt"), parts.map((p) => `file '${fwd(p)}'`).join("\n"));
  sh("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(WORK, "app-list.txt"), "-c", "copy", join(WORK, "app-base.mp4")]);
  const appA = Math.round(A0 * FPS);
  sh("ffmpeg", ["-y", "-loglevel", "error", "-i", join(WORK, "app-base.mp4"), "-framerate", "30", "-start_number", String(appA), "-i", join(OVER, "%04d.png"), "-filter_complex", "[0][1]overlay=0:0:format=auto,format=yuv420p", "-c:v", "libx264", "-crf", "14", "-preset", "fast", "-r", "30", join(WORK, "app-over.mp4")]);
  const endA = Math.round(TL.act.end[0] * FPS);
  const enc = (a, b, out, start) => sh("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "30", "-start_number", String(start), "-i", join(FRAMES, "%04d.jpg"), "-frames:v", String(b - a), "-vf", "scale=in_range=pc:out_range=tv:flags=bicubic+accurate_rnd,format=yuv420p", "-c:v", "libx264", "-crf", "14", "-preset", "fast", "-color_range", "tv", "-r", "30", out]);
  enc(0, appA, join(WORK, "partA.mp4"), 0);
  const total = Math.round(TL.duration * FPS);
  enc(endA, total, join(WORK, "partD.mp4"), endA);
  writeFileSync(join(WORK, "final-list.txt"), ["partA.mp4", "app-over.mp4", "partD.mp4"].map((f) => `file '${fwd(join(WORK, f))}'`).join("\n"));
  sh("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(WORK, "final-list.txt"), "-c", "copy", join(WORK, "video-only.mp4")]);
  const wav = join(WORK, "audio.wav");
  const out = join(ROOT, "AI_ROAST_MY_IDEA_CINEMATIC_V2.mp4");
  if (existsSync(wav)) {
    sh("ffmpeg", ["-y", "-loglevel", "error", "-i", join(WORK, "video-only.mp4"), "-i", wav, "-map", "0:v", "-map", "1:a", "-af", "loudnorm=I=-14:TP=-2.5:LRA=9,aresample=44100", "-c:v", "libx264", "-crf", "16", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", out]);
    console.log("wrote", out);
  } else console.log("no audio.wav yet; wrote video-only.mp4");
}
