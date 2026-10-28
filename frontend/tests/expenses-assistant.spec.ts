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
  await page.route("**/*api/products/low-stock*", async (route) => route.fulfill({
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

function assistantSnapshot(options: {
  dashboard?: Record<string, unknown>;
  products?: Array<Record<string, unknown>>;
  quotationActions?: Array<Record<string, unknown>>;
  salesUnavailable?: boolean;
} = {}) {
  const summary = { totalSales: 0, netSales: 0, totalProfit: 0, totalExpenses: 0, netProfit: 0, lowStockCount: 0, outOfStockCount: 0, pendingOrders: 0, salesCount: 0 };
  const now = new Date().toISOString();
  const section = (data: Record<string, unknown> = {}): { status: "ready" | "unavailable"; checkedAt: string; data?: Record<string, unknown> } => ({ status: "ready", checkedAt: now, data });
  const salesSection = section({ dashboard: options.dashboard || { summary, lowStockAlerts: [], topProducts: [] } });
  if (options.salesUnavailable) {
    salesSection.status = "unavailable";
    delete salesSection.data;
  }
  return {
    generatedAt: now,
    snapshotKey: new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
    sections: {
      salesToday: salesSection,
      inventory: section({ products: options.products || [], actions: [] }),
      debts: section({ debts: [], summary: { openCount: 0, totalOwed: 0 } }),
      expenses: section({ expenses: [], summary: { total: 0, count: 0 }, trend: { current: 0, previous: 0, currentCount: 0, previousCount: 0 } }),
      quotations: section({ actions: options.quotationActions || [] }),
      farm: section({ actions: [] }),
      actionHistory: section({ actions: [] }),
    },
  };
}

async function mockAssistantSnapshot(page: Page, snapshot: ReturnType<typeof assistantSnapshot>) {
  await page.route(/\/(?:_api|api)\/assistant\/today(?:\?.*)?$/, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) }));
  await page.route(/\/(?:_api|api)\/assistant\/actions\/impressions$/, async (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ recorded: 1 }) }));
  await page.route(/\/(?:_api|api)\/assistant\/actions$/, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ actions: [] }) }));
}

test("expense form schedules a future monthly payment without posting a ledger expense", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await mockMerchantShell(page);

  let submitted: { spentAt?: unknown; amount?: unknown; recurringMonthly?: unknown; requestKey?: unknown } = {};
  let schedule: Record<string, unknown> | null = null;
  await page.route("**/*api/expenses*", async (route) => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      schedule = { id: "wifi-schedule", title: "Wifi", amount: 49000, category: "UTILITIES", paymentMethod: "MPESA", nextDueAt: "2026-10-30T12:00:00.000Z", dayOfMonth: 30 };
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ expense: null, recurringExpense: schedule, reused: false }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ expenses: [], recurringExpenses: schedule ? [schedule] : [], summary: { total: 0, count: 0 } }),
    });
  });

  await page.goto("/expenses");
  await expect(page.getByText("Rekodi matumizi yako ya kwanza")).toBeVisible();
  await page.getByRole("button", { name: "Ongeza matumizi" }).click();
  await page.getByLabel("Jina la matumizi").fill("Wifi");
  await page.getByLabel("Kiasi (TZS)").fill("49000");
  await page.getByRole("button", { name: "Panga ya kila mwezi" }).click();
  await page.getByLabel("Tarehe ya kwanza ya kulipa: siku").selectOption("30");
  await page.getByLabel("Tarehe ya kwanza ya kulipa: mwezi").selectOption("10");
  await page.getByLabel("Tarehe ya kwanza ya kulipa: mwaka").selectOption("2026");

  const amountBox = await page.getByLabel("Kiasi (TZS)").boundingBox();
  const categoryBox = await page.locator('[role="dialog"] select').first().boundingBox();
  expect(amountBox).not.toBeNull();
  expect(categoryBox).not.toBeNull();
  expect(amountBox!.x + amountBox!.width).toBeLessThanOrEqual(categoryBox!.x);

  await expect(page.getByText(/Hakuna rekodi ya kifedha itakayoundwa sasa/)).toBeVisible();
  await page.getByRole("button", { name: "Panga ratiba" }).click();
  await expect.poll(() => submitted.spentAt).toBe("2026-10-30");
  expect(submitted.amount).toBe(49000);
  expect(submitted.recurringMonthly).toBe(true);
  expect(submitted.requestKey).toMatch(/^[0-9a-f-]{36}$/i);
  await expect(page.getByText("Wifi").first()).toBeVisible();
  await expect(page.getByText(/Ratiba imewekwa kwa/)).toBeVisible();
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

  const products = [
    { id: "toothpaste", name: "Dawa ya Mswaki", currentStock: 0, minimumStock: 5, unit: "pcs", buyingPrice: 1000, hasReliablePace: false, saleDays28d: 0, observedDays: 0 },
    { id: "flour", name: "Unga wa Sembe", currentStock: 1, minimumStock: 5, unit: "kg", buyingPrice: 2000, hasReliablePace: true, dailySalesRate: 2, daysOfCoverage: 0.5, reorderQuantity14d: 27, estimatedReorderCost: 54000, saleDays28d: 12, observedDays: 28 },
  ];
  await mockAssistantSnapshot(page, assistantSnapshot({ products }));

  await page.goto("/assistant");

  await expect(page.getByRole("heading", { name: "Kagua kuagiza Unga wa Sembe" })).toBeVisible();
  await expect(page.getByText(/takriban siku 1/)).toBeVisible();
  await expect(page.getByText(/gharama ya karibu TZS 54,000/)).toBeVisible();
  await expect(page.getByRole("heading", { name: /Kagua mahitaji ya Dawa ya Mswaki/ })).toHaveCount(0);
});

