const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { findOpenCashSession } = require("../lib/cashSession");
const { invalidateDashboardHistory } = require("../services/dashboard-cache.service");

const METHODS = new Set(["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK"]);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function error(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function requestKey(value) {
  const key = String(value || "").trim();
  return /^[a-f0-9-]{16,80}$/i.test(key) ? key : null;
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function sum(rows, field = "amount") {
  return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}

function latestPaymentCorrection(corrections = []) {
  const previousIds = new Set(corrections.map((item) => item.previousCorrectionId).filter(Boolean));
  return corrections.find((item) => !previousIds.has(item.id)) || null;
}

function balanceOf(receipt) {
  const latestCorrection = latestPaymentCorrection(receipt.paymentCorrections || []);
  const paidAtReceipt = latestCorrection ? latestCorrection.correctedAmount : receipt.paidAtReceipt;
  return receipt.totalLandedCost - paidAtReceipt
    - sum(receipt.paymentAllocations || [])
    - sum((receipt.credits || []).flatMap((credit) => credit.items || []));
}

function returnCreditAmount(receiptLine, cumulativeQuantity, previouslyCredited) {
  if (!Number.isSafeInteger(receiptLine.landedTotalCost) || receiptLine.landedTotalCost < 0 || !Number.isSafeInteger(cumulativeQuantity) || cumulativeQuantity < 0 || !Number.isSafeInteger(receiptLine.quantity) || receiptLine.quantity <= 0) return null;
  const total = BigInt(receiptLine.landedTotalCost);
  const quantity = BigInt(receiptLine.quantity);
  const cumulative = BigInt(cumulativeQuantity);
  const roundedCumulativeCredit = (total * cumulative * 2n + quantity) / (2n * quantity);
  const amount = roundedCumulativeCredit - BigInt(previouslyCredited || 0);
  return amount >= 0n && amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null;
}

function includeReceiptLedger() {
  return {
    supplier: { select: { id: true, name: true, phone: true } },
    items: { include: { product: { select: { id: true, name: true, unit: true, currentStock: true } }, supplierCreditLines: { include: { supplierCredit: { select: { kind: true, reversalOfId: true } } } } } },
    paymentAllocations: { include: { supplierPayment: { select: { id: true, kind: true, amount: true, paymentMethod: true, paymentReference: true, paidAt: true, reversalOfId: true, reversal: { select: { id: true } } } } } },
    paymentCorrections: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    credits: { include: { items: true, reversal: { select: { id: true } }, returnStatusEvents: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } } },
  };
}

async function lockReceipts(tx, ids, shopId) {
  for (const id of [...new Set(ids)].sort()) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "stock_receipts" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', id, shopId);
  }
}

