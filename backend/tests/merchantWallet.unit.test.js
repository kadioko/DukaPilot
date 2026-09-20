const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const servicePath = path.resolve(__dirname, "../src/services/merchantWallet.service.js");
const ntzs = require("../src/lib/ntzs");

function loadWallet(prismaMock = {}) {
  delete require.cache[servicePath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
  return require(servicePath);
}

function transactionDb(record) {
  return {
    merchantWalletTransaction: {
      findUnique: async () => ({ ...record }),
      update: async ({ data }) => {
        Object.assign(record, data);
        return { ...record };
      },
      updateMany: async ({ where, data }) => {
        if (where.id !== record.id || (where.status?.in && !where.status.in.includes(record.status))) return { count: 0 };
        Object.assign(record, data);
        return { count: 1 };
      },
    },
  };
}

function depositTransactionDb(record) {
  const wallet = { id: "merchant-wallet-1", businessShopId: record.shopId, balanceTzs: 0 };
  const entries = new Map();
  const tx = {
    merchantWalletTransaction: {
      findUnique: async () => ({ ...record }),
      update: async ({ data }) => {
        Object.assign(record, data);
        return { ...record };
      },
      updateMany: async ({ where, data }) => {
        if (where.id !== record.id || (where.status?.in && !where.status.in.includes(record.status))) return { count: 0 };
        Object.assign(record, data);
        return { count: 1 };
      },
    },
    merchantWallet: {
      upsert: async () => ({ ...wallet }),
      findUnique: async () => ({ ...wallet }),
      updateMany: async ({ where, data }) => {
        if (where.id !== wallet.id || where.balanceTzs !== wallet.balanceTzs) return { count: 0 };
        Object.assign(wallet, data);
        return { count: 1 };
      },
    },
    merchantWalletEntry: {
      findUnique: async ({ where }) => entries.get(`${where.transactionId_type.transactionId}:${where.transactionId_type.type}`) || null,
      create: async ({ data }) => {
        const entry = { id: `entry-${entries.size + 1}`, ...data };
        entries.set(`${data.transactionId}:${data.type}`, entry);
        return entry;
      },
    },
  };
  return {
    prisma: { ...tx, $transaction: async (callback) => callback(tx) },
    wallet,
    entries,
  };
}

function subscriptionPaymentDb(startingBalance = 20000) {
  const wallet = { id: "merchant-wallet-subscription", businessShopId: "shop-1", balanceTzs: startingBalance };
  const shop = { id: "shop-1", isActive: true, plan: "BASIC", additionalBranchSlots: 0, subscriptionEndsAt: null };
  const transactions = new Map();
  const entries = new Map();
  const payments = [];
  const tx = {
    $queryRaw: async () => [],
    merchantWallet: {
      upsert: async () => ({ ...wallet }),
      findUnique: async () => ({ ...wallet }),
      updateMany: async ({ where, data }) => {
        if (where.id !== wallet.id || where.balanceTzs !== wallet.balanceTzs) return { count: 0 };
        Object.assign(wallet, data);
        return { count: 1 };
      },
    },
    merchantWalletTransaction: {
      findUnique: async ({ where }) => {
        if (where.requestKey) return transactions.get(where.requestKey) || null;
        return [...transactions.values()].find((item) => item.id === where.id) || null;
      },
      create: async ({ data }) => {
        const record = { id: `subscription-transaction-${transactions.size + 1}`, createdAt: new Date(), ...data };
        transactions.set(data.requestKey, record);
        return record;
      },
    },
    merchantWalletEntry: {
      findUnique: async ({ where }) => entries.get(`${where.transactionId_type.transactionId}:${where.transactionId_type.type}`) || null,
      create: async ({ data }) => {
        const entry = { id: `subscription-entry-${entries.size + 1}`, ...data };
        entries.set(`${data.transactionId}:${data.type}`, entry);
        return entry;
      },
    },
    shop: {
      findUnique: async () => ({ ...shop }),
      count: async () => 0,
      update: async ({ data }) => {
        Object.assign(shop, data);
        return { ...shop };
      },
    },
    subscriptionPayment: {
      create: async ({ data }) => {
        payments.push(data);
        return { id: `subscription-payment-${payments.length}`, ...data };
      },
    },
  };
  return {
    prisma: { ...tx, $transaction: async (callback) => callback(tx) },
    wallet,
    shop,
    transactions,
    entries,
    payments,
  };
}

function merchantEnvironment() {
  const keys = [
    "NTZS_MERCHANT_BALANCE_ENABLED",
    "NTZS_MERCHANT_BALANCE_PILOT_SHOP_IDS",
    "NTZS_MERCHANT_BALANCE_USER_ID",
    "NTZS_MERCHANT_BALANCE_WITHDRAWAL_FEE_BPS",
    "NTZS_MERCHANT_BALANCE_MIN_WITHDRAWAL_TZS",
    "NTZS_API_KEY",
    "NTZS_WEBHOOK_SECRET",
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    NTZS_MERCHANT_BALANCE_ENABLED: "true",
    NTZS_MERCHANT_BALANCE_PILOT_SHOP_IDS: "",
    NTZS_MERCHANT_BALANCE_USER_ID: "11111111-1111-4111-8111-111111111111",
    NTZS_MERCHANT_BALANCE_WITHDRAWAL_FEE_BPS: "200",
    NTZS_MERCHANT_BALANCE_MIN_WITHDRAWAL_TZS: "5000",
    NTZS_API_KEY: "ntzs_live_test_key",
    NTZS_WEBHOOK_SECRET: "whsec_test",
  });
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  };
}

