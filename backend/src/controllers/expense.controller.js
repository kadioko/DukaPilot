const crypto = require("node:crypto");
const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { getRequestLanguage } = require("../lib/requestLanguage");
const { startOfTanzaniaDay, endOfTanzaniaDay, startOfTanzaniaWeek, startOfTanzaniaMonth, addTanzaniaMonths, tanzaniaDayOfMonth, tanzaniaDateKey } = require("../lib/businessTime");
const { occurredExpenseDateSql, needsExpenseDateReviewSql } = require("../lib/expenseReporting");
const { findOpenCashSession } = require("../lib/cashSession");
const { invalidateDashboardHistory } = require("../services/dashboard-cache.service");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const CATEGORIES = new Set(["RENT", "SALARY", "UTILITIES", "TRANSPORT", "MARKETING", "TAX", "OTHER"]);
const LEGACY_STOCK_CATEGORY = "STOCK";
const PAYMENT_METHODS = new Set(["CASH", "MPESA", "BANK"]);

function parseSpentAt(value, fallback) {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;

  const text = String(value).trim();
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const date = isDateOnly ? new Date(`${text}T12:00:00.000Z`) : new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  if (isDateOnly && date.toISOString().slice(0, 10) !== text) return null;
  return date;
}

function filterDateBoundary(value, end = false) {
  const date = parseSpentAt(value, null);
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim())) {
    const start = startOfTanzaniaDay(date);
    return end ? new Date(start.getTime() + 86400000) : start;
  }
  return end ? new Date(date.getTime() + 1) : date;
}

function validationError(req, res, english, swahili, code = "EXPENSE_VALIDATION_ERROR") {
  return res.status(400).json({
    error: getRequestLanguage(req) === "sw" ? swahili : english,
    code,
  });
}

function parsePaymentMethod(value, fallback = "CASH") {
  const paymentMethod = String(value || fallback).toUpperCase();
  return PAYMENT_METHODS.has(paymentMethod) ? paymentMethod : null;
}

function advanceOneMonth(date, anchorDay = tanzaniaDayOfMonth(date)) {
  const shifted = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const targetMonth = shifted.getUTCFullYear() * 12 + shifted.getUTCMonth() + 1;
  const year = Math.floor(targetMonth / 12);
  const month = targetMonth % 12;
  const day = Math.min(anchorDay, new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day, shifted.getUTCHours(), shifted.getUTCMinutes(), shifted.getUTCSeconds(), shifted.getUTCMilliseconds()) - 3 * 60 * 60 * 1000);
}

