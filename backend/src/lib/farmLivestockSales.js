async function recordLiveAnimalSale(tx, { shopId, saleItems, quantityByProduct, receiptNumber, recordedBy, occurredAt }) {
  const productLines = new Map();
  for (const saleItem of Array.isArray(saleItems) ? saleItems : []) {
    if (!saleItem.productId) continue;
    const quantity = Number(saleItem.quantity ?? quantityByProduct?.[saleItem.productId]);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const lines = productLines.get(saleItem.productId) || [];
    lines.push({ saleItem, quantity });
    productLines.set(saleItem.productId, lines);
  }

  for (const [productId, lines] of productLines) {
    const group = await tx.farmGroup.findFirst({
      where: { shopId, liveProductId: productId },
      select: { id: true, name: true, isActive: true },
    });
    if (!group) continue;
    const quantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    if (!Number.isInteger(quantity) || lines.some((line) => !Number.isInteger(line.quantity))) {
      throw Object.assign(new Error(`Live animals from ${group.name} must be sold in whole numbers`), { status: 400 });
    }
    if (!group.isActive) throw Object.assign(new Error(`The animal group linked to ${productId} is inactive`), { status: 409 });

    const updated = await tx.farmGroup.updateMany({
      where: { id: group.id, shopId, isActive: true, currentAnimals: { gte: quantity } },
      data: { currentAnimals: { decrement: quantity } },
    });
    if (updated.count !== 1) {
      throw Object.assign(new Error(`Not enough animals remain in ${group.name} to complete this sale`), { status: 409 });
    }
    for (const line of lines) {
      await tx.farmAnimalEvent.create({
        data: {
          groupId: group.id,
          type: "SALE",
          quantity: line.quantity,
          occurredAt,
          note: `POS sale receipt #${String(receiptNumber).padStart(6, "0")}`,
          recordedBy,
          saleItemId: line.saleItem.id,
        },
      });
    }
  }
}

async function reverseLiveAnimalSales(tx, { shopId, saleItemIds, voidedAt }) {
  if (!saleItemIds.length) return;
  const events = await tx.farmAnimalEvent.findMany({
    where: { saleItemId: { in: saleItemIds }, group: { shopId }, voidedAt: null },
    select: { id: true, groupId: true, quantity: true },
  });
  for (const event of events) {
    const marked = await tx.farmAnimalEvent.updateMany({ where: { id: event.id, voidedAt: null }, data: { voidedAt } });
    if (marked.count !== 1) throw Object.assign(new Error("Livestock sale event changed before the sale was voided"), { status: 409 });
    const restored = await tx.farmGroup.updateMany({ where: { id: event.groupId, shopId }, data: { currentAnimals: { increment: event.quantity } } });
    if (restored.count !== 1) throw Object.assign(new Error("The livestock group for this sale is no longer available"), { status: 409 });
  }
}

module.exports = { recordLiveAnimalSale, reverseLiveAnimalSales };
