import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/*api/products/low-stock*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products: [], total: 0 }),
    });
  });
});

test("inventory supports add, edit, and stock adjustment flows", async ({ page }) => {
  const suppliers = [{ id: "sup-1", name: "Jumla Traders", phone: "+255700000001" }];
  const products = [
    {
      id: "prod-1",
      name: "Mchele Super",
      sku: "MCH001",
      unit: "kg",
      buyingPrice: 2800,
      sellingPrice: 3200,
      currentStock: 12,
      minimumStock: 5,
      isActive: true,
      expiryDate: null,
      doesNotExpire: true,
      supplier: suppliers[0],
    },
  ];

  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-merchant-token");
  });

  await page.route("**/*api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          name: "Test Merchant",
          role: "MERCHANT",
          language: "en",
          shop: { name: "Test Shop" },
        },
      }),
    });
  });

  await page.route("**/*api/products/summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ summary: { total: products.length, lowStock: 0, outOfStock: 0, inStock: products.length, expiringSoon: 0, expired: 0 } }),
    });
  });

  await page.route("**/*api/subscription/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "active", daysLeft: 30 }) });
  });

  await page.route("**/*api/notifications", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], unreadCount: 0 }) });
  });

  await page.route("**/*api/suppliers", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ suppliers }),
    });
  });

  await page.route("**/*api/products?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products }),
    });
  });

  await page.route("**/*api/products", async (route) => {
    if (route.request().method() !== "POST") {
      await route.fallback();
      return;
    }

    const body = JSON.parse(route.request().postData() || "{}");
    products.unshift({
      id: `prod-${products.length + 1}`,
      isActive: true,
      supplier: suppliers.find((item) => item.id === body.supplierId),
      ...body,
    });

    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ product: products[0] }),
    });
  });

  await page.route("**/*api/products/*", async (route) => {
    if (route.request().method() !== "PATCH") {
      await route.fallback();
      return;
    }

    const body = JSON.parse(route.request().postData() || "{}");
    expect(body).not.toHaveProperty("currentStock");
    if (body.name === "Failure Product") {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Could not save product" }) });
      return;
    }
    const productId = route.request().url().split("/").pop();
    const product = products.find((item) => item.id === productId);
    if (product) {
      Object.assign(product, body, {
        supplier: suppliers.find((item) => item.id === body.supplierId) || product.supplier,
      });
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ product }),
    });
  });

  await page.route("**/*api/stock/adjust", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    const product = products.find((item) => item.id === body.productId);
    if (product) {
      if (body.type === "IN") product.currentStock += Number(body.quantity);
      if (body.type === "OUT") product.currentStock -= Number(body.quantity);
      if (body.type === "ADJUSTMENT") product.currentStock = Number(body.quantity);
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ product, movement: { id: "move-1" } }),
    });
  });

  await page.route("**/*api/products/import-csv", async (route) => {
    expect(route.request().method()).toBe("POST");
    const body = JSON.parse(route.request().postData() || "{}");
    if (body.csv.includes("Broken price")) {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "The CSV has errors. Fix them and import again.",
          code: "PRODUCT_CSV_INVALID",
          details: [{ row: 2, field: "buyingPrice", message: "buyingPrice is required" }],
        }),
      });
      return;
    }
    expect(body.csv).toContain("Soda 300ml");
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ count: 1, products: [] }),
    });
  });

  await page.goto("/inventory");

  await expect(page.getByRole("heading", { name: /inventory|hifadhi ya bidhaa/i })).toBeVisible();
  await expect(page.getByText("Mchele Super")).toBeVisible();

  await page.getByRole("button", { name: /add product|ongeza bidhaa/i }).click();
  await expect(page.getByText(/add new product|ongeza bidhaa mpya/i)).toBeVisible();
  await page.getByLabel(/product name|jina la bidhaa/i).fill("Sukari White");
  await page.getByLabel(/sku/i).fill("SKR001");
  await page.getByLabel(/buying price|bei ya kununua/i).fill("3000");
  await page.getByLabel(/selling price|bei ya kuuza/i).fill("3500");
  await page.getByLabel(/current stock|idadi iliyopo/i).fill("8");
  await page.getByLabel(/minimum stock|kiwango cha chini/i).fill("2");
  await page.getByLabel(/^supplier$|^msambazaji$/i).selectOption("sup-1");
  await page.getByLabel(/does not expire|haiishi muda/i).check();
  await page.getByLabel(/^save$|^hifadhi$/i).click();

  await expect(page.getByText("Sukari White")).toBeVisible();
  await expect(page.getByText(/tzs 3,500/i)).toBeVisible();

  await page.getByLabel(/actions for sukari white|vitendo vya sukari white/i).click();
  await page.getByRole("button", { name: /^edit$|^hariri$/i }).click();
  await expect(page.getByText(/edit product|hariri bidhaa/i)).toBeVisible();
  await page.getByLabel(/product name|jina la bidhaa/i).fill("");
  await page.getByLabel(/product name|jina la bidhaa/i).fill("Sukari Brown");
  await page.getByLabel(/selling price|bei ya kuuza/i).fill("");
  await page.getByLabel(/selling price|bei ya kuuza/i).fill("3600");
  await page.getByLabel(/^save$|^hifadhi$/i).click();

  await expect(page.getByText("Sukari Brown")).toBeVisible();
  await expect(page.getByText(/tzs 3,600/i)).toBeVisible();

  await page.getByLabel(/adjust stock sukari brown|rekebisha hifadhi sukari brown/i).click();
  await expect(page.getByText(/adjust stock|rekebisha hifadhi/i)).toBeVisible();
  await page.getByLabel(/set amount|rekebisha/i).click();
  await page.getByLabel(/new quantity|idadi mpya/i).fill("25");
  await page.getByLabel(/note|maelezo/i).fill("Stock take correction");
  await page.getByLabel(/^save$|^hifadhi$/i).click();

  await expect(page.getByText(/25 pcs/)).toBeVisible();

  await page.getByRole("button", { name: /import csv|ingiza csv/i }).click();
  await expect(page.getByText(/import products from csv|ingiza bidhaa kwa csv/i)).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: "products.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,buyingPrice,sellingPrice\nSoda 300ml,500,800\n"),
  });
  await page.getByRole("button", { name: /import products|ingiza bidhaa$/i }).click();
  await expect(page.getByText(/1 products imported|bidhaa 1 zimeongezwa/i)).toBeVisible();

  await page.getByRole("button", { name: /import csv|ingiza csv/i }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "broken-products.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,buyingPrice,sellingPrice\nBroken price,,800\n"),
  });
  await page.getByRole("button", { name: /import products|ingiza bidhaa$/i }).click();
  await expect(page.getByText(/row 2 - buyingPrice/i)).toBeVisible();
  await expect(page.getByText("buyingPrice is required")).toBeVisible();
  await page.getByRole("button", { name: /^cancel$|^ghairi$/i }).click();

  await page.getByLabel(/actions for sukari brown|vitendo vya sukari brown/i).click();
  await page.getByRole("button", { name: /^edit$|^hariri$/i }).click();
  await page.getByLabel(/product name|jina la bidhaa/i).fill("Failure Product");
  await page.getByLabel(/^save$|^hifadhi$/i).click();
  await expect(page.getByText("Could not save product")).toBeVisible();
  await expect(page.getByText(/edit product|hariri bidhaa/i)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflow).toBe(false);
});

