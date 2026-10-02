function weightedAverageCost({ currentQuantity, currentUnitCost, addedQuantity, addedTotalCost }) {
  const stock = Math.max(0, Number(currentQuantity) || 0);
  const added = Math.max(0, Number(addedQuantity) || 0);
  const existingCost = Math.max(0, Number(currentUnitCost) || 0);
  const batchCost = Math.max(0, Number(addedTotalCost) || 0);
  const totalQuantity = stock + added;
  if (!totalQuantity) return 0;
  return Math.round((stock * existingCost + batchCost) / totalQuantity);
}

module.exports = { weightedAverageCost };
