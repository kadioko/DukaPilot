const test = require("node:test");
const assert = require("node:assert/strict");
const { allocateInputCostsToHarvest, reconcileCropCycleCosts, distributeWholeAmount } = require("../src/services/cropCosting.service");

test("whole-number allocation keeps every TZS assigned without fractions", () => {
  const allocations = distributeWholeAmount(10, [{ id: "a", weight: 1 }, { id: "b", weight: 2 }, { id: "c", weight: 3 }], (row) => row.weight);
  assert.equal(allocations.reduce((sum, row) => sum + row.amount, 0), 10);
  assert.deepEqual(allocations.map((row) => row.amount), [2, 3, 5]);
});

test("multi-pick harvest allocation is proportional to the planned total yield", async () => {
  const allocations = [];
  const batchUpdates = [];
  const tx = {
    cropInputUsage: { findMany: async () => [{ id: "input-1", totalCost: 10000, costAllocations: [] }] },
    cropInputCostAllocation: { create: async ({ data }) => { allocations.push(data); return data; } },
    cropHarvestBatch: { update: async ({ data }) => { batchUpdates.push(data); return data; } },
  };
  const first = await allocateInputCostsToHarvest(tx, { cropCycleId: "cycle-1", harvestBatchId: "batch-1", plannedYield: 100, cumulativeHarvestYield: 30, actualYield: 30 });
  tx.cropInputUsage.findMany = async () => [{ id: "input-1", totalCost: 10000, costAllocations: [{ amount: 3000 }] }];
  const second = await allocateInputCostsToHarvest(tx, { cropCycleId: "cycle-1", harvestBatchId: "batch-2", plannedYield: 100, cumulativeHarvestYield: 50, actualYield: 20 });

  assert.equal(first.allocatedCost, 3000);
  assert.equal(second.allocatedCost, 2000);
  assert.deepEqual(allocations.map((row) => row.amount), [3000, 2000]);
  assert.deepEqual(batchUpdates.map((row) => row.remainingCost), [3000, 2000]);
});

test("closing a crop cycle assigns late costs only to unsold harvest stock and records unrecovered cost when none remains", async () => {
  const allocations = [];
  const updates = [];
  let inputs = [{ id: "input-1", totalCost: 9000, costAllocations: [{ amount: 3000 }] }];
  let batches = [{ id: "batch-1", actualYield: 30, remainingQuantity: 10, totalCost: 3000 }];
  const tx = {
    cropInputUsage: { findMany: async () => inputs },
    cropInputCostAllocation: { create: async ({ data }) => { allocations.push(data); return data; } },
    cropHarvestBatch: {
      findMany: async () => batches,
      update: async ({ data }) => { updates.push(data); return data; },
    },
    cropCycle: { update: async ({ data }) => { updates.push({ cycle: data }); return data; } },
  };
  const reconciled = await reconcileCropCycleCosts(tx, "cycle-1");
  assert.equal(reconciled.allocatedCost, 6000);
  assert.equal(reconciled.unrecoveredCost, 0);
  assert.equal(allocations[0].reason, "CLOSE_RECONCILIATION");
  assert.equal(allocations[0].amount, 6000);
  assert.equal(updates[0].remainingCost.increment, 6000);

  inputs = [{ id: "input-2", totalCost: 4000, costAllocations: [] }];
  batches = [];
  const unrecovered = await reconcileCropCycleCosts(tx, "cycle-1");
  assert.equal(unrecovered.unrecoveredCost, 4000);
});
