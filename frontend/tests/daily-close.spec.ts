import { expect, test } from "@playwright/test";

test("an owner keeps a separate drawer while reviewing an open staff shift", async ({ page }) => {
  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("auth/me")) {
      return route.fulfill({ json: { user: { name: "Owner", role: "MERCHANT", language: "en", shop: { name: "KD Shop" }, features: { staff: true } } } });
    }
    if (url.includes("cash-sessions/current")) {
      return route.fulfill({ json: {
        session: {
          id: "owner-session",
          status: "OPEN",
          openingCash: 5000,
          openedByName: "Owner",
          openedAt: "2026-09-15T05:30:00.000Z",
          summary: { cashSales: 12000, debtCollections: 0, quotationCash: 0, cashExpenses: 0, inventoryCashOut: 0, cookingCashOut: 0, farmCashOut: 0, saleCount: 1, debtPaymentCount: 0, quotationPaymentCount: 0, expenseCount: 0, stockReceiptCount: 0, cookingCostCount: 0, farmProductionCostCount: 0, expectedCash: 17000 },
        },
        canManageAllSessions: true,
        canOpenOwnSession: true,
        sessions: [{
          id: "owner-session",
          status: "OPEN",
          openingCash: 5000,
          openedByName: "Owner",
          openedAt: "2026-09-15T05:30:00.000Z",
          summary: { cashSales: 12000, debtCollections: 0, quotationCash: 0, cashExpenses: 0, inventoryCashOut: 0, cookingCashOut: 0, farmCashOut: 0, saleCount: 1, debtPaymentCount: 0, quotationPaymentCount: 0, expenseCount: 0, stockReceiptCount: 0, cookingCostCount: 0, farmProductionCostCount: 0, expectedCash: 17000 },
        }, {
          id: "cashier-session",
          status: "OPEN",
          openingCash: 10000,
          openedByName: "Asha",
          openedAt: "2026-09-15T06:00:00.000Z",
          summary: { cashSales: 35000, debtCollections: 0, quotationCash: 0, cashExpenses: 0, inventoryCashOut: 0, cookingCashOut: 0, farmCashOut: 0, saleCount: 2, debtPaymentCount: 0, quotationPaymentCount: 0, expenseCount: 0, stockReceiptCount: 0, cookingCostCount: 0, farmProductionCostCount: 0, expectedCash: 45000 },
        }],
      } });
    }
    if (url.includes("cash-sessions/history")) return route.fulfill({ json: { sessions: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } } });
    if (url.includes("products/low-stock")) return route.fulfill({ json: { products: [] } });
    if (url.includes("subscription/status")) return route.fulfill({ json: { plan: "PRO", status: "active", isActive: true, daysLeft: 30 } });
    if (url.includes("notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    return route.fulfill({ json: {} });
  });

  await page.goto("/daily-close");
  await expect(page.getByRole("heading", { name: "Your shift is in progress" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1 team shift open" })).toBeVisible();
  await expect(page.getByText("Asha").first()).toBeVisible();

  await page.getByRole("button", { name: "Review / close" }).click();
  await expect(page.getByRole("heading", { name: "Reviewing a staff shift" })).toBeVisible();
  await expect(page.getByText("This is the staff member's drawer.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Return to my shift" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a shift supervisor without Sell can still access only the team-shift screen", async ({ page }) => {
  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("auth/me")) {
      return route.fulfill({ json: { user: {
        name: "Neema", role: "MERCHANT", language: "en", shop: { name: "KD Shop" }, features: { staff: true },
        staff: { role: "MANAGER", permissions: { canSell: false, canManageStock: false, canManageFarm: false, canManageStaff: false, canViewReports: false, canRecordExpenses: false, canManageCashSessions: true, canUseAssistant: false, canViewQuotations: false } },
      } } });
    }
    if (url.includes("cash-sessions/current")) return route.fulfill({ json: { session: null, canManageAllSessions: true, canOpenOwnSession: false, sessions: [] } });
    if (url.includes("cash-sessions/history")) return route.fulfill({ json: { sessions: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } } });
    if (url.includes("products/low-stock")) return route.fulfill({ json: { products: [] } });
    if (url.includes("subscription/status")) return route.fulfill({ json: { plan: "PRO", status: "active", isActive: true, daysLeft: 30 } });
    if (url.includes("notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    return route.fulfill({ json: {} });
  });

  await page.goto("/daily-close");
  await expect(page.getByRole("link", { name: "Daily Close" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sales" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Team shift supervision" })).toBeVisible();
});

test("a lost close response is verified against the saved shift", async ({ page }) => {
  let closed = false;
  const summary = { cashSales: 0, debtCollections: 0, quotationCash: 0, cashRefunds: 0, cashRefundCount: 0, cashExpenses: 0, inventoryCashOut: 0, cookingCashOut: 0, farmCashOut: 0, saleCount: 0, debtPaymentCount: 0, quotationPaymentCount: 0, expenseCount: 0, stockReceiptCount: 0, cookingCostCount: 0, farmProductionCostCount: 0, expectedCash: 1000 };
  const session = () => ({ id: "shift-1", status: closed ? "CLOSED" : "OPEN", openingCash: 1000, countedCash: closed ? 1000 : null, variance: closed ? 0 : null, openedByName: "Owner", openedAt: "2026-10-26T06:00:00.000Z", summary });
  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("auth/me")) return route.fulfill({ json: { user: { name: "Owner", role: "MERCHANT", language: "en", shop: { name: "Test Shop" }, features: { staff: true } } } });
    if (url.includes("cash-sessions/shift-1/close")) {
      closed = true;
      return route.fulfill({ status: 504, json: { error: "Upstream timeout" } });
    }
    if (url.includes("cash-sessions/shift-1")) return route.fulfill({ json: { session: session() } });
    if (url.includes("cash-sessions/current")) return route.fulfill({ json: { session: closed ? null : session(), sessions: [session()], canManageAllSessions: true, canOpenOwnSession: true } });
    if (url.includes("cash-sessions/history")) return route.fulfill({ json: { sessions: closed ? [session()] : [], pagination: { page: 1, limit: 10, total: closed ? 1 : 0, totalPages: closed ? 1 : 0 } } });
    if (url.includes("subscription/status")) return route.fulfill({ json: { plan: "PRO", status: "active", isActive: true, daysLeft: 30 } });
    if (url.includes("notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    return route.fulfill({ json: {} });
  });

  await page.goto("/daily-close");
  await page.getByLabel("Cash counted (TZS)").fill("1000");
  await page.getByRole("button", { name: "Close day" }).click();
  await expect(page.getByText("The shift was closed; only the response was lost.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Open your shift for today" })).toBeVisible();
  await expect(page.getByText("CLOSED").first()).toBeVisible();
});
