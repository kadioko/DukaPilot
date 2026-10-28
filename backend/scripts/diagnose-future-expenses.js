require("dotenv").config();

const prisma = require("../src/lib/prisma");

function shopIdArgument() {
  const index = process.argv.indexOf("--shop-id");
  return index >= 0 ? String(process.argv[index + 1] || "").trim() : "";
}

async function main() {
  const shopId = shopIdArgument();
  if (!shopId) {
    console.error("Usage: npm run expenses:diagnose-future -- --shop-id <exact-shop-id>");
    process.exitCode = 2;
    return;
  }

  console.log(`Read-only expense date review for shop ${shopId}`);
  const rows = await prisma.$queryRawUnsafe(`
    SELECT e.id, e.title, e.amount, e.category, e."paymentMethod", e."spentAt", e."createdAt",
      e."recurringExpenseId", r."nextDueAt", r."dayOfMonth"
    FROM expenses e
    LEFT JOIN recurring_expenses r
      ON r.id = e."recurringExpenseId" AND r."shopId" = e."shopId"
    WHERE e."shopId" = $1
      AND e."dateReviewedAt" IS NULL
      AND e."spentAt" >= ((date_trunc('day', e."createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam') + interval '1 day') AT TIME ZONE 'Africa/Dar_es_Salaam')
    ORDER BY e."createdAt" DESC
    LIMIT 500
  `, shopId);

  if (!rows.length) {
    console.log("No future-dated expense records need review for this shop.");
    return;
  }

  console.log(`${rows.length} candidate record(s). These are review candidates, not proof of an error or payment.`);
  console.table(rows.map((row) => ({
    expenseId: row.id,
    title: row.title,
    amountTZS: Number(row.amount),
    category: row.category,
    method: row.paymentMethod,
    spentAt: row.spentAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    recurringExpenseId: row.recurringExpenseId || "",
    nextDueAt: row.nextDueAt?.toISOString() || "",
    anchorDay: row.dayOfMonth || "",
  })));
}

main()
  .catch((error) => {
    console.error(`Read-only diagnostic failed: ${error.message || error}`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
