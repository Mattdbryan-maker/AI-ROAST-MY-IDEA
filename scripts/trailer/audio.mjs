/* eslint-disable @typescript-eslint/no-unused-vars -- animation sources keep a few scaffolding variables; behaviour is verified by the rendered output */
// Synthesises the trailer's soundtrack from code: no samples, no third-party music or voices, nothing downloaded.
// Reads the same cue list the animation uses (timeline.js), so sound and picture cannot drift apart.
//
//   node scripts/trailer/audio.mjs   ->  artifacts/phase-6-cinematic/work/audio.wav (44.1 kHz, 16-bit stereo)
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const TL = createRequire(import.meta.url)("./timeline.js");
const SR = 44100;
const DUR = TL.duration + 0.6;
const N = Math.ceil(DUR * SR);
const L = new Float32Array(N), R = new Float32Array(N);

// deterministic noise
let seed = 1234567;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return ((seed >>> 0) / 4294967296); };
const noise = () => rnd() * 2 - 1;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class SVF { // state-variable filter, cutoff can change per sample
  constructor() { this.lp = 0; this.bp = 0; this.hp = 0; }
  run(x, f, q = 0.7) {
    const F = 2 * Math.sin(Math.PI * Math.min(f, SR * 0.45) / SR);
    this.lp += F * this.bp;
    this.hp = x - this.lp - this.bp / q;
    this.bp += F * this.hp;
    return this;
  }
}
/** Add a mono signal (array) at time t with gain and pan (0 left .. 1 right). */
function put(t, sig, gain = 1, pan = 0.5) {
  const s0 = Math.round(t * SR);
  const gl = Math.cos(pan * Math.PI / 2) * gain, gr = Math.sin(pan * Math.PI / 2) * gain;
  for (let i = 0; i < sig.length; i++) { const j = s0 + i; if (j < 0 || j >= N) continue; L[j] += sig[i] * gl; R[j] += sig[i] * gr; }
}
/** Generate `dur` seconds from fn(t, i) */
function gen(dur, fn) { const n = Math.floor(dur * SR); const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = fn(i / SR, i); return a; }
const ex = (t, k) => Math.exp(-t * k);
const sine = (f, t) => Math.sin(TAU * f * t);
const bell = (f, t, k) => (sine(f, t) + 0.5 * sine(f * 2.76, t) * ex(t, k * 1.6) + 0.3 * sine(f * 5.4, t) * ex(t, k * 2.2)) * ex(t, k);

