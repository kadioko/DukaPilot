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

test("owner Automatic mode records a fresh count and avoids duplicate cash entries", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let epoch: { id: string; mode: string; openingAmount: number; openedAt: string } | null = null;
  let balance = 0;
  let movement: Record<string, unknown> | null = null;
  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/_?api/, "");
    if (path === "/auth/me") return route.fulfill({ json: { user: { id: "owner-1", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Demo" } } } });
    if (path === "/cash-holding" && route.request().method() === "GET") return route.fulfill({ json: { epoch, balance: epoch ? balance : null, movements: movement ? [movement] : [], pagination: { page: 1, totalPages: 1 } } });
    if (path === "/cash-holding/handovers") return route.fulfill({ json: { sessions: [], pagination: { page: 1, totalPages: 0 } } });
    if (path === "/cash-holding/count" && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.mode).toBe("AUTO");
      expect(body.countedCash).toBe(25000);
      expect(body.expectedEpochId).toBeNull();
      epoch = { id: "auto-epoch", mode: "AUTO", openingAmount: 25000, openedAt: "2026-11-14T09:00:00.000Z" };
      balance = 25000;
      return route.fulfill({ json: { epoch, replayed: false } });
    }
    if (path === "/cash-holding/movements" && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.kind).toBe("BANK_DEPOSIT");
      expect(body.amount).toBe(5000);
      expect(body.expectedEpochId).toBe("auto-epoch");
      balance -= body.amount;
      movement = { id: "auto-movement", epochId: "auto-epoch", kind: body.kind, amount: -body.amount, note: body.note, createdAt: "2026-11-14T10:00:00.000Z", reversal: null, reversesMovementId: null, epoch: { mode: "AUTO", openedAt: epoch!.openedAt } };
      return route.fulfill({ json: { movement, replayed: false } });
    }
    if (path === "/subscription/status") return route.fulfill({ json: { status: "active", isActive: true, daysLeft: 30 } });
    if (path === "/notifications") return route.fulfill({ json: { items: [], unreadCount: 0 } });
    return route.fulfill({ json: {} });
  });

  await page.goto("/cash-on-hand");
  await page.getByLabel(/^Automatic:/).check();
  await page.getByLabel("Cash physically counted (TZS)").fill("25000");
  await page.getByLabel(/I physically counted/).check();
  await page.getByRole("button", { name: "Save count" }).click();
  await expect(page.getByText("TZS 25,000", { exact: true })).toBeVisible();
  await expect(page.getByText(/do not enter a transaction already recorded/i)).toBeVisible();

  await page.getByRole("combobox", { name: "Type", exact: true }).selectOption("BANK_DEPOSIT");
  await page.getByLabel("Amount (TZS)").fill("5000");
  await page.getByLabel("Note / destination").fill("Bank deposit");
  await page.getByRole("button", { name: "Save movement" }).click();
  await expect(page.getByText("TZS 20,000", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem").getByText("Taken to bank", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("owner Handover mode accepts one closed shift and includes a safe transfer", async ({ page }) => {
  let epoch: { id: string; mode: string; openingAmount: number; openedAt: string } | null = null;
  let balance = 0;
  let movement: Record<string, unknown> | null = null;
  await page.route("**/*api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/_?api/, "");
    if (path === "/auth/me") return route.fulfill({ json: { user: { id: "owner-1", role: "MERCHANT", language: "en", shop: { id: "shop-1", name: "Demo" } } } });
    if (path === "/cash-holding" && route.request().method() === "GET") return route.fulfill({ json: { epoch, balance: epoch ? balance : null, movements: movement ? [movement] : [], pagination: { page: 1, totalPages: 1 } } });
    if (path === "/cash-holding/handovers") return route.fulfill({ json: { sessions: [{ id: "shift-1", openedByName: "Asha", closedAt: "2026-11-14T08:00:00.000Z", countedCash: 7000, cashTransferredOut: 2000, cashTransferDestination: "SAFE", previousHandoverId: null }], pagination: { page: 1, totalPages: 1 } } });
    if (path === "/cash-holding/count" && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.mode).toBe("HANDOVER");
      expect(body.countedCash).toBe(0);
      expect(body.expectedEpochId).toBeNull();
      epoch = { id: "handover-epoch", mode: "HANDOVER", openingAmount: 0, openedAt: "2026-11-14T09:00:00.000Z" };
      return route.fulfill({ json: { epoch: { id: "handover-epoch", mode: "HANDOVER", openingAmount: 0, openedAt: "2026-11-14T09:00:00.000Z" }, replayed: false } });
    }
    if (path === "/cash-holding/movements" && route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.kind).toBe("SHIFT_HANDOVER");
      expect(body.amount).toBe(9000);
      expect(body.cashSessionId).toBe("shift-1");
      expect(body.expectedEpochId).toBe("handover-epoch");
      expect(body.replacesMovementId).toBeUndefined();
      balance = 9000;
      movement = { id: "handover-movement", epochId: "handover-epoch", kind: "SHIFT_HANDOVER", amount: 9000, note: null, createdAt: "2026-11-14T10:00:00.000Z", reversal: null, reversesMovementId: null, epoch: { mode: "HANDOVER", openedAt: "2026-11-14T09:00:00.000Z" } };
      return route.fulfill({ json: { movement, replayed: false } });
    }
    if (path === "/subscription/status") return route.fulfill({ json: { status: "active", isActive: true, daysLeft: 30 } });
    if (path === "/notifications") return route.fulfill({ json: { items: [], unreadCount: 0 } });
    return route.fulfill({ json: {} });
  });

  await page.goto("/cash-on-hand");
  await expect(page.getByRole("heading", { name: "Cash on hand" })).toBeVisible();
  await page.getByLabel(/^Handover:/).check();
  await page.getByLabel("Cash physically counted (TZS)").fill("0");
  await page.getByLabel(/I physically counted/).check();
  await page.getByRole("button", { name: "Save count" }).click();
  await page.getByRole("combobox", { name: "Type", exact: true }).selectOption("SHIFT_HANDOVER");
  await page.getByRole("combobox").nth(1).selectOption("shift-1");
  await page.getByLabel("Amount (TZS)").fill("9000");
  await page.getByRole("button", { name: "Save movement" }).click();
  await expect(page.getByText("TZS 9,000", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("listitem").getByText("Shift handover", { exact: true })).toBeVisible();
});
