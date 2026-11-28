import { expect, test } from "@playwright/test";

test("payment filters retain global counts and ignore stale responses", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  const counts = { trial: 1, active: 2, expired: 3, suspended: 1 };
  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { user: { id: "admin", name: "Admin", role: "ADMIN", language: "en" } } });
    if (path.endsWith("/subscription/admin")) {
      const status = url.searchParams.get("status") || "all";
      if (status === "trial") await new Promise((resolve) => setTimeout(resolve, 800));
      const total = status === "all" ? 7 : counts[status as keyof typeof counts];
      return route.fulfill({ json: { shops: [], supportQueue: [], operationalCounts: { expiringTrials: 0, stalledTrials: 0, activatedTrials: 0 }, total, page: 1, limit: 24, totalPages: 1, statusCounts: counts } });
    }
    if (path.endsWith("/admin/overview")) return route.fulfill({ json: { summary: { users: 0, merchants: 0, suppliers: 0, admins: 0, shops: 7, products: 0, sales: 0, orders: 0, debts: 0, expenses: 0, paidShops: 0, auditLogs: 0 } } });
    if (path.endsWith("/admin/operations-summary")) return route.fulfill({ json: { openReports: 0, billingReports: 0, urgentReports: 0, qualifiedReferrals: 0, supplierReview: 0, loginFailures24h: 0, loginFailures7d: 0, shopsNeedingAction: 0, dueFollowUps: 0, reviewCheckouts: 0, recentNotes: [], latestAdminAction: null, paymentReviewQueue: [] } });
    if (path.endsWith("/subscription/admin-checkouts/review")) return route.fulfill({ json: { checkouts: [], total: 0, page: 1, totalPages: 1 } });
    return route.fulfill({ json: { users: [], logs: [], reports: [], referrals: [], suppliers: [], shops: [], events: [], devices: [], items: [], unreadCount: 0, pagination: { page: 1, total: 0, totalPages: 1 } } });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Payments", exact: true }).click();
  await expect(page.getByRole("button", { name: "ALL (7)" })).toBeVisible();
  await page.getByRole("button", { name: "TRIAL (1)" }).click();
  await page.getByRole("button", { name: "EXPIRED (3)" }).click();
  await expect(page.getByText("3 shops found")).toBeVisible();
  await expect(page.getByRole("button", { name: "ALL (7)" })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText("3 shops found")).toBeVisible();
});