test("merchant-wallet fee uses whole TZS and rounds up", () => {
  const wallet = loadWallet();
  assert.equal(wallet.platformFeeTzs(5000, 200), 100);
  assert.equal(wallet.platformFeeTzs(5001, 200), 101);
  assert.equal(wallet.platformFeeTzs(5000, 0), 0);
  assert.throws(() => wallet.platformFeeTzs(100.5, 200), /whole positive/);
});

test("wallet configuration requires a separately enabled pooled provider user", () => {
  const restore = merchantEnvironment();
  try {
    const wallet = loadWallet();
    assert.deepEqual(wallet.merchantWalletSettings(), { enabled: true, feeBps: 200, minimumWithdrawalTzs: 5000 });
    process.env.NTZS_MERCHANT_BALANCE_ENABLED = "false";
    assert.equal(wallet.merchantWalletSettings().enabled, false);
  } finally {
    restore();
  }
});

test("a pilot allowlist restricts new wallet operations to named root businesses", () => {
  const restore = merchantEnvironment();
  try {
    process.env.NTZS_MERCHANT_BALANCE_PILOT_SHOP_IDS = "shop-pilot, shop-second";
    const wallet = loadWallet();
    assert.equal(wallet.merchantWalletEnabledForShop("shop-pilot"), true);
    assert.equal(wallet.merchantWalletEnabledForShop("shop-second"), true);
    assert.equal(wallet.merchantWalletEnabledForShop("shop-other"), false);
  } finally {
    restore();
  }
});

test("an empty pilot allowlist makes merchant balance available to every root business", () => {
  const restore = merchantEnvironment();
  try {
    const wallet = loadWallet();
    assert.equal(wallet.merchantWalletEnabledForShop("shop-one"), true);
    assert.equal(wallet.merchantWalletEnabledForShop("shop-two"), true);
  } finally {
    restore();
  }
});

test("merchant balance subscription payment debits and activates atomically only once", async () => {
  const restore = merchantEnvironment();
  const state = subscriptionPaymentDb(20000);
  try {
    const wallet = loadWallet(state.prisma);
    const input = {
      shopId: "shop-1",
      userId: "owner-1",
      requestKey: "11111111-1111-4111-8111-111111111111",
      plan: "BASIC",
      kind: "RENEWAL",
      extraBranches: 0,
    };

    const first = await wallet.paySubscriptionFromBalance(input);
    const retry = await wallet.paySubscriptionFromBalance(input);

    assert.equal(first.reused, false);
    assert.equal(retry.reused, true);
    assert.equal(state.wallet.balanceTzs, 5000);
    assert.equal(state.entries.size, 1);
    assert.equal(state.payments.length, 1);
    assert.equal(state.payments[0].method, "MERCHANT_BALANCE");
    assert.equal(state.payments[0].amount, 15000);
    assert.equal(state.shop.plan, "BASIC");
    assert.ok(state.shop.subscriptionEndsAt instanceof Date);
  } finally {
    restore();
  }
});

