import { expect, test } from "@playwright/test";

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

test("FIX screen shows long advice in full, without clipping or overflow", async ({ page }, testInfo) => {
  const longStep = (n: number) =>
    `Step ${n}: run the free draft past twelve best men on a real upcoming speech; pass if at least eight say they would pay £29 for the polished version, and if fewer, test whether the rehearsal coach or the fact-check step is the draw before building anything else, ending here ${n}.`.padEnd(
      400,
      " ",
    );
  const longPitch = `${"We sell a calm, specific service to people with a speech due within four weeks, priced so the first sale pays for the ad that found them. ".repeat(9)}Final sentence of the pitch.`.trim();
  const fix = {
    title: "Speech Coach Pro With A Rather Long Name",
    tagline: "A tagline that is deliberately close to the one hundred and forty character limit so wrapping is exercised properly here ok",
    pitch: longPitch,
    changes: [1, 2, 3, 4, 5].map((i) => ({
      area: `Change area ${i}`,
      before: "The original idea handled this in a vague way that nobody on the panel believed for a second. ".repeat(2).trim().slice(0, 230),
      after: `After: a much more specific approach with a named customer, a price and a channel, costing roughly two weeks of build time and one paid test. ${"More detail. ".repeat(6)}`.slice(0, 275),
      why: "Because the panel's objection was about exactly this and the change answers it with a measurable test rather than a slogan. ".repeat(3).slice(0, 315),
      persona: (["investor", "engineer", "marketer", "customer", "investor"] as const)[i - 1],
    })),
    firstSteps: [longStep(1), longStep(2), longStep(3)].map((s) => s.trim()),
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

  // Every step is rendered to its last word.
  for (const n of [1, 2, 3]) await expect(page.getByText(new RegExp(`ending here ${n}\.`))).toBeVisible();
  await expect(page.getByText("Final sentence of the pitch.")).toBeVisible();

  // No horizontal overflow, and no text box is clipped (content taller than its box).
  const layout = await page.evaluate(() => {
    const doc = document.documentElement;
    const clipped = [...document.querySelectorAll<HTMLElement>("p, li, h1, h2, h3, article")].filter((el) => el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflow !== "visible").length;
    const wide = [...document.querySelectorAll<HTMLElement>("p, li, article")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).length;
    return { overflowX: doc.scrollWidth - doc.clientWidth, clipped, wide };
  });
  expect(layout.overflowX).toBeLessThanOrEqual(1);
  expect(layout.clipped).toBe(0);
  expect(layout.wide).toBe(0);

  // Sections reveal as they scroll into view; walk the page so the capture shows all of them.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: testInfo.outputPath("fix-long-text.png"), fullPage: true });
});
