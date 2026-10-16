import { expect, test } from "@playwright/test";

test("receiving searches the full product catalog and prevents adding the same product twice", async ({ page }) => {
  const productSearchQueries: string[] = [];
  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-owner-token");
    window.localStorage.setItem("dukapilot_language", "en");
  });
  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    const apiPathIndex = Math.max(url.pathname.indexOf("/_api/"), url.pathname.indexOf("/api/"));
    const apiPrefixLength = url.pathname.startsWith("/_api/", apiPathIndex) ? 6 : 5;
    const path = apiPathIndex >= 0 ? `/${url.pathname.slice(apiPathIndex + apiPrefixLength)}` : url.pathname;
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

test("matching supplier and invoice pre-fills the remaining quantities from an order", async ({ page }) => {
  let receiveRequests = 0;
  const matchedOrder = {
    id: "order-match-12345678",
    status: "PENDING",
    invoiceNumber: "INV-0042",
    supplier: { id: "supplier-private-1", name: "Local Supplier", phone: null },
    items: [{
      productId: "product-oil-1",
      quantity: 12,
      receivedQuantity: 4,
      unitPrice: 2500,
      product: { id: "product-oil-1", name: "Cooking Oil", unit: "bottle", buyingPrice: 2500 },
    }],
  };
  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-owner-token");
    window.localStorage.setItem("dukapilot_language", "en");
  });
  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    const apiPathIndex = Math.max(url.pathname.indexOf("/_api/"), url.pathname.indexOf("/api/"));
    const apiPrefixLength = url.pathname.startsWith("/_api/", apiPathIndex) ? 6 : 5;
    const path = apiPathIndex >= 0 ? `/${url.pathname.slice(apiPathIndex + apiPrefixLength)}` : url.pathname;
    if (path === "/auth/me") return route.fulfill({ json: { user: { name: "Owner", role: "MERCHANT", language: "en", shop: { name: "Test Shop" } } } });
    if (path === "/products/low-stock") return route.fulfill({ json: { products: [], total: 0 } });
    if (path === "/subscription/status") return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    if (path === "/notifications") return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (path === "/products") {
      if (url.searchParams.get("search")) return route.fulfill({ json: { products: [{ id: "product-extra", name: "Sugar", unit: "kg", buyingPrice: 3000 }] } });
      return route.fulfill({ json: { products: [] } });
    }
    if (path === "/suppliers") return route.fulfill({ json: { suppliers: [{ id: "supplier-private-1", name: "Local Supplier", phone: null }] } });
    if (path === "/stock-receipts" && route.request().method() === "POST") {
      receiveRequests += 1;
      return route.fulfill({ json: { receipt: { id: "receipt-1", totalLandedCost: 20000 } } });
    }
    if (path === "/stock-receipts") return route.fulfill({ json: { receipts: [] } });
    if (path === "/orders/match") {
      expect(url.searchParams.get("supplierId")).toBe("supplier-private-1");
      expect(url.searchParams.get("invoiceNumber")).toBe("INV-0042");
      return route.fulfill({ json: { orders: [matchedOrder] } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/receiving");
  await page.getByRole("combobox", { name: "Supplier (optional)" }).selectOption("supplier-private-1");
  await page.getByRole("textbox", { name: "Invoice number (optional)" }).fill("INV-0042");

  await expect(page.getByText(/Matched order #.*Only delivered quantities increase stock/)).toBeVisible();
  await expect(page.getByText("Cooking Oil", { exact: true })).toBeVisible();
  const quantity = page.getByRole("spinbutton", { name: "Quantity" });
  await expect(quantity).toHaveValue("8");
  await expect(quantity).toHaveAttribute("max", "8");
  await quantity.fill("9");
  await page.getByRole("button", { name: "Receive stock" }).click();
  await expect.poll(() => receiveRequests).toBe(0);
  await page.getByRole("searchbox", { name: "Search products to add" }).fill("Sugar");
  await expect(page.getByText("An order receipt can include only items on that order. Receive extra items on a separate receipt.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Sugar.*Add/ })).toHaveCount(0);
});
