const prisma = require("../lib/prisma");
const ntzs = require("../lib/ntzs");
const merchantWallet = require("../services/merchantWallet.service");
const { getBillingShopIdForUser: getShopIdForUser } = require("../lib/shopAccess");
const { normalizePhone } = require("../lib/phone");
const { priceSubscription, validateBranchCapacity } = require("../lib/subscriptionPricing");
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const publicCheckout = ({ id, plan, amount, status, createdAt, kind, extraBranches }) => ({ id, plan, amount, status, createdAt, kind, extraBranches });

function ownerOnly(req, res, next) {
  if (req.user.staffId || req.user.role !== "MERCHANT") return res.status(403).json({ error: "Only the shop owner can pay for a subscription." });
  next();
}

async function initiateProviderCheckout(record) {
  const shop = await prisma.shop.findUnique({ where: { id: record.shopId }, include: { user: { select: { name: true } } } });
  if (!shop) fail("Shop not found.", 404);
  let providerUserId = record.providerUserId;
  if (!providerUserId) {
    const payer = await ntzs.request("/users", {
      method: "POST",
      headers: { "Idempotency-Key": `payer:${record.id}` },
      body: JSON.stringify({ externalId: `dukapilot-checkout:${record.id}`, email: `checkout-${record.id}@payments.dukapilot.com`, name: shop.user?.name || "DukaPilot merchant", phone: record.phone.slice(1) }),
    });
    if (typeof payer.id !== "string" || !/^[a-f0-9-]{36}$/i.test(payer.id)) throw new Error("Missing payer identifier");
    providerUserId = payer.id;
    record = await prisma.subscriptionCheckout.update({ where: { id: record.id }, data: { providerUserId } });
  }
  const deposit = await ntzs.request("/deposits", {
    method: "POST",
    headers: { "Idempotency-Key": record.id },
    body: JSON.stringify({ userId: providerUserId, amountTzs: record.amount, phoneNumber: record.phone.slice(1), paymentMethod: "mobile_money", collectToTreasury: true }),
  });
  if (typeof deposit.id !== "string" || !/^[a-f0-9-]{36}$/i.test(deposit.id)) throw new Error("Missing deposit identifier");
  return prisma.subscriptionCheckout.update({ where: { id: record.id }, data: { providerId: deposit.id, status: "PENDING" } });
}

const getCheckoutConfig = wrap(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const pending = await prisma.subscriptionCheckout.findFirst({ where: { shopId, activeShopKey: shopId }, orderBy: { createdAt: "desc" } });
  res.json({ enabled: ntzs.configured(), prices: ntzs.PRICES, pending: pending ? publicCheckout(pending) : null });
});

