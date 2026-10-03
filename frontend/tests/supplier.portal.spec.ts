import { expect, test } from "@playwright/test";

test("merchant can add a clearly private supplier to their own business", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("dukapilot_token", "supplier-owner-token"));
  let createdSupplier: Record<string, unknown> | null = null;
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/me")) return route.fulfill({ json: { user: { id: "owner", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Shop" } } } });
    if (url.pathname.endsWith("/suppliers") && route.request().method() === "GET") return route.fulfill({ json: { suppliers: createdSupplier ? [createdSupplier] : [] } });
    if (url.pathname.endsWith("/suppliers") && route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      createdSupplier = { id: "supplier-1", ...submitted, createdByShopId: "shop-1", canEdit: true, verificationStatus: "NEEDS_REVIEW", _count: { products: 0, orders: 0, catalogProducts: 0 } };
      return route.fulfill({ status: 201, json: { supplier: createdSupplier } });
    }
    return route.fulfill({ json: {} });
  });

  await page.goto("/suppliers");
  await page.getByRole("button", { name: "Add Supplier" }).click();
  await expect(page.getByText("This supplier is visible only to your business and DukaPilot administrators. They will not be added to the shared supplier directory.")).toBeVisible();
  await page.getByLabel("Company Name").fill("Mlimani Wholesale");
  await page.getByLabel("Phone Number").fill("+255 712 345 678");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Your private supplier")).toBeVisible();
  expect(submitted).toMatchObject({ name: "Mlimani Wholesale", phone: "+255 712 345 678" });
});

test("supplier can confirm, dispatch, and cancel portal orders", async ({ page }) => {
  const orders = [
    {
      id: "ord-pending-1",
      status: "PENDING",
      totalAmount: 24000,
      createdAt: "2026-04-03T08:00:00.000Z",
      note: "Pakia mapema",
      shop: { name: "Duka la Amina", location: "Mbagala", district: "Temeke" },
      items: [{ product: { name: "Unga", unit: "bag" }, quantity: 5 }],
    },
    {
      id: "ord-pending-2",
      status: "PENDING",
      totalAmount: 15000,
      createdAt: "2026-04-03T09:00:00.000Z",
      shop: { name: "Duka la Juma", location: "Tegeta", district: "Kinondoni" },
      items: [{ product: { name: "Mafuta", unit: "litre" }, quantity: 3 }],
    },
    {
      id: "ord-confirmed-1",
      status: "CONFIRMED",
      totalAmount: 18000,
      createdAt: "2026-04-03T10:00:00.000Z",
      shop: { name: "Duka la Rehema", location: "Buguruni", district: "Ilala" },
      items: [{ product: { name: "Sukari", unit: "bag" }, quantity: 2 }],
    },
  ];

  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-supplier-token");
  });

  await page.route("**/*api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ user: { name: "Jumla Traders", role: "SUPPLIER", language: "sw", supplier: { name: "Jumla Traders" } } }),
    });
  });

  await page.route("**/*api/suppliers/portal/products", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [] }) });
  });

  await page.route("**/*api/suppliers/portal/dashboard", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ordersByStatus: { PENDING: 2, CONFIRMED: 1, OUT_FOR_DELIVERY: 0, DELIVERED: 0 },
        pendingOrders: [orders[0]],
      }),
    });
  });

  await page.route("**/*api/suppliers/portal/orders", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ orders }),
    });
  });

  await page.route("**/*api/suppliers/portal/orders/*/status", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    const orderId = route.request().url().split("/").slice(-2)[0];
    const order = orders.find((item) => item.id === orderId);
    if (order) {
      order.status = body.status;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/supplier");

  await expect(page.getByText(/portal ya wasambazaji/i)).toBeVisible();
  await expect(page.getByText("Duka la Amina")).toBeVisible();
  await expect(page.getByText("Duka la Juma")).toBeVisible();

  await page.getByRole("button", { name: /expand order duka la amina/i }).click();
  await page.getByRole("button", { name: /thibitisha/i }).click();

  await page.getByRole("button", { name: /zilizothibitishwa/i }).click();
  await expect(page.getByText("Duka la Amina")).toBeVisible();
  await expect(page.getByText("Duka la Rehema")).toBeVisible();
  await expect(page.locator("div.bg-white.rounded-xl.border").filter({ hasText: "Duka la Amina" }).getByText(/zilizothibitishwa/i)).toBeVisible();
  await page.getByRole("button", { name: /safirishwa duka la amina/i }).click();
  await page.getByRole("button", { name: /zinakwenda/i }).click();
  await expect(page.getByText("Duka la Amina")).toBeVisible();
  await expect(page.locator("div.bg-white.rounded-xl.border").filter({ hasText: "Duka la Amina" }).locator("span").filter({ hasText: "Zinakwenda" })).toBeVisible();
  await expect(page.getByText(/inasubiri uthibitisho wa mpokeaji/i)).toBeVisible();

  await page.getByRole("button", { name: /zinazosubiri/i }).click();
  await page.getByRole("button", { name: /expand order duka la juma/i }).click();
  await page.getByRole("button", { name: /kataa agizo duka la juma/i }).click();
  await page.getByRole("button", { name: /yote/i }).click();
  await expect(page.getByText(/imefutwa/i)).toBeVisible();
});
