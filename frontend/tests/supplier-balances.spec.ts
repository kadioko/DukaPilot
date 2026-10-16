import { expect, test } from "@playwright/test";

test("supplier balances loads receipt history and records a partial payment against the receipt", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("dukapilot_token", "supplier-payables-owner-token");
    localStorage.setItem("dukapilot_language", "en");
  });
  let savedPayment: Record<string, unknown> | null = null;
  let savedCorrection: Record<string, unknown> | null = null;
  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    const marker = Math.max(url.pathname.indexOf("/_api/"), url.pathname.indexOf("/api/"));
    const prefixLength = url.pathname.startsWith("/_api/", marker) ? 6 : 5;
    const path = marker >= 0 ? `/${url.pathname.slice(marker + prefixLength)}` : url.pathname;
    if (path === "/auth/me") return route.fulfill({ json: { user: { id: "owner-1", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Shop" } } } });
    if (path === "/subscription/status") return route.fulfill({ json: { status: "active", daysLeft: 20 } });
    if (path === "/notifications") return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (path === "/supplier-payables" && route.request().method() === "GET") return route.fulfill({ json: { suppliers: [{ id: "supplier-1", name: "Mlimani Wholesale", phone: "+255700000001", balance: 2000, current: 2000, days31To60: 0, days61To90: 0, over90: 0, receiptCount: 1 }], pagination: { page: 1, totalPages: 1, total: 1 } } });
    if (path === "/supplier-payables/supplier-1/receipts") return route.fulfill({ json: { receipts: [{ id: "receipt-1", receivedAt: "2026-10-10T08:00:00.000Z", totalLandedCost: 3000, paidAtReceipt: 1000, paymentMethod: "CASH", balance: 2000, paymentCorrections: [], items: [{ id: "line-1", quantity: 3, landedUnitCost: 1000, product: { id: "product-1", name: "Rice bag", unit: "bag", currentStock: 3 }, supplierCreditLines: [] }], paymentAllocations: [], credits: [] }], pagination: { page: 1, totalPages: 1 } } });
    if (path === "/supplier-payables/payments" && route.request().method() === "POST") {
      savedPayment = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { payment: { id: "payment-1" }, reused: false } });
    }
    if (path === "/supplier-payables/receipts/receipt-1/payment-corrections" && route.request().method() === "POST") {
      savedCorrection = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { correction: { id: "correction-1" }, reused: false } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/supplier-balances");
  await expect(page.getByRole("heading", { name: "Supplier balances" })).toBeVisible();
  await page.getByRole("button", { name: /Mlimani Wholesale/ }).click();
  await expect(page.getByText("Rice bag", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByLabel("Amount (TZS)").fill("1,000");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByText("Saved and supplier balance updated.").first()).toBeVisible();
  expect(savedPayment).toMatchObject({ amount: 1000, paymentMethod: "CASH", allocations: [{ stockReceiptId: "receipt-1", amount: 1000 }] });
  expect(savedPayment).toHaveProperty("requestKey");

  await page.getByRole("button", { name: /Mlimani Wholesale/ }).click();
  await page.getByRole("button", { name: "Correct receipt payment" }).click();
  await page.getByLabel("Correct amount paid at receipt (TZS)").fill("500");
  await page.getByLabel("Reason for correction (required)").fill("Receipt amount was mistyped");
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByRole("dialog", { name: "Correct receipt payment" })).toBeHidden();
  expect(savedCorrection).toMatchObject({ correctedAmount: 500, paymentMethod: "CASH", note: "Receipt amount was mistyped" });
  expect(savedCorrection).toHaveProperty("requestKey");
});

test("supplier balance lets the merchant record an actual refund against a supplier credit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem("dukapilot_token", "supplier-refund-owner-token");
    localStorage.setItem("dukapilot_language", "en");
  });
  let savedRefund: Record<string, unknown> | null = null;
  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    const marker = Math.max(url.pathname.indexOf("/_api/"), url.pathname.indexOf("/api/"));
    const prefixLength = url.pathname.startsWith("/_api/", marker) ? 6 : 5;
    const path = marker >= 0 ? `/${url.pathname.slice(marker + prefixLength)}` : url.pathname;
    if (path === "/auth/me") return route.fulfill({ json: { user: { id: "owner-1", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Shop" } } } });
    if (path === "/subscription/status") return route.fulfill({ json: { status: "active", daysLeft: 20 } });
    if (path === "/notifications") return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (path === "/supplier-payables" && route.request().method() === "GET") return route.fulfill({ json: { suppliers: [{ id: "supplier-1", name: "Mlimani Wholesale", phone: "+255700000001", balance: -1500, current: 0, days31To60: 0, days61To90: 0, over90: 0, receiptCount: 1 }], pagination: { page: 1, totalPages: 1, total: 1 } } });
    if (path === "/supplier-payables/supplier-1/receipts") return route.fulfill({ json: { receipts: [{ id: "receipt-1", receivedAt: "2026-10-10T08:00:00.000Z", totalLandedCost: 3000, paidAtReceipt: 3000, paymentMethod: "CASH", balance: -1500, paymentCorrections: [], items: [{ id: "line-1", quantity: 3, landedUnitCost: 1000, product: { id: "product-1", name: "Rice bag", unit: "bag", currentStock: 2 }, supplierCreditLines: [] }], paymentAllocations: [], credits: [{ id: "credit-1", kind: "RETURN", issuedAt: "2026-10-11T08:00:00.000Z", items: [{ amount: 1500, quantity: 1 }] }] }], pagination: { page: 1, totalPages: 1 } } });
    if (path === "/supplier-payables/refunds" && route.request().method() === "POST") {
      savedRefund = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { payment: { id: "refund-1", kind: "REFUND" }, reused: false } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/supplier-balances");
  await page.getByRole("button", { name: /Mlimani Wholesale/ }).click();
  await page.getByRole("button", { name: "Record supplier refund" }).click();
  await expect(page.getByRole("dialog", { name: "Supplier refund received" })).toBeVisible();
  await page.getByLabel("Amount (TZS)").fill("1,000");
  await page.getByLabel("Payment method").selectOption("MPESA");
  await page.getByLabel("Reference (optional)").fill("REFUND-1000");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(page.getByText("Saved and supplier balance updated.").first()).toBeVisible();
  expect(savedRefund).toMatchObject({ stockReceiptId: "receipt-1", amount: 1000, paymentMethod: "MPESA", paymentReference: "REFUND-1000" });
  expect(savedRefund).toHaveProperty("requestKey");
});
