import { expect, test } from "@playwright/test";

test("owner branches fit mobile and desktop; create preserves failures and switching blocks offline sales", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const branches = [{ id: "main", name: "Duka kuu", location: "Dar es Salaam", contactPhone: null as string | null, effectiveContactPhone: "+255743910580", branchArchived: false }, { id: "child", name: "Tawi la pili lenye jina refu", location: "Mwanza", contactPhone: null as string | null, effectiveContactPhone: "+255743910580", branchArchived: false }];
  let updatedMainContact: string | null | undefined;
  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/branches") && route.request().method() === "POST") return route.fulfill({ status: 400, json: { error: "Branch limit reached" } });
    if (url.endsWith("/branches/main") && route.request().method() === "PATCH") {
      updatedMainContact = route.request().postDataJSON().contactPhone;
      branches[0].contactPhone = updatedMainContact || null;
      branches[0].effectiveContactPhone = updatedMainContact || "+255743910580";
      return route.fulfill({ json: { branch: branches[0] } });
    }
    const data = url.includes("auth/me") ? { user: { name: "Owner", role: "MERCHANT", language: "sw", shop: { id: "main", name: "Duka kuu" }, features: { branches: true } } }
      : url.endsWith("/branches") ? { branches, mainId: "main", selectedId: "main", pro: true, limit: 4, monthlyAmount: 35000 }
      : url.includes("branches/overview") ? { from: "2026-10-01", to: "2026-10-02", compareFrom: "2026-09-29T21:00:00.000Z", compareTo: "2026-10-01T21:00:00.000Z", comparison: { sales: { current: 200000, previous: 180000, change: 20000, changePercent: 11.1 }, netProfit: { current: 38000, previous: 35000, change: 3000, changePercent: 8.6 } }, branches: branches.map((b) => ({ ...b, sales: 100000, saleCount: 4, grossProfit: 20000, missingCostSalesRevenue: 0, expenses: 1000, netProfit: 19000, receivables: 5000 })) }
      : url.includes("subscription/status") ? { plan: "PRO", status: "active", isActive: true, subActive: true }
      : { items: [], products: [], unreadCount: 0 };
    await route.fulfill({ json: data });
  });
  await page.goto("/branches");
  await expect(page.getByRole("heading", { name: "Matawi", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Muhtasari wa matawi" })).toBeVisible();
  await expect(page.getByText("Faida halisi", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Kuanzia")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pakua CSV" })).toBeVisible();
  await page.getByLabel("Namba ya kuwasiliana na wateja").first().fill("0713712057");
  await page.getByRole("button", { name: "Hifadhi namba" }).first().click();
  await expect.poll(() => updatedMainContact).toBe("0713712057");
  await expect(page.getByLabel("Namba ya kuwasiliana na wateja").first()).toHaveValue("0713712057");
  await page.getByLabel("Jina la tawi", { exact: true }).fill("Tawi jipya");
  await page.getByLabel("Eneo", { exact: true }).fill("Arusha");
  await page.getByRole("button", { name: "Ongeza tawi", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Branch limit reached");
  await expect(page.getByLabel("Jina la tawi", { exact: true })).toHaveValue("Tawi jipya");
  await page.evaluate(() => localStorage.setItem("dukapilot_pending_sales", JSON.stringify([{ id: "offline" }])));
  await page.getByRole("button", { name: "Fungua", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toContainText("pending offline sales");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/branches-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/branches-desktop.png", fullPage: true });
});
