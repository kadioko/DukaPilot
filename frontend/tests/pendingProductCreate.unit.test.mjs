import assert from "node:assert/strict";
import test from "node:test";
import {
  clearPendingProductCreate,
  loadPendingProductCreate,
  savePendingProductCreate,
} from "../src/lib/pendingProductCreate.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    values,
  };
}

const requestId = "6a96c140-3837-4c4d-9e92-22858be82789";

test("pending product create survives reload data and is isolated by actor/branch scope", () => {
  const storage = memoryStorage();
  const pending = {
    requestId,
    form: { name: "Mchele", buyingPrice: "1200" },
    body: { createRequestId: requestId, name: "Mchele", buyingPrice: 1200 },
    savedAt: Date.now(),
  };

  assert.equal(savePendingProductCreate("staff-1|branch-1", pending, storage), true);
  assert.deepEqual(loadPendingProductCreate("staff-1|branch-1", storage), pending);
  assert.equal(loadPendingProductCreate("staff-2|branch-1", storage), null);
  assert.equal(loadPendingProductCreate("staff-1|branch-2", storage), null);
});

test("invalid pending product data is discarded and a confirmed save clears only its scope", () => {
  const storage = memoryStorage();
  const valid = {
    requestId,
    form: { name: "Mchele" },
    body: { createRequestId: requestId, name: "Mchele" },
    savedAt: Date.now(),
  };
  assert.equal(savePendingProductCreate("owner|shop", valid, storage), true);

  const otherScope = "owner|branch";
  storage.setItem("dukapilot_pending_product_create_v1:owner%7Cbranch", JSON.stringify({ version: 1, ...valid, requestId: "invalid" }));
  assert.equal(loadPendingProductCreate(otherScope, storage), null);
  assert.equal(storage.values.has("dukapilot_pending_product_create_v1:owner%7Cbranch"), false);

  clearPendingProductCreate("owner|shop", storage);
  assert.equal(loadPendingProductCreate("owner|shop", storage), null);
});

test("pending product writes reject a changed idempotency identity", () => {
  const storage = memoryStorage();
  assert.equal(savePendingProductCreate("owner|shop", {
    requestId,
    form: { name: "Mchele" },
    body: { createRequestId: "92d5ce88-e41b-4da2-849f-974e7e7bd9e9", name: "Mchele" },
    savedAt: Date.now(),
  }, storage), false);
});
