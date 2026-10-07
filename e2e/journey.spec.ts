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
