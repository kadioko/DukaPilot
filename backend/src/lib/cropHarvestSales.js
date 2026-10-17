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

function proportionalTarget(total, quantity, denominator) {
  if (!denominator || quantity <= 0) return 0;
  return quantity >= denominator ? total : Math.floor(total * quantity / denominator);
}

async function applyCropHarvestReturn(tx, { saleItemId, saleReturnItemId, restockQuantity, damagedQuantity }) {
  if (!tx.cropHarvestBatch || !tx.cropHarvestAllocation || !(restockQuantity + damagedQuantity)) return [];
  let restockLeft = restockQuantity;
  let damagedLeft = damagedQuantity;
  const applied = [];
  const allocations = await tx.cropHarvestAllocation.findMany({
    where: { saleItemId, quantity: { gt: 0 } },
    include: { returnAllocations: { include: { reversal: { select: { id: true } } } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  for (const allocation of allocations) {
    if (restockLeft + damagedLeft <= 0) break;
    const activeReturns = (allocation.returnAllocations || []).filter((entry) => !entry.reversal);
    const previousQuantity = activeReturns.reduce((sum, entry) => sum + entry.quantity, 0);
    const previousRestockQuantity = activeReturns.reduce((sum, entry) => sum + entry.restockQuantity, 0);
    const previousRevenue = activeReturns.reduce((sum, entry) => sum + entry.revenue, 0);
    const previousCostRestored = activeReturns.reduce((sum, entry) => sum + entry.costRestored, 0);
    let available = Math.max(0, allocation.quantity - previousQuantity);
    if (!available) continue;

    const allocatedRestock = Math.min(restockLeft, available);
    available -= allocatedRestock;
    const allocatedDamaged = Math.min(damagedLeft, available);
    const quantity = allocatedRestock + allocatedDamaged;
    if (!quantity) continue;

    const nextReturnedQuantity = previousQuantity + quantity;
    const revenue = Math.max(0,
      proportionalTarget(allocation.revenue, nextReturnedQuantity, allocation.quantity) - previousRevenue,
    );
    const nextRestockQuantity = previousRestockQuantity + allocatedRestock;
    const costRestored = Math.max(0,
      proportionalTarget(allocation.cost, nextRestockQuantity, allocation.quantity) - previousCostRestored,
    );
    const batchUpdate = await tx.cropHarvestBatch.updateMany({
      where: { id: allocation.harvestBatchId, soldQuantity: { gte: quantity }, realizedRevenue: { gte: revenue }, realizedCost: { gte: costRestored } },
      data: {
        remainingQuantity: { increment: allocatedRestock },
        remainingCost: { increment: costRestored },
        soldQuantity: { decrement: quantity },
        realizedRevenue: { decrement: revenue },
        realizedCost: { decrement: costRestored },
      },
    });
    if (batchUpdate.count !== 1) throw Object.assign(new Error("Crop harvest changed during return; refresh and try again"), { status: 409 });
    const ledger = await tx.cropHarvestReturnAllocation.create({
      data: {
        saleReturnItemId,
        cropHarvestAllocationId: allocation.id,
        quantity,
        restockQuantity: allocatedRestock,
        damagedQuantity: allocatedDamaged,
        revenue,
        costRestored,
      },
    });
    applied.push({ ...ledger, harvestBatchId: allocation.harvestBatchId });
    restockLeft -= allocatedRestock;
    damagedLeft -= allocatedDamaged;
  }
  return applied;
}

async function reverseCropHarvestReturn(tx, { saleReturnItemId, saleReturnItemReversalId }) {
  if (!tx.cropHarvestReturnAllocation || !tx.cropHarvestReturnAllocationReversal) return [];
  const allocations = await tx.cropHarvestReturnAllocation.findMany({
    where: { saleReturnItemId, reversal: null },
    include: { cropHarvestAllocation: { select: { harvestBatchId: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  for (const allocation of allocations) {
    const changed = await tx.cropHarvestBatch.updateMany({
      where: {
        id: allocation.cropHarvestAllocation.harvestBatchId,
        remainingQuantity: { gte: allocation.restockQuantity },
        remainingCost: { gte: allocation.costRestored },
      },
      data: {
        remainingQuantity: { decrement: allocation.restockQuantity },
        remainingCost: { decrement: allocation.costRestored },
        soldQuantity: { increment: allocation.quantity },
        realizedRevenue: { increment: allocation.revenue },
        realizedCost: { increment: allocation.costRestored },
      },
    });
    if (changed.count !== 1) throw Object.assign(new Error("The linked crop harvest no longer has enough returned stock to reverse this return"), { status: 409 });
    await tx.cropHarvestReturnAllocationReversal.create({
      data: { saleReturnItemReversalId, cropHarvestReturnAllocationId: allocation.id },
    });
  }
  return allocations;
}

module.exports = {
  allocateCropHarvestForSale,
  reverseCropHarvestSaleAllocations,
  applyCropHarvestReturn,
  reverseCropHarvestReturn,
};
