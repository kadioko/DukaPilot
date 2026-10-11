import { expect, test } from "@playwright/test";

async function mockSalesShell(page: import("@playwright/test").Page, productStatus: number) {
  await page.addInitScript(() => localStorage.setItem("dukapilot_session_active", "1"));
  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/me")) return route.fulfill({ json: { user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en", businessShopId: "shop-1", shop: { id: "shop-1", name: "Amina Shop" }, features: { staff: true, assistant: true } } } });
    if (url.includes("/products/low-stock")) return route.fulfill({ json: { products: [] } });
    if (url.includes("/subscription/status")) return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    if (url.includes("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (url.includes("/debts/customers")) return route.fulfill({ json: { customers: [] } });
    if (url.includes("/settings") || url.includes("/barcodes/settings")) return route.fulfill({ json: { settings: {} } });
    if (url.includes("/products?")) return route.fulfill({ status: productStatus, contentType: "application/json", body: JSON.stringify({ error: productStatus === 403 ? "Forbidden" : "Internal server error" }) });
    if (url.includes("/sales?limit=20")) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Service unavailable" }) });
    return route.fulfill({ json: {} });
  });
}

test("sales distinguishes a temporary server failure from a connection outage", async ({ page }) => {
  await mockSalesShell(page, 503);
  const unhandled: string[] = [];
  page.on("pageerror", (error) => unhandled.push(error.message));

  await page.goto("/sales");
  await expect(page.getByRole("alert").filter({ hasText: /temporary server problem/i })).toBeVisible();
  await expect(page.getByText(/unable to reach the dukapilot server/i)).toHaveCount(0);

  await page.getByRole("button", { name: /history/i }).click();
  await expect(page.getByRole("alert").filter({ hasText: /temporary server problem/i })).toBeVisible();
  expect(unhandled).toEqual([]);
});

test("sales explains permission errors without claiming the server is unavailable", async ({ page }) => {
  await mockSalesShell(page, 403);

  await page.goto("/sales");
  await expect(page.getByRole("alert").filter({ hasText: /do not have permission/i })).toBeVisible();
  await expect(page.getByText(/temporarily unavailable|unable to reach the dukapilot server/i)).toHaveCount(0);
});

test("sale retries a transient network failure with the same idempotency reference", async ({ page }) => {
  const product = {
    id: "prod-1", name: "Test item", unit: "pcs", sellingPrice: 3200,
    buyingPrice: 2800, currentStock: 5, doesNotExpire: true, expiryDate: null,
  };
  const clientReferences: string[] = [];
  let attempts = 0;

  await page.addInitScript(() => localStorage.setItem("dukapilot_session_active", "1"));
  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/me")) return route.fulfill({ json: { user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Shop" }, features: { staff: true } } } });
    if (url.includes("/products/low-stock")) return route.fulfill({ json: { products: [] } });
    if (url.includes("/subscription/status")) return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    if (url.includes("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (url.includes("/debts/customers")) return route.fulfill({ json: { customers: [] } });
    if (url.includes("/settings") || url.includes("/barcodes/settings")) return route.fulfill({ json: { settings: {} } });
    if (url.includes("/products?")) return route.fulfill({ json: { products: [product], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } } });
    if (url.includes("/sales") && route.request().method() === "POST") {
      attempts += 1;
      const body = route.request().postDataJSON();
      clientReferences.push(body.clientReference);
      if (attempts === 1) return route.abort("failed");
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ sale: { id: "sale-1", receiptNumber: 7, totalAmount: 3200, profit: 400, paymentMethod: "CASH", createdAt: "2026-10-11T09:00:00.000Z", shop: { name: "Amina Shop" }, items: [{ quantity: 1, unitPrice: 3200, totalPrice: 3200, product: { name: product.name, unit: product.unit } }] } }),
      });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/sales");
  await page.getByRole("button", { name: /Test item/ }).click();
  await page.getByRole("button", { name: /complete/i }).click();

  await expect(page.getByText("DP-000007", { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
  expect(clientReferences[0]).toBeTruthy();
  expect(clientReferences[1]).toBe(clientReferences[0]);
  await expect(page.getByText(/offline\. sale saved|offline sales sync/i)).toHaveCount(0);
});