function periodWindow(value, now = new Date()) {
  const period = String(value || "month").toLowerCase();
  const currentDayEnd = endOfTanzaniaDay(now);
  if (period === "all") return { period, from: null, to: currentDayEnd, previousFrom: null, previousTo: null };

  let from;
  let to;
  let previousFrom;
  if (period === "today") {
    from = startOfTanzaniaDay(now);
    to = currentDayEnd;
    previousFrom = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  } else if (period === "week") {
    from = startOfTanzaniaWeek(now);
    to = currentDayEnd;
    previousFrom = new Date(from.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    from = startOfTanzaniaMonth(now);
    to = currentDayEnd;
    previousFrom = addTanzaniaMonths(from, -1);
  } else {
    return null;
  }
  return { period, from, to, previousFrom, previousTo: from };
}

function expenseDataFromRequest(req, fallback = {}) {
  const title = req.body.title === undefined && req.body.name === undefined
    ? fallback.title
    : String(req.body.title ?? req.body.name ?? "").trim();
  const amount = req.body.amount == null ? fallback.amount : Number(req.body.amount);
  const category = String(req.body.category || fallback.category || "OTHER").toUpperCase();
  const paymentMethod = parsePaymentMethod(req.body.paymentMethod, fallback.paymentMethod || "CASH");
  const spentAt = parseSpentAt(req.body.spentAt, fallback.spentAt || new Date());

  return {
    title,
    amount,
    category: category === LEGACY_STOCK_CATEGORY || CATEGORIES.has(category) ? category : "OTHER",
    vendor: req.body.vendor === undefined ? (fallback.vendor || null) : String(req.body.vendor || "").trim() || null,
    note: req.body.note === undefined ? (fallback.note || null) : String(req.body.note || "").trim() || null,
    paymentMethod,
    spentAt,
  };
}

function validateExpenseData(req, res, data, { allowFuture = false } = {}) {
  if (data.category === LEGACY_STOCK_CATEGORY) {
    validationError(
      req,
      res,
      "Stock purchases are recorded through Inventory > Restock so they are not counted twice in profit.",
      "Ununuzi wa bidhaa rekodi kwenye Hifadhi ya Bidhaa > Ongeza stock ili usihesabiwe mara mbili kwenye faida.",
      "STOCK_PURCHASES_USE_INVENTORY",
    );
    return false;
  }
  if (!data.title || !Number.isInteger(data.amount) || data.amount <= 0) {
    validationError(
      req,
      res,
      "Expense name and a whole positive TZS amount are required",
      "Jina la matumizi na kiasi chanya cha TZS bila desimali vinahitajika",
    );
    return false;
  }
  if (!data.spentAt) {
    validationError(req, res, "Expense date is invalid", "Tarehe ya matumizi si sahihi", "INVALID_EXPENSE_DATE");
    return false;
  }
  if (!allowFuture && tanzaniaDateKey(data.spentAt) > tanzaniaDateKey()) {
    validationError(req, res, "An expense can only be recorded on today’s date or an earlier date. Use a schedule for future costs.", "Matumizi yanaweza kurekodiwa kwa tarehe ya leo au iliyopita tu. Weka ratiba kwa gharama za baadaye.", "FUTURE_EXPENSE_DATE_NOT_ALLOWED");
    return false;
  }
  if (!data.paymentMethod) {
    validationError(req, res, "Choose cash, M-Pesa, or bank", "Chagua Taslimu, M-Pesa, au Benki", "INVALID_EXPENSE_PAYMENT_METHOD");
    return false;
  }
  return true;
}

function recurringTemplateData(data) {
  const { spentAt, ...template } = data;
  return template;
}

function idempotencyKey(value) {
  const key = String(value || "").trim().toLowerCase();
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(key) ? key : null;
}

function payloadHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function idempotencyConflict() {
  return Object.assign(new Error("This retry key was already used for different expense details. Refresh the page before submitting a changed request."), { status: 409, code: "EXPENSE_IDEMPOTENCY_CONFLICT" });
}

function assertSameRequest(existing, hash) {
  if (existing.requestHash && existing.requestHash !== hash) throw idempotencyConflict();
}

function expenseRequestHash(data, recurringMonthly) {
  return payloadHash({ title: data.title, amount: data.amount, category: data.category, vendor: data.vendor, note: data.note, paymentMethod: data.paymentMethod, spentAt: data.spentAt.toISOString(), recurringMonthly });
}

function capOccurredRange(range, now = new Date()) {
  const end = endOfTanzaniaDay(now);
  return { from: range.from || null, to: range.to ? new Date(Math.min(range.to.getTime(), end.getTime())) : end };
}

function needsOwnerDateReview(expense) {
  return !expense.dateReviewedAt && tanzaniaDateKey(expense.spentAt) > tanzaniaDateKey(expense.createdAt);
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const window = periodWindow(req.query.period);
  if (!window) return validationError(req, res, "Period must be today, week, month, or all", "Kipindi kiwe Leo, Wiki, Mwezi, au Muda wote", "INVALID_EXPENSE_PERIOD");
  const category = String(req.query.category || "").toUpperCase();
  const search = String(req.query.search || "").trim().slice(0, 120);
  const vendor = String(req.query.vendor || "").trim().slice(0, 120);
  const requestedFrom = req.query.from ? filterDateBoundary(req.query.from) : null;
  const requestedTo = req.query.to ? filterDateBoundary(req.query.to, true) : null;
  if (req.query.from && !requestedFrom) return validationError(req, res, "Start date is invalid", "Tarehe ya kuanzia si sahihi", "INVALID_EXPENSE_FILTER_DATE");
  if (req.query.to && !requestedTo) return validationError(req, res, "End date is invalid", "Tarehe ya mwisho si sahihi", "INVALID_EXPENSE_FILTER_DATE");
  if (requestedFrom && requestedTo && requestedFrom >= requestedTo) return validationError(req, res, "Start date must be before end date", "Tarehe ya kuanzia lazima iwe kabla ya tarehe ya mwisho", "INVALID_EXPENSE_FILTER_RANGE");
  const customRange = requestedFrom || requestedTo ? capOccurredRange({ from: requestedFrom, to: requestedTo }) : null;
  if (category === LEGACY_STOCK_CATEGORY) return validationError(req, res, "Stock purchases are managed in Inventory, not Expenses", "Ununuzi wa bidhaa unasimamiwa kwenye Hifadhi ya Bidhaa, si Matumizi", "STOCK_PURCHASES_USE_INVENTORY");

  const filters = { shopId };
  if (CATEGORIES.has(category)) filters.category = category;
  if (vendor) filters.vendor = { contains: vendor, mode: "insensitive" };
  if (search) {
    filters.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { vendor: { contains: search, mode: "insensitive" } },
      { note: { contains: search, mode: "insensitive" } },
    ];
  }

  function sqlExpenseWhere(range, { needsReview = false } = {}) {
    const clauses = ['e."shopId" = $1', "e.category <> 'STOCK'"];
    const params = [shopId];
    const add = (value) => { params.push(value); return `$${params.length}`; };
    if (filters.category) clauses.push(`e.category = ${add(filters.category)}`);
    if (vendor) clauses.push(`e.vendor ILIKE '%' || ${add(vendor)} || '%'`);
    if (search) {
      const index = add(search);
      clauses.push(`(e.title ILIKE '%' || ${index} || '%' OR e.vendor ILIKE '%' || ${index} || '%' OR e.note ILIKE '%' || ${index} || '%')`);
    }
    if (range?.from) clauses.push(`e."spentAt" >= ${add(range.from)}::timestamptz`);
    if (range?.to) clauses.push(`e."spentAt" < ${add(range.to)}::timestamptz`);
    clauses.push(needsReview ? needsExpenseDateReviewSql("e") : occurredExpenseDateSql("e"));
    return { where: clauses.join(" AND "), params };
  }

  const selectedRange = customRange || window;
  const selectedWhere = sqlExpenseWhere(selectedRange);
  const previousWhere = !customRange && window.previousFrom && window.previousTo
    ? sqlExpenseWhere(capOccurredRange({ from: window.previousFrom, to: window.previousTo }))
    : null;
  const salesWhere = { shopId, status: "COMPLETED" };
  if (selectedRange.from || selectedRange.to) salesWhere.createdAt = { ...(selectedRange.from ? { gte: selectedRange.from } : {}), ...(selectedRange.to ? { lt: selectedRange.to } : {}) };

  const reviewWhere = sqlExpenseWhere(null, { needsReview: true });
  const [expenses, summaryRows, recurringExpenses, sales, previousRows, categoryBreakdown, returnRows, needsReviewExpenses] = await Promise.all([
    prisma.$queryRawUnsafe(`SELECT e.* FROM expenses e WHERE ${selectedWhere.where} ORDER BY e."spentAt" DESC LIMIT 100`, ...selectedWhere.params),
    prisma.$queryRawUnsafe(`SELECT COALESCE(SUM(e.amount), 0)::bigint AS total, COUNT(*)::int AS count FROM expenses e WHERE ${selectedWhere.where}`, ...selectedWhere.params),
    prisma.recurringExpense.findMany({ where: { shopId, isActive: true, category: { not: LEGACY_STOCK_CATEGORY } }, orderBy: { nextDueAt: "asc" }, take: 20 }),
    prisma.sale.aggregate({ where: salesWhere, _sum: { totalAmount: true, profit: true }, _count: { id: true } }),
    previousWhere ? prisma.$queryRawUnsafe(`SELECT COALESCE(SUM(e.amount), 0)::bigint AS total FROM expenses e WHERE ${previousWhere.where}`, ...previousWhere.params) : Promise.resolve(null),
    prisma.$queryRawUnsafe(`SELECT e.category, COALESCE(SUM(e.amount), 0)::bigint AS total FROM expenses e WHERE ${selectedWhere.where} GROUP BY e.category ORDER BY total DESC LIMIT 3`, ...selectedWhere.params),
    prisma.$queryRaw`
      WITH return_events AS (
        SELECT sr."createdAt" AS occurred_at, sri."totalAmount" AS revenue,
          sri."totalAmount" - sri."buyingPrice" * sri."restockQuantity" AS profit_reduction
        FROM sale_return_items sri JOIN sale_returns sr ON sr.id = sri."saleReturnId"
        WHERE sr."shopId" = ${shopId}
        UNION ALL
        SELECT srr."createdAt", -sri."totalAmount",
          -(sri."totalAmount" - original."buyingPrice" * sri."restockQuantity")
        FROM sale_return_item_reversals sri
        JOIN sale_return_reversals srr ON srr.id = sri."reversalId"
        JOIN sale_return_items original ON original.id = sri."saleReturnItemId"
        WHERE srr."shopId" = ${shopId}
      )
      SELECT COALESCE(SUM(revenue), 0)::bigint AS "returnedRevenue",
        COALESCE(SUM(profit_reduction), 0)::bigint AS "returnedProfit"
      FROM return_events
      WHERE (${selectedRange.from}::timestamptz IS NULL OR occurred_at >= ${selectedRange.from})
        AND (${selectedRange.to}::timestamptz IS NULL OR occurred_at < ${selectedRange.to})
    `,
    prisma.$queryRawUnsafe(`SELECT e.* FROM expenses e WHERE ${reviewWhere.where} ORDER BY e."spentAt" DESC LIMIT 100`, ...reviewWhere.params),
  ]);

  const summary = summaryRows[0] || { total: 0, count: 0 };
  const total = Number(summary.total || 0);
  const totalSales = (sales._sum.totalAmount || 0) - Number(returnRows[0]?.returnedRevenue || 0);
  const grossProfit = (sales._sum.profit || 0) - Number(returnRows[0]?.returnedProfit || 0);
  const previousTotal = Number(previousRows?.[0]?.total || 0);
  res.json({
    expenses,
    needsReviewExpenses: needsReviewExpenses.map((expense) => ({ ...expense, canCorrect: !req.user.staffId || req.user.role === "ADMIN" })),
    recurringExpenses,
    period: window.period,
    summary: {
      total,
      count: Number(summary.count || 0),
      totalSales,
      grossProfit,
      netProfit: grossProfit - total,
      expensePercentOfSales: totalSales > 0 ? (total / totalSales) * 100 : null,
      previousTotal: previousWhere ? previousTotal : null,
      changeAmount: previousWhere ? total - previousTotal : null,
      changePercent: previousWhere && previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null,
      salesCount: sales._count.id,
      topCategories: categoryBreakdown.map((item) => ({ category: item.category, total: Number(item.total || 0) })),
    },
  });
});

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const data = expenseDataFromRequest(req);
  const recurringMonthly = req.body.recurringMonthly === true;
  if (!validateExpenseData(req, res, data, { allowFuture: recurringMonthly })) return;
  const bodyRequestKeyProvided = req.body.requestKey !== undefined;
  const legacyRequestId = req.get?.("x-request-id") || req.headers?.["x-request-id"] || req.headers?.["X-Request-ID"];
  const requestKey = idempotencyKey(bodyRequestKeyProvided ? req.body.requestKey : (!recurringMonthly ? legacyRequestId : null));
  if (req.body.requestKey !== undefined && !requestKey) return validationError(req, res, "Invalid expense retry key", "Namba ya ombi la matumizi si sahihi", "INVALID_EXPENSE_RETRY_KEY");
  if (!requestKey) return validationError(req, res, "Refresh DukaPilot and retry so this expense can be saved exactly once", "Sasisha DukaPilot kisha jaribu tena ili matumizi yahifadhiwe mara moja tu", "EXPENSE_RETRY_KEY_REQUIRED");
  const requestHash = expenseRequestHash(data, recurringMonthly);
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      if (requestKey) {
        const existing = recurringMonthly
          ? await tx.recurringExpense.findFirst({ where: { shopId, requestKey } })
          : await tx.expense.findFirst({ where: { shopId, requestKey } });
        if (existing) {
          assertSameRequest(existing, requestHash);
          return recurringMonthly
            ? { expense: null, recurringExpense: existing, reused: true }
            : { expense: existing, recurringExpense: null, reused: true };
        }
      }

      if (recurringMonthly) {
        const recurringExpense = await tx.recurringExpense.create({
          data: {
            ...recurringTemplateData(data),
            nextDueAt: data.spentAt,
            dayOfMonth: tanzaniaDayOfMonth(data.spentAt),
            requestKey,
            requestHash,
            shopId,
          },
        });
        return { expense: null, recurringExpense, reused: false };
      }

      const cashSession = data.paymentMethod === "CASH" && tanzaniaDateKey(data.spentAt) === tanzaniaDateKey()
        ? await findOpenCashSession(tx, shopId, req.user)
        : null;
      const expense = await tx.expense.create({
        data: { ...data, shopId, requestKey, requestHash, cashSessionId: cashSession?.id || null },
      });
      return { expense, recurringExpense: null, reused: false };
    });
  } catch (error) {
    if (error.code !== "P2002" || !requestKey) throw error;
    const existing = recurringMonthly
      ? await prisma.recurringExpense.findFirst({ where: { shopId, requestKey } })
      : await prisma.expense.findFirst({ where: { shopId, requestKey } });
    if (!existing) throw error;
    assertSameRequest(existing, requestHash);
    result = recurringMonthly
      ? { expense: null, recurringExpense: existing, reused: true }
      : { expense: existing, recurringExpense: null, reused: true };
  }

  if (!recurringMonthly && !result.reused) await invalidateDashboardHistory(shopId);
  req.audit = {
    action: recurringMonthly ? (result.reused ? "expense.recurring.schedule_reused" : "expense.recurring.schedule") : (result.reused ? "expense.create_reused" : "expense.create"),
    resourceType: recurringMonthly ? "recurring_expense" : "expense",
    resourceId: result.recurringExpense?.id || result.expense?.id,
    metadata: { recurringMonthly, reused: result.reused },
  };
  res.status(result.reused ? 200 : 201).json(result);
});

