const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { overview, profitAnalytics } = require("./dashboard.controller");
const { stockSummary, quotationSummary, farmSummary, listActions } = require("./assistant.controller");
const { startOfTanzaniaDay, endOfTanzaniaDay, startOfTanzaniaWeek, startOfTanzaniaMonth, addTanzaniaMonths, tanzaniaDateKey } = require("../lib/businessTime");
const { occurredExpenseDateSql } = require("../lib/expenseReporting");

const SOURCE_KEYS = ["salesToday", "inventory", "debts", "expenses", "quotations", "farm", "actionHistory"];
const DAY_MS = 24 * 60 * 60 * 1000;
const TANZANIA_OFFSET_MS = 3 * 60 * 60 * 1000;

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function isStaff(user) {
  return Boolean(user.staffId);
}

function permissionsFor(user) {
  const permissions = user.permissions || {};
  return {
    reports: !isStaff(user) || Boolean(permissions.canViewReports),
    stock: !isStaff(user) || Boolean(permissions.canManageStock),
    farm: !isStaff(user) || Boolean(permissions.canManageFarm),
    debts: !isStaff(user) || Boolean(permissions.canSell),
    expenses: !isStaff(user) || Boolean(permissions.canRecordExpenses),
    quotations: !isStaff(user) || Boolean(permissions.canViewReports || permissions.canViewQuotationCosts),
  };
}

function tanzaniaDayKey(value = new Date()) {
  return tanzaniaDateKey(value);
}

function parseLocalDateStart(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day) - TANZANIA_OFFSET_MS);
  return tanzaniaDateKey(date) === value ? date : null;
}

function startOfTanzaniaQuarter(date) {
  const shifted = new Date(date.getTime() + TANZANIA_OFFSET_MS);
  const month = Math.floor(shifted.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(shifted.getUTCFullYear(), month, 1) - TANZANIA_OFFSET_MS);
}

function addTanzaniaCalendarMonths(date, months) {
  const shifted = new Date(date.getTime() + TANZANIA_OFFSET_MS);
  const targetMonth = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    targetMonth.getUTCFullYear(),
    targetMonth.getUTCMonth(),
    Math.min(shifted.getUTCDate(), lastDay),
    shifted.getUTCHours(),
    shifted.getUTCMinutes(),
    shifted.getUTCSeconds(),
    shifted.getUTCMilliseconds(),
  ) - TANZANIA_OFFSET_MS);
}

function previousComparableWindow(type, from, to) {
  const shiftDays = type === "thisWeek" || type === "lastWeek" ? 7
    : type === "today" || type === "yesterday" ? 1
      : type === "last7" ? 7 : 0;
  if (shiftDays) {
    const shift = shiftDays * DAY_MS;
    return { previousFrom: new Date(from.getTime() - shift), previousTo: new Date(to.getTime() - shift) };
  }
  const shiftMonths = type === "thisMonth" || type === "lastMonth" ? 1
    : type === "thisQuarter" || type === "lastQuarter" ? 3
      : type === "thisYear" || type === "lastYear" ? 12 : 0;
  if (shiftMonths) {
    return {
      previousFrom: addTanzaniaCalendarMonths(from, -shiftMonths),
      previousTo: addTanzaniaCalendarMonths(to, -shiftMonths),
    };
  }
  const duration = to.getTime() - from.getTime();
  return { previousFrom: new Date(from.getTime() - duration), previousTo: from };
}

function periodPhrase(question) {
  const value = question.toLocaleLowerCase();
  const custom = value.match(/(?:from|between|kuanzia)\s+(\d{4}-\d{2}-\d{2})\s+(?:to|until|and|hadi)\s+(\d{4}-\d{2}-\d{2})/);
  if (custom) return { type: "custom", fromDate: custom[1], toDate: custom[2] };
  if (/\bmwaka jana\b/.test(value)) return { type: "lastYear" };
  const phrases = [
    ["yesterday", /\b(yesterday|jana)\b/],
    ["today", /\b(today|leo)\b/],
    ["last7", /\b(last 7 days|last seven days|past 7 days|past seven days|past week|siku 7 zilizopita|siku saba zilizopita)\b/],
    ["lastWeek", /\b(last week|previous week|wiki iliyopita|wiki ya nyuma)\b/],
    ["thisWeek", /\b(this week|current week|week to date|wiki hii|wiki ya sasa)\b/],
    ["lastMonth", /\b(last month|previous month|mwezi uliopita|mwezi wa nyuma)\b/],
    ["thisMonth", /\b(this month|current month|month to date|mwezi huu|mwezi wa sasa)\b/],
    ["lastQuarter", /\b(last quarter|previous quarter|robo iliyopita|robo ya nyuma)\b/],
    ["thisQuarter", /\b(this quarter|current quarter|quarter to date|robo hii|robo ya sasa)\b/],
    ["lastYear", /\b(last year|previous year|mwaka uliopita)\b/],
    ["thisYear", /\b(this year|current year|year to date|mwaka huu|mwaka wa sasa)\b/],
  ];
  const matches = phrases.filter(([, pattern]) => pattern.test(value)).map(([type]) => type);
  if (matches.length > 1) return { type: "unsupported" };
  if (matches.length === 1) return { type: matches[0] };
  if (/\b(today|yesterday|week|month|quarter|year|daily|weekly|monthly|quarterly|annually|leo|jana|wiki|mwezi|robo|mwaka|siku zilizopita)\b|\b\d+\s*(?:calendar\s+)?days?\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\bin may\b|\bmay\s+(?:\d{1,2}|20\d{2})\b|\b20\d{2}\b/i.test(value)) {
    return { type: "unsupported" };
  }
  return null;
}

