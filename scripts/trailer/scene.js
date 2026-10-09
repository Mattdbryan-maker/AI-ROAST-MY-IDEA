/* eslint-disable @typescript-eslint/no-unused-vars -- animation sources keep a few scaffolding variables; behaviour is verified by the rendered output */
/* Courtroom scene + director for the AI ROAST MY IDEA cinematic trailer (Phase 6).
 * Everything is a pure function of time: renderFrame(t) poses every rig, moves the camera, and draws the overlays.
 * Promotional animation only: none of this exists in the app. The real app appears in separate footage (see render.mjs). */
(() => {
  const { E, set, Sterling, Kernel, Hype, Wallet, withBase, defs } = window.JUDGES;
  const TL = window.TL;
  const W = 1080, H = 1920;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = {
    lin: (t) => t,
    io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
    back: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    elastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
    step: (t) => (t < 1 ? 0 : 1),
  };
  // Piecewise keyframes: [[t, value, easeIntoThisKey?], ...]
  function kf(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (t < keys[i + 1][0]) {
        const [t0, v0] = keys[i];
        const [t1, v1, e] = keys[i + 1];
        return lerp(v0, v1, ease[e || "io"]((t - t0) / (t1 - t0)));
      }
    }
    return keys[keys.length - 1][1];
  }
  const track = (t, spec) => { const o = {}; for (const k in spec) o[k] = kf(t, spec[k]); return o; };
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  // 0..1 pulse that rises at a, holds to b, falls by c
  const env = (t, a, b, c) => (t < a ? 0 : t < b ? ease.out((t - a) / (b - a)) : t < c ? 1 - ease.io((t - b) / (c - b)) : 0);
  const decay = (t, t0, k) => (t < t0 ? 0 : Math.exp(-(t - t0) * k));

  const svg = document.getElementById("stage");
  defs(svg);
  const root = E("g", {}, svg);
  const world = E("g", {}, root);
  const hud = E("g", {}, svg);

  /* ---------------- extra defs ---------------- */
  const d = svg.querySelector("defs");
  const lg = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => { const g = E("linearGradient", { id, x1, y1, x2, y2 }, d); stops.forEach(([o, c, a = 1]) => E("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g)); };
  const rg = (id, stops) => { const g = E("radialGradient", { id }, d); stops.forEach(([o, c, a = 1]) => E("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g)); };
  lg("bgWall", [[0, "#0b0c14"], [0.5, "#0a0b11"], [1, "#050509"]]);
  lg("bgFloor", [[0, "#07080d"], [1, "#0f1118"]]);
  lg("benchGrad", [[0, "#1a1c26"], [0.5, "#0f1017"], [1, "#07080c"]]);
  lg("benchTop", [[0, "#2c2f3d"], [1, "#161824"]]);
  lg("holoFill", [[0, "#bfefff", 0.22], [1, "#4aa8ff", 0.06]]);
  lg("vignette", [[0, "#000", 0], [1, "#000", 0.85]]);
  rg("vig", [[0.55, "#000", 0], [1, "#000", 0.82]]);
  rg("floorGlow", [[0, "#ffffff", 0.14], [1, "#ffffff", 0]]);
  ["Amber:#ffc247", "Cyan:#33e7ff", "Pink:#ff4fd8", "Mint:#6dffb0"].forEach((s) => {
    const [n, c] = s.split(":");
    lg(`cone${n}`, [[0, c, 0.55], [0.6, c, 0.16], [1, c, 0]]);
  });
  lg("coneWhite", [[0, "#ffffff", 0.5], [1, "#ffffff", 0]]);
  const clip = E("clipPath", { id: "seatClip" }, d);
  E("rect", { x: -400, y: -400, width: 2000, height: 1905 }, clip); // anything below the bench front is cut off

  /* ---------------- world: courtroom ---------------- */
  const bg = E("g", {}, world);
  E("rect", { x: -1200, y: -1200, width: 3480, height: 4200, fill: "url(#bgWall)" }, bg);
  // architectural ribs receding to a vanishing point at the top centre
  const ribs = E("g", {}, bg);
  for (let i = -9; i <= 9; i++) {
    const x = 540 + i * 190;
    E("path", { d: `M ${540 + i * 55} 300 L ${x} 1500 L ${x + 70} 1500 L ${540 + i * 55 + 20} 300 Z`, fill: "#10121b", stroke: "#1a1d2a", "stroke-width": 3 }, ribs);
  }
  // big arch + halo ring behind the investor's throne
  E("circle", { cx: 540, cy: 560, r: 430, fill: "none", stroke: "#2a2112", "stroke-width": 30, opacity: 0.8 }, bg);
  E("circle", { cx: 540, cy: 560, r: 400, fill: "none", stroke: "#ffc247", "stroke-width": 3, opacity: 0.35 }, bg);
  E("circle", { cx: 540, cy: 560, r: 340, fill: "none", stroke: "#ffc247", "stroke-width": 2, opacity: 0.18, "stroke-dasharray": "6 18" }, bg);
  // ceiling light bars
  for (let i = 0; i < 5; i++) E("rect", { x: 140 + i * 200, y: 120, width: 120, height: 8, rx: 4, fill: "#2b3350", opacity: 0.6 }, bg);
  // floor
  E("rect", { x: -1200, y: 1505, width: 3480, height: 1800, fill: "url(#bgFloor)" }, bg);
  const grid = E("g", { opacity: 0.35 }, bg);
  for (let i = -12; i <= 12; i++) E("path", { d: `M ${540 + i * 40} 1480 L ${540 + i * 330} 3200`, stroke: "#27445a", "stroke-width": 2 }, grid);
  for (let j = 0; j < 9; j++) { const y = 1490 + Math.pow(j / 8, 2) * 1500; E("path", { d: `M -1200 ${y} L 2300 ${y}`, stroke: "#27445a", "stroke-width": 2 }, grid); }
  E("ellipse", { cx: 540, cy: 1680, rx: 520, ry: 120, fill: "url(#floorGlow)" }, bg);

  // seat positions
  const POS = {
    sterling: { x: 540, y: 895, s: 1.0 },
    kernel: { x: 200, y: 1375, s: 0.98 },
    hype: { x: 540, y: 1400, s: 0.9 },
    wallet: { x: 880, y: 1375, s: 0.98 },
  };
  const ctor = { sterling: Sterling, kernel: Kernel, hype: Hype, wallet: Wallet };
  const cone = {}; // spotlight cones
  const coneName = { sterling: "Amber", kernel: "Cyan", hype: "Pink", wallet: "Mint" };
  const lightLayer = E("g", { style: "mix-blend-mode:screen" }, world);
  for (const id of Object.keys(POS)) {
    const p = POS[id];
    const topW = 70, botW = id === "sterling" ? 560 : 430;
    const y0 = id === "sterling" ? 120 : 520;
    cone[id] = E("path", { d: `M ${p.x - topW / 2} ${y0} L ${p.x + topW / 2} ${y0} L ${p.x + botW / 2} ${p.y + 60} L ${p.x - botW / 2} ${p.y + 60} Z`, fill: `url(#cone${coneName[id]})`, opacity: 1 }, lightLayer);
  }
  // judge bodies (clipped at the bench front)
  const seatLayer = E("g", { "clip-path": "url(#seatClip)" }, world);
  const rigs = {};
  const seats = {};
  // draw order: sterling (back), then the front row
  for (const id of ["sterling", "kernel", "wallet", "hype"]) {
    const p = POS[id];
    const g = E("g", { transform: `translate(${p.x} ${p.y}) scale(${p.s})` }, seatLayer);
    seats[id] = g;
    rigs[id] = ctor[id](g);
  }
  // benches (in front of the judges)
  const bench = E("g", {}, world);
  // investor's raised bench
  E("path", { d: "M 250 895 L 830 895 L 880 1010 L 200 1010 Z", fill: "url(#benchGrad)", stroke: "#05060a", "stroke-width": 6 }, bench);
  E("path", { d: "M 250 895 L 830 895", stroke: "#ffc247", "stroke-width": 6, opacity: 0.9 }, bench);
  E("path", { d: "M 215 996 L 865 996", stroke: "#ffc247", "stroke-width": 3, opacity: 0.5 }, bench);
  E("rect", { x: 430, y: 934, width: 220, height: 46, rx: 8, fill: "#17140b", stroke: "#ffc247", "stroke-width": 3 }, bench);
  E("text", { x: 540, y: 970, "text-anchor": "middle", "font-family": "Anton", "font-size": 34, fill: "#ffc247", "letter-spacing": 6 }, bench).textContent = "STERLING";
  // front row bench
  E("path", { d: "M -400 1375 L 1480 1375 L 1480 1505 L -400 1505 Z", fill: "url(#benchGrad)", stroke: "#05060a", "stroke-width": 6 }, bench);
  E("path", { d: "M -400 1375 L 1480 1375", stroke: "url(#benchTop)", "stroke-width": 10 }, bench);
  const strips = {};
  [["kernel", 20, 380, "#33e7ff"], ["hype", 380, 700, "#ff4fd8"], ["wallet", 700, 1060, "#6dffb0"]].forEach(([id, x0, x1, col]) => {
    strips[id] = E("rect", { x: x0 + 20, y: 1484, width: x1 - x0 - 40, height: 8, rx: 4, fill: col }, bench);
  });
  [["kernel", 200, "KERNEL", "#33e7ff"], ["hype", 540, "HYPE", "#ff4fd8"], ["wallet", 880, "WALLET", "#6dffb0"]].forEach(([id, x, name, col]) => {
    E("rect", { x: x - 105, y: 1416, width: 210, height: 46, rx: 8, fill: "#0b0d12", stroke: col, "stroke-width": 3 }, bench);
    E("text", { x, y: 1451, "text-anchor": "middle", "font-family": "Anton", "font-size": 32, fill: col, "letter-spacing": 6 }, bench).textContent = name;
  });
  // podium for the accused idea
  const podium = E("g", {}, world);
  E("path", { d: "M 400 1690 L 680 1690 L 720 1950 L 360 1950 Z", fill: "url(#benchGrad)", stroke: "#05060a", "stroke-width": 6 }, podium);
  E("ellipse", { cx: 540, cy: 1690, rx: 160, ry: 30, fill: "#10131b", stroke: "#cfeaff", "stroke-width": 3 }, podium);
  E("ellipse", { cx: 540, cy: 1686, rx: 130, ry: 22, fill: "none", stroke: "#8fd8ff", "stroke-width": 3, opacity: 0.9 }, podium);
  // idea hologram (orb with rings)
  const orb = E("g", { transform: "translate(540 1550)" }, world);
  const orbGlow = E("circle", { r: 230, fill: "url(#gGlowCyan)", opacity: 0.35 }, orb);
  const rings = [0, 1, 2].map((i) => E("ellipse", { rx: 120 - i * 16, ry: 38 - i * 5, fill: "none", stroke: "#bfefff", "stroke-width": 3 - i * 0.6, opacity: 0.8 - i * 0.2 }, orb));
  const orbCore = E("circle", { r: 62, fill: "url(#holoFill)", stroke: "#bfefff", "stroke-width": 3 }, orb);
  const orbQ = E("text", { y: 28, "text-anchor": "middle", "font-family": "Anton", "font-size": 90, fill: "#e8f9ff", opacity: 0.9 }, orb);
  orbQ.textContent = "?";
  // haze + dust
  const haze = E("g", {}, world);
  const hazeBlobs = [0, 1, 2, 3].map((i) => E("ellipse", { rx: 520, ry: 130, fill: "#8aa6ff", opacity: 0.06 }, haze));
  const dust = E("g", {}, world);
  const motes = Array.from({ length: 56 }, (_, i) => E("circle", { r: 1.5 + hash(i) * 2.5, fill: "#fff" }, dust));
  // world-space FX (shockwave, receipt, sparkles, afterimage)
  const wfx = E("g", {}, world);
  const shock = E("circle", { fill: "none", stroke: "#ff3b3b", "stroke-width": 18, opacity: 0 }, wfx);
  const shock2 = E("circle", { fill: "none", stroke: "#fff", "stroke-width": 6, opacity: 0 }, wfx);
  const flyingReceipt = E("g", { opacity: 0 }, wfx);
  E("path", { d: "M -34 -110 L 34 -110 L 34 0 L 22 -10 L 10 0 L -2 -10 L -14 0 L -26 -10 L -34 0 Z", fill: "#f4f1e8", stroke: "#05060a", "stroke-width": 5 }, flyingReceipt);
  E("path", { d: "M -22 -86 L 22 -86 M -22 -66 L 14 -66 M -22 -46 L 22 -46 M -22 -26 L 6 -26", stroke: "#9c978a", "stroke-width": 5 }, flyingReceipt);

  /* ---------------- HUD (screen-space) ---------------- */
  const vig = E("rect", { x: 0, y: 0, width: W, height: H, fill: "url(#vig)", "pointer-events": "none" }, hud);
  const redWash = E("rect", { x: 0, y: 0, width: W, height: H, fill: "#ff1f2e", opacity: 0, style: "mix-blend-mode:multiply" }, hud);
  const redGlow = E("rect", { x: 0, y: 0, width: W, height: H, fill: "#ff1f2e", opacity: 0, style: "mix-blend-mode:screen" }, hud);
  const dim = E("rect", { x: 0, y: 0, width: W, height: H, fill: "#000", opacity: 0 }, hud);
  const flashW = E("rect", { x: 0, y: 0, width: W, height: H, fill: "#fff", opacity: 0 }, hud);
  const text = (parent, str, attrs) => { const t = E("text", Object.assign({ "text-anchor": "middle", "font-family": "Anton" }, attrs), parent); t.textContent = str; return t; };
  const outlineText = (parent, str, x, y, size, fill, attrs = {}) => {
    const g = E("g", {}, parent);
    const base = Object.assign({ x, y, "font-size": size, "letter-spacing": attrs.ls ?? 2 }, attrs);
    text(g, str, Object.assign({}, base, { fill: "#000", stroke: "#000", "stroke-width": size * 0.22, "stroke-linejoin": "round", opacity: 0.9 }));
    text(g, str, Object.assign({}, base, { fill }));
    return g;
  };

  // Hook text
  const hook = E("g", {}, hud);
  ["I BUILT 4 AI JUDGES", "TO DESTROY", "BUSINESS IDEAS."].forEach((line, i) => {
    outlineText(hook, line, 540, 345 + i * 112, i === 0 ? 86 : 100, i === 2 ? "#ff4d4d" : "#fff", { ls: 3 });
  });
  const hookBar = E("rect", { x: 0, y: 0, width: 0, height: 0, opacity: 0 }, hud);

  // Accused card
  const accused = E("g", { opacity: 0 }, hud);
  const accPanel = E("g", {}, accused);
  E("rect", { x: 70, y: 400, width: 940, height: 430, rx: 26, fill: "#06131d", "fill-opacity": 0.82, stroke: "#8fd8ff", "stroke-width": 4 }, accPanel);
  text(accPanel, "THE ACCUSED", { x: 540, y: 470, "font-size": 40, fill: "#8fd8ff", "letter-spacing": 12 });
  outlineText(accPanel, "NFTs FOR", 540, 600, 130, "#fff", { ls: 2 });
  outlineText(accPanel, "SOURDOUGH STARTERS", 540, 722, 92, "#ffe08a", { ls: 1 });
  // sourdough boule + chain-link token icon
  const icon = E("g", { transform: "translate(150 520)" }, accPanel);
  E("ellipse", { cx: 0, cy: 10, rx: 62, ry: 46, fill: "#c98b3d", stroke: "#05060a", "stroke-width": 6 }, icon);
  E("path", { d: "M -34 -8 Q -8 -22 18 -8 M -22 12 Q 4 -2 32 12", fill: "none", stroke: "#f2d49b", "stroke-width": 7, "stroke-linecap": "round" }, icon);
  E("path", { d: "M 0 -34 L 22 -22 L 22 4 L 0 16 L -22 4 L -22 -22 Z", fill: "#33e7ff", stroke: "#05060a", "stroke-width": 5, transform: "translate(72 -30) scale(.9)" }, icon);
  const accScan = E("g", { opacity: 0.18 }, accPanel);
  for (let i = 0; i < 20; i++) E("rect", { x: 70, y: 400 + i * 22, width: 940, height: 3, fill: "#000" }, accScan);
  // compact banner version (kept during reactions)
  const banner = E("g", { opacity: 0 }, hud);
  E("rect", { x: 130, y: 292, width: 820, height: 74, rx: 37, fill: "#06131d", "fill-opacity": 0.85, stroke: "#8fd8ff", "stroke-width": 3 }, banner);
  text(banner, "ON TRIAL: NFTs FOR SOURDOUGH STARTERS", { x: 540, y: 342, "font-size": 40, fill: "#e8f9ff", "letter-spacing": 2 });

  // Dialogue card
  const card = E("g", { opacity: 0 }, hud);
  const cardBg = E("rect", { x: 50, y: 1180, width: 980, height: 250, rx: 30, fill: "#05060b", "fill-opacity": 0.9, stroke: "#fff", "stroke-width": 4 }, card);
  const cardChip = E("rect", { x: 70, y: 1146, width: 300, height: 56, rx: 28, fill: "#fff" }, card);
  const cardName = text(card, "", { x: 220, y: 1189, "font-size": 40, fill: "#05060a", "letter-spacing": 5 });
  const cardRole = text(card, "", { x: 1000, y: 1186, "font-size": 24, fill: "#fff", "letter-spacing": 4, opacity: 0.85, "text-anchor": "end" });
  const cardLines = [0, 1, 2, 3].map((i) => E("text", { x: 82, y: 1266 + i * 60, "font-family": "Space Grotesk", "font-weight": 700, "font-size": 50, fill: "#fff" }, card));
  const measure = document.createElement("canvas").getContext("2d");
  function wrap(str, size, maxW) {
    measure.font = `700 ${size}px "Space Grotesk"`;
    const words = str.split(" "); const out = []; let cur = "";
    for (const w of words) { const test = cur ? cur + " " + w : w; if (measure.measureText(test).width > maxW && cur) { out.push(cur); cur = w; } else cur = test; }
    if (cur) out.push(cur); return out;
  }

  // Score hologram + stamp (verdict)
  const scoreG = E("g", { opacity: 0, transform: "translate(0 270)" }, hud);
  E("rect", { x: 140, y: 560, width: 800, height: 520, rx: 40, fill: "#05060b", "fill-opacity": 0.5, stroke: "#ff4d4d", "stroke-width": 4 }, scoreG);
  text(scoreG, "THE VERDICT", { x: 540, y: 612, "font-size": 40, fill: "#ffb3b3", "letter-spacing": 14 });
  const scoreNum = text(scoreG, "0", { x: 480, y: 900, "font-size": 330, fill: "#fff", "text-anchor": "end" });
  text(scoreG, "/100", { x: 500, y: 900, "font-size": 96, fill: "#ffb3b3", "text-anchor": "start" });
  const subRow = E("g", {}, scoreG);
  const subs = ["sterling", "kernel", "hype", "wallet"].map((id, i) => {
    const g = E("g", { transform: `translate(${230 + i * 207} 1000)`, opacity: 0 }, subRow);
    text(g, String(TL.real.scores[id]), { x: 0, y: 0, "font-size": 64, fill: TL.colors[id] });
    text(g, TL.names[id], { x: 0, y: 34, "font-size": 22, fill: TL.colors[id], "letter-spacing": 3 });
    return g;
  });
  const stampG = E("g", { opacity: 0 }, hud);
  const stampInner = E("g", {}, stampG);
  E("rect", { x: -440, y: -170, width: 880, height: 340, rx: 24, fill: "#3a0509", "fill-opacity": 0.35, stroke: "#ff2a2a", "stroke-width": 22 }, stampInner);
  E("rect", { x: -410, y: -140, width: 820, height: 280, rx: 14, fill: "none", stroke: "#ff2a2a", "stroke-width": 6 }, stampInner);
  const stampText = text(stampInner, "KILL IT", { x: 0, y: 84, "font-size": 270, fill: "#ff2a2a", "letter-spacing": 6 });
  const stampSub = text(stampInner, "", { x: 0, y: 150, "font-size": 40, fill: "#ffb3b3", "letter-spacing": 10 });
  // Twist texts
  const twistG = E("g", { opacity: 0 }, hud);
  const twistA = outlineText(twistG, "BUT CAN", 540, 560, 120, "#fff", { ls: 4 });
  const twistB = outlineText(twistG, "AI SAVE IT?", 540, 700, 150, "#7dffd0", { ls: 3 });
  const fixCard = E("g", { opacity: 0 }, hud);
  E("rect", { x: 70, y: 380, width: 940, height: 420, rx: 28, fill: "#04120e", "fill-opacity": 0.88, stroke: "#7dffd0", "stroke-width": 4 }, fixCard);
  text(fixCard, "FIX MY IDEA", { x: 540, y: 450, "font-size": 40, fill: "#7dffd0", "letter-spacing": 14 });
  outlineText(fixCard, "STARTER LINEAGE LOG", 540, 560, 92, "#fff", { ls: 1 });
  text(fixCard, "the real FIX output, rewritten", { x: 540, y: 660, "font-size": 30, fill: "#9be8cf", "letter-spacing": 4, "font-family": "Space Grotesk", "font-weight": 700, opacity: 0.9 });
  const nwBanner = E("g", { opacity: 0 }, hud);
  E("rect", { x: 60, y: 300, width: 960, height: 150, rx: 30, fill: "#04120e", "fill-opacity": 0.9, stroke: "#7dffd0", "stroke-width": 4 }, nwBanner);
  outlineText(nwBanner, "NO TOKENS. NO WALLET.", 540, 395, 84, "#ffe08a", { ls: 2 });
  text(nwBanner, "(from the real FIX pitch)", { x: 540, y: 435, "font-size": 24, fill: "#9be8cf", "letter-spacing": 3, "font-family": "Space Grotesk", "font-weight": 700 });
  const fixScore = E("g", { opacity: 0 }, hud);
  E("rect", { x: 220, y: 920, width: 640, height: 230, rx: 34, fill: "#05060b", "fill-opacity": 0.78, stroke: "#7dffd0", "stroke-width": 4 }, fixScore);
  const fsA = text(fixScore, "19", { x: 360, y: 1080, "font-size": 170, fill: "#ff7a7a" });
  text(fixScore, "→", { x: 540, y: 1055, "font-size": 100, fill: "#fff" });
  const fsB = text(fixScore, "19", { x: 720, y: 1080, "font-size": 190, fill: "#7dffd0" });
  text(fixScore, "PROJECTED", { x: 720, y: 1130, "font-size": 24, fill: "#9be8cf", "letter-spacing": 6, "font-family": "Space Grotesk" });
  const pointsLine = E("g", { opacity: 0 }, hud);
  outlineText(pointsLine, "+22 POINTS.", 540, 872, 84, "#fff", { ls: 2 });
  outlineText(pointsLine, "STILL DEAD.", 540, 1000, 126, "#ff4d4d", { ls: 3 });

  // App-segment overlays + end card
  const appG = E("g", { opacity: 0 }, hud);
  const appNote = E("g", {}, appG);
  E("rect", { x: 50, y: 1338, width: 980, height: 128, rx: 16, fill: "#000", "fill-opacity": 0.92 }, appNote);
  E("rect", { x: 370, y: 1316, width: 340, height: 54, rx: 27, fill: "#ffc247" }, appNote);
  text(appNote, "THE REAL APP", { x: 540, y: 1356, "font-size": 36, fill: "#05060a", "letter-spacing": 8 });
  text(appNote, "SAMPLE SESSION: real Claude Haiku 5.5 output, recorded earlier,", { x: 540, y: 1410, "font-size": 25, fill: "#fff", "font-family": "Space Grotesk", "font-weight": 700 });
  text(appNote, "replayed in the live app. Not a fresh request.", { x: 540, y: 1442, "font-size": 25, fill: "#fff", "font-family": "Space Grotesk", "font-weight": 700 });
  const endG = E("g", { opacity: 0 }, hud);
  E("rect", { x: 0, y: 0, width: W, height: H, fill: "#040508" }, endG);
  const endEyes = {};
  [["sterling", 190, 640], ["kernel", 410, 640], ["hype", 670, 640], ["wallet", 890, 640]].forEach(([id, x, y]) => {
    const g = E("g", { transform: `translate(${x} ${y})` }, endG);
    E("circle", { r: 120, fill: `url(#gGlow${{ sterling: "Amber", kernel: "Cyan", hype: "Pink", wallet: "Mint" }[id]})`, opacity: 0.55 }, g);
    const c = TL.colors[id];
    const eL = E("ellipse", { cx: -32, rx: 17, ry: 24, fill: c }, g), eR = E("ellipse", { cx: 32, rx: 17, ry: 24, fill: c }, g);
    endEyes[id] = { g, eL, eR };
  });
  outlineText(endG, "YOUR IDEA", 540, 960, 130, "#fff", { ls: 3 });
  const endA = outlineText(endG, "IS NEXT.", 540, 1120, 150, "#ff4d4d", { ls: 3 });
  const endB = outlineText(endG, "WOULD IT SURVIVE?", 540, 1250, 76, "#ffe08a", { ls: 3 });
  const brand = E("g", { transform: "translate(540 1355)" }, endG);
  text(brand, "AI ROAST MY IDEA", { x: 0, y: 0, "font-size": 52, fill: "#fff", "letter-spacing": 6 });
  text(brand, "LINK COMING SOON", { x: 0, y: 44, "font-size": 26, fill: "#9aa0b4", "letter-spacing": 8, "font-family": "Space Grotesk", "font-weight": 700 });

  /* ---------------- camera ---------------- */
  const WIDE = { cx: 540, cy: 1000, s: 0.92, r: 0 };
  // [t0, t1, from, to, ease]
  const SHOTS = [
    [0, 3.4, { cx: 540, cy: 925, s: 0.9, r: 0 }, { cx: 540, cy: 910, s: 1.0, r: 0 }, "out"],
    [3.4, 4.5, { cx: 540, cy: 1610, s: 1.35, r: 0 }, { cx: 540, cy: 1590, s: 1.6, r: 0 }, "out"],
    [4.5, 5.4, { cx: 540, cy: 695, s: 1.8, r: -3 }, { cx: 540, cy: 665, s: 2.05, r: -1 }, "lin"],
    [5.4, 6.2, { cx: 200, cy: 1265, s: 2.35, r: 2 }, { cx: 200, cy: 1265, s: 2.55, r: 0 }, "lin"],
    [6.2, 6.9, { cx: 540, cy: 1225, s: 2.0, r: 0 }, { cx: 540, cy: 1225, s: 2.2, r: 0 }, "lin"],
    [6.9, 7.2, { cx: 880, cy: 1265, s: 2.45, r: 0 }, { cx: 880, cy: 1265, s: 2.8, r: 0 }, "in"],
    [7.2, 9.35, { cx: 560, cy: 655, s: 1.75, r: -3 }, { cx: 540, cy: 645, s: 2.05, r: -1 }, "lin"],
    [9.35, 10.15, { cx: 880, cy: 1265, s: 2.3, r: 3 }, { cx: 880, cy: 1265, s: 2.45, r: 3 }, "lin"],
    [10.15, 12.45, { cx: 200, cy: 1265, s: 2.2, r: 0 }, { cx: 200, cy: 1250, s: 2.75, r: 0 }, "in"],
    [12.45, 13.0, { cx: 540, cy: 655, s: 1.9, r: -2 }, { cx: 540, cy: 655, s: 2.05, r: -2 }, "lin"],
    [13.0, 15.1, { cx: 540, cy: 1215, s: 1.85, r: 2 }, { cx: 540, cy: 1225, s: 2.15, r: -1 }, "lin"],
    [15.1, 15.75, { cx: 200, cy: 1265, s: 2.4, r: -2 }, { cx: 200, cy: 1265, s: 2.4, r: 2 }, "lin"],
    [15.75, 17.6, { cx: 880, cy: 1275, s: 2.35, r: 0 }, { cx: 880, cy: 1265, s: 2.7, r: 0 }, "lin"],
    [17.6, 18.1, { cx: 880, cy: 1285, s: 1.5, r: 0 }, { cx: 860, cy: 1265, s: 1.55, r: 0 }, "lin"],
    [18.1, 19.1, { cx: 540, cy: 1000, s: 0.98, r: 0 }, { cx: 540, cy: 900, s: 1.2, r: 0 }, "io"],
    [19.1, 19.88, { cx: 540, cy: 605, s: 1.55, r: -4 }, { cx: 540, cy: 585, s: 1.8, r: -2 }, "out"],
    [19.88, 22.0, { cx: 540, cy: 1000, s: 1.1, r: 0 }, { cx: 540, cy: 1000, s: 1.02, r: 0 }, "out"],
    [22.0, 23.2, { cx: 540, cy: 1000, s: 1.0, r: 0 }, { cx: 540, cy: 1000, s: 0.96, r: 0 }, "out"],
    [23.2, 24.45, { cx: 540, cy: 1480, s: 1.15, r: 0 }, { cx: 540, cy: 1450, s: 1.25, r: 0 }, "out"],
    [24.45, 25.4, { cx: 880, cy: 1265, s: 2.4, r: 0 }, { cx: 880, cy: 1265, s: 2.6, r: 0 }, "lin"],
    [25.4, 25.88, { cx: 540, cy: 665, s: 1.9, r: -2 }, { cx: 540, cy: 655, s: 2.1, r: -1 }, "in"],
    [25.88, 27.0, { cx: 540, cy: 1000, s: 1.08, r: 0 }, { cx: 540, cy: 1000, s: 1.0, r: 0 }, "out"],
    [27.0, 40, { cx: 540, cy: 1000, s: 1.0, r: 0 }, { cx: 540, cy: 1000, s: 1.0, r: 0 }, "lin"],
  ];
  function cameraAt(t) {
    let sh = SHOTS[SHOTS.length - 1];
    for (const s of SHOTS) if (t >= s[0] && t < s[1]) { sh = s; break; }
    const u = ease[sh[4]]((t - sh[0]) / (sh[1] - sh[0]));
    const f = sh[2], g = sh[3];
    return { cx: lerp(f.cx, g.cx, u), cy: lerp(f.cy, g.cy, u), s: lerp(f.s, g.s, u), r: lerp(f.r, g.r, u), cut: t - sh[0] };
  }

  /* ---------------- acting ---------------- */
  const IDLE = { sterling: 0.0, kernel: 1.3, hype: 2.1, wallet: 0.7 };
  const talkAt = (who, t, seed) => {
    for (const l of TL.lines) if (l.who === who && t >= l.t0 && t <= l.t1) {
      const a = Math.abs(Math.sin(t * 13 + seed)) * (0.55 + 0.45 * Math.sin(t * 4.3 + seed * 2));
      return clamp(0.18 + a * 0.9, 0, 1) * clamp((t - l.t0) / 0.12, 0, 1) * clamp((l.t1 - t) / 0.12, 0, 1);
    }
    return 0;
  };
  const blink = (t, who) => {
    const per = 3.3 + IDLE[who] * 0.4, ph = (t + IDLE[who] * 1.7) % per;
    return ph < 0.14 ? 1 - Math.sin((ph / 0.14) * Math.PI) * 0.95 : 1;
  };
  function integrate(fn, t) { let a = 0; const n = Math.max(1, Math.round(t * 60)); for (let i = 0; i < n; i++) a += fn((i + 0.5) * (t / n)) * (t / n); return a; }

  function actSterling(t) {
    const p = withBase({});
    Object.assign(p, track(t, {
      monocle: [[0, 1]],
      browL: [[0, -3], [3.0, -3], [3.3, -9], [4.4, -9], [5.25, -26, "io"], [7.1, -26], [7.4, -6], [9.4, -6], [9.8, -14], [12.4, -2], [12.6, -12], [13.1, -3], [18.1, -3], [19.3, 8], [19.88, 8], [20.1, -10], [22.5, -4], [23.4, -16], [25.3, -16], [25.7, 6]],
      browR: [[0, 0], [5.25, -10], [7.1, -10], [7.4, 0], [19.3, 12], [19.88, 12], [20.1, 0]],
      tilt: [[0, 8], [4.4, 8], [5.2, 14], [7.1, 14], [7.4, 8], [19.0, 22], [19.88, 22], [20.2, 8], [25.5, 20], [26.0, 20], [26.4, 8]],
      open: [[0, 0.85], [4.4, 0.85], [5.25, 1.0], [7.1, 1.0], [7.4, 0.8], [18.1, 0.85], [19.3, 0.4], [19.88, 0.4], [20.1, 1.0], [25.4, 0.5], [26.0, 0.5], [26.3, 0.9]],
      wide: [[0, 0], [19.88, 0], [20.1, 0.5], [20.5, 0]],
      hr: [[0, 0], [4.4, -2], [5.25, 4, "io"], [7.1, 4], [7.4, 0], [9.0, -2], [9.5, -7, "io"], [9.95, 2], [12.4, 0], [12.5, 4], [13, 0], [19.0, -4], [19.88, -4], [20.1, 3], [20.8, 0]],
      hy: [[0, 0], [9.5, 0], [9.6, -4], [9.7, 0], [9.8, -4], [9.9, 0]],
      lookX: [[0, 0.3], [4.4, 0.3], [7.1, 0], [19.88, 0]],
      lookY: [[0, 0.2], [7.0, 0.2], [7.4, -0.1]],
      calc: [[7.2, 0], [7.4, 1], [9.9, 1], [10.3, 0]],
      aLs: [[0, 7], [7.2, 7], [7.65, 72, "out"], [10.0, 72], [10.5, 7]],
      aLf: [[0, 0], [7.2, 0], [7.65, 70, "out"], [10.0, 70], [10.5, 0]],
      stamp: [[0, 0], [18.0, 1], [27.0, 1]],
      // stamp: slow, creaking lift, a held beat, then the slam at 19.9. Second, lighter lift for the re-verdict.
      aRs: [[0, 7], [18.4, 7], [19.55, 168, "io"], [19.78, 168], [19.9, 30, "in"], [20.3, 22, "out"], [20.8, 7], [25.2, 7], [25.75, 150, "io"], [25.8, 150], [25.9, 28, "in"], [26.3, 20, "out"]],
      aRf: [[0, 0], [19.78, 0], [19.9, 0], [25.9, 0]],
      glow: [[0, 1], [7.45, 1], [7.55, 2], [7.9, 1], [12.5, 1], [12.6, 2.2], [13.0, 1], [20.6, 1], [20.75, 2.2], [21.2, 1]],
    }));
    p.mouth = "smirk"; p.talk = talkAt("sterling", t, 1) * 0.9;
    if (t > 9.4 && t < 10.0) { p.mouth = "smile"; p.talk = 0.5; } // laughs at "for free"
    p.sy = 1 + (t > 9.4 && t < 10 ? Math.sin(t * 38) * 0.012 : 0);
    p.y = Math.sin((t + IDLE.sterling) * 1.6) * 3;
    p.open *= blink(t, "sterling");
    return p;
  }
  function actKernel(t) {
    const p = withBase({});
    Object.assign(p, track(t, {
      open: [[0, 0.42], [3.4, 0.42], [3.8, 0.4], [5.35, 0.45], [6.0, 0.95], [10.1, 0.9], [10.2, 0.8], [11.9, 0.7], [12.05, 1], [12.7, 0.1], [13.0, 0.75], [15.1, 0.5], [15.75, 0.5], [25.8, 0.5]],
      wide: [[0, 0], [5.9, 0], [6.0, 0.7], [6.3, 0], [11.9, 0], [12.0, 0.6], [12.1, 0]],
      tilt: [[0, 12], [5.4, 12], [10.1, 14], [12.0, 4], [13.0, 14], [15.1, 16], [25.0, 14]],
      browL: [[0, 2], [11.0, 2], [12.0, -8], [13, 3]],
      browR: [[0, 2], [11.0, 2], [12.0, -8], [13, 3]],
      lookX: [[0, 0.6], [4.4, 0.6], [5.3, 0.2], [9.9, -0.4], [10.3, 0], [12.7, 0], [12.85, 0.9], [13.0, -0.8], [13.15, 0], [15.1, 0], [15.4, -0.9], [15.7, 0.9]],
      lookY: [[0, 0.1], [12.7, 0], [12.85, -0.9], [13.1, 0.2]],
      heat: [[0, 0], [10.1, 0], [12.05, 1, "in"], [12.15, 1], [12.9, 0.1], [13.5, 0], [25.9, 0], [26.4, 0.7], [27, 0.7]],
      steam: [[0, 0], [10.4, 0], [11.3, 1], [12.4, 0.8], [13.4, 0], [26.2, 0.2], [26.6, 0.8]],
      spark: [[0, 0], [11.6, 0], [11.9, 1], [12.15, 1], [12.4, 0]],
      shake: [[0, 0], [10.4, 0], [12.05, 22], [12.4, 6], [13, 0]],
      hsx: [[0, 1]],
      hr: [[0, 0], [10.2, 0], [11.3, 3], [12.0, -4], [12.1, 0]],
      aLs: [[0, 7], [10.3, 7], [11.0, 50], [12.0, 80], [12.5, 7]],
      aRs: [[0, 7], [10.3, 7], [11.0, 40], [12.0, 70], [12.5, 7]],
      aLf: [[0, 0], [11.0, 20], [12.0, 60], [12.5, 0]],
      aRf: [[0, 0], [11.0, 20], [12.0, 50], [12.5, 0]],
    }));
    // screen mode: 0 normal, 1 ERR, 2 blue screen
    p.mode = 0;
    if (t >= 5.42 && t < 6.0) p.mode = Math.floor((t - 5.42) / 0.07) % 2 === 0 ? 1 : 0; // flicker
    if (t >= 5.78 && t < 6.0) p.mode = 1;
    if (t >= 12.12 && t < 12.78) p.mode = 2; // crash
    if (t >= 25.95 && t < 27.5) p.mode = 1;
    p.mouth = t > 25.9 ? "frown" : "flat"; p.talk = talkAt("kernel", t, 3) * 0.8;
    const fanSpeed = (u) => kf(u, [[0, 0.8], [10.0, 0.8], [12.05, 7], [12.12, 0], [12.9, 0.8], [26, 0.8]]);
    p.fanAngle = integrate(fanSpeed, t) * 360;
    p.led = Math.floor(t * 2) % 2; p.steamT = t; p.sparkT = t;
    p.y = Math.sin((t + IDLE.kernel) * 1.9) * 2.5 + (t > 12.0 && t < 12.12 ? -10 : 0);
    p.rot = p.shake > 1 ? Math.sin(t * 70) * p.shake * 0.12 : 0;
    if (p.mode === 0) p.open *= blink(t, "kernel");
    return p;
  }
  function actHype(t) {
    const p = withBase({});
    Object.assign(p, track(t, {
      shades: [[0, 1]],
      shadesY: [[0, 0], [6.2, 0], [6.5, -55, "out"], [6.95, -230, "in"], [12.9, -230], [13.12, 0, "back"], [15.05, 0], [15.4, 170, "in"], [19.88, 170], [20.2, 0, "back"], [22, 0], [22.6, 0]],
      shadesX: [[0, 0], [6.4, 0], [6.95, 150], [12.9, 150], [13.12, 0], [15.05, 0], [15.4, 40]],
      shadesR: [[0, 0], [6.2, 0], [6.95, 28], [12.9, 28], [13.12, 0], [15.05, 0], [15.4, -50], [20.2, 0]],
      open: [[0, 1], [6.2, 1], [6.5, 1.2]],
      wide: [[0, 0], [6.2, 0], [6.5, 1], [6.9, 0.8], [7.1, 0], [12.95, 0.2], [13.2, 0], [15.1, 0.5], [15.5, 0]],
      browL: [[0, 0], [6.3, 0], [6.55, -16], [7.1, -16], [7.2, 0], [15.1, 0], [15.4, 4]],
      browR: [[0, 0], [6.3, 0], [6.55, -16], [7.1, -16], [7.2, 0], [15.1, 0], [15.4, 4]],
      hype: [[0, 0.55], [6.2, 0.55], [6.5, 0.1], [12.8, 0.1], [13.5, 1], [15.0, 1], [15.2, 0], [22, 0.0]],
      hsx: [[0, 1], [12.95, 1], [13.05, 0.92], [13.2, 1.08], [13.5, 1], [15.05, 1], [15.15, 1.1], [15.35, 0.95]],
      hsy: [[0, 1], [12.95, 1], [13.05, 1.12], [13.2, 0.94], [13.5, 1], [15.05, 1], [15.15, 0.9], [15.35, 1.05]],
      hr: [[0, 0], [13.0, -6], [13.7, 8], [14.4, -8], [15.0, 4], [15.3, 10], [15.6, 0]],
      hy: [[0, 0], [15.1, 0], [15.4, 16], [15.9, 14], [16.5, 0]],
      aRs: [[0, 7], [13.0, 7], [13.4, 150, "back"], [14.5, 150], [15.0, 110], [15.4, 20], [16, 7]],
      aRf: [[0, 0], [13.4, 25], [14.5, 25], [15.4, 0]],
      aLs: [[0, 7], [13.2, 7], [13.6, 95, "back"], [14.8, 95], [15.3, 10]],
      aLf: [[0, 0], [13.6, 30], [14.8, 30], [15.3, 0]],
      x: [[0, 0]],
    }));
    p.mouth = t > 6.4 && t < 7.1 ? "o" : (t > 15.1 && t < 16.2 ? "frown" : "smile"); p.talk = talkAt("hype", t, 5) * 1.0 + (t > 6.4 && t < 7.1 ? 0.7 : 0);
    p.y = Math.sin((t + IDLE.hype) * 2.4) * 6;
    p.hypeT = t; p.glow = 1 + (t > 13.1 && t < 15 ? 1 : 0);
    p.open *= blink(t, "hype");
    return p;
  }
  function actWallet(t) {
    const p = withBase({});
    Object.assign(p, track(t, {
      stress: [[0, 1], [3.4, 1], [3.5, 0.2], [7.2, 0.2], [7.4, 0], [9.2, 0], [9.3, 1], [10, 0.4], [15, 0], [18, 0]],
      sweat: [[0, 1], [3.4, 1], [4.0, 0.2], [6.9, 0], [9.2, 0], [9.4, 1], [10.1, 0], [24.4, 0], [24.7, 1], [25.4, 0]],
      shake: [[0, 2.5], [3.4, 2.5], [3.6, 0.3], [6.9, 0], [9.2, 0], [9.3, 3], [10, 0], [16.0, 0], [16.9, 3], [17.2, 0]],
      wide: [[0, 0.9], [3.4, 0.9], [3.8, 0.4], [6.7, 0.1], [7.0, 0], [9.2, 0], [9.3, 0.7], [10.1, 0], [24.4, 0.8], [25.0, 0.2], [25.4, 0]],
      open: [[0, 1], [6.9, 1], [7.05, 0.65], [7.3, 0.65], [9.2, 0.65], [9.35, 0.5], [10.1, 0.7], [15.7, 0.7], [16.9, 0.55], [17.5, 0.5], [24.5, 1], [25.4, 1], [25.9, 0.5]],
      tilt: [[0, -10], [3.5, -10], [6.9, 6], [9.2, 6], [9.35, -14], [10.1, 8], [15.7, 8], [16.6, 14], [17.5, 14], [24.4, -12], [25.2, 12]],
      browL: [[0, -6], [6.9, -6], [7.2, 4], [25.0, 4]],
      browR: [[0, -6], [6.9, -6], [7.2, 4], [25.0, 4]],
      lookX: [[0, 0.1], [3.4, 0.1], [3.8, 0], [6.9, 0], [7.0, 0], [9.3, 0.6], [10, 0], [16.3, 0], [16.9, 0.0], [17.2, 0.8], [17.6, 0]],
      lookY: [[0, -0.4], [3.4, -0.4], [4.5, 0.1], [7.0, 0], [15.9, 0], [16.2, 0.95], [16.9, 0.95], [17.05, -0.1], [24.45, 0], [24.6, 0.95], [25.0, 0.95], [25.15, -0.2]],
      flap: [[0, 0], [15.85, 0], [16.25, 1, "out"], [17.1, 1], [17.3, 0], [24.5, 0], [24.65, 1, "out"], [25.1, 1], [25.3, 0]],
      coin: [[0, 0], [16.0, 0], [16.25, 1], [17.2, 1], [17.3, 0], [24.6, 0], [24.7, 1], [25.2, 1], [25.3, 0]],
      rot: [[0, 0], [16.2, 0], [16.5, -5], [16.8, 5], [17.05, -4], [17.15, 0]],
      receipts: [[0, 0], [17.0, 0], [17.01, 1], [17.2, 1], [17.21, 0]],
      aRs: [[0, 7], [16.9, 7], [17.1, 140, "out"], [17.25, 70, "in"], [17.5, 7]],
      aRf: [[0, 0], [17.0, 0], [17.1, 60], [17.25, 20], [17.5, 0]],
      aLs: [[0, 60], [3.4, 60], [3.8, 25], [7.0, 7], [9.3, 50], [10.1, 7], [24.5, 40], [25.2, 7]],
      aLf: [[0, 120], [3.4, 120], [3.8, 40], [7.0, 0], [9.3, 70], [10.1, 0], [24.5, 60], [25.2, 0]],
      // he sinks behind the bench after throwing the receipt, then peeks up after the verdict
      y: [[0, 0], [17.55, 0], [17.62, -14], [18.05, 540, "in"], [20.5, 540], [20.95, 150, "back"], [21.5, 120], [21.8, 540, "in"], [22.1, 540], [22.4, 0, "io"]],
    }));
    p.mouth = t > 20.6 && t < 21.8 ? "smile" : (t < 3.5 ? "frown" : (talkAt("wallet", t, 7) > 0 ? "flat" : (t > 24.5 && t < 25.3 ? "o" : "flat")));
    p.talk = talkAt("wallet", t, 7) * 0.55 + (t > 24.5 && t < 25.3 ? 0.5 : 0);
    p.sweatT = t; p.shakeT = t;
    p.hy = Math.sin((t + IDLE.wallet) * 2.1) * 3;
    p.open *= blink(t, "wallet");
    return p;
  }
  const act = { sterling: actSterling, kernel: actKernel, hype: actHype, wallet: actWallet };

  /* ---------------- frame ---------------- */
  const orbText = (t) => {
    if (t < 3.4) return "?";
    return "";
  };
  const appOnEarly = (t) => t >= TL.act.app[0] && t < TL.act.app[1];
  function renderFrame(t, opts = {}) {
    const transparent = !!opts.overlayOnly;
    // ---- characters ----
    for (const id of Object.keys(act)) { const p = act[id](t); rigs[id].update(p); }
    // ---- lights ----
    const lamp = (id, on0, extra = 1) => {
      const flick = t < on0 + 0.4 ? (hash(Math.floor(t * 30) + id.length) > 0.35 ? 1 : 0.5) : 1;
      return clamp(flick * extra, 0, 1.2);
    };
    const speaking = (id) => TL.lines.some((l) => l.who === id && t >= l.t0 - 0.2 && t <= l.t1 + 0.2);
    const anySpeaker = TL.lines.some((l) => t >= l.t0 - 0.2 && t <= l.t1 + 0.2);
    for (const id of Object.keys(cone)) {
      let k = 0.72 + 0.05 * Math.sin(t * 2 + id.length);
      if (anySpeaker) k = speaking(id) ? 1.15 : 0.35;
      if (t > 18.1 && t < 19.9) k = id === "sterling" ? 1.2 : 0.3;
      set(cone[id], { opacity: clamp(k * lamp(id, 0), 0, 1.2) });
    }
    const pulse = 0.55 + 0.45 * Math.sin(t * 8);
    for (const id of Object.keys(strips)) set(strips[id], { opacity: speaking(id) ? 0.6 + 0.4 * pulse : 0.45 });
    // ---- orb ----
    const orbOn = t < 3.4 ? 1 : 0.0;
    set(orb, { opacity: t < 4.4 ? 1 : 0.0, transform: `translate(540 ${1550 + Math.sin(t * 2) * 8}) scale(${1 + 0.04 * Math.sin(t * 5)})` });
    rings.forEach((r, i) => set(r, { transform: `rotate(${t * (30 + i * 25) * (i % 2 ? -1 : 1)}) scale(1 ${1 + 0.1 * Math.sin(t * 3 + i)})` }));
    set(orbGlow, { opacity: 0.3 + 0.12 * Math.sin(t * 4) });
    // ---- haze + dust ----
    hazeBlobs.forEach((b, i) => set(b, { cx: 540 + Math.sin(t * 0.18 + i * 1.9) * 360, cy: 900 + i * 260 + Math.cos(t * 0.13 + i) * 40, opacity: 0.045 + 0.02 * Math.sin(t * 0.4 + i) }));
    motes.forEach((m, i) => {
      const sp = 8 + hash(i + 40) * 22;
      set(m, { cx: (hash(i) * 1500 - 210 + Math.sin(t * 0.4 + i) * 30), cy: ((hash(i + 9) * 2200 + t * sp) % 2200) - 100, opacity: 0.1 + 0.28 * hash(i + 3) });
    });

    // ---- camera ----
    const cam = cameraAt(t);
    // shake: opening hit, glitch, verdict slams
    const shakeAmp = 10 * decay(t, 0.0, 12) + 6 * decay(t, 5.45, 8) * (t < 6.2 ? 1 : 0) + 7 * decay(t, 12.12, 9) + 38 * decay(t, 19.9, 5.5) + 20 * decay(t, 25.9, 6.5) + 10 * decay(t, 20.0, 9);
    const sx = (hash(Math.floor(t * 45) + 1) - 0.5) * 2 * shakeAmp, sy = (hash(Math.floor(t * 45) + 77) - 0.5) * 2 * shakeAmp;
    // handheld breathing
    const hh = 3;
    const bx = Math.sin(t * 0.9) * hh, by = Math.cos(t * 1.1) * hh;
    // whip blur on fast cuts (camera cut frames within 0.09 s)
    const cutBlur = t > 0.05 && cam.cut < 0.09 ? (1 - cam.cut / 0.09) * 26 : 0;
    set(world, { transform: `translate(${540 + sx + bx} ${960 + sy + by}) rotate(${cam.r}) scale(${cam.s}) translate(${-cam.cx} ${-cam.cy})` });
    world.style.filter = cutBlur > 1 ? `blur(${cutBlur * 0.25}px)` : "none";

    // ---- overlays ----
    // hook text: present from the first frame, settles in 0.3 s, leaves at 3.0
    const hookA = t < 3.0 ? 1 : clamp(1 - (t - 3.0) / 0.3, 0, 1);
    set(hook, { opacity: hookA, transform: `translate(540 ${400}) scale(${1 + 0.12 * decay(t, 0, 9)}) translate(-540 -400)` });
    set(hookBar, { opacity: hookA });

    // accused card: slams in on the podium shot, then drops to a banner during the reactions
    const accIn = clamp((t - 3.55) / 0.22, 0, 1);
    const accBig = t >= 3.55 && t < 4.45;
    const glitchJ = t > 3.55 && t < 3.95 ? (hash(Math.floor(t * 40)) - 0.5) * 24 : 0;
    set(accused, { opacity: accBig ? ease.out(accIn) : 0, transform: `translate(${glitchJ} 0)` });
    set(banner, { opacity: t >= 4.45 && t < 7.2 ? clamp((t - 4.45) / 0.2, 0, 1) : 0 });

    // dialogue card
    let line = null;
    for (const l of TL.lines) if (t >= l.t0 && t <= l.t1 + 0.35) line = l;
    if (line) {
      const a = clamp((t - line.t0) / 0.15, 0, 1) * clamp((line.t1 + 0.35 - t) / 0.2, 0, 1);
      const col = TL.colors[line.who];
      const wrapped = wrap(line.text, 48, 880);
      const Y0 = 1190;
      cardLines.forEach((el, i) => { el.textContent = wrapped[i] || ""; set(el, { y: Y0 + 96 + i * 56, "font-size": 48 }); });
      const h = 70 + wrapped.length * 56 + 20;
      set(cardBg, { y: Y0, height: h, stroke: col });
      set(cardChip, { y: Y0 - 28, fill: col });
      set(cardName, { y: Y0 + 13 });
      set(cardRole, { y: Y0 + 8 });
      cardName.textContent = TL.names[line.who];
      cardRole.textContent = TL.roles[line.who];
      set(card, { opacity: a, transform: `translate(0 ${(1 - a) * 28})` });
    } else set(card, { opacity: 0 });

    // verdict: dim, score count, sub-scores, red wash, stamp
    const vOn = t >= 18.1 && t < 22.0;
    const countT = clamp((t - 18.35) / 1.0, 0, 1);
    const score = Math.round(ease.out(countT) * TL.real.overall);
    scoreNum.textContent = String(score);
    set(scoreG, { opacity: vOn ? clamp((t - 18.3) / 0.2, 0, 1) * clamp((19.2 - t) / 0.25, 0, 1) : 0 });
    subs.forEach((g, i) => set(g, { opacity: clamp((t - (18.9 + i * 0.12)) / 0.15, 0, 1) }));
    set(dim, { opacity: vOn && t < 19.88 ? 0.45 * clamp((t - 18.1) / 0.3, 0, 1) * (t < 19.1 ? 1 : clamp((19.5 - t) / 0.4, 0.35, 1)) : 0 });
    // stamp text slam (scale 3.4 -> 1 with overshoot) at 19.9, again (smaller, "STILL KILL IT") at 25.9
    const st1 = t - 19.9, st2 = t - 25.9;
    if (st1 >= 0 && t < 22.0) {
      const u = clamp(st1 / 0.14, 0, 1);
      set(stampG, { opacity: 1, transform: `translate(540 780) rotate(-8) scale(${lerp(3.6, 1, ease.out(u))})` });
      stampSub.textContent = "19 / 100";
    } else if (st2 >= 0 && t < 26.5) {
      const u = clamp(st2 / 0.14, 0, 1);
      set(stampG, { opacity: 1, transform: `translate(540 760) rotate(-6) scale(${lerp(2.6, 0.82, ease.out(u))})` });
      stampSub.textContent = "PROJECTED 41 / 100";
    } else set(stampG, { opacity: 0 });
    // red wash after the verdict, decaying; second slam repeats it softly
    const red = 0.5 * decay(t, 19.9, 1.1) + 0.28 * decay(t, 25.9, 1.4);
    set(redWash, { opacity: appOnEarly(t) ? 0 : clamp(red, 0, 0.7) });
    set(redGlow, { opacity: appOnEarly(t) ? 0 : clamp(0.38 * decay(t, 19.9, 7) + 0.2 * decay(t, 25.9, 8), 0, 0.5) });
    // shockwaves
    const sw = (t0, color) => { const u = clamp((t - t0) / 0.7, 0, 1); return u; };
    const u1 = clamp((t - 19.9) / 0.7, 0, 1);
    set(shock, { cx: 540, cy: 1000, r: 120 + u1 * 1300, opacity: t >= 19.9 && u1 < 1 ? 0.8 * (1 - u1) : 0, "stroke-width": 26 * (1 - u1) + 2 });
    const u2 = clamp((t - 25.9) / 0.6, 0, 1);
    set(shock2, { cx: 540, cy: 1000, r: 80 + u2 * 900, opacity: t >= 25.9 && u2 < 1 ? 0.6 * (1 - u2) : 0, "stroke-width": 14 * (1 - u2) + 2 });

    // white flashes: opening hit, whip into the app, impact frames
    const flash = (t >= 0.04 ? 0.35 * decay(t, 0.04, 14) : 0) + 0.9 * decay(t, 19.9, 12) * (t >= 19.9 ? 1 : 0) + 0.45 * decay(t, 25.9, 13) + 0.7 * decay(t, 27.0, 10) * (t >= 27 ? 1 : 0) + 0.6 * decay(t, 31.8, 12) * (t >= 31.8 ? 1 : 0) + 0.25 * decay(t, 12.12, 20) * (t >= 12.12 ? 1 : 0) + 0.2 * decay(t, 3.4, 16);
    set(flashW, { opacity: clamp(flash, 0, 1) });

    // twist: texts, fix card, score meter, points line
    set(twistG, { opacity: t >= 22.1 && t < 23.1 ? clamp((t - 22.1) / 0.12, 0, 1) * clamp((23.1 - t) / 0.2, 0, 1) : 0, transform: `translate(0 ${t >= 22.1 ? 0 : 20})` });
    const jig = t >= 22.1 && t < 22.5 ? (hash(Math.floor(t * 40)) - 0.5) * 18 : 0;
    set(twistA, { transform: `translate(${jig} 0)` });
    set(fixCard, { opacity: t >= 23.2 && t < 24.45 ? clamp((t - 23.2) / 0.2, 0, 1) * clamp((24.45 - t) / 0.12, 0, 1) : 0 });
    set(nwBanner, { opacity: t >= 24.5 && t < 25.4 ? clamp((t - 24.5) / 0.12, 0, 1) * clamp((25.4 - t) / 0.12, 0, 1) : 0, transform: t >= 24.5 && t < 24.7 ? `translate(0 ${-(1 - (t - 24.5) / 0.2) * 24})` : "" });
    const fsT = clamp((t - 23.4) / 1.6, 0, 1);
    fsB.textContent = String(Math.round(lerp(19, TL.real.fixProjected, ease.io(fsT))));
    set(fixScore, { opacity: t >= 23.3 && t < 24.45 ? clamp((t - 23.3) / 0.2, 0, 1) * clamp((24.45 - t) / 0.12, 0, 1) : 0 });
    set(pointsLine, { opacity: t >= 26.55 && t < 27.0 ? clamp((t - 26.55) / 0.1, 0, 1) : 0 });
    // hopeful warm shift during the twist
    set(vig, { opacity: appOnEarly(t) ? 0 : (t >= 22 && t < 25.8 ? 0.7 : 1) });

    // app overlays + end card
    const appOn = t >= TL.act.app[0] && t < TL.act.app[1];
    set(appG, { opacity: appOn ? clamp((t - TL.act.app[0] - 0.15) / 0.2, 0, 1) : 0 });
    const endOn = t >= TL.act.end[0];
    const eu = clamp((t - TL.act.end[0]) / 0.25, 0, 1);
    set(endG, { opacity: endOn ? 1 : 0, transform: `translate(540 960) scale(${1 + 0.018 * clamp(t - TL.act.end[0], 0, 4)}) translate(-540 -960)` });
    ["sterling", "kernel", "hype", "wallet"].forEach((id, i) => {
      const e = endEyes[id]; const a = clamp((t - (TL.act.end[0] + i * 0.06)) / 0.12, 0, 1);
      const bl = blink(t + i, id);
      set(e.g, { opacity: a });
      set(e.eL, { ry: 30 * bl }); set(e.eR, { ry: 30 * bl });
    });
    set(endA, { opacity: clamp((t - (TL.act.end[0] + 0.6)) / 0.1, 0, 1), transform: `translate(540 1120) scale(${lerp(1.5, 1, ease.out(clamp((t - (TL.act.end[0] + 0.6)) / 0.18, 0, 1)))}) translate(-540 -1120)` });
    set(endB, { opacity: clamp((t - (TL.act.end[0] + 1.35)) / 0.2, 0, 1) });
    set(brand, { opacity: clamp((t - (TL.act.end[0] + 1.8)) / 0.3, 0, 1) });

    // world visibility: during the app segment and end card the world is irrelevant
    set(root, { opacity: (appOn || endOn) ? 0 : 1 });
    // flying receipt (Wallet's throw) in screen-ish world space
    const rt = clamp((t - 17.12) / 0.55, 0, 1);
    set(flyingReceipt, { opacity: t >= 17.12 && t < 17.7 ? 1 : 0, transform: `translate(${lerp(960, 880 - 40, rt)} ${lerp(1180, 1260 - 380 * Math.sin(rt * Math.PI) , rt)}) rotate(${rt * 540}) scale(${lerp(0.5, 3.2, ease.in(rt))})` });
  }
  // Cover still: the wide courtroom with a headline, kept inside the safe zone (nothing essential above y 250 or below y 1470).
  function renderCover() {
    renderFrame(1.05);
    set(hook, { opacity: 0 });
    set(flashW, { opacity: 0 });
    const cur = world.getAttribute("transform");
    set(world, { transform: "translate(0 120) " + cur });
    world.style.filter = "none";
    const cv = E("g", {}, hud);
    E("rect", { x: 0, y: 150, width: W, height: 560, fill: "#000", opacity: 0 }, cv);
    outlineText(cv, "YOUR BUSINESS IDEA", 540, 330, 80, "#fff", { ls: 3 });
    outlineText(cv, "IS ON", 540, 446, 120, "#fff", { ls: 4 });
    outlineText(cv, "TRIAL.", 540, 610, 170, "#ff4d4d", { ls: 4 });
    const tag = E("g", { transform: "translate(540 1690)" }, cv);
    E("rect", { x: -300, y: -44, width: 600, height: 64, rx: 32, fill: "#ffc247" }, tag);
    text(tag, "4 AI JUDGES. 1 VERDICT.", { x: 0, y: 4, "font-size": 36, fill: "#05060a", "letter-spacing": 5 });
  }
  hud.appendChild(flashW);
  window.renderCover = renderCover;
  window.renderFrame = renderFrame;
  window.SCENE_READY = true;
})();
