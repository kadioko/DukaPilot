import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) test(`sell a service alongside a product at ${width}px`, async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  await page.setViewportSize({ width, height: 844 });
  await page.route(/.*\/_?api\/.*/, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^.*\/_?api/, "");
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path === "/auth/me") return json({ user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina" }, features: {} } });
    if (path === "/settings") return json({ settings: { shop: { name: "Amina", allowVariableSalePrices: false } } });
    if (path === "/products") return json({ products: [{ id: "soap", name: "Soap", unit: "pcs", sellingPrice: 2000, buyingPrice: 1000, currentStock: 2, doesNotExpire: true }], pagination: { total: 1 } });
    if (path === "/services") return json({ services: [{ id: "wash", name: "Car wash", unit: "service", defaultSellingPrice: 10000 }], total: 1 });
    if (path === "/sales" && req.method() === "POST") {
      saved = req.postDataJSON() as Record<string, unknown>;
      return json({ sale: { id: "sale-1", receiptNumber: 1, totalAmount: 22000, paymentMethod: "CASH", createdAt: new Date().toISOString(), items: [{ id: "1", name: "Car wash", quantity: 2, unitPrice: 10000, totalPrice: 20000 }, { id: "2", productId: "soap", quantity: 1, unitPrice: 2000, totalPrice: 2000, product: { id: "soap", name: "Soap", unit: "pcs" } }] } }, 201);
    }
    if (path === "/debts/customers") return json({ customers: [] });
    if (path === "/subscription/status") return json({ status: "active", isActive: true });
    if (path === "/notifications") return json({ unreadCount: 0, notifications: [] });
    if (path === "/barcodes/settings") return json({ settings: { barcodeScanningEnabled: false } });
    return json({});
  });
  await page.goto("/sales");
  await page.getByRole("button", { name: /Car wash/ }).click();
  await expect(page.getByText("Service - no stock needed")).toBeVisible();
  await page.getByRole("button", { name: "Increase quantity of Car wash" }).click();
  await page.getByRole("button", { name: /Soap/ }).click();
  await page.getByRole("button", { name: /Complete sale/i }).click();
  await expect.poll(() => saved).not.toBeNull();
  expect(saved).toMatchObject({ items: [{ serviceId: "wash", quantity: 2, unitPrice: 10000 }, { productId: "soap", quantity: 1, unitPrice: 2000 }] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("owner creates a service from inventory on a phone", async ({ page }) => {
  let created: Record<string, unknown> | null = null;
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/.*\/_?api\/.*/, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^.*\/_?api/, "");
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/me") return json({ user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina" }, features: {} } });
    if (path === "/services" && req.method() === "POST") { created = req.postDataJSON() as Record<string, unknown>; return json({ service: { id: "wash", ...created } }, 201); }
    if (path === "/services") return json({ services: created ? [{ id: "wash", ...created }] : [], total: created ? 1 : 0 });
    if (path === "/subscription/status") return json({ status: "active", isActive: true });
    if (path === "/notifications") return json({ unreadCount: 0, notifications: [] });
    return json({});
  });
  await page.goto("/inventory/services");
  await page.getByRole("button", { name: "Add service" }).click();
  await page.getByLabel("Service name").fill("Car wash");
  await page.getByLabel("Selling price (TZS)").fill("10000");
  await expect(page.getByLabel("Selling price (TZS)")).toHaveValue("10,000");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => created).not.toBeNull();
  expect(created).toMatchObject({ name: "Car wash", defaultSellingPrice: 10000, defaultEstimatedUnitCost: 0 });
  await expect(page.getByText("Car wash", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