const createCheckout = wrap(async (req, res) => {
  if (!ntzs.configured()) fail("Online payments are unavailable. Use Lipa number instead.", 503);
  const { plan, requestKey } = req.body;
  const phone = normalizePhone(req.body.phone);
  if (!Object.hasOwn(ntzs.PRICES, plan) || !/^[a-f0-9-]{36}$/i.test(requestKey || "") || !/^\+255[67]\d{8}$/.test(phone)) fail("Select Basic or Pro and enter a valid Tanzanian mobile number.");
  const shopId = await getShopIdForUser(req.user);
  const checkout = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM shops WHERE id = ${shopId} FOR UPDATE`;
    const prior = await tx.subscriptionCheckout.findUnique({ where: { requestKey } });
    if (prior) {
      if (prior.shopId !== shopId || prior.plan !== plan || prior.phone !== phone || prior.kind !== (req.body.kind || "RENEWAL") || prior.extraBranches !== Number(req.body.extraBranches || 0)) fail("Payment request does not match.", 409);
      return { record: prior, created: false };
    }
    const pending = await tx.subscriptionCheckout.findUnique({ where: { activeShopKey: shopId } });
    if (pending) return { record: pending, created: false };
    const shop = await tx.shop.findUnique({ where: { id: shopId }, include: { user: { select: { id: true, name: true } } } });
    const quote = priceSubscription(shop, { ...req.body, months: 1 });
    if (quote.amount < 500) fail("The remaining period costs less than the provider minimum. Use manual payment or renew first.");
    await validateBranchCapacity(tx, shopId, quote.plan, quote.extraBranches);
    if (!shop.isActive) fail("Your shop is suspended. Contact support before paying.", 403);
    if (shop.subscriptionEndsAt > new Date() && shop.plan !== plan) fail("Contact support to change plans before your current subscription ends.", 409);
    const attempts = await tx.subscriptionCheckout.count({ where: { shopId, createdAt: { gte: new Date(Date.now() - 86400000) } } });
    if (attempts >= 3) fail("Too many payment attempts today. Contact support.", 429);
    const record = await tx.subscriptionCheckout.create({ data: { shopId, activeShopKey: shopId, requestKey, plan, amount: quote.amount, phone, kind: quote.kind, extraBranches: quote.extraBranches, expectedEndsAt: quote.expectedEndsAt } });
    return { record, created: true, owner: shop.user };
  });
  if (!checkout.created) return res.json(publicCheckout(checkout.record));
  let record = checkout.record;
  try {
    record = await initiateProviderCheckout(record);
  } catch {
    // An uncertain provider result may already have charged the phone. Keep the
    // pending lock; never issue another prompt automatically or lose this key.
    record = await prisma.subscriptionCheckout.update({ where: { id: record.id }, data: { status: "REVIEW" } });
  }
  res.status(201).json(publicCheckout(record));
});

async function reconcile(checkout) {
  if (checkout.status === "CONFIRMED" || checkout.status === "FAILED" || !checkout.providerId) return checkout;
  const deposit = await ntzs.request(`/deposits/${encodeURIComponent(checkout.providerId)}`);
  const completed = ntzs.verifyDeposit(checkout, deposit);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM shops WHERE id = ${checkout.shopId} FOR UPDATE`;
    const current = await tx.subscriptionCheckout.findUnique({ where: { id: checkout.id } });
    if (current.status === "CONFIRMED" || current.status === "FAILED") return current;
    if (!completed) {
      return tx.subscriptionCheckout.update({ where: { id: current.id }, data: {
        status: deposit.status === "failed" ? "FAILED" : deposit.status === "review" ? "REVIEW" : "PENDING",
        ...(deposit.status === "failed" ? { activeShopKey: null } : {}),
      } });
    }
    const shop = await tx.shop.findUnique({ where: { id: current.shopId } });
    if (current.kind === "BRANCH_ADDON" && (+shop.subscriptionEndsAt !== +current.expectedEndsAt || shop.subscriptionEndsAt <= new Date() || current.extraBranches <= shop.additionalBranchSlots)) {
      return tx.subscriptionCheckout.update({ where: { id: current.id }, data: { status: "REVIEW" } });
    }
    // Do not undo an admin suspension or silently alter prepaid plan terms.
    if (!shop.isActive || (shop.subscriptionEndsAt > new Date() && shop.plan !== current.plan)) {
      return tx.subscriptionCheckout.update({ where: { id: current.id }, data: { status: "REVIEW" } });
    }
    try { await validateBranchCapacity(tx, current.shopId, current.plan, current.extraBranches || 0); }
    catch (error) {
      if (error.status !== 400) throw error;
      return tx.subscriptionCheckout.update({ where: { id: current.id }, data: { status: "REVIEW" } });
    }
    await tx.subscriptionPayment.create({ data: { shopId: current.shopId, plan: current.plan, amount: current.amount, months: current.kind === "BRANCH_ADDON" ? 0 : 1, kind: current.kind || "RENEWAL", extraBranches: current.extraBranches || 0, method: "NTZS", reference: current.providerId, normalizedReference: `NTZS:${current.providerId}`, status: "CONFIRMED", reviewedAt: new Date(), note: `Verified nTZS checkout ${current.id}` } });
    await tx.shop.update({ where: { id: current.shopId }, data: { plan: current.plan, additionalBranchSlots: current.extraBranches || 0, ...(current.kind === "BRANCH_ADDON" ? {} : { subscriptionEndsAt: ntzs.renewalEnd(shop) }) } });
    return tx.subscriptionCheckout.update({ where: { id: current.id }, data: { status: "CONFIRMED", activeShopKey: null } });
  });
}

