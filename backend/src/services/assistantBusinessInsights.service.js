const prisma = require("../lib/prisma");

async function supplierBalances(shopId, supplierId = null, client = prisma, creditsOnly = false) {
  const rows = await client.$queryRawUnsafe(`
    WITH payment_totals AS (
      SELECT a."stockReceiptId", SUM(a.amount) AS amount FROM supplier_payment_allocations a
      JOIN supplier_payments p ON p.id = a."supplierPaymentId" WHERE p."shopId" = $1 GROUP BY a."stockReceiptId"
    ), credit_totals AS (
      SELECT c."stockReceiptId", SUM(cl.amount) AS amount FROM supplier_credits c
      JOIN supplier_credit_lines cl ON cl."supplierCreditId" = c.id WHERE c."shopId" = $1 GROUP BY c."stockReceiptId"
    ), balances AS (
      SELECT sr."supplierId", sr."receivedAt", sr."totalLandedCost" - COALESCE(pc."correctedAmount", sr."paidAtReceipt") - COALESCE(pt.amount, 0) - COALESCE(ct.amount, 0) AS balance
      FROM stock_receipts sr LEFT JOIN payment_totals pt ON pt."stockReceiptId" = sr.id
      LEFT JOIN credit_totals ct ON ct."stockReceiptId" = sr.id
      LEFT JOIN LATERAL (
        SELECT c."correctedAmount" FROM stock_receipt_payment_corrections c
        WHERE c."stockReceiptId" = sr.id AND c."shopId" = $1
          AND NOT EXISTS (SELECT 1 FROM stock_receipt_payment_corrections next WHERE next."previousCorrectionId" = c.id AND next."shopId" = c."shopId")
        LIMIT 1
      ) pc ON TRUE
      WHERE sr."shopId" = $1 AND sr."supplierId" IS NOT NULL AND ($2::text IS NULL OR sr."supplierId" = $2)
    )
    SELECT s.id, s.name, SUM(b.balance)::bigint AS balance,
      COALESCE(SUM(CASE WHEN b.balance > 0 AND b."receivedAt" < CURRENT_TIMESTAMP - INTERVAL '30 days' THEN b.balance ELSE 0 END), 0)::bigint AS "olderThan30"
    FROM balances b JOIN suppliers s ON s.id = b."supplierId"
    GROUP BY s.id, s.name HAVING NOT $3::boolean OR SUM(b.balance) < 0
    ORDER BY CASE WHEN $3::boolean THEN SUM(b.balance) END ASC, SUM(b.balance) DESC, s.name ASC, s.id ASC LIMIT 5`, shopId, supplierId, creditsOnly);
  return rows.map((row) => ({ ...row, balance: Number(row.balance), olderThan30: Number(row.olderThan30) }));
}

async function debtCollections(shopId, from, to, client = prisma) {
  const rows = await client.$queryRawUnsafe(`
    SELECT COALESCE(SUM(dp.amount), 0)::bigint AS amount, COUNT(*)::int AS count
    FROM debt_payments dp JOIN debts d ON d.id = dp."debtId"
    LEFT JOIN sales s ON s.id = d."saleId"
    LEFT JOIN quotation_payments qp ON qp."debtPaymentId" = dp.id
    WHERE d."shopId" = $1 AND COALESCE(qp."paidAt", dp."createdAt") >= $2 AND COALESCE(qp."paidAt", dp."createdAt") < $3
      AND (qp.id IS NULL OR (s."createdAt" IS NOT NULL AND qp."paidAt" >= s."createdAt"))`, shopId, from, to);
  return { amount: Number(rows[0]?.amount || 0), count: Number(rows[0]?.count || 0) };
}

module.exports = { supplierBalances, debtCollections };
