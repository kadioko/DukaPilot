const prisma = require("../lib/prisma");
const { randomUUID } = require("node:crypto");
const { getShopIdForUser } = require("../lib/shopAccess");
const { getFarmConfiguration } = require("../lib/farmAccess");
const { tanzaniaDateKey } = require("../lib/businessTime");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function normalizeStatus(value) {
  const status = String(value || "").toUpperCase();
  return ["OPEN", "OPENED", "COMPLETED", "DISMISSED"].includes(status) ? status : "OPEN";
}

function parseOccurrence(actionKey, impressionKey, now = new Date()) {
  const match = String(impressionKey || "").match(/^(\d{4}-\d{2}-\d{2}):(snapshot:)?(.+)$/);
  if (!match || match[3] !== actionKey) return null;
  const snapshotKey = match[1];
  const date = new Date(`${snapshotKey}T12:00:00+03:00`);
  if (Number.isNaN(date.getTime()) || tanzaniaDateKey(date) !== snapshotKey) return null;
  const today = tanzaniaDateKey(now);
  const yesterday = tanzaniaDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  return snapshotKey === today || snapshotKey === yesterday ? { snapshotKey } : null;
}

function isSupportedActionKey(actionKey) {
  return /^(?:net-profit|debt|expenses|orders|stock-[A-Za-z0-9_-]+|quotation-(?:convert|deposit|expired|expiring)-[A-Za-z0-9_-]+|crop-(?:input|harvest|irrigation|task|weather|review)-[A-Za-z0-9_-]+|farm-[A-Za-z0-9_-]+)$/.test(actionKey);
}

