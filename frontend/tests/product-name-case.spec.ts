import { test, expect } from "@playwright/test";

test("owner can choose reversible product-name display without changing stored names", async ({ page }) => {
  let productNameCase = "ORIGINAL";
  const product = { id: "p1", name: "Mchele Super", sku: "RICE1", unit: "kg", buyingPrice: 2000, sellingPrice: 3000, currentStock: 20, minimumStock: 2, isActive: true, doesNotExpire: true };
  await page.addInitScript(() => localStorage.setItem("dukapilot_token", "demo-token"));
  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me")) return route.fulfill({ json: { user: { id: "u1", name: "Owner", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Shop", productNameCase } } } });
    if (url.pathname.endsWith("/settings/product-name-case")) {
      productNameCase = route.request().postDataJSON().productNameCase;
      return route.fulfill({ json: { productNameCase } });
    }
    if (url.pathname.endsWith("/settings")) return route.fulfill({ json: { settings: { id: "u1", name: "Owner", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Shop", location: "Dar", category: "grocery", isCatalogPublished: true, productNameCase } } } });
    if (url.pathname.endsWith("/products/summary")) return route.fulfill({ json: { summary: { total: 1, lowStock: 0, outOfStock: 0, inStock: 1, expiringSoon: 0, expired: 0 } } });
    if (url.pathname.endsWith("/products")) return route.fulfill({ json: { products: [product], pagination: { total: 1, page: 1, totalPages: 1 } } });
    if (url.pathname.endsWith("/subscription/status")) return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    if (url.pathname.endsWith("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (url.pathname.endsWith("/push/preferences")) return route.fulfill({ json: { preferences: {}, subscriptions: [], pushConfigured: false } });
    if (url.pathname.endsWith("/suppliers")) return route.fulfill({ json: { suppliers: [] } });
    return route.fulfill({ json: { settings: {}, products: [] } });
  });
  await page.goto("/settings");
  const selector = page.getByLabel("Product name letter case");
  await expect(selector).toHaveValue("ORIGINAL");
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(selector).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await selector.selectOption("UPPERCASE");
  await expect(page.getByText("Setting saved.")).toBeVisible();
  await page.goto("/inventory");
  const name = page.locator(".product-name").filter({ hasText: "Mchele Super" }).first();
  await expect(name).toBeVisible();
  await expect(name).toHaveCSS("text-transform", "uppercase");
  await expect(name).toHaveText("Mchele Super");
  await page.getByRole("button", { name: "Actions for Mchele Super" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Product Name *", { exact: true })).toHaveValue("Mchele Super");
  await page.goto("/settings");
  await expect(selector).toHaveValue("UPPERCASE");
  await selector.selectOption("LOWERCASE");
  await expect(page.getByText("Setting saved.")).toBeVisible();
  await page.goto("/inventory");
  await expect(name).toHaveCSS("text-transform", "lowercase");
  await expect(name).toHaveText("Mchele Super");
  await page.goto("/settings");
  await selector.selectOption("ORIGINAL");
  await expect(page.getByText("Setting saved.")).toBeVisible();
  await page.goto("/inventory");
  await expect(name).toHaveCSS("text-transform", "none");
  expect(product.name).toBe("Mchele Super");
});
