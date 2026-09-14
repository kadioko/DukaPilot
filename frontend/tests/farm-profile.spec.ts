import { expect, test } from "@playwright/test";

test("farm profiles remain clickable and drive group creation", async ({ page }) => {
  let profiles: Array<{ id: string; type: string; isActive: boolean }> = [];
  let createdGroup: Record<string, unknown> | null = null;

  await page.addInitScript(() => localStorage.setItem("dukapilot_language", "en"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/.*\/api\/.*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^.*\/api/, "");

    if (path === "/auth/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "owner-1",
            name: "Amina",
            role: "MERCHANT",
            language: "en",
            shop: { id: "shop-1", name: "Amina Poultry", category: "livestock" },
            features: { staff: true, assistant: true, exports: true },
          },
        }),
      });
    }

    if (path === "/farm" && request.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          profiles,
          groups: [],
          batches: [],
          conversions: [],
          pagination: { page: 1, limit: 12, total: 0, totalPages: 1 },
          summary: { activeGroups: 0, animals: 0, productionCount: 0, outputQuantity: 0, wasteQuantity: 0, lossAnimals: 0 },
        }),
      });
    }

    if (path === "/farm/profiles" && request.method() === "POST") {
      const body = request.postDataJSON() as { types: string[] };
      profiles = body.types.map((type, index) => ({ id: `profile-${index}`, type, isActive: true }));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ profiles }) });
    }

    if (path === "/farm/groups" && request.method() === "POST") {
      createdGroup = request.postDataJSON() as Record<string, unknown>;
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ group: { id: "group-1", ...createdGroup } }) });
    }

    if (path === "/products/low-stock") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ products: [], total: 0 }) });
    if (path === "/subscription/status") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "active", isActive: true, daysLeft: 30 }) });
    if (path === "/notifications") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ unreadCount: 0, notifications: [] }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/farm");
  const broilers = page.getByRole("checkbox", { name: /Broilers/i });
  await expect(broilers).toBeVisible();
  await broilers.check();
  await expect(page.getByText("You have unsaved profile changes.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add group" })).toBeDisabled();

  await page.getByRole("button", { name: "Save profiles" }).click();
  await expect(page.getByText("Profiles saved. You can now add a group below.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add group" })).toBeEnabled();

  await page.getByLabel("Group name").fill("Broiler house A");
  await page.getByLabel("Opening animals").fill("120");
  await expect(page.getByRole("combobox", { name: "Profile", exact: true })).toHaveValue("BROILERS");
  await page.getByRole("button", { name: "Add group" }).click();

  await expect.poll(() => createdGroup).not.toBeNull();
  expect(createdGroup).toMatchObject({ name: "Broiler house A", profileType: "BROILERS", currentAnimals: 120 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
