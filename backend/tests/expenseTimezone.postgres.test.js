const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const fs = require("node:fs");
const path = require("node:path");
const { occurredExpenseDateSql, needsExpenseDateReviewSql } = require("../src/lib/expenseReporting");

const url = process.env.DATABASE_URL || "";
if (!/localhost|127\.0\.0\.1|dukapilot_test/i.test(url)) throw new Error("Expense timezone tests require a local test database");

test("expense review uses Tanzania business dates, independent of database session timezone", async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const timezone of ["UTC", "America/New_York"]) {
      await client.query(`SET TIME ZONE '${timezone}'`);
      const sql = `WITH e AS (SELECT $1::timestamp AS "createdAt", $2::timestamp AS "spentAt", $3::timestamp AS "dateReviewedAt", $4::boolean AS "requiresDateReview") SELECT ${occurredExpenseDateSql("e")} AS occurred, ${needsExpenseDateReviewSql("e")} AS review FROM e`;
      const cases = [
        ["2026-10-29 21:46:53", "2026-10-30 12:00:00", null, false, true, false],
        ["2026-10-29 21:46:53", "2026-10-30 12:00:00", null, true, false, true],
        ["2026-10-29 20:59:59", "2026-10-30 12:00:00", null, false, false, true],
        ["2026-10-29 21:00:00", "2026-10-29 21:00:00", null, false, true, false],
        ["2026-10-29 20:59:59", "2026-10-30 12:00:00", "2026-10-31 08:00:00", true, true, false],
        ["2026-10-31 10:00:00", "2026-10-01 12:00:00", null, false, true, false],
      ];
      for (const [created, spent, reviewed, preserved, occurred, review] of cases) {
        const result = await client.query(sql, [created, spent, reviewed, preserved]);
        assert.deepEqual(result.rows[0], { occurred, review }, `${timezone}: ${created}, ${spent}`);
      }
    }
  } finally {
    await client.end();
  }
});

test("migration preserves previously flagged same-day entries without marking paid", async () => {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('CREATE TEMP TABLE expenses (id serial PRIMARY KEY, "createdAt" timestamp NOT NULL, "spentAt" timestamp NOT NULL, "dateReviewedAt" timestamp)');
    await client.query(`INSERT INTO expenses ("createdAt", "spentAt", "dateReviewedAt") VALUES ('2026-10-29 21:46:53', '2026-10-30 12:00:00', NULL), ('2026-10-29 20:59:59', '2026-10-30 12:00:00', NULL), ('2026-10-29 21:46:53', '2026-10-30 12:00:00', '2026-10-31 08:00:00'), ('2026-10-30 09:00:00', '2026-10-30 12:00:00', NULL)`);
    const migration = fs.readFileSync(path.join(__dirname, "../prisma/migrations/20261031001000_expense_review_timezone/migration.sql"), "utf8");
    await client.query(migration);
    const result = await client.query('SELECT "requiresDateReview", "dateReviewedAt" IS NOT NULL AS verified FROM expenses ORDER BY id');
    assert.deepEqual(result.rows, [
      { requiresDateReview: true, verified: false },
      { requiresDateReview: false, verified: false },
      { requiresDateReview: false, verified: true },
      { requiresDateReview: false, verified: false },
    ]);
  } finally {
    await client.end();
  }
});
