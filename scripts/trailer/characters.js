/* eslint-disable @typescript-eslint/no-unused-vars -- animation sources keep a few scaffolding variables; behaviour is verified by the rendered output */
/* AI ROAST MY IDEA: the four judges as poseable SVG rigs.
 *
 * Shared design language (so they read as one cast):
 *   - same near-black outline (OUT) at the same weight, round joins
 *   - glossy dark "screen" faces with glowing features
 *   - one top-left key light: a white rim highlight on upper edges, a darker lower edge
 *   - each lit in a single signature colour
 *
 * Each character is built once (`build`) and posed per frame (`update(pose)`); every pose value is a number,
 * so scenes can tween them. Origin (0,0) is the seat: bottom centre of the visible figure.
 */
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const OUT = "#05060a";
  const W = 6; // outline weight

  const E = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const set = (e, attrs) => { for (const k in attrs) e.setAttribute(k, attrs[k]); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- shared defs (gradients) ---------- */
  function defs(svg) {
    const d = E("defs", {}, svg);
    const lg = (id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) => {
      const g = E("linearGradient", { id, x1, y1, x2, y2 }, d);
      stops.forEach(([o, c, a = 1]) => E("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g));
    };
    const rg = (id, stops, cx = 0.5, cy = 0.5, r = 0.5) => {
      const g = E("radialGradient", { id, cx, cy, r }, d);
      stops.forEach(([o, c, a = 1]) => E("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g));
    };
    // gold
    lg("gGold", [[0, "#fff1b0"], [0.18, "#ffd25a"], [0.55, "#d9961c"], [1, "#7a4a0a"]]);
    lg("gGoldDark", [[0, "#8a5b10"], [1, "#2d1c04"]]);
    lg("gSuit", [[0, "#23232b"], [0.6, "#101015"], [1, "#07070a"]]);
    // graphite
    lg("gGraph", [[0, "#5a6270"], [0.35, "#343a45"], [1, "#14171d"]]);
    lg("gGraphDark", [[0, "#272c35"], [1, "#0b0d11"]]);
    // violet hologram
    lg("gHolo", [[0, "#ff9be8", 0.95], [0.45, "#b657ff", 0.85], [1, "#3b1a7a", 0.75]]);
    lg("gHoloBody", [[0, "#d46bff", 0.85], [0.6, "#7b34e0", 0.7], [1, "#2a1166", 0.0]]);
    // wallet mint / leather
    lg("gLeather", [[0, "#3c4a44"], [0.5, "#222c28"], [1, "#0e1412"]]);
    lg("gMint", [[0, "#d7ffe9"], [0.4, "#7ff0b6"], [1, "#2a9468"]]);
    // glossy screens
    lg("gScreen", [[0, "#0d1118"], [1, "#04060a"]]);
    lg("gScreenBlue", [[0, "#1d5de0"], [1, "#0b2d8a"]]);
    lg("gShade", [[0, "#ff5fd2"], [0.5, "#9a2bff"], [1, "#2a0a66"]], 0, 0, 1, 1);
    lg("gGloss", [[0, "#fff", 0.55], [1, "#fff", 0]]);
    rg("gGlowAmber", [[0, "#ffc247", 0.9], [1, "#ffc247", 0]]);
    rg("gGlowCyan", [[0, "#33e7ff", 0.9], [1, "#33e7ff", 0]]);
    rg("gGlowPink", [[0, "#ff4fd8", 0.9], [1, "#ff4fd8", 0]]);
    rg("gGlowMint", [[0, "#6dffb0", 0.9], [1, "#6dffb0", 0]]);
    rg("gGlowRed", [[0, "#ff2d3d", 0.95], [1, "#ff2d3d", 0]]);
    rg("gGlowWhite", [[0, "#ffffff", 0.9], [1, "#ffffff", 0]]);
    return d;
  }

  /* ---------- face kit ---------- */
  // A mouth between two curves. shape: smile | frown | flat | smirk | o | zig
  function mouthPath(shape, open, w) {
    const o = open * 38;
    switch (shape) {
      case "smile": return `M ${-w} -2 Q 0 ${26 + o * 0.6} ${w} -2 Q 0 ${12 + o * 1.1 + 12} ${-w} -2 Z`;
      case "frown": return `M ${-w} 8 Q 0 ${-22 - o * 0.2} ${w} 8 Q 0 ${-8 + o} ${-w} 8 Z`;
      case "smirk": return `M ${-w} 6 Q ${-w * 0.2} 14 ${w * 0.5} 2 L ${w} -10 Q ${w * 0.2} 4 ${-w * 0.4} ${2 + o * 0.5} Z`;
      case "o": return `M ${-w * 0.45} 0 Q ${-w * 0.45} ${-18 - o * 0.4} 0 ${-18 - o * 0.4} Q ${w * 0.45} ${-18 - o * 0.4} ${w * 0.45} 0 Q ${w * 0.45} ${18 + o * 0.6} 0 ${18 + o * 0.6} Q ${-w * 0.45} ${18 + o * 0.6} ${-w * 0.45} 0 Z`;
      case "zig": return `M ${-w} 0 L ${-w * 0.66} -10 L ${-w * 0.33} 10 L 0 -10 L ${w * 0.33} 10 L ${w * 0.66} -10 L ${w} 0 L ${w * 0.66} 4 L ${w * 0.33} 22 L 0 4 L ${-w * 0.33} 22 L ${-w * 0.66} 4 Z`;
      default: return `M ${-w} 0 Q 0 ${4 + o * 0.2} ${w} 0 Q 0 ${4 + o * 0.9 + 2} ${-w} 0 Z`; // flat (opens when talking)
    }
  }

  /* ---------- base pose ---------- */
  const BASE = {
    x: 0, y: 0, rot: 0, sx: 1, sy: 1,
    hx: 0, hy: 0, hr: 0, hsx: 1, hsy: 1,
    open: 1, openL: null, openR: null, lookX: 0, lookY: 0, wide: 0,
    browL: 0, browR: 0, tilt: 0,
    mouth: "flat", talk: 0,
    aLs: 7, aLf: 0, aRs: 7, aRf: 0,
    glow: 1, alpha: 1,
    // character specific
    stamp: 0, calc: 0, monocle: 0, glasses: 0,
    fan: 0, mode: 0, heat: 0, steam: 0, spark: 0, led: 1,
    shades: 1, shadesX: 0, shadesY: 0, shadesR: 0, hype: 0, pose: 0,
    flap: 0, receipts: 0, sweat: 0, shake: 0, coin: 0, stress: 0,
  };
  const withBase = (p) => Object.assign({}, BASE, p);

  /* ---------- helpers for limbs ---------- */
  // A two-segment arm hanging from (0,0) in local space; angles in degrees (0 = straight down).
  function limb(parent, len1, len2, color, handR, handColor) {
    const g = E("g", {}, parent);
    const up = E("g", {}, g);
    E("rect", { x: -8, y: -4, width: 16, height: len1 + 8, rx: 8, fill: color, stroke: OUT, "stroke-width": W * 0.8 }, up);
    const fore = E("g", { transform: `translate(0 ${len1})` }, up);
    E("rect", { x: -7, y: -4, width: 14, height: len2 + 8, rx: 7, fill: color, stroke: OUT, "stroke-width": W * 0.8 }, fore);
    const hand = E("g", { transform: `translate(0 ${len2})` }, fore);
    E("circle", { r: handR, fill: handColor || color, stroke: OUT, "stroke-width": W * 0.8 }, hand);
    E("ellipse", { cx: -handR * 0.3, cy: -handR * 0.35, rx: handR * 0.4, ry: handR * 0.25, fill: "#fff", opacity: 0.35 }, hand);
    return { g, up, fore, hand };
  }
  const poseLimb = (l, s, f) => {
    set(l.up, { transform: `rotate(${s})` });
    set(l.fore, { transform: `translate(0 ${l.fore.__len}) rotate(${f})` });
  };

  /* =========================================================
   * STERLING — the ruthless investor (gold, amber, black)
   * ========================================================= */
  function Sterling(root) {
    const c = "#ffc247";
    const g = E("g", {}, root);
    const throne = E("g", {}, g);
    // throne back: tall arched panel with gold trim
    E("path", { d: "M -190 0 L -190 -430 Q -190 -560 0 -600 Q 190 -560 190 -430 L 190 0 Z", fill: "url(#gSuit)", stroke: OUT, "stroke-width": W }, throne);
    E("path", { d: "M -164 -20 L -164 -425 Q -164 -532 0 -566 Q 164 -532 164 -425 L 164 -20", fill: "none", stroke: "url(#gGold)", "stroke-width": 7 }, throne);
    E("circle", { cx: 0, cy: -520, r: 20, fill: "url(#gGold)", stroke: OUT, "stroke-width": 4 }, throne);
    E("path", { d: "M -12 -520 L 0 -534 L 12 -520 L 0 -506 Z", fill: "#7a4a0a" }, throne);

    const body = E("g", {}, g);
    const arms = E("g", {}, body);
    // torso (suit)
    const torso = E("g", {}, body);
    E("path", { d: "M -140 0 L -122 -120 Q -118 -176 -60 -190 L 60 -190 Q 118 -176 122 -120 L 140 0 Z", fill: "url(#gSuit)", stroke: OUT, "stroke-width": W }, torso);
    E("path", { d: "M -50 -190 L 0 -80 L 50 -190 Z", fill: "#f2eadb", stroke: OUT, "stroke-width": 4 }, torso); // shirt
    E("path", { d: "M -50 -190 L -88 -112 L -22 -86 L 0 -82 Z", fill: "#15151b", stroke: "url(#gGold)", "stroke-width": 3 }, torso); // lapels
    E("path", { d: "M 50 -190 L 88 -112 L 22 -86 L 0 -82 Z", fill: "#15151b", stroke: "url(#gGold)", "stroke-width": 3 }, torso);
    E("path", { d: "M -9 -184 L 9 -184 L 14 -118 L 0 -96 L -14 -118 Z", fill: "url(#gGold)", stroke: OUT, "stroke-width": 3 }, torso); // tie
    E("rect", { x: 52, y: -128, width: 26, height: 14, rx: 2, fill: "#fff6d8", stroke: OUT, "stroke-width": 2, transform: "rotate(-12 65 -121)" }, torso); // pocket square
    E("circle", { cx: -64, cy: -118, r: 7, fill: "url(#gGold)", stroke: OUT, "stroke-width": 2 }, torso); // pin
    E("path", { d: "M -118 -150 Q -90 -186 -60 -190 L 60 -190 Q 90 -186 118 -150", fill: "none", stroke: "#fff", "stroke-opacity": 0.22, "stroke-width": 4 }, torso); // rim

    // arms (shoulder pivots)
    const mkArm = (side) => {
      const sh = E("g", { transform: `translate(${side * 112} -150)` }, arms);
      const l = limb(sh, 78, 70, "url(#gSuit)", 21, "url(#gGold)");
      l.fore.__len = 78;
      E("rect", { x: -11, y: 52, width: 22, height: 12, rx: 4, fill: "url(#gGold)", stroke: OUT, "stroke-width": 3 }, l.fore);
      return { sh, l };
    };
    const aL = mkArm(-1);
    const aR = mkArm(1);

    // stamp (held in right hand): knob at the hand, base beyond it. update() counter-rotates it so the base always faces down.
    const stamp = E("g", {}, aR.l.hand);
    E("rect", { x: -8, y: -4, width: 16, height: 44, rx: 6, fill: "#16161c", stroke: OUT, "stroke-width": 4 }, stamp);
    E("circle", { cx: 0, cy: -8, r: 17, fill: "url(#gGold)", stroke: OUT, "stroke-width": 4 }, stamp);
    E("rect", { x: -48, y: 36, width: 96, height: 22, rx: 7, fill: "url(#gGold)", stroke: OUT, "stroke-width": 4 }, stamp);
    E("rect", { x: -42, y: 58, width: 84, height: 15, rx: 4, fill: "#b0170f", stroke: OUT, "stroke-width": 3 }, stamp);

    // holographic calculator (left hand)
    const calc = E("g", {}, aL.l.hand);
    E("rect", { x: -64, y: -120, width: 128, height: 92, rx: 10, fill: "#ffc247", "fill-opacity": 0.14, stroke: "#ffc247", "stroke-width": 3 }, calc);
    const calcTxt = E("text", { x: 0, y: -62, "text-anchor": "middle", "font-family": "JetBrains Mono, monospace", "font-size": 34, "font-weight": 700, fill: "#ffd77a" }, calc);
    calcTxt.textContent = "£0.00";
    E("rect", { x: -54, y: -48, width: 108, height: 6, rx: 3, fill: "#ffc247", opacity: 0.5 }, calc);

    // head
    const head = E("g", { transform: "translate(0 -190)" }, body);
    body.insertBefore(arms, head);
    const hd = E("g", {}, head);
    E("rect", { x: -28, y: -6, width: 56, height: 30, rx: 8, fill: "url(#gGoldDark)", stroke: OUT, "stroke-width": 5 }, hd); // neck
    E("path", { d: "M -118 -40 Q -118 -168 -70 -190 Q 0 -212 70 -190 Q 118 -168 118 -40 L 98 6 Q 70 26 0 26 Q -70 26 -98 6 Z", fill: "url(#gGold)", stroke: OUT, "stroke-width": W }, hd);
    E("path", { d: "M -98 -150 Q -60 -194 0 -196 Q 60 -194 98 -150", fill: "none", stroke: "#fff", "stroke-opacity": 0.55, "stroke-width": 6, "stroke-linecap": "round" }, hd);
    E("rect", { x: -92, y: -150, width: 184, height: 118, rx: 34, fill: "url(#gScreen)", stroke: OUT, "stroke-width": 5 }, hd); // face screen
    E("ellipse", { cx: -30, cy: -128, rx: 62, ry: 14, fill: "url(#gGloss)", opacity: 0.55 }, hd);
    const face = E("g", { transform: "translate(0 -92)" }, hd);
    const eyeL = E("path", {}, face), eyeR = E("path", {}, face);
    const pupL = E("circle", { r: 7, fill: "#1a0f00" }, face), pupR = E("circle", { r: 7, fill: "#1a0f00" }, face);
    const browL = E("rect", { x: -66, y: -44, width: 52, height: 11, rx: 4, fill: "url(#gGold)", stroke: OUT, "stroke-width": 3 }, face);
    const browR = E("rect", { x: 14, y: -44, width: 52, height: 11, rx: 4, fill: "url(#gGold)", stroke: OUT, "stroke-width": 3 }, face);
    const mouth = E("path", { fill: c, stroke: OUT, "stroke-width": 3, transform: "translate(0 34)" }, face);
    // monocle on right eye (viewer's right) with chain
    const mono = E("g", { transform: "translate(34 -6)" }, face);
    E("circle", { r: 31, fill: "#ffc247", "fill-opacity": 0.1, stroke: "url(#gGold)", "stroke-width": 6 }, mono);
    E("path", { d: "M 22 22 Q 40 70 12 100", fill: "none", stroke: "url(#gGold)", "stroke-width": 3 }, mono);
    // glasses (alt prop for the adjust gag)
    const glasses = E("g", { opacity: 0 }, face);
    E("rect", { x: -70, y: -26, width: 60, height: 40, rx: 12, fill: "none", stroke: "#e8d9a8", "stroke-width": 4 }, glasses);
    E("rect", { x: 10, y: -26, width: 60, height: 40, rx: 12, fill: "none", stroke: "#e8d9a8", "stroke-width": 4 }, glasses);
    E("path", { d: "M -10 -10 L 10 -10", stroke: "#e8d9a8", "stroke-width": 4 }, glasses);
    // sparkle/coin glints
    const glint = E("path", { d: "M 0 -20 L 5 -5 L 20 0 L 5 5 L 0 20 L -5 5 L -20 0 L -5 -5 Z", fill: "#fff", opacity: 0, transform: "translate(-72 -138)" }, hd);

    const tmp = { calcTxt };
    function update(p) {
      set(g, { transform: `translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${p.sx} ${p.sy})`, opacity: p.alpha });
      set(head, { transform: `translate(${p.hx} ${-190 + p.hy}) rotate(${p.hr}) scale(${p.hsx} ${p.hsy})` });
      const oL = p.openL ?? p.open, oR = p.openR ?? p.open;
      const eyePath = (side, o) => {
        const w = 40 + p.wide * 14, h = Math.max(1.5, (14 + p.wide * 22) * o);
        const cx = side * 38;
        // angular slit: flat top, pointed outer corner
        return `M ${cx - w / 2} ${-h * 0.2} L ${cx + side * w * 0.45} ${-h} L ${cx + w / 2} ${-h * 0.2} L ${cx + side * w * 0.2} ${h} Z`.replace(/NaN/g, "0");
      };
      set(eyeL, { d: eyePath(-1, oL), fill: c });
      set(eyeR, { d: eyePath(1, oR), fill: c });
      set(pupL, { cx: -38 + p.lookX * 9, cy: p.lookY * 5, r: 6 * Math.min(1, 0.25 + oL), opacity: oL > 0.15 ? 1 : 0 });
      set(pupR, { cx: 38 + p.lookX * 9, cy: p.lookY * 5, r: 6 * Math.min(1, 0.25 + oR), opacity: oR > 0.15 ? 1 : 0 });
      set(browL, { transform: `translate(0 ${p.browL}) rotate(${12 - p.tilt} -40 -38)` });
      set(browR, { transform: `translate(0 ${p.browR}) rotate(${-12 + p.tilt} 40 -38)` });
      set(mouth, { d: mouthPath(p.mouth, Math.max(p.talk, 0), 34), fill: p.mouth === "flat" && p.talk < 0.05 ? "none" : c });
      set(mouth, { stroke: p.mouth === "flat" && p.talk < 0.05 ? c : OUT, "stroke-width": p.mouth === "flat" && p.talk < 0.05 ? 5 : 3 });
      set(mono, { opacity: p.monocle, transform: `translate(34 ${-6}) rotate(${p.monocle ? 0 : 0})` });
      set(glasses, { opacity: p.glasses });
      set(glint, { opacity: clamp(p.glow - 1, 0, 1), transform: `translate(-72 -138) scale(${0.6 + (p.glow - 1)})` });
      set(aL.sh, { transform: `translate(-112 -150) rotate(${p.aLs})` });
      set(aL.l.up, { transform: "" }); set(aL.l.fore, { transform: `translate(0 78) rotate(${p.aLf})` });
      set(aR.sh, { transform: `translate(112 -150) rotate(${-p.aRs})` });
      set(aR.l.fore, { transform: `translate(0 78) rotate(${-p.aRf})` });
      set(stamp, { opacity: p.stamp > 0 ? 1 : 0, transform: `rotate(${p.aRs + p.aRf})` });
      set(calc, { opacity: p.calc, transform: `rotate(${-(p.aLs + p.aLf)})` });
    }
    return { g, update, parts: { tmp, calcTxt, stamp, aR, aL, head }, anchors: { head: [0, -330], stampHand: [112, -150] } };
  }

  /* =========================================================
   * KERNEL — the overworked engineer (electric cyan, graphite)
   * ========================================================= */
  function Kernel(root) {
    const c = "#33e7ff";
    const g = E("g", {}, root);
    const cables = E("g", {}, g);
    const body = E("g", {}, g);
    // tangled cables hanging behind/around
    const cableA = E("path", { fill: "none", stroke: "#e8f6ff", "stroke-width": 7, "stroke-linecap": "round", opacity: 0.9 }, cables);
    const cableB = E("path", { fill: "none", stroke: c, "stroke-width": 6, "stroke-linecap": "round" }, cables);
    const cableC = E("path", { fill: "none", stroke: "#ff9a3d", "stroke-width": 5, "stroke-linecap": "round" }, cables);
    const arms = E("g", {}, body);
    // chassis
    E("rect", { x: -108, y: -142, width: 216, height: 142, rx: 20, fill: "url(#gGraph)", stroke: OUT, "stroke-width": W }, body);
    E("rect", { x: -88, y: -122, width: 90, height: 56, rx: 8, fill: "#0b0d11", stroke: OUT, "stroke-width": 4 }, body);
    for (let i = 0; i < 5; i++) E("rect", { x: -80 + i * 16, y: -112, width: 9, height: 36, rx: 3, fill: i % 2 ? c : "#1b2833", opacity: 0.9 }, body);
    E("rect", { x: 20, y: -122, width: 70, height: 20, rx: 5, fill: "#1b2028", stroke: OUT, "stroke-width": 3 }, body);
    E("rect", { x: 20, y: -92, width: 70, height: 20, rx: 5, fill: "#1b2028", stroke: OUT, "stroke-width": 3 }, body);
    const led1 = E("circle", { cx: 32, cy: -112, r: 5, fill: "#ff9a3d" }, body);
    const led2 = E("circle", { cx: 32, cy: -82, r: 5, fill: "#3dff8a" }, body);
    E("path", { d: "M -100 -134 Q -40 -146 100 -134", fill: "none", stroke: "#fff", "stroke-opacity": 0.22, "stroke-width": 4 }, body);
    // sticker + dent + tape (battered)
    E("rect", { x: -40, y: -50, width: 46, height: 24, rx: 4, fill: "#ffd23d", stroke: OUT, "stroke-width": 3, transform: "rotate(-6 -17 -38)" }, body);
    E("path", { d: "M -30 -42 L -8 -42 M -30 -36 L -14 -36", stroke: OUT, "stroke-width": 3 }, body);
    E("path", { d: "M 60 -30 L 84 -12 M 66 -34 L 90 -16", stroke: "#0b0d11", "stroke-width": 3 }, body);

    const mkArm = (side) => {
      const sh = E("g", { transform: `translate(${side * 104} -100)` }, arms);
      const l = limb(sh, 56, 50, "url(#gGraph)", 15, "#e8f6ff");
      l.fore.__len = 56;
      return { sh, l };
    };
    const aL = mkArm(-1), aR = mkArm(1);

    // head: CRT
    const head = E("g", { transform: "translate(0 -142)" }, body);
    body.insertBefore(arms, head);
    const hd = E("g", {}, head);
    E("rect", { x: -26, y: -6, width: 52, height: 22, rx: 6, fill: "url(#gGraphDark)", stroke: OUT, "stroke-width": 5 }, hd);
    E("path", { d: "M -142 -150 Q -142 -196 -96 -196 L 96 -196 Q 142 -196 142 -150 L 142 -30 Q 142 6 100 6 L -100 6 Q -142 6 -142 -30 Z", fill: "url(#gGraph)", stroke: OUT, "stroke-width": W }, hd);
    E("path", { d: "M -128 -168 Q -124 -186 -92 -186 L 92 -186 Q 124 -186 128 -168", fill: "none", stroke: "#fff", "stroke-opacity": 0.4, "stroke-width": 5, "stroke-linecap": "round" }, hd);
    // screen
    const screen = E("g", {}, hd);
    const scr = E("rect", { x: -112, y: -170, width: 224, height: 150, rx: 22, fill: "url(#gScreen)", stroke: OUT, "stroke-width": 5 }, screen);
    const bsod = E("rect", { x: -112, y: -170, width: 224, height: 150, rx: 22, fill: "url(#gScreenBlue)", opacity: 0, stroke: OUT, "stroke-width": 5 }, screen);
    const heatTint = E("rect", { x: -112, y: -170, width: 224, height: 150, rx: 22, fill: "#ff2d1f", opacity: 0 }, screen);
    const face = E("g", { transform: "translate(0 -96)" }, screen);
    const eyeL = E("rect", { rx: 4, fill: c }, face), eyeR = E("rect", { rx: 4, fill: c }, face);
    const xL = E("path", { d: "M -66 -22 L -26 18 M -26 -22 L -66 18", stroke: "#ff5a4a", "stroke-width": 9, "stroke-linecap": "round", opacity: 0 }, face);
    const xR = E("path", { d: "M 26 -22 L 66 18 M 66 -22 L 26 18", stroke: "#ff5a4a", "stroke-width": 9, "stroke-linecap": "round", opacity: 0 }, face);
    const browL = E("rect", { x: -70, y: -50, width: 48, height: 9, rx: 3, fill: c }, face);
    const browR = E("rect", { x: 22, y: -50, width: 48, height: 9, rx: 3, fill: c }, face);
    const mouth = E("path", { fill: c, transform: "translate(0 40)" }, face);
    const errTxt = E("text", { x: 0, y: -4, "text-anchor": "middle", "font-family": "JetBrains Mono, monospace", "font-size": 54, "font-weight": 800, fill: "#ff5a4a", opacity: 0 }, screen);
    errTxt.textContent = "ERR";
    const bsodFace = E("text", { x: -70, y: -92, "font-family": "JetBrains Mono, monospace", "font-size": 64, "font-weight": 800, fill: "#fff", opacity: 0 }, screen);
    bsodFace.textContent = ":(";
    const bsodTxt = E("text", { x: -70, y: -50, "font-family": "JetBrains Mono, monospace", "font-size": 15, "font-weight": 700, fill: "#fff", opacity: 0 }, screen);
    bsodTxt.textContent = "FATAL: BLOCKCHAIN";
    const bsodTxt2 = E("text", { x: -70, y: -30, "font-family": "JetBrains Mono, monospace", "font-size": 13, fill: "#dbe8ff", opacity: 0 }, screen);
    bsodTxt2.textContent = "rebooting to insult you...";
    // scanlines + gloss
    const scan = E("g", { opacity: 0.18 }, screen);
    for (let i = 0; i < 15; i++) E("rect", { x: -112, y: -170 + i * 10, width: 224, height: 2.5, fill: "#000" }, scan);
    E("path", { d: "M -100 -160 L -20 -160 L -70 -100 L -100 -100 Z", fill: "url(#gGloss)", opacity: 0.35 }, screen);
    // fan + vent on top
    const fanBase = E("g", { transform: "translate(70 -200)" }, hd);
    E("rect", { x: -34, y: 0, width: 68, height: 12, rx: 4, fill: "#0b0d11", stroke: OUT, "stroke-width": 4 }, fanBase);
    E("circle", { cx: 0, cy: -18, r: 30, fill: "#0b0d11", stroke: OUT, "stroke-width": 5 }, fanBase);
    const fan = E("g", { transform: "translate(0 -18)" }, fanBase);
    for (let i = 0; i < 4; i++) E("path", { d: "M 0 0 Q 10 -22 0 -26 Q -10 -22 0 0", fill: "#9fb4c6", stroke: OUT, "stroke-width": 2, transform: `rotate(${i * 90})` }, fan);
    E("circle", { r: 5, fill: "#ff9a3d" }, fan);
    // warning light (antenna)
    const warn = E("g", { transform: "translate(-78 -200)" }, hd);
    E("rect", { x: -4, y: -8, width: 8, height: 14, fill: "#0b0d11" }, warn);
    const warnLamp = E("circle", { cy: -14, r: 12, fill: "#ff9a3d", stroke: OUT, "stroke-width": 4 }, warn);
    const warnGlow = E("circle", { cy: -14, r: 40, fill: "url(#gGlowRed)", opacity: 0 }, warn);
    // temperature gauge (side)
    const gauge = E("g", { transform: "translate(128 -70)" }, hd);
    E("circle", { r: 24, fill: "#0b0d11", stroke: OUT, "stroke-width": 5 }, gauge);
    E("path", { d: "M -17 10 A 20 20 0 1 1 17 10", fill: "none", stroke: "#2a3340", "stroke-width": 7, "stroke-linecap": "round" }, gauge);
    const gaugeArc = E("path", { fill: "none", stroke: c, "stroke-width": 7, "stroke-linecap": "round" }, gauge);
    const needle = E("path", { d: "M 0 0 L 0 -16", stroke: "#fff", "stroke-width": 3, "stroke-linecap": "round" }, gauge);
    // steam + sparks
    const fx = E("g", {}, head);
    const steam = [0, 1, 2, 3].map((i) => E("circle", { r: 14, fill: "#dff4ff", opacity: 0 }, fx));
    const sparks = [0, 1, 2, 3, 4, 5].map((i) => E("path", { d: "M 0 -9 L 3 -2 L 10 0 L 3 2 L 0 9 L -3 2 L -10 0 L -3 -2 Z", fill: "#ffd23d", opacity: 0 }, fx));

    function update(p) {
      set(g, { transform: `translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${p.sx} ${p.sy})`, opacity: p.alpha });
      set(head, { transform: `translate(${p.hx} ${-142 + p.hy}) rotate(${p.hr}) scale(${p.hsx} ${p.hsy})` });
      const m = p.mode; // 0 normal, 1 error, 2 bsod
      const oL = (p.openL ?? p.open), oR = (p.openR ?? p.open);
      const ew = 40 + p.wide * 10, eh = (46 + p.wide * 20);
      set(eyeL, { x: -66 + p.lookX * 8, y: -eh * oL / 2 + p.lookY * 5, width: ew, height: Math.max(3, eh * oL), opacity: m === 0 ? 1 : 0, fill: p.heat > 0.5 ? "#ffb347" : c });
      set(eyeR, { x: 26 + p.lookX * 8, y: -eh * oR / 2 + p.lookY * 5, width: ew, height: Math.max(3, eh * oR), opacity: m === 0 ? 1 : 0, fill: p.heat > 0.5 ? "#ffb347" : c });
      set(xL, { opacity: m === 1 ? 1 : 0 }); set(xR, { opacity: m === 1 ? 1 : 0 });
      set(browL, { transform: `translate(0 ${p.browL}) rotate(${p.tilt} -46 -45)`, opacity: m === 0 ? 1 : 0 });
      set(browR, { transform: `translate(0 ${p.browR}) rotate(${-p.tilt} 46 -45)`, opacity: m === 0 ? 1 : 0 });
      set(mouth, { d: mouthPath(p.mouth === "flat" ? "flat" : p.mouth, p.talk, 30), opacity: m === 0 ? 1 : 0, fill: p.mouth === "flat" && p.talk < 0.05 ? "none" : c, stroke: p.mouth === "flat" && p.talk < 0.05 ? c : "none", "stroke-width": 6 });
      set(errTxt, { opacity: m === 1 ? 1 : 0 });
      set(bsod, { opacity: m === 2 ? 1 : 0 });
      [bsodFace, bsodTxt, bsodTxt2].forEach((e) => set(e, { opacity: m === 2 ? 1 : 0 }));
      set(heatTint, { opacity: clamp(p.heat, 0, 1) * 0.42 });
      set(scr, { stroke: OUT });
      fan.__rot = (fan.__rot || 0) + p.fan; // accumulated by the scene via explicit angle (see pose.fanAngle)
      set(fan, { transform: `translate(0 -18) rotate(${p.fanAngle || 0})` });
      const blink = p.led > 0.5 ? 1 : 0.2;
      set(led1, { opacity: blink }); set(led2, { opacity: 1 - blink * 0.5 + 0.2 });
      set(warnLamp, { fill: p.heat > 0.2 ? "#ff2d3d" : "#ff9a3d" });
      set(warnGlow, { opacity: clamp(p.heat, 0, 1) * (0.5 + 0.5 * blink) });
      const hot = clamp(p.heat, 0, 1);
      const a0 = Math.PI * 0.75, a1 = lerp(a0, Math.PI * 2.25, hot);
      const arc = (a) => [Math.cos(a) * 17, Math.sin(a) * 17];
      const [x0, y0] = arc(a0), [x1, y1] = arc(a1);
      set(gaugeArc, { d: `M ${x0} ${y0} A 17 17 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`, stroke: hot > 0.55 ? "#ff3b2a" : c });
      set(needle, { transform: `rotate(${lerp(-120, 120, hot)})` });
      // cables sway
      const sw = p.shake;
      set(cableA, { d: `M -60 -20 Q -150 ${10 + sw} -170 -90 T -120 -170`, });
      set(cableB, { d: `M -30 -10 Q -190 ${40 - sw} -150 -120 T -86 -150` });
      set(cableC, { d: `M 80 -10 Q 190 ${20 + sw} 170 -90 T 126 -176` });
      set(aL.sh, { transform: `translate(-104 -100) rotate(${p.aLs})` });
      set(aL.l.fore, { transform: `translate(0 56) rotate(${p.aLf})` });
      set(aR.sh, { transform: `translate(104 -100) rotate(${-p.aRs})` });
      set(aR.l.fore, { transform: `translate(0 56) rotate(${-p.aRf})` });
      // steam & sparks
      steam.forEach((s, i) => {
        const k = clamp(p.steam, 0, 1);
        const ph = (p.steamT || 0) * 1.4 + i * 0.27;
        const f = ph - Math.floor(ph);
        set(s, { cx: lerp(-30, 10, i / 3) + Math.sin(ph * 6) * 12 - 40, cy: -220 - f * 90, r: 10 + f * 22, opacity: k * (1 - f) * 0.55 });
      });
      sparks.forEach((s, i) => {
        const k = clamp(p.spark, 0, 1);
        const ph = (p.sparkT || 0) * 2.2 + i * 0.37;
        const f = ph - Math.floor(ph);
        const ang = i * 1.05 + 0.5;
        set(s, { transform: `translate(${Math.cos(ang) * (30 + f * 120) + 40} ${-190 + Math.sin(ang) * (30 + f * 90) - f * 40}) scale(${0.6 + (1 - f)})`, opacity: k * (1 - f) });
      });
    }
    return { g, update, anchors: { head: [0, -260] } };
  }

  /* =========================================================
   * HYPE — the chaotic marketing genius (neon pink, magenta, violet)
   * ========================================================= */
  function Hype(root) {
    const c = "#ff4fd8";
    const g = E("g", {}, root);
    const glowBack = E("ellipse", { cx: 0, cy: -150, rx: 220, ry: 280, fill: "url(#gGlowPink)", opacity: 0.35 }, g);
    const body = E("g", {}, g);
    const ghostA = E("g", { opacity: 0.0, transform: "translate(-7 0)" }, g); // chromatic ghost
    const arms = E("g", {}, body);
    // hologram projector disc
    const disc = E("g", {}, body);
    E("ellipse", { cx: 0, cy: 6, rx: 120, ry: 20, fill: "#1b0a3d", stroke: OUT, "stroke-width": 5 }, disc);
    E("ellipse", { cx: 0, cy: 2, rx: 98, ry: 13, fill: "none", stroke: c, "stroke-width": 4, opacity: 0.9 }, disc);
    // torso: tapered hologram jacket fading out
    const torso = E("g", {}, body);
    E("path", { d: "M -118 0 L -104 -128 Q -96 -200 -50 -214 L 50 -214 Q 96 -200 104 -128 L 118 0 Z", fill: "url(#gHoloBody)", stroke: c, "stroke-width": 4 }, torso);
    E("path", { d: "M -44 -214 L -86 -128 L -30 -100 Z", fill: "#c96bff", opacity: 0.8, stroke: c, "stroke-width": 3 }, torso); // big lapels
    E("path", { d: "M 44 -214 L 86 -128 L 30 -100 Z", fill: "#c96bff", opacity: 0.8, stroke: c, "stroke-width": 3 }, torso);
    E("path", { d: "M -30 -214 L 0 -120 L 30 -214 Z", fill: "#fff", opacity: 0.85, stroke: OUT, "stroke-width": 3 }, torso);
    E("circle", { cx: 0, cy: -130, r: 9, fill: "#ffe66d", stroke: OUT, "stroke-width": 3 }, torso); // chunky medallion
    E("path", { d: "M 0 -140 L 0 -214", stroke: "#ffe66d", "stroke-width": 3, opacity: 0.7 }, torso);
    for (let i = 0; i < 9; i++) E("rect", { x: -108, y: -200 + i * 22, width: 216, height: 2, fill: "#fff", opacity: 0.12 }, torso); // scanlines
    // sparkly sequin dots
    [[-70, -150], [-54, -90], [66, -160], [78, -100], [-86, -60], [90, -40]].forEach(([x, y]) => E("circle", { cx: x, cy: y, r: 3.5, fill: "#fff", opacity: 0.8 }, torso));
    E("path", { d: "M -96 -176 Q -70 -206 -44 -214", fill: "none", stroke: "#fff", "stroke-opacity": 0.5, "stroke-width": 4 }, torso);

    const mkArm = (side) => {
      const sh = E("g", { transform: `translate(${side * 96} -190)` }, arms);
      const l = limb(sh, 74, 66, "url(#gHolo)", 19, "#ffd5f6");
      l.fore.__len = 74;
      return { sh, l };
    };
    const aL = mkArm(-1), aR = mkArm(1);

    // head
    const head = E("g", { transform: "translate(0 -214)" }, body);
    body.insertBefore(arms, head);
    const hd = E("g", {}, head);
    E("rect", { x: -22, y: -6, width: 44, height: 26, rx: 8, fill: "url(#gHolo)", stroke: OUT, "stroke-width": 5 }, hd);
    // neon quiff
    E("path", { d: "M -92 -150 Q -100 -250 10 -250 Q 96 -250 82 -176 Q 40 -216 -20 -190 Q -70 -190 -92 -150 Z", fill: "#ff6be4", stroke: OUT, "stroke-width": 5 }, hd);
    E("path", { d: "M -60 -200 Q -10 -236 52 -212", fill: "none", stroke: "#fff", "stroke-opacity": 0.7, "stroke-width": 5, "stroke-linecap": "round" }, hd);
    E("ellipse", { cx: 0, cy: -84, rx: 112, ry: 104, fill: "url(#gHolo)", stroke: OUT, "stroke-width": W }, hd);
    E("path", { d: "M -88 -126 Q -50 -176 8 -178", fill: "none", stroke: "#fff", "stroke-opacity": 0.6, "stroke-width": 6, "stroke-linecap": "round" }, hd);
    // face
    const face = E("g", { transform: "translate(0 -96)" }, hd);
    const eyeL = E("ellipse", { rx: 17, fill: "#fff", stroke: OUT, "stroke-width": 3 }, face), eyeR = E("ellipse", { rx: 17, fill: "#fff", stroke: OUT, "stroke-width": 3 }, face);
    const pupL = E("circle", { r: 8, fill: "#2a0a66" }, face), pupR = E("circle", { r: 8, fill: "#2a0a66" }, face);
    const browL = E("path", { d: "M -62 -34 Q -40 -48 -18 -34", fill: "none", stroke: "#2a0a66", "stroke-width": 8, "stroke-linecap": "round" }, face);
    const browR = E("path", { d: "M 18 -34 Q 40 -48 62 -34", fill: "none", stroke: "#2a0a66", "stroke-width": 8, "stroke-linecap": "round" }, face);
    const mouth = E("path", { fill: "#2a0a66", stroke: OUT, "stroke-width": 3, transform: "translate(0 52)" }, face);
    const teeth = E("path", { fill: "#fff", transform: "translate(0 52)" }, face);
    // sunglasses (a visor)
    const shades = E("g", {}, hd);
    const shadeShape = E("g", { transform: "translate(0 -96)" }, shades);
    E("path", { d: "M -112 -22 Q -112 -34 -96 -34 L 96 -34 Q 112 -34 112 -22 L 104 18 Q 98 36 70 36 L 22 36 Q 8 36 0 22 Q -8 36 -22 36 L -70 36 Q -98 36 -104 18 Z", fill: "url(#gShade)", stroke: OUT, "stroke-width": 6 }, shadeShape);
    E("path", { d: "M -92 -22 L -52 -22 L -78 26 L -98 26 Z", fill: "#fff", opacity: 0.35 }, shadeShape);
    E("path", { d: "M 14 -22 L 54 -22 L 28 26 L 8 26 Z", fill: "#fff", opacity: 0.25 }, shadeShape);
    E("path", { d: "M -100 -30 L 100 -30", stroke: "#fff", "stroke-opacity": 0.5, "stroke-width": 3 }, shadeShape);
    // floating social UI
    const fl = E("g", {}, g);
    const notifs = [];
    const heart = (parent) => E("path", { d: "M 0 12 C -22 -6 -16 -24 0 -12 C 16 -24 22 -6 0 12 Z", fill: "#ff3b7a", stroke: "#fff", "stroke-width": 3 }, parent);
    for (let i = 0; i < 6; i++) {
      const n = E("g", { opacity: 0 }, fl);
      if (i % 3 === 0) { heart(n); }
      else if (i % 3 === 1) {
        E("rect", { x: -34, y: -16, width: 68, height: 32, rx: 16, fill: "#ff4fd8", stroke: "#fff", "stroke-width": 3 }, n);
        E("circle", { cx: -18, cy: 0, r: 7, fill: "#fff" }, n);
        E("rect", { x: -6, y: -4, width: 30, height: 8, rx: 4, fill: "#fff" }, n);
      } else {
        E("circle", { r: 20, fill: "#ff2d55", stroke: "#fff", "stroke-width": 3 }, n);
        const t = E("text", { y: 7, "text-anchor": "middle", "font-family": "JetBrains Mono, monospace", "font-size": 19, "font-weight": 800, fill: "#fff" }, n);
        t.textContent = "99+";
      }
      notifs.push(n);
    }

    function update(p) {
      set(g, { transform: `translate(${p.x} ${p.y}) rotate(${p.rot}) scale(${p.sx} ${p.sy})`, opacity: p.alpha });
      set(glowBack, { opacity: 0.25 + 0.2 * p.glow });
      set(head, { transform: `translate(${p.hx} ${-214 + p.hy}) rotate(${p.hr}) scale(${p.hsx} ${p.hsy})` });
      const oL = p.openL ?? p.open, oR = p.openR ?? p.open;
      const eh = (22 + p.wide * 14);
      set(eyeL, { cx: -40, cy: 0, ry: Math.max(1.5, eh * oL), opacity: 1 });
      set(eyeR, { cx: 40, cy: 0, ry: Math.max(1.5, eh * oR), opacity: 1 });
      set(pupL, { cx: -40 + p.lookX * 8, cy: p.lookY * 6, r: 8 * Math.min(1, 0.3 + oL) });
      set(pupR, { cx: 40 + p.lookX * 8, cy: p.lookY * 6, r: 8 * Math.min(1, 0.3 + oR) });
      set(browL, { transform: `translate(0 ${p.browL}) rotate(${-p.tilt} -40 -36)` });
      set(browR, { transform: `translate(0 ${p.browR}) rotate(${p.tilt} 40 -36)` });
      const mp = mouthPath(p.mouth === "flat" ? "smile" : p.mouth, p.talk, 44);
      set(mouth, { d: mp });
      set(teeth, { d: p.talk > 0.2 || p.mouth === "smile" ? mouthPath("smile", Math.max(p.talk * 0.7, 0.1), 38).replace(/Z$/, "Z") : "", opacity: 0 });
      // shades: 1 on face, 0 detached (position via shadesX/Y/R)
      const onFace = clamp(p.shades, 0, 1);
      set(shades, { opacity: p.shades > 0 || Math.abs(p.shadesX) + Math.abs(p.shadesY) > 0 ? 1 : 0, transform: `translate(${p.shadesX} ${p.shadesY}) rotate(${p.shadesR} 0 -96)` });
      set(shadeShape, { opacity: onFace > 0.01 || Math.abs(p.shadesX) + Math.abs(p.shadesY) > 1 ? 1 : 0 });
      set(aL.sh, { transform: `translate(-96 -190) rotate(${p.aLs})` });
      set(aL.l.fore, { transform: `translate(0 74) rotate(${p.aLf})` });
      set(aR.sh, { transform: `translate(96 -190) rotate(${-p.aRs})` });
      set(aR.l.fore, { transform: `translate(0 74) rotate(${-p.aRf})` });
      // notifications orbit
      const k = clamp(p.hype, 0, 1);
      notifs.forEach((n, i) => {
        const ph = (p.hypeT || 0) * 0.9 + i / notifs.length;
        const f = ph - Math.floor(ph);
        const ang = (i / notifs.length) * Math.PI * 2 + (p.hypeT || 0) * 0.6;
        const rad = 150 + f * 120 * k;
        set(n, { transform: `translate(${Math.cos(ang) * rad * 1.2} ${-200 + Math.sin(ang) * rad * 0.8 - f * 40}) scale(${0.7 + (1 - f) * 0.7 * k})`, opacity: k * (1 - f * f) });
      });
    }
    return { g, update, anchors: { head: [0, -330] } };
  }

  /* =========================================================
   * WALLET — the brutally honest customer (green, mint, charcoal)
   * ========================================================= */
  function Wallet(root) {
    const c = "#6dffb0";
    const g = E("g", {}, root);
    const body = E("g", {}, g);
    const legs = E("g", {}, body);
    [-1, 1].forEach((s) => {
      E("rect", { x: s * 52 - 14, y: -34, width: 28, height: 50, rx: 12, fill: "url(#gLeather)", stroke: OUT, "stroke-width": 5 }, legs);
      E("ellipse", { cx: s * 52, cy: 12, rx: 26, ry: 12, fill: "#0b100e", stroke: OUT, "stroke-width": 5 }, legs);
    });
    const arms = E("g", {}, body);
    // wallet body (bifold, portrait)
    const wb = E("g", {}, body);
    E("rect", { x: -124, y: -330, width: 248, height: 310, rx: 34, fill: "url(#gLeather)", stroke: OUT, "stroke-width": W }, wb);
    E("rect", { x: -108, y: -314, width: 216, height: 278, rx: 24, fill: "none", stroke: c, "stroke-width": 3, "stroke-dasharray": "10 8", opacity: 0.85 }, wb); // stitching
    E("path", { d: "M -114 -300 Q 0 -322 114 -300", fill: "none", stroke: "#fff", "stroke-opacity": 0.2, "stroke-width": 5 }, wb);
    // frayed corner + plaster
    E("path", { d: "M 100 -40 L 122 -50 L 118 -24 Z", fill: "#0b100e", opacity: 0.7 }, wb);
    E("g", { transform: "translate(78 -92) rotate(-24)" }, wb);
    E("rect", { x: 56, y: -112, width: 54, height: 22, rx: 11, fill: "#e8c9a0", stroke: OUT, "stroke-width": 3, transform: "rotate(-24 83 -101)" }, wb);
    E("path", { d: "M 74 -110 L 74 -92 M 92 -118 L 92 -100", stroke: "#c79b6b", "stroke-width": 3, transform: "rotate(-24 83 -101)" }, wb);
    // card slot with receipts
    const slot = E("g", {}, wb);
    E("rect", { x: -88, y: -90, width: 176, height: 44, rx: 12, fill: "#0b100e", stroke: OUT, "stroke-width": 4 }, slot);
    const receipts = [];
    for (let i = 0; i < 5; i++) {
      const r = E("g", {}, wb);
      E("path", { d: `M -14 0 L 14 0 L 14 62 L 9 57 L 4 62 L -1 57 L -6 62 L -11 57 L -14 62 Z`, fill: "#f4f1e8", stroke: OUT, "stroke-width": 3 }, r);
      E("path", { d: "M -9 10 L 9 10 M -9 20 L 5 20 M -9 30 L 9 30 M -9 40 L 2 40", stroke: "#9c978a", "stroke-width": 2.5 }, r);
      receipts.push(r);
    }
    // flap (top) that opens
    const flap = E("g", { transform: "translate(0 -330)" }, body);
    E("path", { d: "M -124 0 L -124 -4 Q -124 -50 -90 -50 L 90 -50 Q 124 -50 124 -4 L 124 0 Z", fill: "url(#gLeather)", stroke: OUT, "stroke-width": W }, flap);
    E("path", { d: "M -112 -12 L 112 -12", stroke: c, "stroke-width": 3, "stroke-dasharray": "10 8", opacity: 0.85 }, flap);
    E("circle", { cx: 0, cy: -8, r: 11, fill: "url(#gMint)", stroke: OUT, "stroke-width": 4 }, flap);
    // inside (shown when open): empty with a cobweb and one lonely coin
    const inside = E("g", { opacity: 0 }, body);
    E("rect", { x: -108, y: -318, width: 216, height: 250, rx: 22, fill: "#050807", stroke: OUT, "stroke-width": 4 }, inside);
    E("path", { d: "M -108 -318 Q -70 -290 -50 -250 M -108 -318 Q -80 -270 -108 -230 M -108 -318 L -40 -318 Q -60 -290 -90 -270", stroke: "#9cb8ac", "stroke-width": 2, fill: "none", opacity: 0.55 }, inside);
    const coin = E("g", { transform: "translate(40 -92)" }, inside);
    E("circle", { r: 15, fill: "url(#gGold)", stroke: OUT, "stroke-width": 3 }, coin);
    E("text", { y: 6, "text-anchor": "middle", "font-family": "JetBrains Mono, monospace", "font-size": 17, "font-weight": 800, fill: "#7a4a0a" }, coin).textContent = "1p";

    // face on upper half
    const face = E("g", { transform: "translate(0 -220)" }, body);
    body.insertBefore(arms, face);
    const eyeBgL = E("circle", { cx: -50, r: 44, fill: "#f6fff9", stroke: OUT, "stroke-width": 5 }, face);
    const eyeBgR = E("circle", { cx: 50, r: 44, fill: "#f6fff9", stroke: OUT, "stroke-width": 5 }, face);
    const irisL = E("circle", { r: 24, fill: "url(#gMint)", stroke: OUT, "stroke-width": 3 }, face);
    const irisR = E("circle", { r: 24, fill: "url(#gMint)", stroke: OUT, "stroke-width": 3 }, face);
    const pupL = E("circle", { r: 11, fill: "#06120d" }, face), pupR = E("circle", { r: 11, fill: "#06120d" }, face);
    const shineL = E("circle", { r: 6, fill: "#fff" }, face), shineR = E("circle", { r: 6, fill: "#fff" }, face);
    const lidL = E("path", { fill: "#2b3832", stroke: OUT, "stroke-width": 5 }, face);
    const lidR = E("path", { fill: "#2b3832", stroke: OUT, "stroke-width": 5 }, face);
    const browL = E("path", { d: "M -90 -58 L -20 -58", stroke: c, "stroke-width": 9, "stroke-linecap": "round", fill: "none" }, face);
    const browR = E("path", { d: "M 20 -58 L 90 -58", stroke: c, "stroke-width": 9, "stroke-linecap": "round", fill: "none" }, face);
    const mouth = E("path", { fill: "#06120d", stroke: OUT, "stroke-width": 3, transform: "translate(0 62)" }, face);
    const sweat = [0, 1, 2].map(() => E("path", { d: "M 0 -14 Q 11 4 0 14 Q -11 4 0 -14 Z", fill: "#a8e4ff", stroke: OUT, "stroke-width": 2.5, opacity: 0 }, face));

    const mkArm = (side) => {
      const sh = E("g", { transform: `translate(${side * 124} -170)` }, arms);
      const l = limb(sh, 54, 44, "url(#gMint)", 15, "url(#gMint)");
      l.fore.__len = 54;
      return { sh, l };
    };
    const aL = mkArm(-1), aR = mkArm(1);
    // held receipt (thrown prop)
    const held = E("g", { opacity: 0 }, aR.l.hand);
    E("path", { d: "M -16 -86 L 16 -86 L 16 0 L 10 -6 L 4 0 L -2 -6 L -8 0 L -16 -6 Z", fill: "#f4f1e8", stroke: OUT, "stroke-width": 3 }, held);
    E("path", { d: "M -10 -72 L 10 -72 M -10 -58 L 6 -58 M -10 -44 L 10 -44 M -10 -30 L 2 -30", stroke: "#9c978a", "stroke-width": 2.5 }, held);

    function update(p) {
      const sh = p.shake ? Math.sin((p.shakeT || 0) * 60) * p.shake : 0;
      set(g, { transform: `translate(${p.x + sh} ${p.y}) rotate(${p.rot}) scale(${p.sx} ${p.sy})`, opacity: p.alpha });
      const oL = p.openL ?? p.open, oR = p.openR ?? p.open;
      const wide = p.wide;
      const R = 44 + wide * 6;
      set(eyeBgL, { r: R }); set(eyeBgR, { r: R });
      const lx = p.lookX * 14, ly = p.lookY * 11;
      const ir = 24 + wide * 6, pr = 11 - wide * 5 + p.stress * -2;
      set(irisL, { cx: -50 + lx, cy: ly, r: ir }); set(irisR, { cx: 50 + lx, cy: ly, r: ir });
      set(pupL, { cx: -50 + lx, cy: ly, r: Math.max(3, pr) }); set(pupR, { cx: 50 + lx, cy: ly, r: Math.max(3, pr) });
      set(shineL, { cx: -50 + lx - 8, cy: ly - 8 }); set(shineR, { cx: 50 + lx - 8, cy: ly - 8 });
      // eyelids: cover the eye from the top by (1-open)
      const lid = (cx, o, r) => {
        const cover = clamp(1 - o, 0, 1);
        const y = -r + cover * 2 * r;
        return `M ${cx - r - 4} ${-r - 8} L ${cx + r + 4} ${-r - 8} L ${cx + r + 4} ${y} Q ${cx} ${y + (cover > 0.02 ? 8 : 0)} ${cx - r - 4} ${y} Z`;
      };
      set(lidL, { d: lid(-50, oL, R), opacity: oL >= 0.98 ? 0 : 1 });
      set(lidR, { d: lid(50, oR, R), opacity: oR >= 0.98 ? 0 : 1 });
      set(browL, { transform: `translate(0 ${p.browL}) rotate(${p.tilt} -55 -58)` });
      set(browR, { transform: `translate(0 ${p.browR}) rotate(${-p.tilt} 55 -58)` });
      set(mouth, { d: mouthPath(p.mouth === "flat" ? "flat" : p.mouth, p.talk, 30), fill: p.mouth === "flat" && p.talk < 0.05 ? "none" : "#06120d", stroke: p.mouth === "flat" && p.talk < 0.05 ? "#06120d" : OUT, "stroke-width": p.mouth === "flat" && p.talk < 0.05 ? 7 : 3 });
      sweat.forEach((s, i) => {
        const k = clamp(p.sweat, 0, 1);
        const ph = (p.sweatT || 0) * 0.8 + i * 0.33;
        const f = ph - Math.floor(ph);
        set(s, { transform: `translate(${(i - 1) * 74 + (i === 1 ? 0 : 8)} ${-60 + f * 90}) scale(${0.7 + 0.4 * (1 - f)})`, opacity: k * (1 - f * 0.9) });
      });
      // flap & inside
      set(flap, { transform: `translate(0 -330) rotate(${-p.flap * 170} 0 0)` });
      set(inside, { opacity: p.flap > 0.5 ? 1 : 0 });
      set(coin, { opacity: p.coin });
      // receipts dangling from the slot (extra spill with p.receipts)
      receipts.forEach((r, i) => {
        const base = [-60, -30, 4, 34, 62][i];
        const sway = Math.sin((p.sweatT || 0) * 2 + i) * 4 * (1 + p.stress);
        set(r, { transform: `translate(${base + sway} ${-52 + (i % 2) * 8}) rotate(${(i - 2) * 6 + sway})`, opacity: 1 });
      });
      set(held, { opacity: 0 });
      set(aL.sh, { transform: `translate(-124 -170) rotate(${p.aLs})` });
      set(aL.l.fore, { transform: `translate(0 54) rotate(${p.aLf})` });
      set(aR.sh, { transform: `translate(124 -170) rotate(${-p.aRs})` });
      set(aR.l.fore, { transform: `translate(0 54) rotate(${-p.aRf})` });
      set(held, { opacity: p.receipts > 0.5 && p.receipts < 1.5 ? 1 : 0 });
      set(body, { transform: `translate(0 ${-p.hy * 0.4})` });
    }
    return { g, update, anchors: { head: [0, -250] } };
  }

  window.JUDGES = { Sterling, Kernel, Hype, Wallet, withBase, BASE, defs, E, set, OUT, mouthPath };
})();
