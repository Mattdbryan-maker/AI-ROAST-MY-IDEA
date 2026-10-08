import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PERSONAS } from "../src/lib/personas";
import { RUBRIC } from "./rubric";
import type { BenchRun } from "./run";

/**
 * Writes a self-contained, offline review page with every output for each idea
 * shuffled and labelled A, B, C… (no model names), plus the key that maps
 * labels back to targets. Keep the key closed until the ratings are done.
 */
export function writeBlindReview(run: BenchRun, outDir: string) {
  let seed = [...run.startedAt].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const key: Record<string, Record<string, { target: string; repeat: number }>> = {};
  const items = run.ideas.map((idea) => {
    const records = run.records.filter((r) => r.ideaId === idea.id);
    const shuffled = records.map((r) => ({ r, k: rand() })).sort((a, b) => a.k - b.k).map((x) => x.r);
    key[idea.id] = {};
    return {
      id: idea.id,
      pitch: idea.pitch,
      entries: shuffled.map((r, i) => {
        const label = String.fromCharCode(65 + i);
        key[idea.id][label] = { target: r.target, repeat: r.repeat };
        return {
          label,
          failed: !r.roast,
          roast: r.roast && {
            title: r.roast.title,
            overall: r.roast.overall,
            verdict: r.roast.verdict,
            takes: r.roast.takes.map((t) => ({ name: PERSONAS[t.persona].name, score: t.score, headline: t.headline, points: t.points })),
            debate: r.roast.debate.map((d) => ({ name: PERSONAS[d.speaker].name, line: d.line })),
            strengths: r.roast.strengths,
            weaknesses: r.roast.weaknesses,
            risk: r.roast.biggestRisk,
            opportunity: r.roast.biggestOpportunity,
            closing: r.roast.closingLine,
          },
          fix: r.fix && { title: r.fix.title, tagline: r.fix.tagline, pitch: r.fix.pitch, changes: r.fix.changes, steps: r.fix.firstSteps },
        };
      }),
    };
  });

  writeFileSync(join(outDir, "blind-key.json"), JSON.stringify({ startedAt: run.startedAt, key }, null, 2));
  const data = JSON.stringify({ runId: run.startedAt, rubric: RUBRIC, items }).replace(/</g, "\\u003c");
  writeFileSync(join(outDir, "blind-review.html"), PAGE.replace("__DATA__", data));
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Blind roast review</title>
<style>
  :root { --bg: #0d0d12; --panel: #16161e; --line: #2a2a36; --fg: #ecebe6; --muted: #9a99a6; --accent: #ffb020; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; padding: 24px 16px 80px; }
  main { max-width: 1100px; margin: 0 auto; }
  h1 { margin: 0 0 4px; } .muted { color: var(--muted); }
  .idea { border-top: 1px solid var(--line); margin-top: 32px; padding-top: 16px; }
  .pitch { background: var(--panel); padding: 12px 16px; border-radius: 10px; }
  .entries { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); margin-top: 16px; }
  .entry { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 16px; min-width: 0; }
  .entry h3 { margin: 0 0 8px; color: var(--accent); }
  .take { margin: 10px 0; } .take b { color: var(--accent); }
  ul { margin: 4px 0 8px 18px; padding: 0; }
  details { margin-top: 10px; } summary { cursor: pointer; color: var(--muted); }
  .rate { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; display: grid; gap: 8px; }
  .row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
  .row small { display: block; color: var(--muted); }
  .scale { display: flex; gap: 4px; }
  .scale label { border: 1px solid var(--line); border-radius: 6px; padding: 2px 8px; cursor: pointer; }
  .scale input { display: none; } .scale input:checked + span { color: #000; background: var(--accent); border-radius: 4px; padding: 0 4px; }
  textarea { width: 100%; background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 8px; padding: 8px; }
  .bar { position: fixed; left: 0; right: 0; bottom: 0; background: #000c; padding: 12px 16px; display: flex; gap: 12px; justify-content: center; align-items: center; }
  button { background: var(--accent); border: 0; border-radius: 999px; padding: 8px 18px; font-weight: 600; cursor: pointer; }
  button:focus-visible, label:focus-within { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
</head>
<body>
<main>
  <h1>Blind roast review</h1>
  <p class="muted">Each idea shows every model's output in random order as Panel A, B, C… Score what you read, not what you expect. Ratings save in this browser; export them when done. Scale: 1 (poor) – 5 (excellent).</p>
  <div id="app"></div>
  <h2>Export</h2>
  <textarea id="out" rows="6" readonly aria-label="Exported ratings"></textarea>
</main>
<div class="bar"><span id="progress" class="muted"></span><button id="export">Export ratings</button></div>
<script>
const DATA = __DATA__;
const KEY = "blind-ratings:" + DATA.runId;
let ratings = {};
try { ratings = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ratings)); } catch {} progress(); };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const app = document.getElementById("app");
let total = 0;
for (const idea of DATA.items) {
  const sec = document.createElement("section");
  sec.className = "idea";
  sec.innerHTML = '<h2>' + esc(idea.id) + '</h2><div class="pitch">' + esc(idea.pitch) + '</div><div class="entries"></div>';
  const grid = sec.querySelector(".entries");
  for (const e of idea.entries) {
    const id = idea.id + ":" + e.label;
    const el = document.createElement("article");
    el.className = "entry";
    if (e.failed) { el.innerHTML = '<h3>Panel ' + e.label + '</h3><p class="muted">No result: this panel failed to answer.</p>'; grid.appendChild(el); continue; }
    const r = e.roast;
    let html = '<h3>Panel ' + e.label + '</h3><div><b>' + esc(r.title) + '</b> — ' + r.overall + '/100 (' + esc(r.verdict) + ')</div>';
    for (const t of r.takes) html += '<div class="take"><b>' + esc(t.name) + ' · ' + t.score + '</b><br>“' + esc(t.headline) + '”<ul>' + t.points.map((p) => '<li>' + esc(p) + '</li>').join("") + '</ul></div>';
    html += '<details open><summary>Debate</summary><ul>' + r.debate.map((d) => '<li><b>' + esc(d.name) + ':</b> ' + esc(d.line) + '</li>').join("") + '</ul></details>';
    html += '<details><summary>Strengths, weaknesses, risk, opportunity</summary><p><b>+</b> ' + r.strengths.map(esc).join("<br><b>+</b> ") + '</p><p><b>−</b> ' + r.weaknesses.map(esc).join("<br><b>−</b> ") + '</p><p><b>Risk:</b> ' + esc(r.risk) + '</p><p><b>Opportunity:</b> ' + esc(r.opportunity) + '</p><p><i>' + esc(r.closing) + '</i></p></details>';
    if (e.fix) html += '<details><summary>FIX MY IDEA</summary><p><b>' + esc(e.fix.title) + '</b> — ' + esc(e.fix.tagline) + '</p><p>' + esc(e.fix.pitch) + '</p><ul>' + e.fix.changes.map((c) => '<li><b>' + esc(c.area) + ':</b> ' + esc(c.after) + ' <span class="muted">(' + esc(c.why) + ')</span></li>').join("") + '</ul><ol>' + e.fix.steps.map((s) => '<li>' + esc(s) + '</li>').join("") + '</ol></details>';
    html += '<div class="rate">';
    for (const c of DATA.rubric) {
      if (c.key === "fix" && !e.fix) continue;
      total++;
      html += '<div class="row"><div>' + esc(c.label) + '<small>' + esc(c.hint) + '</small></div><div class="scale" role="radiogroup" aria-label="' + esc(c.label) + '">';
      for (let n = 1; n <= 5; n++) {
        const checked = ratings[id]?.[c.key] === n ? " checked" : "";
        html += '<label><input type="radio" name="' + esc(id + ":" + c.key) + '" value="' + n + '" data-id="' + esc(id) + '" data-k="' + c.key + '"' + checked + '><span>' + n + '</span></label>';
      }
      html += '</div></div>';
    }
    html += '<textarea rows="2" placeholder="Notes (optional)" data-id="' + esc(id) + '" data-notes>' + esc(ratings[id]?.notes || "") + '</textarea></div>';
    el.innerHTML = html;
    grid.appendChild(el);
  }
  app.appendChild(sec);
}
app.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.matches("input[type=radio]")) { (ratings[t.dataset.id] ??= {})[t.dataset.k] = Number(t.value); save(); }
});
app.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.matches("textarea[data-notes]")) { (ratings[t.dataset.id] ??= {}).notes = t.value; save(); }
});
function progress() {
  const done = Object.values(ratings).reduce((n, r) => n + Object.keys(r).filter((k) => k !== "notes").length, 0);
  document.getElementById("progress").textContent = done + " / " + total + " scores";
}
document.getElementById("export").addEventListener("click", () => {
  const json = JSON.stringify({ runId: DATA.runId, ratings }, null, 2);
  document.getElementById("out").value = json;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  a.download = "ratings.json";
  a.click();
});
progress();
</script>
</body>
</html>
`;