const update = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await prisma.expense.findFirst({ where: { id: req.params.id, shopId } });
  if (!existing) return res.status(404).json({ error: "Expense not found" });
  const correctingLegacyFutureDate = needsOwnerDateReview(existing);
  if (correctingLegacyFutureDate && req.user.staffId && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "An owner or platform administrator must verify and correct this future-dated expense." });
  }
  if (correctingLegacyFutureDate && req.body.confirmActualPayment !== true) {
    return validationError(req, res, "Confirm that this expense was actually paid and enter its real payment date", "Thibitisha kuwa matumizi haya yalilipwa na uweke tarehe halisi ya malipo", "EXPENSE_DATE_REVIEW_CONFIRMATION_REQUIRED");
  }
  if (existing.cashSessionId) {
    const session = await prisma.cashSession.findFirst({ where: { id: existing.cashSessionId, shopId }, select: { status: true } });
    if (session?.status === "CLOSED") return res.status(409).json({ error: "This cash expense belongs to a closed shift and cannot be edited. Keep the closed Z-report unchanged and record a separate correction with the owner." });
  }

  const data = expenseDataFromRequest(req, existing);
  if (!validateExpenseData(req, res, data)) return;

  const expense = await prisma.$transaction(async (tx) => {
    const current = await tx.expense.findFirst({ where: { id: existing.id, shopId } });
    if (!current) throw Object.assign(new Error("Expense not found"), { status: 404 });
    if (current.cashSessionId) {
      if (typeof tx.$queryRawUnsafe === "function") {
        await tx.$queryRawUnsafe('SELECT "id" FROM "cash_sessions" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', current.cashSessionId, shopId);
      }
      const session = await tx.cashSession.findFirst({ where: { id: current.cashSessionId, shopId }, select: { status: true } });
      if (session?.status === "CLOSED") throw Object.assign(new Error("This cash expense belongs to a closed shift and cannot be edited. Keep the closed Z-report unchanged and record a separate correction with the owner."), { status: 409 });
    }
    const updateData = { ...data };
    if (correctingLegacyFutureDate) {
      updateData.dateReviewedAt = new Date();
      updateData.dateReviewedById = req.user.userId || null;
    }
    const isCashToday = data.paymentMethod === "CASH" && tanzaniaDateKey(data.spentAt) === tanzaniaDateKey();
    if (!isCashToday) {
      updateData.cashSessionId = null;
    } else if (!current.cashSessionId) {
      const cashSession = await findOpenCashSession(tx, shopId, req.user);
      updateData.cashSessionId = cashSession?.id || null;
    }
    return tx.expense.update({ where: { id: current.id }, data: updateData });
  });

  await invalidateDashboardHistory(shopId);
  req.audit = {
    action: correctingLegacyFutureDate ? "expense.future_date.correct" : "expense.update",
    resourceType: "expense",
    resourceId: expense.id,
    ...(correctingLegacyFutureDate ? { metadata: { previousSpentAt: existing.spentAt.toISOString(), correctedSpentAt: expense.spentAt.toISOString(), amount: expense.amount, title: expense.title, dateReviewedAt: expense.dateReviewedAt?.toISOString() || null } } : {}),
  };
  res.json({ expense });
});

