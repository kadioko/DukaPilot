import { expect, test } from "@playwright/test";

test("primary owner can opt in and later revoke external AI even when it becomes unavailable", async ({ page }) => {
  let enabled = false;
  let available = true;
  const consentWrites: Array<{ enabled: boolean }> = [];

  await page.addInitScript(() => localStorage.setItem("dukapilot_session_active", "1"));
  await page.route("**/*api/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/auth/me")) {
      return route.fulfill({ json: { user: { id: "owner-1", name: "Amina", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Amina Shop" }, features: { assistant: true } } } });
    }
    if (url.includes("/settings/external-ai") && route.request().method() === "PATCH") {
      enabled = route.request().postDataJSON().enabled;
      consentWrites.push({ enabled });
      if (enabled) available = false;
      return route.fulfill({ json: { externalAi: { available, enabled, canManage: true, consentAt: enabled ? new Date().toISOString() : null, dailyLimit: 10 } } });
    }
    if (url.includes("/settings")) {
      return route.fulfill({ json: { settings: { id: "owner-1", phone: "+255700000001", name: "Amina", role: "MERCHANT", language: "en", externalAi: { available, enabled, canManage: true, dailyLimit: 10 }, shop: { id: "shop-1", name: "Amina Shop", location: "Dar es Salaam", category: "grocery", isCatalogPublished: true, hiddenMenuItems: [] } } } });
    }
    if (url.includes("/barcodes/settings")) return route.fulfill({ json: { settings: {} } });
    if (url.includes("/push/preferences")) return route.fulfill({ json: { preferences: { lowStock: false, debtDue: false, subscriptionExpiry: false, dailyAssistant: false, privatePreview: true }, subscriptions: [], pushConfigured: false } });
    if (url.includes("/products/low-stock")) return route.fulfill({ json: { products: [] } });
    if (url.includes("/subscription/status")) return route.fulfill({ json: { status: "active", daysLeft: 30 } });
    if (url.includes("/notifications")) return route.fulfill({ json: { items: [], unreadCount: 0 } });
    return route.fulfill({ json: {} });
  });

  await page.goto("/settings");
  const consent = page.getByRole("checkbox", { name: "Enable Cloudflare AI" });
  await expect(consent).toBeVisible();
  await expect(page.getByText(/only questions the local assistant cannot answer are sent to Cloudflare AI/i)).toBeVisible();

  await consent.click();
  await expect.poll(() => consentWrites.length).toBe(1);
  await expect(consent).toBeChecked();
  await expect(page.getByText("External AI is unavailable. The local assistant will continue to work.")).toBeVisible();
  await expect(page.getByText("Cloudflare AI is enabled for this business.")).toBeVisible();
  await expect(consent).toBeEnabled();

  await consent.click();
  await expect.poll(() => consentWrites.length).toBe(2);
  await expect(consent).not.toBeChecked();
  await expect(page.getByText("Cloudflare AI is turned off.")).toBeVisible();
  expect(consentWrites).toEqual([{ enabled: true }, { enabled: false }]);
});
