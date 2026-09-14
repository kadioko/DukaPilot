function allocationTotal(input) {
  return (input.costAllocations || []).reduce((sum, allocation) => sum + allocation.amount, 0);
}

function distributeWholeAmount(amount, entries, weightOf) {
  const total = Math.max(0, Number(amount) || 0);
  const weighted = entries
    .map((entry) => ({ entry, weight: Math.max(0, Number(weightOf(entry)) || 0) }))
    .filter((item) => item.weight > 0);
  const weightTotal = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!total || !weightTotal) return [];

  let assigned = 0;
  const rows = weighted.map((item) => {
    const value = Math.floor((total * item.weight) / weightTotal);
    assigned += value;
    return { entry: item.entry, amount: value };
  });
  let remainder = total - assigned;
  for (const row of rows) {
    if (!remainder) break;
    row.amount += 1;
    remainder -= 1;
  }
  return rows.filter((row) => row.amount > 0);
}

function unitCost(totalCost, quantity) {
  return quantity > 0 ? Math.round(totalCost / quantity) : 0;
}

async function cycleInputsWithAllocations(tx, cropCycleId) {
  return tx.cropInputUsage.findMany({
    where: { cropCycleId },
    include: { costAllocations: { select: { amount: true } } },
    orderBy: [{ usedAt: "asc" }, { id: "asc" }],
  });
}

async function allocateInputCostsToHarvest(tx, { cropCycleId, harvestBatchId, plannedYield, cumulativeHarvestYield, actualYield }) {
  const inputs = await cycleInputsWithAllocations(tx, cropCycleId);
  const totalInputCost = inputs.reduce((sum, input) => sum + input.totalCost, 0);
  const totalAlreadyAllocated = inputs.reduce((sum, input) => sum + allocationTotal(input), 0);
  const denominator = Math.max(1, plannedYield);
  const targetAllocated = Math.floor((totalInputCost * Math.min(cumulativeHarvestYield, denominator)) / denominator);
  const amountToAllocate = Math.max(0, Math.min(totalInputCost - totalAlreadyAllocated, targetAllocated - totalAlreadyAllocated));
  const remainingInputs = inputs
    .map((input) => ({ ...input, remainingCost: Math.max(0, input.totalCost - allocationTotal(input)) }))
    .filter((input) => input.remainingCost > 0);
  const allocations = distributeWholeAmount(amountToAllocate, remainingInputs, (input) => input.remainingCost);

  for (const allocation of allocations) {
    await tx.cropInputCostAllocation.create({
      data: {
        cropInputUsageId: allocation.entry.id,
        harvestBatchId,
        amount: allocation.amount,
        reason: "HARVEST",
      },
    });
  }

  const allocatedCost = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  await tx.cropHarvestBatch.update({
    where: { id: harvestBatchId },
    data: { totalCost: allocatedCost, remainingCost: allocatedCost, unitCost: unitCost(allocatedCost, actualYield) },
  });
  return { allocatedCost, totalInputCost, totalAlreadyAllocated: totalAlreadyAllocated + allocatedCost };
}

async function reconcileCropCycleCosts(tx, cropCycleId) {
  const [inputs, batches] = await Promise.all([
    cycleInputsWithAllocations(tx, cropCycleId),
    tx.cropHarvestBatch.findMany({
      where: { cropCycleId, remainingQuantity: { gt: 0 } },
      select: { id: true, actualYield: true, remainingQuantity: true, totalCost: true },
      orderBy: [{ harvestAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const totalInputCost = inputs.reduce((sum, input) => sum + input.totalCost, 0);
  const totalAllocated = inputs.reduce((sum, input) => sum + allocationTotal(input), 0);
  const unallocatedCost = Math.max(0, totalInputCost - totalAllocated);

  if (!unallocatedCost || !batches.length) {
    await tx.cropCycle.update({
      where: { id: cropCycleId },
      data: { unrecoveredCost: batches.length ? 0 : unallocatedCost, costReconciledAt: new Date() },
    });
    return { allocatedCost: 0, unrecoveredCost: batches.length ? 0 : unallocatedCost };
  }

  const batchCostAdds = new Map();
  const remainingInputs = inputs
    .map((input) => ({ ...input, remainingCost: Math.max(0, input.totalCost - allocationTotal(input)) }))
    .filter((input) => input.remainingCost > 0);
  for (const input of remainingInputs) {
    const allocations = distributeWholeAmount(input.remainingCost, batches, (batch) => batch.remainingQuantity);
    for (const allocation of allocations) {
      await tx.cropInputCostAllocation.create({
        data: {
          cropInputUsageId: input.id,
          harvestBatchId: allocation.entry.id,
          amount: allocation.amount,
          reason: "CLOSE_RECONCILIATION",
        },
      });
      batchCostAdds.set(allocation.entry.id, (batchCostAdds.get(allocation.entry.id) || 0) + allocation.amount);
    }
  }

  for (const batch of batches) {
    const addedCost = batchCostAdds.get(batch.id) || 0;
    if (!addedCost) continue;
    const nextTotalCost = batch.totalCost + addedCost;
    await tx.cropHarvestBatch.update({
      where: { id: batch.id },
      data: {
        totalCost: nextTotalCost,
        remainingCost: { increment: addedCost },
        unitCost: unitCost(nextTotalCost, batch.actualYield),
      },
    });
  }
  await tx.cropCycle.update({ where: { id: cropCycleId }, data: { unrecoveredCost: 0, costReconciledAt: new Date() } });
  return { allocatedCost: unallocatedCost, unrecoveredCost: 0 };
}

module.exports = { allocateInputCostsToHarvest, reconcileCropCycleCosts, distributeWholeAmount, unitCost };
