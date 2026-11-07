const prisma = require("../lib/prisma");
const crypto = require("crypto");
const { getShopIdForUser } = require("../lib/shopAccess");
const { overview, profitAnalytics } = require("./dashboard.controller");
const { report: purchaseReport } = require("./purchaseAnalytics.controller");
const { current: currentCashSession } = require("./cashSession.controller");
const { productInsights } = require("../services/assistantProductInsights.service");
const { supplierBalances, debtCollections } = require("../services/assistantBusinessInsights.service");
const { overview: branchOverview } = require("./branch.controller");
const { getFarmConfiguration } = require("../lib/farmAccess");
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
    cashSession: !isStaff(user) || Boolean(permissions.canSell || permissions.canManageCashSessions),
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
  if (phrase && !["salesToday", "profit", "expenses", "purchases", "topPurchaseSupplier", "returns", "creditSales", "productRanking", "productDetail", "supplierRefunds", "debtCollections", "teamShifts", "branchComparison", "foodProduction", "foodInput", "farmInput", "eggProduction"].includes(intent)) {
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
  sectionReq.query = { ...query };
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
  if (/\b(branches|branch comparison|compare branches|matawi|linganisha matawi)\b/.test(value)) return /\b(stock|inventory|bidhaa|hifadhi)\b/.test(value) ? "unsupported" : /\b(compare|comparison|sales|mauzo|linganisha|compare|how did|vipi)\b/.test(value) ? "branchComparison" : "unsupported";
  if (/\b(shift|shifts|drawer|daily close|zamu|droo)\b/.test(value) && /\b(team|staff|other|all|variance|difference|differences|tofauti|wafanyakazi|zote)\b/.test(value)) return /\b(variance|difference|differences|tofauti)\b/.test(value) ? "teamShifts" : "unsupported";
  if (/\b(supplier|suppliers|msambazaji|wasambazaji)\b/.test(value) && /\b(refund|refunds|refunded|fedha zilizorejeshwa)\b/.test(value)) return /\b(awaiting|pending|waiting|bado)\b/.test(value) ? "supplierCreditsOwed" : "supplierRefunds";
  if (/\b(supplier|suppliers|msambazaji|wasambazaji)\b/.test(value) && /\b(balance|balances|owe|owed|owing|deni|madeni|salio|tunadaiwa)\b/.test(value)) return "supplierBalance";
  if (/\b(debt|debts|madeni|deni)\b/.test(value) && /\b(collect|collected|collections?|payments? received|nilikusanya|tulikusanya|malipo yaliyokusanywa)\b/.test(value)) return "debtCollections";
  if (/\b(crop|crops|field|shamba|mazao|shambani)\b/.test(value) && /\b(tasks?|majukumu|kazi)\b/.test(value) && /\b(overdue|late|yaliyochelewa|zilizochelewa)\b/.test(value)) return "cropTasks";
  if (/\b(crop cycle|crop inputs?|crop harvest|cycle (?:summary|costs?|profit)|mzunguko wa mazao|gharama za mzunguko|pembejeo za mzunguko)\b/.test(value)) return "cropDetail";
  if (/\b(livestock group|animal group|farm group|kundi la mifugo|kundi la shamba)\b/.test(value)) return "livestockGroup";
  if (/\b(eggs?|mayai|trays?|trei)\b/.test(value) && /\b(stock|inventory|remaining|hifadhi|iliyobaki)\b/.test(value)) return "eggStock";
  if (/\b(feed|farm input|chakula cha mifugo|pembejeo za ufugaji)\b/.test(value) && /\b(used|usage|consumed|matumizi|kilichotumika)\b/.test(value)) return "farmInput";
  if (/\b(ingredient|ingredients|kiungo|viungo)\b/.test(value) && /\b(used|usage|consumed|matumizi|vilivyotumika)\b/.test(value)) return "foodInput";
  if (/\b(eggs?|mayai)\b/.test(value) && /\b(production|produced|collected|broken|uzalishaji|yaliyokusanywa|yaliyovunjika)\b/.test(value)) return /\b(feed|cost|costs|stock|tray|trays|chakula|gharama|trei)\b/.test(value) ? "unsupported" : "eggProduction";
  if (/\b(prepare|prepared|preparation|cooked|kupikwa|tumeandaa|yaliyopikwa)\b/.test(value) && !/\b(ingredient|ingredients|kiungo|viungo)\b/.test(value)) return "foodProduction";
  if (/\b(product|products|item|items|bidhaa)\b/.test(value) && /\b(not sold|haven't sold|have not sold|slow.moving|hazikuuza|hazijauzwa)\b/.test(value)) return "slowProducts";
  if (/\b(product performance|performance of (?:this|the|selected) product|how (?:is|did) (?:this|the|selected) product|utendaji wa bidhaa|bidhaa hii imefanyaje)\b/.test(value)) return "productDetail";
  if (/\b(best.sell(?:ing|er)?|top.sell(?:ing|er)?|most sold|sold (?:the )?most|sell (?:the )?most|most profitable|highest selling|top products?|best products?|bidhaa (?:inayouzwa|inayouza|iliyouzwa|zinazouzwa) zaidi)\b/.test(value) && /\b(product|products|item|items|bidhaa)\b/.test(value)) return "productRanking";
  if (/\b(shift|drawer|cash session|daily close|zamu|droo)\b/.test(value)) return /\b(team|staff|other|all|variance|difference|tofauti|wafanyakazi|zote)\b/.test(value) ? "unsupported" : "cashSession";
  if (/\b(credit sales?|sales? (?:on|by) credit|mauzo ya mkopo|mauzo kwa mkopo|returns?|refunded|refunds?|marejesho|rejesho)\b/.test(value) && /\b(expenses?|matumizi|gharama)\b/.test(value)) return "ambiguous";
  if (/\b(return|returns|returned|refund|refunds|marejesho|rejesho)\b/.test(value) && /\b(supplier|suppliers|purchase|purchases|msambazaji|wasambazaji|manunuzi)\b/.test(value)) return "unsupported";
  if (/\b(?:when|lini)\b.*\b(?:received|receive|purchased|kupokea|ilipokelewa)\b/.test(value)) return "unsupported";
  if (/\b(supplier returns?|return(?:ed)? to (?:a |the )?supplier|marejesho kwa (?:muuzaji|msambazaji)|deni la msambazaji|supplier (?:balance|balances|credit)|owe (?:a |the )?supplier)\b/.test(value)) return "unsupported";
  if (/\b(expir(?:e|es|ing|y|ed)|near expiry|muda wa matumizi|zinazoisha muda|zinaisha muda|inaisha muda|zilizoisha muda)\b/.test(value) && /\b(stock|inventory|product|products|bidhaa|hifadhi)\b/.test(value)) return /\b(expired|zilizoisha muda)\b/.test(value) ? "expiredStock" : "expiry";
  if (/\b(recurring|scheduled|schedule|ratiba|ya kila mwezi)\b/.test(value) && /\b(expense|expenses|payment|payments|matumizi|malipo)\b/.test(value)) return "scheduledExpenses";
  if (/\b(quotation|quotations|quote|quotes|nukuu)\b/.test(value)) return "quotations";
  if (/\b(purchase|purchases|purchased|buy|bought|stock (?:was )?received|stock receipts?|receive stock|manunuzi|nunua|nilinunua|tulinunua|stock iliyopokelewa)\b/.test(value)) {
    if (/\b(supplier|suppliers|msambazaji|wasambazaji)\b/.test(value)) return /\b(most|highest|top|zaidi)\b/.test(value) ? "topPurchaseSupplier" : "unsupported";
    return "purchases";
  }
  if (/\b(returns?|returned|refunds?|refunded|marejesho|rejesho|rejeshwa)\b/.test(value)) return "returns";
  if (/\b(credit sales?|sales? (?:on|by) credit|mauzo ya mkopo|mauzo kwa mkopo)\b/.test(value)) return "creditSales";
  if (/\b(who owes|which debts? (?:are |is )?overdue|overdue debts?|wateja gani.*(?:deni|madeni)|madeni.*(?:yamechelewa|yaliyochelewa))\b/.test(value)) return "debts";
  // Rankings and individual record lookups need their own queries; a topic
  // summary would look like an answer but could mislead the merchant.
  if (/\b(best.sell(?:ing|er)?|top.sell(?:ing|er)?|most sold|sold (?:the )?most|most profitable|highest selling|top products?|best products?|best customers?|top customers?|customers?|mteja|wateja|debt (?:for|of|from)|deni la|bei gani|bidhaa (?:inayouzwa|inayouza|iliyotumika|iliyouzwa) zaidi)\b/i.test(value)) return "unsupported";
  const matches = [];
  if (/\b(stock|inventory|restock(?:ing)?|reorder(?:ing)?|run out|bidhaa|hifadhi|agiza|kuisha|kuagiza)\b/.test(value)) matches.push("inventory");
  if (/\b(debt|debts|owed|collection|madeni|deni|dai|nadaiwa|tunaidaiwa|tunaidai)\b/.test(value)) matches.push("debts");
  if (/\b(gross profit|net profit|profit margin|profit|profits|faida|cogs|cost of goods sold|gharama ya bidhaa zilizouzwa)\b/.test(value)) matches.push("profit");
  if (/\b(expense|expenses|cost|costs|spending|gharama|matumizi|nimetumia|tulilipa)\b/.test(value)) matches.push("expenses");
  if (/\b(farm|crop|harvest|livestock|shamba|mazao|mavuno|ufugaji)\b/.test(value)) matches.push("farm");
  if (/\b(sale|sales|revenue|cash collected|money collected|mauzo|mapato|nimeuza|tumeuza|tuliuza)\b/.test(value)) matches.push("salesToday");
  if (matches.includes("profit")) {
    const other = matches.filter((item) => !["profit", "expenses", "salesToday"].includes(item) && !(item === "inventory" && /gharama ya bidhaa zilizouzwa/.test(value)));
    return other.length ? "ambiguous" : "profit";
  }
  if (matches.length > 1) return "ambiguous";
  if (matches.length === 1) return matches[0];
  if (/\b(what should i do|what should we do|what next|next action|nifanye nini|tufanye nini|hatua inayofuata)\b/.test(value)) return "overview";
  return "unsupported";
}

const productOptions = asyncHandler(async (req, res) => {
  if (!permissionsFor(req.user).reports) return res.status(403).json({ error: "Report access is required" });
  const shopId = await getShopIdForUser(req.user);
  const search = String(req.query.search || "").trim().slice(0, 80);
  if (search.length < 2) return res.json({ products: [] });
  const products = await prisma.product.findMany({ where: { shopId, OR: [{ name: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }] }, select: { id: true, name: true, sku: true, unit: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 20 });
  return res.json({ products });
});

const supplierOptions = asyncHandler(async (req, res) => {
  const p = permissionsFor(req.user);
  if (!p.reports || !p.stock) return res.status(403).json({ error: "Stock and report access are required" });
  const shopId = await getShopIdForUser(req.user);
  const search = String(req.query.search || "").trim().slice(0, 80);
  if (search.length < 2) return res.json({ suppliers: [] });
  const suppliers = await prisma.supplier.findMany({ where: { name: { contains: search, mode: "insensitive" }, stockReceipts: { some: { shopId } } }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 20 });
  return res.json({ suppliers });
});

const operationalOptions = asyncHandler(async (req, res) => {
  const kind = String(req.query.kind || "");
  const search = String(req.query.search || "").trim().slice(0, 80);
  const p = permissionsFor(req.user);
  if (!["crop", "group", "input"].includes(kind)) return res.status(400).json({ error: "Choose a valid record type" });
  const shopId = await getShopIdForUser(req.user);
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { category: true } });
  const category = String(shop?.category || "").toLowerCase();
  const farm = ["farm", "livestock"].includes(category);
  const food = ["bar", "restaurant"].includes(category);
  if ((kind === "input" && !((farm && p.farm) || (food && p.stock))) || (kind !== "input" && !(farm && p.farm))) return res.status(403).json({ error: "Access to those records is required" });
  if (search.length < 2) return res.json({ items: [] });
  let items;
  if (kind === "crop") {
    const cycles = await prisma.cropCycle.findMany({ where: { shopId, OR: [{ cropName: { contains: search, mode: "insensitive" } }, { plot: { name: { contains: search, mode: "insensitive" } } }] }, select: { id: true, cropName: true, plot: { select: { name: true } }, plantedAt: true }, orderBy: [{ plantedAt: "desc" }, { id: "asc" }], take: 20 });
    items = cycles.map((row) => ({ id: row.id, name: `${row.cropName} · ${row.plot.name} · ${tanzaniaDateKey(row.plantedAt)}` }));
  } else if (kind === "group") {
    items = await prisma.farmGroup.findMany({ where: { shopId, name: { contains: search, mode: "insensitive" } }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 20 });
  } else {
    items = await prisma.product.findMany({ where: { shopId, isActive: true, name: { contains: search, mode: "insensitive" } }, select: { id: true, name: true, unit: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 20 });
  }
  return res.json({ items });
});

async function answerProductQuestion(req, intent, window, lang) {
  const sw = lang === "sw";
  const privacy = sw ? "Jibu limetumia rekodi za DukaPilot pekee; hakuna huduma ya AI ya nje iliyotumika." : "This answer used DukaPilot records only; no external AI service was called.";
  if (!permissionsFor(req.user).reports) return { message: sw ? "Akaunti hii haina ruhusa ya kuona uchanganuzi wa bidhaa." : "This account does not have permission to view product analytics.", href: "/assistant", evidence: [], privacy };
  if (intent === "slowProducts") {
    const shopId = await getShopIdForUser(req.user);
    const since = new Date(Date.now() - 30 * DAY_MS);
    const products = await prisma.product.findMany({ where: { shopId, isActive: true, isInternalUse: false, currentStock: { gt: 0 }, saleItems: { none: { sale: { shopId, status: "COMPLETED", createdAt: { gte: since } } } } }, select: { name: true, unit: true, currentStock: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 5 });
    const items = products.map((product) => `${product.name}: ${product.currentStock} ${product.unit}`).join("; ");
    const message = items ? (sw ? `Bidhaa zenye stock bila mauzo yaliyokamilika katika siku 30 zilizopita (hadi 5): ${items}. Hii inategemea mauzo yaliyorekodiwa tu.` : `In-stock products without a completed sale in the last 30 days (up to 5): ${items}. This depends on recorded sales only.`) : (sw ? "Hakuna bidhaa yenye stock bila mauzo yaliyokamilika katika siku 30 zilizopita iliyopatikana." : "No in-stock products without a completed sale in the last 30 days were found.");
    return { message, href: "/analytics/products", evidence: [{ source: sw ? "Bidhaa na mauzo" : "Products and sales", checkedAt: new Date().toISOString(), dataThrough: null }], privacy };
  }
  const productId = intent === "productDetail" ? String(req.body?.productId || "").trim().slice(0, 100) : null;
  if (intent === "productDetail" && !productId) return { message: sw ? "Chagua bidhaa kwenye orodha ya kutafuta bidhaa kisha uliza tena." : "Select a product from the product search, then ask again.", href: "/assistant", evidence: [], privacy };
  const requestedMetric = String(req.body?.metric || "").toLowerCase();
  if (requestedMetric && !["units", "revenue", "profit"].includes(requestedMetric)) return { message: sw ? "Chagua kipimo sahihi cha bidhaa." : "Choose a valid product metric.", href: "/assistant", evidence: [], privacy };
  const question = String(req.body.question || "").toLowerCase();
  const explicitMetric = /\b(profit|profitable|faida)\b/.test(question) ? "profit" : /\b(revenue|value|mapato|thamani)\b/.test(question) ? "revenue" : /\b(units|quantity|quantities|vitengo)\b/.test(question) ? "units" : "";
  const metric = explicitMetric || requestedMetric || "units";
  const shopId = await getShopIdForUser(req.user);
  const products = await productInsights(shopId, window.from, window.to, metric, productId);
  const period = `${localizedPeriod(window.label, sw)} (${window.fromDate} ${sw ? "hadi" : "to"} ${window.toDate})`;
  const evidence = [{ source: sw ? `Bidhaa (${period})` : `Products (${period})`, checkedAt: new Date().toISOString(), dataThrough: null }];
  if (intent === "productDetail" && !products.length) return { message: sw ? "Bidhaa haipatikani katika duka hili. Chagua nyingine." : "That product is unavailable in this shop. Select another product.", href: "/assistant", evidence: [], privacy };
  if (!products.length) return { message: sw ? `Hakuna bidhaa zilizounganishwa na mauzo au marejesho ${period}.` : `No linked products had recorded sales or returns ${period}.`, href: "/analytics/products", evidence, privacy };
  if (metric === "profit" && products[0].incompleteProducts > 0 && intent === "productRanking") return { message: sw ? "Baadhi ya gharama hazijakamilika; siwezi kupanga bidhaa zote kwa faida kwa uhakika. Tumia vitengo au mapato, na kagua gharama." : "Some product costs are missing, so a complete profit ranking is not reliable. Rank by units or revenue and review missing costs.", href: "/analytics/products", evidence, privacy };
  const format = (product) => `${product.name}: ${product.units.toLocaleString("en-TZ")} ${product.unit}, TZS ${product.revenue.toLocaleString("en-TZ")} ${sw ? "mapato" : "revenue"}${metric === "profit" || intent === "productDetail" ? `, TZS ${product.profit.toLocaleString("en-TZ")} ${sw ? "faida ghafi inayojulikana" : "known-cost gross profit"}` : ""}${product.missing !== 0 ? (sw ? " (baadhi ya gharama hazipo)" : " (some costs missing)") : ""}`;
  const metricLabel = ({ units: sw ? "vitengo" : "units", revenue: sw ? "mapato" : "revenue", profit: sw ? "faida ghafi" : "gross profit" })[metric];
  const message = intent === "productDetail" ? `${period}: ${format(products[0])}. ${sw ? "Mauzo na marejesho ni ya kipindi kilichochaguliwa." : "Sales and returns are counted in the period when recorded."}` : `${sw ? "Bidhaa za juu kwa" : "Top linked products by"} ${metricLabel} ${period}: ${products.map(format).join("; ")}. ${sw ? "Marejesho na masahihisho yanahesabiwa kwa tarehe yalivyorekodiwa; bidhaa zisizounganishwa hazijumuishwi." : "Returns and reversals are counted when recorded; unlinked items are excluded."}`;
  return { message, href: intent === "productDetail" ? `/analytics/products?search=${encodeURIComponent(products[0].name)}` : "/analytics/products", evidence, privacy };
}

async function answerBusinessQuestion(req, intent, window, lang) {
  const sw = lang === "sw";
  const p = permissionsFor(req.user);
  const allowed = ["supplierBalance", "supplierCreditsOwed", "supplierRefunds"].includes(intent) ? p.reports && p.stock
    : intent === "debtCollections" ? p.reports && p.debts
      : intent === "teamShifts" ? !isStaff(req.user) || Boolean(req.user.permissions?.canManageCashSessions)
        : intent === "branchComparison" ? !isStaff(req.user)
          : ["foodProduction", "foodInput"].includes(intent) ? p.stock : p.farm;
  const privacy = sw ? "Jibu limetumia rekodi za DukaPilot pekee; hakuna huduma ya AI ya nje iliyotumika." : "This answer used DukaPilot records only; no external AI service was called.";
  if (!allowed) return { message: sw ? "Akaunti hii haina ruhusa ya kuona taarifa hizo." : "This account does not have permission to view those records.", href: "/assistant", evidence: [], privacy };
  const shopId = await getShopIdForUser(req.user);
  const checkedAt = new Date().toISOString();
  const period = window ? `${localizedPeriod(window.label, sw)} (${window.fromDate} ${sw ? "hadi" : "to"} ${window.toDate})` : "";
  let href = "/assistant";
  let message;
  let source;
  if (intent === "supplierBalance" || intent === "supplierCreditsOwed") {
    const id = String(req.body?.supplierId || "").trim().slice(0, 100) || null;
    if (!id && /\b(supplier|msambazaji)\b/i.test(req.body.question || "") && !/\b(which|all|list|suppliers|wasambazaji|gani|orodha)\b/i.test(req.body.question || "")) return { message: sw ? "Chagua msambazaji kisha uliza tena." : "Select a supplier, then ask again.", href, evidence: [], privacy };
    const rows = await supplierBalances(shopId, id, undefined, intent === "supplierCreditsOwed");
    const details = rows.map((item) => `${item.name}: TZS ${item.balance.toLocaleString("en-TZ")} (${sw ? "risiti zaidi ya siku 30" : "receipts older than 30 days"}: TZS ${item.olderThan30.toLocaleString("en-TZ")})`).join("; ");
    if (intent === "supplierCreditsOwed") message = rows.length ? (sw ? `Salio hasi la sasa (hadi 5): ${details}. Hili linaweza kutumika kama mkopo au kurejeshwa; mfumo hauwezi kuthibitisha ni rejesho gani linalosubiri kuhamishwa.` : `Current negative supplier balances (up to 5): ${details}. These may be credit or refundable funds; the records do not establish which refunds are awaiting external transfer.`) : (sw ? "Hakuna salio hasi la msambazaji lililopatikana. Mfumo hauwezi kuthibitisha rejesho la nje linalosubiri." : "No negative supplier balances were found. Pending external refunds cannot be verified from these records.");
    else message = rows.length ? (sw ? `Salio la sasa la wasambazaji (hadi 5): ${details}. Umri wa risiti si tarehe ya malipo; salio hasi ni fedha au mkopo unaodaiwa na biashara.` : `Current supplier balances (up to 5): ${details}. Receipt age is not a payment due date; a negative balance is credit or money owed to the business.`) : (sw ? "Hakuna salio la msambazaji lililopatikana katika biashara hii." : "No matching supplier balance was found in this business.");
    href = "/supplier-balances"; source = sw ? "Madeni ya wasambazaji" : "Supplier balances";
  } else if (intent === "supplierRefunds") {
    const supplierId = String(req.body?.supplierId || "").trim().slice(0, 100);
    const selected = supplierId ? await prisma.supplier.findFirst({ where: { id: supplierId, stockReceipts: { some: { shopId } } }, select: { name: true } }) : null;
    if (supplierId && !selected) return { message: sw ? "Msambazaji huyo hapatikani katika biashara hii." : "That supplier is unavailable in this business.", href, evidence: [], privacy };
    const result = await prisma.supplierPayment.aggregate({ where: { shopId, ...(supplierId ? { supplierId } : {}), kind: "REFUND", paidAt: { gte: window.from, lt: window.to } }, _sum: { amount: true }, _count: { id: true } });
    const amount = -Number(result._sum.amount || 0);
    message = sw ? `${period}: marejesho ya fedha kutoka ${selected ? selected.name : "kwa wasambazaji wote"} baada ya masahihisho ni TZS ${amount.toLocaleString("en-TZ")}. Hii ni rekodi ya fedha, si uthibitisho wa uhamisho wa nje au mikopo inayosubiri.` : `${period}: recorded refunds from ${selected ? selected.name : "all suppliers"}, net of reversals, total TZS ${amount.toLocaleString("en-TZ")}. This is a recorded settlement, not verification of an external transfer or a total of pending credits.`;
    href = "/supplier-balances"; source = sw ? "Malipo ya wasambazaji" : "Supplier settlements";
  } else if (intent === "debtCollections") {
    const result = await debtCollections(shopId, window.from, window.to);
    message = sw ? `${period}: malipo ${result.count} yaliyotumika kwenye madeni yaliyorekodiwa ni TZS ${result.amount.toLocaleString("en-TZ")}. Malipo ya nukuu kabla ya kuwa deni hayajumuishwi; hii si mauzo mapya.` : `${period}: ${result.count} payments applied to recorded debts total TZS ${result.amount.toLocaleString("en-TZ")}. Quotation payments before a debt existed are excluded; this is not new sales revenue.`;
    href = "/debts"; source = sw ? "Malipo ya madeni" : "Debt payments";
  } else if (intent === "teamShifts") {
    const sessions = await prisma.cashSession.findMany({ where: { shopId, status: "CLOSED", closedAt: { gte: window.from, lt: window.to }, variance: { not: 0 } }, select: { openedByName: true, closedAt: true, variance: true }, orderBy: [{ closedAt: "desc" }, { id: "desc" }], take: 5 });
    const rows = sessions.map((item) => `${item.openedByName}: TZS ${Number(item.variance).toLocaleString("en-TZ")} (${tanzaniaDateKey(item.closedAt)})`).join("; ");
    message = rows ? (sw ? `Zamu zilizofungwa zenye tofauti ${period} (hadi 5): ${rows}. Tofauti ni cash iliyohesabiwa pungufu au zaidi ya iliyotarajiwa.` : `Closed shifts with a cash difference ${period} (up to 5): ${rows}. The difference is counted cash minus expected cash.`) : (sw ? `Hakuna zamu iliyofungwa yenye tofauti iliyopatikana ${period}.` : `No closed shifts with a recorded difference were found ${period}.`);
    href = "/daily-close"; source = sw ? "Zamu zilizofungwa" : "Closed shifts";
  } else if (intent === "branchComparison") {
    const data = await invoke(branchOverview, req, { from: window.fromDate, to: window.toDate });
    const rows = (data.branches || []).slice().sort((a, b) => Number(b.sales) - Number(a.sales)).slice(0, 5);
    message = rows.length ? (sw ? `Mauzo kabla ya marejesho ${period} (matawi 5 ya kwanza): ${rows.map((r) => `${r.name}: TZS ${Number(r.sales).toLocaleString("en-TZ")}`).join("; ")}. Fungua Matawi kwa ulinganisho kamili.` : `Gross sales before returns ${period} (top 5 locations): ${rows.map((r) => `${r.name}: TZS ${Number(r.sales).toLocaleString("en-TZ")}`).join("; ")}. Open Branches for the full comparison.`) : (sw ? "Hakuna matawi yaliyopatikana." : "No locations were found.");
    href = "/branches"; source = sw ? "Ripoti ya matawi" : "Branch report";
  } else if (intent === "foodProduction" || intent === "foodInput") {
    const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { category: true } });
    if (!["bar", "restaurant"].includes(String(shop?.category || "").toLowerCase())) return { message: sw ? "Taarifa hii inapatikana kwa baa na mikahawa inayotumia maandalizi ya chakula." : "This answer is available for bar and restaurant food preparation records.", href, evidence: [], privacy };
    if (intent === "foodInput") {
      const id = String(req.body?.operationalRecordId || "").trim().slice(0, 100);
      if (!id) return { message: sw ? "Chagua kiungo kisha uliza tena." : "Select an ingredient, then ask again.", href, evidence: [], privacy };
      const product = await prisma.product.findFirst({ where: { id, shopId }, select: { name: true, unit: true } });
      if (!product) return { message: sw ? "Kiungo hicho hakipatikani katika duka hili." : "That ingredient is unavailable in this shop.", href, evidence: [], privacy };
      const rows = await prisma.foodPreparationItem.aggregate({ where: { productId: id, foodPreparation: { shopId, preparedAt: { gte: window.from, lt: window.to } } }, _sum: { quantity: true, ...(p.reports ? { totalCost: true } : {}) }, _count: { id: true } });
      const quantity = Number(rows._sum.quantity || 0);
      message = sw ? `${period}: ${product.name} iliyotumika katika maandalizi yaliyorekodiwa ni ${quantity} ${product.unit}${p.reports ? `, gharama iliyorekodiwa TZS ${Number(rows._sum.totalCost || 0).toLocaleString("en-TZ")}` : ""}.` : `${period}: recorded preparation used ${quantity} ${product.unit} of ${product.name}${p.reports ? `, with recorded cost TZS ${Number(rows._sum.totalCost || 0).toLocaleString("en-TZ")}` : ""}.`;
    } else {
      const batches = await prisma.foodPreparationBatch.findMany({ where: { shopId, preparedAt: { gte: window.from, lt: window.to } }, select: { actualYield: true, wasteQuantity: true, preparedAt: true, outputProduct: { select: { name: true, unit: true } } }, orderBy: [{ preparedAt: "desc" }, { id: "desc" }], take: 5 });
      const items = batches.map((item) => `${item.outputProduct.name}: ${item.actualYield} ${item.outputProduct.unit} (${tanzaniaDateKey(item.preparedAt)})`).join("; ");
      message = items ? (sw ? `Maandalizi yaliyorekodiwa ${period} (batch 5 za hivi karibuni): ${items}.` : `Recorded preparations ${period} (up to 5 recent batches): ${items}.`) : (sw ? `Hakuna maandalizi yaliyorekodiwa ${period}.` : `No food preparation was recorded ${period}.`);
    }
    href = "/food-preparation"; source = sw ? "Maandalizi ya chakula" : "Food preparation";
  } else {
    const config = await getFarmConfiguration(shopId);
    if (!config?.isFarm || (["cropTasks", "cropDetail"].includes(intent) && !config.hasCrops) || (["eggProduction", "eggStock", "livestockGroup", "farmInput"].includes(intent) && !config.hasLivestock)) return { message: sw ? "Shughuli hiyo haijawashwa kwa biashara hii." : "That farm operation is not enabled for this business.", href, evidence: [], privacy };
    if (intent === "cropTasks") {
      const tasks = await prisma.cropFieldTask.findMany({ where: { shopId, status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { lt: startOfTanzaniaDay() } }, select: { title: true, dueAt: true }, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: 5 });
      const items = tasks.map((task) => `${task.title} (${tanzaniaDateKey(task.dueAt)})`).join("; ");
      message = items ? (sw ? `Kazi za shamba zilizochelewa (hadi 5): ${items}.` : `Overdue crop tasks (up to 5): ${items}.`) : (sw ? "Hakuna kazi ya shamba iliyochelewa iliyorekodiwa." : "No overdue crop tasks are recorded.");
      href = "/crops/operations"; source = sw ? "Kazi za shamba" : "Crop tasks";
    } else if (intent === "livestockGroup") {
      const id = String(req.body?.operationalRecordId || "").trim().slice(0, 100);
      if (!id) return { message: sw ? "Chagua kundi la mifugo kisha uliza tena." : "Select an animal group, then ask again.", href, evidence: [], privacy };
      const group = await prisma.farmGroup.findFirst({ where: { id, shopId }, select: { name: true, currentAnimals: true, events: { where: { voidedAt: null }, select: { type: true, quantity: true, occurredAt: true }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 5 } } });
      if (!group) return { message: sw ? "Kundi hilo halipatikani katika shamba hili." : "That group is unavailable in this farm.", href, evidence: [], privacy };
      const eventLabels = sw ? { OPENING: "Mwanzo", ADDITION: "Walioongezwa", MORTALITY: "Vifo", CULL: "Walioondolewa", SALE: "Waliozwa", RETURN_REVERSAL: "Marekebisho ya rejesho" } : { OPENING: "Opening", ADDITION: "Added", MORTALITY: "Deaths", CULL: "Culled", SALE: "Sold", RETURN_REVERSAL: "Return correction" };
      const events = group.events.map((event) => `${eventLabels[event.type] || event.type}: ${event.quantity} (${tanzaniaDateKey(event.occurredAt)})`).join("; ");
      message = sw ? `${group.name}: wanyama ${group.currentAnimals} kwa sasa. ${events ? `Matukio 5 ya karibuni: ${events}.` : "Hakuna matukio yaliyorekodiwa."}` : `${group.name}: ${group.currentAnimals} animals currently recorded. ${events ? `Up to 5 recent events: ${events}.` : "No events are recorded."}`;
      href = "/farm"; source = sw ? "Kundi la mifugo" : "Animal group";
    } else if (intent === "eggStock") {
      const id = String(req.body?.operationalRecordId || "").trim().slice(0, 100);
      if (!id) return { message: sw ? "Chagua bidhaa ya mayai au trei kisha uliza tena." : "Select an egg or tray product, then ask again.", href, evidence: [], privacy };
      const product = await prisma.product.findFirst({ where: { id, shopId, isActive: true }, select: { name: true, unit: true, currentStock: true } });
      if (!product) return { message: sw ? "Bidhaa hiyo haipatikani katika shamba hili." : "That product is unavailable in this farm.", href, evidence: [], privacy };
      message = sw ? `Stock ya sasa ya ${product.name}: ${Number(product.currentStock).toLocaleString("en-TZ", { maximumFractionDigits: 3 })} ${product.unit}. Chagua bidhaa nyingine kuona salio lake.` : `Current stock of ${product.name}: ${Number(product.currentStock).toLocaleString("en-TZ", { maximumFractionDigits: 3 })} ${product.unit}. Select another product to see its balance.`;
      href = "/farm"; source = sw ? "Stock ya shamba" : "Farm stock";
    } else if (intent === "farmInput") {
      const id = String(req.body?.operationalRecordId || "").trim().slice(0, 100);
      if (!id) return { message: sw ? "Chagua chakula au pembejeo kisha uliza tena." : "Select a feed or input product, then ask again.", href, evidence: [], privacy };
      const product = await prisma.product.findFirst({ where: { id, shopId }, select: { name: true, unit: true } });
      if (!product) return { message: sw ? "Pembejeo hiyo haipatikani katika shamba hili." : "That input is unavailable in this farm.", href, evidence: [], privacy };
      const rows = await prisma.farmProductionItem.aggregate({ where: { productId: id, farmProduction: { shopId, producedAt: { gte: window.from, lt: window.to } } }, _sum: { quantity: true, ...(p.reports ? { totalCost: true } : {}) } });
      const quantity = Number(rows._sum.quantity || 0).toLocaleString("en-TZ", { maximumFractionDigits: 3 });
      message = sw ? `${period}: ${product.name} iliyotumika kwenye uzalishaji uliorekodiwa ni ${quantity} ${product.unit}${p.reports ? `, gharama TZS ${Number(rows._sum.totalCost || 0).toLocaleString("en-TZ")}` : ""}.` : `${period}: recorded livestock production used ${quantity} ${product.unit} of ${product.name}${p.reports ? `, at recorded cost TZS ${Number(rows._sum.totalCost || 0).toLocaleString("en-TZ")}` : ""}.`;
      href = "/farm"; source = sw ? "Pembejeo za ufugaji" : "Livestock production inputs";
    } else if (intent === "cropDetail") {
      const id = String(req.body?.operationalRecordId || "").trim().slice(0, 100);
      if (!id) return { message: sw ? "Chagua mzunguko wa mazao kisha uliza tena." : "Select a crop cycle, then ask again.", href, evidence: [], privacy };
      const cycle = await prisma.cropCycle.findFirst({ where: { id, shopId }, select: { id: true, cropName: true, plot: { select: { name: true } }, ...(p.reports ? { unrecoveredCost: true } : {}) } });
      if (!cycle) return { message: sw ? "Mzunguko huo haupatikani katika shamba hili." : "That cycle is unavailable in this farm.", href, evidence: [], privacy };
      const [inputs, inputTotal, harvests] = await Promise.all([
        prisma.cropInputUsage.findMany({ where: { shopId, cropCycleId: id }, select: { title: true, quantity: true }, orderBy: [{ usedAt: "desc" }, { id: "desc" }], take: 5 }),
        p.reports ? prisma.cropInputUsage.aggregate({ where: { shopId, cropCycleId: id }, _sum: { totalCost: true } }) : Promise.resolve(null),
        prisma.cropHarvestBatch.groupBy({ by: ["outputProductId"], where: { shopId, cropCycleId: id }, _sum: { actualYield: true, remainingQuantity: true, wasteQuantity: true, ...(p.reports ? { realizedRevenue: true, realizedCost: true } : {}) }, orderBy: { outputProductId: "asc" } }),
      ]);
      const products = await prisma.product.findMany({ where: { shopId, id: { in: harvests.map((item) => item.outputProductId) } }, select: { id: true, name: true, unit: true } });
      const outputs = harvests.slice(0, 5).map((item) => { const product = products.find((row) => row.id === item.outputProductId); return `${product?.name || "Product"}: ${Number(item._sum.actualYield || 0)} ${product?.unit || ""}, ${sw ? "imebaki" : "remaining"} ${Number(item._sum.remainingQuantity || 0)}`; }).join("; ");
      const inputText = inputs.map((item) => item.title).join(", ");
      const revenue = harvests.reduce((sum, item) => sum + Number(item._sum.realizedRevenue || 0), 0);
      const cost = harvests.reduce((sum, item) => sum + Number(item._sum.realizedCost || 0), 0);
      const financials = p.reports ? (sw ? ` Gharama za pembejeo TZS ${Number(inputTotal?._sum.totalCost || 0).toLocaleString("en-TZ")}; mapato yaliyotimia TZS ${revenue.toLocaleString("en-TZ")}; faida iliyotimia TZS ${(revenue - cost - Number(cycle.unrecoveredCost || 0)).toLocaleString("en-TZ")}.` : ` Input costs TZS ${Number(inputTotal?._sum.totalCost || 0).toLocaleString("en-TZ")}; realized revenue TZS ${revenue.toLocaleString("en-TZ")}; realized profit TZS ${(revenue - cost - Number(cycle.unrecoveredCost || 0)).toLocaleString("en-TZ")}.`) : "";
      message = sw ? `${cycle.cropName}, ${cycle.plot.name}, mzunguko mzima. Pembejeo za karibuni: ${inputText || "hakuna"}. Mavuno: ${outputs || "hakuna"}.${financials}` : `${cycle.cropName}, ${cycle.plot.name}, whole cycle. Recent inputs: ${inputText || "none"}. Harvest: ${outputs || "none"}.${financials}`;
      href = "/crops"; source = sw ? "Mzunguko wa mazao" : "Crop cycle";
    } else {
      const rows = await prisma.farmProductionBatch.aggregate({ where: { shopId, type: "EGGS", producedAt: { gte: window.from, lt: window.to } }, _sum: { actualYield: true, brokenQuantity: true }, _count: { id: true } });
      const collected = Number(rows._sum.actualYield || 0); const broken = Number(rows._sum.brokenQuantity || 0);
      message = sw ? `${period}: batch ${rows._count.id} zilirekodi mayai ${collected}, yaliyovunjika ${broken}, na mazuri ${collected - broken}. Tray na mayai yaliyobaki kwenye stock yanaweza kutofautiana kutokana na kufunga na mauzo.` : `${period}: ${rows._count.id} batches recorded ${collected} eggs collected, ${broken} broken, and ${collected - broken} good eggs. Current trays and loose-egg stock may differ because of packing and sales.`;
      href = "/farm"; source = sw ? "Uzalishaji wa mayai" : "Egg production";
    }
  }
  return { message, href, evidence: [{ source, checkedAt, dataThrough: null }], privacy };
}

const FOLLOW_UP_TOPICS = new Set(["salesToday", "profit", "expenses", "purchases", "returns", "creditSales"]);
function isPeriodFollowUp(question) {
  return /^(?:(?:and|what about|how about|na|je)\s+)?(?:today|yesterday|this week|last week|this month|last month|this quarter|last quarter|this year|last year|the last 7 days|leo|jana|wiki hii|wiki iliyopita|mwezi huu|mwezi uliopita|robo hii|robo iliyopita|mwaka huu|mwaka uliopita)\s*[?.!]*$/i.test(question.trim());
}

function contextSignature(payload, scope, secret) {
  return crypto.createHmac("sha256", secret).update(`dukapilot-ask-context-v1\n${payload}\n${JSON.stringify(scope)}`).digest("hex");
}

async function createFollowUpContext(req, intent) {
  if (!FOLLOW_UP_TOPICS.has(intent) || !process.env.JWT_SECRET || !req.user?.userId) return null;
  const scope = [await getShopIdForUser(req.user), req.user.userId, req.user.staffId || null];
  const payload = Buffer.from(JSON.stringify({ topic: intent, createdAt: Date.now() })).toString("base64url");
  return `${payload}.${contextSignature(payload, scope, process.env.JWT_SECRET)}`;
}

async function readFollowUpContext(req, token) {
  if (!process.env.JWT_SECRET || !req.user?.userId || typeof token !== "string" || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return null;
  const scope = [await getShopIdForUser(req.user), req.user.userId, req.user.staffId || null];
  const expected = Buffer.from(contextSignature(parts[0], scope, process.env.JWT_SECRET), "hex");
  const received = Buffer.from(parts[1], "hex");
  if (!crypto.timingSafeEqual(expected, received)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!FOLLOW_UP_TOPICS.has(data.topic) || !Number.isFinite(data.createdAt) || data.createdAt > Date.now() || Date.now() - data.createdAt > 30 * 60 * 1000) return null;
    return data.topic;
  } catch { return null; }
}

async function answerOperationalQuestion(req, intent, window, lang) {
  const sw = lang === "sw";
  const permissions = permissionsFor(req.user);
  const allowed = intent === "cashSession" ? permissions.cashSession
    : ["expiry", "expiredStock"].includes(intent) ? permissions.stock
    : intent === "scheduledExpenses" ? permissions.reports && permissions.expenses
      : intent === "quotations" ? permissions.quotations
      : ["purchases", "topPurchaseSupplier"].includes(intent) ? permissions.reports && permissions.stock
          : permissions.reports;
  const href = ({ cashSession: "/daily-close", expiry: "/inventory", expiredStock: "/inventory", scheduledExpenses: "/expenses", quotations: "/quotations", purchases: "/analytics/purchases", topPurchaseSupplier: "/analytics/purchases", returns: "/analytics", creditSales: "/analytics" })[intent];
  const privacy = sw ? "Jibu limetumia rekodi za DukaPilot pekee; hakuna huduma ya AI ya nje iliyotumika." : "This answer used DukaPilot records only; no external AI service was called.";
  if (!allowed) return { message: sw ? "Akaunti hii haina ruhusa ya kuona taarifa hizo. Muombe mmiliki aangalie ruhusa zako." : "This account does not have permission to view those records. Ask the owner to review your access.", href: "/assistant", evidence: [], privacy };
  const shopId = await getShopIdForUser(req.user);
  const checkedAt = new Date().toISOString();
  let message;
  let source;
  if (intent === "cashSession") {
    const data = await invoke(currentCashSession, req);
    const session = data.session;
    message = session ? (sw ? `Zamu yako iko wazi. Cash inayotarajiwa kwenye droo ni TZS ${Number(session.summary.expectedCash).toLocaleString("en-TZ")}; hesabu fedha halisi kabla ya kufunga. Kiasi hiki si jumla ya mauzo yote.` : `Your shift is open. Expected cash in your drawer is TZS ${Number(session.summary.expectedCash).toLocaleString("en-TZ")}; count the actual cash before closing. This is not total sales.`) : (sw ? "Huna zamu ya cash iliyo wazi kwa akaunti hii." : "This account has no open cash shift.");
    source = sw ? "Zamu yako" : "Your cash shift";
  } else if (intent === "expiry" || intent === "expiredStock") {
    const start = startOfTanzaniaDay();
    const end = new Date(start.getTime() + 31 * DAY_MS);
    const products = await prisma.product.findMany({ where: { shopId, isActive: true, doesNotExpire: false, expiryDate: intent === "expiredStock" ? { lt: start } : { gte: start, lt: end } }, select: { name: true, expiryDate: true }, orderBy: [{ expiryDate: "asc" }, { id: "asc" }], take: 5 });
    const items = products.map((item) => `${item.name} (${tanzaniaDateKey(item.expiryDate)})`).join(", ");
    if (intent === "expiredStock") message = products.length ? (sw ? `Bidhaa zenye tarehe iliyoisha (za kwanza ${products.length}): ${items}. Kagua kila batch.` : `Products with a recorded past expiry date (first ${products.length}): ${items}. Check individual batches.`) : (sw ? "Hakuna bidhaa yenye tarehe iliyorekodiwa kuwa imeisha." : "No products have a recorded past expiry date.");
    else message = products.length ? (sw ? `Bidhaa zinazoisha muda katika siku 30 zijazo (za kwanza ${products.length}): ${items}. Tarehe hizi zinategemea rekodi za bidhaa, si kila batch.` : `Products expiring in the next 30 days (first ${products.length}): ${items}. Dates are product records, not necessarily individual batches.`) : (sw ? "Hakuna bidhaa yenye tarehe iliyorekodiwa ndani ya siku 30 zijazo. Bidhaa bila tarehe haziwezi kukaguliwa." : "No products have a recorded expiry in the next 30 days. Products without an expiry date cannot be checked.");
    source = sw ? "Tarehe za bidhaa" : "Product expiry dates";
  } else if (intent === "scheduledExpenses") {
    const end = new Date(startOfTanzaniaDay().getTime() + 31 * DAY_MS);
    const schedules = await prisma.recurringExpense.findMany({ where: { shopId, isActive: true, nextDueAt: { lt: end } }, select: { title: true, amount: true, nextDueAt: true }, orderBy: [{ nextDueAt: "asc" }, { id: "asc" }], take: 5 });
    const items = schedules.map((item) => `${item.title}: TZS ${Number(item.amount).toLocaleString("en-TZ")} (${tanzaniaDateKey(item.nextDueAt)})`).join(", ");
    message = schedules.length ? (sw ? `Ratiba zilizochelewa au zinazotarajiwa ndani ya siku 30 (za kwanza ${schedules.length}): ${items}. Hizi ni vikumbusho, si malipo yaliyothibitishwa.` : `Overdue or due in the next 30 days (first ${schedules.length}): ${items}. These are reminders, not confirmed payments.`) : (sw ? "Hakuna ratiba iliyochelewa au inayotarajiwa ndani ya siku 30 zijazo." : "No schedules are overdue or due in the next 30 days.");
    source = sw ? "Ratiba za matumizi" : "Expense schedules";
  } else if (intent === "quotations") {
    const data = await invoke(quotationSummary, req);
    const titles = (data.actions || []).slice(0, 3).map((item) => item.title).join("; ");
    message = titles ? (sw ? `Hatua za nukuu za kukagua: ${titles}. Nukuu si mauzo mpaka ibadilishwe.` : `Quotation actions to review: ${titles}. A quotation is not a sale until converted.`) : (sw ? "Hakuna hatua ya nukuu iliyopatikana kwenye rekodi zilizokaguliwa." : "No quotation follow-up action was found in the records checked.");
    source = sw ? "Nukuu" : "Quotations";
  } else if (intent === "purchases" || intent === "topPurchaseSupplier") {
    const data = await invoke(purchaseReport, req, { period: "custom", from: window.fromDate, to: window.toDate, page: "1", pageSize: "1" });
    const amount = Number(data.summary?.landedCost || 0).toLocaleString("en-TZ");
    const period = localizedPeriod(window.label, sw);
    if (intent === "topPurchaseSupplier") {
      const supplier = data.suppliers?.[0];
      message = supplier ? (sw ? `${period}: ${supplier.id === "__unassigned__" ? "Risiti bila msambazaji" : supplier.name} ina gharama kubwa zaidi ya stock iliyopokelewa, TZS ${Number(supplier.amount).toLocaleString("en-TZ")}. Hii ni kabla ya marejesho na mikopo; si kiasi kilicholipwa.` : `${period}: ${supplier.id === "__unassigned__" ? "Receipts without a supplier" : supplier.name} had the highest recorded received-stock landed cost, TZS ${Number(supplier.amount).toLocaleString("en-TZ")}. This is before returns and credits, not the amount paid.`) : (sw ? `Hakuna risiti za stock zilizopokelewa ${period}.` : `No stock receipts were recorded ${period}.`);
    } else message = sw ? `Stock iliyopokelewa ${period}: risiti ${data.summary.receiptCount}, gharama iliyorekodiwa TZS ${amount}, pamoja na gharama za usafiri na nyingine. Hiki si kiasi kilicholipwa wala matumizi ya uendeshaji; marejesho na mikopo ya wasambazaji huonyeshwa kando.` : `Stock received ${period}: ${data.summary.receiptCount} receipts, recorded landed cost TZS ${amount}, including transport and other costs. This is not the amount paid or an operating expense; supplier returns and credits are shown separately.`;
    source = sw ? "Ripoti ya manunuzi" : "Purchase analytics";
  } else {
    const data = await invoke(profitAnalytics, req, { period: "custom", from: window.fromDate, to: window.toDate });
    const period = localizedPeriod(window.label, sw);
    if (intent === "creditSales") {
      const credit = (data.salesPaymentBreakdown || []).find((item) => item.paymentMethod === "CREDIT");
      const count = Number(credit?.salesCount || 0);
      const amount = Number(credit?.amount || 0).toLocaleString("en-TZ");
      message = sw ? `${period}: mauzo ${count} yaliwekwa kwa njia ya mkopo, jumla TZS ${amount} kabla ya marejesho. Hii si fedha iliyokusanywa au salio la sasa la madeni.` : `${period}: ${count} sales were recorded with the credit payment method, totalling TZS ${amount} before returns. This is neither cash collected nor the current debt balance.`;
    } else {
      const summary = data.summary || {};
      const netReturns = Number(summary.salesReturns || 0) - Number(summary.salesReturnReversals || 0);
      const refunds = Number(summary.refunds || 0);
      const recovered = Number(summary.refundRecoveries || 0);
      message = sw ? `${period}: thamani ya marejesho baada ya masahihisho ni TZS ${netReturns.toLocaleString("en-TZ")}; fedha zilizorejeshwa ni TZS ${refunds.toLocaleString("en-TZ")} na zilizorejeshwa dukani baada ya masahihisho ni TZS ${recovered.toLocaleString("en-TZ")}. Thamani ya bidhaa si lazima iwe sawa na fedha iliyolipwa.` : `${period}: returned sale value after reversals is TZS ${netReturns.toLocaleString("en-TZ")}; refunds paid total TZS ${refunds.toLocaleString("en-TZ")}, and TZS ${recovered.toLocaleString("en-TZ")} was recovered on return reversals. Returned value is not necessarily cash paid.`;
    }
    source = sw ? "Uchanganuzi wa mauzo" : "Sales analytics";
  }
  return { message, href, evidence: [{ source, checkedAt, dataThrough: null }], privacy };
}

function askAnswer(intent, snapshot, lang, question = "") {
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
    else if (/\b(who owes|which debts? (?:are |is )?overdue|overdue debts?|wateja gani.*(?:deni|madeni)|madeni.*(?:yamechelewa|yaliyochelewa))\b/i.test(question)) {
      const overdue = /\b(overdue|yamechelewa|yaliyochelewa)\b/i.test(question);
      const list = (data.debts || []).filter((debt) => !overdue || (debt.dueDate && new Date(debt.dueDate) < startOfTanzaniaDay())).slice(0, 5);
      const items = list.map((debt) => `${debt.customerName || (sw ? "Mteja bila jina" : "Unnamed customer")}: TZS ${Math.max(0, Number(debt.amount) - Number(debt.amountPaid)).toLocaleString("en-TZ")}`).join("; ");
      message = list.length ? (sw ? `${overdue ? "Madeni yaliyochelewa" : "Madeni yaliyo wazi"} (rekodi za kwanza ${list.length}): ${items}. Fungua Madeni kwa orodha kamili.` : `${overdue ? "Overdue debts" : "Open debts"} (first ${list.length} records): ${items}. Open Debts for the complete list.`) : (sw ? "Hakuna rekodi ya deni inayolingana iliyopatikana." : "No matching debt records were found.");
      href = "/debts";
    } else {
      const oldest = data.debts?.[0];
      const ageDays = oldest ? Math.max(0, Math.floor((Date.now() - new Date(oldest.createdAt).getTime()) / DAY_MS)) : null;
      message = sw
        ? `Madeni ${data.summary.openCount} yako wazi, jumla ya salio TZS ${Number(data.summary.totalOwed).toLocaleString("en-TZ")}.${ageDays !== null ? ` Deni la kwanza kwa kipaumbele lina takriban siku ${ageDays} tangu lirekodiwe.` : ""} Hii ni salio lililorekodiwa, si uthibitisho wa malipo yaliyopokelewa.`
        : `${data.summary.openCount} debt records remain open, with TZS ${Number(data.summary.totalOwed).toLocaleString("en-TZ")} outstanding.${ageDays !== null ? ` The first prioritized debt was recorded about ${ageDays} days ago.` : ""} This is the recorded balance, not confirmation of cash received.`;
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
  let intent = detectIntent(question);
  if (intent === "unsupported" && isPeriodFollowUp(question)) intent = await readFollowUpContext(req, req.body?.contextToken) || "unsupported";
  const language = String(req.headers?.["x-dukapilot-language"] || req.user.language || "sw").toLowerCase() === "en" ? "en" : "sw";
  if (intent === "unsupported" || intent === "ambiguous") {
    const message = language === "sw"
      ? (intent === "ambiguous" ? "Swali hili lina mada zaidi ya moja. Tafadhali uliza mada moja kwa wakati." : "Bado siwezi kujibu swali hilo kwa usahihi.") + " Jaribu: 'Mauzo ya mwezi huu ni kiasi gani?', 'Matumizi ya leo ni kiasi gani?', au 'Ni bidhaa gani inahitaji kuagizwa?'"
      : (intent === "ambiguous" ? "That question has more than one topic. Please ask about one topic at a time." : "I cannot answer that question accurately yet.") + " Try: 'How much were sales this month?', 'What were today's expenses?', or 'Which product may need reordering?'";
    return res.json({ answer: { message, href: "/assistant", evidence: [], privacy: language === "sw" ? "Hakuna data ya biashara iliyotumika kwa jibu hili." : "No business data was used for this answer." }, generatedAt: new Date().toISOString() });
  }
  if (["cashSession", "expiry", "expiredStock", "scheduledExpenses", "quotations"].includes(intent)) {
    const withoutThirtyDays = question.replace(/\b(?:in |within |the )?next (?:30|thirty) days\b|\bsiku (?:30|thelathini) zijazo\b/ig, "");
    if (periodPhrase(withoutThirtyDays)) {
      return res.json({ answer: { message: language === "sw" ? "Kwa sasa naweza kuonyesha hali ya sasa tu; kwa tarehe za bidhaa na ratiba natumia siku 30 zijazo. Uliza bila kipindi kingine." : "For now I can show current status only; expiry and schedules use the next 30 days. Please ask without another date range.", href: "/assistant", evidence: [], privacy: language === "sw" ? "Hakuna data ya biashara iliyotumika kwa jibu hili." : "No business data was used for this answer." }, generatedAt: new Date().toISOString() });
    }
  }
  const parsedWindow = requestedTimeWindow(question, intent);
  if (["cashSession", "expiry", "expiredStock", "scheduledExpenses", "quotations"].includes(intent)) delete parsedWindow.clarification;
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
  if (["productRanking", "productDetail", "slowProducts"].includes(intent)) {
    try {
      const answer = await answerProductQuestion(req, intent, parsedWindow.window, language);
      return res.json({ answer, generatedAt: new Date().toISOString() });
    } catch (error) {
      console.warn(JSON.stringify({ event: "assistant_product_source_unavailable", requestId: req.requestId || null, errorName: error?.name || "Error" }));
      return res.json({ answer: { message: language === "sw" ? "Uchanganuzi wa bidhaa haupatikani kwa sasa. Jaribu tena." : "Product analytics is unavailable right now. Please try again.", href: "/assistant", evidence: [], privacy: language === "sw" ? "Hakuna huduma ya AI ya nje iliyotumika." : "No external AI service was called." }, generatedAt: new Date().toISOString() });
    }
  }
  if (["supplierBalance", "supplierCreditsOwed", "supplierRefunds", "debtCollections", "teamShifts", "branchComparison", "foodProduction", "foodInput", "cropTasks", "cropDetail", "livestockGroup", "farmInput", "eggProduction", "eggStock"].includes(intent)) {
    try {
      const answer = await answerBusinessQuestion(req, intent, parsedWindow.window, language);
      return res.json({ answer, generatedAt: new Date().toISOString() });
    } catch (error) {
      console.warn(JSON.stringify({ event: "assistant_business_source_unavailable", requestId: req.requestId || null, intent, errorName: error?.name || "Error" }));
      return res.json({ answer: { message: language === "sw" ? "Taarifa hii haipatikani kwa sasa. Jaribu tena baadaye." : "These records are unavailable right now. Please try again.", href: "/assistant", evidence: [], privacy: language === "sw" ? "Hakuna huduma ya AI ya nje iliyotumika." : "No external AI service was called." }, generatedAt: new Date().toISOString() });
    }
  }
  if (["cashSession", "expiry", "expiredStock", "scheduledExpenses", "quotations", "purchases", "topPurchaseSupplier", "returns", "creditSales"].includes(intent)) {
    try {
      const answer = await answerOperationalQuestion(req, intent, parsedWindow.window, language);
      const contextToken = answer.evidence.length ? await createFollowUpContext(req, intent) : null;
      return res.json({ answer, contextToken, generatedAt: new Date().toISOString() });
    } catch (error) {
      console.warn(JSON.stringify({ event: "assistant_question_source_unavailable", requestId: req.requestId || null, intent, errorName: error?.name || "Error" }));
      return res.json({ answer: { message: language === "sw" ? "Taarifa hii haipatikani kwa sasa. Jaribu tena baadaye." : "These records are unavailable right now. Please try again.", href: "/assistant", evidence: [], privacy: language === "sw" ? "Hakuna huduma ya AI ya nje iliyotumika." : "No external AI service was called." }, generatedAt: new Date().toISOString() });
    }
  }
  const sources = intent === "overview"
    ? ["salesToday", "inventory", "debts", "expenses", "quotations", "farm"]
    : [intent === "profit" ? "salesToday" : intent];
  const snapshot = await loadSnapshot(req, sources, { timeWindow: parsedWindow.window });
  const answer = askAnswer(intent, snapshot, language, question);
  const contextToken = answer.evidence.length ? await createFollowUpContext(req, intent) : null;
  res.json({ answer, contextToken, generatedAt: snapshot.generatedAt });
});

module.exports = { today, ask, productOptions, supplierOptions, operationalOptions, loadInventoryEvidence, loadDebts, loadExpenses, loadSnapshot, detectIntent, requestedTimeWindow, askAnswer };
