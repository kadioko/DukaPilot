require("dotenv").config();
const { queueShopAlerts, processPushDeliveries } = require("../src/services/push.service");
const prisma = require("../src/lib/prisma");

(async () => {
  let cursor = null;
  let scanned = 0;
  let queued = 0;
  // The script is run by cron, not a merchant request. Paging keeps its
  // memory predictable while still visiting every shop in one run.
  do {
    const batch = await queueShopAlerts({ afterId: cursor });
    queued += batch.queued;
    scanned += batch.scanned;
    cursor = batch.nextCursor;
  } while (cursor);

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let delivery;
  do {
    delivery = await processPushDeliveries(200);
    processed += delivery.processed;
    sent += delivery.sent;
    failed += delivery.failed;
  } while (delivery.configured && delivery.processed === 200);
  console.log(JSON.stringify({ queued, scanned, configured: delivery?.configured || false, processed, sent, failed }));
})()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
