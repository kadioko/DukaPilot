import { expect, test } from "@playwright/test";

test("offline sales stay isolated to the authenticated shop and staff identity", async ({ page }) => {
  let identity = { id: "owner-a", businessShopId: "shop-a", shop: { id: "shop-a", name: "Shop A" } };
  const product = { id: "prod-1", name: "Sukari", unit: "pcs", sellingPrice: 3000, buyingPrice: 2500, currentStock: 5, doesNotExpire: true };

  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/auth/me")) return route.fulfill({ json: { user: { ...identity, role: "MERCHANT", language: "en", features: { staff: true, assistant: true, exports: true } } } });
    if (url.includes("/products?")) return route.fulfill({ json: { products: [product], pagination: { total: 1 } } });
    if (url.endsWith("/debts/customers")) return route.fulfill({ json: { customers: [] } });
    if (url.endsWith("/settings")) return route.fulfill({ json: { settings: { shop: { name: identity.shop.name } } } });
    if (url.endsWith("/sales") && route.request().method() === "POST") return route.abort("failed");
    if (url.endsWith("/subscription/status")) return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    if (url.includes("/products/low-stock")) return route.fulfill({ json: { products: [], total: 0 } });
    if (url.endsWith("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    return route.fulfill({ json: { items: [], sales: [], unreadCount: 0 } });
  });

  await page.goto("/sales");
  await page.locator("button").filter({ hasText: "Sukari" }).click();
  await page.getByRole("button", { name: /complete sale/i }).click();
  await expect(page.getByText(/1 pending sync/i)).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("dukapilot_pending_sales:shop-a_shop-a_owner-a") || "[]").length)).toBe(1);

  identity = { id: "owner-b", businessShopId: "shop-b", shop: { id: "shop-b", name: "Shop B" } };
  await page.reload();
  await expect(page.getByText(/1 pending sync/i)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("dukapilot_pending_sales:shop-b_shop-b_owner-b"))).toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("dukapilot_pending_sales:shop-a_shop-a_owner-a") || "[]").length)).toBe(1);
});
