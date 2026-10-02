import { expect, test } from "@playwright/test";

test("owner profit analytics distinguishes cash, credit, costs, debt and exports its range", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => window.localStorage.setItem("dukapilot_token", "test-owner-token"));
  await page.route("**/*api/auth/me", (route) => route.fulfill({ json: { user: { name: "Owner", role: "MERCHANT", language: "en", shop: { name: "Test Shop" }, features: { exports: true } } } }));
  await page.route("**/*api/subscription/status", (route) => route.fulfill({ json: { status: "active", daysLeft: 30 } }));
  await page.route("**/*api/products/low-stock*", (route) => route.fulfill({ json: { products: [] } }));
  await page.route("**/*api/notifications", (route) => route.fulfill({ json: { items: [], unreadCount: 0 } }));
  await page.route("**/*api/dashboard/profit*", (route) => route.fulfill({ json: {
    period: "today", from: "2026-10-02T00:00:00.000Z", to: "2026-10-02T08:00:00.000Z", compareFrom: null, compareTo: null, group: "hour",
    summary: { salesRevenue: 100000, cashCollected: 80000, creditSales: 20000, costOfGoodsSold: 60000, grossProfit: 30000, grossProfitMargin: 50, expenses: 5000, netProfit: 25000, salesCount: 4, unitsSold: 12, missingCostSalesRevenue: 10000, costComplete: false },
    production: { batchCount: 1, grossOutput: 280, brokenEggs: 8, usableOutput: 272, productionVariance: 0, ingredientCost: 52500, directCost: 0, totalCost: 52500, inputs: [{ productId: "feed", name: "Layer mash", unit: "kg", quantity: 37.5, cost: 52500 }] },
    comparison: null, debtAging: { overdue: 12000, dueSoon: 3000, noDueDate: 4000, outstanding: 19000 }, collectionBreakdown: [{ paymentMethod: "CASH", amount: 80000 }],
    products: [{ id: "flour", name: "Unga", unit: "kg", currentStock: 8, quantity: 12, revenue: 60000, grossProfit: 20000, missingCostSalesRevenue: 10000, lastSoldAt: "2026-10-02T07:00:00Z" }],
    slowMovingProducts: [{ id: "rice", name: "Rice", unit: "kg", currentStock: 15 }],
    chart: [{ label: "08:00", revenue: 100000, costOfGoodsSold: 60000, grossProfit: 30000, expenses: 5000, netProfit: 25000 }],
  } }));

  await page.goto("/profit");
  await expect(page.getByText("Cash collected", { exact: true })).toBeVisible();
  await expect(page.getByText("Credit sales", { exact: true })).toBeVisible();
  await expect(page.getByText(/no recorded cost/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Receivables and collections" })).toBeVisible();
  await expect(page.getByText("Stock with no sale in 30 days")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Production costs and inputs" })).toBeVisible();
  await expect(page.getByText("37.5 kg", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toContain("dukapilot-owner-report");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