test("merchant balance subscription payment leaves all records unchanged when funds are insufficient", async () => {
  const restore = merchantEnvironment();
  const state = subscriptionPaymentDb(14999);
  try {
    const wallet = loadWallet(state.prisma);
    await assert.rejects(wallet.paySubscriptionFromBalance({
      shopId: "shop-1",
      userId: "owner-1",
      requestKey: "22222222-2222-4222-8222-222222222222",
      plan: "BASIC",
      kind: "RENEWAL",
      extraBranches: 0,
    }), { code: "INSUFFICIENT_BALANCE" });
    assert.equal(state.wallet.balanceTzs, 14999);
    assert.equal(state.entries.size, 0);
    assert.equal(state.payments.length, 0);
    assert.equal(state.shop.subscriptionEndsAt, null);
  } finally {
    restore();
  }
});

test("merchant output masks mobile numbers and never returns provider identifiers", () => {
  const wallet = loadWallet();
  const result = wallet.publicTransaction({
    id: "wallet-1",
    kind: "WITHDRAWAL",
    status: "PENDING",
    amountTzs: 10000,
    platformFeeTzs: 200,
    providerFeeTzs: 100,
    totalDebitTzs: 10300,
    recipientPhone: "+255700000001",
    providerId: "provider-private-id",
    requestKey: "request-private-key",
    createdAt: new Date("2026-09-19T10:00:00.000Z"),
  });

  assert.equal(result.recipientPhone, "+255•••••0001");
  assert.equal(result.balanceEffectTzs, -10300);
  assert.equal(result.canResume, false);
  assert.equal("providerId" in result, false);
  assert.equal("requestKey" in result, false);
});

test("merchant deposits and withdrawals accept only Tanzanian mobile numbers", async () => {
  const restore = merchantEnvironment();
  try {
    const wallet = loadWallet();
    await assert.rejects(
      wallet.createDeposit({ shopId: "shop-1", userId: "owner-1", amountTzs: 5000, phone: "+254700000001", requestKey: "11111111-1111-4111-8111-111111111111" }),
      { code: "INVALID_PHONE" }
    );
    await assert.rejects(
      wallet.getWithdrawalQuote({ shopId: "shop-1", amountTzs: 5000, phone: "+254700000001" }),
      { code: "INVALID_PHONE" }
    );
  } finally {
    restore();
  }
});

test("withdrawal quotes use nTZS's quoted nested provider fee", async () => {
  const restore = merchantEnvironment();
  const originalRequest = ntzs.request;
  try {
    const wallet = loadWallet({
      merchantWallet: { findUnique: async () => ({ balanceTzs: 12000 }) },
    });
    ntzs.request = async (requestPath, options) => {
      assert.equal(requestPath, "/withdrawals/quote");
      assert.equal(JSON.parse(options.body).phoneNumber, "255713712057");
      return {
        quoteId: "quoted-withdrawal",
        receiveAmountTzs: 10000,
        burnAmountTzs: 10382,
        fees: { totalFeeTzs: 382 },
        payoutRail: "selcom",
        recipientName: "Amina",
      };
    };

    const quote = await wallet.getWithdrawalQuote({ shopId: "shop-1", amountTzs: 10000, phone: "0713712057" });

    assert.equal(quote.platformFeeTzs, 200);
    assert.equal(quote.providerFeeTzs, 382);
    assert.equal(quote.totalDebitTzs, 10582);
    assert.equal(quote.canWithdraw, true);
  } finally {
    ntzs.request = originalRequest;
    restore();
  }
});

