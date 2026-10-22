const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { invalidateDashboardHistory } = require("../services/dashboard-cache.service");
const { distributeLandedCost } = require("./stockReceipt.controller");

function fail(message, status = 409) {
  return Object.assign(new Error(message), { status });
}

function snapshot(receipt) {
  return {
    invoiceNumber: receipt.invoiceNumber,
    note: receipt.note,
    totalProductCost: receipt.totalProductCost,
    totalLandedCost: receipt.totalLandedCost,
    transportCost: receipt.transportCost,
    otherCost: receipt.otherCost,
    voidedAt: receipt.voidedAt,
    items: receipt.items.map((item) => ({
      id: item.id, productId: item.productId, quantity: item.quantity,
      unitCost: item.unitCost, productCost: item.productCost,
      allocatedAdditionalCost: item.allocatedAdditionalCost,
      landedTotalCost: item.landedTotalCost, landedUnitCost: item.landedUnitCost,
    })),
  };
}

function effectivePaid(receipt) {
  const superseded = new Set(receipt.paymentCorrections.map((item) => item.previousCorrectionId).filter(Boolean));
  const latest = receipt.paymentCorrections.find((item) => !superseded.has(item.id));
  return latest?.correctedAmount ?? receipt.paidAtReceipt;
}

async function correct(req, res, next) {
  try {
    const shopId = await getShopIdForUser(req.user);
    const receiptId = String(req.params.id || "");
    const requestKey = String(req.body.requestKey || "").trim();
    const reason = String(req.body.reason || "").trim();
    const rawItems = req.body.items;
    const invoiceNumber = req.body.invoiceNumber === undefined ? undefined : String(req.body.invoiceNumber || "").trim().slice(0, 120) || null;
    const note = req.body.note === undefined ? undefined : String(req.body.note || "").trim().slice(0, 500) || null;
    if (!/^[a-f0-9-]{16,80}$/i.test(requestKey) || !reason || reason.length > 500 || !Array.isArray(rawItems) || !rawItems.length || rawItems.length > 200) {
      return res.status(400).json({ error: "A retry key, reason (up to 500 characters), and all receipt items are required" });
    }
    const items = rawItems.map((item) => ({ id: String(item?.id || ""), quantity: Number(item?.quantity) }));
    if (items.some((item) => !item.id || !Number.isSafeInteger(item.quantity) || item.quantity < 0 || item.quantity > 1_000_000) || new Set(items.map((item) => item.id)).size !== items.length) {
      return res.status(400).json({ error: "Each receipt item needs a unique ID and a non-negative whole quantity" });
    }
    items.sort((a, b) => a.id.localeCompare(b.id));
    const requestHash = crypto.createHash("sha256").update(JSON.stringify({ receiptId, reason, items, invoiceNumber, note })).digest("hex");
    const findReplay = () => prisma.stockReceiptCorrection.findFirst({ where: { shopId, requestKey } });
    let correction = await findReplay();
    let reused = Boolean(correction);
    if (correction && correction.requestHash !== requestHash) return res.status(409).json({ error: "This retry key was used for different correction details" });
    if (!correction) {
      try {
        correction = await prisma.$transaction(async (tx) => {
          const existing = await tx.stockReceiptCorrection.findFirst({ where: { shopId, requestKey } });
          if (existing) {
            if (existing.requestHash !== requestHash) throw fail("This retry key was used for different correction details");
            reused = true;
            return existing;
          }
          // Order operations and receipt corrections take locks in the same order.
          const source = await tx.stockReceipt.findFirst({ where: { id: receiptId, shopId }, select: { sourceOrderId: true } });
          if (!source) throw fail("Stock receipt not found", 404);
          if (source.sourceOrderId) await tx.$queryRawUnsafe('SELECT "id" FROM "orders" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', source.sourceOrderId, shopId);
          await tx.$queryRawUnsafe('SELECT "id" FROM "stock_receipts" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', receiptId, shopId);
          const receipt = await tx.stockReceipt.findFirst({ where: { id: receiptId, shopId }, include: {
            items: true,
            paymentCorrections: true,
            paymentAllocations: { select: { amount: true } },
            credits: { include: { items: { select: { stockReceiptItemId: true, quantity: true, amount: true } } } },
          } });
          if (!receipt) throw fail("Stock receipt not found", 404);
          if (receipt.voidedAt) throw fail("A reversed receipt cannot be corrected. Record a new receipt instead.");
          const quantities = new Map(items.map((item) => [item.id, item.quantity]));
          if (quantities.size !== receipt.items.length || receipt.items.some((item) => !quantities.has(item.id))) throw fail("Send every original receipt item once. Refresh the receipt and try again.", 400);
          const quantityChanged = receipt.items.some((item) => quantities.get(item.id) !== item.quantity);
          const linkedOrder = receipt.sourceOrderId ? await tx.order.findFirst({ where: { id: receipt.sourceOrderId, shopId }, select: { status: true } }) : null;
          if (receipt.sourceOrderId && !linkedOrder) throw fail("Linked supplier order not found.");
          if (linkedOrder?.status === "CANCELLED" && receipt.items.some((item) => quantities.get(item.id) > item.quantity)) throw fail("A cancelled order cannot receive additional stock. Create a new receipt without this order.");
          if (quantityChanged && receipt.estimatedAllocation) throw fail("Estimated-cost receipts need a reviewed quantity correction because costs were allocated from one total. Contact support.");
          if (quantityChanged && (receipt.transportCost || receipt.otherCost)) throw fail("Receipts with allocated transport or other costs need a reviewed quantity correction. Contact support.");
          if (quantityChanged && receipt.credits.length) throw fail("This receipt already has supplier returns or credits. Correct those first with support before changing quantities.");
          const allZero = items.every((item) => item.quantity === 0);
          const adjusted = !quantityChanged ? receipt.items : allZero ? receipt.items.map((item) => ({ ...item, quantity: 0, productCost: 0, allocatedAdditionalCost: 0, landedTotalCost: 0, landedUnitCost: 0 })) : distributeLandedCost(
            receipt.items.filter((item) => quantities.get(item.id) > 0).map((item) => ({ ...item, quantity: quantities.get(item.id) })),
            receipt.transportCost, receipt.otherCost,
          );
          const byId = new Map(adjusted.map((item) => [item.id, item]));
          const nextItems = receipt.items.map((item) => byId.get(item.id) || { ...item, quantity: 0, productCost: 0, allocatedAdditionalCost: 0, landedTotalCost: 0, landedUnitCost: 0 });
          const nextProductCost = nextItems.reduce((sum, item) => sum + item.productCost, 0);
          const nextTotal = nextProductCost + receipt.transportCost + receipt.otherCost;
          if (![nextProductCost, nextTotal, ...nextItems.flatMap((item) => [item.productCost, item.landedTotalCost, item.landedUnitCost])].every((value) => Number.isSafeInteger(value) && value <= 2_147_483_647)) throw fail("Corrected cost exceeds the supported whole-TZS range.", 400);
          const alreadySettled = effectivePaid(receipt)
            + receipt.paymentAllocations.reduce((sum, item) => sum + item.amount, 0)
            + receipt.credits.flatMap((credit) => credit.items).reduce((sum, item) => sum + item.amount, 0);
          if (nextTotal < alreadySettled) throw fail("Correct receipt payments or supplier credits first; the new receipt total cannot be less than the amount already settled.");
          for (const item of receipt.items) {
            const returned = receipt.credits.flatMap((credit) => credit.items).filter((line) => line.stockReceiptItemId === item.id).reduce((sum, line) => sum + line.quantity, 0);
            if (quantities.get(item.id) < returned) throw fail("Correct the supplier return first; received quantity cannot be less than quantity already returned.");
          }
          const changed = quantityChanged
            || (invoiceNumber !== undefined && invoiceNumber !== receipt.invoiceNumber)
            || (note !== undefined && note !== receipt.note);
          if (!changed) throw fail("There is no change to record.", 400);
          const before = snapshot(receipt);
          const after = { ...before, invoiceNumber: invoiceNumber === undefined ? receipt.invoiceNumber : invoiceNumber,
            note: note === undefined ? receipt.note : note, totalProductCost: nextProductCost, totalLandedCost: nextTotal,
            voidedAt: allZero ? new Date().toISOString() : null,
            items: nextItems.map((item) => ({ id: item.id, productId: item.productId, quantity: item.quantity, unitCost: item.unitCost,
              productCost: item.productCost, allocatedAdditionalCost: item.allocatedAdditionalCost, landedTotalCost: item.landedTotalCost, landedUnitCost: item.landedUnitCost })),
          };
          const created = await tx.stockReceiptCorrection.create({ data: {
            shopId, stockReceiptId: receipt.id, requestKey, requestHash, reason,
            before, after, recordedBy: req.user.staffId || req.user.userId,
          } });
          for (const item of receipt.items.sort((a, b) => a.productId.localeCompare(b.productId))) {
            const nextItem = nextItems.find((candidate) => candidate.id === item.id);
            const delta = nextItem.quantity - item.quantity;
            if (delta) {
              const product = await tx.product.findFirst({ where: { id: item.productId, shopId }, select: { id: true, currentStock: true } });
              if (!product) throw fail("Receipt product not found", 404);
              const nextStock = product.currentStock + delta;
              if (nextStock < 0) throw fail("Cannot remove received stock already sold or used. Count the remaining stock and record a separate adjustment.");
              const updated = await tx.product.updateMany({ where: { id: product.id, shopId, currentStock: product.currentStock }, data: { currentStock: nextStock } });
              if (updated.count !== 1) throw fail("Stock changed on another device. Refresh and try again.");
              await tx.stockMovement.create({ data: { productId: product.id, type: delta > 0 ? "IN" : "OUT", quantity: Math.abs(delta),
                note: `Receipt correction #${created.id.slice(-6)}: ${reason}`, stockBefore: product.currentStock, stockAfter: nextStock,
                stockReceiptId: receipt.id, receiptCorrectionId: created.id } });
              if (receipt.sourceOrderId) {
                const orderItem = await tx.orderItem.findFirst({ where: { orderId: receipt.sourceOrderId, productId: item.productId } });
                if (!orderItem || orderItem.receivedQuantity + delta < 0 || orderItem.receivedQuantity + delta > orderItem.quantity) throw fail("Corrected quantity conflicts with the linked order.");
                await tx.orderItem.update({ where: { id: orderItem.id }, data: { receivedQuantity: { increment: delta } } });
              }
            }
            await tx.stockReceiptItem.update({ where: { id: item.id }, data: {
              quantity: nextItem.quantity, productCost: nextItem.productCost, allocatedAdditionalCost: nextItem.allocatedAdditionalCost,
              landedTotalCost: nextItem.landedTotalCost, landedUnitCost: nextItem.landedUnitCost,
            } });
          }
          if (receipt.sourceOrderId) {
            if (linkedOrder.status !== "CANCELLED") {
              const orderItems = await tx.orderItem.findMany({ where: { orderId: receipt.sourceOrderId }, select: { quantity: true, receivedQuantity: true } });
              const status = orderItems.every((item) => item.receivedQuantity >= item.quantity) ? "DELIVERED" : orderItems.some((item) => item.receivedQuantity > 0) ? "PARTIALLY_RECEIVED" : "PENDING";
              await tx.order.update({ where: { id: receipt.sourceOrderId }, data: { status } });
            }
          }
          await tx.stockReceipt.update({ where: { id: receipt.id }, data: {
            totalProductCost: nextProductCost, totalLandedCost: nextTotal,
            invoiceNumber: after.invoiceNumber, note: after.note,
            voidedAt: allZero ? new Date(after.voidedAt) : null,
          } });
          return created;
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        const saved = await findReplay();
        if (saved?.requestHash === requestHash) { correction = saved; reused = true; }
        else if (error.code === "P2002" || error.code === "P2034") return res.status(409).json({ error: "Receipt changed during correction. Refresh and try again." });
        else if (error.status) return res.status(error.status).json({ error: error.message });
        else throw error;
      }
    }
    if (!reused) {
      await invalidateDashboardHistory(shopId);
      req.audit = { action: "stock_receipt.correct", resourceType: "stock_receipt_correction", resourceId: correction.id,
        metadata: { stockReceiptId: receiptId, reason, beforeTotal: correction.before.totalLandedCost, afterTotal: correction.after.totalLandedCost } };
    }
    return res.status(reused ? 200 : 201).json({ correction: { id: correction.id, stockReceiptId: correction.stockReceiptId, reason: correction.reason,
      before: correction.before, after: correction.after, createdAt: correction.createdAt }, reused });
  } catch (error) { return next(error); }
}

module.exports = { correct };
