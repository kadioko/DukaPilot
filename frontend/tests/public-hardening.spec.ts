import { expect, test } from "@playwright/test";

test("signed-out visitors remain on the public Help page", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  await page.route("**/*api/auth/me", async (route) => route.fulfill({ status: 401, json: { error: "Unauthorized" } }));
  await page.goto("/help?lang=en");

  await expect(page).toHaveURL(/\/help/);
  await expect(page.getByRole("heading", { level: 1, name: "Get help running your business better" })).toBeVisible();
});

test("mobile Demo exposes sign-in details before its walkthrough", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo?lang=en");
  const account = page.getByRole("heading", { name: "Duka la Amina", exact: true });
  const walkthrough = page.getByRole("heading", { name: "Demo flows to try", exact: true });
  await expect(account).toBeVisible();
  const [accountBox, walkthroughBox] = await Promise.all([account.boundingBox(), walkthrough.boundingBox()]);
  expect(accountBox?.y || 0).toBeLessThan(walkthroughBox?.y || 0);
  expect(accountBox?.y || 0).toBeLessThan(900);
  expect(await page.locator("h1").count()).toBe(1);
});

test("mobile Contact leads with WhatsApp and has one page heading", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/contact?lang=en");
  await expect(page.getByRole("heading", { level: 1, name: "Talk to us on WhatsApp." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Message us on WhatsApp" })).toBeVisible();
  expect(await page.locator("h1").count()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
