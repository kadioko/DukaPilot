import { expect, test } from "@playwright/test";

test("egg production stocks full trays and loose good eggs separately on mobile", async ({ page }) => {
  const products = [
    { id: "egg", name: "Single egg", unit: "egg", currentStock: 10, buyingPrice: 400 },
    { id: "tray", name: "Tray of 30 eggs", unit: "tray", currentStock: 0, buyingPrice: 0 },
    { id: "feed", name: "Layers feed", unit: "kg", currentStock: 50, buyingPrice: 1500 },
  ];
  let production: Record<string, unknown> | null = null;

  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/.*\/_?api\/.*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/_?api/, "");
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/me") return json({ user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Poultry", category: "livestock" }, features: { staff: true, assistant: true, exports: true } } });
    if (path === "/farm" && request.method() === "GET") return json({
      configuration: { hasLivestock: true, hasCrops: false, needsSetup: false, preferredEggStockMode: "EGGS" },
      profiles: [{ id: "profile-1", type: "LAYERS", isActive: true }],
      groups: [{ id: "group-1", name: "House A", profileType: "LAYERS", currentAnimals: 100, isActive: true }],
      batches: [], conversions: [], pagination: { page: 1, total: 0, totalPages: 1 },
      summary: { activeGroups: 1, animals: 100, productionCount: 0, outputQuantity: 0, brokenEggs: 0, wasteQuantity: 0, lossAnimals: 0 },
    });
    if (path === "/farm/products") return json({ products: products.filter((product) => product.name.toLowerCase().includes((url.searchParams.get("search") || "").toLowerCase())) });
    if (path === "/farm/production" && request.method() === "POST") {
      production = request.postDataJSON() as Record<string, unknown>;
      return json({ batch: { id: "batch-1", outputProduct: { unit: "egg" }, unitCost: 400, autoPackConversion: { outputQuantity: 2 } } }, 201);
    }
    if (path === "/products/low-stock") return json({ products: [], total: 0 });
    if (path === "/subscription/status") return json({ status: "active", isActive: true, daysLeft: 30 });
    if (path === "/notifications") return json({ unreadCount: 0, notifications: [] });
    return json({});
  });

  await page.goto("/farm");
  await expect(page.getByRole("tab", { name: "Daily work" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Record production" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Production records and history" })).toBeHidden();
  await page.getByRole("button", { name: "Trays + leftover eggs" }).click();

  const singleEgg = page.getByText("Single-egg inventory product").locator("..");
  await singleEgg.getByPlaceholder("Search products").fill("Single egg");
  await singleEgg.getByRole("button", { name: /Single egg/ }).click();
  const tray = page.getByText("Tray inventory product (30 eggs)").locator("..");
  await tray.getByPlaceholder("Search products").fill("Tray of 30");
  await tray.getByRole("button", { name: /Tray of 30 eggs/ }).click();
  await page.getByLabel("Full trays of good eggs").fill("2");
  await page.getByLabel("Extra good eggs (0-29)").fill("15");
  await page.getByLabel("Broken eggs", { exact: true }).fill("5");
  await page.getByLabel("Expected count").fill("80");
  const feed = page.getByText("Add supply").locator("..");
  await feed.getByPlaceholder("Search products").fill("Layers feed");
  await feed.getByRole("button", { name: /Layers feed/ }).click();
  await page.getByLabel("Used").fill("1.5");
  await expect(page.getByText(/2 trays, 15 single eggs/)).toBeVisible();
  await page.getByRole("button", { name: "Save production" }).click();
  await expect.poll(() => production).not.toBeNull();
  expect(production).toMatchObject({ groupId: "group-1", type: "EGGS", outputProductId: "egg", trayProductId: "tray", eggStockMode: "TRAYS", expectedYield: 80, actualYield: 80, brokenQuantity: 5, items: [{ productId: "feed", quantity: 1.5 }] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "Production history" })).toBeVisible();
});
