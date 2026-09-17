import { expect, test } from "@playwright/test";

test("shop alerts render quotation alerts from the merchant demo data", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-merchant-token");
  });

  await page.route("**/*api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { name: "Mama Amina", role: "MERCHANT", language: "en", shop: { name: "Duka la Amina" } } }),
    });
  });
  await page.route("**/*api/products/low-stock*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [], total: 0 }) });
  });
  await page.route("**/*api/subscription/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "active", daysLeft: 30 }) });
  });
  await page.route("**/*api/notifications", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        unreadCount: 1,
        items: [{
          id: "quotation-expiring",
          type: "QUOTATION",
          severity: "WARNING",
          title: "1 quotation expires soon",
          titleSw: "Nukuu 1 inaisha muda hivi karibuni",
          description: "Follow up before the quoted price expires.",
          descriptionSw: "Fuatilia kabla muda wa bei kuisha.",
          href: "/quotations?status=SENT",
          count: 1,
        }],
      }),
    });
  });

  await page.goto("/notifications");

  await expect(page.getByRole("heading", { name: "Shop alerts" })).toBeVisible();
  await expect(page.getByText("1 quotation expires soon")).toBeVisible();
  await expect(page.getByRole("link", { name: /1 quotation expires soon/i })).toHaveAttribute("href", "/quotations?status=SENT");
  await expect(page.getByText("Something went wrong. Please try again or refresh the page.")).not.toBeVisible();
});
