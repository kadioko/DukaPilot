const test = require("node:test");
const assert = require("node:assert/strict");
const { assertMerchantWalletCanBeDeleted } = require("../src/services/accountDeletion.service");

function deletionTx({ balanceTzs = 0, unsettledTransactions = 0 } = {}) {
  return {
    merchantWallet: { findUnique: async () => (balanceTzs === null ? null : { balanceTzs }) },
    merchantWalletTransaction: { count: async () => unsettledTransactions },
  };
}

test("account deletion is allowed when no merchant money or unsettled transfer remains", async () => {
  await assert.doesNotReject(assertMerchantWalletCanBeDeleted(deletionTx(), "shop-1"));
});

test("account deletion is blocked while merchant money remains", async () => {
  await assert.rejects(
    assertMerchantWalletCanBeDeleted(deletionTx({ balanceTzs: 5000 }), "shop-1"),
    { status: 409, code: "MERCHANT_WALLET_NOT_EMPTY" }
  );
});

test("account deletion is blocked while a transfer needs reconciliation", async () => {
  await assert.rejects(
    assertMerchantWalletCanBeDeleted(deletionTx({ balanceTzs: null, unsettledTransactions: 1 }), "shop-1"),
    { status: 409, code: "MERCHANT_WALLET_NOT_EMPTY" }
  );
});
