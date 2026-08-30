import { expect, test } from "@playwright/test";

test("cash receipt prompts for a missing phone and builds a normalized WhatsApp URL", async ({ page }) => {
  const product = {
    id: "prod-1",
    name: "Sukari 1kg",
    unit: "pcs",
    sellingPrice: 3200,
    buyingPrice: 2800,
    currentStock: 5,
    doesNotExpire: true,
    expiryDate: null,
  };

  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-merchant-token");
    const nativeOpen = window.open.bind(window);
    (window as typeof window & { __openedWhatsAppUrl?: string }).open = ((url?: string | URL) => {
      const target = String(url || "");
      if (target.startsWith("https://wa.me/")) {
        (window as typeof window & { __openedWhatsAppUrl?: string }).__openedWhatsAppUrl = target;
        return null;
      }
      return nativeOpen(url);
    }) as typeof window.open;
  });

  await page.route("**/*api/auth/me", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ user: { name: "Test Merchant", role: "MERCHANT", language: "sw", shop: { name: "Duka la Jaribio" }, features: { staff: true, assistant: true, exports: true } } }),
  }));
  await page.route("**/*api/products/low-stock", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [] }) }));
  await page.route("**/*api/subscription/status", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "active", daysLeft: 30 }) }));
  await page.route("**/*api/notifications", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], unreadCount: 0 }) }));
  await page.route("**/*api/debts/customers", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ customers: [] }) }));
  await page.route("**/*api/settings", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ settings: { shop: { name: "Duka la Jaribio" } } }) }));
  await page.route("**/*api/products?*", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ products: [product], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } }),
  }));
  await page.route("**/*api/sales", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sales: [], total: 0 }) });
      return;
    }
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        sale: {
          id: "sale-internal-random-id",
          receiptNumber: 7,
          totalAmount: 3200,
          profit: 400,
          paymentMethod: "CASH",
          customerPhone: null,
          createdAt: "2026-08-06T09:00:00.000Z",
          shop: { name: "Duka la Jaribio" },
          items: [{ quantity: 1, unitPrice: 3200, totalPrice: 3200, product: { name: product.name, unit: product.unit } }],
        },
      }),
    });
  });

  await page.goto("/sales");
  await page.locator("button").filter({ hasText: product.name }).click();
  await page.getByRole("button", { name: /kamilisha|complete/i }).click();

  await expect(page.getByText("DP-000007", { exact: true })).toBeVisible();

  const imageDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /tuma au pakua risiti kama picha|share or download receipt image/i }).click();
  const imageFile = await imageDownload;
  expect(imageFile.suggestedFilename()).toBe("risiti-dp-000007.png");
  expect(await imageFile.failure()).toBeNull();

  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /tuma au pakua risiti kama PDF|share or download receipt PDF/i }).click();
  const pdfFile = await pdfDownload;
  expect(pdfFile.suggestedFilename()).toBe("risiti-dp-000007.pdf");
  expect(await pdfFile.failure()).toBeNull();

  const printedReceipt = page.waitForEvent("popup");
  await page.getByRole("button", { name: /chapisha; chagua printer ya Bluetooth|print; choose the paired Bluetooth printer/i }).click();
  const printPage = await printedReceipt;
  await expect(printPage.getByText("Duka la Jaribio", { exact: true })).toBeVisible();
  await expect(printPage.getByText("DP-000007", { exact: false })).toBeVisible();
  await expect(printPage.getByText("Jumla", { exact: true })).toBeVisible();
  await printPage.close();

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("prompt");
    await dialog.accept("0712345678");
  });
  await page.getByRole("button", { name: /tuma risiti kwa WhatsApp|share receipt on WhatsApp/i }).click();

  await expect.poll(() => page.evaluate(() => (window as typeof window & { __openedWhatsAppUrl?: string }).__openedWhatsAppUrl || "")).toContain("https://wa.me/255712345678?text=");
  const openedUrl = await page.evaluate(() => (window as typeof window & { __openedWhatsAppUrl?: string }).__openedWhatsAppUrl || "");
  expect(openedUrl).not.toContain("undefined");
  expect(decodeURIComponent(openedUrl)).toContain("Risiti: DP-000007");
});
