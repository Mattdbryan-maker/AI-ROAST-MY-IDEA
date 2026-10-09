// Writes the .srt of everything the trailer says on screen (dialogue cards + title cards), from the same timeline.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const TL = createRequire(import.meta.url)("./timeline.js");
const stamp = (x) => { const ms = Math.round(x * 1000); const p = (n, w = 2) => String(n).padStart(w, "0"); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
const cues = [
  [0.0, 3.0, "I BUILT 4 AI JUDGES\nTO DESTROY BUSINESS IDEAS."],
  [3.55, 4.45, "THE ACCUSED:\nNFTs FOR SOURDOUGH STARTERS"],
  [4.45, 7.2, "ON TRIAL: NFTs FOR SOURDOUGH STARTERS"],
  ...TL.lines.map((l) => [l.t0, l.t1 + 0.3, `${TL.names[l.who]} (${TL.roles[l.who].toLowerCase()}): ${l.text}`]),
  [19.9, 22.0, `KILL IT\n${TL.real.overall} / 100`],
  [22.1, 23.1, "BUT CAN AI SAVE IT?"],
  [23.2, 24.45, "FIX MY IDEA: STARTER LINEAGE LOG\n19 → 41 (projected)"],
  [24.5, 25.4, "NO TOKENS. NO WALLET."],
  [25.9, 26.5, "KILL IT\nPROJECTED 41 / 100"],
  [26.55, 27.0, "+22 POINTS. STILL DEAD."],
  [27.0, 31.8, "THE REAL APP\nSample session: real Claude Haiku 5.5 output, recorded earlier, replayed in the live app."],
  [31.8, 34.8, "YOUR IDEA IS NEXT.\nWOULD IT SURVIVE?"],
];
writeFileSync(join("artifacts", "phase-6-cinematic", "AI_ROAST_MY_IDEA_CINEMATIC_V2.srt"), cues.map(([a, b, t], i) => `${i + 1}\n${stamp(a)} --> ${stamp(b - 0.04)}\n${t}\n`).join("\n"));
console.log(cues.length, "cues");
