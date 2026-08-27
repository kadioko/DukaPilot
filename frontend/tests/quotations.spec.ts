import { expect, test, type Page } from "@playwright/test";

async function mockShell(page: Page) {
  const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/*api/auth/me", (route) => route.fulfill(json({ user: { name: "Amina", role: "MERCHANT", language: "sw", shop: { name: "Duka la Amina" }, features: { staff: true, assistant: true, exports: true } } })));
  await page.route("**/*api/products/low-stock", (route) => route.fulfill(json({ products: [] })));
  await page.route("**/*api/subscription/status", (route) => route.fulfill(json({ status: "active", daysLeft: 30 })));
  await page.route("**/*api/notifications", (route) => route.fulfill(json({ items: [], unreadCount: 0 })));
  await page.route("**/*api/products", (route) => route.fulfill(json({ products: [{ id: "product-1", name: "Rangi", unit: "tin", sellingPrice: 25000, buyingPrice: 18000, currentStock: 12 }] })));
  await page.route("**/*api/quotations/services", (route) => route.fulfill(json({ services: [] })));
  await page.route("**/*api/quotations/settings", (route) => route.fulfill(json({ settings: { prefix: "QT", numberingFormat: "{prefix}-{number}", defaultValidityDays: 14, defaultCurrency: "TZS", defaultDocumentLanguage: "sw", defaultTaxRateBasisPoints: 0, showQuantities: true, showUnitPrices: true, showItemDiscounts: true, showSections: true, defaultDepositPercent: 50, business: { name: "Duka la Amina" } } })));
  await page.route("**/*api/quotations/metrics", (route) => route.fulfill(json({ metrics: { totalValue: 500000, averageQuotationValue: 500000, conversionRate: 50, outstandingBalance: 250000, quotationCount: 1, estimatedCost: 300000, estimatedProfit: 200000, estimatedMargin: 40, byStatus: { DRAFT: { count: 1, value: 500000 }, SENT: { count: 0, value: 0 }, ACCEPTED: { count: 0, value: 0 }, REJECTED: { count: 0, value: 0 }, EXPIRED: { count: 0, value: 0 }, CONVERTED: { count: 0, value: 0 }, ARCHIVED: { count: 0, value: 0 }, CANCELLED: { count: 0, value: 0 } } } })));
  await page.route(/.*\/api\/quotations(?:\?.*)?$/, (route) => route.fulfill(json({ quotations: [{ id: "quote-1", quotationNumber: "QT-0001", currentRevisionNumber: 1, status: "DRAFT", issueDate: "2026-08-27T09:00:00.000Z", projectTitle: "Kupamba ofisi", currency: "TZS", discountAmount: 0, taxRateBasisPoints: 0, subtotalAmount: 500000, taxAmount: 0, totalAmount: 500000, amountPaid: 0, depositPercent: 50, depositRequiredAmount: 250000, customer: { id: "customer-1", name: "Amina" } }] })));
}

test("quotation workspace is usable on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockShell(page);
  await page.goto("/quotations");
  await expect(page.getByRole("heading", { name: "Nukuu za Bei" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nukuu mpya" })).toBeVisible();
  await expect(page.getByText("Kupamba ofisi")).toBeVisible();
  await page.getByRole("button", { name: "Nukuu mpya" }).click();
  await expect(page.getByText("Nukuu mpya ya bei")).toBeVisible();
  await expect(page.getByText("Gharama za ndani na faida ya makadirio")).toBeVisible();
});

test("public quotation page receives only customer-facing information", async ({ page }) => {
  await page.route("**/*api/public/quotations/safe-token", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ quotation: { quotationNumber: "QT-0001", revisionNumber: 1, status: "SENT", issueDate: "2026-08-27T09:00:00.000Z", expiryDate: "2026-09-10T09:00:00.000Z", projectTitle: "Kupamba ofisi", currency: "TZS", business: { name: "Duka la Amina" }, customer: { name: "Mteja" }, subtotalAmount: 500000, discountAmount: 0, taxAmount: 0, totalAmount: 500000, sections: [], items: [{ name: "Kazi ya mapambo", quantity: "1", unit: "kazi", unitPrice: 500000, lineTotal: 500000, position: 0 }] } }) }));
  await page.goto("/quote/safe-token");
  await expect(page.getByText("Kazi ya mapambo")).toBeVisible();
  await expect(page.getByText("TZS 500,000").last()).toBeVisible();
  const markup = await page.content();
  expect(markup).not.toContain("estimatedUnitCost");
  expect(markup).not.toContain("Private supplier");
});

test("public quotation uses the saved Kiswahili document language", async ({ page }) => {
  await page.route("**/*api/public/quotations/kiswahili-token", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ quotation: { quotationNumber: "QT-0002", revisionNumber: 1, status: "SENT", documentLanguage: "sw", issueDate: "2026-08-27T09:00:00.000Z", expiryDate: "2026-09-10T09:00:00.000Z", projectTitle: "Kupamba ofisi", currency: "TZS", business: { name: "Duka la Amina" }, customer: { name: "Mteja" }, subtotalAmount: 500000, discountAmount: 0, taxAmount: 0, totalAmount: 500000, sections: [], items: [{ name: "Kazi ya mapambo", quantity: "1", unit: "kazi", unitPrice: 500000, lineTotal: 500000, position: 0 }] } }) }));
  await page.goto("/quote/kiswahili-token");
  await expect(page.getByText("NUKUU YA BEI")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kubali nukuu" })).toBeVisible();
});
