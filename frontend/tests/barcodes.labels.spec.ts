import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

test.beforeEach(async ({ page }) => {
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
  await page.route("**/*api/labels/print-jobs", (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { job: { id: "label-job-1", items: body.items.flatMap((item: { copies: number }) => Array.from({ length: item.copies }, () => product)), templateSnapshot: body.template }, output: null } });
  });
});

test("barcode management configures a 40 by 30 mm product label", async ({ page }) => {
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
  await expect(page.getByRole("button", { name: "Download file" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Test bridge" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print directly" })).toBeEnabled();
});

test("edited loopback bridge URL is used and allowed by the site security policy", async ({ page }) => {
  let requests = 0;
  const server = createServer((req, res) => {
    requests += 1;
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, service: "dukapilot-print-bridge", version: "test-port" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing bridge address");
    await page.goto("/barcodes");
    await page.getByRole("button", { name: "Labels", exact: true }).click();
    await page.getByText("Printer profiles and direct output").click();
    await page.getByRole("combobox", { name: "Output", exact: true }).selectOption("TSPL");
    await page.getByRole("combobox", { name: "Connection", exact: true }).selectOption("BRIDGE");
    await page.getByLabel("Bridge URL", { exact: true }).fill(`http://127.0.0.1:${address.port}`);
    await page.getByRole("button", { name: "Test bridge", exact: true }).click();
    await expect(page.getByText("Bridge ready: test-port", { exact: true })).toBeVisible();
    expect(requests).toBe(1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("label template deletion accepts a successful empty response", async ({ page }) => {
  let deleted = false;
  await page.route("**/*api/labels", (route) => route.fulfill({ json: { templates: deleted ? [] : [{ id: "template-1", name: "Test template", layout: "NAME_PRICE", fields: ["name", "price"], widthMm: 40, heightMm: 30, isDefault: true }], profiles: [], jobs: [] } }));
  await page.route("**/*api/labels/templates/template-1", (route) => {
    expect(route.request().method()).toBe("DELETE");
    deleted = true;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/barcodes");
  await page.getByRole("button", { name: "Labels", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Saved template", exact: true })).toHaveValue("template-1");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Label template deleted.", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Saved template", exact: true })).toHaveValue("");
});

test("PDF download contains one correctly sized page per label copy", async ({ page }) => {
  await page.goto("/barcodes");
  await page.getByRole("button", { name: "Labels", exact: true }).click();
  await page.getByLabel("Copies for Sukari 1kg", { exact: true }).fill("2");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  const download = await downloaded;
  const path = await download.path();
  expect(path).toBeTruthy();
  const pdf = (await readFile(path!)).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(2);
  const boxes = [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
  expect(boxes).toHaveLength(2);
  for (const box of boxes) {
    expect(Number(box[1])).toBeCloseTo(40 * 72 / 25.4, 1);
    expect(Number(box[2])).toBeCloseTo(30 * 72 / 25.4, 1);
  }
});
