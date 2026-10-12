import { expect, test } from "@playwright/test";

test("menu preference save retries a transient network failure with the same replacement state", async ({ page }) => {
  const payloads: Array<{ hiddenMenuItems: string[] }> = [];
  let menuAttempts = 0;

  await page.addInitScript(() => localStorage.setItem("dukapilot_session_active", "1"));
  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/me")) {
      return route.fulfill({ json: { user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Shop" }, features: { staff: true } } } });
    }
    if (url.includes("/settings/menu") && route.request().method() === "PATCH") {
      menuAttempts += 1;
      payloads.push(route.request().postDataJSON());
      if (menuAttempts === 1) return route.abort("failed");
      return route.fulfill({ json: { hiddenMenuItems: payloads[1].hiddenMenuItems } });
    }
    if (url.includes("/settings")) {
      return route.fulfill({ json: { settings: { id: "owner-1", phone: "+255700000001", name: "Amina", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Shop", location: "Dar es Salaam", category: "grocery", isCatalogPublished: true, hiddenMenuItems: [] } } } });
    }
    if (url.includes("/barcodes/settings")) return route.fulfill({ json: { settings: {} } });
    if (url.includes("/push/preferences")) return route.fulfill({ json: { preferences: { lowStock: false, debtDue: false, subscriptionExpiry: false, dailyAssistant: false, privatePreview: true }, subscriptions: [], pushConfigured: false } });
    if (url.includes("/products/low-stock")) return route.fulfill({ json: { products: [] } });
    if (url.includes("/subscription/status")) return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    if (url.includes("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    return route.fulfill({ json: {} });
  });

  await page.goto("/settings");
  const assistantMenu = page.getByRole("checkbox", { name: "AI assistant visible in menu" });
  await expect(assistantMenu).toBeVisible();
  await assistantMenu.click();
  await expect.poll(() => menuAttempts).toBe(2);

  await expect(assistantMenu).not.toBeChecked();
  expect(menuAttempts).toBe(2);
  expect(payloads[0]).toEqual(payloads[1]);
  expect(payloads[0].hiddenMenuItems).toContain("/assistant");
});
