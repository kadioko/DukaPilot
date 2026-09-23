import { expect, test } from "@playwright/test";

async function mockSalesShell(page: import("@playwright/test").Page, productStatus: number) {
  await page.addInitScript(() => localStorage.setItem("dukapilot_session_active", "1"));
  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/me")) return route.fulfill({ json: { user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en", businessShopId: "shop-1", shop: { id: "shop-1", name: "Amina Shop" }, features: { staff: true, assistant: true } } } });
    if (url.includes("/products/low-stock")) return route.fulfill({ json: { products: [] } });
    if (url.includes("/subscription/status")) return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    if (url.includes("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    if (url.includes("/debts/customers")) return route.fulfill({ json: { customers: [] } });
    if (url.includes("/settings") || url.includes("/barcodes/settings")) return route.fulfill({ json: { settings: {} } });
    if (url.includes("/products?")) return route.fulfill({ status: productStatus, contentType: "application/json", body: JSON.stringify({ error: productStatus === 403 ? "Forbidden" : "Internal server error" }) });
    if (url.includes("/sales?limit=30")) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Service unavailable" }) });
    return route.fulfill({ json: {} });
  });
}

test("sales distinguishes a temporary server failure from a connection outage", async ({ page }) => {
  await mockSalesShell(page, 503);
  const unhandled: string[] = [];
  page.on("pageerror", (error) => unhandled.push(error.message));

  await page.goto("/sales");
  await expect(page.getByRole("alert").filter({ hasText: /temporary server problem/i })).toBeVisible();
  await expect(page.getByText(/unable to reach the dukapilot server/i)).toHaveCount(0);

  await page.getByRole("button", { name: /history/i }).click();
  await expect(page.getByRole("alert").filter({ hasText: /temporary server problem/i })).toBeVisible();
  expect(unhandled).toEqual([]);
});

test("sales explains permission errors without claiming the server is unavailable", async ({ page }) => {
  await mockSalesShell(page, 403);

  await page.goto("/sales");
  await expect(page.getByRole("alert").filter({ hasText: /do not have permission/i })).toBeVisible();
  await expect(page.getByText(/temporarily unavailable|unable to reach the dukapilot server/i)).toHaveCount(0);
});
