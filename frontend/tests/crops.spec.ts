import { expect, test } from "@playwright/test";

test("crop operations save inputs and harvests from a mobile-sized farm screen", async ({ page }) => {
  const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/.*\/api\/.*/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/api/, "");
    if (path === "/auth/me") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Farm", category: "farm" }, features: { staff: true, assistant: true, exports: true } } }) });
    if (path === "/crops" && request.method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      plots: [{ id: "plot-1", name: "Field A", location: "Kigamboni", areaMilli: 2000, areaUnit: "ACRE", isActive: true }],
      cycles: [{ id: "cycle-1", cropName: "Maize", status: "GROWING", plantedAt: "2026-08-01T12:00:00.000Z", expectedHarvestAt: "2026-10-01T12:00:00.000Z", plot: { id: "plot-1", name: "Field A", areaMilli: 2000, areaUnit: "ACRE", isActive: true }, inputUsages: [], harvestBatches: [] }],
      report: [{ id: "cycle-1", cropName: "Maize", status: "GROWING", plot: { id: "plot-1", name: "Field A", areaMilli: 2000, areaUnit: "ACRE", isActive: true }, harvestedQuantity: 0, remainingQuantity: 0, soldQuantity: 0, wasteQuantity: 0, inputCost: 0, costPerArea: 0, realizedProfit: 0, outputs: [] }],
      financialsVisible: true, summary: { activeCycles: 1, plots: 1, totalHarvested: 0, totalRemaining: 0, totalInputCost: 0 }, recentInputs: [], recentHarvests: [],
    }) });
    if (path === "/crops/products") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [{ id: "fertilizer", name: "NPK Fertilizer", unit: "kg", currentStock: 20 }, { id: "maize", name: "Maize grain", unit: "kg", currentStock: 0 }] }) });
    if (["/crops/inputs", "/crops/harvests"].includes(path) && request.method() === "POST") {
      requests.push({ path, body: request.postDataJSON() as Record<string, unknown> });
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(path.endsWith("inputs") ? { input: { id: "input-1" } } : { batch: { id: "harvest-1" } }) });
    }
    if (path === "/products/low-stock") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [], total: 0 }) });
    if (path === "/subscription/status") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "active", isActive: true, daysLeft: 30 }) });
    if (path === "/notifications") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ unreadCount: 0, notifications: [] }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/crops");
  await expect(page.getByRole("heading", { name: "Crop operations" })).toBeVisible();
  await expect(page.getByText("Inputs and harvests can safely wait to sync")).toBeVisible();

  await page.getByLabel("Stock product").selectOption("fertilizer");
  await page.getByLabel("Quantity (kg)").fill("2");
  await page.getByRole("button", { name: "Save input" }).click();
  await expect.poll(() => requests.find((item) => item.path === "/crops/inputs")?.body).toMatchObject({ cropCycleId: "cycle-1", productId: "fertilizer", quantity: 2, category: "SEED" });
  await expect.poll(() => requests.find((item) => item.path === "/crops/inputs")?.body.clientRequestId).toMatch(/^crop_/);

  await page.getByLabel("Harvest product").selectOption("maize");
  await page.getByLabel("This harvest").fill("25");
  await page.getByRole("button", { name: "Save harvest" }).click();
  await expect.poll(() => requests.find((item) => item.path === "/crops/harvests")?.body).toMatchObject({ cropCycleId: "cycle-1", outputProductId: "maize", actualYield: 25, wasteQuantity: 0 });
  await expect.poll(() => requests.find((item) => item.path === "/crops/harvests")?.body.clientRequestId).toMatch(/^crop_/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("field plan keeps money planning owner-only and gives farmers practical field controls", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/.*\/api\/.*/, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/api/, "");
    if (path === "/auth/me") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Farm", category: "farm" }, features: { staff: true, assistant: true } } }) });
    if (path === "/crops/operations") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      financialsVisible: true, financialPlanningVisible: true,
      cycles: [{ id: "cycle-1", cropName: "Tomatoes", status: "GROWING", plot: { name: "Greenhouse" }, harvestBatches: [{ id: "harvest-1", actualYield: 20, remainingQuantity: 20, harvestAt: "2026-09-14", outputProduct: { name: "Tomatoes - Greenhouse", unit: "kg" }, grades: [] }], seasonBudget: null }],
      irrigationLogs: [], tasks: [], contracts: [], weatherAlerts: [], farmStaff: [{ id: "staff-1", name: "Juma" }],
    }) });
    if (path === "/subscription/status") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "active", isActive: true, daysLeft: 30 }) });
    if (path === "/notifications") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ unreadCount: 0, notifications: [] }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/crops/operations");
  await expect(page.getByRole("heading", { name: "Field plan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Record irrigation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Season budget", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buyer commitment", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
