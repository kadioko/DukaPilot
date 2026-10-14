import { expect, test } from "@playwright/test";

test("receiving searches the full product catalog and prevents adding the same product twice", async ({ page }) => {
  const productSearchQueries: string[] = [];
  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-owner-token");
    window.localStorage.setItem("dukapilot_language", "en");
  });
  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    const apiPathIndex = url.pathname.indexOf("/api/");
    const path = apiPathIndex >= 0 ? url.pathname.slice(apiPathIndex + 4) : url.pathname;
    if (path === "/auth/me") {
      return route.fulfill({ json: { user: { name: "Owner", role: "MERCHANT", language: "en", shop: { name: "Test Shop" } } } });
    }
    if (path === "/products/low-stock") return route.fulfill({ json: { products: [], total: 0 } });
    if (path === "/subscription/status") return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    if (path === "/notifications") return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (path === "/products") {
      const search = url.searchParams.get("search");
      if (search) {
        productSearchQueries.push(search);
        return route.fulfill({ json: { products: [{ id: "catalog-page-900", name: "Layer Feed Premium", sku: "LAYER-900", unit: "bag", buyingPrice: 42000, supplier: null }] } });
      }
      return route.fulfill({ json: { products: [] } });
    }
    if (path === "/suppliers") return route.fulfill({ json: { suppliers: [] } });
    if (path === "/stock-receipts") return route.fulfill({ json: { receipts: [] } });
    return route.fulfill({ json: {} });
  });

  await page.goto("/receiving");
  await expect(page.getByRole("heading", { name: "Receive Stock" })).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search products to add" });
  await search.fill("LAYER-900");
  await expect(page.getByRole("button", { name: /Layer Feed Premium.*LAYER-900.*Add/ })).toBeVisible();
  expect(productSearchQueries).toContain("LAYER-900");

  await page.getByRole("button", { name: /Layer Feed Premium.*LAYER-900.*Add/ }).click();
  await expect(page.getByText("Layer Feed Premium", { exact: true })).toBeVisible();
  await search.fill("LAYER-900");
  await expect(page.getByText("No matching products left to add.")).toBeVisible();
  await expect(page.locator("main").getByText("Layer Feed Premium", { exact: true })).toHaveCount(1);
});
