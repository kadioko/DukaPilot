import { expect, test } from "@playwright/test";

test("owner can inspect and compare product performance on a phone", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("dukapilot_token", "product-report-owner"));
  const egg = {
    id: "egg-tray", name: "Egg tray", sku: "EGG-30", unit: "tray", isActive: true, isInternalUse: false,
    currentStock: 12, minimumStock: 3, buyingPrice: 7000, sellingPrice: 10000, wholesalePrice: 9000,
    saleCount: 3, unitsSold: 5, revenue: 50000, knownCostOfGoodsSold: 28000, knownCostRevenue: 40000,
    grossProfit: 12000, missingCostSalesRevenue: 10000, retailUnits: 3, wholesaleUnits: 2,
    grossMargin: 30, averageSalePrice: 10000, costCoveragePercent: 80, lastSoldAt: "2026-10-02T08:00:00.000Z",
  };
  const rice = { ...egg, id: "rice", name: "Rice", sku: "RICE", unitsSold: 8, revenue: 40000, grossProfit: 10000, missingCostSalesRevenue: 0, costCoveragePercent: 100 };
  let lastSearch = "";

  await page.route("**/*api/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me")) return route.fulfill({ json: { user: { id: "owner", role: "MERCHANT", language: "en", shop: { id: "shop", name: "Farm Shop" } } } });
    if (url.pathname.endsWith("/dashboard/products/performance")) {
      lastSearch = url.searchParams.get("search") || "";
      const products = lastSearch ? [egg] : [egg, rice];
      return route.fulfill({ json: { from: "2026-09-30T21:00:00.000Z", to: "2026-10-03T08:00:00.000Z", page: 1, limit: 25, total: products.length, products } });
    }
    if (url.pathname.endsWith("/dashboard/products/egg-tray/performance")) return route.fulfill({ json: {
      product: egg, previous: { ...egg, revenue: 30000, unitsSold: 3 },
      trend: [{ label: "2026-10-02", units: 5, revenue: 50000, grossProfit: 12000 }],
      recentSales: [{ id: "line-1", saleId: "sale-1", receiptNumber: 42, createdAt: "2026-10-02T08:00:00.000Z", quantity: 2, unitPrice: 10000, totalPrice: 20000, knownCostGrossProfit: 6000, paymentMethod: "CASH", pricingTier: "RETAIL", channel: "POS" }],
    } });
    if (url.pathname.endsWith("/subscription/status")) return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    if (url.pathname.includes("/products/low-stock")) return route.fulfill({ json: { products: [] } });
    if (url.pathname.endsWith("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    return route.fulfill({ json: {} });
  });

  await page.goto("/profit/products");
  await expect(page.getByRole("heading", { name: "Product performance" })).toBeVisible();
  await expect(page.getByText("Egg tray").first()).toBeVisible();
  await page.getByRole("button", { name: "Compare", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Compare products" })).toBeVisible();
  await page.getByRole("button", { name: "Egg tray", exact: true }).click();
  await expect(page.getByText("80%", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("DP-000042")).toBeVisible();
  await page.getByRole("textbox", { name: "Search products" }).fill("egg");
  await expect.poll(() => lastSearch).toBe("egg");
  await expect(page.getByText("1 products")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("product-performance-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("product-performance-desktop.png"), fullPage: true });
});
