const prisma = require("../src/lib/prisma");
const { pruneAssistantHistory } = require("../src/services/assistantAnalyticsRetention.service");

pruneAssistantHistory()
  .then((result) => {
    console.info(JSON.stringify({ event: "assistant_history_retention_completed", ...result }));
  })
  .catch((error) => {
    console.error(JSON.stringify({ event: "assistant_history_retention_failed", errorName: error?.name || "Error" }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