async function loadReceiptBalances(tx, ids, shopId) {
  const receipts = await tx.stockReceipt.findMany({
    where: { id: { in: ids }, shopId, supplierId: { not: null } },
    include: { paymentAllocations: { select: { amount: true } }, credits: { include: { items: { select: { amount: true } } } }, paymentCorrections: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  return new Map(receipts.map((receipt) => [receipt.id, { receipt, balance: balanceOf(receipt) }]));
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);
  const search = String(req.query.search || "").trim();
  const parameters = [shopId];
  let searchClause = "";
  if (search) {
    parameters.push(`%${search}%`);
    searchClause = `AND (s."name" ILIKE $${parameters.length} OR s."phone" ILIKE $${parameters.length})`;
  }
  const offset = (page - 1) * limit;
  parameters.push(limit, offset);
  const rows = await prisma.$queryRawUnsafe(`
    WITH payment_totals AS (
      SELECT a."stockReceiptId", SUM(a."amount") AS amount
      FROM "supplier_payment_allocations" a
      JOIN "supplier_payments" p ON p."id" = a."supplierPaymentId"
      WHERE p."shopId" = $1 GROUP BY a."stockReceiptId"
    ), credit_totals AS (
      SELECT c."stockReceiptId", SUM(cl."amount") AS amount
      FROM "supplier_credits" c JOIN "supplier_credit_lines" cl ON cl."supplierCreditId" = c."id"
      WHERE c."shopId" = $1 GROUP BY c."stockReceiptId"
    ), receipt_balances AS (
      SELECT sr."supplierId", sr."id", sr."receivedAt",
        sr."totalLandedCost" - COALESCE(pc."correctedAmount", sr."paidAtReceipt") - COALESCE(pt.amount, 0) - COALESCE(ct.amount, 0) AS balance
      FROM "stock_receipts" sr
      LEFT JOIN payment_totals pt ON pt."stockReceiptId" = sr."id"
      LEFT JOIN credit_totals ct ON ct."stockReceiptId" = sr."id"
      LEFT JOIN LATERAL (
        SELECT c."correctedAmount" FROM "stock_receipt_payment_corrections" c
        WHERE c."stockReceiptId" = sr."id" AND c."shopId" = $1
          AND NOT EXISTS (
            SELECT 1 FROM "stock_receipt_payment_corrections" next
            WHERE next."previousCorrectionId" = c.id AND next."shopId" = c."shopId"
          )
        LIMIT 1
      ) pc ON TRUE
      WHERE sr."shopId" = $1 AND sr."supplierId" IS NOT NULL
    )
    SELECT s."id", s."name", s."phone",
      COALESCE(SUM(rb.balance), 0)::bigint AS "balance",
      COALESCE(SUM(CASE WHEN rb.balance > 0 AND rb."receivedAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN rb.balance ELSE 0 END), 0)::bigint AS "current",
      COALESCE(SUM(CASE WHEN rb.balance > 0 AND rb."receivedAt" < CURRENT_TIMESTAMP - INTERVAL '30 days' AND rb."receivedAt" >= CURRENT_TIMESTAMP - INTERVAL '60 days' THEN rb.balance ELSE 0 END), 0)::bigint AS "days31To60",
      COALESCE(SUM(CASE WHEN rb.balance > 0 AND rb."receivedAt" < CURRENT_TIMESTAMP - INTERVAL '60 days' AND rb."receivedAt" >= CURRENT_TIMESTAMP - INTERVAL '90 days' THEN rb.balance ELSE 0 END), 0)::bigint AS "days61To90",
      COALESCE(SUM(CASE WHEN rb.balance > 0 AND rb."receivedAt" < CURRENT_TIMESTAMP - INTERVAL '90 days' THEN rb.balance ELSE 0 END), 0)::bigint AS "over90",
      COUNT(rb.id)::int AS "receiptCount"
    FROM (SELECT DISTINCT "supplierId" FROM "stock_receipts" WHERE "shopId" = $1 AND "supplierId" IS NOT NULL) seen
    JOIN "suppliers" s ON s."id" = seen."supplierId"
    LEFT JOIN receipt_balances rb ON rb."supplierId" = s."id"
    WHERE TRUE ${searchClause}
    GROUP BY s."id", s."name", s."phone"
    ORDER BY SUM(rb.balance) DESC, s."name" ASC
    LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`, ...parameters);
  const countParameters = search ? [shopId, `%${search}%`] : [shopId];
  const countSearch = search ? 'AND (s."name" ILIKE $2 OR s."phone" ILIKE $2)' : "";
  const countRows = await prisma.$queryRawUnsafe(`
    SELECT COUNT(DISTINCT sr."supplierId")::int AS total
    FROM "stock_receipts" sr JOIN "suppliers" s ON s."id" = sr."supplierId"
    WHERE sr."shopId" = $1 AND sr."supplierId" IS NOT NULL ${countSearch}`, ...countParameters);
  res.json({ suppliers: rows.map((row) => ({ ...row, balance: Number(row.balance), current: Number(row.current), days31To60: Number(row.days31To60), days61To90: Number(row.days61To90), over90: Number(row.over90), receiptCount: Number(row.receiptCount) })), pagination: { page, limit, total: Number(countRows[0]?.total || 0), totalPages: Math.ceil(Number(countRows[0]?.total || 0) / limit) } });
});

const receipts = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const supplierId = String(req.params.supplierId || "");
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const where = { shopId, supplierId };
  const [rows, total] = await Promise.all([
    prisma.stockReceipt.findMany({ where, include: includeReceiptLedger(), orderBy: { receivedAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.stockReceipt.count({ where }),
  ]);
  res.json({ receipts: rows.map((receipt) => ({ ...receipt, balance: balanceOf(receipt) })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

const correctReceiptPayment = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const receiptId = String(req.params.receiptId || "").trim();
  const key = requestKey(req.body.requestKey);
  const correctedAmount = Number(req.body.correctedAmount);
  const requestedMethod = String(req.body.paymentMethod || "").toUpperCase();
  const note = String(req.body.note || "").trim();
  if (!receiptId || !key) return res.status(400).json({ error: "Receipt and valid correction retry key are required" });
  if (!Number.isSafeInteger(correctedAmount) || correctedAmount < 0 || correctedAmount > 2_147_483_647) return res.status(400).json({ error: "Corrected amount must be a whole TZS value between 0 and 2,147,483,647" });
  if (![...METHODS, "CREDIT"].includes(requestedMethod) || (correctedAmount > 0 && requestedMethod === "CREDIT")) return res.status(400).json({ error: "Choose a valid payment method for the corrected amount" });
  if (!note || note.length > 500) return res.status(400).json({ error: "Enter a correction reason (up to 500 characters)" });
  const correctedMethod = correctedAmount === 0 ? "CREDIT" : requestedMethod;
  const requestHash = hash({ receiptId, correctedAmount, correctedMethod, note });
  let correction;
  let reused = false;
  try {
    correction = await prisma.$transaction(async (tx) => {
      const replay = await tx.stockReceiptPaymentCorrection.findFirst({ where: { shopId, requestKey: key } });
      if (replay) {
        if (replay.requestHash !== requestHash) throw error("This correction retry key was already used for different details", 409);
        reused = true;
        return replay;
      }
      await lockReceipts(tx, [receiptId], shopId);
      const receipt = await tx.stockReceipt.findFirst({
        where: { id: receiptId, shopId },
        include: {
          paymentCorrections: true,
          paymentAllocations: { select: { amount: true } },
          credits: { include: { items: { select: { amount: true } } } },
        },
      });
      if (!receipt) throw error("Supplier receipt not found", 404);
      const previousCorrection = latestPaymentCorrection(receipt.paymentCorrections);
      const previousAmount = previousCorrection?.correctedAmount ?? receipt.paidAtReceipt;
      const previousMethod = previousCorrection?.correctedMethod ?? receipt.paymentMethod;
      const alreadySettledElsewhere = sum(receipt.paymentAllocations) + sum(receipt.credits.flatMap((credit) => credit.items));
      const maximumReceiptPayment = Math.min(receipt.totalLandedCost, receipt.totalLandedCost - alreadySettledElsewhere);
      if (correctedAmount > maximumReceiptPayment) throw error("Corrected receipt payment cannot exceed the remaining eligible receipt amount", 409);
      const cashOutAdjustment = (correctedMethod === "CASH" ? correctedAmount : 0) - (previousMethod === "CASH" ? previousAmount : 0);
      const cashSession = cashOutAdjustment !== 0 ? await findOpenCashSession(tx, shopId, req.user) : null;
      if (cashOutAdjustment !== 0 && !cashSession) throw error("Open a cash shift to record the cash effect of this correction in Daily Close", 409);
      return tx.stockReceiptPaymentCorrection.create({
        data: {
          shopId,
          stockReceiptId: receipt.id,
          previousCorrectionId: previousCorrection?.id || null,
          previousAmount,
          correctedAmount,
          previousMethod,
          correctedMethod,
          cashOutAdjustment,
          cashSessionId: cashSession?.id || null,
          requestKey: key,
          requestHash,
          note,
          recordedBy: req.user.staffId || req.user.userId,
        },
      });
    }, { isolationLevel: "Serializable" });
  } catch (err) {
    if (err.code === "P2002") {
      const replay = await prisma.stockReceiptPaymentCorrection.findFirst({ where: { shopId, requestKey: key } });
      if (replay?.requestHash === requestHash) { correction = replay; reused = true; }
      else if (replay) return res.status(409).json({ error: "This correction retry key was already used for different details" });
      else throw err;
    } else if (err.code === "P2034") {
      const replay = await prisma.stockReceiptPaymentCorrection.findFirst({ where: { shopId, requestKey: key } });
      if (replay?.requestHash === requestHash) { correction = replay; reused = true; }
      else return res.status(409).json({ error: "Another receipt payment correction happened at the same time. Refresh and try again." });
    } else if (err.status) return res.status(err.status).json({ error: err.message });
    else throw err;
  }
  if (!reused) {
    await invalidateDashboardHistory(shopId);
    req.audit = {
      action: "stock_receipt.payment.correct",
      resourceType: "stock_receipt_payment_correction",
      resourceId: correction.id,
      metadata: { stockReceiptId: receiptId, previousAmount: correction.previousAmount, correctedAmount: correction.correctedAmount, previousMethod: correction.previousMethod, correctedMethod: correction.correctedMethod, cashOutAdjustment: correction.cashOutAdjustment, cashSessionId: correction.cashSessionId },
    };
  }
  res.status(reused ? 200 : 201).json({ correction, reused });
});

const recordPayment = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const key = requestKey(req.body.requestKey);
  const method = String(req.body.paymentMethod || "").toUpperCase();
  const amount = positiveInteger(req.body.amount);
  const allocations = Array.isArray(req.body.allocations) ? req.body.allocations.map((item) => ({ stockReceiptId: String(item.stockReceiptId || ""), amount: positiveInteger(item.amount) })) : [];
  if (!key) return res.status(400).json({ error: "A valid payment retry key is required" });
  if (!METHODS.has(method)) return res.status(400).json({ error: "Choose a valid payment method" });
  if (!amount || !allocations.length || allocations.some((item) => !item.stockReceiptId || !item.amount) || sum(allocations) !== amount) return res.status(400).json({ error: "Payment amount must equal the positive whole-TZS allocations" });
  if (new Set(allocations.map((item) => item.stockReceiptId)).size !== allocations.length) return res.status(400).json({ error: "Allocate to each receipt only once" });
  const paymentReference = String(req.body.paymentReference || "").trim() || null;
  const note = String(req.body.note || "").trim() || null;
  const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) return res.status(400).json({ error: "Payment date is invalid" });
  const normalizedAllocations = allocations.sort((a, b) => a.stockReceiptId.localeCompare(b.stockReceiptId));
  const requestHash = hash({ amount, method, paymentReference, note, paidAt: req.body.paidAt ? paidAt.toISOString() : null, allocations: normalizedAllocations });
  let payment;
  let reused = false;
  try {
    payment = await prisma.$transaction(async (tx) => {
      const replay = await tx.supplierPayment.findFirst({ where: { shopId, requestKey: key }, include: { allocations: true } });
      if (replay) {
        if (replay.requestHash !== requestHash) throw error("This payment retry key was already used for different details", 409);
        reused = true;
        return replay;
      }
      await lockReceipts(tx, normalizedAllocations.map((item) => item.stockReceiptId), shopId);
      const balances = await loadReceiptBalances(tx, normalizedAllocations.map((item) => item.stockReceiptId), shopId);
      if (balances.size !== normalizedAllocations.length) throw error("One or more supplier receipts were not found in this shop", 404);
      let supplierId = null;
      for (const allocation of normalizedAllocations) {
        const row = balances.get(allocation.stockReceiptId);
        if (supplierId && supplierId !== row.receipt.supplierId) throw error("A supplier payment can only be allocated to one supplier", 400);
        supplierId = row.receipt.supplierId;
        if (row.balance <= 0 || allocation.amount > row.balance) throw error("An allocation exceeds the outstanding balance on a receipt", 409);
      }
      const cashSession = method === "CASH" ? await findOpenCashSession(tx, shopId, req.user) : null;
      if (method === "CASH" && !cashSession) throw error("Open your cash shift before recording a cash supplier payment", 409);
      const created = await tx.supplierPayment.create({
        data: { shopId, supplierId, amount, paymentMethod: method, paymentReference, note, requestKey: key, requestHash, paidAt, recordedBy: req.user.staffId || req.user.userId, cashSessionId: cashSession?.id || null, allocations: { create: normalizedAllocations } },
        include: { allocations: true },
      });
      return created;
    }, { isolationLevel: "Serializable" });
  } catch (err) {
    if (err.code === "P2002") {
      const replay = await prisma.supplierPayment.findFirst({ where: { shopId, requestKey: key }, include: { allocations: true } });
      if (replay?.requestHash === requestHash) { payment = replay; reused = true; }
      else if (replay) return res.status(409).json({ error: "This payment retry key was already used for different details" });
      else throw err;
    } else if (err.code === "P2034") {
      const replay = await prisma.supplierPayment.findFirst({ where: { shopId, requestKey: key }, include: { allocations: true } });
      if (replay?.requestHash === requestHash) { payment = replay; reused = true; }
      else return res.status(409).json({ error: "Another supplier balance update happened at the same time. Refresh and try again." });
    }
    else if (err.status) return res.status(err.status).json({ error: err.message });
    else throw err;
  }
  if (!reused) {
    await invalidateDashboardHistory(shopId);
    req.audit = { action: "supplier_payment.create", resourceType: "supplier_payment", resourceId: payment.id, metadata: { supplierId: payment.supplierId, amount: payment.amount, paymentMethod: payment.paymentMethod, allocationCount: payment.allocations.length, cashSessionId: payment.cashSessionId } };
  }
  res.status(reused ? 200 : 201).json({ payment, reused });
});

const recordRefund = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const receiptId = String(req.body.stockReceiptId || "").trim();
  const key = requestKey(req.body.requestKey);
  const method = String(req.body.paymentMethod || "").toUpperCase();
  const amount = positiveInteger(req.body.amount);
  const paymentReference = String(req.body.paymentReference || "").trim() || null;
  const note = String(req.body.note || "").trim() || null;
  const paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
  if (!receiptId || !key) return res.status(400).json({ error: "Receipt and valid refund retry key are required" });
  if (!amount || amount > 2_147_483_647) return res.status(400).json({ error: "Refund must be a positive whole-TZS amount within the supported limit" });
  if (!METHODS.has(method) || method === "CREDIT") return res.status(400).json({ error: "Choose how the supplier actually refunded the money" });
  if (Number.isNaN(paidAt.getTime())) return res.status(400).json({ error: "Refund date is invalid" });
  const requestHash = hash({ receiptId, amount, method, paymentReference, note, paidAt: req.body.paidAt ? paidAt.toISOString() : null });
  let payment;
  let reused = false;
  try {
    payment = await prisma.$transaction(async (tx) => {
      const replay = await tx.supplierPayment.findFirst({ where: { shopId, requestKey: key }, include: { allocations: true } });
      if (replay) {
        if (replay.requestHash !== requestHash || replay.kind !== "REFUND") throw error("This retry key was already used for different supplier transaction details", 409);
        reused = true;
        return replay;
      }
      await lockReceipts(tx, [receiptId], shopId);
      const row = (await loadReceiptBalances(tx, [receiptId], shopId)).get(receiptId);
      if (!row) throw error("Supplier receipt not found in this shop", 404);
      if (row.balance >= 0) throw error("This receipt has no outstanding supplier credit to refund", 409);
      if (amount > Math.abs(row.balance)) throw error("Refund exceeds the supplier credit available on this receipt", 409);
      const cashSession = method === "CASH" ? await findOpenCashSession(tx, shopId, req.user) : null;
      if (method === "CASH" && !cashSession) throw error("Open your cash shift before recording a cash supplier refund", 409);
      return tx.supplierPayment.create({
        data: {
          shopId,
          supplierId: row.receipt.supplierId,
          kind: "REFUND",
          amount: -amount,
          paymentMethod: method,
          paymentReference,
          note,
          requestKey: key,
          requestHash,
          paidAt,
          recordedBy: req.user.staffId || req.user.userId,
          cashSessionId: cashSession?.id || null,
          allocations: { create: [{ stockReceiptId: receiptId, amount: -amount }] },
        },
        include: { allocations: true },
      });
    }, { isolationLevel: "Serializable" });
  } catch (err) {
    if (err.code === "P2002") {
      const replay = await prisma.supplierPayment.findFirst({ where: { shopId, requestKey: key }, include: { allocations: true } });
      if (replay?.kind === "REFUND" && replay.requestHash === requestHash) { payment = replay; reused = true; }
      else if (replay) return res.status(409).json({ error: "This retry key was already used for different supplier transaction details" });
      else throw err;
    } else if (err.code === "P2034") {
      const replay = await prisma.supplierPayment.findFirst({ where: { shopId, requestKey: key }, include: { allocations: true } });
      if (replay?.kind === "REFUND" && replay.requestHash === requestHash) { payment = replay; reused = true; }
      else return res.status(409).json({ error: "The supplier balance changed at the same time. Refresh and try again." });
    } else if (err.status) return res.status(err.status).json({ error: err.message });
    else throw err;
  }
  if (!reused) {
    await invalidateDashboardHistory(shopId);
    req.audit = { action: "supplier_refund.create", resourceType: "supplier_payment", resourceId: payment.id, metadata: { supplierId: payment.supplierId, stockReceiptId: receiptId, amount, paymentMethod: method, cashSessionId: payment.cashSessionId } };
  }
  res.status(reused ? 200 : 201).json({ payment, reused });
});

