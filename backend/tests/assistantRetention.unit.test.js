const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const servicePath = path.resolve(__dirname, "../src/services/assistantAnalyticsRetention.service.js");

test("assistant history retention deletes event and action rows older than the 400-day policy", async () => {
  const originalPrisma = require.cache[prismaPath];
  const originalService = require.cache[servicePath];
  const deletes = [];
  const prisma = {
    $transaction: async (callback) => callback({
      assistantActionEvent: { deleteMany: async (query) => { deletes.push(["events", query]); return { count: 12 }; } },
      assistantAction: { deleteMany: async (query) => { deletes.push(["actions", query]); return { count: 4 }; } },
    }),
  };
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  delete require.cache[servicePath];
  try {
    const { pruneAssistantHistory, RETENTION_DAYS } = require(servicePath);
    const now = new Date("2026-10-28T09:00:00.000Z");
    const result = await pruneAssistantHistory(now);
    const expectedCutoff = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);
    assert.equal(RETENTION_DAYS, 400);
    assert.equal(result.cutoffAt, expectedCutoff.toISOString());
    assert.equal(result.deletedEvents, 12);
    assert.equal(result.deletedActions, 4);
    assert.deepEqual(deletes.map(([table]) => table), ["events", "actions"]);
    for (const [, query] of deletes) assert.equal(query.where.createdAt.lt.toISOString(), expectedCutoff.toISOString());
  } finally {
    if (originalPrisma) require.cache[prismaPath] = originalPrisma;
    else delete require.cache[prismaPath];
    if (originalService) require.cache[servicePath] = originalService;
    else delete require.cache[servicePath];
  }
});
