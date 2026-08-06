const test = require("node:test");
const assert = require("node:assert/strict");
const { generateDemoSaleSchedule } = require("../src/lib/demoHistory");

const products = [
  { id: "flour", unit: "kg", buyingPrice: 2000, sellingPrice: 3000 },
  { id: "oil", unit: "pcs", buyingPrice: 3500, sellingPrice: 5000 },
  { id: "soap", unit: "pcs", buyingPrice: 700, sellingPrice: 1200 },
];

test("demo history is deterministic and spreads realistic sales across all 30 days", () => {
  const first = generateDemoSaleSchedule({ endDate: "2026-08-06", count: 72, products });
  const second = generateDemoSaleSchedule({ endDate: "2026-08-06", count: 72, products });

  assert.equal(first.length, 72);
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((sale) => sale.createdAt.toISOString().slice(0, 10))).size, 30);
  assert.equal(first.every((sale) => sale.totalAmount > 0 && Number.isInteger(sale.profit)), true);

  const salesPerDay = new Map();
  for (const sale of first) {
    const day = sale.createdAt.toISOString().slice(0, 10);
    salesPerDay.set(day, (salesPerDay.get(day) || 0) + 1);
  }
  assert.equal(Math.max(...salesPerDay.values()) <= 4, true);
  assert.equal(Math.min(...salesPerDay.values()) >= 1, true);
});

test("demo history refuses unsafe sale counts", () => {
  assert.throws(() => generateDemoSaleSchedule({ endDate: "2026-08-06", count: 59, products }), /between 60 and 80/);
  assert.throws(() => generateDemoSaleSchedule({ endDate: "2026-08-06", count: 81, products }), /between 60 and 80/);
});
