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

test("zero-data dashboard recovers from an interrupted read without clipped Swahili", async ({ page }) => {
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
  await page.route("**/*api/products/low-stock*", async (route) => route.fulfill({
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
  let dashboardRequests = 0;
  const requestedPeriods: string[] = [];
  let supportsYesterday = true;
  await page.route("**/*api/dashboard?period=*", async (route) => {
    dashboardRequests += 1;
    requestedPeriods.push(new URL(route.request().url()).searchParams.get("period") || "");
    if (dashboardRequests === 1) {
      await route.abort("connectionreset");
      return;
    }
    const isYesterday = requestedPeriods.at(-1) === "yesterday";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(isYesterday && supportsYesterday ? { ...emptyDashboard, period: "yesterday", periodBounds: { from: "2026-11-13T21:00:00.000Z", to: "2026-11-14T21:00:00.000Z", timeZone: "Africa/Dar_es_Salaam" }, summary: { ...emptyDashboard.summary, totalSales: 12000, netSales: 12000, cashCollected: 12000, salesCount: 1 } } : { ...emptyDashboard, period: isYesterday ? "yesterday" : "today" }),
    });
  });

  await page.goto("/dashboard");

  await expect(page.getByText("Hakuna mauzo ya leo bado.").first()).toBeVisible();
  await expect.poll(() => dashboardRequests).toBe(2);
  await expect(page.locator(".recharts-wrapper")).toHaveCount(0);
  await expect(page.locator("section").first().getByText("Kipindi hiki: Leo")).toBeVisible();

  const actionLabel = page.getByText("Bidhaa zinazohitaji hatua").first();
  await expect(actionLabel).toBeVisible();
  await expect(actionLabel).not.toHaveCSS("text-overflow", "ellipsis");

  await page.getByRole("button", { name: "Jana", exact: true }).click();
  await expect(page.getByText("Kipindi hiki: Jana")).toBeVisible();
  await expect(page.getByText("TZS 12,000", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Jana", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(requestedPeriods.at(-1)).toBe("yesterday");
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole("button", { name: "Jana", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Muda Wote", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  }
  await page.getByRole("button", { name: "Wiki hii" }).click();
  await expect(page.getByText("Hakuna mauzo ya wiki hii bado.").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  supportsYesterday = false;
  await page.getByRole("button", { name: "Jana", exact: true }).click();
  await expect(page.getByRole("alert").getByText(/takwimu za jana hazipatikani bado/i)).toBeVisible();
});

test("dashboard shows a retry action after both automatic read attempts fail", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-merchant-token");
  });
  await page.route("**/*api/auth/me", async (route) => route.fulfill({
    json: { user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "sw", shop: { id: "shop-1", name: "Amina Shop" } } },
  }));
  await page.route("**/*api/products/low-stock*", async (route) => route.fulfill({ json: { products: [], total: 0 } }));
  await page.route("**/*api/subscription/status", async (route) => route.fulfill({ json: { status: "active", daysLeft: 30 } }));
  await page.route("**/*api/notifications", async (route) => route.fulfill({ json: { items: [], unreadCount: 0 } }));
  let dashboardRequests = 0;
  let failDashboard = true;
  await page.route("**/*api/dashboard?period=*", async (route) => {
    dashboardRequests += 1;
    if (failDashboard) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({ json: emptyDashboard });
  });

  await page.goto("/dashboard");

  await expect(page.getByRole("alert").filter({ hasText: "Muhtasari haujapakia" })).toBeVisible();
  expect(dashboardRequests).toBeGreaterThanOrEqual(2);
  failDashboard = false;
  await page.getByRole("button", { name: "Jaribu tena" }).click();
  await expect(page.getByText("Hakuna mauzo ya leo bado.").first()).toBeVisible();
  expect(dashboardRequests).toBeGreaterThanOrEqual(3);
});
