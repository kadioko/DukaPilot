const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/stock.controller.js");

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
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
            if (where.currentStock?.gte != null && stock < where.currentStock.gte) return { count: 0 };
            stock += data.currentStock.decrement ? -data.currentStock.decrement : data.currentStock.increment || 0;
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