/* ---------- SFX ---------- */
const sfx = {
  hit: (g) => { // opening impact
    put(0, gen(1.4, (t) => { const f = 70 * Math.exp(-t * 3) + 36; return sine(f, t) * ex(t, 2.8) * 0.9; }), g);
    const f = new SVF(); put(0, gen(0.4, (t) => f.run(noise(), 1800 * ex(t, 6) + 120, 0.8).lp * ex(t, 9) * 0.8), g);
  },
  lamps: (g, t0) => { [0, 0.06, 0.13, 0.2].forEach((d, k) => put(t0 + d, gen(0.05, (t) => noise() * ex(t, 90) * 0.5 + sine(120 + k * 40, t) * ex(t, 60) * 0.5), g * 0.7, [0.25, 0.5, 0.5, 0.75][k])); put(t0, gen(0.8, (t) => sine(100, t) * 0.12 * Math.min(1, t * 8) * ex(t, 2)), g); },
  panic: (g, t0) => { for (let k = 0; k < 5; k++) put(t0 + k * 0.11, gen(0.08, (t) => sine(720 - k * 30 + sine(30, t) * 60, t) * ex(t, 28) * 0.5), g * 0.6, 0.78); },
  whoosh: (g, t0) => { const f = new SVF(); put(t0 - 0.15, gen(0.5, (t) => f.run(noise(), 300 + 4200 * Math.pow(t / 0.5, 2), 1.4).bp * Math.sin(Math.PI * (t / 0.5)) * 1.1), g * 0.7); },
  glitch: (g, t0) => { let h = 0; put(t0, gen(0.3, (t, i) => { if (i % (4 + ((i / 700) | 0) % 9) === 0) h = noise(); return h * (rnd() > 0.35 ? 1 : 0) * ex(t, 6) * 0.6 + (Math.floor(t * 48) % 2 ? sine(1800, t) : 0) * 0.18 * ex(t, 7); }), g); },
  riser: (g, t0, c) => { const d = c.dur ?? 1; const f = new SVF(); put(t0, gen(d, (t) => { const u = t / d; return (f.run(noise(), 400 + 6000 * u * u, 1.2).bp * 0.5 + sine(200 + 1400 * u * u, t) * 0.25) * u * u * 0.8; }), g * 0.8); },
  brow: (g, t0) => { put(t0 + 0.15, gen(0.5, (t) => sine(520 + 380 * Math.min(1, t * 2), t) * Math.sin(Math.PI * Math.min(1, t * 2)) * 0.04), g, 0.5); },
  error: (g, t0) => { [880, 660, 880].forEach((f, k) => put(t0 + k * 0.13, gen(0.1, (t) => (Math.sin(TAU * f * t) > 0 ? 1 : -1) * ex(t, 12) * 0.22), g, 0.25)); },
  shades: (g, t0) => { put(t0, gen(0.5, (t) => sine(1700 * Math.exp(-t * 4) + 240, t) * ex(t, 4) * 0.28), g, 0.5); put(t0 + 0.38, gen(0.1, (t) => noise() * ex(t, 60) * 0.5), g * 0.6, 0.5); put(t0 - 0.05, gen(0.28, (t) => sine(520 + 700 * t, t) * Math.sin(Math.PI * t / 0.28) * 0.22), g, 0.5); },
  blink: (g, t0) => put(t0, gen(0.04, (t) => noise() * ex(t, 140) * 0.5), g, 0.75),
  coin: (g, t0) => { put(t0, gen(0.8, (t) => bell(2349, t, 7) * 0.4), g, 0.4); put(t0 + 0.09, gen(0.8, (t) => bell(3136, t, 7) * 0.4), g, 0.6); put(t0 - 0.03, gen(0.06, (t) => noise() * ex(t, 80) * 0.6), g, 0.5); },
  gasp: (g, t0) => { const f = new SVF(); put(t0, gen(0.34, (t) => f.run(noise(), 900 + 2200 * t / 0.34, 1.6).bp * Math.sin(Math.PI * t / 0.34) * 0.55), g, 0.78); },
  fan: (g, t0, c) => { const d = c.dur ?? 2; const f = new SVF(); put(t0, gen(d, (t) => { const u = t / d; const w = 30 + 380 * u * u; const am = 0.6 + 0.4 * sine(8 + 90 * u, t); return (f.run(noise(), 500 + 2500 * u, 1.0).bp * 0.5 + (((w * t) % 1) * 2 - 1) * 0.12) * am * (0.3 + 0.7 * u) * 0.7; }), g * 0.7, 0.25); },
  spark: (g, t0) => { for (let k = 0; k < 14; k++) put(t0 + k * 0.026 + rnd() * 0.02, gen(0.03, (t) => noise() * ex(t, 130) * 0.7), g * 0.5, 0.2 + rnd() * 0.15); },
  bsod: (g, t0) => { put(t0, gen(0.5, (t) => (Math.sin(TAU * (900 * Math.exp(-t * 4) + 140) * t) > 0 ? 1 : -1) * 0.2 * ex(t, 3)), g, 0.25); const f = new SVF(); put(t0 + 0.05, gen(0.45, (t) => f.run(noise(), 3000, 0.7).hp * ex(t, 5) * 0.25), g, 0.25); put(t0 + 0.5, gen(0.05, (t) => noise() * ex(t, 120)), g * 0.7, 0.25); },
  reboot: (g, t0) => { [440, 554, 659, 880].forEach((f, k) => put(t0 + k * 0.07, gen(0.09, (t) => (Math.sin(TAU * f * t) > 0 ? 1 : -1) * ex(t, 16) * 0.16), g, 0.25)); put(t0 + 0.3, gen(0.5, (t) => bell(1568, t, 8) * 0.22), g, 0.3); },
  shadesOn: (g, t0) => { sfx.whoosh(0.7, t0 - 0.05); [1568, 2093, 2637, 3136].forEach((f, k) => put(t0 + 0.08 + k * 0.05, gen(0.5, (t) => bell(f, t, 9) * 0.22), g, 0.5)); },
  notify: (g, t0) => { const k = (sfx._n = (sfx._n || 0) + 1); put(t0, gen(0.3, (t) => sine(1175, t) * ex(t, 16) * 0.3 + sine(1568 * (1 + 0.06 * k), t - 0) * (t > 0.09 ? ex(t - 0.09, 14) * 0.3 : 0)), g, 0.5 + (k % 2 ? 0.2 : -0.2)); },
  deflate: (g, t0) => { put(t0, gen(0.7, (t) => sine(900 * Math.exp(-t * 2.8) + 120, t) * ex(t, 3) * 0.3), g, 0.5); const f = new SVF(); put(t0, gen(0.6, (t) => f.run(noise(), 2400 * ex(t, 3) + 300, 0.9).bp * ex(t, 4) * 0.5), g, 0.5); },
  wallet: (g, t0) => { const f = new SVF(); put(t0 - 0.1, gen(0.5, (t) => f.run(noise(), 260 + 200 * Math.sin(t * 18), 3).bp * Math.sin(Math.PI * t / 0.5) * 0.35), g, 0.75); put(t0 + 0.38, gen(0.7, (t) => bell(3058, t, 6) * 0.2), g, 0.75); // leather creak + a lone 1p
    // sad trombone idiom (generic descending wah-wah)
    [[0.55, 0.28, 196], [0.86, 0.28, 185], [1.17, 0.28, 175], [1.48, 0.7, 165]].forEach(([d, len, fq], k) => { const lp = new SVF(); put(t0 + d, gen(len, (t) => { const ph = (fq * (1 - 0.06 * (t / len)) * t) % 1; const wah = 500 + 900 * Math.sin(Math.PI * Math.min(1, t / (len * 0.6))); return lp.run(ph * 2 - 1, wah, 1.6).lp * Math.min(1, t * 30) * ex(t, 2.2) * 0.34; }), g * 0.75, 0.7); }); },
  receipt: (g, t0) => { const f = new SVF(); put(t0 - 0.05, gen(0.55, (t) => f.run(noise(), 3600, 1.2).bp * (0.5 + 0.5 * Math.sin(t * 90 + Math.sin(t * 13) * 4)) * Math.sin(Math.PI * t / 0.55) * 0.5), g, 0.75); sfx.whoosh(0.4, t0 + 0.05); },
  walk: (g, t0) => { [0, 0.18, 0.36, 0.54].forEach((d, k) => put(t0 + d, gen(0.1, (t) => (sine(95, t) * 0.5 + noise() * 0.15) * ex(t, 40)), g * 0.5, 0.78 - k * 0.02)); },
  tension: (g, t0, c) => { const d = c.dur ?? 1.6; const lp = new SVF(); const soft = c.soft ? 0.5 : 1; [110, 116.5, 123.5, 164.8].forEach((f, k) => { const s = new SVF(); put(t0, gen(d, (t) => { const u = t / d; const ph = (f * (1 + 0.12 * u) * t) % 1; return s.run(ph * 2 - 1, 300 + 2200 * u * u, 1.1).lp * u * (0.55 + 0.45 * Math.sin(t * (6 + 22 * u))) * 0.16 * soft; }), g, 0.2 + k * 0.2); }); sfx.riser(g * 0.7 * soft, t0 + 0.2, { dur: d - 0.2 }); },
  creak: (g, t0) => { const f = new SVF(); put(t0, gen(1.4, (t) => { const fq = 88 + 50 * t + 20 * sine(7, t); return (f.run((((fq * t) % 1) * 2 - 1), 700 + 500 * sine(3, t), 2.5).bp * 0.5 + noise() * 0.04) * Math.sin(Math.PI * t / 1.4) * 0.5; }), g, 0.55); },
  stamp: (g, t0) => { // THE verdict impact
    put(t0, gen(2.2, (t) => sine(48 * Math.exp(-t * 1.2) + 30, t) * ex(t, 1.8) * 1.0), g, 0.5);
    const f = new SVF(); put(t0, gen(0.5, (t) => f.run(noise(), 500 * ex(t, 9) + 80, 0.8).lp * ex(t, 7) * 1.2), g, 0.5);
    put(t0, gen(1.0, (t) => (bell(230, t, 5) * 0.4 + bell(610, t, 8) * 0.3 + bell(1330, t, 10) * 0.2)), g * 0.8, 0.5);
    put(t0, gen(0.12, (t) => noise() * ex(t, 40) * 0.9), g * 0.8, 0.5);
    const h = new SVF(); put(t0 + 0.02, gen(1.2, (t) => h.run(noise(), 5200, 0.8).hp * ex(t, 4.5) * 0.28), g, 0.5);
  },
  boom: (g, t0) => { const f = new SVF(); put(t0, gen(2.6, (t) => f.run(noise(), 130 + 90 * ex(t, 3), 0.9).lp * ex(t, 1.5) * 0.9), g * 0.7, 0.5); },
  peek: (g, t0) => put(t0, gen(0.2, (t) => sine(880 + 380 * t / 0.2, t) * Math.sin(Math.PI * t / 0.2) * 0.3), g, 0.78),
  hope: (g, t0, c) => { const d = c.dur ?? 2.6; [220, 277.2, 329.6, 440].forEach((f, k) => put(t0, gen(d, (t) => { const u = t / d; return (sine(f, t) * 0.5 + sine(f * 2.005, t) * 0.18) * Math.sin(Math.PI * Math.min(1, u * 1.1)) * (0.75 + 0.25 * sine(5.2, t)) * 0.14; }), g, 0.25 + k * 0.17)); },
  tick: (g, t0, c) => { const d = c.dur ?? 1.9; let t = 0; let k = 0; while (t < d) { const u = t / d; put(t0 + t, gen(0.04, (x) => (sine(1500 + 900 * u, x) * 0.5 + noise() * 0.2) * ex(x, 90)), g * 0.5, 0.5); t += 0.09 - 0.05 * Math.sin(Math.PI * u) * 0.8; k++; } },
  nowallet: (g, t0) => { put(t0, gen(0.5, (t) => sine(300 * Math.exp(-t * 2) + 120 + 60 * sine(14, t), t) * ex(t, 4) * 0.3), g, 0.78); put(t0 - 0.04, gen(0.12, (t) => noise() * ex(t, 50) * 0.4), g, 0.78); },
  swipe: (g, t0) => { const f = new SVF(); put(t0 - 0.08, gen(0.22, (t) => f.run(noise(), 800 + 3000 * t / 0.22, 1.1).bp * Math.sin(Math.PI * t / 0.22) * 0.5), g * 0.6); },
  whip: (g, t0) => { sfx.whoosh(1, t0); put(t0, gen(0.4, (t) => sine(80 * ex(t, 6) + 40, t) * ex(t, 7) * 0.7), g * 0.7); },
  sting: (g, t0) => { // closing chord + bell
    [110, 164.8, 220, 277.2, 329.6].forEach((f, k) => put(t0, gen(2.9, (t) => { const ph = (f * t) % 1; const s = new SVF(); return (sine(f, t) * 0.5 + (ph * 2 - 1) * 0.18) * Math.min(1, t * 50) * ex(t, 1.3) * 0.2; }), g, 0.2 + k * 0.15));
    put(t0, gen(2.2, (t) => bell(1318.5, t, 2.4) * 0.24), g, 0.5); put(t0 + 0.55, gen(2.0, (t) => bell(1760, t, 2.6) * 0.16), g, 0.55);
    put(t0, gen(1.6, (t) => sine(46 * Math.exp(-t) + 34, t) * ex(t, 2) * 0.6), g, 0.5);
  },
};

