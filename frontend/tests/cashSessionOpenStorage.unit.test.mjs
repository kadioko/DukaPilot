import assert from "node:assert/strict";
import test from "node:test";
import { clearPendingCashSessionOpen, readPendingCashSessionOpen, savePendingCashSessionOpen } from "../src/lib/cashSessionOpenStorage.ts";

const request = {
  clientRequestId: "6a96c140-3837-4c4d-9e92-22858be82789",
  openingCash: 5000,
  note: "Morning",
  branchId: "branch-1",
  savedAt: Date.now(),
};

function withSessionStorage(run) {
  const values = new Map();
  const original = globalThis.window;
  globalThis.window = { sessionStorage: {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  } };
  try { return run(values); } finally {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  }
}

test("pending shift open details can be replayed only in the same branch and tab", () => withSessionStorage((values) => {
  assert.equal(savePendingCashSessionOpen(request), true);
  assert.deepEqual(readPendingCashSessionOpen("branch-1"), request);
  assert.equal(readPendingCashSessionOpen("branch-2"), null);
  assert.equal(values.size, 0);
}));

test("malformed and expired pending shift requests are discarded", () => withSessionStorage((values) => {
  values.set("dukapilot_cash_session_open_pending", "not-json");
  assert.equal(readPendingCashSessionOpen("branch-1"), null);
  assert.equal(values.size, 0);
  assert.equal(savePendingCashSessionOpen({ ...request, savedAt: Date.now() - 25 * 60 * 60 * 1000 }), true);
  assert.equal(readPendingCashSessionOpen("branch-1"), null);
  assert.equal(values.size, 0);
}));

test("clearing a pending shift request is safe when storage is available", () => withSessionStorage((values) => {
  savePendingCashSessionOpen(request);
  clearPendingCashSessionOpen();
  assert.equal(values.size, 0);
}));
