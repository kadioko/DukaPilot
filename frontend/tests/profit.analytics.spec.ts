import { expect, test } from "@playwright/test";

test("owner Analytics shows the requested clickable metrics and preserves the detailed owner report", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => window.localStorage.setItem("dukapilot_token", "test-owner-token"));
  await page.route("**/*api/auth/me", (route) => route.fulfill({ json: { user: { name: "Owner", role: "MERCHANT", language: "en", shop: { name: "Test Shop" }, features: { exports: true } } } }));
  await page.route("**/*api/subscription/status", (route) => route.fulfill({ json: { status: "active", daysLeft: 30 } }));
  await page.route("**/*api/products/low-stock*", (route) => route.fulfill({ json: { products: [] } }));
  await page.route("**/*api/notifications", (route) => route.fulfill({ json: { items: [], unreadCount: 0 } }));
  await page.route("**/*api/push/preferences", (route) => route.fulfill({ json: { preferences: { lowStock: false, debtDue: false, subscriptionExpiry: false, dailyAssistant: false, privatePreview: true }, subscriptions: [], pushConfigured: false } }));
  await page.route("**/*api/dashboard/purchases*", (route) => route.fulfill({ json: {
    period: "today", from: "2026-10-02T00:00:00.000Z", to: "2026-10-02T08:00:00.000Z",
    summary: { receiptCount: 2, productCost: 60000, transportCost: 3000, otherCost: 1000, landedCost: 64000, estimatedReceiptCount: 0 },
    paymentBreakdown: [{ paymentMethod: "CASH", receiptCount: 2, amount: 64000 }],
    suppliers: [{ id: "supplier-1", name: "Mkulima Supplies", receiptCount: 1, amount: 50000 }, { id: "__unassigned__", name: "No supplier", receiptCount: 1, amount: 14000 }],
    supplierOptions: [{ id: "__unassigned__", name: "No supplier", receiptCount: 1 }], products: [], receipts: [{ id: "receipt-1", receivedAt: "2026-10-02T07:00:00.000Z", invoiceNumber: null, paymentMethod: "CASH", totalProductCost: 60000, transportCost: 3000, otherCost: 1000, totalLandedCost: 64000, estimatedAllocation: false, supplier: null, items: [{ id: "line-1", quantity: 4, landedUnitCost: 16000, product: { id: "feed", name: "Layer feed", unit: "kg" } }] }], pagination: { page: 1, pageSize: 25, total: 2, totalPages: 1 },
  } }));
  await page.route("**/*api/dashboard/profit*", (route) => route.fulfill({ json: {
    period: "today", from: "2026-10-02T00:00:00.000Z", to: "2026-10-02T08:00:00.000Z", compareFrom: null, compareTo: null, group: "hour",
    summary: { salesRevenue: 100000, salesReturns: 0, netSalesRevenue: 100000, cashCollected: 80000, refunds: 0, netCashCollected: 80000, creditSales: 20000, debtReductions: 0, netCreditSales: 20000, costOfGoodsSold: 60000, grossProfit: 30000, grossProfitMargin: 50, expenses: 5000, netProfit: 25000, salesCount: 4, unitsSold: 12, missingCostSalesRevenue: 10000, knownCostRevenue: 90000, costComplete: false },
    production: { batchCount: 1, grossOutput: 280, brokenEggs: 8, usableOutput: 272, productionVariance: 0, ingredientCost: 52500, directCost: 0, totalCost: 52500, inputs: [{ productId: "feed", name: "Layer mash", unit: "kg", quantity: 37.5, cost: 52500 }] },
    comparison: null, debtAging: { overdue: 12000, dueSoon: 3000, noDueDate: 4000, outstanding: 19000 }, collectionBreakdown: [{ paymentMethod: "CASH", amount: 80000 }],
    salesPaymentBreakdown: [{ paymentMethod: "CASH", salesCount: 3, amount: 80000 }],
    topSuppliers: [{ id: "supplier-1", name: "Mkulima Supplies", receiptCount: 2, amount: 64000 }],
    topCustomers: [{ name: "Asha", phoneLast4: "1234", salesCount: 2, amount: 45000 }],
    salesByStaff: [{ id: "staff-1", name: "Neema", salesCount: 3, amount: 72000, unitsSold: 5 }],
    products: [{ id: "flour", name: "Unga", unit: "kg", currentStock: 8, quantity: 12, revenue: 60000, grossProfit: 20000, missingCostSalesRevenue: 10000, lastSoldAt: "2026-10-02T07:00:00Z" }],
    slowMovingProducts: [{ id: "rice", name: "Rice", unit: "kg", currentStock: 15 }],
    chart: [{ label: "08:00", revenue: 100000, costOfGoodsSold: 60000, grossProfit: 30000, grossProfitMargin: 50, knownCostRevenue: 90000, salesCount: 4, unitsSold: 12, expenses: 5000, netProfit: 25000 }],
  } }));

  await page.goto("/analytics");
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();
  for (const [key, title] of [["revenue", "Revenue"], ["sales", "Sales"], ["profits", "Profits"], ["top-products", "Top products"], ["top-suppliers", "Top suppliers"], ["payment-method", "Payment method"], ["cogs", "Cost of goods sold"], ["top-customers", "Top customers"], ["gross-profit", "Gross profit"], ["sales-by-staff", "Sales by staff"], ["gross-margin", "Gross profit margin"], ["units-sold", "Units sold"]]) {
    const tile = page.locator(`a[href^="/analytics/${key}?"]`);
    await expect(tile).toBeVisible();
    await tile.click();
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.goto("/analytics");
  }
  await expect(page.getByRole("link", { name: /Top supplier:/ })).toContainText("Mkulima Supplies");
  await expect(page.getByRole("link", { name: /Top customer:/ })).toContainText("Asha");
  await expect(page.getByText(/no recorded cost/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Receivables and collections" })).toBeVisible();
  await expect(page.getByText("Stock with no sale in 30 days")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Production costs and inputs" })).toBeVisible();
  await expect(page.getByText("37.5 kg", { exact: true })).toBeVisible();
  const purchases = page.getByRole("link", { name: /Purchases:/ });
  await expect(purchases).toContainText("64,000");
  await purchases.click();
  await expect(page.getByRole("heading", { name: "Purchases", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Today", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('select[aria-label="Supplier"] option[value="__unassigned__"]')).toHaveText("No supplier");
  await expect(page.locator("details summary strong").first()).toHaveText("No supplier");
  const purchasesDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).click();
  expect((await purchasesDownload).suggestedFilename()).toContain("dukapilot-purchases-today");
  await page.goto("/analytics");
  await page.getByRole("link", { name: /Top supplier:/ }).click();
  await expect(page).toHaveURL(/\/analytics\/top-suppliers/);
  await expect(page.getByRole("heading", { name: "Top suppliers" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Mkulima Supplies" })).toBeVisible();
  await page.goto("/analytics");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toContain("dukapilot-owner-report");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