/* ---------- character voices (babble) ---------- */
const syllables = (txt) => txt.toLowerCase().split(/\s+/).map((w) => Math.max(1, (w.match(/[aeiouy]+/g) || []).length));
function voice(line) {
  const sy = syllables(line.text).reduce((a, b) => a + b, 0);
  const span = (line.t1 - line.t0) - 0.2;
  const step = span / sy;
  const rows = [];
  for (let i = 0; i < sy; i++) rows.push(line.t0 + 0.1 + i * step + (rnd() - 0.5) * step * 0.25);
  rows.forEach((t, i) => {
    const u = i / Math.max(1, sy - 1);
    const stress = (i % 3 === 0 ? 1 : 0.7) * (0.8 + rnd() * 0.3);
    const len = clamp(step * 0.8, 0.05, 0.16);
    if (line.who === "sterling") { const f0 = 118 + (i % 4) * 9 - u * 16 + sine(0.7, i) * 6; put(t, gen(len, (x) => { const ph = (f0 * (1 + 0.012 * sine(5.5, x)) * x) % 1; const tri = Math.abs(ph * 4 - 2) - 1; const f = new SVF(); return (tri * 0.7 + sine(f0 * 2, x) * 0.2) * Math.sin(Math.PI * Math.min(1, x / len)) * 0.2 * stress; }), 1, 0.5); }
    if (line.who === "kernel") { const notes = [330, 392, 440, 523, 587, 392]; const f0 = notes[(i * 5 + 2) % notes.length]; put(t, gen(len * 0.8, (x, k) => { const q = Math.floor(k / 5) * 5; const sq = Math.sin(TAU * f0 * (q / SR)) > 0 ? 1 : -1; return sq * ex(x, 22) * 0.12 * stress; }), 1, 0.25); }
    if (line.who === "hype") { const f0 = 360 + rnd() * 160 + (i % 2) * 90; put(t, gen(len * 1.1, (x) => { const f = f0 * (1 + 0.35 * x / len) * (1 + 0.02 * sine(9, x)); return (sine(f, x) * 0.6 + sine(f * 2.01, x) * 0.25) * Math.sin(Math.PI * Math.min(1, x / (len * 1.1))) * 0.2 * stress; }), 1, 0.5); }
    if (line.who === "wallet") { const f0 = 560 + (i % 3) * 60 - u * 70; put(t, gen(len * 0.9, (x) => sine(f0 * (1 - 0.12 * x / len) * (1 + 0.03 * sine(34, x)), x) * ex(x, 14) * 0.22 * stress), 1, 0.75); }
  });
}

