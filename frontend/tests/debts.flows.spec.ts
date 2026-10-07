import { expect, test, type Page } from "@playwright/test";

const originalDebt = {
  id: "debt-1", customerName: "Asha", customerPhone: "+255712345678",
  amount: 5000, amountPaid: 0, status: "OPEN", dueDate: null, note: null,
  createdAt: "2026-09-28T09:00:00.000Z", payments: [],
};

async function mockDebtShop(page: Page) {
  let saved = false;
  let submittedPayment: Record<string, unknown> | null = null;
  await page.addInitScript(() => localStorage.setItem("dukapilot_session_active", "1"));
  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Shop" }, features: {} } } });
    if (path.endsWith("/products/low-stock")) return route.fulfill({ json: { products: [] } });
    if (path.endsWith("/subscription/status")) return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    if (path.endsWith("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (path.endsWith("/settings")) return route.fulfill({ json: { settings: { shop: { name: "Amina Shop" } } } });
    if (path.includes("/debts/debt-1/payments") && route.request().method() === "POST") {
      submittedPayment = route.request().postDataJSON();
      saved = true;
      return route.fulfill({ json: { debt: { ...originalDebt, amountPaid: 3000, status: "PARTIAL", payments: [{ id: "payment-1", amount: 3000, paymentMethod: "MPESA", paymentRef: "M123", createdAt: "2026-10-01T09:00:00.000Z" }] } } });
    }
    if (path.includes("/debts/groups/")) {
      if (saved) return route.fulfill({ status: 503, json: { error: "Temporary outage" } });
      return route.fulfill({ json: { debts: [originalDebt], pagination: { page: 1, limit: 20, hasMore: false } } });
    }
    if (path.endsWith("/debts/groups")) {
      if (saved) return route.fulfill({ status: 503, json: { error: "Temporary outage" } });
      if (url.searchParams.get("search")) await new Promise((resolve) => setTimeout(resolve, 150));
      return route.fulfill({ json: { customers: [{ phone: "+255712345678", name: "Asha", debtCount: 1, openCount: 1, outstanding: 5000, lastDebtAt: originalDebt.createdAt }], pagination: { page: 1, limit: 25, hasMore: false }, summary: { openCount: 1, totalOwed: 5000 } } });
    }
    return route.fulfill({ json: {} });
  });
  return { submittedPayment: () => submittedPayment };
}

test("debt search stays focused through loading and a saved M-Pesa payment remains visible after refresh fails", async ({ page }) => {
  test.setTimeout(60_000);
  const mock = await mockDebtShop(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/debts");
  const search = page.getByRole("searchbox", { name: "Search customers by name or phone" });
  await expect(search).toBeVisible();
  await search.fill("Asha");
  await expect(search).toBeFocused();
  await expect(page.getByRole("button", { name: /view all debts/i })).toBeVisible();
  await page.getByRole("button", { name: /view all debts/i }).click();
  await expect(page.getByRole("button", { name: "Record" })).toBeVisible();
  await page.getByRole("combobox", { name: "Payment method" }).selectOption("MPESA");
  await page.getByRole("textbox", { name: "Payment reference" }).fill("M123");
  await page.getByRole("textbox", { name: /amount paid for debt/i }).fill("3000");
  await page.getByRole("button", { name: "Record" }).click();
  await expect.poll(() => mock.submittedPayment()).toMatchObject({ amount: 3000, paymentMethod: "MPESA", paymentRef: "M123" });
  await expect(page.getByText("TZS 2,000").first()).toBeVisible();
  await expect(page.getByText("TZS 3,000").first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});
