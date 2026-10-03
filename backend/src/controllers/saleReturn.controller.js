const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { findOpenCashSession } = require("../lib/cashSession");
const { invalidateDashboardHistory } = require("../services/dashboard-cache.service");
const { restoreCropHarvestAllocationQuantity } = require("../lib/cropHarvestSales");

const REFUND_METHODS = new Set(["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK"]);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function normalizeRequest(body, saleId) {
  body = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const reason = String(body.reason || "").trim();
  const requestKey = String(body.requestKey || "").trim();
  if (Array.isArray(body.items) && body.items.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw Object.assign(new Error("Each returned line must be an object"), { status: 400 });
  }
  const items = Array.isArray(body.items) ? body.items.map((item) => ({
    saleItemId: String(item.saleItemId || "").trim(),
    quantity: Number(item.quantity),
    restockQuantity: Number(item.restockQuantity || 0),
    damagedQuantity: Number(item.damagedQuantity || 0),
  })).sort((a, b) => a.saleItemId.localeCompare(b.saleItemId)) : [];
  const refundMethod = String(body.refundMethod || "").trim().toUpperCase() || null;
  const paymentRef = String(body.paymentRef || "").trim() || null;
  if (!reason || reason.length > 500) throw Object.assign(new Error("Enter a return reason of 1 to 500 characters"), { status: 400 });
  if (!/^[a-f0-9-]{16,80}$/i.test(requestKey)) throw Object.assign(new Error("A valid return retry key is required"), { status: 400 });
  if (!items.length || items.length > 100 || items.some((item) => !item.saleItemId || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.restockQuantity) || item.restockQuantity < 0 || !Number.isSafeInteger(item.damagedQuantity) || item.damagedQuantity < 0 || ![0, item.quantity].includes(item.restockQuantity + item.damagedQuantity))) {
    throw Object.assign(new Error("Each returned line needs valid quantities for sellable and damaged units"), { status: 400 });
  }
  if (new Set(items.map((item) => item.saleItemId)).size !== items.length) throw Object.assign(new Error("A sale line can appear only once in a return"), { status: 400 });
  if (refundMethod && !REFUND_METHODS.has(refundMethod)) throw Object.assign(new Error("Choose a valid refund method"), { status: 400 });
  if (paymentRef && paymentRef.length > 120) throw Object.assign(new Error("Payment reference must be 120 characters or less"), { status: 400 });
  const canonical = JSON.stringify({ saleId, reason, items, refundMethod, paymentRef });
  return { reason, requestKey, items, refundMethod, paymentRef, requestHash: crypto.createHash("sha256").update(canonical).digest("hex") };
}

function returnedLineValue(item, returnedQuantity) {
  const total = BigInt(item.totalPrice);
  const soldQuantity = BigInt(item.quantity);
  const previous = total * BigInt(item.returnedQuantity) / soldQuantity;
  const next = total * BigInt(item.returnedQuantity + returnedQuantity) / soldQuantity;
  return Number(next - previous);
}

