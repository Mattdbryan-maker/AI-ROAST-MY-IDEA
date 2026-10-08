/**
 * Joins exported blind ratings with the key and writes quality.md.
 *
 *   npm run bench:score -- bench/results/<run> ratings.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RUBRIC } from "./rubric";

const [dir, ratingsPath] = process.argv.slice(2);
if (!dir || !ratingsPath) {
  console.error("Usage: npm run bench:score -- <results folder> <ratings.json>");
  process.exit(1);
}

const { key } = JSON.parse(readFileSync(join(dir, "blind-key.json"), "utf8")) as { key: Record<string, Record<string, { target: string }>> };
const { ratings } = JSON.parse(readFileSync(ratingsPath, "utf8")) as { ratings: Record<string, Record<string, number | string>> };

const byTarget = new Map<string, Record<string, number[]>>();
let unknown = 0;
for (const [id, scores] of Object.entries(ratings)) {
  const [idea, label] = id.split(":");
  const target = key[idea]?.[label]?.target;
  if (!target) {
    unknown++;
    continue;
  }
  const slot = byTarget.get(target) ?? {};
  for (const [k, v] of Object.entries(scores)) if (typeof v === "number") (slot[k] ??= []).push(v);
  byTarget.set(target, slot);
}

const mean = (xs?: number[]) => (xs?.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : "–");
const lines = [
  "# Blinded human quality ratings",
  "",
  "Scores are 1–5 means from a blinded review (labels were shuffled per idea). n = number of rated outputs per criterion.",
  "These are one reviewer's judgements on a small sample: treat differences under ~0.5 as noise.",
  "",
  `| Target | ${RUBRIC.map((c) => c.label).join(" | ")} | Overall |`,
  `|---|${RUBRIC.map(() => "---").join("|")}|---|`,
];
for (const [target, s] of byTarget) {
  const all = RUBRIC.flatMap((c) => s[c.key] ?? []);
  lines.push(`| \`${target}\` | ${RUBRIC.map((c) => `${mean(s[c.key])} (n=${s[c.key]?.length ?? 0})`).join(" | ")} | ${mean(all)} |`);
}
if (unknown) lines.push("", `${unknown} ratings didn't match the key and were ignored (wrong run?).`);
writeFileSync(join(dir, "quality.md"), lines.join("\n") + "\n");
console.log(`Wrote ${join(dir, "quality.md")}`);