test("withdrawals require the owner to confirm the exact server-side quote", () => {
  const wallet = loadWallet();
  const quote = { amountTzs: 10000, phone: "+255713712057", providerFeeTzs: 382, totalDebitTzs: 10582, recipientName: "Amina", payoutRail: "selcom" };
  assert.doesNotThrow(() => wallet.assertConfirmedWithdrawalQuote({ ...quote }, quote));
  for (const changed of [
    { amountTzs: 9999 },
    { phone: "+255700000001" },
    { providerFeeTzs: 100 },
    { totalDebitTzs: 10400 },
    { recipientName: "Another recipient" },
    { payoutRail: "another_rail" },
  ]) {
    assert.throws(
      () => wallet.assertConfirmedWithdrawalQuote({ ...quote, ...changed }, quote),
      { code: "WITHDRAWAL_QUOTE_CHANGED" }
    );
  }
});

test("documented provider rejections release a reserved withdrawal while ambiguous failures remain held", () => {
  const wallet = loadWallet();
  const conflict = wallet.providerFailure(
    { providerCode: "quote_stale", providerStatus: 409 },
    "The withdrawal could not start."
  );
  const unavailable = wallet.providerFailure(
    { providerStatus: 503 },
    "The withdrawal could not start."
  );
  const ambiguous = wallet.providerFailure(
    { providerStatus: 502, providerCode: "initiation_uncertain" },
    "The withdrawal could not start."
  );
  const undocumentedConflict = wallet.providerFailure(
    { providerStatus: 409 },
    "The payment could not start."
  );
  assert.equal(conflict.uncertain, false);
  assert.equal(unavailable.uncertain, false);
  assert.equal(ambiguous.uncertain, true);
  assert.equal(undocumentedConflict.uncertain, true);
});

test("wallet history reports the actual balance effect for every terminal state", () => {
  const wallet = loadWallet();
  const base = { id: "transaction", amountTzs: 10000, platformFeeTzs: 200, providerFeeTzs: 100, totalDebitTzs: 10300, createdAt: new Date() };
  const effect = (kind, status, metadata) => wallet.publicTransaction({ ...base, kind, status, metadata }).balanceEffectTzs;

  assert.equal(effect("DEPOSIT", "COMPLETED"), 10000);
  assert.equal(effect("DEPOSIT", "FAILED"), 0);
  assert.equal(effect("WITHDRAWAL", "PENDING"), -10300);
  assert.equal(effect("WITHDRAWAL", "REVIEW"), -10300);
  assert.equal(effect("WITHDRAWAL", "COMPLETED"), -10300);
  assert.equal(effect("WITHDRAWAL", "FAILED"), 0);
  assert.equal(effect("WITHDRAWAL", "REVERSED"), 0);
  assert.equal(effect("SUBSCRIPTION", "COMPLETED"), -10000);
  assert.equal(effect("ADJUSTMENT", "COMPLETED", { direction: "CREDIT" }), 10000);
  assert.equal(effect("ADJUSTMENT", "COMPLETED", { direction: "DEBIT" }), -10000);
});

test("an admin adjustment retry key can only reuse the exact correction", async () => {
  const existing = {
    id: "adjustment-1",
    shopId: "shop-1",
    kind: "ADJUSTMENT",
    status: "COMPLETED",
    amountTzs: 5000,
    metadata: { direction: "CREDIT", reason: "Approved reconciliation correction" },
  };
  const duplicate = Object.assign(new Error("Unique constraint"), { code: "P2002" });
  const db = {
    merchantWalletTransaction: { findUnique: async () => ({ ...existing }) },
    $transaction: async () => { throw duplicate; },
  };
  const wallet = loadWallet(db);
  const input = {
    shopId: "shop-1",
    userId: "admin-1",
    amountTzs: 5000,
    direction: "CREDIT",
    reason: "Approved reconciliation correction",
    requestKey: "33333333-3333-4333-8333-333333333333",
  };

  assert.equal((await wallet.createAdminAdjustment(input)).id, existing.id);
  await assert.rejects(
    wallet.createAdminAdjustment({ ...input, direction: "DEBIT" }),
    { code: "RETRY_KEY_CONFLICT" }
  );
  await assert.rejects(
    wallet.createAdminAdjustment({ ...input, reason: "A different correction" }),
    { code: "RETRY_KEY_CONFLICT" }
  );
});