test("AI keeps inventory guidance visible when sales data fails and retries only that source", async ({ page }) => {
  await mockMerchantShell(page);
  const snapshot = assistantSnapshot({
    salesUnavailable: true,
    products: [{ id: "flour", name: "Unga wa Sembe", currentStock: 1, minimumStock: 5, unit: "kg", hasReliablePace: true, dailySalesRate: 2, daysOfCoverage: 0.5, reorderQuantity14d: 27, estimatedReorderCost: 54000, saleDays28d: 12, observedDays: 28 }],
  });
  let retriedUrl = "";
  await page.route(/\/(?:_api|api)\/assistant\/today(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("source") === "salesToday") {
      retriedUrl = url.toString();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          generatedAt: new Date().toISOString(),
          snapshotKey: snapshot.snapshotKey,
          sections: { salesToday: { ...assistantSnapshot().sections.salesToday, status: "ready" } },
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
  });
  await page.route(/\/(?:_api|api)\/assistant\/actions\/impressions$/, async (route) => route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ recorded: 1 }) }));
  await page.route(/\/(?:_api|api)\/assistant\/actions$/, async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ actions: [] }) }));

  await page.goto("/assistant");
  await expect(page.getByRole("heading", { name: "Kagua kuagiza Unga wa Sembe" })).toBeVisible();
  await expect(page.getByText(/Haipatikani.*Mapendekezo yamefichwa/).first()).toBeVisible();
  await page.getByRole("button", { name: "Jaribu tena Mauzo ya leo" }).click();
  await expect.poll(() => retriedUrl).toContain("source=salesToday");
  await expect(page.getByText("Mauzo ya leo").locator("..").getByText(/Imekaguliwa/)).toBeVisible();
});

test("an unavailable source clears its old recommendation instead of showing stale advice", async ({ page }) => {
  await mockMerchantShell(page);
  const snapshot = assistantSnapshot({ quotationActions: [{ id: "quotation-convert-old", rank: 93, href: "/quotations", title: "Badilisha QT-OLD kuwa mauzo", body: "Old quotation data", action: "Fungua" }] });
  snapshot.sections.quotations.status = "unavailable";
  delete snapshot.sections.quotations.data;
  await mockAssistantSnapshot(page, snapshot);

  await page.goto("/assistant");

  await expect(page.getByRole("heading", { name: "Badilisha QT-OLD kuwa mauzo" })).toHaveCount(0);
  await expect(page.getByText(/Nukuu.*Haipatikani.*Mapendekezo yamefichwa/)).toBeVisible();
});