function requestedTimeWindow(question, intent, now = new Date()) {
  const phrase = periodPhrase(question);
  if (phrase?.type === "unsupported") {
    return { clarification: "unsupported-period" };
  }
  if (phrase && !["salesToday", "profit", "expenses"].includes(intent)) {
    return { clarification: intent === "debts" ? "historical-debt" : "historical-topic" };
  }

  const type = phrase?.type || (intent === "expenses" ? "last7" : "today");
  let from;
  let to = endOfTanzaniaDay(now);
  let label;
  if (type === "custom") {
    const start = parseLocalDateStart(phrase.fromDate);
    const endStart = parseLocalDateStart(phrase.toDate);
    if (!start || !endStart || start > endStart || endStart.getTime() - start.getTime() >= 366 * DAY_MS) {
      return { clarification: "invalid-range" };
    }
    from = start;
    to = new Date(endStart.getTime() + DAY_MS);
    label = `${phrase.fromDate} to ${phrase.toDate}`;
  } else if (type === "today") {
    from = startOfTanzaniaDay(now); label = "today";
  } else if (type === "yesterday") {
    from = new Date(startOfTanzaniaDay(now).getTime() - DAY_MS); to = startOfTanzaniaDay(now); label = "yesterday";
  } else if (type === "last7") {
    from = new Date(startOfTanzaniaDay(now).getTime() - 6 * DAY_MS); label = "the last 7 calendar days";
  } else if (type === "thisWeek" || type === "lastWeek") {
    const thisWeek = startOfTanzaniaWeek(now);
    from = type === "thisWeek" ? thisWeek : new Date(thisWeek.getTime() - 7 * DAY_MS);
    if (type === "lastWeek") to = thisWeek;
    label = type === "thisWeek" ? "this week" : "last week";
  } else if (type === "thisMonth" || type === "lastMonth") {
    const thisMonth = startOfTanzaniaMonth(now);
    from = type === "thisMonth" ? thisMonth : addTanzaniaMonths(thisMonth, -1);
    if (type === "lastMonth") to = thisMonth;
    label = type === "thisMonth" ? "this month" : "last month";
  } else if (type === "thisQuarter" || type === "lastQuarter") {
    const thisQuarter = startOfTanzaniaQuarter(now);
    from = type === "thisQuarter" ? thisQuarter : addTanzaniaMonths(thisQuarter, -3);
    if (type === "lastQuarter") to = thisQuarter;
    label = type === "thisQuarter" ? "this quarter" : "last quarter";
  } else {
    const shifted = new Date(now.getTime() + TANZANIA_OFFSET_MS);
    const thisYear = new Date(Date.UTC(shifted.getUTCFullYear(), 0, 1) - TANZANIA_OFFSET_MS);
    from = type === "thisYear" ? thisYear : new Date(Date.UTC(shifted.getUTCFullYear() - 1, 0, 1) - TANZANIA_OFFSET_MS);
    if (type === "lastYear") to = thisYear;
    label = type === "thisYear" ? "this year" : "last year";
  }
  const fromDate = tanzaniaDateKey(from);
  const toDate = tanzaniaDateKey(new Date(to.getTime() - 1));
  const previous = previousComparableWindow(type, from, to);
  return {
    window: {
      from,
      to,
      previousFrom: previous.previousFrom,
      previousTo: previous.previousTo,
      fromDate,
      toDate,
      label,
    },
  };
}

function sectionUnavailable(checkedAt) {
  return { status: "unavailable", checkedAt, errorCode: "SOURCE_UNAVAILABLE" };
}

function localizedPeriod(label, sw) {
  if (!sw) return label;
  return ({
    today: "leo",
    yesterday: "jana",
    "the last 7 calendar days": "siku 7 za kalenda zilizopita",
    "this week": "wiki hii",
    "last week": "wiki iliyopita",
    "this month": "mwezi huu",
    "last month": "mwezi uliopita",
    "this quarter": "robo hii",
    "last quarter": "robo iliyopita",
    "this year": "mwaka huu",
    "last year": "mwaka uliopita",
  })[label] || label;
}

