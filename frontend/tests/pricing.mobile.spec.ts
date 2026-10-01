import { expect, test } from "@playwright/test";

test("mobile pricing compares Basic and Pro before the detailed plan cards", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pricing?lang=en");
  const trial = page.getByRole("heading", { name: "Free Trial", exact: true });
  const comparison = page.getByRole("region", { name: "Compare plans" });
  const basic = page.getByRole("heading", { name: "Basic", exact: true });
  const pro = page.getByRole("heading", { name: "Pro", exact: true });
  const proof = page.getByRole("heading", { name: "See the real workflows before you start.", exact: true });
  await expect(comparison).toBeVisible();
  await expect(comparison.getByText("TZS 15,000", { exact: false })).toBeVisible();
  await expect(comparison.getByText("TZS 35,000", { exact: false })).toBeVisible();
  await expect(basic).toBeVisible();
  await expect(pro).toBeVisible();
  await expect(trial).toBeVisible();
  await expect(proof).toBeVisible();
  const [comparisonBox, basicBox, proBox, trialBox, proofBox] = await Promise.all([comparison.boundingBox(), basic.boundingBox(), pro.boundingBox(), trial.boundingBox(), proof.boundingBox()]);
  expect(comparisonBox?.y || 0).toBeLessThan(basicBox?.y || 0);
  expect(basicBox?.y || 0).toBeLessThan(proBox?.y || 0);
  expect(proBox?.y || 0).toBeLessThan(trialBox?.y || 0);
  expect(comparisonBox?.y || 0).toBeLessThan(650);
  expect(trialBox?.y || 0).toBeLessThan(proofBox?.y || 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("pricing hydrates safely when a phone has a saved English preference", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.addInitScript(() => window.localStorage.setItem("dukapilot_language", "en"));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pricing");

  await expect(page.getByRole("heading", { name: /Simple Pricing/ })).toBeVisible();
  expect(browserErrors.filter((message) => /hydration|server-rendered html/i.test(message))).toEqual([]);
});
