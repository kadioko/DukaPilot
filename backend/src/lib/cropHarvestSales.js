// Harvest lots are allocated FIFO after a normal POS sale reserves product
// stock. Unallocated stock remains valid for non-farm inventory; only stock
// created by a recorded harvest appears in crop profit reporting.
async function allocateCropHarvestForSale(tx, shopId, saleItems) {
  if (!tx.cropHarvestBatch || !tx.cropHarvestAllocation) return;

  for (const saleItem of saleItems) {
    if (!saleItem.productId) continue;
    let quantityLeft = saleItem.quantity;
    let attempts = 0;

    while (quantityLeft > 0 && attempts < 8) {
      attempts += 1;
      const batches = await tx.cropHarvestBatch.findMany({
        where: { shopId, outputProductId: saleItem.productId, remainingQuantity: { gt: 0 } },
        orderBy: [{ harvestAt: "asc" }, { id: "asc" }],
        take: 20,
      });
      if (!batches.length) break;

      let allocatedThisPass = false;
      for (const batch of batches) {
        if (quantityLeft <= 0) break;
        const quantity = Math.min(quantityLeft, batch.remainingQuantity);
        const cost = quantity === batch.remainingQuantity
          ? batch.remainingCost
          : Math.min(batch.remainingCost, batch.unitCost * quantity);
        const revenue = saleItem.unitPrice * quantity;
        const updated = await tx.cropHarvestBatch.updateMany({
          where: { id: batch.id, remainingQuantity: { gte: quantity }, remainingCost: { gte: cost } },
          data: {
            remainingQuantity: { decrement: quantity },
            remainingCost: { decrement: cost },
            soldQuantity: { increment: quantity },
            realizedRevenue: { increment: revenue },
            realizedCost: { increment: cost },
          },
        });
        if (updated.count !== 1) continue;
        await tx.cropHarvestAllocation.create({ data: { harvestBatchId: batch.id, saleItemId: saleItem.id, quantity, revenue, cost } });
        quantityLeft -= quantity;
        allocatedThisPass = true;
      }
      if (!allocatedThisPass) break;
    }
  }
}

async function reverseCropHarvestSaleAllocations(tx, saleItemIds) {
  if (!tx.cropHarvestBatch || !tx.cropHarvestAllocation || !saleItemIds.length) return;
  const allocations = await tx.cropHarvestAllocation.findMany({ where: { saleItemId: { in: saleItemIds } } });
  for (const allocation of allocations) {
    await tx.cropHarvestBatch.update({
      where: { id: allocation.harvestBatchId },
      data: {
        remainingQuantity: { increment: allocation.quantity },
        remainingCost: { increment: allocation.cost },
        soldQuantity: { decrement: allocation.quantity },
        realizedRevenue: { decrement: allocation.revenue },
        realizedCost: { decrement: allocation.cost },
      },
    });
  }
  await tx.cropHarvestAllocation.deleteMany({ where: { saleItemId: { in: saleItemIds } } });
}

module.exports = { allocateCropHarvestForSale, reverseCropHarvestSaleAllocations };
