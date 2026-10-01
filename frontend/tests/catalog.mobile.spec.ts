import { expect, test } from "@playwright/test";

test("mobile catalog keeps the header readable and distinguishes shops with the same name", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  await page.route("**/*api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/public/shops")) {
      return route.fulfill({ json: { shops: [
        { id: "shop1", name: "CEEDY COLLECTION", location: "Morogoro", district: "Kilosa", category: "clothing", productCount: 2 },
        { id: "shop2", name: "CEEDY COLLECTION", location: "Iringa", district: "Iringa", category: "clothing", productCount: 1 },
      ] } });
    }
    if (path.endsWith("/public/products")) {
      return route.fulfill({ json: { products: [
        { id: "p1", name: "Jeans", unit: "pcs", sellingPrice: 22000, currentStock: 3, shop: { id: "shop1", name: "CEEDY COLLECTION", location: "Morogoro", category: "clothing" } },
        { id: "p2", name: "Shirt", unit: "pcs", sellingPrice: 18000, currentStock: 4, shop: { id: "shop2", name: "CEEDY COLLECTION", location: "Iringa", category: "clothing" } },
      ], pagination: { hasMore: false } } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/catalog?lang=en");
  await expect(page.getByRole("heading", { name: "Shop products near you" })).toBeVisible();
  await expect(page.getByText("Available Products", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Own a shop? Log in to sell" })).toBeVisible();
  await expect(page.getByText("Morogoro · Kilosa · #SHOP1")).toBeVisible();
  await expect(page.getByText("Iringa · Iringa · #SHOP2")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
