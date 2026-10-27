const { readyRedisClient } = require("../lib/redis");

const memory = new Map();
const inFlight = new Map();
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

  const existing = inFlight.get(key);
  if (existing) return existing.promise;

  const flight = { invalidated: false, promise: null };
  flight.promise = (async () => {
    const redis = readyRedisClient();
    if (redis) {
      try {
        const serialized = await redis.get(key);
        if (serialized) {
          const value = JSON.parse(serialized);
          if (!flight.invalidated) {
            remember(key, value, ttlSeconds);
            return value;
          }
        }
      } catch {
        // The primary database result remains authoritative when Redis is down.
      }
    }

    const value = await loader();
    if (!flight.invalidated) {
      remember(key, value, ttlSeconds);
      if (redis) {
        try {
          const serialized = JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
          redis.set(key, serialized, { EX: ttlSeconds }).catch(() => {});
        } catch {
          // Cache serialization must not fail an otherwise successful dashboard request.
        }
      }
    }
    return value;
  })();
  inFlight.set(key, flight);

  try {
    return await flight.promise;
  } finally {
    if (inFlight.get(key) === flight) inFlight.delete(key);
  }
}

async function invalidateDashboardHistory(shopId) {
  const key = `dukapilot:dashboard-history:${shopId}`;
  const pending = inFlight.get(key);
  if (pending) pending.invalidated = true;
  inFlight.delete(key);
  memory.delete(key);
  const redis = readyRedisClient();
  if (redis) redis.del(key).catch(() => {});
}

function dashboardHistory(shopId, loader) {
  return readThrough(`dukapilot:dashboard-history:${shopId}`, 30, loader);
}

module.exports = { dashboardHistory, invalidateDashboardHistory, readThrough };
