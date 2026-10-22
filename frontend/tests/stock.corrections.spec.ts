import { expect, test } from "@playwright/test";

test("owner opens an older receipt from stock history and submits a linked correction", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("dukapilot_token", "playwright-owner-token");
    localStorage.setItem("dukapilot_language", "en");
  });
  let posted: Record<string, unknown> | null = null;
  const receipt = {
    id: "receipt-old", invoiceNumber: "INV-44", note: null, receivedAt: "2026-10-01T09:00:00.000Z",
    totalLandedCost: 200, paidAtReceipt: 0, paymentMethod: "CREDIT", transportCost: 0, otherCost: 0,
    estimatedAllocation: false, supplier: { id: "supplier-1", name: "Local Supplier" },
    items: [{ id: "item-1", quantity: 2, landedUnitCost: 100, product: { name: "Soap", unit: "pcs" } }],
    stockCorrections: [],
  };
  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*?\/(?:_api|api)\//, "/");
    if (path === "/auth/me") return route.fulfill({ json: { user: { role: "MERCHANT", shop: { name: "Test Shop" } } } });
    if (path === "/subscription/status") return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    if (path === "/notifications") return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (path === "/products/low-stock") return route.fulfill({ json: { products: [], total: 0 } });
    if (path === "/products") return route.fulfill({ json: { products: [] } });
    if (path === "/suppliers") return route.fulfill({ json: { suppliers: [] } });
    if (path === "/stock-receipts") return route.fulfill({ json: { receipts: [] } });
    if (path === "/stock-receipts/receipt-old" && route.request().method() === "GET") return route.fulfill({ json: { receipt } });
    if (path === "/stock-receipts/receipt-old/corrections" && route.request().method() === "POST") {
      posted = route.request().postDataJSON();
      receipt.items[0].quantity = 1;
      receipt.totalLandedCost = 100;
      receipt.stockCorrections.push({ id: "correction-1", reason: "Counted twice", createdAt: "2026-10-22T10:00:00.000Z", before: { items: [{ id: "item-1", quantity: 2 }], totalLandedCost: 200 }, after: { items: [{ id: "item-1", quantity: 1 }], totalLandedCost: 100 } } as never);
      return route.fulfill({ status: 201, json: { correction: { id: "correction-1" }, reused: false } });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/receiving?receipt=receipt-old");
  await expect(page.getByText("INV-44")).toBeVisible();
  await page.getByRole("button", { name: "Correct receipt" }).click();
  await page.getByRole("spinbutton", { name: "Soap correct quantity" }).fill("1");
  await page.getByRole("textbox", { name: "Correction reason" }).fill("Counted twice");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect.poll(() => posted).not.toBeNull();
  expect((posted as unknown as { items: Array<{ quantity: number }> }).items[0].quantity).toBe(1);
  await expect(page.getByText("Counted twice")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("owner reverses a manual stock-history entry with a reason", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("dukapilot_token", "playwright-owner-token"); localStorage.setItem("dukapilot_language", "en"); });
  page.on("dialog", (dialog) => void dialog.accept());
  let reversed = false;
  let posted: Record<string, unknown> | null = null;
  await page.route("**/*api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^.*?\/(?:_api|api)\//, "/");
    if (path === "/auth/me") return route.fulfill({ json: { user: { role: "MERCHANT", shop: { name: "Test Shop" } } } });
    if (path === "/subscription/status") return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    if (path === "/notifications") return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (path === "/products/low-stock") return route.fulfill({ json: { products: [], total: 0 } });
    if (path === "/stock/movements/manual-1/reverse") { posted = route.request().postDataJSON(); reversed = true; return route.fulfill({ status: 201, json: { movement: { id: "reverse-1" }, reused: false } }); }
    if (path === "/stock/movements") return route.fulfill({ json: {
      movements: reversed ? [] : [{ id: "manual-1", type: "IN", quantity: 2, manualAdjustment: true, reversalOfId: null, reversal: null, note: "Count", createdAt: "2026-10-22T09:00:00.000Z", product: { id: "product-1", name: "Soap", unit: "pcs", currentStock: 5 } }],
      pagination: { page: 1, limit: 50, total: reversed ? 0 : 1, totalPages: reversed ? 0 : 1 },
    } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/stock-history");
  await page.getByRole("combobox", { name: "Entry to correct" }).selectOption("manual-1");
  await page.getByRole("textbox", { name: "Correction reason" }).fill("Counted twice");
  await page.getByRole("button", { name: "Reverse entry" }).click();
  await expect.poll(() => posted).not.toBeNull();
  expect((posted as unknown as { reason: string }).reason).toBe("Counted twice");
  await expect(page.getByText("No stock movements yet.")).toBeVisible();
});
