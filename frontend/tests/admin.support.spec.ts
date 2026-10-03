import { expect, test } from "@playwright/test";

test("admin shows failed loads, retries, and opens a shop support timeline on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  let allowOverview = false;
  let savedNote = "";
  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    const pathname = new URL(url).pathname;
    const method = route.request().method();
    if (pathname.endsWith("/admin/overview")) {
      if (!allowOverview) return route.fulfill({ status: 503, json: { error: "Overview unavailable" } });
      return route.fulfill({ json: { summary: { users: 3, merchants: 2, suppliers: 1, admins: 1, shops: 2, products: 5, sales: 12, orders: 0, debts: 0, expenses: 0, paidShops: 1, auditLogs: 2 } } });
    }
    if (pathname.endsWith("/admin/operations-summary")) return route.fulfill({ json: { openReports: 4, billingReports: 2, urgentReports: 1, qualifiedReferrals: 1, supplierReview: 0, loginFailures24h: 3, loginFailures7d: 9, shopsNeedingAction: 1, dueFollowUps: 1, reviewCheckouts: 0, recentNotes: [], latestAdminAction: null, paymentReviewQueue: [] } });
    if (pathname.endsWith("/admin/support/admins")) return route.fulfill({ json: { admins: [{ id: "admin-1", name: "Admin" }] } });
    if (pathname.endsWith("/admin/support/shops")) return route.fulfill({ json: { shops: [{ id: "shop-1", name: "Kilosa Retail Shop", location: "Kilosa", plan: "PRO", computedStatus: "active", onboardingStatus: "NEEDS_HELP", user: { id: "owner-1", name: "Owner", phone: "+255700000001" }, lastContactedAt: null, nextFollowUpAt: null, supportAssignee: null }], total: 1, page: 1, totalPages: 1 } });
    if (pathname.endsWith("/admin/support/shops/shop-1/notes") && method === "POST") {
      savedNote = route.request().postDataJSON().body;
      return route.fulfill({ status: 201, json: { note: { id: "note-1", body: savedNote } } });
    }
    if (pathname.endsWith("/admin/support/shops/shop-1")) return route.fulfill({ json: { shop: { id: "shop-1", name: "Kilosa Retail Shop", location: "Kilosa", plan: "PRO", computedStatus: "active", onboardingStatus: "NEEDS_HELP", user: { id: "owner-1", name: "Owner", phone: "+255700000001" }, branches: [{ id: "branch-1", name: "Kilosa branch", location: "Kilosa", branchArchived: false }], nextFollowUpAt: null, lastContactedAt: null }, payments: [{ id: "payment-1", plan: "PRO", amount: 35000, method: "MPESA", paidAt: "2026-10-01T10:00:00Z", status: "CONFIRMED" }], reports: [], syncFailures: [], sales: { count: 12, lastAt: "2026-10-03T10:00:00Z" }, notes: savedNote ? [{ id: "note-1", body: savedNote, createdAt: "2026-10-03T11:00:00Z", author: { name: "Admin" } }] : [], noteCount: savedNote ? 1 : 0, notePage: 1, latestAdminAction: null } });
    const data = pathname.endsWith("/auth/me") ? { user: { id: "admin-1", name: "Admin", role: "ADMIN", language: "en", shop: null } }
      : pathname.endsWith("/admin/users") ? { users: [] }
      : pathname.endsWith("/admin/audit-logs") ? { logs: [] }
      : pathname.endsWith("/reports/admin") ? { reports: [], total: 0, page: 1, totalPages: 1, statusCounts: {} }
      : pathname.endsWith("/subscription/admin") ? { shops: [], supportQueue: [], operationalCounts: { expiringTrials: 0, stalledTrials: 0, activatedTrials: 0 }, total: 0, page: 1, limit: 24, totalPages: 1, statusCounts: { trial: 0, active: 0, expired: 0, suspended: 0 } }
      : pathname.endsWith("/admin/referrals") ? { referrals: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 1 } }
      : pathname.endsWith("/suppliers") ? { suppliers: [] }
      : pathname.endsWith("/sync/admin/summary") ? { shops: [] }
      : pathname.endsWith("/sync/admin/events") ? { events: [], devices: [] }
      : pathname.endsWith("/assistant/admin/analytics") ? { summary: { total: 0, open: 0, opened: 0, completed: 0, dismissed: 0, completedRate: 0, dismissedRate: 0, openedRate: 0 }, topActions: [] }
      : pathname.endsWith("/subscription/admin-checkouts/review") ? { checkouts: [] }
      : pathname.endsWith("/subscription/status") ? { plan: "PRO", status: "active" }
      : { items: [], unreadCount: 0 };
    await route.fulfill({ json: data });
  });
  await page.goto("/admin");
  const loadAlert = page.locator("[role=alert]").filter({ hasText: "Could not load: overview" });
  await expect(loadAlert).toBeVisible();
  allowOverview = true;
  await loadAlert.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Total Users")).toBeVisible();
  await expect(page.getByText("Failed logins (24h)")).toBeVisible();
  await page.getByRole("button", { name: "Needs Action" }).click();
  await expect(page.getByText("Kilosa Retail Shop").first()).toBeVisible();
  await page.getByRole("button", { name: /Kilosa Retail Shop/ }).click();
  await expect(page.getByText("Subscription payments")).toBeVisible();
  await page.getByPlaceholder("Add a dated support note...").fill("Called owner about renewal");
  await page.getByRole("button", { name: "Save note" }).click();
  await expect(page.getByText("Called owner about renewal")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/admin-support-mobile.png", fullPage: true });
});
