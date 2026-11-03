const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const http = require("node:http");
const express = require("express");
const jwt = require("jsonwebtoken");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const authPath = path.resolve(__dirname, "../src/middleware/auth.js");
const receiptRoutePath = path.resolve(__dirname, "../src/routes/stockReceipt.routes.js");
const orderRoutePath = path.resolve(__dirname, "../src/routes/order.routes.js");

test("stock-only staff cannot read purchase receipt or supplier order costs through the API", async () => {
  process.env.JWT_SECRET = "purchase-access-test-secret";
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      user: { findUnique: async () => ({ id: "owner-1", role: "MERCHANT", sessionVersion: 1 }) },
      staffMember: {
        findFirst: async () => ({
          id: "stock-staff-1",
          role: "STOCK_CLERK",
          sessionVersion: 1,
          shopId: "shop-1",
          canSell: false,
          canManageStock: true,
          canManageStaff: false,
          canViewReports: false,
          canRecordExpenses: false,
          canManageCashSessions: false,
          canUseAssistant: false,
          canManageFarm: false,
          canViewQuotations: false,
          canCreateQuotations: false,
          canEditSentQuotations: false,
          canViewQuotationCosts: false,
          canApproveQuotationDiscounts: false,
          canSendQuotations: false,
          canAcceptQuotations: false,
          canConvertQuotations: false,
          canRecordQuotationPayments: false,
          canArchiveQuotations: false,
          canDeleteQuotationDrafts: false,
          shop: { userId: "owner-1", parentShopId: null, branchArchived: false, parentShop: null },
        }),
      },
    },
  };
  delete require.cache[authPath];
  delete require.cache[receiptRoutePath];
  delete require.cache[orderRoutePath];

  const app = express();
  app.use(express.json());
  app.use("/api/stock-receipts", require(receiptRoutePath));
  app.use("/api/orders", require(orderRoutePath));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const token = jwt.sign({ userId: "owner-1", role: "MERCHANT", staffId: "stock-staff-1", sessionVersion: 1 }, process.env.JWT_SECRET);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    for (const pathName of ["/api/stock-receipts", "/api/orders"]) {
      const response = await fetch(`${baseUrl}${pathName}`, { headers: { Authorization: `Bearer ${token}` } });
      assert.equal(response.status, 403, `${pathName} must require Reports permission`);
      assert.match((await response.json()).error, /permission/i);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("read-only staff cannot sell or change stock, and only permitted prices are returned", async () => {
  process.env.JWT_SECRET = "readonly-permission-test-secret";
  const product = { id: "product-1", name: "Rice", unit: "kg", buyingPrice: 1800, sellingPrice: 3000, wholesalePrice: 2500, wholesaleMinQty: 5, currentStock: 2, minimumStock: 5, supplier: { phone: "private" } };
  const staffById = {
    stock: { canViewStock: true }, prices: { canViewSalePrices: true }, seller: { canSell: true },
  };
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {
    user: { findUnique: async () => ({ id: "owner-1", role: "MERCHANT", sessionVersion: 1 }) },
    staffMember: { findFirst: async ({ where }) => ({ id: where.id, role: "CASHIER", sessionVersion: 1, shopId: "shop-1", ...staffById[where.id], shop: { userId: "owner-1", parentShopId: null, branchArchived: false } }) },
    shop: { findUnique: async () => ({ barcodeScanningEnabled: true }) },
    product: {
      findMany: async ({ where, select }) => { assert.equal(where.shopId, "shop-1"); return [select ? Object.fromEntries(Object.keys(select).filter((key) => key in product).map((key) => [key, product[key]])) : product]; },
      count: async () => 1,
      findFirst: async ({ where }) => where.shopId === "shop-1" ? product : null,
    },
    barcodeScan: { create: async () => ({}) },
  } };
  const subscriptionPath = path.resolve(__dirname, "../src/middleware/subscription.js");
  require.cache[subscriptionPath] = { id: subscriptionPath, filename: subscriptionPath, loaded: true, exports: { requireActiveSubscription: (_req, _res, next) => next() } };
  for (const item of [authPath, path.resolve(__dirname, "../src/lib/shopAccess.js"), path.resolve(__dirname, "../src/controllers/product.controller.js"), path.resolve(__dirname, "../src/controllers/barcode.controller.js"), ...["product", "barcode", "stock", "sale"].map((name) => path.resolve(__dirname, `../src/routes/${name}.routes.js`))]) delete require.cache[item];
  const app = express();
  app.use(express.json());
  for (const name of ["product", "barcode", "stock", "sale"]) app.use(`/api/${{ product: "products", barcode: "barcodes", stock: "stock", sale: "sales" }[name]}`, require(`../src/routes/${name}.routes`));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (staffId, url, method = "GET") => fetch(base + url, { method, headers: { Authorization: `Bearer ${jwt.sign({ userId: "owner-1", staffId, sessionVersion: 1 }, process.env.JWT_SECRET)}`, "Content-Type": "application/json" }, ...(method === "POST" ? { body: "{}" } : {}) });
  try {
    for (const staffId of ["stock", "prices"]) {
      for (const [url, method] of [["/api/products", "POST"], ["/api/stock/adjust", "POST"], ["/api/sales", "POST"], ["/api/barcodes/lookup/ABC123", "GET"]]) assert.equal((await call(staffId, url, method)).status, 403, `${staffId}: ${method} ${url}`);
    }
    const stock = await (await call("stock", "/api/products")).json();
    assert.equal(stock.products[0].buyingPrice, null);
    assert.equal(stock.products[0].sellingPrice, null);
    assert.equal(stock.products[0].supplier, undefined);
    assert.equal((await call("stock", "/api/products/prices")).status, 403);
    assert.equal((await call("prices", "/api/products")).status, 403);
    const prices = await (await call("prices", "/api/products/prices")).json();
    assert.equal(prices.products[0].wholesalePrice, 2500);
    assert.equal(prices.products[0].buyingPrice, undefined);
    assert.equal(prices.products[0].currentStock, undefined);
    const scanned = await (await call("seller", "/api/barcodes/lookup/ABC123")).json();
    assert.equal(scanned.product.buyingPrice, null);
    assert.equal(scanned.product.wholesalePrice, 2500);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
