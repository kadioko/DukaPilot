import { expect, test } from "@playwright/test";

for (const mode of ["stock", "prices"] as const) {
  test(`${mode} view-only staff can browse without editing or selling`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
    const requests: string[] = [];
    await page.route(/.*\/_?api\/.*/, async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/^.*\/_?api/, "");
      requests.push(`${route.request().method()} ${path}${url.search}`);
      const json = (body: unknown) => route.fulfill({ json: body });
      if (path === "/auth/me") return json({ user: { id: "owner", name: "Stock staff", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Test shop" }, staff: { id: "staff-1", role: "CASHIER", permissions: { canSell: false, canManageStock: false, canViewStock: mode === "stock", canViewSalePrices: mode === "prices", canViewReports: false } }, features: {} } });
      if (path === "/products/summary") return json({ summary: { total: 1, lowStock: 1, outOfStock: 0, inStock: 1, expiringSoon: 1, expired: 0 } });
      if (path === "/products/low-stock") return json({ products: [], total: 0 });
      if (path === "/products") return json({ products: [{ id: "p", name: "Rice", unit: "kg", currentStock: 2, minimumStock: 5, expiryDate: "2026-11-20T12:00:00.000Z", doesNotExpire: false, buyingPrice: null, sellingPrice: null }], pagination: { page: 1, total: 1, totalPages: 1 } });
      if (path === "/products/prices") return json({ products: [{ id: "p", name: "Rice", unit: "kg", sku: "R1", sellingPrice: 3000, wholesalePrice: 2500, wholesaleMinQty: 5 }], pagination: { page: 1, totalPages: 1 } });
      if (path === "/subscription/status") return json({ status: "active", daysLeft: 30 });
      if (path === "/notifications") return json({ unreadCount: 0, items: [] });
      return json({});
    });
    await page.goto(mode === "stock" ? "/inventory" : "/sale-prices");
    await expect(page.getByText("Rice").first()).toBeVisible();
    if (mode === "stock") {
      await page.getByRole("button", { name: /low stock/i }).click();
      await expect.poll(() => requests.some((r) => r.includes("stockStatus=LOW"))).toBe(true);
      await page.getByLabel(/expiry/i).selectOption("EXPIRING_SOON");
      await expect.poll(() => requests.some((r) => r.includes("expiryStatus=EXPIRING_SOON"))).toBe(true);
      await expect(page.getByRole("button", { name: /restock|actions for rice|add product/i })).toHaveCount(0);
      await expect(page.getByText(/buying price|selling price/i)).toHaveCount(0);
      expect(requests.some((r) => r.includes("/suppliers"))).toBe(false);
    } else {
      await expect(page.getByText(/Wholesale:.*2,500/)).toBeVisible();
      await expect(page.getByText(/Retail:.*3,000/)).toBeVisible();
      await expect(page.getByRole("button", { name: /complete sale|add to cart/i })).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("a cashier without reports can sell using the wholesale price", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  const product = { id: "p", name: "Egg tray", unit: "tray", sellingPrice: 12000, wholesalePrice: 11000, wholesaleMinQty: 1, buyingPrice: null, currentStock: 8, doesNotExpire: true };
  let sale: Record<string, unknown> | null = null;
  await page.route(/.*\/_?api\/.*/, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/_?api/, "");
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (path === "/auth/me") return json({ user: { id: "owner", name: "Cashier", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Test shop" }, staff: { id: "staff-1", role: "CASHIER", permissions: { canSell: true, canManageStock: false, canViewReports: false } }, features: {} } });
    if (path === "/settings") return json({ settings: { shop: { name: "Test shop", allowVariableSalePrices: false } } });
    if (path === "/products") return json({ products: [product], pagination: { page: 1, total: 1, totalPages: 1 } });
    if (path === "/sales" && route.request().method() === "POST") { sale = route.request().postDataJSON(); return json({ sale: { id: "sale-1", receiptNumber: 1, totalAmount: 11000, paymentMethod: "CASH", createdAt: new Date().toISOString(), items: [] } }, 201); }
    if (path === "/products/low-stock") return json({ products: [], total: 0 });
    if (path === "/subscription/status") return json({ status: "active", daysLeft: 30 });
    if (path === "/notifications") return json({ unreadCount: 0, items: [] });
    if (path === "/debts/customers") return json({ customers: [] });
    if (path === "/barcodes/settings") return json({ settings: { barcodeScanningEnabled: false } });
    return json({});
  });
  await page.goto("/sales");
  await page.getByRole("button", { name: "Wholesale", exact: true }).click();
  await page.getByRole("button", { name: /Egg tray/ }).click();
  await page.getByRole("button", { name: /Complete sale/i }).click();
  await expect.poll(() => sale).not.toBeNull();
  expect(sale).toMatchObject({ saleMode: "WHOLESALE", items: [{ productId: "p", quantity: 1, unitPrice: 11000 }] });
});
