let client = null;
let attempted = false;

function getRedisClient() {
  if (attempted) return client;
  attempted = true;
  if (!process.env.REDIS_URL) return null;

  try {
    const { createClient } = require("redis");
    client = createClient({ url: process.env.REDIS_URL });
    // Redis reconnects itself. Avoid turning a temporary cache outage into an
    // unbounded application log stream; callers retain their local fallback.
    client.on("error", () => {});
    client.connect().catch(() => {});
    return client;
  } catch {
    client = null;
    return null;
  }
}

function readyRedisClient() {
  const redis = getRedisClient();
  return redis?.isReady ? redis : null;
}

module.exports = { getRedisClient, readyRedisClient };
