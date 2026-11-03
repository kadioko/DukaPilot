import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
  test(`sale prices stay readable at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
    await page.route(/.*\/_?api\/.*/, async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/^.*\/_?api/, "");
      const json = (body: unknown) => route.fulfill({ json: body });
      if (path === "/auth/me") return json({ user: { id: "owner", name: "Price staff", role: "MERCHANT", language: "en", shop: { id: "shop", name: "Demo shop" }, staff: { id: "staff", role: "CASHIER", permissions: { canViewSalePrices: true } }, features: {} } });
      if (path === "/products/prices") {
        const products = url.searchParams.get("search") === "missing" ? [] : [
          { id: "1", name: "Long product name with extra detail and a larger package size", unit: "pcs", sku: "SKU-123", sellingPrice: 22000, wholesalePrice: 20000, wholesaleMinQty: 12, promotionPrice: 19000, promotionStartsAt: "2020-01-01T00:00:00Z", promotionEndsAt: "2099-01-01T00:00:00Z" },
          { id: "2", name: "Everyday soap", unit: "bar", sku: null, sellingPrice: 1500, wholesalePrice: null, wholesaleMinQty: null },
        ];
        return json({ products, pagination: { page: 1, total: products.length, totalPages: 1 } });
      }
      if (path === "/notifications") return json({ unreadCount: 0, items: [] });
      if (path === "/subscription/status") return json({ status: "active", daysLeft: 30 });
      return json({});
    });
    await page.goto("/sale-prices");
    await expect(page.getByRole("heading", { name: /long product name/i })).toBeVisible();
    await expect(page.getByText("TZS 19,000")).toBeVisible();
    await expect(page.getByText("TZS 22,000")).toBeVisible();
    await expect(page.getByText("From 12 pcs")).toBeVisible();
    await expect(page.getByText("Not set")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`sale-prices-${viewport.width}.png`), fullPage: true });
    await page.getByLabel("Search products").fill("missing");
    await expect(page.getByText("No products found")).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByText("Everyday soap")).toBeVisible();
  });
}
