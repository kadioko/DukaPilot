import { expect, test } from "@playwright/test";

test("barcode management configures a 40 by 30 mm product label", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("dukapilot_token", "playwright-merchant-token"));
  const product = { id: "prod-1", name: "Sukari 1kg", labelName: "Sukari", sku: "SKR001", unit: "pcs", barcode: "DP00000001", internalBarcode: "DP00000001", manufacturerBarcode: "4006381333931", barcodeType: "INTERNAL", sellingPrice: 3200, wholesalePrice: 2900, currentStock: 12 };
  await page.route("**/*api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { name: "Test Merchant", role: "MERCHANT", language: "en", shop: { name: "Test Shop" } } }) }));
  await page.route("**/*api/products/low-stock*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [], total: 0 }) }));
  await page.route("**/*api/subscription/status", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "active", daysLeft: 30 }) }));
  await page.route("**/*api/notifications", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], unreadCount: 0 }) }));
  await page.route("**/*api/barcodes/report", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ withoutBarcodes: [], mostScanned: [], duplicateAttempts: 0 }) }));
  await page.route("**/*api/barcodes/history*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ scans: [] }) }));
  await page.route("**/*api/products?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [product] }) }));
  await page.route("**/*api/labels", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ templates: [], profiles: [], jobs: [] }) });
    if (route.request().method() === "POST") return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ job: { id: "label-job-1" }, output: null }) });
    return route.fallback();
  });
  await page.route("**/*api/labels/print-jobs/*/complete", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ job: { id: "label-job-1", status: "COMPLETED" } }) }));

  await page.goto("/barcodes");
  await page.getByRole("button", { name: "Labels" }).click();
  await expect(page.getByRole("heading", { name: "Print product labels" })).toBeVisible();
  await expect(page.getByText("Default size is 40 x 30 mm.")).toBeVisible();
  await page.getByLabel("Select Sukari 1kg").check();
  await expect(page.getByLabel("Preview label for Sukari")).toBeVisible();
  await expect(page.getByLabel("Preview label for Sukari").locator("svg")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "48 x 30 mm" })).toBeVisible();
  await page.getByText("Printer profiles and direct output").click();
  await page.getByLabel("Output").selectOption("EPL");
  await expect(page.getByLabel("Output")).toHaveValue("EPL");
  await page.getByLabel("Connection").selectOption("NETWORK");
  await expect(page.getByLabel("Connection")).toHaveValue("NETWORK");
  await expect(page.getByLabel("Bridge URL")).toHaveValue("http://127.0.0.1:9123");
});
