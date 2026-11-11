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
        canManageExpenseSchedules: false,
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

test("view-only staff presets are created without sell, stock-edit or finance access", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  const created: Record<string, unknown>[] = [];
  await page.route("**/*api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { user: { name: "Owner", role: "MERCHANT", language: "en", shop: { name: "Test Shop" } } } });
    if (path.endsWith("/subscription/status")) return route.fulfill({ json: { plan: "PRO", status: "active" } });
    if (path.endsWith("/staff") && route.request().method() === "POST") { created.push(route.request().postDataJSON()); return route.fulfill({ status: 201, json: { staff: {} } }); }
    if (path.endsWith("/staff")) return route.fulfill({ json: { staff: [] } });
    if (path.endsWith("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (path.endsWith("/products/low-stock")) return route.fulfill({ json: { products: [], total: 0 } });
    return route.fulfill({ json: {} });
  });
  await page.goto("/staff");
  for (const preset of ["stock", "prices"]) {
    await page.getByLabel("Name", { exact: true }).fill("Asha");
    await page.getByLabel("Phone", { exact: true }).fill("0712345678");
    await page.getByRole("combobox", { name: "Role", exact: true }).selectOption("MANAGER");
    await page.getByRole("combobox", { name: "Initial access" }).selectOption(preset);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect.poll(() => created.length).toBe(preset === "stock" ? 1 : 2);
  }
  for (const entry of created) expect(entry).toMatchObject({ role: "CASHIER", canSell: false, canManageStock: false, canCorrectStock: false, canManageStaff: false, canViewReports: false, canRecordExpenses: false, canManageExpenseSchedules: false, canUseAssistant: false, canViewQuotations: false });
  expect(created[0]).toMatchObject({ canViewStock: true, canViewSalePrices: false });
  expect(created[1]).toMatchObject({ canViewStock: false, canViewSalePrices: true });
});

test("scheduled-expense access is separately opt-in and depends on expense access", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  let created: Record<string, unknown> | null = null;
  await page.route("**/*api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { user: { name: "Owner", role: "MERCHANT", language: "en", shop: { name: "Test Shop" } } } });
    if (path.endsWith("/subscription/status")) return route.fulfill({ json: { plan: "PRO", status: "active" } });
    if (path.endsWith("/staff") && route.request().method() === "POST") { created = route.request().postDataJSON(); return route.fulfill({ status: 201, json: { staff: {} } }); }
    if (path.endsWith("/staff")) return route.fulfill({ json: { staff: [] } });
    if (path.endsWith("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    return route.fulfill({ json: {} });
  });

  await page.goto("/staff");
  const schedulePermission = page.getByRole("checkbox", { name: "Can manage expense schedules" });
  await expect(schedulePermission).toBeDisabled();
  await page.getByRole("checkbox", { name: "Can record expenses" }).check();
  await expect(schedulePermission).toBeEnabled();
  await schedulePermission.check();
  await page.getByLabel("Name", { exact: true }).fill("Asha");
  await page.getByLabel("Phone", { exact: true }).fill("0712345678");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect.poll(() => created).not.toBeNull();
  expect(created).toMatchObject({ canRecordExpenses: true, canManageExpenseSchedules: true });
});
