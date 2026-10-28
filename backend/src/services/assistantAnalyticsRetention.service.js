const prisma = require("../lib/prisma");

const RETENTION_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

async function pruneAssistantHistory(now = new Date()) {
  const cutoffAt = new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
  return prisma.$transaction(async (tx) => {
    const events = await tx.assistantActionEvent.deleteMany({ where: { createdAt: { lt: cutoffAt } } });
    const actions = await tx.assistantAction.deleteMany({ where: { createdAt: { lt: cutoffAt } } });
    return {
      retentionDays: RETENTION_DAYS,
      cutoffAt: cutoffAt.toISOString(),
      deletedEvents: events.count,
      deletedActions: actions.count,
    };
  });
}

module.exports = { pruneAssistantHistory, RETENTION_DAYS };