test("an nTZS minted deposit credits the merchant balance exactly once", async () => {
  const restore = merchantEnvironment();
  const originalRequest = ntzs.request;
  const record = {
    id: "wallet-deposit-minted",
    kind: "DEPOSIT",
    status: "PENDING",
    shopId: "shop-1",
    providerId: "deposit-provider-minted",
    amountTzs: 1500,
  };
  const state = depositTransactionDb(record);
  try {
    const wallet = loadWallet(state.prisma);
    ntzs.request = async () => ({
      id: record.providerId,
      userId: process.env.NTZS_MERCHANT_BALANCE_USER_ID,
      amountTzs: 1500,
      paymentMethod: "mobile_money",
      status: "minted",
      livemode: true,
    });

    const first = await wallet.reconcileTransaction(record.id);
    const retry = await wallet.reconcileTransaction(record.id);

    assert.equal(first.status, "COMPLETED");
    assert.equal(retry.status, "COMPLETED");
    assert.equal(state.wallet.balanceTzs, 1500);
    assert.equal(state.entries.size, 1);
  } finally {
    ntzs.request = originalRequest;
    restore();
  }
});

test("an nTZS rejected deposit fails without crediting the merchant balance", async () => {
  const restore = merchantEnvironment();
  const originalRequest = ntzs.request;
  const record = {
    id: "wallet-deposit-rejected",
    kind: "DEPOSIT",
    status: "REVIEW",
    shopId: "shop-1",
    providerId: "deposit-provider-rejected",
    amountTzs: 1000,
  };
  const state = depositTransactionDb(record);
  try {
    const wallet = loadWallet(state.prisma);
    ntzs.request = async () => ({
      id: record.providerId,
      userId: process.env.NTZS_MERCHANT_BALANCE_USER_ID,
      amountTzs: 1000,
      paymentMethod: "mobile_money",
      status: "rejected",
      livemode: true,
    });

    const result = await wallet.reconcileTransaction(record.id);

    assert.equal(result.status, "FAILED");
    assert.equal(state.wallet.balanceTzs, 0);
    assert.equal(state.entries.size, 0);
    assert.match(result.failureReason, /did not complete/i);
  } finally {
    ntzs.request = originalRequest;
    restore();
  }
});

test("a burned withdrawal remains pending until its mobile-money payout completes", async () => {
  const restore = merchantEnvironment();
  const originalRequest = ntzs.request;
  const record = {
    id: "wallet-withdrawal-1",
    kind: "WITHDRAWAL",
    status: "PENDING",
    providerId: "withdrawal-provider-1",
    amountTzs: 10000,
    providerFeeTzs: 382,
    platformFeeTzs: 200,
    totalDebitTzs: 10582,
  };
  const db = transactionDb(record);
  try {
    const wallet = loadWallet(db);
    ntzs.request = async () => ({
      id: "withdrawal-provider-1",
      status: "burned",
      payoutStatus: "pending",
      receiveAmountTzs: 10000,
      burnAmountTzs: 10382,
      fees: { totalFeeTzs: 382 },
    });

    const result = await wallet.reconcileTransaction(record.id);

    assert.equal(result.status, "PENDING");
  } finally {
    ntzs.request = originalRequest;
    restore();
  }
});

test("a completed burned withdrawal records the provider confirmation", async () => {
  const restore = merchantEnvironment();
  const originalRequest = ntzs.request;
  const record = {
    id: "wallet-withdrawal-2",
    kind: "WITHDRAWAL",
    status: "PENDING",
    providerId: "withdrawal-provider-2",
    amountTzs: 10000,
    providerFeeTzs: 382,
    platformFeeTzs: 200,
    totalDebitTzs: 10582,
  };
  const db = transactionDb(record);
  try {
    const wallet = loadWallet(db);
    ntzs.request = async () => ({
      id: "withdrawal-provider-2",
      status: "burned",
      payoutStatus: "completed",
      receiveAmountTzs: 10000,
      burnAmountTzs: 10382,
      fees: { totalFeeTzs: 382 },
      confirmationMessage: "TZS 10,000 is on its way to Amina.",
    });

    const result = await wallet.reconcileTransaction(record.id);

    assert.equal(result.status, "COMPLETED");
    assert.equal(result.providerInstruction, "TZS 10,000 is on its way to Amina.");
  } finally {
    ntzs.request = originalRequest;
    restore();
  }
});

