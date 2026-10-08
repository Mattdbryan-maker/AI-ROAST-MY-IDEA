import { expect, test } from "@playwright/test";

test("the full journey runs on the Ollama provider", async ({ page, request }) => {
  const status = await (await request.get("/api/status")).json();
  expect(status).toEqual({ mode: "ai", provider: "ollama", model: "mock-qwen" });

  await page.goto("/");
  await expect(page.getByText("Live AI panel")).toBeVisible();
  await page.getByRole("button", { name: "AI wedding speeches" }).click();
  await page.getByRole("button", { name: /put it on trial/i }).click();

  await expect(page.getByText(/testimony/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "STERLING" })).toBeVisible();
  await page.getByRole("button", { name: /skip to verdict/i }).click();
  await expect(page.getByText(/^(KILL IT|FIX IT|BUILD IT)$/)).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: /fix my idea/i }).first().click();
  await expect(page.getByText(/what changed/i)).toBeVisible({ timeout: 60_000 });
});

test("streams NDJSON events from Ollama", async ({ request }) => {
  const res = await request.post("/api/roast/stream", { data: { idea: "A subscription box of houseplants for people who kill houseplants." } });
  const types = (await res.text())
    .trim()
    .split("\n")
    .map((l) => (JSON.parse(l) as { type: string }).type);
  expect(types[0]).toBe("start");
  expect(types.filter((t) => t === "take")).toHaveLength(4);
  expect(types.at(-1)).toBe("done");
});

test("a missing model fails clearly and never falls back to the demo", async ({ page, request }) => {
  const broken = "http://localhost:3211";
  const res = await request.post(`${broken}/api/roast/stream`, { data: { idea: "A subscription box of houseplants for people who kill houseplants." } });
  const events = (await res.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { type: string; message?: string });
  expect(events.map((e) => e.type)).toEqual(["start", "error"]);
  expect(events[1].message).toContain("ollama pull qwen3.5:4b");

  await page.goto(broken);
  await page.getByRole("button", { name: "Houseplant subscription" }).click();
  await page.getByRole("button", { name: /put it on trial/i }).click();
  await expect(page.getByRole("heading", { name: "The panel walked out" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("alert").filter({ hasText: "ollama pull qwen3.5:4b" })).toBeVisible();
});
