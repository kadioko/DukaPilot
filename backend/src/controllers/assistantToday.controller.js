const prisma = require("../lib/prisma");
const crypto = require("crypto");
const { getShopIdForUser } = require("../lib/shopAccess");
const { overview, profitAnalytics } = require("./dashboard.controller");
const { report: purchaseReport } = require("./purchaseAnalytics.controller");
const { current: currentCashSession } = require("./cashSession.controller");
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
  if (phrase && !["salesToday", "profit", "expenses", "purchases", "topPurchaseSupplier", "returns", "creditSales"].includes(intent)) {
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

module.exports = { today, ask, loadInventoryEvidence, loadDebts, loadExpenses, loadSnapshot, detectIntent, requestedTimeWindow, askAnswer };
