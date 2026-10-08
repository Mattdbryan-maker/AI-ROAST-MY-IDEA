import { expect, test, type Page } from "@playwright/test";
import { LIMITS } from "../src/lib/types";

test("pitch → trial → verdict → fix", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Think your idea is good?");

  // Too-short pitches are rejected client-side.
  await page.getByLabel(/pitch your idea/i).fill("short");
  await page.getByRole("button", { name: /put it on trial/i }).click();
  await expect(page.getByText(/a little more, please/i)).toBeVisible();

  await page.getByRole("button", { name: "Uber for dog walking" }).click();
  await page.getByRole("button", { name: /put it on trial/i }).click();

  // Analysis sequence, then the first witness takes the stand.
  await expect(page.getByText(/case file/i)).toBeVisible();
  await expect(page.getByText(/testimony/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Live", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "STERLING" })).toBeVisible();

  await page.getByRole("button", { name: /skip to verdict/i }).click();
  await expect(page.getByText(/^(KILL IT|FIX IT|BUILD IT)$/)).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText(/how they voted/i)).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /fix my idea/i }).first().click();
  await expect(page.getByText(/what changed/i)).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("button", { name: /put version 2 on trial/i })).toBeVisible();
});

test("share card and share page", async ({ page, request }) => {
  const roast = await (await request.post("/api/roast", { data: { idea: "A dating app for people who hate dating apps." } })).json();
  expect(roast.takes).toHaveLength(4);

  const payload = Buffer.from(
    JSON.stringify({ v: 1, t: roast.title, s: roast.overall, p: roast.takes.map((t: { score: number }) => t.score), q: roast.takes[0].headline, w: "investor" }),
  ).toString("base64url");

  const card = await request.get(`/api/card?d=${payload}&f=story`);
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toContain("image/png");

  await page.goto(`/r/${payload}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(roast.title);
  await expect(page.getByRole("link", { name: /put it on trial/i })).toBeVisible();
});

test("streams the panel as NDJSON events", async ({ request }) => {
  const res = await request.post("/api/roast/stream", { data: { idea: "A subscription box of houseplants for people who kill houseplants." } });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/x-ndjson");
  const events = (await res.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string });
  const types = events.map((e) => e.type);
  expect(types[0]).toBe("start");
  expect(types).toContain("meta");
  expect(types.filter((t) => t === "progress").length).toBeGreaterThan(10);
  expect(types.filter((t) => t === "take")).toHaveLength(4);
  expect(types.at(-1)).toBe("done");
});

test("rejects bad input at the API", async ({ request }) => {
  const res = await request.post("/api/roast", { data: { idea: "" } });
  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe("invalid_input");
});

/** A sentence-ish string of exactly `limit` characters that ends with a unique marker, so a test can see whether the END of a field rendered. */
function fillTo(limit: number, tag: string): string {
  const suffix = ` ${tag}.`;
  const body = "The margins are thin, the churn is worse and nobody has said who pays for the van on a wet Tuesday. ".repeat(20);
  return (body.slice(0, limit - suffix.length).trimEnd() + suffix).padEnd(limit, "!").slice(0, limit);
}

const URL_TOKEN = "https://www.example-resale-platform.co.uk/collections/womens/blazers/navy?size=12&condition=excellent&sort=newest";

/** Layout checks shared by the long-text tests: nothing wider than the viewport, no clipped text boxes. */
async function expectNoClipping(page: Page) {
  const layout = await page.evaluate(() => {
    const doc = document.documentElement;
    const boxes = [...document.querySelectorAll<HTMLElement>("p, li, h1, h2, h3, dd, article")];
    const clipped = boxes.filter((el) => el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflow !== "visible").length;
    const wide = boxes.filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).length;
    return { overflowX: doc.scrollWidth - doc.clientWidth, clipped, wide };
  });
  expect(layout.overflowX).toBeLessThanOrEqual(1);
  expect(layout.clipped).toBe(0);
  expect(layout.wide).toBe(0);
}

async function scrollThrough(page: Page) {
  // Sections reveal as they scroll into view; walk the page so a capture shows all of them.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(250);
  }
}

test("FIX screen shows every field at its maximum length in full, without clipping or overflow", async ({ page }, testInfo) => {
  const fix = {
    title: "Speech Coach Pro With A Rather Long Name",
    tagline: fillTo(LIMITS.fixTagline, "TAGLINE-END"),
    // A URL is one unbroken token: on a phone it must wrap, not widen the page.
    pitch: `${URL_TOKEN} ${fillTo(LIMITS.fixPitch - URL_TOKEN.length - 1, "PITCH-END")}`,
    changes: [1, 2, 3, 4, 5].map((i) => ({
      area: `Change area ${i}`,
      before: fillTo(LIMITS.fixBefore, `BEFORE-END-${i}`),
      after: fillTo(LIMITS.fixAfter, `AFTER-END-${i}`),
      why: fillTo(LIMITS.fixWhy, `WHY-END-${i}`),
      persona: (["investor", "engineer", "marketer", "customer", "investor"] as const)[i - 1],
    })),
    firstSteps: [1, 2, 3].map((n) => (n === 1 ? `${URL_TOKEN} ${fillTo(LIMITS.fixStep - URL_TOKEN.length - 1, "STEP-END-1")}` : fillTo(LIMITS.fixStep, `STEP-END-${n}`))),
    projectedScores: { investor: 62, engineer: 60, marketer: 68, customer: 63 },
    projectedOverall: 63,
    projectedVerdict: "FIX",
    mode: "demo",
  };
  await page.route("**/api/fix", (route) => route.fulfill({ json: fix }));

  await page.goto("/");
  await page.getByRole("button", { name: "Uber for dog walking" }).click();
  await page.getByRole("button", { name: /put it on trial/i }).click();
  await expect(page.getByText(/testimony/i)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /skip to verdict/i }).click();
  await expect(page.getByText(/^(KILL IT|FIX IT|BUILD IT)$/)).toBeVisible({ timeout: 40_000 });
  await page.getByRole("button", { name: /fix my idea/i }).first().click();
  await expect(page.getByText(/your next three moves/i)).toBeVisible({ timeout: 25_000 });

  // The end of every field is on the page: nothing was clipped by the layout.
  await expect(page.getByText("TAGLINE-END.")).toBeVisible();
  await expect(page.getByText("PITCH-END.")).toBeVisible();
  for (const n of [1, 2, 3]) await expect(page.getByText(`STEP-END-${n}.`)).toBeVisible();
  for (const i of [1, 2, 3, 4, 5]) {
    for (const k of ["BEFORE", "AFTER", "WHY"]) await expect(page.getByText(`${k}-END-${i}.`)).toBeAttached();
  }
  await expectNoClipping(page);

  await scrollThrough(page);
  await page.screenshot({ path: testInfo.outputPath("fix-max-length.png"), fullPage: true });
});

test("roast screens show every field at its maximum length in full", async ({ page }, testInfo) => {
  const personas = ["investor", "engineer", "marketer", "customer"] as const;
  const takes = personas.map((persona, i) => ({
    persona,
    score: [30, 55, 62, 48][i],
    headline: fillTo(LIMITS.headline, `HEADLINE-END-${persona}`),
    points: [0, 1, 2].map((p) => fillTo(LIMITS.point, `POINT-END-${persona}-${p}`)),
    strength: fillTo(LIMITS.strength, `STRENGTH-END-${persona}`),
    weakness: fillTo(LIMITS.weakness, `WEAKNESS-END-${persona}`),
  }));
  const roast = {
    title: "T".repeat(LIMITS.title - 1) + "!",
    summary: fillTo(LIMITS.summary, "SUMMARY-END"),
    takes,
    debate: [0, 1, 2, 3, 4, 5].map((n) => ({ speaker: personas[n % 4], line: fillTo(LIMITS.debateLine, `DEBATE-END-${n}`) })),
    strengths: [0, 1, 2].map((n) => fillTo(LIMITS.listItem, `GOOD-END-${n}`)),
    weaknesses: [0, 1, 2].map((n) => fillTo(LIMITS.listItem, `BAD-END-${n}`)),
    biggestRisk: fillTo(LIMITS.risk, "RISK-END"),
    biggestOpportunity: fillTo(LIMITS.opportunity, "OPPORTUNITY-END"),
    closingLine: fillTo(LIMITS.closingLine, "CLOSING-END"),
    overall: 46,
    verdict: "FIX",
    mode: "demo",
  };
  const events = [
    { type: "start", mode: "demo" },
    { type: "meta", title: roast.title, summary: roast.summary },
    ...takes.map((take, index) => ({ type: "take", index, take })),
    { type: "debate", lines: roast.debate, lastDone: true },
    { type: "done", roast },
  ];
  await page.route("**/api/roast/stream", (route) =>
    route.fulfill({ status: 200, contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Uber for dog walking" }).click();
  await page.getByRole("button", { name: /put it on trial/i }).click();
  await expect(page.getByText(/testimony/i)).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /skip to verdict/i }).click();
  await expect(page.getByText(/^(KILL IT|FIX IT|BUILD IT)$/)).toBeVisible({ timeout: 40_000 });
  // The closing line is typed out; the screen-reader copy holds the whole text from the start.
  await expect(page.getByText("CLOSING-END.").first()).toBeAttached({ timeout: 20_000 });
  await expect(page.getByText(/how they voted/i)).toBeVisible({ timeout: 10_000 });

  await expect(page.getByText("RISK-END.")).toBeVisible();
  await expect(page.getByText("OPPORTUNITY-END.")).toBeVisible();
  for (const n of [0, 1, 2]) {
    await expect(page.getByText(`GOOD-END-${n}.`)).toBeVisible();
    await expect(page.getByText(`BAD-END-${n}.`)).toBeVisible();
  }
  for (const persona of personas) await expect(page.getByText(`HEADLINE-END-${persona}.`)).toBeVisible();

  // Open every full testimony: points, best thing, worst thing.
  // Each click relabels its button, so always take the first one still closed.
  for (let i = 0; i < personas.length; i++) await page.getByRole("button", { name: /full testimony/i }).first().click();
  for (const persona of personas) {
    await expect(page.getByText(`STRENGTH-END-${persona}.`)).toBeVisible();
    await expect(page.getByText(`WEAKNESS-END-${persona}.`)).toBeVisible();
    for (const p of [0, 1, 2]) await expect(page.getByText(`POINT-END-${persona}-${p}.`)).toBeVisible();
  }
  await page.waitForTimeout(600);
  await expectNoClipping(page);

  await scrollThrough(page);
  await page.screenshot({ path: testInfo.outputPath("roast-max-length.png"), fullPage: true });
});
