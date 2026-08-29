const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/staff.controller.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");

function response() { return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } }; }

test("new staff with a phone receive the default 1234 PIN and canonical Tanzania number", async () => {
  let created;
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    user: { findFirst: async () => null },
    staffMember: {
      findFirst: async () => null,
      create: async ({ data }) => { created = data; return { id: "staff-1", ...data }; },
    },
  } };
  delete require.cache[shopAccessPath];
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  const res = response();
  await controller.create({ user: { userId: "owner-1" }, body: { name: "Asha", phone: "0743 910 580", role: "CASHIER", canRecordExpenses: true } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(created.phone, "+255743910580");
  assert.equal(await bcrypt.compare("1234", created.pin), true);
  assert.equal(created.canSell, true);
  assert.equal(created.canManageStock, false);
  assert.equal(created.canRecordExpenses, true);
});

test("Basic limits the owner to one active staff member", async () => {
  let createCalled = false;
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {
    shop: { findUnique: async (args) => args.where.userId ? { id: "shop-1" } : { id: "shop-1", plan: "BASIC", subscriptionEndsAt: new Date(Date.now() + 86400000), trialEndsAt: null, isActive: true } },
    user: { findFirst: async () => null },
    staffMember: {
      findFirst: async () => null,
      count: async () => 1,
      create: async () => { createCalled = true; },
    },
  } };
  delete require.cache[shopAccessPath];
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  const res = response();

  await controller.create({ user: { userId: "owner-1" }, body: { name: "Baraka", phone: "0712345678", role: "CASHIER" } }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, "BASIC_STAFF_LIMIT");
  assert.equal(createCalled, false);
});