test("dismissal is scoped to its Tanzania-day occurrence", async ({ page }) => {
  await mockMerchantShell(page);
  const snapshot = assistantSnapshot({ quotationActions: [{ id: "quotation-convert-accepted", rank: 93, href: "/quotations?status=ACCEPTED", title: "Badilisha QT-0042 kuwa mauzo", body: "Asha amekubali kazi.", action: "Fungua nukuu zilizokubaliwa" }] });
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  snapshot.sections.actionHistory.data = { actions: [{ actionKey: "quotation-convert-accepted", snapshotKey: new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Dar_es_Salaam", year: "numeric", month: "2-digit", day: "2-digit" }).format(yesterday), status: "DISMISSED" }] };
  await mockAssistantSnapshot(page, snapshot);

  await page.goto("/assistant");

  await expect(page.getByRole("heading", { name: "Badilisha QT-0042 kuwa mauzo" })).toBeVisible();
});

test("action-history outage keeps a saved dismissal hidden while labeling the history unavailable", async ({ page }) => {
  await mockMerchantShell(page);
  const snapshot = assistantSnapshot({ quotationActions: [{ id: "quotation-convert-accepted", rank: 93, href: "/quotations?status=ACCEPTED", title: "Badilisha QT-0042 kuwa mauzo", body: "Asha amekubali kazi.", action: "Fungua nukuu zilizokubaliwa" }] });
  snapshot.sections.actionHistory.data = { actions: [{ actionKey: "quotation-convert-accepted", snapshotKey: snapshot.snapshotKey, status: "DISMISSED" }] };
  let fullSnapshotCount = 0;
  await page.route(/\/(?:_api|api)\/assistant\/today(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has("source")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ generatedAt: new Date().toISOString(), snapshotKey: snapshot.snapshotKey, sections: { actionHistory: { status: "unavailable", checkedAt: new Date().toISOString() } } }) });
    fullSnapshotCount += 1;
    if (fullSnapshotCount === 1) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(snapshot) });
    const failedSnapshot = { ...snapshot, sections: { ...snapshot.sections, actionHistory: { status: "unavailable", checkedAt: new Date().toISOString() } } };
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(failedSnapshot) });
  });

  await page.goto("/assistant");
  await expect(page.getByRole("heading", { name: "Badilisha QT-0042 kuwa mauzo" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sasisha zote" }).click();

  await expect(page.getByText("Historia ya hatua").locator("..").getByText(/Haipatikani/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Badilisha QT-0042 kuwa mauzo" })).toHaveCount(0);
});

test("recommendation save errors are shown inline and do not escape the click handler", async ({ page }) => {
  await mockMerchantShell(page);
  await mockAssistantSnapshot(page, assistantSnapshot({ quotationActions: [{ id: "quotation-convert-accepted", rank: 93, href: "/quotations?status=ACCEPTED", title: "Badilisha QT-0042 kuwa mauzo", body: "Asha amekubali kazi.", action: "Fungua nukuu zilizokubaliwa" }] }));
  await page.route(/\/(?:_api|api)\/assistant\/actions$/, async (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Save failed" }) }));
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/assistant");
  await page.getByRole("button", { name: "Acha" }).click();

  await expect(page.getByRole("alert").filter({ hasText: /Seva ina tatizo la muda|Save failed|temporarily unavailable/i }).first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("profit guidance identifies incomplete cost coverage without asserting a loss", async ({ page }) => {
  await mockMerchantShell(page);
  await mockAssistantSnapshot(page, assistantSnapshot({
    dashboard: {
      summary: { totalSales: 100000, totalExpenses: 40000, netProfit: 30000, costComplete: false, missingCostSalesRevenue: 25000, lowStockCount: 0, outOfStockCount: 0, pendingOrders: 0, salesCount: 3 },
      lowStockAlerts: [],
      topProducts: [],
    },
  }));

  await page.goto("/assistant");

  await expect(page.getByRole("heading", { name: "Makadirio ya faida hayajakamilika" })).toBeVisible();
  await expect(page.getByText(/Mauzo ya TZS 25,000 hayana gharama/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Matumizi yamezidi faida ya leo" })).toHaveCount(0);
});

test("Ask DukaPilot shows its data source and privacy note", async ({ page }) => {
  await mockMerchantShell(page);
  await mockAssistantSnapshot(page, assistantSnapshot());
  await page.route(/\/(?:_api|api)\/assistant\/ask$/, async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ answer: { message: "There are no open debts recorded.", href: "/debts", evidence: [{ source: "Debts", checkedAt: new Date().toISOString(), dataThrough: null }], privacy: "This answer used DukaPilot records only; no external AI service was called." } }),
  }));

  await page.goto("/assistant");
  await page.getByLabel("Uliza kuhusu biashara yako").fill("How much debt is outstanding?");
  await page.getByRole("button", { name: "Uliza" }).click();
  await expect(page.getByText("There are no open debts recorded.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Fungua rekodi husika" })).toHaveAttribute("href", "/debts");
  await expect(page.getByText(/no external AI service was called/)).toBeVisible();
  await expect(page.getByText(/Chanzo: Debts/)).toBeVisible();
});

test("Ask sends the requested calendar period and displays its explicit date range", async ({ page }) => {
  await mockMerchantShell(page);
  await mockAssistantSnapshot(page, assistantSnapshot());
  let question = "";
  await page.route(/\/(?:_api|api)\/assistant\/ask$/, async (route) => {
    question = route.request().postDataJSON().question;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ answer: { message: "Recorded sales for this month (2026-10-01 to 2026-10-28): TZS 210,000 from 4 sales. Cash collected: TZS 160,000.", href: "/analytics", evidence: [{ source: "Sales", checkedAt: new Date().toISOString() }], privacy: "No external AI service was called." } }),
    });
  });

  await page.goto("/assistant");
  await page.getByLabel("Uliza kuhusu biashara yako").fill("How much sales this month?");
  await page.getByRole("button", { name: "Uliza" }).click();

  await expect.poll(() => question).toBe("How much sales this month?");
  await expect(page.getByText(/this month \(2026-10-01 to 2026-10-28\)/)).toBeVisible();
  await expect(page.getByText(/Cash collected: TZS 160,000/)).toBeVisible();
});

test("AI prioritizes accepted, deposit, expiring, and expired quotation work without treating it as revenue", async ({ page }) => {
  await mockMerchantShell(page);
  const quoteActions = [
      { id: "quotation-convert-accepted", rank: 93, href: "/quotations?status=ACCEPTED", title: "Badilisha QT-0042 kuwa mauzo", body: "Asha amekubali Ufungaji wa pazia.", action: "Fungua nukuu zilizokubaliwa" },
      { id: "quotation-deposit-accepted", rank: 79, href: "/quotations?status=ACCEPTED", title: "Kumbuka amana ya QT-0042", body: "Asha bado anadaiwa TZS 100,000 ya amana.", action: "Fungua nukuu na rekodi malipo" },
      { id: "quotation-expiring-sent", rank: 84, href: "/quotations?status=SENT", title: "QT-0043 inaisha hivi karibuni", body: "Fuatilia Salum kuhusu Ubunifu wa ofisi.", action: "Fungua nukuu zilizotumwa" },
      { id: "quotation-expired-expired", rank: 64, href: "/quotations?status=EXPIRED", title: "Amua hatua kwa QT-0044", body: "Neema hajakubali Matengenezo ya fremu.", action: "Fungua nukuu zilizoisha" },
  ];
  await mockAssistantSnapshot(page, assistantSnapshot({ quotationActions: quoteActions }));

  await page.goto("/assistant");

  await expect(page.getByRole("heading", { name: "Badilisha QT-0042 kuwa mauzo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kumbuka amana ya QT-0042" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "QT-0043 inaisha hivi karibuni" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Amua hatua kwa QT-0044" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fungua nukuu zilizokubaliwa" })).toHaveAttribute("href", "/quotations?status=ACCEPTED");
  await expect(page.getByText("bila kuchanganya nukuu na mapato yaliyothibitishwa").first()).toBeVisible();
});
