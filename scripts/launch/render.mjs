// Edits the raw captures (scripts/launch/capture.mjs) into the launch videos with ffmpeg.
//
//   node scripts/launch/render.mjs reel|demo
//
// Everything on screen comes from the real app's recording. Added by the edit: cuts, speed-ups of typing and
// waiting, burned-in captions (generated from the same list as the .srt, so they cannot disagree), a standing
// disclosure label, and an original synthesised sound bed (no third-party audio).

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const which = process.argv[2];
if (!["reel", "demo"].includes(which)) throw new Error("usage: render.mjs reel|demo");

const ROOT = join("artifacts", "phase-5-launch");
const RAW = join(ROOT, "raw");
const WORK = join(ROOT, "work", which);
mkdirSync(WORK, { recursive: true });
const FONT = "C\\:/Windows/Fonts/impact.ttf";
const FONT_BODY = "C\\:/Windows/Fonts/arialbd.ttf";

const reel = which === "reel";
// Caption backing. 0.42 let dense app text (the FIX pitch, the first-steps list) show through and collide with the
// caption on a phone, so captions and the disclosure label now sit on a mostly opaque box.
const CAPTION_BOX = reel ? 0.94 : 0.85;
const W = reel ? 1080 : 1920;
const H = reel ? 1920 : 1080;
const marks = JSON.parse(readFileSync(join(RAW, `${reel ? "mobile" : "desktop"}-marks.json`), "utf8"));
const SRC = join("..", "..", "raw", `${reel ? "mobile" : "desktop"}-raw.webm`); // relative to WORK
// Video time = mark time minus the moment the recording began.
const D = marks.video_start === undefined ? 0.6 : -marks.video_start;
const m = (name, plus = 0) => marks[name] + D + plus;

/** [source start, output seconds, speed, caption lines, caption style] */
const SEGMENTS = reel
  ? [
      { id: "hook", s: m("verdict", 0.1), d: 2.6, v: 1, cap: ["I built four AI judges", "to destroy your", "business idea."], size: 70, yb: 1500, band: [1240, 1530] },
      { id: "type", s: m("typing_start", 0.4), d: 2.0, v: 3.4, cap: ["Pitch it any", "business idea."] },
      { id: "wait", s: m("submitted", 0.8), d: 1.8, v: 2.4, cap: ["Four AI judges", "take their seats."] },
      { id: "sterling", s: m("trial_started", 1.0), d: 2.7, v: 1, cap: ["STERLING, the investor:", "“Thirty-five pounds buys a", "visit, not a relationship.”"] },
      { id: "kernel", s: m("sterling_next", 0.9), d: 2.9, v: 1, cap: ["KERNEL, the engineer:", "“It is fixing them on a", "pavement with a dropped spoke", "and no stand.”"] },
      { id: "hype", s: m("kernel_next", 5.2), d: 3.0, v: 1, cap: ["HYPE, the marketer:", "“A 30-minute slot is the exact", "length of a sandwich.”"] },
      { id: "wallet", s: m("hype_next", 0.9), d: 3.0, v: 1, cap: ["WALLET, the customer:", "“I would never tell my", "partner what it cost.”"] },
      { id: "debate", s: m("debate_start", 6), d: 3.2, v: 1.5, cap: ["Then they argue.", "With each other."] },
      { id: "verdict", s: m("verdict", 2.2), d: 4.0, v: 1, cap: ["FIX IT. 52 out of 100."], size: 84, yb: 1500 },
      { id: "fix", s: m("fix_visible", 2.6), d: 3.6, v: 1, cap: ["FIX MY IDEA rebuilds it.", "Projected score: 52 → 68."] },
      { id: "cta", s: m("fix_scrolled", -4.4), d: 2.8, v: 1, cap: ["Would your business", "idea survive?"], big: true, yb: 1190, sub: "Link coming soon" },
    ]
  : [
      { id: "intro", s: m("landing", -1.5), d: 3.6, v: 1, cap: ["AI ROAST MY IDEA: four AI judges put your business idea on trial."] },
      { id: "type", s: m("typing_start", 0.4), d: 3.4, v: 3.0, cap: ["You type in a business idea."] },
      { id: "wait", s: m("submitted", 0.8), d: 3.0, v: 2.2, cap: ["The panel takes its seats while the first testimony loads."] },
      { id: "sterling", s: m("trial_started", 1.0), d: 7.0, v: 1.4, cap: ["STERLING, the ruthless investor, goes first."] },
      { id: "kernel", s: m("sterling_next", 0.9), d: 6.5, v: 1.4, cap: ["KERNEL, the sceptical engineer, finds the hard part."] },
      { id: "hype", s: m("kernel_next", 0.9), d: 6.5, v: 1.4, cap: ["HYPE, the marketer, looks for the story."] },
      { id: "wallet", s: m("hype_next", 0.9), d: 6.5, v: 1.4, cap: ["WALLET, the customer, says what they would actually do."] },
      { id: "debate", s: m("debate_start", 0.5), d: 9.5, v: 3.2, cap: ["Then the panel argues with itself."] },
      { id: "verdict", s: m("verdict", -0.4), d: 6.5, v: 1, cap: ["The verdict: FIX IT, 52 out of 100."] },
      { id: "fix", s: m("fix_clicked", 0.2), d: 3.5, v: 2.0, cap: ["FIX MY IDEA rebuilds the pitch around the panel’s objections."] },
      { id: "fixpage", s: m("fix_visible", 1.0), d: 8.5, v: 1.6, cap: ["New pitch, what changed and why, plus three steps to test it."] },
      { id: "end", s: m("fix_scrolled", -3.0), d: 3.0, v: 1, cap: ["AI ROAST MY IDEA. Link coming soon."] },
    ];

