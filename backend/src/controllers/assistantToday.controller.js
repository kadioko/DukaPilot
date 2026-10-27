const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { overview } = require("./dashboard.controller");
const { stockSummary, quotationSummary, farmSummary, listActions } = require("./assistant.controller");

const SOURCE_KEYS = ["salesToday", "inventory", "debts", "expenses", "quotations", "farm", "actionHistory"];
const DAY_MS = 24 * 60 * 60 * 1000;

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
  const shifted = new Date(value.getTime() + 3 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function sectionUnavailable(checkedAt) {
  return { status: "unavailable", checkedAt, errorCode: "SOURCE_UNAVAILABLE" };
}

async function runSection(sections, key, allowed, loader) {
  const checkedAt = new Date().toISOString();
  if (!allowed) {
    sections[key] = { status: "not_permitted", checkedAt };
    return;
  }
  try {
    const loaded = await loader();
    sections[key] = { status: "ready", checkedAt: new Date().toISOString(), ...loaded };
  } catch (error) {
    console.warn(JSON.stringify({ event: "assistant_source_unavailable", source: key, errorName: error?.name || "Error" }));
    sections[key] = sectionUnavailable(checkedAt);
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
      select: { customerName: true, customerPhone: true, amount: true, amountPaid: true, status: true, dueDate: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
    prisma.debt.findFirst({ where: { shopId }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  return {
    summary: {
      openCount: aggregate._count.id,
      totalOwed: Math.max(0, (aggregate._sum.amount || 0) - (aggregate._sum.amountPaid || 0)),
    },
    debts,
    dataThrough: latestRecord?.updatedAt || null,
  };
}

async function loadExpenses(shopId) {
  const now = new Date();
  const currentFrom = new Date(now.getTime() - 7 * DAY_MS);
  const previousFrom = new Date(now.getTime() - 14 * DAY_MS);
  const [current, previous, recent] = await Promise.all([
    prisma.expense.aggregate({ where: { shopId, category: { not: "STOCK" }, spentAt: { gte: currentFrom, lt: now } }, _sum: { amount: true }, _count: { id: true } }),
    prisma.expense.aggregate({ where: { shopId, category: { not: "STOCK" }, spentAt: { gte: previousFrom, lt: currentFrom } }, _sum: { amount: true }, _count: { id: true } }),
    prisma.expense.findMany({ where: { shopId, category: { not: "STOCK" }, spentAt: { gte: previousFrom, lt: now } }, select: { amount: true, spentAt: true, category: true }, orderBy: { spentAt: "desc" }, take: 100 }),
  ]);
  return {
    summary: { total: current._sum.amount || 0, count: current._count.id },
    expenses: recent,
    trend: { current: current._sum.amount || 0, previous: previous._sum.amount || 0, currentCount: current._count.id, previousCount: previous._count.id },
    dataThrough: recent[0]?.spentAt || null,
  };
}

async function loadSnapshot(req, sources = SOURCE_KEYS) {
  const shopId = await getShopIdForUser(req.user);
  const permissions = permissionsFor(req.user);
  const language = String(req.headers?.["x-dukapilot-language"] || req.user.language || "sw").toLowerCase() === "en" ? "en" : "sw";
  const sections = {};
  const selected = new Set(sources);
  const tasks = [];
  const add = (key, allowed, loader) => {
    if (selected.has(key)) tasks.push(runSection(sections, key, allowed, loader));
  };

  add("salesToday", permissions.reports, async () => {
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
    const data = await loadExpenses(shopId);
    return { data, dataThrough: data.dataThrough };
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
      message = sw
        ? `Matumizi yaliyorekodiwa siku 7 zilizopita ni TZS ${current.toLocaleString("en-TZ")}.${previous ? ` Kipindi cha siku 7 kabla yake kilikuwa TZS ${previous.toLocaleString("en-TZ")}${change !== null ? ` (${change >= 0 ? "juu" : "chini"} kwa ${Math.abs(change)}%)` : ""}.` : " Hakuna matumizi ya kulinganisha kwenye wiki iliyotangulia."} Linganisha vipindi hivi kabla ya kuhitimisha kuwa kuna ongezeko lisilo la kawaida.`
        : `Recorded expenses for the last 7 days are TZS ${current.toLocaleString("en-TZ")}.${previous ? ` The preceding 7 days were TZS ${previous.toLocaleString("en-TZ")}${change !== null ? ` (${Math.abs(change)}% ${change >= 0 ? "higher" : "lower"})` : ""}.` : " There are no recorded expenses in the preceding week for comparison."} Compare the periods before treating a change as unusual.`;
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
  } else if (intent === "salesToday") {
    const data = get("salesToday")?.dashboard;
    if (snapshot.sections.salesToday?.status === "not_permitted") message = sw ? "Akaunti hii haina ruhusa ya kuona ripoti za mauzo." : "This account does not have permission to view sales reports.";
    else if (!data) message = sw ? "Takwimu za mauzo hazipatikani kwa sasa. Jaribu tena chanzo cha mauzo." : "Sales data is unavailable right now. Retry the sales source.";
    else message = sw
      ? `Leo kuna rekodi ${data.summary.salesCount || 0} za mauzo na mauzo halisi yaliyorekodiwa ni TZS ${Number(data.summary.netSales ?? data.summary.totalSales).toLocaleString("en-TZ")}. Mauzo halisi yanajumuisha marekebisho ya marejesho yanayojulikana.`
      : `Today has ${data.summary.salesCount || 0} recorded sales and recorded net sales of TZS ${Number(data.summary.netSales ?? data.summary.totalSales).toLocaleString("en-TZ")}. Net sales include recorded return adjustments.`;
    href = "/analytics";
    addEvidence("salesToday", sw ? "Mauzo ya leo" : "Today's sales");
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
  const sources = intent === "overview"
    ? ["salesToday", "inventory", "debts", "expenses", "quotations", "farm"]
    : [intent];
  const snapshot = await loadSnapshot(req, sources);
  const language = String(req.headers?.["x-dukapilot-language"] || req.user.language || "sw").toLowerCase() === "en" ? "en" : "sw";
  res.json({ answer: askAnswer(intent, snapshot, language), generatedAt: snapshot.generatedAt });
});

module.exports = { today, ask, loadInventoryEvidence, loadDebts, loadExpenses, loadSnapshot, detectIntent, askAnswer };
