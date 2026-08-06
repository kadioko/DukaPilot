import { expect, test, type Page } from "@playwright/test";

async function mockMerchantShell(page: Page) {
  await page.route("**/*api/auth/me", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      user: {
        name: "Mama Jaribio",
        role: "MERCHANT",
        language: "sw",
        shop: { name: "Duka la Jaribio" },
        features: { staff: true, assistant: true, exports: true },
      },
    }),
  }));
  await page.route("**/*api/products/low-stock", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ products: [] }),
  }));
  await page.route("**/*api/subscription/status", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ status: "active", daysLeft: 30 }),
  }));
  await page.route("**/*api/notifications", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ items: [], unreadCount: 0 }),
  }));
}

test("expense form records the selected accounting date without field collisions", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await mockMerchantShell(page);

  let submitted: { spentAt?: unknown; amount?: unknown } = {};
  await page.route("**/*api/expenses", async (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ expense: { id: "expense-1", ...submitted } }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ expenses: [], summary: { total: 0, count: 0 } }),
    });
  });

  await page.goto("/expenses");
  await page.getByLabel("Jina la matumizi").fill("LUKU ya wiki iliyopita");
  await page.getByLabel("Kiasi (TZS)").fill("25000");
  await page.getByLabel("Tarehe ya matumizi: siku").selectOption("29");
  await page.getByLabel("Tarehe ya matumizi: mwezi").selectOption("07");
  await page.getByLabel("Tarehe ya matumizi: mwaka").selectOption("2026");

  const amountBox = await page.getByLabel("Kiasi (TZS)").boundingBox();
  const categoryBox = await page.getByLabel("Aina").boundingBox();
  expect(amountBox).not.toBeNull();
  expect(categoryBox).not.toBeNull();
  expect(amountBox!.x + amountBox!.width).toBeLessThanOrEqual(categoryBox!.x);

  await page.getByRole("button", { name: "Hifadhi" }).click();
  await expect.poll(() => submitted.spentAt).toBe("2026-07-29");
  expect(submitted.amount).toBe(25000);
});

test("AI ranks proven demand above an out-of-stock product with zero sales", async ({ page }) => {
  await mockMerchantShell(page);

  const lowStockAlerts = [
    { id: "toothpaste", name: "Dawa ya Mswaki", currentStock: 0, minimumStock: 5, unit: "pcs", buyingPrice: 1000, sellingPrice: 1800 },
    { id: "flour", name: "Unga wa Sembe", currentStock: 1, minimumStock: 5, unit: "kg", buyingPrice: 2000, sellingPrice: 3000 },
  ];
  const summary = { totalSales: 5000, totalProfit: 1200, totalExpenses: 0, netProfit: 1200, lowStockCount: 2, outOfStockCount: 1, pendingOrders: 0, salesCount: 1 };
  await page.route("**/*api/dashboard?period=today", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ summary, lowStockAlerts, topProducts: [{ product: { name: "Unga wa Sembe" }, totalQuantity: 2, totalRevenue: 6000 }] }),
  }));
  await page.route("**/*api/dashboard?period=all", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ summary: { ...summary, totalSales: 50000, salesCount: 12 }, lowStockAlerts, topProducts: [{ product: { name: "Unga wa Sembe" }, totalQuantity: 18, totalRevenue: 54000 }] }),
  }));
  await page.route("**/*api/debts", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ debts: [], summary: { openCount: 0, totalOwed: 0 } }),
  }));
  await page.route("**/*api/expenses", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ expenses: [], summary: { total: 0, count: 0 } }),
  }));
  await page.route("**/*api/assistant/actions", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ actions: [] }),
  }));

  await page.goto("/assistant");

  await expect(page.getByRole("heading", { name: "Agiza Unga wa Sembe kabla stock haijaisha" })).toBeVisible();
  await expect(page.getByText(/Kagua mahitaji ya Dawa ya Mswaki/)).toHaveCount(0);
});
