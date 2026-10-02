import { expect, test } from "@playwright/test";

test("sales history searches, filters, paginates, and fits a phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => window.localStorage.setItem("dukapilot_token", "playwright-merchant-token"));

  await page.route("**/*api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: { name: "Test Merchant", role: "MERCHANT", language: "en", shop: { name: "Test Shop" }, features: { staff: true } } }),
  }));
  await page.route("**/*api/products/low-stock*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [] }) }));
  await page.route("**/*api/subscription/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "active", daysLeft: 30 }) }));
  await page.route("**/*api/notifications", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], unreadCount: 0 }) }));
  await page.route("**/*api/debts/customers", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ customers: [] }) }));
  await page.route("**/*api/settings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ settings: { shop: { name: "Test Shop" } } }) }));
  await page.route("**/*api/barcodes/settings", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ settings: { barcodeScanningEnabled: false } }) }));
  await page.route("**/*api/products?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 1 } }) }));

  const historyRequests: URL[] = [];
  await page.route("**/*api/sales?*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    historyRequests.push(new URL(route.request().url()));
    const offset = Number(new URL(route.request().url()).searchParams.get("offset") || 0);
    const sales = Array.from({ length: offset === 0 ? 20 : 5 }, (_, index) => ({
      id: `sale-${offset + index}`,
      receiptNumber: offset + index + 1,
      totalAmount: 2500,
      profit: 500,
      paymentMethod: "MPESA",
      status: "COMPLETED",
      customerName: "Asha",
      customerPhone: "+255712345678",
      createdAt: "2026-10-02T08:00:00.000Z",
      items: [{ quantity: 1, unitPrice: 2500, totalPrice: 2500, name: "Unga wa sembe", product: { id: "product-1", name: "Unga wa sembe", unit: "kg" } }],
    }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sales, total: 25, limit: 20, offset }) });
  });

  await page.goto("/sales");
  await page.getByRole("button", { name: "Sales History" }).click();
  await expect(page.getByText("DP-000001")).toBeVisible();

  await page.getByRole("textbox", { name: "Search sales" }).fill("Asha");
  await expect.poll(() => historyRequests.at(-1)?.searchParams.get("search")).toBe("Asha");
  await page.getByLabel("Payment").selectOption("MPESA");
  await expect.poll(() => historyRequests.at(-1)?.searchParams.get("paymentMethod")).toBe("MPESA");
  await page.getByLabel("Status").selectOption("VOIDED");
  await expect.poll(() => historyRequests.at(-1)?.searchParams.get("status")).toBe("VOIDED");
  await page.locator('input[type="date"]').nth(0).fill("2026-10-01");
  await page.locator('input[type="date"]').nth(1).fill("2026-10-02");
  await expect.poll(() => historyRequests.at(-1)?.searchParams.get("from")).toBe("2026-09-30T21:00:00.000Z");
  await expect.poll(() => historyRequests.at(-1)?.searchParams.get("to")).toBe("2026-10-02T20:59:59.999Z");

  await page.getByRole("button", { name: "Next page" }).click();
  await expect.poll(() => historyRequests.at(-1)?.searchParams.get("offset")).toBe("20");
  await expect(page.getByText("Showing 21-25 of 25")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
