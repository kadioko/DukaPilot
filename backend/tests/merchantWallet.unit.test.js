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
  const quote = { providerFeeTzs: 382, totalDebitTzs: 10582, recipientName: "Amina", payoutRail: "selcom" };
  assert.doesNotThrow(() => wallet.assertConfirmedWithdrawalQuote({ ...quote }, quote));
  assert.throws(
    () => wallet.assertConfirmedWithdrawalQuote({ ...quote, providerFeeTzs: 100 }, quote),
    { code: "WITHDRAWAL_QUOTE_CHANGED" }
  );
});

test("a deterministic provider conflict releases a reserved withdrawal", () => {
  const wallet = loadWallet();
  const result = wallet.providerFailure(
    { providerCode: "quote_stale", providerStatus: 409 },
    "The withdrawal could not start."
  );
  assert.equal(result.uncertain, false);
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
