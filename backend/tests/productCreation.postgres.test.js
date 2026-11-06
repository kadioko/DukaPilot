const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const database = new URL(process.env.DATABASE_URL || "postgresql://invalid");
if (!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/dukapilot_test")) {
  throw new Error("Product creation tests require a local dukapilot_test database");
}

const prisma = require("../src/lib/prisma");
let barrier;
const controlledPrisma = new Proxy(prisma, {
  get(target, key) {
    if (key === "$transaction") return (work, options) => target.$transaction((tx) => work(new Proxy(tx, {
      get(transaction, member) {
        if (member !== "product" || !barrier) return transaction[member];
        return new Proxy(transaction.product, {
          get(product, method) {
            if (method !== "findFirst") return product[method];
            return async (args) => {
              const result = await product.findFirst(args);
              if (args.where?.createRequestId && barrier) {
                const current = barrier;
                if (++current.arrived === 2) current.release();
                await current.ready;
              }
              return result;
            };
          },
        });
      },
    })), options);
    const value = target[key];
    return typeof value === "function" ? value.bind(target) : value;
  },
});
require.cache[require.resolve("../src/lib/prisma")].exports = controlledPrisma;
const products = require("../src/controllers/product.controller");
test.after(async () => prisma.$disconnect());

async function invoke(req) {
  const res = { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; } };
  await products.create(req, res, (error) => res.status(error.status || 500).json({ error: error.message, code: error.code }));
  return res;
}

test("concurrent keyed saves create one product and one opening stock movement", { timeout: 15000 }, async (t) => {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({ data: { phone: `product-test-${suffix}`, pin: "test-only", name: "Test owner" } });
  const shop = await prisma.shop.create({ data: { userId: user.id, name: "Test shop", location: "Test", referralCode: suffix } });
  t.after(async () => { await prisma.shop.deleteMany({ where: { id: shop.id } }); await prisma.user.deleteMany({ where: { id: user.id } }); });
  const requestId = crypto.randomUUID();
  const req = { user: { userId: user.id, role: "MERCHANT" }, body: { createRequestId: requestId, name: "Test rice", buyingPrice: 1000, sellingPrice: 1500, currentStock: 5, barcode: "CONCURRENT-TEST", barcodeType: "CODE128" } };
  let release;
  barrier = { arrived: 0, ready: new Promise((resolve) => { release = resolve; }), release: () => release() };
  let results;
  try { results = await Promise.all([invoke(req), invoke(req)]); } finally { barrier = null; }
  assert.deepEqual(results.map((result) => result.statusCode), [201, 201]);
  assert.equal(results[0].payload.product.id, results[1].payload.product.id);
  const saved = await prisma.product.findMany({ where: { shopId: shop.id, createRequestId: requestId } });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].currentStock, 5);
  assert.equal(await prisma.stockMovement.count({ where: { productId: saved[0].id } }), 1);
  const changed = await invoke({ ...req, body: { ...req.body, name: "Different rice" } });
  assert.equal(changed.statusCode, 409);
});
