const test = require("node:test");
const assert = require("node:assert/strict");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const { subscriptionSnapshot, subscriptionStatusWhere } = require("../src/controllers/subscription.controller");

test("PostgreSQL subscription filters agree with status for nullable dates", { skip: !process.env.TEST_SUBSCRIPTION_FILTER_DATABASE_URL }, async () => {
  const url = new URL(process.env.TEST_SUBSCRIPTION_FILTER_DATABASE_URL);
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname) || url.pathname !== "/dukapilot_filter_test") throw new Error("Only the dedicated local subscription test database is allowed");
  const pool = new Pool({ connectionString: url.toString() });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const now = new Date("2026-11-26T12:00:00Z");
  const dates = [null, new Date("2026-11-25T12:00:00Z"), now, new Date("2026-11-27T12:00:00Z")];
  const shops = [];
  try {
    await pool.query('CREATE TABLE "shops" (id text PRIMARY KEY, plan text NOT NULL, "isActive" boolean NOT NULL, "trialEndsAt" timestamp(3), "subscriptionEndsAt" timestamp(3))');
    for (const plan of ["FREE_TRIAL", "BASIC", "PRO"]) for (const isActive of [true, false]) for (const trialEndsAt of dates) for (const subscriptionEndsAt of dates) {
      const shop = { id: String(shops.length), plan, isActive, trialEndsAt, subscriptionEndsAt };
      shops.push(shop);
      await pool.query('INSERT INTO "shops" (id, plan, "isActive", "trialEndsAt", "subscriptionEndsAt") VALUES ($1,$2,$3,$4::timestamptz AT TIME ZONE \'UTC\',$5::timestamptz AT TIME ZONE \'UTC\')', [shop.id, plan, isActive, trialEndsAt?.toISOString() || null, subscriptionEndsAt?.toISOString() || null]);
    }
    for (const status of ["trial", "active", "expired", "suspended"]) {
      const rows = await prisma.shop.findMany({ where: subscriptionStatusWhere(status, now), select: { id: true } });
      const actual = rows.map((row) => row.id).sort();
      const expected = shops.filter((shop) => subscriptionSnapshot(shop, now).status === status).map((shop) => shop.id).sort();
      assert.deepEqual(actual, expected, status);
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
});