function quotationDaysUntil(value) {
  if (!value) return null;
  const target = new Date(value); const today = new Date();
  target.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function quotationAction(type, quote, language) {
  const sw = language === "sw";
  const outstanding = Math.max(0, quote.totalAmount - quote.amountPaid);
  if (type === "CONVERT") return { id: `quotation-convert-${quote.id}`, rank: 93, href: "/quotations?status=ACCEPTED", title: sw ? `Badilisha ${quote.quotationNumber} kuwa mauzo` : `Convert ${quote.quotationNumber} to a sale`, body: sw ? `${quote.customer.name} amekubali ${quote.projectTitle}. Salio ni TZS ${outstanding.toLocaleString("en-TZ")}.` : `${quote.customer.name} accepted ${quote.projectTitle}. Outstanding: TZS ${outstanding.toLocaleString("en-TZ")}.`, action: sw ? "Fungua nukuu zilizokubaliwa" : "Open accepted quotations" };
  if (type === "DEPOSIT") {
    const overdue = quote.depositDueDate && quotationDaysUntil(quote.depositDueDate) < 0;
    return { id: `quotation-deposit-${quote.id}`, rank: overdue ? 91 : 79, href: `/quotations?status=${quote.status}`, title: sw ? `${overdue ? "Fuatilia" : "Kumbuka"} amana ya ${quote.quotationNumber}` : `${overdue ? "Follow up the deposit for" : "Track the deposit for"} ${quote.quotationNumber}`, body: sw ? `${quote.customer.name} bado anadaiwa TZS ${Math.max(0, quote.depositRequiredAmount - quote.amountPaid).toLocaleString("en-TZ")} ya amana.` : `${quote.customer.name} still owes TZS ${Math.max(0, quote.depositRequiredAmount - quote.amountPaid).toLocaleString("en-TZ")} of the deposit.`, action: sw ? "Fungua nukuu na rekodi malipo" : "Open quotation and record payment" };
  }
  if (type === "EXPIRED") return { id: `quotation-expired-${quote.id}`, rank: 64, href: "/quotations?status=EXPIRED", title: sw ? `Amua hatua kwa ${quote.quotationNumber}` : `Decide what to do with ${quote.quotationNumber}`, body: sw ? `${quote.customer.name} hajakubali ${quote.projectTitle} kabla ya tarehe ya mwisho.` : `${quote.customer.name} did not accept ${quote.projectTitle} before its expiry date.`, action: sw ? "Fungua nukuu zilizoisha" : "Open expired quotations" };
  return { id: `quotation-expiring-${quote.id}`, rank: 84, href: "/quotations?status=SENT", title: sw ? `${quote.quotationNumber} inaisha hivi karibuni` : `${quote.quotationNumber} expires soon`, body: sw ? `Fuatilia ${quote.customer.name} kuhusu ${quote.projectTitle} kabla ya bei kuisha.` : `Follow up with ${quote.customer.name} about ${quote.projectTitle} before it expires.`, action: sw ? "Fungua nukuu zilizotumwa" : "Open sent quotations" };
}

async function measureAction(shopId, actionKey) {
  if (actionKey === "debt") {
    const result = await prisma.debt.aggregate({ where: { shopId, status: { in: ["OPEN", "PARTIAL"] } }, _sum: { amount: true, amountPaid: true } });
    return (result._sum.amount || 0) - (result._sum.amountPaid || 0);
  }
  if (actionKey.startsWith("staff-stock-") || actionKey.startsWith("stock-")) {
    const productId = actionKey.startsWith("staff-stock-")
      ? actionKey.slice("staff-stock-".length)
      : actionKey.slice("stock-".length);
    const product = await prisma.product.findFirst({
      where: { id: productId, shopId, isActive: true },
      select: { currentStock: true },
    });
    return product ? Math.round(Number(product.currentStock) * 1000) : null;
  }
  if (actionKey === "stock") {
    const rows = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "products" WHERE "shopId" = ${shopId} AND "isActive" = true AND "isInternalUse" = false AND "currentStock" <= "minimumStock"`;
    return Number(rows[0]?.count || 0);
  }
  const cropMatch = actionKey.match(/^crop-(input|harvest)-(.+)$/);
  if (cropMatch && prisma.cropCycle) {
    const cycle = await prisma.cropCycle.findFirst({
      where: { id: cropMatch[2], shopId },
      select: cropMatch[1] === "input" ? { _count: { select: { inputUsages: true } } } : { _count: { select: { harvestBatches: true } } },
    });
    return cycle ? (cropMatch[1] === "input" ? cycle._count.inputUsages : cycle._count.harvestBatches) : null;
  }
  const irrigationMatch = actionKey.match(/^crop-irrigation-(.+)$/);
  if (irrigationMatch && prisma.cropIrrigationLog) {
    return prisma.cropIrrigationLog.count({ where: { shopId, cropCycleId: irrigationMatch[1], irrigatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } });
  }
  const taskMatch = actionKey.match(/^crop-task-(.+)$/);
  if (taskMatch && prisma.cropFieldTask) {
    const task = await prisma.cropFieldTask.findFirst({ where: { id: taskMatch[1], shopId }, select: { status: true } });
    return task ? Number(task.status === "DONE") : null;
  }
  const weatherMatch = actionKey.match(/^crop-weather-(.+)$/);
  if (weatherMatch && prisma.cropWeatherAlert) {
    const alert = await prisma.cropWeatherAlert.findFirst({ where: { id: weatherMatch[1], shopId }, select: { isResolved: true } });
    return alert ? Number(alert.isResolved) : null;
  }
  const quoteMatch = actionKey.match(/^quotation-(convert|deposit)-(.+)$/);
  if (quoteMatch) {
    const quote = await prisma.quotation.findFirst({ where: { id: quoteMatch[2], shopId }, select: { status: true, amountPaid: true, depositRequiredAmount: true } });
    if (!quote) return null;
    return quoteMatch[1] === "convert" ? Number(quote.status === "CONVERTED") : quote.amountPaid;
  }
  return null;
}

function outcomeVerified(actionKey, baseline, current) {
  if (current === null) return false;
  if (actionKey.startsWith("quotation-convert-")) return current === 1;
  if (actionKey.startsWith("quotation-deposit-")) return baseline !== null && current > baseline;
  if (actionKey === "debt") return baseline !== null && current < baseline;
  if (actionKey.startsWith("staff-stock-") || actionKey.startsWith("stock-")) return baseline !== null && current > baseline;
  if (actionKey.startsWith("crop-input-") || actionKey.startsWith("crop-harvest-") || actionKey.startsWith("crop-irrigation-")) return baseline !== null && current > baseline;
  if (actionKey.startsWith("crop-task-") || actionKey.startsWith("crop-weather-")) return current === 1;
  return false;
}

const quotationSummary = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const requestedLanguage = String(req.headers?.["x-dukapilot-language"] || req.user.language || "sw").toLowerCase();
  const language = requestedLanguage === "en" ? "en" : "sw";
  const quotations = await prisma.quotation.findMany({
    where: { shopId, status: { in: ["SENT", "ACCEPTED", "EXPIRED"] } },
    select: { id: true, quotationNumber: true, status: true, projectTitle: true, totalAmount: true, amountPaid: true, depositRequiredAmount: true, depositDueDate: true, expiryDate: true, customer: { select: { name: true } } },
    orderBy: { updatedAt: "desc" }, take: 200,
  });
  const actions = [];
  const accepted = quotations.filter((quote) => quote.status === "ACCEPTED").sort((a, b) => (b.totalAmount - b.amountPaid) - (a.totalAmount - a.amountPaid))[0];
  if (accepted) actions.push(quotationAction("CONVERT", accepted, language));
  const deposit = quotations.filter((quote) => quote.depositRequiredAmount > quote.amountPaid).sort((a, b) => Number(a.depositDueDate || a.expiryDate || 0) - Number(b.depositDueDate || b.expiryDate || 0))[0];
  if (deposit) actions.push(quotationAction("DEPOSIT", deposit, language));
  const expiring = quotations.filter((quote) => quote.status === "SENT" && quote.expiryDate && quotationDaysUntil(quote.expiryDate) >= 0 && quotationDaysUntil(quote.expiryDate) <= 3).sort((a, b) => Number(a.expiryDate) - Number(b.expiryDate))[0];
  if (expiring) actions.push(quotationAction("EXPIRING", expiring, language));
  const expired = quotations.find((quote) => quote.status === "EXPIRED");
  if (expired) actions.push(quotationAction("EXPIRED", expired, language));
  res.json({ actions: actions.sort((a, b) => b.rank - a.rank), generatedAt: new Date().toISOString() });
});

const stockSummary = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const language = String(req.headers?.["x-dukapilot-language"] || req.user.language || "sw").toLowerCase() === "en" ? "en" : "sw";
  // Compare the two stock columns in PostgreSQL so an older low-stock item is
  // not hidden merely because it falls outside an arbitrary recent-product window.
  const products = await prisma.$queryRaw`
    SELECT "id", "name", "currentStock", "minimumStock", "unit"
    FROM "products"
    WHERE "shopId" = ${shopId}
      AND "isActive" = true
      AND "isInternalUse" = false
      AND "currentStock" <= "minimumStock"
    ORDER BY ("minimumStock" - "currentStock") DESC, "currentStock" ASC, "name" ASC
    LIMIT 5
  `;
  const actions = products
    .map((product, index) => ({
      id: `staff-stock-${product.id}`,
      rank: 80 - index,
      href: `/inventory?search=${encodeURIComponent(product.name)}&action=restock`,
      title: language === "sw" ? (product.currentStock === 0 ? `Stock ya ${product.name} imeisha` : `${product.name} inakaribia kuisha`) : (product.currentStock === 0 ? `${product.name} is out of stock` : `${product.name} is running low`),
      body: language === "sw" ? `Iliyopo: ${product.currentStock} ${product.unit}. Kiwango cha chini: ${product.minimumStock} ${product.unit}.` : `Available: ${product.currentStock} ${product.unit}. Minimum: ${product.minimumStock} ${product.unit}.`,
      action: language === "sw" ? "Fungua bidhaa" : "Open product",
    }));
  res.json({ actions });
});

const farmSummary = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const language = String(req.headers?.["x-dukapilot-language"] || req.user.language || "sw").toLowerCase() === "en" ? "en" : "sw";
  const configuration = await getFarmConfiguration(shopId);
  if (!configuration?.isFarm) return res.json({ actions: [] });
  const sinceWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sinceTwoDays = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const actions = [];
  if (configuration.hasLivestock) {
    const [groups, production, losses, recentProduction] = await Promise.all([
      prisma.farmGroup.findMany({ where: { shopId, isActive: true }, select: { id: true, name: true, profileType: true, currentAnimals: true }, take: 100 }),
      prisma.farmProductionBatch.aggregate({ where: { shopId, producedAt: { gte: sinceWeek } }, _sum: { actualYield: true, wasteQuantity: true }, _count: { id: true } }),
      prisma.farmAnimalEvent.aggregate({ where: { group: { shopId }, type: { in: ["MORTALITY", "CULL"] }, occurredAt: { gte: sinceWeek } }, _sum: { quantity: true } }),
      prisma.farmProductionBatch.findMany({ where: { shopId, producedAt: { gte: sinceTwoDays } }, select: { id: true }, take: 1 }),
    ]);
    const layers = groups.filter((group) => group.profileType === "LAYERS");
    if (layers.length && !recentProduction.length) actions.push({ id: "farm-record-production", rank: 82, href: "/farm", title: language === "sw" ? "Rekodi uzalishaji wa mayai" : "Record egg production", body: language === "sw" ? `Kuna ${layers.length} kundi la kuku wa mayai lakini hakuna batch ya uzalishaji kwa siku 2 zilizopita.` : `${layers.length} layer group(s) have no production batch recorded in the last two days.`, action: language === "sw" ? "Fungua Ufugaji" : "Open Farm" });
    const lossAnimals = losses._sum.quantity || 0;
    if (lossAnimals > 0) actions.push({ id: "farm-review-losses", rank: 90, href: "/farm", title: language === "sw" ? "Kagua vifo na cull za shamba" : "Review farm deaths and culls", body: language === "sw" ? `Wanyama ${lossAnimals} wameandikwa kama vifo au cull katika siku 7 zilizopita.` : `${lossAnimals} animals were recorded as deaths or culls in the last seven days.`, action: language === "sw" ? "Kagua Ufugaji" : "Review Farm" });
    const waste = production._sum.wasteQuantity || 0;
    const output = production._sum.actualYield || 0;
    if (waste > 0 && waste >= Math.max(2, Math.round(output * 0.05))) actions.push({ id: "farm-review-output-loss", rank: 78, href: "/farm", title: language === "sw" ? "Kagua hasara ya output" : "Review output loss", body: language === "sw" ? `Output iliyopotea ni ${waste} kwenye siku 7 zilizopita. Linganisha yield halisi na supplies zilizotumika.` : `${waste} output units were lost in the last seven days. Compare actual yield with supplies used.`, action: language === "sw" ? "Fungua batch" : "Open batches" });
  }
  if (configuration.hasCrops && prisma.cropCycle && prisma.cropHarvestBatch) {
    const today = new Date();
    const dueSoon = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const plantedAtLeastAWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [missingInputs, dueHarvest, remainingHarvest, missingIrrigation, dueTasks, weatherWarnings] = await Promise.all([
      prisma.cropCycle.findMany({ where: { shopId, status: { in: ["PLANTED", "GROWING"] }, plantedAt: { lte: plantedAtLeastAWeek }, inputUsages: { none: {} } }, include: { plot: { select: { name: true } } }, orderBy: { plantedAt: "asc" }, take: 2 }),
      prisma.cropCycle.findMany({ where: { shopId, status: { in: ["PLANTED", "GROWING"] }, expectedHarvestAt: { gte: today, lte: dueSoon } }, include: { plot: { select: { name: true } } }, orderBy: { expectedHarvestAt: "asc" }, take: 2 }),
      prisma.cropHarvestBatch.findFirst({ where: { shopId, remainingQuantity: { gt: 0 }, harvestAt: { lte: sinceWeek } }, include: { cropCycle: { select: { cropName: true, plot: { select: { name: true } } } }, outputProduct: { select: { name: true, unit: true } } }, orderBy: { harvestAt: "asc" } }),
      prisma.cropIrrigationLog ? prisma.cropCycle.findMany({ where: { shopId, status: { in: ["PLANTED", "GROWING"] }, irrigationLogs: { none: { irrigatedAt: { gte: sinceWeek } } } }, include: { plot: { select: { name: true } } }, orderBy: { plantedAt: "asc" }, take: 2 }) : Promise.resolve([]),
      prisma.cropFieldTask ? prisma.cropFieldTask.findMany({ where: { shopId, status: { in: ["TODO", "IN_PROGRESS"] }, dueAt: { lte: today } }, include: { cropCycle: { select: { cropName: true, plot: { select: { name: true } } } } }, orderBy: { dueAt: "asc" }, take: 2 }) : Promise.resolve([]),
      prisma.cropWeatherAlert ? prisma.cropWeatherAlert.findMany({ where: { shopId, isResolved: false, severity: "WARNING" }, include: { cropCycle: { select: { cropName: true } }, cropPlot: { select: { name: true } } }, orderBy: { startsAt: "asc" }, take: 2 }) : Promise.resolve([]),
    ]);
    for (const cycle of missingInputs) actions.push({ id: `crop-input-${cycle.id}`, rank: 82, href: `/crops?action=input&cycle=${cycle.id}`, title: language === "sw" ? `Rekodi pembejeo za ${cycle.cropName}` : `Record inputs for ${cycle.cropName}`, body: language === "sw" ? `${cycle.plot.name} imepandwa lakini hakuna pembejeo au gharama iliyoandikwa.` : `${cycle.plot.name} is planted but has no input or cost record.`, action: language === "sw" ? "Fungua Mazao" : "Open Crops" });
    for (const cycle of dueHarvest) actions.push({ id: `crop-harvest-${cycle.id}`, rank: 86, href: `/crops?action=harvest&cycle=${cycle.id}`, title: language === "sw" ? `Panga mavuno ya ${cycle.cropName}` : `Prepare to harvest ${cycle.cropName}`, body: language === "sw" ? `${cycle.plot.name} ina tarehe ya mavuno ndani ya siku 7. Rekodi mavuno kabla ya kuyauza.` : `${cycle.plot.name} is due for harvest within seven days. Record the harvest before selling it.`, action: language === "sw" ? "Fungua Mazao" : "Open Crops" });
    for (const cycle of missingIrrigation) actions.push({ id: `crop-irrigation-${cycle.id}`, rank: 80, href: "/crops/operations", title: language === "sw" ? `Kagua umwagiliaji wa ${cycle.cropName}` : `Check irrigation for ${cycle.cropName}`, body: language === "sw" ? `${cycle.plot.name} haina umwagiliaji uliorekodiwa ndani ya siku 7 zilizopita. Rekodi hali halisi ya shamba.` : `${cycle.plot.name} has no irrigation record in the last seven days. Record the real field condition.`, action: language === "sw" ? "Fungua mpango wa shamba" : "Open field plan" });
    for (const task of dueTasks) actions.push({ id: `crop-task-${task.id}`, rank: 85, href: "/crops/operations", title: language === "sw" ? `Kamilisha kazi: ${task.title}` : `Complete task: ${task.title}`, body: language === "sw" ? `${task.cropCycle ? `${task.cropCycle.cropName} - ${task.cropCycle.plot.name}: ` : ""}tarehe ya kazi imefika. Sasisha baada ya kukamilisha.` : `${task.cropCycle ? `${task.cropCycle.cropName} - ${task.cropCycle.plot.name}: ` : ""}the task is due. Update it when complete.`, action: language === "sw" ? "Fungua mpango wa shamba" : "Open field plan" });
    for (const alert of weatherWarnings) actions.push({ id: `crop-weather-${alert.id}`, rank: 88, href: "/crops/operations", title: language === "sw" ? "Kagua tahadhari ya shamba" : "Review field warning", body: language === "sw" ? `${alert.cropCycle?.cropName || alert.cropPlot?.name || "Shamba"}: kuna tahadhari iliyorekodiwa. Kagua chanzo na rekodi hali halisi.` : `${alert.cropCycle?.cropName || alert.cropPlot?.name || "Field"}: a warning is recorded. Review its source and the actual field condition.`, action: language === "sw" ? "Fungua mpango wa shamba" : "Open field plan" });
    if (remainingHarvest) actions.push({ id: `crop-review-${remainingHarvest.id}`, rank: 71, href: "/crops", title: language === "sw" ? `Kagua stock ya ${remainingHarvest.outputProduct.name}` : `Review ${remainingHarvest.outputProduct.name} harvest stock`, body: language === "sw" ? `Kuna ${remainingHarvest.remainingQuantity} ${remainingHarvest.outputProduct.unit} kutoka ${remainingHarvest.cropCycle.cropName} ya ${remainingHarvest.cropCycle.plot.name} ambayo bado ipo kwenye stock.` : `${remainingHarvest.remainingQuantity} ${remainingHarvest.outputProduct.unit} from ${remainingHarvest.cropCycle.cropName} in ${remainingHarvest.cropCycle.plot.name} is still in stock.`, action: language === "sw" ? "Kagua Mazao" : "Review Crops" });
  }
  res.json({ actions: actions.sort((a, b) => b.rank - a.rank) });
});

const listActions = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const actions = await prisma.assistantAction.findMany({
    where: { shopId },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  const impressionKeys = actions.flatMap((action) => [
    `${action.snapshotKey}:snapshot:${action.actionKey}`,
    `${action.snapshotKey}:${action.actionKey}`,
  ]);
  const events = impressionKeys.length ? await prisma.assistantActionEvent.findMany({
    where: { shopId, impressionKey: { in: impressionKeys } },
    orderBy: { createdAt: "asc" },
    select: { actionKey: true, impressionKey: true, eventType: true, measuredValue: true, createdAt: true },
  }) : [];
  const eventsByKey = new Map();
  for (const event of events) {
    const key = `${event.impressionKey}|${event.actionKey}`;
    eventsByKey.set(key, [...(eventsByKey.get(key) || []), event]);
  }
  res.json({ actions: actions.map((action) => ({
    ...action,
    events: eventsByKey.get(`${action.snapshotKey}:snapshot:${action.actionKey}|${action.actionKey}`)
      || eventsByKey.get(`${action.snapshotKey}:${action.actionKey}|${action.actionKey}`)
      || [],
  })) });
});

const trackAction = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const actionKey = String(req.body.actionKey || "").trim();
  const title = String(req.body.title || "").trim();
  const href = String(req.body.href || "").trim();
  const status = normalizeStatus(req.body.status);
  const impressionKey = String(req.body.impressionKey || "").trim().slice(0, 240);
  const occurrence = parseOccurrence(actionKey, impressionKey);

  if (!actionKey || actionKey.length > 160 || !title || title.length > 240 || !href || href.length > 500 || !href.startsWith("/") || href.startsWith("//")) {
    return res.status(400).json({ error: "actionKey, title, and href are required" });
  }
  if (!isSupportedActionKey(actionKey) || !occurrence) return res.status(400).json({ error: "Invalid recommendation occurrence" });

  const now = new Date();
  const measured = await measureAction(shopId, actionKey);
  const shownEvent = await prisma.assistantActionEvent.findFirst({
    where: { shopId, actionKey, impressionKey, eventType: "SHOWN" },
    select: { measuredValue: true },
  });
  const baselineValue = shownEvent?.measuredValue ?? null;
  const verified = status === "COMPLETED" && outcomeVerified(actionKey, baselineValue, measured);
  const eventTypes = status === "OPENED" ? ["OPENED"] : status === "COMPLETED" ? ["MARKED_DONE", ...(verified ? ["OUTCOME_VERIFIED"] : [])] : status === "DISMISSED" ? ["DISMISSED"] : [];
  const action = await prisma.$transaction(async (tx) => {
    const saved = await tx.assistantAction.upsert({
      where: { shopId_actionKey_snapshotKey: { shopId, actionKey, snapshotKey: occurrence.snapshotKey } },
      create: {
        shopId,
        actionKey,
        snapshotKey: occurrence.snapshotKey,
        title,
        href,
        status,
        openedAt: status === "OPENED" ? now : null,
        completedAt: status === "COMPLETED" ? now : null,
        dismissedAt: status === "DISMISSED" ? now : null,
        baselineValue,
        outcomeValue: status === "COMPLETED" ? measured : null,
        outcomeVerifiedAt: verified ? now : null,
      },
      update: {
        title,
        href,
        status,
        openedAt: status === "OPENED" ? now : undefined,
        completedAt: status === "COMPLETED" ? now : undefined,
        dismissedAt: status === "DISMISSED" ? now : undefined,
        baselineValue,
        outcomeValue: status === "COMPLETED" ? measured : undefined,
        outcomeVerifiedAt: status === "COMPLETED" ? (verified ? now : null) : undefined,
      },
    });
    if (eventTypes.length) {
      await tx.assistantActionEvent.createMany({
        data: eventTypes.map((eventType) => ({ id: randomUUID(), shopId, actionKey, impressionKey, eventType, createdAt: now })),
        skipDuplicates: true,
      });
    }
    return saved;
  });

  req.audit = {
    action: `assistant.action.${status.toLowerCase()}`,
    resourceType: "assistant_action",
    resourceId: action.id,
    metadata: { shopId, actionKey, href, verified, baselineValue, outcomeValue: measured },
  };

  res.status(201).json({ action });
});

const recordImpressions = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const entries = Array.isArray(req.body.events) ? req.body.events : [];
  if (!entries.length || entries.length > 20) return res.status(400).json({ error: "Provide between 1 and 20 recommendation impressions" });
  const dateKey = tanzaniaDayKey(new Date());
  const previousDateKey = tanzaniaDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const data = [];
  for (const entry of entries) {
    const actionKey = String(entry.actionKey || "").trim();
    const impressionKey = String(entry.impressionKey || "").trim();
    const occurrence = parseOccurrence(actionKey, impressionKey);
    if (!actionKey || actionKey.length > 160 || impressionKey.length > 240 || !isSupportedActionKey(actionKey) || !occurrence || ![dateKey, previousDateKey].includes(occurrence.snapshotKey)) {
      return res.status(400).json({ error: "Invalid recommendation impression" });
    }
    const measuredValue = await measureAction(shopId, actionKey);
    data.push({ id: randomUUID(), shopId, actionKey, impressionKey, eventType: "SHOWN", measuredValue });
  }
  const result = await prisma.assistantActionEvent.createMany({ data, skipDuplicates: true });
  res.status(201).json({ recorded: result.count });
});

const adminAnalytics = asyncHandler(async (req, res) => {
  const sinceDays = Math.max(1, Math.min(365, Number(req.query.days) || 30));
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const [total, statusRows, topRows, eventRows] = await Promise.all([
    prisma.assistantAction.count({ where: { updatedAt: { gte: since } } }),
    prisma.assistantAction.groupBy({
      by: ["status"],
      where: { updatedAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.$queryRaw`
      SELECT CASE
        WHEN "actionKey" = 'debt' THEN 'debt'
        WHEN "actionKey" = 'net-profit' THEN 'profit'
        WHEN "actionKey" = 'expenses' THEN 'expenses'
        WHEN "actionKey" = 'orders' THEN 'orders'
        WHEN "actionKey" LIKE 'stock-%' OR "actionKey" LIKE 'staff-stock-%' THEN 'stock'
        WHEN "actionKey" LIKE 'quotation-%' THEN 'quotations'
        WHEN "actionKey" LIKE 'crop-%' OR "actionKey" LIKE 'farm-%' THEN 'farm'
        ELSE 'other'
      END AS "actionType", COUNT(*)::int AS count
      FROM assistant_action_events
      WHERE "eventType" = 'SHOWN' AND "createdAt" >= ${since}
      GROUP BY "actionType"
      ORDER BY count DESC, "actionType" ASC
      LIMIT 8
    `,
    prisma.$queryRaw`
      WITH impressions AS (
        SELECT "shopId", "impressionKey",
          BOOL_OR("eventType" = 'SHOWN') AS shown,
          BOOL_OR("eventType" = 'OPENED') AS opened,
          BOOL_OR("eventType" = 'MARKED_DONE') AS "markedDone",
          BOOL_OR("eventType" = 'OUTCOME_VERIFIED') AS verified
        FROM assistant_action_events
        WHERE "createdAt" >= ${since}
        GROUP BY "shopId", "impressionKey"
      )
      SELECT COUNT(*) FILTER (WHERE shown)::int AS shown,
        COUNT(*) FILTER (WHERE shown AND opened)::int AS opened,
        COUNT(*) FILTER (WHERE shown AND "markedDone")::int AS "markedDone",
        COUNT(*) FILTER (WHERE shown AND verified)::int AS verified
      FROM impressions
    `,
  ]);

  const statusCounts = Object.fromEntries(statusRows.map((row) => [row.status, row._count.id]));
  const eventCounts = eventRows[0] || {};
  const shown = Number(eventCounts.shown || 0);
  const opened = Number(eventCounts.opened || 0);
  const markedDone = Number(eventCounts.markedDone || 0);
  const verified = Number(eventCounts.verified || 0);

  res.json({
    days: sinceDays,
    summary: {
      total,
      open: statusCounts.OPEN || 0,
      opened: statusCounts.OPENED || 0,
      completed: statusCounts.COMPLETED || 0,
      dismissed: statusCounts.DISMISSED || 0,
      completedRate: total ? Math.round(((statusCounts.COMPLETED || 0) / total) * 100) : 0,
      dismissedRate: total ? Math.round(((statusCounts.DISMISSED || 0) / total) * 100) : 0,
      openedRate: total ? Math.round(((statusCounts.OPENED || 0) / total) * 100) : 0,
    },
    funnel: {
      shown,
      opened,
      markedDone,
      outcomesVerified: verified,
      openedRate: shown ? Math.round((opened / shown) * 100) : 0,
      markedDoneRate: shown ? Math.round((markedDone / shown) * 100) : 0,
      verifiedOutcomeRate: shown ? Math.round((verified / shown) * 100) : 0,
      interpretation: "Verified outcomes show a measured change after a recommendation was marked done; they do not prove the assistant caused that change.",
    },
    topActions: topRows.map((row) => ({
      actionType: row.actionType,
      count: Number(row.count),
      title: ({
        debt: "Debt follow-up",
        profit: "Profit and cost review",
        expenses: "Expense review",
        orders: "Order follow-up",
        stock: "Stock review",
        quotations: "Quotation follow-up",
        farm: "Farm operations",
        other: "Other recommendation",
      })[row.actionType] || "Other recommendation",
    })),
  });
});

function tanzaniaDayKey(value = new Date()) {
  const shifted = new Date(value.getTime() + 3 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

module.exports = { listActions, trackAction, recordImpressions, quotationSummary, stockSummary, farmSummary, adminAnalytics, parseOccurrence };
