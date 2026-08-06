const MIN_SALES = 60;
const MAX_SALES = 80;
const HISTORY_DAYS = 30;
const PAYMENT_METHODS = ["CASH", "CASH", "CASH", "CASH", "MPESA", "MPESA", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "BANK"];

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) throw new Error("End date must use YYYY-MM-DD format");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) throw new Error("End date is not a real calendar date");
  return date;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function randomGenerator(seedText) {
  let state = hashSeed(seedText) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function buildDailyCounts(endDate, count) {
  const days = Array.from({ length: HISTORY_DAYS }, (_, index) => {
    const date = new Date(endDate);
    date.setUTCDate(date.getUTCDate() - (HISTORY_DAYS - 1 - index));
    return { date, count: 1 };
  });
  const weekdayWeight = [1, 2, 2, 2, 3, 4, 5];
  const dailyLimit = [2, 3, 3, 3, 3, 4, 4];
  const priority = [...days].sort((a, b) => {
    const weightDifference = weekdayWeight[b.date.getUTCDay()] - weekdayWeight[a.date.getUTCDay()];
    return weightDifference || a.date.getTime() - b.date.getTime();
  });

  let remaining = count - HISTORY_DAYS;
  while (remaining > 0) {
    let allocated = false;
    for (const day of priority) {
      if (remaining === 0) break;
      if (day.count >= dailyLimit[day.date.getUTCDay()]) continue;
      day.count += 1;
      remaining -= 1;
      allocated = true;
    }
    if (!allocated) throw new Error("Unable to distribute requested demo sales across 30 days");
  }
  return days;
}

function buildProductPool(products) {
  const ordered = [...products].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return ordered.flatMap((product, index) => Array.from({ length: Math.max(1, ordered.length - index) }, () => product));
}

function generateDemoSaleSchedule({ endDate, count = 72, products }) {
  if (!Number.isInteger(count) || count < MIN_SALES || count > MAX_SALES) {
    throw new Error(`Demo history must contain between ${MIN_SALES} and ${MAX_SALES} sales`);
  }
  if (!Array.isArray(products) || products.length < 2) {
    throw new Error("The demo shop needs at least two active products before history can be generated");
  }

  const end = parseDateOnly(endDate);
  const productPool = buildProductPool(products);
  const schedule = [];

  for (const day of buildDailyCounts(end, count)) {
    const dayKey = dateKey(day.date);
    for (let index = 0; index < day.count; index += 1) {
      const random = randomGenerator(`${dayKey}:${index}`);
      const itemCount = random() < 0.28 ? 2 : 1;
      const selected = [];
      while (selected.length < itemCount) {
        const product = productPool[Math.floor(random() * productPool.length)];
        if (!selected.some((item) => item.id === product.id)) selected.push(product);
      }

      let totalAmount = 0;
      let profit = 0;
      const items = selected.map((product) => {
        const quantity = 1 + Math.floor(random() * (product.unit === "kg" ? 2 : 3));
        const unitPrice = Number(product.sellingPrice);
        const buyingPrice = Number(product.buyingPrice);
        const totalPrice = unitPrice * quantity;
        totalAmount += totalPrice;
        profit += (unitPrice - buyingPrice) * quantity;
        return { productId: product.id, quantity, unitPrice, buyingPrice, totalPrice };
      });
      const hour = 8 + Math.floor(random() * 12);
      const minute = Math.floor(random() * 60);
      const createdAt = new Date(`${dayKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+03:00`);

      schedule.push({
        createdAt,
        paymentMethod: PAYMENT_METHODS[Math.floor(random() * PAYMENT_METHODS.length)],
        channel: random() < 0.94 ? "POS" : "ONLINE",
        pricingTier: "RETAIL",
        totalAmount,
        profit,
        items,
      });
    }
  }

  return schedule.sort((a, b) => a.createdAt - b.createdAt);
}

module.exports = { HISTORY_DAYS, MAX_SALES, MIN_SALES, generateDemoSaleSchedule };