const recordCredit = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const receiptId = String(req.body.stockReceiptId || "");
  const key = requestKey(req.body.requestKey);
  const kind = String(req.body.kind || "").toUpperCase();
  const note = String(req.body.note || "").trim() || null;
  const issuedAt = req.body.issuedAt ? new Date(req.body.issuedAt) : new Date();
  const rawItems = Array.isArray(req.body.items) ? req.body.items : [];
  if (!receiptId || !key) return res.status(400).json({ error: "Receipt and valid retry key are required" });
  if (!["RETURN", "CREDIT_NOTE"].includes(kind)) return res.status(400).json({ error: "Choose a supplier return or credit note" });
  if (!rawItems.length || Number.isNaN(issuedAt.getTime())) return res.status(400).json({ error: "Add credit items and a valid date" });
  const items = rawItems.map((item) => ({ stockReceiptItemId: String(item.stockReceiptItemId || ""), quantity: Number(item.quantity || 0), amount: Number(item.amount || 0) }));
  if (items.some((item) => !item.stockReceiptItemId || !Number.isSafeInteger(item.quantity) || item.quantity < 0 || !Number.isSafeInteger(item.amount) || item.amount < 0 || (kind === "RETURN" ? item.quantity <= 0 : item.amount <= 0))) return res.status(400).json({ error: "Return quantities and credit amounts must be valid whole values" });
  if (kind === "CREDIT_NOTE" && items.some((item) => item.quantity !== 0)) return res.status(400).json({ error: "A non-stock credit note must not change inventory quantities" });
  if (new Set(items.map((item) => item.stockReceiptItemId)).size !== items.length) return res.status(400).json({ error: "Each original receipt item can appear only once" });
  const requestHash = hash({ receiptId, kind, note, issuedAt: req.body.issuedAt ? issuedAt.toISOString() : null, items: items.sort((a, b) => a.stockReceiptItemId.localeCompare(b.stockReceiptItemId)) });
  let credit;
  let reused = false;
  try {
    credit = await prisma.$transaction(async (tx) => {
      const replay = await tx.supplierCredit.findFirst({ where: { shopId, requestKey: key }, include: { items: true } });
      if (replay) {
        if (replay.requestHash !== requestHash) throw error("This supplier credit retry key was already used for different details", 409);
        reused = true;
        return replay;
      }
      await lockReceipts(tx, [receiptId], shopId);
      const receipt = await tx.stockReceipt.findFirst({
        where: { id: receiptId, shopId, supplierId: { not: null } },
        select: {
          id: true,
          supplierId: true,
          items: {
            where: { id: { in: items.map((item) => item.stockReceiptItemId) } },
            include: { product: { select: { id: true, currentStock: true, shopId: true } } },
          },
        },
      });
      if (!receipt || receipt.items.length !== items.length) throw error("Original receipt items were not found in this shop", 404);
      const currentBalance = (await loadReceiptBalances(tx, [receiptId], shopId)).get(receiptId).balance;
      const lineMap = new Map(receipt.items.map((item) => [item.id, item]));
      const prepared = [];
      let totalCredit = 0;
      for (const item of items) {
        const original = lineMap.get(item.stockReceiptItemId);
        let amount = item.amount;
        if (kind === "RETURN") {
          const returned = await tx.supplierCreditLine.aggregate({ where: { stockReceiptItemId: original.id }, _sum: { quantity: true, amount: true } });
          const returnedQuantity = returned._sum.quantity || 0;
          if (returnedQuantity + item.quantity > original.quantity) throw error("Return quantity exceeds the remaining eligible quantity", 409);
          amount = returnCreditAmount(original, returnedQuantity + item.quantity, returned._sum.amount || 0);
          if (amount === null || (item.amount !== 0 && item.amount !== amount)) throw error("A return credit must match the original landed cost for the returned quantity");
        }
        if (!Number.isSafeInteger(amount) || amount < 0 || (kind === "CREDIT_NOTE" && amount === 0)) throw error("Credit value must be a valid whole TZS amount");
        if (kind === "RETURN") {
          await tx.$queryRawUnsafe('SELECT "id" FROM "products" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', original.product.id, shopId);
          const stock = await tx.product.updateMany({ where: { id: original.product.id, shopId, currentStock: { gte: item.quantity } }, data: { currentStock: { decrement: item.quantity } } });
          if (stock.count !== 1) throw error(`Not enough current stock to return ${original.product.id}`, 409);
        }
        prepared.push({ original, quantity: kind === "RETURN" ? item.quantity : 0, amount });
        totalCredit += amount;
      }
      if (kind === "CREDIT_NOTE" && totalCredit > Math.max(0, currentBalance)) throw error("Credit note exceeds the remaining amount owed on this receipt", 409);
      const created = await tx.supplierCredit.create({
        data: { shopId, supplierId: receipt.supplierId, stockReceiptId: receipt.id, kind, requestKey: key, requestHash, note, issuedAt, recordedBy: req.user.staffId || req.user.userId, items: { create: prepared.map(({ original, quantity, amount }) => ({ stockReceiptItemId: original.id, quantity, amount })) } },
        include: { items: true },
      });
      if (kind === "RETURN") {
        for (const line of created.items) {
          const original = lineMap.get(line.stockReceiptItemId);
          await tx.stockMovement.create({ data: { type: "OUT", quantity: line.quantity, note: `Supplier return for receipt ${receipt.id.slice(-6)}`, productId: original.product.id, supplierCreditLineId: line.id } });
        }
        await tx.supplierReturnStatusEvent.create({
          data: {
            shopId,
            supplierCreditId: created.id,
            requestKey: `return-status-initial:${created.id}`,
            requestHash: hash({ supplierCreditId: created.id, status: "RECORDED" }),
            status: "RECORDED",
            note: note || "Return recorded; supplier handoff is not yet confirmed.",
            recordedBy: req.user.staffId || req.user.userId,
          },
        });
      }
      return created;
    }, { isolationLevel: "Serializable" });
  } catch (err) {
    if (err.code === "P2002") {
      const replay = await prisma.supplierCredit.findFirst({ where: { shopId, requestKey: key }, include: { items: true } });
      if (replay?.requestHash === requestHash) { credit = replay; reused = true; }
      else if (replay) return res.status(409).json({ error: "This supplier credit retry key was already used for different details" });
      else throw err;
    } else if (err.code === "P2034") {
      const replay = await prisma.supplierCredit.findFirst({ where: { shopId, requestKey: key }, include: { items: true } });
      if (replay?.requestHash === requestHash) { credit = replay; reused = true; }
      else return res.status(409).json({ error: "Another supplier balance update happened at the same time. Refresh and try again." });
    }
    else if (err.status) return res.status(err.status).json({ error: err.message });
    else throw err;
  }
  if (!reused) {
    await invalidateDashboardHistory(shopId);
    req.audit = { action: `supplier_credit.${credit.kind.toLowerCase()}`, resourceType: "supplier_credit", resourceId: credit.id, metadata: { supplierId: credit.supplierId, stockReceiptId: credit.stockReceiptId, amount: sum(credit.items), itemCount: credit.items.length } };
  }
  res.status(reused ? 200 : 201).json({ credit, reused });
});

