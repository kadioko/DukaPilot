import { expect, test } from "@playwright/test";

const emptyDashboard = {
  period: "today",
  features: { staff: true, assistant: true, exports: true },
  summary: {
    totalSales: 0,
    totalProfit: 0,
    totalExpenses: 0,
    netProfit: 0,
    expenseCount: 0,
    salesCount: 0,
    pendingOrders: 0,
    totalProducts: 0,
    lowStockCount: 1,
    outOfStockCount: 0,
  },
  allTimeSummary: {
    totalSales: 0,
    totalProfit: 0,
    totalExpenses: 0,
    netProfit: 0,
    expenseCount: 0,
    salesCount: 0,
    firstSaleAt: null,
  },
  lowStockAlerts: [],
  recentSales: [],
  dailyChart: [
    { date: "2026-08-04", sales: 0, profit: 0 },
    { date: "2026-08-05", sales: 0, profit: 0 },
    { date: "2026-08-06", sales: 0, profit: 0 },
  ],
  paymentBreakdown: [],
  historyTimeline: [],
  topProducts: [],
};

test("zero-data dashboard explains the selected period without clipped Swahili", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-merchant-token");
  });

  await page.route("**/*api/auth/me", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: {
        name: "Test Merchant",
        role: "MERCHANT",
        language: "sw",
        shop: { name: "Duka la Jaribio" },
        features: { staff: true, assistant: true, exports: true },
      },
    }),
  }));
  await page.route("**/*api/products/low-stock", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ products: [] }),
  }));
  await page.route("**/*api/subscription/status", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "active", daysLeft: 30 }),
  }));
  await page.route("**/*api/notifications", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [], unreadCount: 0 }),
  }));
  await page.route("**/*api/dashboard?period=*", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(emptyDashboard),
  }));

  await page.goto("/dashboard");

  await expect(page.getByText("Hakuna mauzo ya leo bado.").first()).toBeVisible();
  await expect(page.locator(".recharts-wrapper")).toHaveCount(0);

  const actionLabel = page.getByText("Bidhaa zinazohitaji hatua").first();
  await expect(actionLabel).toBeVisible();
  await expect(actionLabel).not.toHaveCSS("text-overflow", "ellipsis");

  await page.getByRole("button", { name: "Wiki" }).click();
  await expect(page.getByText("Hakuna mauzo ya wiki bado.").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});
