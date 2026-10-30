import { expect, test } from "@playwright/test";

test("shows validation error for invalid phone input", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[type="tel"]').fill("abc");
  await page.locator('input[inputmode="numeric"]').fill("1234");
  await page.locator('form button[type="submit"]').click();

  await expect(page.getByText(/valid phone number|nambari sahihi ya simu/i)).toBeVisible();
});

test("shows validation error for invalid pin input", async ({ page }) => {
  await page.goto("/");

  await page.locator('input[type="tel"]').fill("+255700000003");
  await page.locator('input[inputmode="numeric"]').fill("12");
  await page.locator('form button[type="submit"]').click();

  await expect(page.getByText(/pin must be 4 to 8 digits|PIN lazima iwe nambari 4 hadi 8/i)).toBeVisible();
});

test("shows login error for invalid credentials", async ({ page }) => {
  await page.route("**/*api/auth/login", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Invalid phone or PIN" }),
    });
  });

  await page.goto("/");

  await page.locator('input[type="tel"]').fill("+255700000003");
  await page.locator('input[inputmode="numeric"]').fill("9999");
  await page.locator('form button[type="submit"]').click();

  await expect(page.getByText(/invalid phone number or pin|nambari ya simu au PIN si sahihi/i)).toBeVisible();
});

test("retries a transient login network failure once", async ({ page }) => {
  let attempts = 0;
  await page.route("**/*api/auth/login", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.abort("failed");
      return;
    }

    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Invalid phone or PIN" }),
    });
  });

  await page.goto("/");
  await page.locator('input[type="tel"]').fill("+255700000003");
  await page.locator('input[inputmode="numeric"]').fill("9999");
  await page.locator('form button[type="submit"]').click();

  await expect(page.getByText(/invalid phone number or pin|nambari ya simu au PIN si sahihi/i)).toBeVisible();
  expect(attempts).toBe(2);
});

test("keeps a merchant on the current page and offers retry when session lookup is offline", async ({ page }) => {
  let sessionAttempts = 0;
  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_token", "playwright-merchant-token");
  });
  await page.route("**/*api/auth/me", async (route) => {
    sessionAttempts += 1;
    if (sessionAttempts <= 2) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({ json: { user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Shop" } } } });
  });
  await page.route("**/*api/products/low-stock*", async (route) => route.fulfill({ json: { products: [], total: 0 } }));
  await page.route("**/*api/subscription/status", async (route) => route.fulfill({ json: { daysLeft: 30, status: "active" } }));
  await page.route("**/*api/notifications", async (route) => route.fulfill({ json: { items: [], unreadCount: 0 } }));
  await page.route("**/*api/products/summary", async (route) => route.fulfill({ json: { summary: { total: 0, lowStock: 0, outOfStock: 0, inStock: 0, expiringSoon: 0, expired: 0 } } }));
  await page.route("**/*api/products?*", async (route) => route.fulfill({ json: { products: [] } }));
  await page.route("**/*api/suppliers", async (route) => route.fulfill({ json: { suppliers: [] } }));

  await page.goto("/inventory");

  await expect(page).toHaveURL(/\/inventory$/);
  await expect(page.getByRole("alert")).toContainText("Your sign-in is still saved");
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: /inventory/i })).toBeVisible();
  expect(sessionAttempts).toBe(3);
});

test("home page lets a returning merchant retry session detection after a network interruption", async ({ page }) => {
  let sessionAttempts = 0;
  await page.addInitScript(() => {
    window.localStorage.setItem("dukapilot_session_active", "1");
  });
  await page.route("**/*api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/me")) {
      sessionAttempts += 1;
      if (sessionAttempts <= 2) {
        await route.abort("failed");
        return;
      }
      await route.fulfill({ json: { user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en" } } });
      return;
    }
    if (path.endsWith("/dashboard")) {
      await route.abort("failed");
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText("Your sign-in is still saved");
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(sessionAttempts).toBe(3);
});

test("explains when a phone number has no account and offers registration", async ({ page }) => {
  await page.route("**/*api/auth/login", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "No account found for this phone number", code: "ACCOUNT_NOT_FOUND" }),
    });
  });

  await page.goto("/");
  await page.locator('input[type="tel"]').fill("+255700000003");
  await page.locator('input[inputmode="numeric"]').fill("9999");
  await page.locator('form button[type="submit"]').click();

  await expect(page.getByRole("alert").filter({ hasText: /no account with this phone number|hakuna akaunti yenye nambari hii/i })).toBeVisible();
  await page.getByRole("button", { name: /create an account|tengeneza akaunti/i }).click();
  await expect(page.getByRole("heading", { name: /register|jisajili/i })).toBeVisible();
});

test("mobile homepage keeps navigation compact until the menu is opened", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: /open menu|fungua menu/i })).toBeVisible();
  const headerHeight = await page.locator("header").evaluate((header) => header.getBoundingClientRect().height);
  expect(headerHeight).toBeLessThan(100);
  expect(await page.locator("header nav a:visible").count()).toBe(0);

  await page.getByRole("button", { name: /open menu|fungua menu/i }).click();
  await expect(page.locator('header nav:visible a[href="/pricing"]')).toHaveCount(1);
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasHorizontalOverflow).toBe(false);
});