test("inventory shows the real total and lets merchants reach later product pages", async ({ page }) => {
  const products = Array.from({ length: 101 }, (_, index) => ({
    id: `prod-${index + 1}`,
    name: `Product ${String(index + 1).padStart(3, "0")}`,
    sku: `SKU${index + 1}`,
    unit: "pcs",
    buyingPrice: 1000,
    sellingPrice: 1500,
    currentStock: 10,
    minimumStock: 5,
    isActive: true,
    expiryDate: null,
    doesNotExpire: true,
  }));

  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-merchant-token");
  });

  await page.route("**/*api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { name: "Test Merchant", role: "MERCHANT", language: "en", shop: { name: "Test Shop" } } }),
    });
  });
  await page.route("**/*api/products/summary", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary: { total: products.length, lowStock: 0, outOfStock: 0, inStock: products.length, expiringSoon: 0, expired: 0 } }) });
  });
  await page.route("**/*api/suppliers", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suppliers: [] }) });
  });
  await page.route("**/*api/subscription/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "active", daysLeft: 30 }) });
  });
  await page.route("**/*api/notifications", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], unreadCount: 0 }) });
  });
  await page.route("**/*api/products?*", async (route) => {
    const url = new URL(route.request().url());
    const currentPage = Number(url.searchParams.get("page") || "1");
    const limit = Number(url.searchParams.get("limit") || "50");
    const start = (currentPage - 1) * limit;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products: products.slice(start, start + limit),
        pagination: { page: currentPage, limit, total: products.length, totalPages: Math.ceil(products.length / limit) },
      }),
    });
  });

  await page.goto("/inventory");

  await expect(page.getByText("101", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Product 001")).toBeVisible();
  await expect(page.getByText("Product 101")).not.toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("Product 051")).toBeVisible();
  await expect(page.getByText("51-100 of 101 products")).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("Product 101")).toBeVisible();
  await expect(page.getByText("101-101 of 101 products")).toBeVisible();
});

