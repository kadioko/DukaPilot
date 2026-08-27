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

test("expense form records a formatted amount, selected accounting date, and monthly schedule", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await mockMerchantShell(page);

  let submitted: { spentAt?: unknown; amount?: unknown; recurringMonthly?: unknown } = {};
  await page.route("**/*api/expenses*", async (route) => {
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
      body: JSON.stringify({ expenses: [], recurringExpenses: [], summary: { total: 0, count: 0 } }),
    });
  });

  await page.goto("/expenses");
  await expect(page.getByText("Rekodi matumizi yako ya kwanza")).toBeVisible();
  await page.getByRole("button", { name: "Ongeza matumizi" }).click();
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

  await page.getByText("Rudia kila mwezi").click();
  await page.getByRole("button", { name: "Hifadhi" }).click();
  await expect.poll(() => submitted.spentAt).toBe("2026-07-29");
  expect(submitted.amount).toBe(25000);
  expect(submitted.recurringMonthly).toBe(true);
});

test("expense history filters records and exposes edit and delete actions", async ({ page }) => {
  await mockMerchantShell(page);
  const expense = { id: "expense-1", title: "LUKU", amount: 25000, category: "UTILITIES", vendor: "TANESCO", note: "Meter 123", paymentMethod: "MPESA", spentAt: "2026-08-10T12:00:00.000Z" };
  const requests: string[] = [];
  let updated: Record<string, unknown> | null = null;
  let deleted = false;
  await page.route(/\/(?:_api|api)\/expenses(?:\/.*|\?.*)?$/, async (route) => {
    requests.push(route.request().url());
    if (route.request().method() === "PATCH") {
      updated = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ expense: { ...expense, ...updated } }) });
    }
    if (route.request().method() === "DELETE") {
      deleted = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ message: "Expense deleted" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ expenses: [expense], recurringExpenses: [], summary: { total: 25000, count: 1 } }) });
  });
  await page.goto("/expenses");
  await expect(page.getByText("LUKU").first()).toBeVisible();

  await page.getByRole("button", { name: "Chuja" }).click();
  await page.getByLabel("Tafuta").fill("luku");
  await page.getByRole("button", { name: "Tumia vichujio" }).click();
  await expect.poll(() => requests.some((url) => url.includes("search=luku"))).toBe(true);

  await page.getByRole("button", { name: "Badilisha LUKU" }).click();
  await page.getByLabel("Maelezo (hiari)").fill("LUKU ya Agosti");
  expect(await page.locator('[role="dialog"] form').evaluate((form: HTMLFormElement) => ({ valid: form.checkValidity(), invalid: Array.from(form.querySelectorAll(":invalid")).map((field) => field.getAttribute("aria-label") || field.getAttribute("placeholder")) }))).toEqual({ valid: true, invalid: [] });
  await page.getByRole("button", { name: "Hifadhi mabadiliko" }).click();
  await expect.poll(() => updated?.note).toBe("LUKU ya Agosti");

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Futa LUKU" }).click();
  await expect.poll(() => deleted).toBe(true);
});

test("expense overview follows the selected period and shows profit pressure", async ({ page }) => {
  await mockMerchantShell(page);
  const expenseRequests: string[] = [];
  await page.route(/\/(?:_api|api)\/expenses(?:\/.*|\?.*)?$/, async (route) => {
    expenseRequests.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        expenses: [],
        recurringExpenses: [],
        summary: {
          total: 25000,
          count: 2,
          totalSales: 200000,
          grossProfit: 80000,
          netProfit: 55000,
          expensePercentOfSales: 12.5,
          previousTotal: 15000,
          changeAmount: 10000,
          changePercent: 66.7,
          salesCount: 8,
          topCategories: [{ category: "UTILITIES", total: 15000 }, { category: "TRANSPORT", total: 10000 }],
        },
      }),
    });
  });

  await page.goto("/expenses");
  await expect(page.getByRole("button", { name: "Leo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Muda Wote" })).toBeVisible();
  await expect(page.getByText("Faida baada ya matumizi")).toBeVisible();
  await expect(page.getByText("Umeme na huduma")).toBeVisible();

  await page.getByRole("button", { name: "Wiki" }).click();
  await expect.poll(() => expenseRequests.some((url) => url.includes("period=week"))).toBe(true);
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
  await page.route(/\/(?:_api|api)\/quotations\?limit=200$/, async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ quotations: [] }),
  }));

  await page.goto("/assistant");

  await expect(page.getByRole("heading", { name: "Agiza Unga wa Sembe kabla stock haijaisha" })).toBeVisible();
  await expect(page.getByText(/Kagua mahitaji ya Dawa ya Mswaki/)).toHaveCount(0);
});