test("a compact nTZS burned withdrawal settles without a payoutStatus field", async () => {
  const restore = merchantEnvironment();
  const originalRequest = ntzs.request;
  const record = {
    id: "wallet-withdrawal-3",
    kind: "WITHDRAWAL",
    status: "PENDING",
    providerId: "withdrawal-provider-3",
    amountTzs: 10000,
    providerFeeTzs: 382,
    platformFeeTzs: 200,
    totalDebitTzs: 10582,
  };
  const db = transactionDb(record);
  try {
    const wallet = loadWallet(db);
    ntzs.request = async () => ({
      id: "withdrawal-provider-3",
      status: "burned",
      receiveAmountTzs: 10000,
      totalFeeTzs: 382,
    });

    const result = await wallet.reconcileTransaction(record.id);

    assert.equal(result.status, "COMPLETED");
  } finally {
    ntzs.request = originalRequest;
    restore();
  }
});

test("a review deposit resumes the original provider request key rather than creating a new request", async () => {
  const restore = merchantEnvironment();
  const originalRequest = ntzs.request;
  const record = {
    id: "wallet-deposit-1",
    kind: "DEPOSIT",
    status: "REVIEW",
    shopId: "shop-1",
    amountTzs: 12000,
    payerPhone: "+255700000001",
    providerId: null,
    providerStatus: null,
    providerInstruction: null,
    requestKey: "11111111-1111-4111-8111-111111111111",
  };
  const db = transactionDb(record);
  const calls = [];
  try {
    const wallet = loadWallet(db);
    ntzs.request = async (requestPath, options) => {
      calls.push({ requestPath, options });
      if (requestPath === "/deposits") return { id: "deposit-provider-1", status: "pending", instructions: "Confirm on phone" };
      return {
        id: "deposit-provider-1",
        userId: process.env.NTZS_MERCHANT_BALANCE_USER_ID,
        amountTzs: 12000,
        paymentMethod: "mobile_money",
        status: "pending",
        livemode: true,
      };
    };

    const result = await wallet.resumeMerchantTransaction(record.id);

    assert.equal(calls.length, 2);
    assert.equal(calls[0].requestPath, "/deposits");
    assert.equal(calls[0].options.headers["Idempotency-Key"], record.requestKey);
    assert.equal(JSON.parse(calls[0].options.body).phoneNumber, "255700000001");
    assert.equal(record.providerId, "deposit-provider-1");
    assert.equal(result.status, "REVIEW");
  } finally {
    ntzs.request = originalRequest;
    restore();
  }
});

test("a stale pending reconciliation cannot overwrite a completed withdrawal", async () => {
  const restore = merchantEnvironment();
  const originalRequest = ntzs.request;
  const record = {
    id: "wallet-withdrawal-race",
    kind: "WITHDRAWAL",
    status: "PENDING",
    providerId: "withdrawal-provider-race",
    amountTzs: 10000,
    providerFeeTzs: 382,
    platformFeeTzs: 200,
    totalDebitTzs: 10582,
  };
  try {
    const wallet = loadWallet(transactionDb(record));
    ntzs.request = async () => {
      record.status = "COMPLETED";
      return {
        id: record.providerId,
        status: "burned",
        payoutStatus: "pending",
        receiveAmountTzs: 10000,
        burnAmountTzs: 10382,
        fees: { totalFeeTzs: 382 },
      };
    };

    const result = await wallet.reconcileTransaction(record.id);

    assert.equal(result.status, "COMPLETED");
    assert.equal(record.status, "COMPLETED");
  } finally {
    ntzs.request = originalRequest;
    restore();
  }
});