/* ---------- reveal bed: the real-app segment (27.0 - 31.8) ---------- */
function appBed() {
  const [a, b] = TL.act.app; const d = b - a;
  // swelling minor-7 pad
  [110, 130.8, 164.8, 196].forEach((f, k) => { const s = new SVF(); put(a, gen(d + 0.2, (t) => { const u = t / (d + 0.2); const env = Math.min(1, t * 6) * (0.55 + 0.45 * u) * Math.min(1, (d + 0.2 - t) * 8); return s.run((((f * t) % 1) * 2 - 1), 500 + 1400 * u, 1.0).lp * env * 0.16; }), 1, 0.3 + k * 0.13); });
  // plucked arpeggio, eighth notes at 150 bpm
  const notes = [220, 261.6, 329.6, 392, 329.6, 261.6, 196, 246.9];
  for (let k = 0; k < Math.floor(d / 0.2); k++) { const f = notes[k % notes.length]; const s = new SVF(); put(a + k * 0.2, gen(0.22, (t) => s.run((((f * t) % 1) * 2 - 1), 3200 * ex(t, 9) + 300, 1.2).lp * ex(t, 11) * 0.34), 1, 0.4 + (k % 4) * 0.07); }
  // soft kick on the beat
  for (let k = 0; k < Math.floor(d / 0.4); k++) put(a + k * 0.4, gen(0.16, (t) => sine(62 * Math.exp(-t * 18) + 40, t) * ex(t, 22) * 0.9), 1, 0.5);
}

