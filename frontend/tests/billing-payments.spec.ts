import { expect, test } from "@playwright/test";

test("billing offers AzamPesa, preserves failed reference and separates online payment", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    const data = url.includes("auth/me") ? { user: { name: "Demo", role: "MERCHANT", language: "sw", shop: { name: "Demo shop" }, features: {} } }
      : url.includes("subscription/status") ? { plan: "BASIC", isActive: true, subActive: true, status: "active", daysLeft: 10 }
      : url.includes("subscription/quote") ? { amount: 15000, monthlyAmount: 15000 }
      : url.includes("subscription/checkout") ? { enabled: false, prices: { BASIC: 15000, PRO: 35000 }, pending: null }
      : url.includes("reports/my") ? { reports: [] }
      : url.includes("notifications") ? { items: [], unreadCount: 0 }
      : { products: [] };
    if (url.endsWith("/reports") && route.request().method() === "POST") return route.fulfill({ status: 500, json: { error: "Please try again" } });
    await route.fulfill({ json: data });
  });
  await page.goto("/billing");
  await expect(page.getByText("AzamPesa Lipa Number", { exact: true })).toBeVisible();
  await expect(page.getByText("Selcom Lipa Number", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nakili 293726045" })).toBeVisible();
  await page.getByLabel("Reference ya malipo", { exact: true }).fill("TEST12345");
  await page.getByRole("button", { name: "Tuma kwa admin", exact: true }).click();
  await expect(page.getByLabel("Reference ya malipo", { exact: true })).toHaveValue("TEST12345");
  await expect(page.getByText("Please try again", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/billing-mobile.png", fullPage: true });
  await page.getByLabel("2. nTZS online", { exact: true }).check();
  await expect(page.getByText("Malipo ya nTZS hayapatikani", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Reference ya malipo", { exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/billing-desktop.png", fullPage: true });
});

test("online payment waits for server confirmation before refreshing subscription", async ({ page }) => {
  let payments = 0;
  let confirmed = false;
  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/subscription/checkout") && route.request().method() === "POST") {
      payments++;
      expect(route.request().postDataJSON().plan).toBe("BASIC");
      return route.fulfill({ json: { id: "checkout-1", status: "PENDING", amount: 15000, plan: "BASIC" } });
    }
    if (url.endsWith("/checkout/checkout-1/check")) {
      confirmed = true;
      return route.fulfill({ json: { id: "checkout-1", status: "CONFIRMED", amount: 15000, plan: "BASIC" } });
    }
    const data = url.includes("auth/me") ? { user: { name: "Demo", role: "MERCHANT", language: "sw", shop: { name: "Demo" }, features: {} } }
      : url.includes("subscription/status") ? { plan: "BASIC", status: confirmed ? "active" : "expired", isActive: true, subActive: confirmed, daysLeft: confirmed ? 30 : 0 }
      : url.includes("subscription/quote") ? { amount: 15000, monthlyAmount: 15000 }
      : url.includes("subscription/checkout") ? { enabled: true, prices: { BASIC: 15000, PRO: 35000 }, pending: null }
      : url.includes("reports/my") ? { reports: [] } : { items: [], products: [], unreadCount: 0 };
    await route.fulfill({ json: data });
  });
  await page.goto("/billing");
  await page.getByLabel("2. nTZS online", { exact: true }).check();
  await page.getByLabel("Namba ya simu ya kulipia", { exact: true }).fill("0712345678");
  await expect(page.getByText("M-Pesa, Airtel Money, Mix by Yas", { exact: false })).toBeVisible();
  await expect(page.getByText("mpango uwashwe baada ya nTZS", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Tuma ombi la malipo", exact: true }).click();
  await expect(page.getByText("Ombi limetumwa. Thibitisha kwenye simu", { exact: false })).toBeVisible();
  expect(payments).toBe(1);
  expect(confirmed).toBe(false);
  await page.getByRole("button", { name: "Angalia malipo", exact: true }).click();
  await expect(page.getByText("Malipo yamethibitishwa.", { exact: false })).toBeVisible();
  await expect(page.getByText("Inatumika", { exact: true })).toBeVisible();
  expect(payments).toBe(1);
});

test("a payment in review uses the idempotent recovery route", async ({ page }) => {
  let retried = 0;
  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/checkout/checkout-review/retry") && route.request().method() === "POST") {
      retried++;
      return route.fulfill({ json: { id: "checkout-review", status: "PENDING", amount: 15000, plan: "BASIC" } });
    }
    const data = url.includes("auth/me") ? { user: { name: "Demo", role: "MERCHANT", language: "sw", shop: { name: "Demo" }, features: {} } }
      : url.includes("subscription/status") ? { plan: "BASIC", status: "expired", isActive: true, subActive: false, daysLeft: 0 }
      : url.includes("subscription/quote") ? { amount: 15000, monthlyAmount: 15000 }
      : url.includes("subscription/checkout") ? { enabled: true, prices: { BASIC: 15000, PRO: 35000 }, pending: { id: "checkout-review", status: "REVIEW", amount: 15000, plan: "BASIC" } }
      : url.includes("reports/my") ? { reports: [] } : { items: [], products: [], unreadCount: 0 };
    await route.fulfill({ json: data });
  });

  await page.goto("/billing");
  await page.getByLabel("2. nTZS online", { exact: true }).check();
  await expect(page.getByText("Malipo yanahitaji uhakiki", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Angalia malipo", exact: true }).click();
  await expect(page.getByText("Ombi limetumwa. Thibitisha kwenye simu", { exact: false })).toBeVisible();
  expect(retried).toBe(1);
});