async function runSection(sections, key, allowed, loader, req) {
  const checkedAt = new Date().toISOString();
  if (!allowed) {
    sections[key] = { status: "not_permitted", checkedAt };
    return;
  }
  const startedAt = Date.now();
  try {
    const loaded = await loader();
    const durationMs = Date.now() - startedAt;
    sections[key] = { status: "ready", checkedAt: new Date().toISOString(), durationMs, ...loaded };
    if (durationMs >= 1000) console.info(JSON.stringify({ event: "assistant_source_timing", requestId: req?.requestId || null, source: key, durationMs, status: "ready" }));
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    console.warn(JSON.stringify({ event: "assistant_source_unavailable", requestId: req?.requestId || null, source: key, errorName: error?.name || "Error", durationMs }));
    sections[key] = { ...sectionUnavailable(checkedAt), durationMs };
  }
}

async function invoke(handler, req, query = {}) {
  const sectionReq = Object.create(req);
  sectionReq.query = { ...req.query, ...query };
  let statusCode = 200;
  let payload;
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
  };
  await handler(sectionReq, res, (error) => { throw error; });
  if (statusCode >= 400) throw new Error("Assistant source request failed");
  return payload;
}

async function loadInventoryEvidence(shopId, canViewReports) {
  if (!canViewReports) {
    const rows = await prisma.$queryRaw`
      SELECT p.id, p.name, p."currentStock", p."minimumStock", p.unit, p."updatedAt"
      FROM products p
      WHERE p."shopId" = ${shopId} AND p."isActive" = true
        AND p."isInternalUse" = false AND p."currentStock" <= p."minimumStock"
      ORDER BY p."currentStock" ASC, p.name ASC
      LIMIT 50
    `;
    const products = rows.map((row) => ({
      id: row.id,
      name: row.name,
      currentStock: Number(row.currentStock),
      minimumStock: Number(row.minimumStock),
      unit: row.unit,
      dataThrough: row.updatedAt || null,
    }));
    const latest = rows.reduce((value, row) => Math.max(value, row.updatedAt ? new Date(row.updatedAt).getTime() : 0), 0);
    return { products, dataThrough: latest ? new Date(latest).toISOString() : null };
  }

  const since = new Date(Date.now() - 28 * DAY_MS);
  const rows = await prisma.$queryRaw`
    WITH sold AS (
      SELECT si."productId",
        COALESCE(SUM(GREATEST(si.quantity - si."returnedQuantity", 0)), 0)::float8 AS quantity,
        COUNT(DISTINCT (s."createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam')::date)::int AS "salesDays",
        MIN(s."createdAt") AS "firstSaleAt",
        MAX(s."createdAt") AS "lastSaleAt"
      FROM sale_items si
      JOIN sales s ON s.id = si."saleId"
      WHERE s."shopId" = ${shopId} AND s.status = 'COMPLETED' AND s."createdAt" >= ${since}
      GROUP BY si."productId"
    )
    SELECT p.id, p.name, p."currentStock", p."minimumStock", p.unit,
      CASE WHEN ${canViewReports} THEN p."buyingPrice" ELSE NULL END AS "buyingPrice",
      COALESCE(sold.quantity, 0)::float8 AS "soldQuantity",
      COALESCE(sold."salesDays", 0)::int AS "salesDays",
      sold."firstSaleAt", sold."lastSaleAt", p."updatedAt"
    FROM products p
    LEFT JOIN sold ON sold."productId" = p.id
    WHERE p."shopId" = ${shopId} AND p."isActive" = true
      AND p."isInternalUse" = false AND p."currentStock" <= p."minimumStock"
    ORDER BY p."currentStock" ASC, p.name ASC
    LIMIT 50
  `;
  const now = Date.now();
  const products = rows.map((row) => {
    const firstSaleAt = row.firstSaleAt ? new Date(row.firstSaleAt) : null;
    const activeDays = Number(row.salesDays || 0);
    const observedDays = firstSaleAt ? Math.max(1, Math.min(28, Math.ceil((now - firstSaleAt.getTime()) / DAY_MS))) : 0;
    const soldQuantity = Number(row.soldQuantity || 0);
    const hasReliablePace = Boolean(firstSaleAt && observedDays >= 14 && activeDays >= 7 && soldQuantity > 0);
    const dailySalesRate = hasReliablePace ? soldQuantity / observedDays : null;
    const daysOfCoverage = dailySalesRate ? Number((Number(row.currentStock) / dailySalesRate).toFixed(1)) : null;
    const reorderQuantity = dailySalesRate ? Math.max(0, Math.ceil(dailySalesRate * 14 - Number(row.currentStock))) : null;
    const buyingPrice = row.buyingPrice === null ? null : Number(row.buyingPrice);
    return {
      id: row.id,
      name: row.name,
      currentStock: Number(row.currentStock),
      minimumStock: Number(row.minimumStock),
      unit: row.unit,
      ...(buyingPrice !== null ? { buyingPrice } : {}),
      soldQuantity28d: soldQuantity,
      saleDays28d: activeDays,
      observedDays,
      hasReliablePace,
      ...(dailySalesRate !== null ? { dailySalesRate: Number(dailySalesRate.toFixed(2)), daysOfCoverage } : {}),
      ...(reorderQuantity !== null ? { reorderQuantity14d: reorderQuantity } : {}),
      ...(buyingPrice !== null && reorderQuantity !== null && buyingPrice > 0
        ? { estimatedReorderCost: Math.round(reorderQuantity * buyingPrice) }
        : {}),
      dataThrough: row.lastSaleAt || row.updatedAt,
    };
  });
  const dataThrough = rows.reduce((latest, row) => {
    const values = [row.lastSaleAt, row.updatedAt].filter(Boolean).map((value) => new Date(value).getTime());
    const newest = values.length ? Math.max(...values) : 0;
    return newest > latest ? newest : latest;
  }, 0);
  return { products, dataThrough: dataThrough ? new Date(dataThrough).toISOString() : null };
}

