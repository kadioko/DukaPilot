import { expect, test } from "@playwright/test";

test("merchant balance shows the full withdrawal deduction before one safe confirmation", async ({ page }) => {
  let withdrawalPayload: Record<string, unknown> | null = null;

  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/wallet/withdrawals/quote") && route.request().method() === "POST") {
      const payload = route.request().postDataJSON();
      expect(payload.amountTzs).toBe(10_000);
      expect(payload.phone).toBe("0713712057");
      return route.fulfill({ json: {
        quote: {
          amountTzs: 10_000,
          availableBalanceTzs: 20_000,
          canWithdraw: true,
          platformFeeTzs: 200,
          providerFeeTzs: 100,
          totalDebitTzs: 10_300,
          recipientName: "Amina",
          payoutRail: "mobile_money",
        },
      } });
    }
    if (url.includes("/wallet/withdrawals") && route.request().method() === "POST") {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      withdrawalPayload = payload;
      expect(payload.confirmedQuote).toEqual({
        providerFeeTzs: 100,
        totalDebitTzs: 10_300,
        recipientName: "Amina",
        payoutRail: "mobile_money",
      });
      return route.fulfill({ json: {
        transaction: {
          id: "wallet-withdrawal-1",
          kind: "WITHDRAWAL",
          status: "PENDING",
          amountTzs: 10_000,
          platformFeeTzs: 200,
          providerFeeTzs: 100,
          totalDebitTzs: 10_300,
          recipientPhone: "+255•••••2057",
          createdAt: "2026-09-19T10:00:00.000Z",
        },
      } });
    }
    if (url.includes("/auth/me")) return route.fulfill({ json: { user: { name: "Mama Amina", phone: "0713712057", role: "MERCHANT", language: "en", shop: { name: "Duka la Amina" }, features: {} } } });
    if (url.includes("/wallet?")) return route.fulfill({ json: {
      config: { enabled: true, feeBps: 200, minimumWithdrawalTzs: 5000 },
      wallet: { balanceTzs: 20_000, pendingDepositTzs: 0, pendingWithdrawalTzs: 0 },
      transactions: [],
      pagination: { page: 1, limit: 12, total: 0, totalPages: 1 },
    } });
    if (url.includes("/products/low-stock")) return route.fulfill({ json: { products: [], total: 0 } });
    if (url.includes("/subscription/status")) return route.fulfill({ json: { status: "active", isActive: true, daysLeft: 30 } });
    if (url.includes("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    return route.fulfill({ json: {} });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/wallet");

  await expect(page.getByRole("heading", { name: "Merchant Balance", exact: true })).toBeVisible();
  await expect(page.getByText("Available balance", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  await expect(page.getByLabel("Receiving phone")).toHaveValue("0713712057");
  await page.getByLabel("Amount to receive (TZS)").fill("10000");
  await page.getByLabel("Receiving phone").fill("0713712057");
  await page.getByRole("button", { name: "Preview fees", exact: true }).click();
  await expect(page.getByText("DukaPilot fee", { exact: true })).toBeVisible();
  await expect(page.getByText("Provider fee", { exact: true })).toBeVisible();
  await expect(page.getByText("Total deducted", { exact: true })).toBeVisible();
  await expect(page.getByText("TZS 10,300", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "I have checked the amount, phone number, and total deduction." }).check();
  await page.getByRole("button", { name: "Confirm withdrawal", exact: true }).click();

  await expect(page.getByText("The withdrawal is awaiting provider confirmation.", { exact: false })).toBeVisible();
  const submittedWithdrawal = withdrawalPayload as Record<string, unknown> | null;
  expect(submittedWithdrawal?.amountTzs).toBe(10_000);
  expect(submittedWithdrawal?.phone).toBe("0713712057");
  expect(String(submittedWithdrawal?.requestKey)).toMatch(/^[a-f0-9-]{16,100}$/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