test("stock staff can load inventory without an admin-access warning", async ({ page }) => {
  const products = [{
    id: "staff-product-1",
    name: "Brake Pads",
    unit: "pcs",
    buyingPrice: 12000,
    sellingPrice: 18000,
    currentStock: 7,
    minimumStock: 2,
    isActive: true,
    expiryDate: null,
    doesNotExpire: true,
  }];

  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-stock-staff-token");
  });
  await page.route("**/*api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          name: "KD Team",
          role: "MERCHANT",
          language: "en",
          shop: { name: "KD Spare Parts" },
          staff: { role: "CASHIER", permissions: { canSell: true, canManageStock: true, canManageFarm: false, canManageStaff: false, canViewReports: false, canRecordExpenses: false, canManageCashSessions: false, canViewQuotations: false } },
        },
      }),
    });
  });
  await page.route("**/*api/products/summary", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ summary: { total: products.length, lowStock: 0, outOfStock: 0, inStock: products.length, expiringSoon: 0, expired: 0 } }) });
  });
  await page.route("**/*api/products?*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products }) });
  });
  await page.route("**/*api/suppliers", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suppliers: [] }) });
  });
  await page.route("**/*api/subscription/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "active", daysLeft: 30 }) });
  });
  await page.route("**/*api/notifications", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], unreadCount: 0 }) });
  });

  await page.goto("/inventory");

  await expect(page.getByText("Brake Pads")).toBeVisible();
  await expect(page.getByText("Platform admin access is not available to staff sessions")).not.toBeVisible();
});

test("inventory filters stock status, supplier, and expiry without hiding other products", async ({ page }) => {
  const suppliers = [
    { id: "supplier-1", name: "Jumla Traders", phone: "+255700000001" },
    { id: "supplier-2", name: "Mtaa Parts", phone: "+255700000002" },
  ];
  const products = [
    { id: "available", name: "Brake Pads", unit: "pcs", buyingPrice: 12000, sellingPrice: 18000, currentStock: 12, minimumStock: 5, isActive: true, doesNotExpire: true, supplier: suppliers[0] },
    { id: "low", name: "Engine Oil", unit: "litre", buyingPrice: 8000, sellingPrice: 12000, currentStock: 2, minimumStock: 5, isActive: true, doesNotExpire: false, expiryDate: "2026-10-01T00:00:00.000Z", supplier: suppliers[0] },
    { id: "out", name: "Spark Plug", unit: "pcs", buyingPrice: 3000, sellingPrice: 5000, currentStock: 0, minimumStock: 3, isActive: true, doesNotExpire: true, supplier: suppliers[1] },
    { id: "expired", name: "Expired Coolant", unit: "litre", buyingPrice: 5000, sellingPrice: 8000, currentStock: 8, minimumStock: 2, isActive: true, doesNotExpire: false, expiryDate: "2026-01-01T00:00:00.000Z", supplier: suppliers[1] },
  ];

  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-merchant-token");
  });
  await page.route("**/*api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { name: "Test Merchant", role: "MERCHANT", language: "en", shop: { name: "Test Shop" } } }),
    });
  });
  await page.route("**/*api/products/summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ summary: { total: 4, lowStock: 1, outOfStock: 1, inStock: 3, expiringSoon: 1, expired: 1 } }),
    });
  });
  await page.route("**/*api/suppliers", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suppliers }) });
  });
  await page.route("**/*api/subscription/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "active", daysLeft: 30 }) });
  });
  await page.route("**/*api/notifications", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [], unreadCount: 0 }) });
  });
  await page.route("**/*api/products?*", async (route) => {
    const url = new URL(route.request().url());
    const stockStatus = url.searchParams.get("stockStatus") || "ALL";
    const expiryStatus = url.searchParams.get("expiryStatus") || "ALL";
    const supplierId = url.searchParams.get("supplierId") || "";
    const filtered = products.filter((product) => {
      if (stockStatus === "LOW" && !(product.currentStock > 0 && product.currentStock <= product.minimumStock)) return false;
      if (stockStatus === "OUT" && product.currentStock !== 0) return false;
      if (stockStatus === "IN_STOCK" && product.currentStock <= 0) return false;
      if (expiryStatus === "EXPIRING_SOON" && product.id !== "low") return false;
      if (expiryStatus === "EXPIRED" && product.id !== "expired") return false;
      return !supplierId || product.supplier?.id === supplierId;
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ products: filtered, pagination: { page: 1, limit: 50, total: filtered.length, totalPages: 1 } }),
    });
  });

  await page.goto("/inventory");
  await expect(page.getByText("Brake Pads")).toBeVisible();

  await page.getByRole("button", { name: /low stock/i }).click();
  await expect(page.getByText("Engine Oil")).toBeVisible();
  await expect(page.getByText("Spark Plug")).not.toBeVisible();

  await page.getByRole("button", { name: /out of stock/i }).click();
  await expect(page.getByText("Spark Plug")).toBeVisible();
  await expect(page.getByText("Engine Oil")).not.toBeVisible();

  await page.getByRole("button", { name: /all products/i }).click();
  await page.getByLabel("Expiry").selectOption("EXPIRED");
  await expect(page.getByText("Expired Coolant")).toBeVisible();
  await expect(page.getByText("Brake Pads")).not.toBeVisible();

  await page.getByRole("button", { name: /clear filters/i }).click();
  await page.getByLabel("Supplier filter").selectOption("supplier-1");
  await expect(page.getByText("Brake Pads")).toBeVisible();
  await expect(page.getByText("Engine Oil")).toBeVisible();
  await expect(page.getByText("Spark Plug")).not.toBeVisible();
});