const recordRecurring = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const requestKey = idempotencyKey(req.body.requestKey);
  if (!requestKey) return validationError(req, res, "A valid retry key is required", "Namba sahihi ya retry inahitajika", "EXPENSE_RETRY_KEY_REQUIRED");
  if (req.body.confirmedPayment !== true) return validationError(req, res, "Confirm that this payment has actually been made before recording it", "Thibitisha kuwa malipo haya yamefanyika kabla ya kuyarekodi", "EXPENSE_PAYMENT_CONFIRMATION_REQUIRED");
  const spentAt = parseSpentAt(req.body.spentAt, null);
  if (!spentAt) return validationError(req, res, "Enter the actual payment date", "Weka tarehe halisi ya malipo", "INVALID_EXPENSE_DATE");
  if (tanzaniaDateKey(spentAt) > tanzaniaDateKey()) return validationError(req, res, "The actual payment date cannot be in the future", "Tarehe halisi ya malipo haiwezi kuwa ya baadaye", "FUTURE_EXPENSE_DATE_NOT_ALLOWED");
  const expectedDueAt = parseSpentAt(req.body.expectedDueAt, null);
  if (!expectedDueAt) return validationError(req, res, "Refresh the schedule and confirm the due occurrence again", "Sasisha ratiba kisha thibitisha tena tarehe ya malipo", "RECURRING_EXPENSE_STALE_OCCURRENCE");
  const expectedDueDate = tanzaniaDateKey(expectedDueAt);
  const requestHash = payloadHash({ recurringExpenseId: req.params.id, spentAt: spentAt.toISOString(), expectedDueDate, confirmedPayment: true });
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const replay = await tx.expense.findFirst({ where: { shopId, requestKey } });
      if (replay) {
        assertSameRequest(replay, requestHash);
        const schedule = await tx.recurringExpense.findFirst({ where: { id: req.params.id, shopId } });
        return { expense: replay, nextDueAt: schedule?.nextDueAt || null, reused: true };
      }

      if (typeof tx.$queryRawUnsafe === "function") {
        await tx.$queryRawUnsafe('SELECT "id" FROM "recurring_expenses" WHERE "id" = $1 AND "shopId" = $2 AND "isActive" = TRUE FOR UPDATE', req.params.id, shopId);
      }
      const recurringExpense = await tx.recurringExpense.findFirst({ where: { id: req.params.id, shopId, isActive: true } });
      if (!recurringExpense) throw Object.assign(new Error("Recurring expense not found"), { status: 404 });
      if (recurringExpense.category === LEGACY_STOCK_CATEGORY) throw Object.assign(new Error("Stock purchases are managed in Inventory, not Expenses"), { status: 409 });
      if (tanzaniaDateKey(recurringExpense.nextDueAt) !== expectedDueDate) {
        throw Object.assign(new Error("This schedule occurrence has already changed. Refresh it before recording another payment."), { status: 409, code: "RECURRING_EXPENSE_STALE_OCCURRENCE" });
      }

      const occurrence = await tx.expense.findFirst({ where: { shopId, recurringExpenseId: recurringExpense.id, recurrenceDueAt: recurringExpense.nextDueAt } });
      if (occurrence) throw Object.assign(new Error("This scheduled payment has already been recorded"), { status: 409, code: "RECURRING_EXPENSE_ALREADY_RECORDED" });
      const sameBusinessDay = await tx.expense.findFirst({
        where: { shopId, recurringExpenseId: recurringExpense.id, spentAt: { gte: startOfTanzaniaDay(spentAt), lt: endOfTanzaniaDay(spentAt) } },
      });
      if (sameBusinessDay) throw Object.assign(new Error("A payment for this schedule is already recorded on that business date"), { status: 409, code: "RECURRING_EXPENSE_ALREADY_RECORDED_TODAY" });

      const cashSession = recurringExpense.paymentMethod === "CASH" && tanzaniaDateKey(spentAt) === tanzaniaDateKey()
        ? await findOpenCashSession(tx, shopId, req.user)
        : null;
      const anchorDay = recurringExpense.dayOfMonth || tanzaniaDayOfMonth(recurringExpense.nextDueAt);
      const nextDueAt = advanceOneMonth(recurringExpense.nextDueAt, anchorDay);
      const expense = await tx.expense.create({
        data: {
          title: recurringExpense.title,
          amount: recurringExpense.amount,
          category: recurringExpense.category,
          vendor: recurringExpense.vendor,
          note: recurringExpense.note,
          paymentMethod: recurringExpense.paymentMethod,
          spentAt,
          shopId,
          requestKey,
          requestHash,
          recurringExpenseId: recurringExpense.id,
          recurrenceDueAt: recurringExpense.nextDueAt,
          cashSessionId: cashSession?.id || null,
        },
      });
      await tx.recurringExpense.update({ where: { id: recurringExpense.id }, data: { nextDueAt, dayOfMonth: anchorDay } });
      return { expense, nextDueAt, reused: false };
    });
  } catch (error) {
    if (error.code !== "P2002") throw error;
    const replay = await prisma.expense.findFirst({ where: { shopId, requestKey } });
    if (replay) {
      assertSameRequest(replay, requestHash);
      const schedule = await prisma.recurringExpense.findFirst({ where: { id: req.params.id, shopId } });
      result = { expense: replay, nextDueAt: schedule?.nextDueAt || null, reused: true };
    } else {
      throw Object.assign(new Error("This scheduled payment has already been recorded"), { status: 409, code: "RECURRING_EXPENSE_ALREADY_RECORDED" });
    }
  }
  if (!result.reused) await invalidateDashboardHistory(shopId);
  req.audit = { action: result.reused ? "expense.recurring.record_reused" : "expense.recurring.record", resourceType: "expense", resourceId: result.expense.id, metadata: { recurringExpenseId: req.params.id, reused: result.reused } };
  res.status(result.reused ? 200 : 201).json(result);
});

