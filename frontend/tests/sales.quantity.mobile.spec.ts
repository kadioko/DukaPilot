import { expect, test } from "@playwright/test";

test("cart quantity is editable without squeezing controls off a 375px phone", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.addInitScript(() => localStorage.setItem("dukapilot_session_active", "1"));
  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/me")) return route.fulfill({ json: { user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Shop" }, features: {} } } });
    if (url.includes("/products/low-stock")) return route.fulfill({ json: { products: [] } });
    if (url.includes("/subscription/status")) return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    if (url.includes("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (url.includes("/debts/customers")) return route.fulfill({ json: { customers: [] } });
    if (url.includes("/settings") || url.includes("/barcodes/settings")) return route.fulfill({ json: { settings: {} } });
    if (url.includes("/products?")) return route.fulfill({ json: { products: [{ id: "p-1", name: "Maize Flour 1kg", unit: "pcs", sellingPrice: 3200, buyingPrice: 2000, currentStock: 5, doesNotExpire: true }], pagination: { total: 1 } } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/sales");
  await page.locator("button").filter({ hasText: "Maize Flour 1kg" }).click();
  const quantity = page.getByRole("spinbutton", { name: "Quantity for Maize Flour 1kg" });
  await quantity.fill("3");
  await quantity.blur();
  await expect(quantity).toHaveValue("3");
  await page.getByRole("button", { name: "Increase quantity of Maize Flour 1kg" }).click();
  await expect(quantity).toHaveValue("4");
  const bounds = await quantity.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: testInfo.outputPath("mobile-cart.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: testInfo.outputPath("mobile-cart-390.png") });
});
