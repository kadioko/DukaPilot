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
