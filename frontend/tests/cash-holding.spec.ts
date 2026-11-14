import { expect, test } from "@playwright/test";

test("owner cash screen keeps an uncertain movement retry-safe across reload", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  let epoch: { id: string; mode: string; openingAmount: number; openedAt: string } | null = null;
  let balance = 0;
  let savedMovement: { id: string; epochId: string; kind: string; amount: number; note: string | null; createdAt: string; reversal: null; reversesMovementId: null; epoch: { mode: string; openedAt: string } } | null = null;
  let firstMovementKey = "";
  let movementAttempts = 0;
  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/_?api/, "");
    if (path === "/auth/me") return route.fulfill({ json: { user: { id: "owner-1", name: "Owner", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Demo" }, features: {} } } });
    if (path === "/cash-holding" && route.request().method() === "GET") return route.fulfill({ json: { epoch, balance: epoch ? balance : null, movements: savedMovement ? [savedMovement] : [], pagination: { page: 1, totalPages: 1 } } });
    if (path === "/cash-holding/handovers") return route.fulfill({ json: { sessions: [], pagination: { page: 1, totalPages: 0 } } });
    if (path === "/cash-holding/count" && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.mode).toBe("MANUAL");
      expect(body.countedCash).toBe(10000);
      expect(body.expectedEpochId).toBeNull();
      epoch = { id: "epoch-1", mode: "MANUAL", openingAmount: 10000, openedAt: "2026-11-14T09:00:00.000Z" };
      balance = 10000;
      return route.fulfill({ json: { epoch, replayed: false } });
    }
    if (path === "/cash-holding/movements" && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      movementAttempts += 1;
      if (!firstMovementKey) {
        firstMovementKey = body.requestKey;
        expect(body.kind).toBe("BANK_DEPOSIT");
        expect(body.amount).toBe(3000);
        balance -= 3000;
        savedMovement = { id: "movement-1", epochId: "epoch-1", kind: body.kind, amount: -3000, note: body.note, createdAt: "2026-11-14T10:00:00.000Z", reversal: null, reversesMovementId: null, epoch: { mode: "MANUAL", openedAt: "2026-11-14T09:00:00.000Z" } };
        return route.abort("failed");
      }
      expect(body.requestKey).toBe(firstMovementKey);
      return route.fulfill({ json: { movement: savedMovement, replayed: true } });
    }
    if (path === "/subscription/status") return route.fulfill({ json: { status: "active", isActive: true, daysLeft: 30 } });
    if (path === "/notifications") return route.fulfill({ json: { items: [], unreadCount: 0 } });
    return route.fulfill({ json: { products: [] } });
  });

  await page.goto("/cash-on-hand");
  await expect(page.getByRole("heading", { name: "Cash on hand" })).toBeVisible();
  await page.getByLabel("Cash physically counted (TZS)").fill("10000");
  await page.getByLabel(/I physically counted/).check();
  await page.getByRole("button", { name: "Save count" }).click();
  await expect(page.getByText("TZS 10,000", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Type", exact: true }).selectOption("BANK_DEPOSIT");
  await page.getByLabel("Amount (TZS)").fill("3000");
  await page.getByLabel("Note / destination").fill("Bank branch");
  await page.getByRole("button", { name: "Save movement" }).click();
  await expect(page.getByText(/request is unconfirmed/i)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/request is unconfirmed/i)).toBeVisible();
  await page.getByRole("button", { name: "Retry request" }).click();
  await expect(page.getByText("TZS 7,000", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem").getByText("Taken to bank", { exact: true })).toBeVisible();
  expect(movementAttempts).toBe(2);
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