test("AI prioritizes accepted, deposit, expiring, and expired quotation work without treating it as revenue", async ({ page }) => {
  await mockMerchantShell(page);
  const today = new Date();
  const inTwoDays = new Date(today);
  inTwoDays.setDate(today.getDate() + 2);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const quotes = [
    { id: "accepted", quotationNumber: "QT-0042", status: "ACCEPTED", projectTitle: "Ufungaji wa pazia", totalAmount: 200000, amountPaid: 0, depositRequiredAmount: 100000, depositDueDate: inTwoDays.toISOString(), expiryDate: inTwoDays.toISOString(), customer: { name: "Asha" } },
    { id: "sent", quotationNumber: "QT-0043", status: "SENT", projectTitle: "Ubunifu wa ofisi", totalAmount: 80000, amountPaid: 0, depositRequiredAmount: 0, expiryDate: inTwoDays.toISOString(), customer: { name: "Salum" } },
    { id: "expired", quotationNumber: "QT-0044", status: "EXPIRED", projectTitle: "Matengenezo ya fremu", totalAmount: 55000, amountPaid: 0, depositRequiredAmount: 0, expiryDate: yesterday.toISOString(), customer: { name: "Neema" } },
  ];
  const summary = { totalSales: 0, totalProfit: 0, totalExpenses: 0, netProfit: 0, lowStockCount: 0, outOfStockCount: 0, pendingOrders: 0, salesCount: 0 };
  await page.route("**/*api/dashboard?period=today", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary, lowStockAlerts: [], topProducts: [] }) }));
  await page.route("**/*api/dashboard?period=all", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary, lowStockAlerts: [], topProducts: [] }) }));
  await page.route("**/*api/debts", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ debts: [], summary: { openCount: 0, totalOwed: 0 } }) }));
  await page.route("**/*api/expenses", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ expenses: [], summary: { total: 0, count: 0 } }) }));
  await page.route("**/*api/assistant/actions", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ actions: [] }) }));
  await page.route("**/*api/assistant/quotations", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ actions: [
      { id: "quotation-convert-accepted", rank: 93, href: "/quotations?status=ACCEPTED", title: "Badilisha QT-0042 kuwa mauzo", body: "Asha amekubali Ufungaji wa pazia.", action: "Fungua nukuu zilizokubaliwa" },
      { id: "quotation-deposit-accepted", rank: 79, href: "/quotations?status=ACCEPTED", title: "Kumbuka amana ya QT-0042", body: "Asha bado anadaiwa TZS 100,000 ya amana.", action: "Fungua nukuu na rekodi malipo" },
      { id: "quotation-expiring-sent", rank: 84, href: "/quotations?status=SENT", title: "QT-0043 inaisha hivi karibuni", body: "Fuatilia Salum kuhusu Ubunifu wa ofisi.", action: "Fungua nukuu zilizotumwa" },
      { id: "quotation-expired-expired", rank: 64, href: "/quotations?status=EXPIRED", title: "Amua hatua kwa QT-0044", body: "Neema hajakubali Matengenezo ya fremu.", action: "Fungua nukuu zilizoisha" },
    ] }),
  }));
  await page.route(/\/(?:_api|api)\/quotations(?:\?.*)?$/, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ quotations: quotes }) }));

  await page.goto("/assistant");

  await expect(page.getByRole("heading", { name: "Badilisha QT-0042 kuwa mauzo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kumbuka amana ya QT-0042" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "QT-0043 inaisha hivi karibuni" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Amua hatua kwa QT-0044" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fungua nukuu zilizokubaliwa" })).toHaveAttribute("href", "/quotations?status=ACCEPTED");
  await expect(page.getByText("bila kuchanganya nukuu na mapato yaliyothibitishwa").first()).toBeVisible();
});
