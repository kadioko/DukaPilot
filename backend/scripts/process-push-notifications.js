require("dotenv").config();
const { queueShopAlerts, processPushDeliveries } = require("../src/services/push.service");
const prisma = require("../src/lib/prisma");

(async () => {
  const queued = await queueShopAlerts();
  const delivery = await processPushDeliveries();
  console.log(JSON.stringify({ queued, ...delivery }));
})()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