const reversePayment = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const key = requestKey(req.body.requestKey);
  if (!key) return res.status(400).json({ error: "A valid reversal retry key is required" });
  let reversal;
  let reused = false;
  try {
    reversal = await prisma.$transaction(async (tx) => {
      const original = await tx.supplierPayment.findFirst({ where: { id: req.params.paymentId, shopId }, include: { allocations: true, reversal: true } });
      if (!original) throw error("Supplier payment not found", 404);
      const requestHash = hash({ reversalOfId: original.id, amount: -original.amount, allocations: original.allocations.map((item) => ({ stockReceiptId: item.stockReceiptId, amount: -item.amount })) });
      const replay = await tx.supplierPayment.findFirst({ where: { shopId, requestKey: key }, include: { allocations: true } });
      if (replay) {
        if (replay.requestHash !== requestHash) throw error("This reversal retry key was already used for different details", 409);
        reused = true;
        return replay;
      }
      if (original.reversal) throw error("This payment has already been reversed", 409);
      await tx.$queryRawUnsafe('SELECT "id" FROM "supplier_payments" WHERE "id" = $1 FOR UPDATE', original.id);
      const cashSession = original.paymentMethod === "CASH" ? await findOpenCashSession(tx, shopId, req.user) : null;
      if (original.paymentMethod === "CASH" && !cashSession) throw error("Open your cash shift before recording a cash payment reversal", 409);
      return tx.supplierPayment.create({ data: { shopId, supplierId: original.supplierId, kind: original.kind, amount: -original.amount, paymentMethod: original.paymentMethod, paymentReference: original.paymentReference, note: `Reversal of supplier payment ${original.id}`, requestKey: key, requestHash, recordedBy: req.user.staffId || req.user.userId, cashSessionId: cashSession?.id || null, reversalOfId: original.id, allocations: { create: original.allocations.map((item) => ({ stockReceiptId: item.stockReceiptId, amount: -item.amount })) } }, include: { allocations: true } });
    }, { isolationLevel: "Serializable" });
  } catch (err) {
    if (err.code === "P2002") {
      const [replay, existingReversal] = await Promise.all([
        prisma.supplierPayment.findFirst({ where: { shopId, requestKey: key }, include: { allocations: true } }),
        prisma.supplierPayment.findFirst({ where: { shopId, reversalOfId: req.params.paymentId }, select: { id: true } }),
      ]);
      if (replay?.reversalOfId === req.params.paymentId) { reversal = replay; reused = true; }
      else if (replay) return res.status(409).json({ error: "This reversal retry key was already used for different details" });
      else if (existingReversal) return res.status(409).json({ error: "This supplier payment has already been reversed" });
      else throw err;
    } else if (err.code === "P2034") {
      const replay = await prisma.supplierPayment.findFirst({ where: { shopId, requestKey: key }, include: { allocations: true } });
      if (replay?.reversalOfId === req.params.paymentId) { reversal = replay; reused = true; }
      else return res.status(409).json({ error: "Another supplier balance update happened at the same time. Refresh and try again." });
    }
    else if (err.status) return res.status(err.status).json({ error: err.message });
    else throw err;
  }
  if (!reused) {
    await invalidateDashboardHistory(shopId);
    req.audit = { action: "supplier_payment.reverse", resourceType: "supplier_payment", resourceId: reversal.id, metadata: { reversalOfId: reversal.reversalOfId, amount: reversal.amount, cashSessionId: reversal.cashSessionId } };
  }
  res.status(reused ? 200 : 201).json({ payment: reversal, reused });
});

