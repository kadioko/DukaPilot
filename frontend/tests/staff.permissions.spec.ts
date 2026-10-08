import { expect, test } from "@playwright/test";

test("staff permission network failure is handled and reconciled without duplicate PATCHes", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  const pageErrors: string[] = [];
  let patchRequests = 0;
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me")) {
      return route.fulfill({ json: { user: { name: "Owner", role: "MERCHANT", language: "en", shop: { name: "Test Shop" } } } });
    }
    if (url.pathname.endsWith("/subscription/status")) {
      return route.fulfill({ json: { plan: "PRO", status: "active" } });
    }
    if (url.pathname.endsWith("/staff") && route.request().method() === "GET") {
      return route.fulfill({ json: { staff: [{
        id: "staff-1", name: "Asha", phone: "+255700000001", role: "CASHIER", isActive: true,
        canSell: true, canManageStock: false, canManageFarm: false, canManageStaff: false,
        canViewReports: false, canRecordExpenses: false, canManageCashSessions: false, canUseAssistant: false,
        canViewQuotations: false, canCreateQuotations: false, canEditSentQuotations: false,
        canViewQuotationCosts: false, canApproveQuotationDiscounts: false, canSendQuotations: false,
        canAcceptQuotations: false, canConvertQuotations: false, canRecordQuotationPayments: false,
        canArchiveQuotations: false, canDeleteQuotationDrafts: false,
      }] } });
    }
    if (url.pathname.endsWith("/staff/staff-1") && route.request().method() === "PATCH") {
      patchRequests += 1;
      return route.abort("failed");
    }
    if (url.pathname.endsWith("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    return route.fulfill({ json: {} });
  });

  await page.goto("/staff");
  const reports = page.getByRole("checkbox", { name: "Reports" });
  await expect(reports).toBeVisible();
  await reports.click();
  await expect(page.locator('p[role="alert"]')).toContainText("connection was interrupted");
  expect(patchRequests).toBe(1);
  expect(pageErrors).toEqual([]);
});