const checkCheckout = wrap(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const record = await prisma.subscriptionCheckout.findFirst({ where: { id: req.params.id, shopId } });
  if (!record) fail("Payment not found.", 404);
  res.json(publicCheckout(await reconcile(record)));
});

const retryCheckout = wrap(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  let record = await prisma.subscriptionCheckout.findFirst({ where: { id: req.params.id, shopId } });
  if (!record) fail("Payment not found.", 404);
  if (record.status !== "REVIEW") fail("Only a payment needing review can be retried.", 409);
  try {
    if (!record.providerId) record = await initiateProviderCheckout(record);
    record = await reconcile(record);
  } catch {
    record = await prisma.subscriptionCheckout.update({ where: { id: record.id }, data: { status: "REVIEW" } });
  }
  req.audit = { action: "subscription.checkout.retry", resourceType: "subscription_checkout", resourceId: record.id, metadata: { shopId } };
  res.json(publicCheckout(record));
});

const adminListExceptions = wrap(async (_req, res) => {
  const checkouts = await prisma.subscriptionCheckout.findMany({
    where: { status: "REVIEW" },
    orderBy: { updatedAt: "asc" },
    take: 100,
    include: { shop: { select: { id: true, name: true, user: { select: { name: true, phone: true } } } } },
  });
  res.json({ checkouts: checkouts.map((record) => ({ ...publicCheckout(record), phone: record.phone, providerId: record.providerId, updatedAt: record.updatedAt, shop: record.shop })) });
});

const adminRetryException = wrap(async (req, res) => {
  let record = await prisma.subscriptionCheckout.findUnique({ where: { id: req.params.id } });
  if (!record) fail("Payment exception not found.", 404);
  if (record.status !== "REVIEW") fail("This payment no longer needs review.", 409);
  try {
    if (!record.providerId) record = await initiateProviderCheckout(record);
    record = await reconcile(record);
  } catch {
    record = await prisma.subscriptionCheckout.update({ where: { id: record.id }, data: { status: "REVIEW" } });
  }
  req.audit = { action: "admin.subscription.checkoutRetried", resourceType: "subscription_checkout", resourceId: record.id, metadata: { adminId: req.user.userId, shopId: record.shopId, status: record.status } };
  res.json({ checkout: publicCheckout(record) });
});

const webhook = wrap(async (req, res) => {
  if (!ntzs.verifySignature(req.rawBody, req.headers["x-webhook-timestamp"], req.headers["x-webhook-signature"], process.env.NTZS_WEBHOOK_SECRET)) return res.status(401).json({ error: "Invalid signature" });
  const event = req.body;
  // Wallet events are verified again against the provider record before the
  // internal ledger changes. Returning 503 for a matching event that cannot
  // yet be reconciled asks the provider to retry rather than losing it.
  if (event.data?.livemode !== false && await merchantWallet.reconcileWebhook(event)) return res.json({ received: true });
  if (event.type !== "deposit.completed" || event.data?.livemode !== true) return res.json({ received: true });
  if (typeof event.data.depositId !== "string") return res.status(400).json({ error: "Invalid deposit" });
  const record = await prisma.subscriptionCheckout.findUnique({ where: { providerId: event.data.depositId } });
  // A notification can arrive before the initiation response has been stored.
  if (!record) return res.status(503).json({ error: "Payment not matched yet" });
  await reconcile(record);
  res.json({ received: true });
});

module.exports = { ownerOnly, getCheckoutConfig, createCheckout, checkCheckout, retryCheckout, adminListExceptions, adminRetryException, webhook, reconcile, publicCheckout, initiateProviderCheckout };