const updateRecurring = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const nextDueAt = parseSpentAt(req.body.nextDueAt, null);
  if (!nextDueAt) return validationError(req, res, "Enter a valid next due date", "Weka tarehe sahihi ya malipo yanayofuata", "INVALID_RECURRING_EXPENSE_DATE");
  let previousNextDueAt;
  let previousDayOfMonth;
  const schedule = await prisma.$transaction(async (tx) => {
    if (typeof tx.$queryRawUnsafe === "function") {
      await tx.$queryRawUnsafe('SELECT "id" FROM "recurring_expenses" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', req.params.id, shopId);
    }
    const current = await tx.recurringExpense.findFirst({ where: { id: req.params.id, shopId, isActive: true } });
    if (!current) throw Object.assign(new Error("Recurring expense not found"), { status: 404 });
    previousNextDueAt = current.nextDueAt;
    previousDayOfMonth = current.dayOfMonth;
    return tx.recurringExpense.update({
      where: { id: current.id },
      data: { nextDueAt, dayOfMonth: tanzaniaDayOfMonth(nextDueAt) },
    });
  });
  req.audit = {
    action: "expense.recurring.schedule_date.update",
    resourceType: "recurring_expense",
    resourceId: schedule.id,
    metadata: { previousNextDueAt: previousNextDueAt.toISOString(), previousDayOfMonth, nextDueAt: schedule.nextDueAt.toISOString(), dayOfMonth: schedule.dayOfMonth },
  };
  res.json({ recurringExpense: schedule });
});