/* ---------- music bed ---------- */
function duckEnv(t) {
  let d = 1;
  for (const c of TL.cues) if (c.type === "silence") { const a = c.t, b = c.t + (c.dur ?? 0.7); const fade = 0.06; const k = t < a - fade ? 0 : t < a ? (t - (a - fade)) / fade : t < b ? 1 : t < b + 0.25 ? 1 - (t - b) / 0.25 : 0; d *= 1 - k; }
  return d;
}
function bed() {
  const lp = new SVF(), lp2 = new SVF(), nz = new SVF();
  const a = gen(DUR, (t) => {
    const end = t >= TL.act.end[0];
    const hopeful = t >= 22.0 && t < 27.0;
    const base = 0.5 * (t < 0.4 ? t / 0.4 : 1) * (t > 27.0 ? 0.0 : 1) * (end ? 0 : 1);
    const pulseRate = t < 3.4 ? 2.0 : t > 18.3 && t < 19.9 ? 2.0 + 5 * (t - 18.3) / 1.6 : 1.4;
    const ph = (t * pulseRate) % 1;
    const thump = ex(ph, 14) * sine(55, ph) * (t < 3.4 ? 0.35 + 0.35 * t / 3.4 : t > 18.3 && t < 19.9 ? 0.9 : 0.25);
    const droneF = hopeful ? 82.4 : 55;
    const drone = sine(droneF, t) * 0.5 + sine(droneF * 2.003, t) * 0.18 + lp.run((((droneF * 2 * t) % 1) * 2 - 1), 380 + 160 * sine(0.15, t), 0.9).lp * 0.2;
    const haze = nz.run(noise(), 500 + 200 * sine(0.2, t), 0.8).lp * 0.05;
    return (drone + thump * 1.2 + haze) * base * duckEnv(t) * 0.5;
  });
  put(0, a, 1, 0.5);
}