const RETURN_STATUS_TRANSITIONS = {
  RECORDED: new Set(["HANDED_OVER", "DISPUTED"]),
  HANDED_OVER: new Set(["SUPPLIER_ACKNOWLEDGED", "DISPUTED"]),
  SUPPLIER_ACKNOWLEDGED: new Set(["DISPUTED"]),
  DISPUTED: new Set(["HANDED_OVER", "SUPPLIER_ACKNOWLEDGED"]),
};

const updateReturnStatus = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const creditId = String(req.params.creditId || "").trim();
  const key = requestKey(req.body.requestKey);
  const status = String(req.body.status || "").toUpperCase();
  const note = String(req.body.note || "").trim() || null;
  const reference = String(req.body.reference || "").trim() || null;
  if (!creditId || !key) return res.status(400).json({ error: "Return and valid retry key are required" });
  if (!Object.hasOwn(RETURN_STATUS_TRANSITIONS, status)) return res.status(400).json({ error: "Choose a valid supplier return status" });
  if (note?.length > 500 || reference?.length > 120) return res.status(400).json({ error: "Note or reference is too long" });
  if (status === "DISPUTED" && !note) return res.status(400).json({ error: "Add a note explaining the supplier dispute" });
  const requestHash = hash({ creditId, status, note, reference });
  let event;
  let reused = false;
  try {
    event = await prisma.$transaction(async (tx) => {
      const replay = await tx.supplierReturnStatusEvent.findFirst({ where: { shopId, requestKey: key } });
      if (replay) {
        if (replay.requestHash !== requestHash) throw error("This retry key was already used for different return details", 409);
        reused = true;
        return replay;
      }
      await tx.$queryRawUnsafe('SELECT "id" FROM "supplier_credits" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', creditId, shopId);
      const credit = await tx.supplierCredit.findFirst({ where: { id: creditId, shopId }, select: { id: true, kind: true, reversalOfId: true, reversal: { select: { id: true } } } });
      if (!credit || credit.kind !== "RETURN" || credit.reversalOfId) throw error("Supplier return not found", 404);
      if (credit.reversal) throw error("This supplier return was reversed and can no longer be updated", 409);
      const latest = await tx.supplierReturnStatusEvent.findFirst({ where: { shopId, supplierCreditId: creditId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const current = latest?.status || "RECORDED";
      if (!RETURN_STATUS_TRANSITIONS[current]?.has(status)) throw error(`Return status cannot move from ${current} to ${status}`, 409);
      if (current === "DISPUTED" && !note) throw error("Add a note explaining how the dispute was resolved", 400);
      return tx.supplierReturnStatusEvent.create({ data: { shopId, supplierCreditId: creditId, requestKey: key, requestHash, status, note, reference, recordedBy: req.user.staffId || req.user.userId } });
    }, { isolationLevel: "Serializable" });
  } catch (err) {
    if (err.code === "P2002" || err.code === "P2034") {
      const replay = await prisma.supplierReturnStatusEvent.findFirst({ where: { shopId, requestKey: key } });
      if (replay?.requestHash === requestHash) { event = replay; reused = true; }
      else if (replay) return res.status(409).json({ error: "This retry key was already used for different return details" });
      else return res.status(409).json({ error: "The return was updated at the same time. Refresh and try again." });
    } else if (err.status) return res.status(err.status).json({ error: err.message });
    else throw err;
  }
  if (!reused) req.audit = { action: "supplier_return.status", resourceType: "supplier_credit", resourceId: creditId, metadata: { status: event.status, reference: event.reference || undefined } };
  res.status(reused ? 200 : 201).json({ event, reused });
});

const reverseCredit = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const key = requestKey(req.body.requestKey);
  if (!key) return res.status(400).json({ error: "A valid reversal retry key is required" });
  let reversal;
  let reused = false;
  try {
    reversal = await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRawUnsafe('SELECT "id" FROM "supplier_credits" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', req.params.creditId, shopId);
      if (!locked.length) throw error("Supplier credit not found", 404);
      const original = await tx.supplierCredit.findFirst({ where: { id: req.params.creditId, shopId }, include: { items: { include: { stockReceiptItem: { include: { product: { select: { id: true } } } } } }, reversal: true } });
      if (!original) throw error("Supplier credit not found", 404);
      await lockReceipts(tx, [original.stockReceiptId], shopId);
      const requestHash = hash({ reversalOfId: original.id, items: original.items.map((item) => ({ stockReceiptItemId: item.stockReceiptItemId, quantity: -item.quantity, amount: -item.amount })) });
      const replay = await tx.supplierCredit.findFirst({ where: { shopId, requestKey: key }, include: { items: true } });
      if (replay) {
        if (replay.requestHash !== requestHash) throw error("This reversal retry key was already used for different details", 409);
        reused = true;
        return replay;
      }
      if (original.reversal) throw error("This supplier credit has already been reversed", 409);
      const created = await tx.supplierCredit.create({ data: { shopId, supplierId: original.supplierId, stockReceiptId: original.stockReceiptId, kind: original.kind, requestKey: key, requestHash, note: `Reversal of supplier credit ${original.id}`, recordedBy: req.user.staffId || req.user.userId, reversalOfId: original.id, items: { create: original.items.map((item) => ({ stockReceiptItemId: item.stockReceiptItemId, quantity: -item.quantity, amount: -item.amount })) } }, include: { items: true } });
      if (original.kind === "RETURN") {
        for (const line of created.items) {
          const originalLine = original.items.find((item) => item.stockReceiptItemId === line.stockReceiptItemId);
          await tx.product.update({ where: { id: originalLine.stockReceiptItem.product.id }, data: { currentStock: { increment: Math.abs(line.quantity) } } });
          await tx.stockMovement.create({ data: { type: "IN", quantity: Math.abs(line.quantity), note: `Reversal of supplier return ${original.id.slice(-6)}`, productId: originalLine.stockReceiptItem.product.id, supplierCreditLineId: line.id } });
        }
      }
      return created;
    }, { isolationLevel: "Serializable" });
  } catch (err) {
    if (err.code === "P2002") {
      const [replay, existingReversal] = await Promise.all([
        prisma.supplierCredit.findFirst({ where: { shopId, requestKey: key }, include: { items: true } }),
        prisma.supplierCredit.findFirst({ where: { shopId, reversalOfId: req.params.creditId }, select: { id: true } }),
      ]);
      if (replay?.reversalOfId === req.params.creditId) { reversal = replay; reused = true; }
      else if (replay) return res.status(409).json({ error: "This reversal retry key was already used for different details" });
      else if (existingReversal) return res.status(409).json({ error: "This supplier credit has already been reversed" });
      else throw err;
    } else if (err.code === "P2034") {
      const replay = await prisma.supplierCredit.findFirst({ where: { shopId, requestKey: key }, include: { items: true } });
      if (replay?.reversalOfId === req.params.creditId) { reversal = replay; reused = true; }
      else return res.status(409).json({ error: "Another supplier balance update happened at the same time. Refresh and try again." });
    }
    else if (err.status) return res.status(err.status).json({ error: err.message });
    else throw err;
  }
  if (!reused) {
    await invalidateDashboardHistory(shopId);
    req.audit = { action: "supplier_credit.reverse", resourceType: "supplier_credit", resourceId: reversal.id, metadata: { reversalOfId: reversal.reversalOfId, stockReceiptId: reversal.stockReceiptId } };
  }
  res.status(reused ? 200 : 201).json({ credit: reversal, reused });
});

module.exports = { list, receipts, recordPayment, recordRefund, recordCredit, updateReturnStatus, reversePayment, reverseCredit, correctReceiptPayment, balanceOf, returnCreditAmount };
