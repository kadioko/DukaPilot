const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { findOpenCashSession } = require("../lib/cashSession");
const { invalidateDashboardHistory } = require("../services/dashboard-cache.service");
const { applyCropHarvestReturn, reverseCropHarvestReturn } = require("../lib/cropHarvestSales");

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

function normalizeReversalRequest(body, saleId, returnId) {
  body = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const reason = String(body.reason || "").trim();
  const requestKey = String(body.requestKey || "").trim();
  const recoveryMethod = String(body.recoveryMethod || "").trim().toUpperCase() || null;
  const paymentRef = String(body.paymentRef || "").trim() || null;
  if (!reason || reason.length > 500) throw Object.assign(new Error("Enter a correction reason of 1 to 500 characters"), { status: 400 });
  if (!/^[a-f0-9-]{16,80}$/i.test(requestKey)) throw Object.assign(new Error("A valid correction retry key is required"), { status: 400 });
  if (recoveryMethod && !REFUND_METHODS.has(recoveryMethod)) throw Object.assign(new Error("Choose a valid recovery method"), { status: 400 });
  if (paymentRef && paymentRef.length > 120) throw Object.assign(new Error("Payment reference must be 120 characters or less"), { status: 400 });
  const canonical = JSON.stringify({ saleId, returnId, reason, recoveryMethod, paymentRef });
  return { reason, requestKey, recoveryMethod, paymentRef, requestHash: crypto.createHash("sha256").update(canonical).digest("hex") };
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
      const returnItemId = returnItemBySaleItem.get(line.item.id)?.id;
      if (line.item.productId && line.restockQuantity > 0) {
        const updatedProduct = await tx.product.updateMany({ where: { id: line.item.productId, shopId }, data: { currentStock: { increment: line.restockQuantity } } });
        if (updatedProduct.count !== 1) throw Object.assign(new Error("Could not restore the returned product to stock"), { status: 409 });
        await tx.stockMovement.create({
          data: { type: "IN", quantity: line.restockQuantity, note: `Customer return for sale ${sale.receiptNumber || sale.id}: ${payload.reason}`, productId: line.item.productId, saleReturnItemId: returnItemId },
        });
      }
      await applyCropHarvestReturn(tx, {
        saleItemId: line.item.id,
        saleReturnItemId: returnItemId,
        restockQuantity: line.restockQuantity,
        damagedQuantity: line.damagedQuantity,
      });
      if (line.item.farmAnimalEvent && line.restockQuantity > 0) {
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

const reverse = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const payload = normalizeReversalRequest(req.body, req.params.id, req.params.returnId);
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      if (typeof tx.$queryRawUnsafe === "function") {
        await tx.$queryRawUnsafe('SELECT "id" FROM "sales" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', req.params.id, shopId);
      }
      const replay = await tx.saleReturnReversal.findFirst({
        where: { shopId, requestKey: payload.requestKey },
        include: { items: true },
      });
      if (replay) {
        if (replay.saleReturnId !== req.params.returnId || replay.requestHash !== payload.requestHash) {
          throw Object.assign(new Error("This correction retry key was already used for different details"), { status: 409 });
        }
        return { reversal: replay, reused: true };
      }

      const original = await tx.saleReturn.findFirst({
        where: { id: req.params.returnId, saleId: req.params.id, shopId },
        include: {
          reversal: { select: { id: true } },
          items: {
            include: {
              saleItem: {
                select: {
                  id: true, saleId: true, productId: true, returnedQuantity: true,
                  farmAnimalEvent: { select: { groupId: true, group: { select: { isActive: true, shopId: true } } } },
                },
              },
            },
          },
          sale: { select: { id: true, status: true, receiptNumber: true, debt: true } },
        },
      });
      if (!original) throw Object.assign(new Error("Return not found"), { status: 404 });
      if (original.reversal) throw Object.assign(new Error("This return has already been reversed"), { status: 409 });
      if (original.sale.status !== "COMPLETED") throw Object.assign(new Error("A return can only be reversed while its sale is completed"), { status: 409 });
      if (original.refundAmount > 0 && !payload.recoveryMethod) {
        throw Object.assign(new Error("Record how the previously refunded money was actually recovered before reversing this return"), { status: 400 });
      }
      if (original.refundAmount === 0 && payload.recoveryMethod) {
        throw Object.assign(new Error("No money was refunded on this return, so no recovery method is needed"), { status: 400 });
      }
      const cashSession = original.refundAmount > 0 && payload.recoveryMethod === "CASH"
        ? await findOpenCashSession(tx, shopId, req.user)
        : null;
      if (original.refundAmount > 0 && payload.recoveryMethod === "CASH" && !cashSession) {
        throw Object.assign(new Error("Open your cash shift before recording a cash recovery so it appears in Daily Close"), { status: 409 });
      }

      if (original.debtReduction > 0) {
        const debt = original.sale.debt;
        if (!debt) throw Object.assign(new Error("The linked credit debt is missing; the return cannot be reversed safely"), { status: 409 });
        const nextAmount = debt.amount + original.debtReduction;
        if (!Number.isSafeInteger(nextAmount) || nextAmount > 2147483647) throw Object.assign(new Error("The restored debt exceeds the supported amount"), { status: 409 });
        const nextStatus = debt.amountPaid >= nextAmount ? "PAID" : debt.amountPaid > 0 ? "PARTIAL" : "OPEN";
        const changed = await tx.debt.updateMany({
          where: { id: debt.id, shopId, amount: debt.amount, amountPaid: debt.amountPaid, status: debt.status },
          data: { amount: nextAmount, status: nextStatus, note: [debt.note, `Return correction for sale ${original.sale.receiptNumber || original.saleId}`].filter(Boolean).join(" | ").slice(0, 1000) },
        });
        if (changed.count !== 1) throw Object.assign(new Error("The debt changed while this correction was being recorded. Refresh and retry."), { status: 409 });
      }

      const reversal = await tx.saleReturnReversal.create({
        data: {
          shopId,
          saleReturnId: original.id,
          reason: payload.reason,
          totalAmount: original.totalAmount,
          debtRestored: original.debtReduction,
          refundRecoveredAmount: original.refundAmount,
          recoveryMethod: payload.recoveryMethod,
          paymentRef: payload.paymentRef,
          requestKey: payload.requestKey,
          requestHash: payload.requestHash,
          recordedBy: req.user.staffId || req.user.userId,
          cashSessionId: cashSession?.id || null,
          items: {
            create: original.items.map((item) => ({
              saleReturnItemId: item.id,
              quantity: item.quantity,
              restockQuantity: item.restockQuantity,
              damagedQuantity: item.damagedQuantity,
              totalAmount: item.totalAmount,
            })),
          },
        },
        include: { items: true },
      });
      const reversalItemByReturnItem = new Map(reversal.items.map((item) => [item.saleReturnItemId, item]));

      for (const item of original.items) {
        const reversalItem = reversalItemByReturnItem.get(item.id);
        const changedSaleItem = await tx.saleItem.updateMany({
          where: { id: item.saleItem.id, saleId: original.saleId, returnedQuantity: { gte: item.quantity } },
          data: { returnedQuantity: { decrement: item.quantity } },
        });
        if (changedSaleItem.count !== 1) throw Object.assign(new Error("Returned quantities changed; refresh the sale before reversing this return"), { status: 409 });

        if (item.restockQuantity > 0) {
          const productId = item.saleItem.productId;
          if (!productId) throw Object.assign(new Error("The returned product is no longer available, so its stock cannot be safely removed"), { status: 409 });
          const changedProduct = await tx.product.updateMany({
            where: { id: productId, shopId, currentStock: { gte: item.restockQuantity } },
            data: { currentStock: { decrement: item.restockQuantity } },
          });
          if (changedProduct.count !== 1) throw Object.assign(new Error("There is not enough stock on hand to reverse this return. Reconcile the stock movement first."), { status: 409 });
          await tx.stockMovement.create({
            data: {
              type: "OUT", quantity: item.restockQuantity,
              note: `Reversal of customer return for sale ${original.sale.receiptNumber || original.saleId}: ${payload.reason}`,
              productId,
              saleReturnReversalItemId: reversalItem.id,
            },
          });
        }

        await reverseCropHarvestReturn(tx, { saleReturnItemId: item.id, saleReturnItemReversalId: reversalItem.id });

        if (item.restockQuantity > 0 && item.saleItem.farmAnimalEvent) {
          const animal = item.saleItem.farmAnimalEvent;
          if (animal.group.shopId !== shopId) throw Object.assign(new Error("The linked livestock group is outside this business"), { status: 404 });
          const changedGroup = await tx.farmGroup.updateMany({
            where: { id: animal.groupId, shopId, currentAnimals: { gte: item.restockQuantity } },
            data: { currentAnimals: { decrement: item.restockQuantity } },
          });
          if (changedGroup.count !== 1) throw Object.assign(new Error("The linked group no longer has the returned animals to reverse"), { status: 409 });
          await tx.farmAnimalEvent.create({
            data: {
              groupId: animal.groupId,
              type: "RETURN_REVERSAL",
              quantity: item.restockQuantity,
              recordedBy: req.user.staffId || req.user.userId,
              note: `Reversal of customer return item ${item.id}: ${payload.reason}`,
              saleReturnReversalItemId: reversalItem.id,
            },
          });
        }
      }
      return { reversal, reused: false };
    });
  } catch (error) {
    if (error.code !== "P2002") throw error;
    const replay = await prisma.saleReturnReversal.findFirst({
      where: { shopId, OR: [{ requestKey: payload.requestKey }, { saleReturnId: req.params.returnId }] },
      include: { items: true },
    });
    if (!replay) throw error;
    if (replay.saleReturnId !== req.params.returnId || replay.requestHash !== payload.requestHash) {
      throw Object.assign(new Error("This return has already been reversed or the correction retry key conflicts"), { status: 409 });
    }
    result = { reversal: replay, reused: true };
  }

  if (!result.reused) await invalidateDashboardHistory(shopId);
  req.audit = {
    action: "sale.return.reverse",
    resourceType: "sale",
    resourceId: req.params.id,
    metadata: {
      returnId: req.params.returnId,
      reversalId: result.reversal.id,
      amount: result.reversal.totalAmount,
      debtRestored: result.reversal.debtRestored,
      recoveredAmount: result.reversal.refundRecoveredAmount,
      recoveryMethod: result.reversal.recoveryMethod,
      itemCount: result.reversal.items.length,
      reused: result.reused,
    },
  };
  res.status(result.reused ? 200 : 201).json(result);
});

module.exports.reverse = reverse;
