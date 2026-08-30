const { readyRedisClient } = require("../lib/redis");

const memory = new Map();
const MAX_MEMORY_ENTRIES = 500;

function remember(key, value, ttlSeconds) {
  if (memory.size >= MAX_MEMORY_ENTRIES && !memory.has(key)) {
    const oldestKey = memory.keys().next().value;
    if (oldestKey) memory.delete(oldestKey);
  }
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function readThrough(key, ttlSeconds, loader) {
  const local = memory.get(key);
  if (local && local.expiresAt > Date.now()) return local.value;

  const redis = readyRedisClient();
  if (redis) {
    try {
      const serialized = await redis.get(key);
      if (serialized) {
        const value = JSON.parse(serialized);
        remember(key, value, ttlSeconds);
        return value;
      }
    } catch {
      // The primary database result remains authoritative when Redis is down.
    }
  }

  const value = await loader();
  remember(key, value, ttlSeconds);
  if (redis) {
    redis.set(key, JSON.stringify(value), { EX: ttlSeconds }).catch(() => {});
  }
  return value;
}

async function invalidateDashboardHistory(shopId) {
  const key = `dukapilot:dashboard-history:${shopId}`;
  memory.delete(key);
  const redis = readyRedisClient();
  if (redis) redis.del(key).catch(() => {});
}

function dashboardHistory(shopId, loader) {
  return readThrough(`dukapilot:dashboard-history:${shopId}`, 30, loader);
}

module.exports = { dashboardHistory, invalidateDashboardHistory, readThrough };