/* ---------- build ---------- */
bed();
appBed();
for (const c of TL.cues) { const f = sfx[c.type]; if (f) f(c.gain ?? 1, c.t, c); }
for (const l of TL.lines) voice(l);
// reaction vocalisations that are not dialogue
put(4.7, gen(0.34, (t) => sine(138 - 22 * t, t) * Math.sin(Math.PI * t / 0.34) * 0.12), 1, 0.5); // Sterling "hmm"
put(6.3, gen(0.3, (t) => sine(500 + 700 * t / 0.3, t) * Math.sin(Math.PI * t / 0.3) * 0.26), 1, 0.5); // Hype "oh!"
put(15.15, gen(0.6, (t) => sine(520 * Math.exp(-t * 1.6) + 180, t) * ex(t, 2.5) * 0.22), 1, 0.5); // Hype "aww"
put(24.55, gen(0.3, (t) => sine(540 - 160 * t / 0.3, t) * Math.sin(Math.PI * t / 0.3) * 0.24), 1, 0.78); // Wallet "huh?"

// master: soft-clip, peak-normalise to -1 dBFS, short fade out
let peak = 0;
for (let i = 0; i < N; i++) { L[i] = Math.tanh(L[i] * 1.1); R[i] = Math.tanh(R[i] * 1.1); peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
const norm = 0.794 / (peak || 1);
const fadeStart = (TL.duration - 0.4) * SR;
for (let i = 0; i < N; i++) { const fo = i > fadeStart ? Math.max(0, 1 - (i - fadeStart) / (0.5 * SR)) : 1; L[i] *= norm * fo; R[i] *= norm * fo; }
const out = Buffer.alloc(44 + N * 4);
out.write("RIFF", 0); out.writeUInt32LE(36 + N * 4, 4); out.write("WAVEfmt ", 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { out.writeInt16LE(Math.round(clamp(L[i], -1, 1) * 32767), 44 + i * 4); out.writeInt16LE(Math.round(clamp(R[i], -1, 1) * 32767), 46 + i * 4); }
mkdirSync(join("artifacts", "phase-6-cinematic", "work"), { recursive: true });
writeFileSync(join("artifacts", "phase-6-cinematic", "work", "audio.wav"), out);
console.log(`audio.wav ${DUR.toFixed(1)}s, peak before norm ${peak.toFixed(2)}`);
