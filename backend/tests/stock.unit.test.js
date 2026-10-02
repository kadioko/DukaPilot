const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/stock.controller.js");

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

function matchesStockWhere(where, stock) {
  if (typeof where.currentStock === "number" && where.currentStock !== stock) return false;
  if (where.currentStock?.gte != null && stock < where.currentStock.gte) return false;
  return !where.AND?.some((condition) =>
    (typeof condition.currentStock === "number" && condition.currentStock !== stock) ||
    (condition.currentStock?.gte != null && stock < condition.currentStock.gte)
  );
}

test("two close stock reductions cannot create negative stock or a lost update", async () => {
  let stock = 10;
  let movements = 0;
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      shop: { findUnique: async () => ({ id: "shop-1" }) },
      $transaction: async (work) => work({
        product: {
          findFirst: async () => ({ id: "prod-1", shopId: "shop-1", currentStock: stock, isActive: true }),
          updateMany: async ({ where, data }) => {
            if (!matchesStockWhere(where, stock)) return { count: 0 };
            stock = data.currentStock;
            return { count: 1 };
          },
          findUnique: async () => ({ id: "prod-1", currentStock: stock }),
        },
        stockMovement: { create: async () => { movements += 1; return { id: `move-${movements}` }; } },
      }),
    },
  };
  delete require.cache[shopAccessPath];
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  const errors = [];
  const request = () => ({ user: { userId: "owner-1" }, body: { productId: "prod-1", type: "OUT", quantity: 6 } });
  const first = response();
  const second = response();

  await Promise.all([
    controller.adjust(request(), first, (error) => errors.push(error)),
    controller.adjust(request(), second, (error) => errors.push(error)),
  ]);

  assert.equal(stock, 4);
  assert.equal(movements, 1);
  assert.equal(first.statusCode === 200 || second.statusCode === 200, true);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].status, 409);
});

test("fractional stock adjustments preserve bag or weight quantities to three decimals", async () => {
  let stock = 50;
  const movements = [];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      shop: { findUnique: async () => ({ id: "shop-1" }) },
      $transaction: async (work) => work({
        product: {
          findFirst: async () => ({ id: "feed", shopId: "shop-1", currentStock: stock, isActive: true }),
          updateMany: async ({ where, data }) => {
            if (!matchesStockWhere(where, stock)) return { count: 0 };
            stock = data.currentStock;
            return { count: 1 };
          },
          findUnique: async () => ({ id: "feed", currentStock: stock }),
        },
        stockMovement: { create: async ({ data }) => { movements.push(data); return data; } },
      }),
    },
  };
  require.cache[shopAccessPath] = { id: shopAccessPath, filename: shopAccessPath, loaded: true, exports: { getShopIdForUser: async () => "shop-1" } };
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  const res = response();
  await controller.adjust({ user: { userId: "owner-1" }, body: { productId: "feed", type: "OUT", quantity: 37.5 } }, res, assert.fail);
  assert.equal(stock, 12.5);
  assert.equal(movements[0].quantity, 37.5);

  const invalid = response();
  await controller.adjust({ user: { userId: "owner-1" }, body: { productId: "feed", type: "OUT", quantity: 0.0001 } }, invalid, assert.fail);
  assert.equal(invalid.statusCode, 400);
  assert.equal(movements.length, 1);
});
