import { expect, test } from "@playwright/test";

test("owner enables sale-specific prices and checkout uses the chosen wholesale amount", async ({ page }) => {
  let variablePricesEnabled = false;
  let savedSale: Record<string, unknown> | null = null;
  const product = { id: "eggs", name: "Tray of 30 eggs", unit: "tray", sellingPrice: 12000, wholesalePrice: 11000, buyingPrice: 8500, currentStock: 8, doesNotExpire: true };

  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/.*\/_?api\/.*/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/_?api/, "");
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/me") return json({ user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Poultry", category: "livestock" }, features: {} } });
    if (path === "/settings/sale-pricing" && request.method() === "PATCH") {
      variablePricesEnabled = Boolean((request.postDataJSON() as { allowVariableSalePrices: boolean }).allowVariableSalePrices);
      return json({ allowVariableSalePrices: variablePricesEnabled });
    }
    if (path === "/settings") return json({ settings: { id: "owner-1", name: "Amina", phone: "+255700000001", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Poultry", location: "Dar es Salaam", category: "livestock", isCatalogPublished: false, hiddenMenuItems: [], allowVariableSalePrices: variablePricesEnabled } } });
    if (path === "/products" && request.method() === "GET") return json({ products: [product], pagination: { page: 1, total: 1 } });
    if (path === "/sales" && request.method() === "POST") {
      savedSale = request.postDataJSON() as Record<string, unknown>;
      return json({ sale: { id: "sale-1", receiptNumber: 12, totalAmount: 10500, profit: 2000, paymentMethod: "CASH", createdAt: new Date().toISOString(), items: [{ quantity: 1, unitPrice: 10500, totalPrice: 10500, product: { id: product.id, name: product.name, unit: product.unit } }] } }, 201);
    }
    if (path === "/products/low-stock") return json({ products: [], total: 0 });
    if (path === "/subscription/status") return json({ status: "active", isActive: true, daysLeft: 30 });
    if (path === "/notifications") return json({ unreadCount: 0, notifications: [] });
    if (path === "/push/preferences") return json({ preferences: { lowStock: false, debtDue: false, subscriptionExpiry: false, dailyAssistant: false, privatePreview: true }, subscriptions: [], pushConfigured: false });
    if (path === "/debts/customers") return json({ customers: [] });
    if (path === "/barcodes/settings") return json({ settings: { barcodeScanningEnabled: false } });
    return json({});
  });

  await page.goto("/sales");
  await page.locator("button").filter({ hasText: product.name }).click();
  await expect(page.getByRole("textbox", { name: `Unit price for ${product.name}` })).toHaveCount(0);

  await page.goto("/settings");
  const setting = page.getByRole("checkbox", { name: /Allow price changes at checkout/ });
  await expect(setting).not.toBeChecked();
  await setting.check();
  await expect(page.getByText("Sale pricing setting saved.")).toBeVisible();
  expect(variablePricesEnabled).toBe(true);

  await page.goto("/sales");
  await page.getByRole("button", { name: "Wholesale" }).click();
  await page.locator("button").filter({ hasText: product.name }).click();
  const price = page.getByRole("textbox", { name: `Unit price for ${product.name}` });
  await expect(price).toHaveValue("11,000");
  await price.fill("10500");
  await expect(page.getByRole("button", { name: `Reset price for ${product.name}` })).toBeVisible();
  await page.getByRole("button", { name: /Complete sale/i }).click();
  await expect.poll(() => savedSale).not.toBeNull();
  expect(savedSale).toMatchObject({ saleMode: "WHOLESALE", items: [{ productId: product.id, quantity: 1, unitPrice: 10500 }] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.goto("/settings");
  await page.getByRole("checkbox", { name: /Allow price changes at checkout/ }).uncheck();
  await expect(page.getByText("Sale pricing setting saved.")).toBeVisible();
  await page.goto("/sales");
  await page.locator("button").filter({ hasText: product.name }).click();
  await expect(page.getByRole("textbox", { name: `Unit price for ${product.name}` })).toHaveCount(0);
});
