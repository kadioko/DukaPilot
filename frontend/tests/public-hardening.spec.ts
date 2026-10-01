import { expect, test } from "@playwright/test";

test("signed-out visitors remain on the public Help page", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  await page.route("**/*api/auth/me", async (route) => route.fulfill({ status: 401, json: { error: "Unauthorized" } }));
  await page.goto("/help?lang=en");

  await expect(page).toHaveURL(/\/help/);
  await expect(page.getByRole("heading", { level: 1, name: "Find quick answers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible();
  const firstFaq = page.locator("details").first();
  await expect(firstFaq).toBeVisible();
  await expect(firstFaq).not.toHaveAttribute("open", "");
  await firstFaq.locator("summary").click();
  await expect(firstFaq.locator("p")).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1, name: "Support for your business." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Message us on WhatsApp" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Message us on WhatsApp" })).toHaveCount(1);
  expect(await page.locator("h1").count()).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("mobile homepage shows a real product preview in the first viewport", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?lang=en");
  const preview = page.getByRole("img", { name: "DukaPilot dashboard on a phone" });
  await expect(preview).toBeVisible();
  const box = await preview.boundingBox();
  expect(box?.y || 0).toBeLessThan(844);
  expect(box ? box.y + box.height : 9999).toBeLessThan(844);
  await expect(page.getByText("Sales · Stock · AI", { exact: true })).toBeVisible();
});

test("mobile public menu sends visitors to the sign-in panel", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pricing?lang=en");

  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Sign in", exact: true }).click();

  await expect(page).toHaveURL(/\/#sign-in$/);
  const signInPanel = page.locator("#sign-in");
  await expect(signInPanel).toBeVisible();
  expect(await signInPanel.evaluate((element) => element.getBoundingClientRect().top < window.innerHeight)).toBe(true);
});