const removeRecurring = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const updated = await prisma.recurringExpense.updateMany({ where: { id: req.params.id, shopId, isActive: true }, data: { isActive: false } });
  if (updated.count !== 1) return res.status(404).json({ error: "Recurring expense not found" });
  req.audit = { action: "expense.recurring.cancel", resourceType: "recurring_expense", resourceId: req.params.id };
  res.json({ message: "Recurring expense cancelled" });
});

const remove = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await prisma.expense.findFirst({ where: { id: req.params.id, shopId } });
  if (!existing) return res.status(404).json({ error: "Expense not found" });
  if (needsOwnerDateReview(existing) && req.user.staffId && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "An owner or platform administrator must verify and remove this future-dated expense." });
  }
  await prisma.$transaction(async (tx) => {
    const current = await tx.expense.findFirst({ where: { id: existing.id, shopId } });
    if (!current) throw Object.assign(new Error("Expense not found"), { status: 404 });
    if (current.cashSessionId) {
      if (typeof tx.$queryRawUnsafe === "function") {
        await tx.$queryRawUnsafe('SELECT "id" FROM "cash_sessions" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', current.cashSessionId, shopId);
      }
      const session = await tx.cashSession.findFirst({ where: { id: current.cashSessionId, shopId }, select: { status: true } });
      if (session?.status === "CLOSED") throw Object.assign(new Error("This cash expense belongs to a closed shift and cannot be deleted. Keep the closed Z-report unchanged and record a separate correction with the owner."), { status: 409 });
    }
    await tx.expense.delete({ where: { id: current.id } });
  });
  await invalidateDashboardHistory(shopId);
  req.audit = {
    action: "expense.delete",
    resourceType: "expense",
    resourceId: existing.id,
    metadata: { deletedEntry: { title: existing.title, amount: existing.amount, category: existing.category, paymentMethod: existing.paymentMethod, spentAt: existing.spentAt.toISOString(), recurringExpenseId: existing.recurringExpenseId || null, recurrenceDueAt: existing.recurrenceDueAt?.toISOString() || null } },
  };
  res.json({ message: "Expense deleted" });
});

module.exports = { list, create, update, remove, recordRecurring, updateRecurring, removeRecurring, advanceOneMonth, periodWindow, capOccurredRange };
