const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/assistant.controller.js");

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("quotation assistant returns tenant-scoped accepted, deposit, expiring, and expired actions", async () => {
  const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let quotationQuery;
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      shop: { findUnique: async () => ({ id: "shop-1" }) },
      quotation: {
        findMany: async (query) => {
          quotationQuery = query;
          return [
            { id: "accepted", quotationNumber: "QT-0042", status: "ACCEPTED", projectTitle: "Curtain fitting", totalAmount: 200000, amountPaid: 0, depositRequiredAmount: 100000, depositDueDate: inTwoDays, expiryDate: inTwoDays, customer: { name: "Asha" } },
            { id: "sent", quotationNumber: "QT-0043", status: "SENT", projectTitle: "Office design", totalAmount: 80000, amountPaid: 0, depositRequiredAmount: 0, expiryDate: inTwoDays, customer: { name: "Salum" } },
            { id: "expired", quotationNumber: "QT-0044", status: "EXPIRED", projectTitle: "Frame repair", totalAmount: 55000, amountPaid: 0, depositRequiredAmount: 0, expiryDate: yesterday, customer: { name: "Neema" } },
          ];
        },
      },
    },
  };
  delete require.cache[shopAccessPath];
  delete require.cache[controllerPath];
  const { quotationSummary } = require(controllerPath);
  const req = { user: { userId: "owner-1", language: "sw" }, headers: { "x-dukapilot-language": "en" } };
  const res = response();
  let nextError;

  await quotationSummary(req, res, (error) => { nextError = error; });

  assert.equal(nextError, undefined);
  assert.deepEqual(quotationQuery.where, { shopId: "shop-1", status: { in: ["SENT", "ACCEPTED", "EXPIRED"] } });
  assert.deepEqual(res.payload.actions.map((action) => action.title), [
    "Convert QT-0042 to a sale",
    "QT-0043 expires soon",
    "Track the deposit for QT-0042",
    "Decide what to do with QT-0044",
  ]);
});

test("stock assistant returns only stock quantities, never prices, sales, or profit", async () => {
  let productQuery;
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      shop: { findUnique: async () => ({ id: "shop-1" }) },
      product: {
        findMany: async (query) => {
          productQuery = query;
          return [
            { id: "out", name: "Maji", currentStock: 0, minimumStock: 5, unit: "bottle" },
            { id: "safe", name: "Soda", currentStock: 10, minimumStock: 5, unit: "bottle" },
          ];
        },
      },
    },
  };
  delete require.cache[shopAccessPath];
  delete require.cache[controllerPath];
  const { stockSummary } = require(controllerPath);
  const res = response();
  await stockSummary({ user: { userId: "owner-1" } }, res, () => {});

  assert.deepEqual(productQuery.select, { id: true, name: true, currentStock: true, minimumStock: true, unit: true });
  assert.equal(res.payload.actions.length, 1);
  assert.equal(res.payload.actions[0].title, "Stock ya Maji imeisha");
  assert.equal(JSON.stringify(res.payload).includes("buyingPrice"), false);
  assert.equal(JSON.stringify(res.payload).includes("sellingPrice"), false);
  assert.equal(JSON.stringify(res.payload).includes("profit"), false);
});
