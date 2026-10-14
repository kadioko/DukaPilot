import { expect, test } from "@playwright/test";

test("inventory CSV export lets owners choose fields and includes products from every page", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-owner-token");
    window.localStorage.setItem("dukapilot_language", "en");
  });

  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/auth/me")) {
      return route.fulfill({ json: { user: { name: "Owner", role: "MERCHANT", language: "en", shop: { name: "Test Shop" } } } });
    }
    if (path.endsWith("/products/summary")) return route.fulfill({ json: { summary: { total: 2, lowStock: 0, outOfStock: 0, inStock: 2, expiringSoon: 0, expired: 0 } } });
    if (path.endsWith("/products")) {
      const pageNumber = Number(url.searchParams.get("page") || 1);
      const limit = Number(url.searchParams.get("limit") || 50);
      const products = [
        { id: "p1", name: "=Danger Product", sku: "SKU-1", unit: "pcs", currentStock: 8, minimumStock: 2, buyingPrice: 100, sellingPrice: 150, supplier: { name: "Supplier One" }, isActive: true },
        { id: "p2", name: "Second Product", sku: "SKU-2", unit: "bag", currentStock: 4, minimumStock: 1, buyingPrice: 700, sellingPrice: 950, supplier: null, isActive: true },
      ];
      if (limit === 200) {
        return route.fulfill({ json: { products: [products[pageNumber - 1]], pagination: { page: pageNumber, limit, total: 2, totalPages: 2 } } });
      }
      return route.fulfill({ json: { products: [products[0]], pagination: { page: 1, limit: 50, total: 1, totalPages: 1 } } });
    }
    if (path.endsWith("/suppliers")) return route.fulfill({ json: { suppliers: [] } });
    if (path.endsWith("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (path.endsWith("/subscription/status")) return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    return route.fulfill({ json: {} });
  });

  await page.goto("/inventory");
  await page.getByRole("button", { name: "Export inventory CSV" }).click();
  await expect(page.getByRole("heading", { name: "Export inventory to CSV" })).toBeVisible();
  await page.getByRole("button", { name: "Clear all" }).click();
  await page.getByRole("checkbox", { name: "Product name" }).check();
  await page.getByRole("checkbox", { name: "Stock on hand" }).check();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^dukapilot-inventory-\d{4}-\d{2}-\d{2}\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString("utf8");
  expect(csv).toContain('"product_name","stock_on_hand"');
  expect(csv).toContain('"\'=Danger Product","8"');
  expect(csv).toContain('"Second Product","4"');
  expect(csv).not.toContain("selling_price_tzs");
});

test("stock-only staff can export inventory without financial fields", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-stock-staff-token");
    window.localStorage.setItem("dukapilot_language", "en");
  });
  await page.route("**/*api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { user: { name: "Stock Staff", role: "MERCHANT", language: "en", shop: { name: "Test Shop" }, staff: { role: "CASHIER", permissions: { canManageStock: true, canViewReports: false } } } } });
    if (path.endsWith("/products/summary")) return route.fulfill({ json: { summary: { total: 0, lowStock: 0, outOfStock: 0, inStock: 0, expiringSoon: 0, expired: 0 } } });
    if (path.endsWith("/products")) return route.fulfill({ json: { products: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } } });
    if (path.endsWith("/suppliers")) return route.fulfill({ json: { suppliers: [] } });
    if (path.endsWith("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (path.endsWith("/subscription/status")) return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    return route.fulfill({ json: {} });
  });

  await page.goto("/inventory");
  await page.getByRole("button", { name: "Export inventory CSV" }).click();
  await expect(page.getByRole("checkbox", { name: "Stock on hand" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Buying price (TZS)" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Selling price (TZS)" })).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Wholesale price (TZS)" })).toHaveCount(0);
});