async function loadDebts(shopId) {
  const where = { shopId, status: { in: ["OPEN", "PARTIAL"] } };
  const [aggregate, debts, latestRecord] = await Promise.all([
    prisma.debt.aggregate({ where, _sum: { amount: true, amountPaid: true }, _count: { id: true } }),
    prisma.debt.findMany({
      where,
      select: { id: true, customerName: true, amount: true, amountPaid: true, status: true, dueDate: true, createdAt: true },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }, { id: "asc" }],
      take: 100,
    }),
    prisma.debt.findFirst({ where: { shopId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  const now = Date.now();
  debts.sort((a, b) => {
    const aOverdue = a.dueDate && new Date(a.dueDate).getTime() < now;
    const bOverdue = b.dueDate && new Date(b.dueDate).getTime() < now;
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    if (aOverdue && bOverdue) return new Date(a.dueDate) - new Date(b.dueDate) || new Date(a.createdAt) - new Date(b.createdAt);
    if (Boolean(a.dueDate) !== Boolean(b.dueDate)) return a.dueDate ? -1 : 1;
    if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate) || new Date(a.createdAt) - new Date(b.createdAt);
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
  return {
    summary: {
      openCount: aggregate._count.id,
      totalOwed: Math.max(0, (aggregate._sum.amount || 0) - (aggregate._sum.amountPaid || 0)),
    },
    debts,
    dataThrough: latestRecord?.updatedAt || null,
  };
}

async function loadExpenses(shopId, range) {
  const now = new Date();
  const occurredThrough = endOfTanzaniaDay(now);
  const currentFrom = range?.from || new Date(startOfTanzaniaDay(now).getTime() - 6 * DAY_MS);
  const currentTo = new Date(Math.min((range?.to || occurredThrough).getTime(), occurredThrough.getTime()));
  const previousFrom = range?.previousFrom || new Date(currentFrom.getTime() - (currentTo.getTime() - currentFrom.getTime()));
  const previousTo = new Date(Math.min((range?.previousTo || currentFrom).getTime(), occurredThrough.getTime()));
  const dateWasRecorded = occurredExpenseDateSql("e");
  const [currentRows, previousRows, recent, latestRecordRows] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT COALESCE(SUM(e.amount), 0)::bigint AS total, COUNT(*)::int AS count FROM expenses e WHERE e."shopId" = $1 AND e.category <> 'STOCK' AND e."spentAt" >= $2 AND e."spentAt" < $3 AND ${dateWasRecorded}`, shopId, currentFrom, currentTo),
    prisma.$queryRawUnsafe(`SELECT COALESCE(SUM(e.amount), 0)::bigint AS total, COUNT(*)::int AS count FROM expenses e WHERE e."shopId" = $1 AND e.category <> 'STOCK' AND e."spentAt" >= $2 AND e."spentAt" < $3 AND ${dateWasRecorded}`, shopId, previousFrom, previousTo),
    prisma.$queryRawUnsafe(`SELECT e.amount, e."spentAt", e."updatedAt", e.category FROM expenses e WHERE e."shopId" = $1 AND e.category <> 'STOCK' AND e."spentAt" >= $2 AND e."spentAt" < $3 AND ${dateWasRecorded} ORDER BY e."spentAt" DESC LIMIT 100`, shopId, currentFrom, currentTo),
    prisma.$queryRawUnsafe(`SELECT MAX(e."updatedAt") AS "updatedAt" FROM expenses e WHERE e."shopId" = $1 AND e.category <> 'STOCK' AND e."spentAt" < $2 AND ${dateWasRecorded}`, shopId, occurredThrough),
  ]);
  const current = currentRows[0] || { total: 0, count: 0 };
  const previous = previousRows[0] || { total: 0, count: 0 };
  return {
    summary: { total: Number(current.total || 0), count: Number(current.count || 0) },
    expenses: recent,
    trend: { current: Number(current.total || 0), previous: Number(previous.total || 0), currentCount: Number(current.count || 0), previousCount: Number(previous.count || 0) },
    dataThrough: latestRecordRows[0]?.updatedAt || null,
  };
}

async function loadSnapshot(req, sources = SOURCE_KEYS, options = {}) {
  const startedAt = Date.now();
  const shopId = await getShopIdForUser(req.user);
  const permissions = permissionsFor(req.user);
  const language = String(req.headers?.["x-dukapilot-language"] || req.user.language || "sw").toLowerCase() === "en" ? "en" : "sw";
  const sections = {};
  const selected = new Set(sources);
  const tasks = [];
  const add = (key, allowed, loader) => {
    if (selected.has(key)) tasks.push(runSection(sections, key, allowed, loader, req));
  };

  add("salesToday", permissions.reports, async () => {
    if (options.timeWindow) {
      const data = await invoke(profitAnalytics, req, { period: "custom", from: options.timeWindow.fromDate, to: options.timeWindow.toDate });
      return { data: { analytics: data.summary, timeWindow: options.timeWindow }, dataThrough: data.to || null };
    }
    const data = await invoke(overview, req, { period: "today" });
    return { data: { dashboard: data }, dataThrough: data.recentSales?.[0]?.createdAt || null };
  });
  add("inventory", permissions.stock, async () => {
    const [summary, evidence] = await Promise.all([
      invoke(stockSummary, req),
      loadInventoryEvidence(shopId, permissions.reports),
    ]);
    return { data: { ...summary, products: evidence.products }, dataThrough: evidence.dataThrough };
  });
  add("debts", permissions.reports && permissions.debts, async () => {
    const data = await loadDebts(shopId);
    return { data, dataThrough: data.dataThrough };
  });
  add("expenses", permissions.reports && permissions.expenses, async () => {
    const data = await loadExpenses(shopId, options.timeWindow);
    return { data: { ...data, timeWindow: options.timeWindow ? { label: options.timeWindow.label } : null }, dataThrough: data.dataThrough };
  });
  add("quotations", permissions.quotations, async () => {
    const data = await invoke(quotationSummary, req);
    return { data };
  });
  add("farm", permissions.farm, async () => {
    const data = await invoke(farmSummary, req);
    return { data };
  });
  add("actionHistory", permissions.reports, async () => {
    const data = await invoke(listActions, req, { limit: 100 });
    return { data, dataThrough: data.actions?.[0]?.updatedAt || null };
  });

  await Promise.all(tasks);
  const durationMs = Date.now() - startedAt;
  if (durationMs >= 1500) console.info(JSON.stringify({ event: "assistant_snapshot_timing", requestId: req?.requestId || null, durationMs, sources }));
  const generatedAt = new Date().toISOString();
  return { generatedAt, snapshotKey: tanzaniaDayKey(new Date(generatedAt)), sections };
}

const today = asyncHandler(async (req, res) => {
  const requestedSource = String(req.query.source || "");
  if (requestedSource && !SOURCE_KEYS.includes(requestedSource)) {
    return res.status(400).json({ error: "Unknown assistant source" });
  }
  const snapshot = await loadSnapshot(req, requestedSource ? [requestedSource] : SOURCE_KEYS);
  res.json(snapshot);
});

function detectIntent(question) {
  const value = question.toLocaleLowerCase();
  if (/\b(stock|inventory|restock|reorder|run out|bidhaa|hifadhi|agiza|kuisha)\b/.test(value)) return "inventory";
  if (/\b(debt|debts|owed|collection|madeni|deni|dai)\b/.test(value)) return "debts";
  if (/\b(gross profit|net profit|profit margin|profit|faida|cogs|cost of goods sold)\b/.test(value)) return "profit";
  if (/\b(expense|expenses|cost|spending|gharama|matumizi)\b/.test(value)) return "expenses";
  if (/\b(farm|crop|harvest|livestock|shamba|mazao|mavuno|ufugaji)\b/.test(value)) return "farm";
  if (/\b(sale|sales|revenue|mauzo|mapato)\b/.test(value)) return "salesToday";
  return "overview";
}

function askAnswer(intent, snapshot, lang) {
  const sw = lang === "sw";
  const get = (key) => snapshot.sections[key]?.status === "ready" ? snapshot.sections[key].data : null;
  const evidence = [];
  let message;
  let href = "/assistant";
  const addEvidence = (key, label) => {
    const section = snapshot.sections[key];
    if (section?.status === "ready") evidence.push({ source: label, checkedAt: section.checkedAt, dataThrough: section.dataThrough || null });
  };

  if (intent === "inventory") {
    const products = get("inventory")?.products || [];
    if (snapshot.sections.inventory?.status === "not_permitted") {
      message = sw ? "Akaunti hii haina ruhusa ya kuona stock. Muombe mmiliki au msimamizi akupe ruhusa husika." : "This account cannot view inventory data. Ask the owner or manager for the required permission.";
    } else if (!snapshot.sections.inventory || snapshot.sections.inventory.status !== "ready") {
      message = sw ? "Sina data ya stock iliyosasishwa kwa sasa. Jaribu tena sehemu ya stock." : "I could not load current stock data. Retry the inventory source and ask again.";
    } else if (!products.length) {
      message = sw ? "Hakuna bidhaa za kuangalia kwenye kiwango cha chini cha stock kwa sasa." : "No active, sellable products are currently at or below their minimum stock level.";
    } else {
      const product = products.find((item) => item.hasReliablePace) || products[0];
      if (product.hasReliablePace) {
        const days = Math.max(0, Math.round(product.daysOfCoverage));
        const reorder = product.reorderQuantity14d;
        const cost = product.estimatedReorderCost;
        message = sw
          ? `${product.name} imebaki ${product.currentStock} ${product.unit}. Kwa kasi ya mauzo ya siku 28 zilizopita, stock inaweza kudumu takriban siku ${days}. Kujaza stock ya siku 14 kunahitaji takriban ${reorder} ${product.unit}${cost !== undefined ? ` (gharama ya karibu TZS ${Number(cost).toLocaleString("en-TZ")})` : ""}. Haya ni makadirio, si agizo.`
          : `${product.name} has ${product.currentStock} ${product.unit}. At its recorded pace over the last 28 days, stock may last about ${days} days. A 14-day cover would mean roughly ${reorder} ${product.unit}${cost !== undefined ? ` (estimated cost TZS ${Number(cost).toLocaleString("en-TZ")})` : ""}. This is an estimate, not a purchase order.`;
      } else {
        message = sw
          ? `${product.name} imebaki ${product.currentStock} ${product.unit}, lakini historia ya mauzo ni ndogo sana kutabiri siku za kuisha au kiasi cha kuagiza. Kagua mahitaji kabla ya kutumia pesa kuongeza stock.`
          : `${product.name} has ${product.currentStock} ${product.unit}, but its sales history is too sparse for a reliable run-out or reorder estimate. Check demand before spending on more stock.`;
      }
    }
    const selectedProduct = products.find((item) => item.hasReliablePace) || products[0];
    href = `/inventory${selectedProduct?.name ? `?search=${encodeURIComponent(selectedProduct.name)}` : ""}`;
    addEvidence("inventory", sw ? "Hifadhi ya bidhaa" : "Inventory");
  } else if (intent === "debts") {
    const data = get("debts");
    if (!data && snapshot.sections.debts?.status === "not_permitted") message = sw ? "Akaunti hii haina ruhusa ya kuona madeni." : "This account does not have permission to view debts.";
    else if (!data) message = sw ? "Taarifa za madeni hazipatikani kwa sasa. Jaribu tena chanzo cha madeni." : "Debt data could not be loaded. Retry the debt source.";
    else if (!data.summary.openCount) message = sw ? "Hakuna deni lililo wazi lililorekodiwa." : "There are no open debts recorded.";
    else {
      const oldest = data.debts?.[0];
      const ageDays = oldest ? Math.max(0, Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / DAY_MS)) : null;
      message = sw
        ? `Madeni ${data.summary.openCount} yako wazi, jumla ya salio TZS ${Number(data.summary.totalOwed).toLocaleString("en-TZ")}.${ageDays !== null ? ` Rekodi ya zamani zaidi kwenye orodha ina takriban siku ${ageDays}.` : ""} Hii ni salio lililorekodiwa, si uthibitisho wa malipo yaliyopokelewa.`
        : `${data.summary.openCount} debt records remain open, with TZS ${Number(data.summary.totalOwed).toLocaleString("en-TZ")} outstanding.${ageDays !== null ? ` The oldest listed record is about ${ageDays} days old.` : ""} This is the recorded balance, not confirmation of cash received.`;
      href = "/debts";
    }
    addEvidence("debts", sw ? "Madeni" : "Debts");
  } else if (intent === "expenses") {
    const data = get("expenses");
    if (!data && snapshot.sections.expenses?.status === "not_permitted") message = sw ? "Akaunti hii haina ruhusa ya kuona matumizi." : "This account does not have permission to view expenses.";
    else if (!data) message = sw ? "Taarifa za matumizi hazipatikani kwa sasa. Jaribu tena chanzo cha matumizi." : "Expense data could not be loaded. Retry the expense source.";
    else {
      const current = Number(data.trend.current || 0);
      const previous = Number(data.trend.previous || 0);
      const change = previous ? Math.round(((current - previous) / previous) * 100) : null;
      const period = localizedPeriod(data.timeWindow?.label || "the last 7 calendar days", sw);
      message = sw
        ? `Matumizi yaliyorekodiwa ${period} ni TZS ${current.toLocaleString("en-TZ")}.${previous ? ` Kipindi kilichotangulia chenye urefu sawa kilikuwa TZS ${previous.toLocaleString("en-TZ")}${change !== null ? ` (${change >= 0 ? "juu" : "chini"} kwa ${Math.abs(change)}%)` : ""}.` : " Hakuna matumizi yaliyorekodiwa kwenye kipindi cha kulinganisha."} Linganisha vipindi hivi kabla ya kuhitimisha kuwa kuna ongezeko lisilo la kawaida.`
        : `Recorded expenses for ${period} are TZS ${current.toLocaleString("en-TZ")}.${previous ? ` The preceding comparable period was TZS ${previous.toLocaleString("en-TZ")}${change !== null ? ` (${Math.abs(change)}% ${change >= 0 ? "higher" : "lower"})` : ""}.` : " There are no recorded expenses in the comparable period."} Compare the periods before treating a change as unusual.`;
      href = "/expenses";
    }
    addEvidence("expenses", sw ? "Matumizi" : "Expenses");
  } else if (intent === "farm") {
    const data = get("farm");
    if (snapshot.sections.farm?.status === "not_permitted") message = sw ? "Akaunti hii haina ruhusa ya kuona shughuli za shamba." : "This account does not have permission to view farm operations.";
    else if (!data) message = sw ? "Rekodi za shughuli za shamba hazipatikani kwa sasa. Jaribu tena." : "Recorded farm operations are unavailable right now. Retry the farm source.";
    else if (!data.actions?.length) message = sw ? "Hakuna hatua ya shamba iliyopatikana kwenye rekodi zilizopo. Msaidizi hutumia data ya shughuli pekee; hautoi ushauri wa afya ya wanyama au tiba ya mazao." : "No farm action was found in the available records. Guidance is limited to recorded operations, not animal-health or crop-treatment advice.";
    else message = sw ? `Hatua ya kwanza kulingana na rekodi za shamba ni: ${data.actions[0].title}. Msaidizi hatoi ushauri wa afya ya wanyama au tiba ya mazao.` : `The first action based on recorded farm operations is: ${data.actions[0].title}. This assistant does not provide animal-health or crop-treatment advice.`;
    href = "/farm";
    addEvidence("farm", sw ? "Shughuli za shamba" : "Farm operations");
  } else if (intent === "profit") {
    const salesData = get("salesToday");
    const summary = salesData?.analytics || salesData?.dashboard?.summary;
    const period = localizedPeriod(salesData?.timeWindow?.label || "today", sw);
    if (snapshot.sections.salesToday?.status === "not_permitted") message = sw ? "Akaunti hii haina ruhusa ya kuona faida." : "This account does not have permission to view profit data.";
    else if (!summary) message = sw ? "Takwimu za faida hazipatikani kwa sasa. Jaribu tena chanzo cha ripoti." : "Profit data is unavailable right now. Retry the reports source.";
    else {
      const grossProfit = Number(summary.grossProfit ?? summary.totalProfit ?? 0);
      const costOfGoodsSold = Number(summary.costOfGoodsSold || 0);
      const expenses = Number(summary.expenses ?? summary.totalExpenses ?? 0);
      const netProfit = Number(summary.netProfit ?? grossProfit - expenses);
      const complete = summary.costComplete === true;
      const missing = Number(summary.missingCostSalesRevenue || 0);
      message = sw
        ? `${period}: gharama ya bidhaa zilizouzwa ni TZS ${costOfGoodsSold.toLocaleString("en-TZ")}, faida ghafi ni TZS ${grossProfit.toLocaleString("en-TZ")}, matumizi ni TZS ${expenses.toLocaleString("en-TZ")}, na faida baada ya matumizi ni TZS ${netProfit.toLocaleString("en-TZ")}.${complete ? " Gharama za bidhaa zimekamilika kwa mauzo haya." : ` Gharama za bidhaa hazijakamilika; mauzo ya TZS ${missing.toLocaleString("en-TZ")} hayana gharama iliyorekodiwa.`}`
        : `${period}: cost of goods sold is TZS ${costOfGoodsSold.toLocaleString("en-TZ")}, gross profit is TZS ${grossProfit.toLocaleString("en-TZ")}, expenses are TZS ${expenses.toLocaleString("en-TZ")}, and profit after expenses is TZS ${netProfit.toLocaleString("en-TZ")}.${complete ? " Product cost coverage is complete for these sales." : ` Product costs are incomplete; TZS ${missing.toLocaleString("en-TZ")} in sales revenue has no recorded cost.`}`;
    }
    href = "/analytics";
    addEvidence("salesToday", sw ? `Faida (${period})` : `Profit (${period})`);
  } else if (intent === "salesToday") {
    const salesData = get("salesToday");
    const data = salesData?.analytics || salesData?.dashboard?.summary;
    if (snapshot.sections.salesToday?.status === "not_permitted") message = sw ? "Akaunti hii haina ruhusa ya kuona ripoti za mauzo." : "This account does not have permission to view sales reports.";
    else if (!data) message = sw ? "Takwimu za mauzo hazipatikani kwa sasa. Jaribu tena chanzo cha mauzo." : "Sales data is unavailable right now. Retry the sales source.";
    else {
      const period = localizedPeriod(salesData.timeWindow?.label || "today", sw);
      const netSales = Number(data.netSalesRevenue ?? data.netSales ?? data.totalSales ?? 0);
      const salesCount = Number(data.salesCount || 0);
      const cashCollected = data.cashCollected === undefined ? null : Number(data.cashCollected);
      message = sw
        ? `${period} kuna rekodi ${salesCount} za mauzo. Mauzo halisi yaliyorekodiwa baada ya marejesho ni TZS ${netSales.toLocaleString("en-TZ")}.${cashCollected === null ? "" : ` Fedha iliyokusanywa katika kipindi hiki ni TZS ${cashCollected.toLocaleString("en-TZ")}; si kipimo sawa na mauzo halisi.`}`
        : `${period[0].toUpperCase()}${period.slice(1)} has ${salesCount} recorded sales. Recorded net sales after returns are TZS ${netSales.toLocaleString("en-TZ")}.${cashCollected === null ? "" : ` Cash collected in this period is TZS ${cashCollected.toLocaleString("en-TZ")}; it is not the same measure as net sales.`}`;
    }
    href = "/analytics";
    addEvidence("salesToday", sw ? `Mauzo (${localizedPeriod(salesData?.timeWindow?.label || "today", true)})` : `Sales (${salesData?.timeWindow?.label || "today"})`);
  } else {
    const keys = ["salesToday", "inventory", "debts", "expenses", "quotations", "farm"];
    const firstAction = keys.map((key) => get(key)).filter(Boolean).flatMap((data) => data.actions || data.stockActions || []).sort((a, b) => b.rank - a.rank)[0];
    message = firstAction
      ? (sw ? `Kulingana na rekodi nilizoweza kufikia, hatua inayofuata ni: ${firstAction.title}. Unaweza kuniuliza kuhusu stock, madeni, matumizi, mauzo au shughuli za shamba.` : `Based on records I could access, the next suggested step is: ${firstAction.title}. You can ask about stock, debts, expenses, sales, or farm operations.`)
      : (sw ? "Naweza kujibu kuhusu stock, madeni, matumizi, mauzo ya leo, na rekodi za shamba zilizo kwenye DukaPilot. Sijaandika au kubadilisha chochote." : "I can answer about recorded stock, debts, expenses, today's sales, and farm operations in DukaPilot. I have not recorded or changed anything.");
    for (const key of keys) addEvidence(key, key);
  }

  return { message, href, evidence, privacy: sw ? "Jibu limetumia rekodi za DukaPilot pekee; hakuna huduma ya AI ya nje iliyotumika." : "This answer used DukaPilot records only; no external AI service was called." };
}

const ask = asyncHandler(async (req, res) => {
  const question = String(req.body?.question || "").trim().slice(0, 240);
  if (!question) return res.status(400).json({ error: "Enter a question" });
  const intent = detectIntent(question);
  const parsedWindow = requestedTimeWindow(question, intent);
  const language = String(req.headers?.["x-dukapilot-language"] || req.user.language || "sw").toLowerCase() === "en" ? "en" : "sw";
  if (parsedWindow.clarification) {
    const message = language === "sw"
      ? parsedWindow.clarification === "historical-debt"
        ? "Swali la madeni linaonyesha salio la sasa. Bado siwezi kuonyesha salio la kihistoria kwa kipindi ulichoomba."
        : parsedWindow.clarification === "historical-topic"
          ? "Ninaweza kuonyesha rekodi za sasa za mada hii, lakini uchujaji wa tarehe haujaungwa mkono. Uliza kuhusu hali ya sasa badala yake."
          : parsedWindow.clarification === "invalid-range"
            ? "Kipindi hicho cha tarehe si sahihi au kinazidi siku 366. Tumia tarehe halisi kwa muundo YYYY-MM-DD hadi YYYY-MM-DD."
            : "Taja kipindi kinachoungwa mkono: leo, jana, wiki/mwezi/robo/mwaka huu au uliopita, siku 7 zilizopita, au tarehe mbili za YYYY-MM-DD."
      : parsedWindow.clarification === "historical-debt"
        ? "Debt questions show the current outstanding balance. Historical debt balances for that period are not available yet."
        : parsedWindow.clarification === "historical-topic"
          ? "I can show current records for this topic, but date filtering is not supported yet. Please ask about its current status instead."
          : parsedWindow.clarification === "invalid-range"
            ? "That date range is invalid or longer than 366 days. Use two real dates in YYYY-MM-DD to YYYY-MM-DD format."
            : "Specify a supported period: today, yesterday, this/last week, month, quarter, or year, the last 7 days, or two YYYY-MM-DD dates.";
    return res.json({ answer: { message, href: intent === "debts" ? "/debts" : intent === "expenses" ? "/expenses" : intent === "salesToday" ? "/analytics" : "/assistant", evidence: [], privacy: language === "sw" ? "Jibu hili halikutumia data ya biashara kwa sababu nilihitaji ufafanuzi wa kipindi." : "No business data was queried because the requested period needs clarification." }, generatedAt: new Date().toISOString() });
  }
  const sources = intent === "overview"
    ? ["salesToday", "inventory", "debts", "expenses", "quotations", "farm"]
    : [intent === "profit" ? "salesToday" : intent];
  const snapshot = await loadSnapshot(req, sources, { timeWindow: parsedWindow.window });
  res.json({ answer: askAnswer(intent, snapshot, language), generatedAt: snapshot.generatedAt });
});

module.exports = { today, ask, loadInventoryEvidence, loadDebts, loadExpenses, loadSnapshot, detectIntent, requestedTimeWindow, askAnswer };