async function restoreLiveAnimalReturn(tx, { shopId, saleItemId, quantity, recordedBy, occurredAt }) {
  if (!quantity) return;
  const saleEvent = await tx.farmAnimalEvent.findFirst({
    where: { saleItemId, group: { shopId }, type: "SALE", voidedAt: null },
    select: { groupId: true, group: { select: { name: true, isActive: true } } },
  });
  if (!saleEvent) return;
  if (!saleEvent.group.isActive) throw Object.assign(new Error("The linked livestock group is inactive; reactivate it before restocking returned animals"), { status: 409 });
  const updated = await tx.farmGroup.updateMany({ where: { id: saleEvent.groupId, shopId, isActive: true }, data: { currentAnimals: { increment: quantity } } });
  if (updated.count !== 1) throw Object.assign(new Error("Could not update the linked livestock group"), { status: 409 });
  await tx.farmAnimalEvent.create({
    data: { groupId: saleEvent.groupId, type: "ADDITION", quantity, occurredAt, recordedBy, note: `Returned from sale item ${saleItemId}` },
  });
}

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const payload = normalizeRequest(req.body, req.params.id);
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
    if (typeof tx.$queryRawUnsafe === "function") {
      await tx.$queryRawUnsafe('SELECT "id" FROM "sales" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', req.params.id, shopId);
    }
    const replay = await tx.saleReturn.findFirst({
      where: { shopId, requestKey: payload.requestKey },
      include: { items: true },
    });
    if (replay) {
      if (replay.saleId !== req.params.id || replay.requestHash !== payload.requestHash) {
        throw Object.assign(new Error("This return retry key was already used for different details"), { status: 409 });
      }
      return { saleReturn: replay, reused: true };
    }

    const sale = await tx.sale.findFirst({
      where: { id: req.params.id, shopId },
      include: {
        debt: true,
        items: { include: { product: { select: { id: true, name: true, unit: true } }, farmAnimalEvent: { select: { id: true } } } },
      },
    });
    if (!sale) throw Object.assign(new Error("Sale not found"), { status: 404 });
    if (sale.status !== "COMPLETED") throw Object.assign(new Error("Only a completed sale can be returned"), { status: 409 });

    const saleItems = new Map(sale.items.map((item) => [item.id, item]));
    const returnLines = [];
    let totalAmount = 0;
    for (const requestItem of payload.items) {
      const item = saleItems.get(requestItem.saleItemId);
      if (!item) throw Object.assign(new Error("A selected item does not belong to this sale"), { status: 400 });
      if ((item.productId && requestItem.restockQuantity + requestItem.damagedQuantity !== requestItem.quantity)
        || (!item.productId && requestItem.restockQuantity + requestItem.damagedQuantity !== 0)) {
        throw Object.assign(new Error(item.productId ? "Split every returned product between sellable and damaged units" : "Service lines do not affect inventory"), { status: 400 });
      }
      if (requestItem.quantity > item.quantity - item.returnedQuantity) {
        throw Object.assign(new Error(`Return quantity exceeds the remaining quantity for ${item.product?.name || item.name || "this item"}`), { status: 409 });
      }
      const lineAmount = returnedLineValue(item, requestItem.quantity);
      if (!Number.isSafeInteger(lineAmount) || lineAmount > 2147483647) throw Object.assign(new Error("Return value is too large"), { status: 400 });
      totalAmount += lineAmount;
      returnLines.push({ ...requestItem, item, lineAmount });
    }
    if (!Number.isSafeInteger(totalAmount) || totalAmount < 0 || totalAmount > 2147483647) throw Object.assign(new Error("Return total is invalid or too large"), { status: 400 });

    const outstanding = sale.debt && ["OPEN", "PARTIAL"].includes(sale.debt.status)
      ? Math.max(0, sale.debt.amount - sale.debt.amountPaid)
      : 0;
    const debtReduction = sale.paymentMethod === "CREDIT" ? Math.min(totalAmount, outstanding) : 0;
    const refundAmount = totalAmount - debtReduction;
    if (refundAmount > 0 && !payload.refundMethod) throw Object.assign(new Error("Choose how the collected amount was refunded"), { status: 400 });
    if (refundAmount === 0 && payload.refundMethod) throw Object.assign(new Error("No refund method is needed because this return only reduces the unpaid debt"), { status: 400 });
    const cashSession = refundAmount > 0 && payload.refundMethod === "CASH" ? await findOpenCashSession(tx, shopId, req.user) : null;
    if (refundAmount > 0 && payload.refundMethod === "CASH" && !cashSession) {
      throw Object.assign(new Error("Open your cash shift before recording a cash refund so it appears in Daily Close"), { status: 409 });
    }

    if (debtReduction > 0) {
      const debt = sale.debt;
      const nextAmount = debt.amount - debtReduction;
      const nextStatus = debt.amountPaid >= nextAmount ? "PAID" : debt.amountPaid > 0 ? "PARTIAL" : "OPEN";
      const changed = await tx.debt.updateMany({
        where: { id: debt.id, shopId, amount: debt.amount, amountPaid: debt.amountPaid, status: debt.status },
        data: { amount: nextAmount, status: nextStatus, note: [debt.note, `Return against sale ${sale.receiptNumber || sale.id}`].filter(Boolean).join(" | ").slice(0, 1000) },
      });
      if (changed.count !== 1) throw Object.assign(new Error("The debt changed while this return was being recorded. Refresh and retry."), { status: 409 });
    }

    const saleReturn = await tx.saleReturn.create({
      data: {
        shopId, saleId: sale.id, reason: payload.reason, totalAmount, debtReduction, refundAmount,
        refundMethod: payload.refundMethod, paymentRef: payload.paymentRef,
        requestKey: payload.requestKey, requestHash: payload.requestHash,
        recordedBy: req.user.staffId || req.user.userId, cashSessionId: cashSession?.id || null,
        items: { create: returnLines.map((line) => ({
          saleItemId: line.item.id, quantity: line.quantity, restockQuantity: line.restockQuantity,
          damagedQuantity: line.damagedQuantity, unitPrice: line.item.unitPrice,
          buyingPrice: line.item.buyingPrice, totalAmount: line.lineAmount,
        })) },
      },
      include: { items: true },
    });
    const returnItemBySaleItem = new Map(saleReturn.items.map((item) => [item.saleItemId, item]));

    for (const line of returnLines) {
      const guarded = await tx.saleItem.updateMany({
        where: { id: line.item.id, saleId: sale.id, returnedQuantity: line.item.returnedQuantity, quantity: { gte: line.item.returnedQuantity + line.quantity } },
        data: { returnedQuantity: { increment: line.quantity } },
      });
      if (guarded.count !== 1) throw Object.assign(new Error("Sale quantities changed while this return was being recorded. Refresh and retry."), { status: 409 });
      if (!line.item.productId || line.restockQuantity === 0) continue;
      const updatedProduct = await tx.product.updateMany({ where: { id: line.item.productId, shopId }, data: { currentStock: { increment: line.restockQuantity } } });
      if (updatedProduct.count !== 1) throw Object.assign(new Error("Could not restore the returned product to stock"), { status: 409 });
      await tx.stockMovement.create({
        data: { type: "IN", quantity: line.restockQuantity, note: `Customer return for sale ${sale.receiptNumber || sale.id}: ${payload.reason}`, productId: line.item.productId, saleReturnItemId: returnItemBySaleItem.get(line.item.id)?.id },
      });
      await restoreCropHarvestAllocationQuantity(tx, line.item.id, line.restockQuantity);
      if (line.item.farmAnimalEvent) {
        await restoreLiveAnimalReturn(tx, {
          shopId, saleItemId: line.item.id, quantity: line.restockQuantity,
          recordedBy: req.user.staffId || req.user.userId, occurredAt: new Date(),
        });
      }
    }

      return { saleReturn, reused: false };
    });
  } catch (error) {
    if (error.code !== "P2002") throw error;
    const replay = await prisma.saleReturn.findFirst({ where: { shopId, requestKey: payload.requestKey }, include: { items: true } });
    if (!replay) throw error;
    if (replay.saleId !== req.params.id || replay.requestHash !== payload.requestHash) {
      throw Object.assign(new Error("This return retry key was already used for different details"), { status: 409 });
    }
    result = { saleReturn: replay, reused: true };
  }

  if (!result.reused) await invalidateDashboardHistory(shopId);
  req.audit = {
    action: "sale.return",
    resourceType: "sale",
    resourceId: req.params.id,
    metadata: { returnId: result.saleReturn.id, totalAmount: result.saleReturn.totalAmount, debtReduction: result.saleReturn.debtReduction, refundAmount: result.saleReturn.refundAmount, refundMethod: result.saleReturn.refundMethod, lineCount: result.saleReturn.items.length, reused: result.reused },
  };
  res.status(result.reused ? 200 : 201).json(result);
});

module.exports = { create };