const LABEL = reel
  ? ["SAMPLE SESSION · real Claude Haiku 5.5 output", "recorded earlier, replayed in the live app"]
  : ["SAMPLE SESSION · real Claude Haiku 5.5 output recorded in a benchmark run (Oct 2026), replayed in the live app. Not a fresh live request."];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", ...opts });
  if (r.status !== 0) {
    console.error(r.stderr?.slice(-2500));
    throw new Error(`${cmd} failed`);
  }
}

// 1. Cut each segment at 30 fps.
const files = [];
for (const [i, seg] of SEGMENTS.entries()) {
  const out = `seg${i}.mp4`;
  run("ffmpeg", ["-y", "-loglevel", "error", "-ss", seg.s.toFixed(3), "-t", (seg.d * seg.v).toFixed(3), "-i", SRC, "-vf", `setpts=(PTS-STARTPTS)/${seg.v},fps=30,scale=${W}:${H},format=yuv420p`, "-an", "-c:v", "libx264", "-crf", "15", "-preset", "fast", "-t", seg.d.toFixed(3), out], { cwd: WORK });
  files.push(out);
}
writeFileSync(join(WORK, "list.txt"), files.map((f) => `file '${f}'`).join("\n"));
run("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "cut.mp4"], { cwd: WORK });

// 2. Captions: one drawtext per segment (+ optional sub-line), and the .srt from the same data.
let t = 0;
const filters = [];
const srt = [];
const stamp = (x) => {
  const ms = Math.round(x * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};
const wrap = (text, max) => {
  const lines = [];
  let cur = "";
  for (const w of text.split(" ")) {
    if ((cur + " " + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
};
const timeline = [];
SEGMENTS.forEach((seg, i) => {
  const a = t;
  const b = t + seg.d;
  t = b;
  const lines = reel ? seg.cap : wrap(seg.cap.join(" "), 62);
  const size = seg.size ?? (reel ? (seg.big ? 92 : 70) : 46);
  writeFileSync(join(WORK, `cap${i}.txt`), lines.join("\n"));
  const y = reel ? `${seg.yb ?? 1385}-text_h` : `${H}-95-text_h`;
  // A full-width band hides app text that would otherwise peek out beside a narrow caption box.
  if (seg.band) filters.push(`drawbox=x=0:y=${seg.band[0]}:w=iw:h=${seg.band[1] - seg.band[0]}:color=black:t=fill:enable='between(t,${a.toFixed(3)},${b.toFixed(3)})'`);
  filters.push(
    `drawtext=fontfile='${FONT}':textfile='cap${i}.txt':fontsize=${size}:fontcolor=white:borderw=${reel ? 7 : 4}:bordercolor=black:box=1:boxcolor=black@${CAPTION_BOX}:boxborderw=${reel ? 22 : 16}:line_spacing=${reel ? 10 : 6}:x=(w-text_w)/2:y=${y}:enable='between(t,${a.toFixed(3)},${b.toFixed(3)})'`,
  );
  if (seg.sub) {
    writeFileSync(join(WORK, `sub${i}.txt`), seg.sub);
    filters.push(`drawtext=fontfile='${FONT_BODY}':textfile='sub${i}.txt':fontsize=44:fontcolor=white:borderw=4:bordercolor=black:box=1:boxcolor=black@${CAPTION_BOX}:boxborderw=12:x=(w-text_w)/2:y=${(seg.yb ?? 1385) + 36}:enable='between(t,${a.toFixed(3)},${b.toFixed(3)})'`);
  }
  srt.push(`${i + 1}\n${stamp(a)} --> ${stamp(b - 0.05)}\n${lines.join(" ")}${seg.sub ? `\n${seg.sub}` : ""}\n`);
  timeline.push({ id: seg.id, start: +a.toFixed(2), end: +b.toFixed(2), speed: seg.v, source: +seg.s.toFixed(2) });
});
const total = t;
writeFileSync(join(WORK, "label.txt"), LABEL.join("\n"));
filters.push(
  reel
    ? `drawtext=fontfile='${FONT_BODY}':textfile='label.txt':fontsize=27:fontcolor=white@0.95:box=1:boxcolor=black@0.94:boxborderw=10:line_spacing=6:x=(w-text_w)/2:y=1548`
    : `drawtext=fontfile='${FONT_BODY}':textfile='label.txt':fontsize=21:fontcolor=white@0.95:box=1:boxcolor=black@0.94:boxborderw=8:x=(w-text_w)/2:y=${H}-48`,
);
writeFileSync(join(WORK, "filters.txt"), filters.join(",\n"));
const srtPath = join(ROOT, reel ? "AI_ROAST_MY_IDEA_LAUNCH_REEL_V1.srt" : "AI_ROAST_MY_IDEA_DEMO_V1.srt");
writeFileSync(srtPath, srt.join("\n"));

// 3. Original sound bed: a low drone, soft ticks on every cut, and a gavel hit on the verdict.
const cuts = timeline.map((s) => s.start);
const verdictAt = timeline.find((s) => s.id === "verdict").start;
const inputs = [];
const chains = [];
inputs.push("-f", "lavfi", "-i", `sine=f=55:r=44100:d=${total.toFixed(2)}`, "-f", "lavfi", "-i", `sine=f=82.4:r=44100:d=${total.toFixed(2)}`);
chains.push("[1:a]volume=0.10,tremolo=f=0.4:d=0.4[a0]", "[2:a]volume=0.05[a1]");
let mix = ["[a0]", "[a1]"];
cuts.slice(1).forEach((c, k) => {
  // A short high tick per cut.
  inputs.push("-f", "lavfi", "-i", `aevalsrc='0.35*sin(2*PI*1400*t)*exp(-t*70)':d=0.2:s=44100`);
  const idx = 3 + k;
  chains.push(`[${idx}:a]adelay=${Math.round(c * 1000)}|${Math.round(c * 1000)},volume=0.35[t${k}]`);
  mix.push(`[t${k}]`);
});
const gi = 3 + cuts.length - 1;
inputs.push("-f", "lavfi", "-i", `aevalsrc='0.5*sin(2*PI*62*t)*exp(-t*5)+0.15*(random(0)-0.5)*exp(-t*28)':d=1.4:s=44100`);
chains.push(`[${gi}:a]adelay=${Math.round(verdictAt * 1000)}|${Math.round(verdictAt * 1000)}[g]`);
mix.push("[g]");
chains.push(`${mix.join("")}amix=inputs=${mix.length}:normalize=0,alimiter=limit=0.7,afade=t=in:d=0.4,afade=t=out:st=${(total - 0.8).toFixed(2)}:d=0.8[aout]`);
writeFileSync(join(WORK, "audio.txt"), chains.join(";\n"));

const outName = reel ? "AI_ROAST_MY_IDEA_LAUNCH_REEL_V1.mp4" : "AI_ROAST_MY_IDEA_DEMO_V1.mp4";
const out = join("..", "..", outName);
run(
  "ffmpeg",
  ["-y", "-loglevel", "error", "-i", "cut.mp4", ...inputs, "-/filter:v", "filters.txt", "-/filter_complex", "audio.txt", "-map", "0:v", "-map", "[aout]", "-c:v", "libx264", "-crf", "17", "-preset", "slow", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", total.toFixed(3), out],
  { cwd: WORK },
);
writeFileSync(join(ROOT, `${which}-timeline.json`), JSON.stringify({ total, timeline }, null, 2));
console.log(`${outName}: ${total.toFixed(1)}s`);
