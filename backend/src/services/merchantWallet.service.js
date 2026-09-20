const crypto = require("node:crypto");
const prisma = require("../lib/prisma");
const ntzs = require("../lib/ntzs");
const { normalizePhone } = require("../lib/phone");
const { priceSubscription, validateBranchCapacity } = require("../lib/subscriptionPricing");

const MAX_TZS = 2_000_000_000;
const PENDING_STATUSES = new Set(["PENDING", "REVIEW"]);
const TERMINAL_FAILURE_STATUSES = new Set(["failed", "rejected", "cancelled", "canceled", "expired", "reversed", "refunded"]);
const CERTAIN_NO_MOVEMENT_PROVIDER_CODES = new Set([
  "invalid_amount",
  "amount_too_large",
  "invalid_phone",
  "phone_required",
  "missing_required_fields",
  "invalid_quote",
  "quote_mismatch",
  "quote_stale",
  "quote_required",
  "insufficient_balance",
  "wallet_frozen",
  "bank_rail_unavailable",
  "bank_amount_unsupported",
  "capability_required",
  "kyb_required",
  "ip_not_allowed",
  "not_provisioned",
  "user_not_found",
  "wallet_not_provisioned",
  "token_paused",
  "configuration_error",
  "rate_limited",
]);

function failure(message, status = 400, code) {
  return Object.assign(new Error(message), { status, code });
}

function wholeTzs(value, label = "Amount") {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_TZS) {
    throw failure(`${label} must be a whole positive TZS amount.`, 400, "INVALID_AMOUNT");
  }
  return amount;
}

function optionalWholeTzs(value, label = "Amount") {
  if (value === undefined || value === null || value === "") return 0;
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_TZS) {
    throw failure(`${label} must be a whole non-negative TZS amount.`, 502, "PROVIDER_AMOUNT_INVALID");
  }
  return amount;
}

function validRequestKey(value) {
  const key = String(value || "").trim();
  if (!/^[a-f0-9-]{16,100}$/i.test(key)) throw failure("Invalid payment retry key.", 400, "INVALID_REQUEST_KEY");
  return key;
}

function merchantWalletSettings() {
  const rawBps = Number(process.env.NTZS_MERCHANT_BALANCE_WITHDRAWAL_FEE_BPS ?? 200);
  const rawMinimum = Number(process.env.NTZS_MERCHANT_BALANCE_MIN_WITHDRAWAL_TZS ?? 5000);
  const feeBps = Number.isInteger(rawBps) && rawBps >= 0 && rawBps <= 1000 ? rawBps : 200;
  const minimumWithdrawalTzs = Number.isSafeInteger(rawMinimum) && rawMinimum >= 5000 && rawMinimum <= MAX_TZS ? rawMinimum : 5000;
  return { enabled: ntzs.merchantWalletConfigured(), feeBps, minimumWithdrawalTzs };
}

function merchantWalletPilotShopIds() {
  return [...new Set(String(process.env.NTZS_MERCHANT_BALANCE_PILOT_SHOP_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean))];
}

function merchantWalletEnabledForShop(shopId) {
  if (!merchantWalletSettings().enabled) return false;
  const pilotShopIds = merchantWalletPilotShopIds();
  return pilotShopIds.length === 0 || pilotShopIds.includes(String(shopId || ""));
}

function platformFeeTzs(amountTzs, feeBps = merchantWalletSettings().feeBps) {
  const amount = wholeTzs(amountTzs, "Withdrawal amount");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1000) throw failure("Invalid withdrawal fee configuration.", 503, "WALLET_CONFIGURATION_ERROR");
  return Math.ceil((amount * feeBps) / 10_000);
}

function requireProviderConfigured() {
  if (!merchantWalletSettings().enabled) {
    throw failure("Merchant balance is not available yet. Please try again later.", 503, "MERCHANT_WALLET_DISABLED");
  }
}

function requireEnabled(shopId) {
  requireProviderConfigured();
  if (!merchantWalletEnabledForShop(shopId)) {
    throw failure("Merchant balance is not available for this business yet. Please try again later.", 503, "MERCHANT_WALLET_DISABLED");
  }
}

function providerState(value) {
  return String(value || "").trim().toLowerCase();
}

function isTerminalFailureStatus(value) {
  return TERMINAL_FAILURE_STATUSES.has(providerState(value));
}

function isTanzanianMobile(value) {
  return /^\+255[67]\d{8}$/.test(normalizePhone(value));
}

function ntzsPhone(value) {
  const normalized = normalizePhone(value);
  return normalized.startsWith("+") ? normalized.slice(1) : normalized;
}

function maskedPhone(value) {
  const normalized = normalizePhone(value);
  if (!normalized) return null;
  const suffix = normalized.slice(-4);
  return `+255•••••${suffix}`;
}

function cleanShortText(value, maximum = 240) {
  const text = String(value || "").replace(/[\r\n]+/g, " ").trim();
  return text ? text.slice(0, maximum) : null;
}

function publicTransaction(transaction) {
  let balanceEffectTzs = 0;
  if (transaction.kind === "DEPOSIT" && transaction.status === "COMPLETED") {
    balanceEffectTzs = transaction.amountTzs;
  } else if (transaction.kind === "WITHDRAWAL" && PENDING_STATUSES.has(transaction.status)) {
    balanceEffectTzs = -transaction.totalDebitTzs;
  } else if (transaction.kind === "WITHDRAWAL" && transaction.status === "COMPLETED") {
    balanceEffectTzs = -transaction.totalDebitTzs;
  } else if (transaction.kind === "SUBSCRIPTION" && transaction.status === "COMPLETED") {
    balanceEffectTzs = -transaction.amountTzs;
  } else if (transaction.kind === "ADJUSTMENT" && transaction.status === "COMPLETED") {
    if (transaction.metadata?.direction === "CREDIT") balanceEffectTzs = transaction.amountTzs;
    if (transaction.metadata?.direction === "DEBIT") balanceEffectTzs = -transaction.amountTzs;
  }
  return {
    id: transaction.id,
    kind: transaction.kind,
    status: transaction.status,
    amountTzs: transaction.amountTzs,
    platformFeeTzs: transaction.platformFeeTzs,
    providerFeeTzs: transaction.providerFeeTzs,
    totalDebitTzs: transaction.totalDebitTzs,
    balanceEffectTzs,
    recipientPhone: maskedPhone(transaction.recipientPhone),
    payoutRail: transaction.payoutRail || null,
    recipientName: transaction.recipientName || null,
    providerInstruction: transaction.providerInstruction || null,
    providerStatus: transaction.providerStatus || null,
    failureReason: transaction.status === "FAILED" || transaction.status === "REVERSED" ? transaction.failureReason || "Payment could not be completed." : null,
    canResume: PENDING_STATUSES.has(transaction.status) && !transaction.providerId,
    createdAt: transaction.createdAt,
    completedAt: transaction.completedAt || null,
    reversedAt: transaction.reversedAt || null,
  };
}

function adminTransaction(transaction) {
  return {
    ...publicTransaction(transaction),
    shop: transaction.shop ? {
      id: transaction.shop.id,
      name: transaction.shop.name,
      ownerName: transaction.shop.user?.name || null,
      ownerPhone: maskedPhone(transaction.shop.user?.phone),
    } : null,
    providerId: transaction.providerId || null,
    requestKey: transaction.requestKey,
    failureCode: transaction.failureCode || null,
  };
}

function assertSameRetry(existing, expected) {
  if (existing.shopId !== expected.shopId || existing.kind !== expected.kind || existing.amountTzs !== expected.amountTzs) {
    throw failure("This payment retry key was already used with different details.", 409, "RETRY_KEY_CONFLICT");
  }
  const savedPhone = normalizePhone(existing.kind === "DEPOSIT" ? existing.payerPhone : existing.recipientPhone);
  if (expected.phone && savedPhone !== expected.phone) {
    throw failure("This payment retry key was already used with different details.", 409, "RETRY_KEY_CONFLICT");
  }
  if (existing.kind === "ADJUSTMENT") {
    const metadata = existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
    if (metadata.direction !== expected.direction || metadata.reason !== expected.reason) {
      throw failure("This payment retry key was already used with different details.", 409, "RETRY_KEY_CONFLICT");
    }
  }
}

async function lockWallet(tx, shopId) {
  const created = await tx.merchantWallet.upsert({
    where: { businessShopId: shopId },
    create: { businessShopId: shopId },
    update: {},
  });
  if (typeof tx.$queryRaw === "function") {
    await tx.$queryRaw`SELECT "id" FROM "merchant_wallets" WHERE "id" = ${created.id} FOR UPDATE`;
  }
  const wallet = await tx.merchantWallet.findUnique({ where: { id: created.id } });
  if (!wallet) throw failure("Merchant balance wallet could not be loaded.", 500, "WALLET_NOT_FOUND");
  return wallet;
}

async function lockWalletTransaction(tx, transactionId) {
  if (typeof tx.$queryRaw === "function") {
    await tx.$queryRaw`SELECT "id" FROM "merchant_wallet_transactions" WHERE "id" = ${transactionId} FOR UPDATE`;
  }
  return tx.merchantWalletTransaction.findUnique({ where: { id: transactionId } });
}

async function appendEntry(tx, wallet, transaction, { type, direction, amountTzs, description, allowNegative = false }) {
  const amount = wholeTzs(amountTzs, "Ledger amount");
  if (!new Set(["CREDIT", "DEBIT"]).has(direction)) throw failure("Invalid wallet ledger direction.", 500, "LEDGER_DIRECTION_INVALID");

  const existing = await tx.merchantWalletEntry.findUnique({
    where: { transactionId_type: { transactionId: transaction.id, type } },
  });
  if (existing) {
    if (existing.amountTzs !== amount || existing.direction !== direction) throw failure("Wallet entry retry did not match the original movement.", 409, "LEDGER_RETRY_CONFLICT");
    return existing;
  }

  const nextBalance = wallet.balanceTzs + (direction === "CREDIT" ? amount : -amount);
  if (!allowNegative && nextBalance < 0) throw failure("Insufficient available balance.", 409, "INSUFFICIENT_BALANCE");
  const guarded = await tx.merchantWallet.updateMany({
    where: { id: wallet.id, balanceTzs: wallet.balanceTzs },
    data: { balanceTzs: nextBalance },
  });
  if (guarded.count !== 1) throw failure("Merchant balance changed before this request was saved. Refresh and try again.", 409, "WALLET_CONFLICT");
  wallet.balanceTzs = nextBalance;
  return tx.merchantWalletEntry.create({
    data: {
      walletId: wallet.id,
      transactionId: transaction.id,
      shopId: transaction.shopId,
      type,
      direction,
      amountTzs: amount,
      balanceAfterTzs: nextBalance,
      description: cleanShortText(description, 500),
    },
  });
}

function assertSameSubscriptionRetry(existing, { shopId, plan, kind, extraBranches }) {
  const metadata = existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
  if (existing.shopId !== shopId
    || existing.kind !== "SUBSCRIPTION"
    || existing.status !== "COMPLETED"
    || metadata.plan !== plan
    || metadata.kind !== kind
    || Number(metadata.extraBranches || 0) !== extraBranches) {
    throw failure("This payment retry key was already used with different details.", 409, "RETRY_KEY_CONFLICT");
  }
}

async function paySubscriptionFromBalance({ shopId, userId, requestKey, plan, kind = "RENEWAL", extraBranches = 0 }) {
  requireEnabled(shopId);
  const key = validRequestKey(requestKey);
  const normalizedPlan = String(plan || "").toUpperCase();
  const normalizedKind = String(kind || "RENEWAL").toUpperCase();
  const normalizedExtraBranches = Number(extraBranches || 0);

  return prisma.$transaction(async (tx) => {
    if (typeof tx.$queryRaw === "function") {
      await tx.$queryRaw`SELECT "id" FROM "shops" WHERE "id" = ${shopId} FOR UPDATE`;
    }

    const existing = await tx.merchantWalletTransaction.findUnique({ where: { requestKey: key } });
    if (existing) {
      assertSameSubscriptionRetry(existing, {
        shopId,
        plan: normalizedPlan,
        kind: normalizedKind,
        extraBranches: normalizedExtraBranches,
      });
      const existingWallet = await tx.merchantWallet.findUnique({ where: { id: existing.walletId } });
      const existingShop = await tx.shop.findUnique({ where: { id: shopId } });
      return {
        transaction: existing,
        balanceTzs: existingWallet?.balanceTzs || 0,
        subscriptionEndsAt: existingShop?.subscriptionEndsAt || null,
        reused: true,
      };
    }

    const shop = await tx.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw failure("Shop not found.", 404, "SHOP_NOT_FOUND");
    const quote = priceSubscription(shop, {
      plan: normalizedPlan,
      kind: normalizedKind,
      extraBranches: normalizedExtraBranches,
      months: 1,
    });
    if (!shop.isActive) throw failure("Your shop is suspended. Contact support before paying.", 403, "SHOP_SUSPENDED");
    if (shop.subscriptionEndsAt > new Date() && shop.plan !== quote.plan) {
      throw failure("Contact support to change plans before your current subscription ends.", 409, "PLAN_CHANGE_REQUIRES_SUPPORT");
    }
    await validateBranchCapacity(tx, shopId, quote.plan, quote.extraBranches);

    const wallet = await lockWallet(tx, shopId);
    if (wallet.balanceTzs < quote.amount) {
      throw failure("Your merchant balance is not enough for this subscription payment.", 409, "INSUFFICIENT_BALANCE");
    }

    const completedAt = new Date();
    const transaction = await tx.merchantWalletTransaction.create({
      data: {
        walletId: wallet.id,
        shopId,
        kind: "SUBSCRIPTION",
        status: "COMPLETED",
        requestKey: key,
        amountTzs: quote.amount,
        totalDebitTzs: quote.amount,
        requestedByUserId: userId,
        completedAt,
        metadata: {
          plan: quote.plan,
          kind: quote.kind,
          extraBranches: quote.extraBranches,
          expectedEndsAt: quote.expectedEndsAt?.toISOString() || null,
        },
      },
    });
    await appendEntry(tx, wallet, transaction, {
      type: "SUBSCRIPTION_PAYMENT",
      direction: "DEBIT",
      amountTzs: quote.amount,
      description: `DukaPilot ${quote.plan} ${quote.kind === "BRANCH_ADDON" ? "branch capacity" : "subscription"}`,
    });
    await tx.subscriptionPayment.create({
      data: {
        shopId,
        plan: quote.plan,
        amount: quote.amount,
        months: quote.kind === "BRANCH_ADDON" ? 0 : 1,
        kind: quote.kind,
        extraBranches: quote.extraBranches,
        method: "MERCHANT_BALANCE",
        reference: transaction.id,
        normalizedReference: `WALLET:${transaction.id}`,
        status: "CONFIRMED",
        reviewedBy: userId,
        reviewedAt: completedAt,
        note: "Paid from DukaPilot Merchant Balance",
      },
    });
    const updatedShop = await tx.shop.update({
      where: { id: shopId },
      data: {
        plan: quote.plan,
        additionalBranchSlots: quote.extraBranches,
        ...(quote.kind === "BRANCH_ADDON" ? {} : { subscriptionEndsAt: ntzs.renewalEnd(shop, completedAt) }),
      },
    });
    return {
      transaction,
      balanceTzs: wallet.balanceTzs,
      subscriptionEndsAt: updatedShop.subscriptionEndsAt,
      reused: false,
    };
  });
}

function providerFailure(error, defaultMessage) {
  const providerCode = cleanShortText(error?.providerCode || error?.code || "PROVIDER_UNAVAILABLE", 80);
  // nTZS documents these withdrawal response statuses as pre-movement
  // rejections (including 503, which explicitly says nothing moved). A 502,
  // missing response, or any undocumented outcome remains uncertain and must
  // keep the reserved balance locked until reconciliation can prove the state.
  const definitelyRejectedStatus = [400, 401, 403, 429, 503].includes(Number(error?.providerStatus));
  const uncertain = !definitelyRejectedStatus
    && !CERTAIN_NO_MOVEMENT_PROVIDER_CODES.has(String(providerCode || "").toLowerCase());
  return {
    failureCode: providerCode,
    failureReason: defaultMessage,
    uncertain,
  };
}

function safeProviderInstruction(value) {
  if (typeof value === "string") return cleanShortText(value, 1000);
  if (value && typeof value === "object") return cleanShortText(value.message || value.instruction || "", 1000);
  return null;
}

function providerIdempotencyKey(transaction) {
  // The browser sends a UUID for this DukaPilot operation. Reuse it verbatim
  // with nTZS so a dropped response can only resume the same provider action.
  return transaction.requestKey;
}

function withdrawalProviderFeeTzs(provider) {
  return optionalWholeTzs(provider?.fees?.totalFeeTzs ?? provider?.totalFeeTzs, "Provider withdrawal fee");
}

function isCompletedWithdrawalProvider(provider) {
  const payout = providerState(provider?.payoutStatus);
  if (payout) return ["completed", "succeeded", "paid"].includes(payout);
  // The documented API has both a detailed burned + payoutStatus response and
  // an older compact response where a successful burn is the terminal payout
  // state. In either case it is never safe to return the merchant's held funds
  // until a later provider record explicitly says failed or reverted.
  return ["burned", "completed", "succeeded", "paid"].includes(providerState(provider?.status));
}

function isTerminalWithdrawalFailure(provider) {
  return isTerminalFailureStatus(provider?.payoutStatus) || isTerminalFailureStatus(provider?.status);
}

function depositPayload(transaction) {
  return {
    userId: ntzs.merchantWalletUserId(),
    amountTzs: transaction.amountTzs,
    // nTZS documents E.164 digits without the plus sign. DukaPilot keeps the
    // canonical +255 form internally and converts only at the provider edge.
    phoneNumber: ntzsPhone(transaction.payerPhone),
    paymentMethod: "mobile_money",
  };
}

async function hydrateTransaction(id) {
  return prisma.merchantWalletTransaction.findUnique({
    where: { id },
    include: { wallet: true, shop: { select: { id: true, name: true, user: { select: { name: true, phone: true } } } } },
  });
}

async function updateUnsettledTransaction(id, data) {
  await prisma.merchantWalletTransaction.updateMany({
    where: { id, status: { in: Array.from(PENDING_STATUSES) } },
    data,
  });
  return hydrateTransaction(id);
}

async function createDeposit({ shopId, userId, amountTzs, phone, requestKey }) {
  requireEnabled(shopId);
  const amount = wholeTzs(amountTzs, "Deposit amount");
  const normalizedPhone = normalizePhone(phone);
  if (!isTanzanianMobile(normalizedPhone)) throw failure("Enter a valid Tanzanian mobile number.", 400, "INVALID_PHONE");
  const key = validRequestKey(requestKey);

  const preexisting = await prisma.merchantWalletTransaction.findUnique({ where: { requestKey: key } });
  if (preexisting) {
    assertSameRetry(preexisting, { shopId, kind: "DEPOSIT", amountTzs: amount, phone: normalizedPhone });
    return { transaction: await resumeMerchantTransaction(preexisting.id), reused: true };
  }

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const wallet = await lockWallet(tx, shopId);
      const existing = await tx.merchantWalletTransaction.findUnique({ where: { requestKey: key } });
      if (existing) {
        assertSameRetry(existing, { shopId, kind: "DEPOSIT", amountTzs: amount, phone: normalizedPhone });
        return { transaction: existing, reused: true };
      }
      const transaction = await tx.merchantWalletTransaction.create({
        data: {
          walletId: wallet.id,
          shopId,
          kind: "DEPOSIT",
          status: "PENDING",
          requestKey: key,
          amountTzs: amount,
          payerPhone: normalizedPhone,
          requestedByUserId: userId,
        },
      });
      return { transaction, reused: false };
    });
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const existing = await prisma.merchantWalletTransaction.findUnique({ where: { requestKey: key } });
    if (!existing) throw error;
    assertSameRetry(existing, { shopId, kind: "DEPOSIT", amountTzs: amount, phone: normalizedPhone });
    return { transaction: await resumeMerchantTransaction(existing.id), reused: true };
  }
  if (created.reused) return { transaction: await resumeMerchantTransaction(created.transaction.id), reused: true };

  try {
    const provider = await ntzs.request("/deposits", {
      method: "POST",
      headers: { "Idempotency-Key": providerIdempotencyKey(created.transaction) },
      body: JSON.stringify(depositPayload(created.transaction)),
    });
    if (typeof provider.id !== "string" || !provider.id.trim()) throw Object.assign(new Error("Provider did not return a deposit ID"), { uncertain: true });
    await prisma.merchantWalletTransaction.update({
      where: { id: created.transaction.id },
      data: {
        providerId: provider.id,
        providerStatus: cleanShortText(provider.status, 80),
        providerInstruction: safeProviderInstruction(provider.instructions),
      },
    });
    const reconciled = await reconcileDeposit(created.transaction.id).catch(() => null);
    return { transaction: reconciled || await hydrateTransaction(created.transaction.id), reused: false };
  } catch (error) {
    const failureInfo = providerFailure(error, "The deposit request could not be confirmed. No balance was added.");
    const updated = await updateUnsettledTransaction(created.transaction.id, {
      status: failureInfo.uncertain ? "REVIEW" : "FAILED",
      failureCode: failureInfo.failureCode,
      failureReason: failureInfo.failureReason,
    });
    return { transaction: updated, reused: false };
  }
}

async function completeDeposit(transactionId, provider) {
  return prisma.$transaction(async (tx) => {
    const current = await lockWalletTransaction(tx, transactionId);
    if (!current) return null;
    if (current.status === "REVERSED") return current;
    const wallet = await lockWallet(tx, current.shopId);
    await appendEntry(tx, wallet, current, {
      type: "DEPOSIT_CREDIT",
      direction: "CREDIT",
      amountTzs: current.amountTzs,
      description: "nTZS merchant balance deposit",
    });
    return tx.merchantWalletTransaction.update({
      where: { id: current.id },
      data: { status: "COMPLETED", providerStatus: cleanShortText(provider.status, 80) || "completed", completedAt: current.completedAt || new Date(), failureCode: null, failureReason: null },
    });
  });
}

async function reverseDeposit(transactionId, provider, reason = "The provider reversed this deposit.") {
  return prisma.$transaction(async (tx) => {
    const current = await lockWalletTransaction(tx, transactionId);
    if (!current || current.status === "REVERSED") return current;
    if (current.status !== "COMPLETED") {
      return tx.merchantWalletTransaction.update({
        where: { id: current.id },
        data: { status: "FAILED", providerStatus: cleanShortText(provider?.status, 80), failureReason: reason, reversedAt: new Date() },
      });
    }
    const wallet = await lockWallet(tx, current.shopId);
    await appendEntry(tx, wallet, current, {
      type: "DEPOSIT_REVERSAL",
      direction: "DEBIT",
      amountTzs: current.amountTzs,
      description: "Reversal of nTZS merchant balance deposit",
      allowNegative: true,
    });
    return tx.merchantWalletTransaction.update({
      where: { id: current.id },
      data: { status: "REVERSED", providerStatus: cleanShortText(provider?.status, 80), failureReason: reason, reversedAt: new Date() },
    });
  });
}

async function reconcileDeposit(transactionId) {
  const transaction = await prisma.merchantWalletTransaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.kind !== "DEPOSIT" || !transaction.providerId) return transaction;
  let provider;
  try {
    provider = await ntzs.request(`/deposits/${encodeURIComponent(transaction.providerId)}`);
  } catch {
    return transaction;
  }
  try {
    if (ntzs.isDepositCompletedStatus(provider.status)) {
      ntzs.verifyMerchantDeposit(transaction, provider, ntzs.merchantWalletUserId());
      return completeDeposit(transaction.id, provider);
    }
  } catch {
    return updateUnsettledTransaction(transaction.id, {
      status: "REVIEW",
      providerStatus: cleanShortText(provider.status, 80),
      failureCode: "DEPOSIT_VERIFICATION_MISMATCH",
      failureReason: "The provider deposit details did not match the original request.",
    });
  }
  if (ntzs.isDepositTerminalFailureStatus(provider.status)) return reverseDeposit(transaction.id, provider, "The provider did not complete this deposit.");
  return updateUnsettledTransaction(transaction.id, {
    providerStatus: cleanShortText(provider.status, 80),
    status: transaction.status === "REVIEW" ? "REVIEW" : "PENDING",
  });
}

async function providerWithdrawalQuote({ shopId, amountTzs, phone }) {
  requireEnabled(shopId);
  const settings = merchantWalletSettings();
  const amount = wholeTzs(amountTzs, "Withdrawal amount");
  if (amount < settings.minimumWithdrawalTzs) {
    throw failure(`The minimum withdrawal is TZS ${settings.minimumWithdrawalTzs.toLocaleString("en-TZ")}.`, 400, "WITHDRAWAL_BELOW_MINIMUM");
  }
  const normalizedPhone = normalizePhone(phone);
  if (!isTanzanianMobile(normalizedPhone)) throw failure("Enter a valid Tanzanian mobile number.", 400, "INVALID_PHONE");
  const provider = await ntzs.request("/withdrawals/quote", {
    method: "POST",
    body: JSON.stringify({ userId: ntzs.merchantWalletUserId(), amountTzs: amount, phoneNumber: ntzsPhone(normalizedPhone) }),
  });
  const providerFeeTzs = withdrawalProviderFeeTzs(provider);
  const receiveAmountTzs = optionalWholeTzs(provider.receiveAmountTzs ?? amount, "Provider receive amount");
  const burnAmountTzs = optionalWholeTzs(provider.burnAmountTzs ?? amount + providerFeeTzs, "Provider withdrawal total");
  if (receiveAmountTzs !== amount || burnAmountTzs !== amount + providerFeeTzs || typeof provider.quoteId !== "string" || !provider.quoteId.trim()) {
    throw failure("The withdrawal quote did not match the requested amount.", 502, "WITHDRAWAL_QUOTE_MISMATCH");
  }
  const platformFee = platformFeeTzs(amount, settings.feeBps);
  const totalDebitTzs = amount + platformFee + providerFeeTzs;
  if (!Number.isSafeInteger(totalDebitTzs) || totalDebitTzs > MAX_TZS) throw failure("Withdrawal total is too large.", 400, "INVALID_AMOUNT");
  return {
    amountTzs: amount,
    phone: normalizedPhone,
    quoteId: provider.quoteId,
    quoteExpiresAt: provider.expiresAt || null,
    recipientName: cleanShortText(provider.recipientName, 160),
    payoutRail: cleanShortText(provider.payoutRail, 80),
    platformFeeTzs: platformFee,
    providerFeeTzs,
    totalDebitTzs,
  };
}

async function getWithdrawalQuote({ shopId, amountTzs, phone }) {
  const quote = await providerWithdrawalQuote({ shopId, amountTzs, phone });
  const wallet = await prisma.merchantWallet.findUnique({ where: { businessShopId: shopId }, select: { balanceTzs: true } });
  return { ...quote, availableBalanceTzs: wallet?.balanceTzs || 0, canWithdraw: (wallet?.balanceTzs || 0) >= quote.totalDebitTzs };
}

function sameOptionalText(left, right) {
  return String(left || "").trim() === String(right || "").trim();
}

function assertConfirmedWithdrawalQuote(confirmedQuote, quote) {
  if (!confirmedQuote
    || Number(confirmedQuote.amountTzs) !== quote.amountTzs
    || normalizePhone(confirmedQuote.phone) !== quote.phone
    || Number(confirmedQuote.providerFeeTzs) !== quote.providerFeeTzs
    || Number(confirmedQuote.totalDebitTzs) !== quote.totalDebitTzs
    || !sameOptionalText(confirmedQuote.recipientName, quote.recipientName)
    || !sameOptionalText(confirmedQuote.payoutRail, quote.payoutRail)) {
    throw failure("The provider fee or recipient changed. Preview the updated withdrawal before confirming.", 409, "WITHDRAWAL_QUOTE_CHANGED");
  }
}

async function holdWithdrawal(tx, wallet, transaction) {
  await appendEntry(tx, wallet, transaction, {
    type: "WITHDRAWAL_PRINCIPAL",
    direction: "DEBIT",
    amountTzs: transaction.amountTzs,
    description: "nTZS merchant balance withdrawal",
  });
  if (transaction.platformFeeTzs > 0) {
    await appendEntry(tx, wallet, transaction, {
      type: "WITHDRAWAL_PLATFORM_FEE",
      direction: "DEBIT",
      amountTzs: transaction.platformFeeTzs,
      description: "DukaPilot withdrawal fee",
    });
  }
  if (transaction.providerFeeTzs > 0) {
    await appendEntry(tx, wallet, transaction, {
      type: "WITHDRAWAL_PROVIDER_FEE",
      direction: "DEBIT",
      amountTzs: transaction.providerFeeTzs,
      description: "Provider payout fee",
    });
  }
}

async function reverseWithdrawal(transactionId, provider, reason = "The provider did not complete this withdrawal.") {
  return prisma.$transaction(async (tx) => {
    const current = await lockWalletTransaction(tx, transactionId);
    if (!current || ["FAILED", "REVERSED", "CANCELLED"].includes(current.status)) return current;
    const wasCompleted = current.status === "COMPLETED";
    const wallet = await lockWallet(tx, current.shopId);
    await appendEntry(tx, wallet, current, {
      type: "WITHDRAWAL_REVERSAL_PRINCIPAL",
      direction: "CREDIT",
      amountTzs: current.amountTzs,
      description: "Return of failed withdrawal amount",
    });
    if (current.platformFeeTzs > 0) {
      await appendEntry(tx, wallet, current, {
        type: "WITHDRAWAL_REVERSAL_PLATFORM_FEE",
        direction: "CREDIT",
        amountTzs: current.platformFeeTzs,
        description: "Return of withdrawal fee",
      });
    }
    if (current.providerFeeTzs > 0) {
      await appendEntry(tx, wallet, current, {
        type: "WITHDRAWAL_REVERSAL_PROVIDER_FEE",
        direction: "CREDIT",
        amountTzs: current.providerFeeTzs,
        description: "Return of provider payout fee",
      });
    }
    return tx.merchantWalletTransaction.update({
      where: { id: current.id },
      data: {
        status: wasCompleted ? "REVERSED" : "FAILED",
        providerStatus: cleanShortText(provider?.status, 80),
        failureReason: reason,
        reversedAt: new Date(),
      },
    });
  });
}

async function completeWithdrawal(transactionId, provider) {
  return updateUnsettledTransaction(transactionId, {
    status: "COMPLETED",
    providerStatus: cleanShortText(provider.status, 80) || "completed",
    providerInstruction: safeProviderInstruction(provider.confirmationMessage || provider.message),
    completedAt: new Date(),
    failureCode: null,
    failureReason: null,
  });
}

function verifyWithdrawalProviderResponse(transaction, provider) {
  if (!provider
    || (provider.id && transaction.providerId && provider.id !== transaction.providerId)
    || provider.livemode === false
    || (provider.userId && provider.userId !== ntzs.merchantWalletUserId())) {
    throw failure("The provider withdrawal details did not match the original request.", 409, "WITHDRAWAL_VERIFICATION_MISMATCH");
  }
  const actualReceive = optionalWholeTzs(provider.receiveAmountTzs ?? transaction.amountTzs, "Provider receive amount");
  const actualFee = withdrawalProviderFeeTzs({ ...provider, totalFeeTzs: provider?.fees?.totalFeeTzs ?? provider?.totalFeeTzs ?? transaction.providerFeeTzs });
  const actualBurn = optionalWholeTzs(provider?.burnAmountTzs ?? actualReceive + actualFee, "Provider withdrawal total");
  if (actualReceive !== transaction.amountTzs || actualFee !== transaction.providerFeeTzs || actualBurn !== actualReceive + actualFee) {
    throw failure("The provider withdrawal amount did not match the quote.", 409, "WITHDRAWAL_VERIFICATION_MISMATCH");
  }
}

async function reconcileWithdrawal(transactionId) {
  const transaction = await prisma.merchantWalletTransaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.kind !== "WITHDRAWAL" || !transaction.providerId) return transaction;
  let provider;
  try {
    provider = await ntzs.request(`/withdrawals/${encodeURIComponent(transaction.providerId)}`);
  } catch {
    return transaction;
  }
  try {
    verifyWithdrawalProviderResponse(transaction, provider);
  } catch {
    return updateUnsettledTransaction(transaction.id, {
      status: "REVIEW",
      providerStatus: cleanShortText(provider.status, 80),
      failureCode: "WITHDRAWAL_VERIFICATION_MISMATCH",
      failureReason: "The provider withdrawal details did not match the original quote.",
    });
  }
  if (isCompletedWithdrawalProvider(provider)) {
    if (transaction.status === "REVERSED" || transaction.status === "FAILED") return transaction;
    return completeWithdrawal(transaction.id, provider);
  }
  if (isTerminalWithdrawalFailure(provider)) return reverseWithdrawal(transaction.id, provider);
  return updateUnsettledTransaction(transaction.id, {
    providerStatus: cleanShortText(provider.status, 80),
    status: transaction.status === "REVIEW" ? "REVIEW" : "PENDING",
  });
}

async function createWithdrawal({ shopId, userId, amountTzs, phone, requestKey, confirmedQuote }) {
  requireEnabled(shopId);
  const amount = wholeTzs(amountTzs, "Withdrawal amount");
  const normalizedPhone = normalizePhone(phone);
  if (!isTanzanianMobile(normalizedPhone)) throw failure("Enter a valid Tanzanian mobile number.", 400, "INVALID_PHONE");
  const key = validRequestKey(requestKey);
  const preexisting = await prisma.merchantWalletTransaction.findUnique({ where: { requestKey: key } });
  if (preexisting) {
    assertSameRetry(preexisting, { shopId, kind: "WITHDRAWAL", amountTzs: amount, phone: normalizedPhone });
    return { transaction: await resumeMerchantTransaction(preexisting.id), reused: true };
  }

  // The quote is recalculated server-side directly before reserving funds. A
  // browser-provided quote ID is never trusted because provider fees can move.
  const quote = await providerWithdrawalQuote({ shopId, amountTzs: amount, phone: normalizedPhone });
  // The browser's snapshot never controls an amount. It only proves the owner
  // saw the exact provider fee and destination that this server-side quote
  // will execute; a changed quote must be disclosed and confirmed again.
  assertConfirmedWithdrawalQuote(confirmedQuote, quote);
  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const wallet = await lockWallet(tx, shopId);
      const existing = await tx.merchantWalletTransaction.findUnique({ where: { requestKey: key } });
      if (existing) {
        assertSameRetry(existing, { shopId, kind: "WITHDRAWAL", amountTzs: amount, phone: normalizedPhone });
        return { transaction: existing, reused: true };
      }
      if (wallet.balanceTzs < quote.totalDebitTzs) throw failure("Your available balance is not enough for this withdrawal and its fees.", 409, "INSUFFICIENT_BALANCE");
      const transaction = await tx.merchantWalletTransaction.create({
        data: {
          walletId: wallet.id,
          shopId,
          kind: "WITHDRAWAL",
          status: "PENDING",
          requestKey: key,
          amountTzs: quote.amountTzs,
          platformFeeTzs: quote.platformFeeTzs,
          providerFeeTzs: quote.providerFeeTzs,
          totalDebitTzs: quote.totalDebitTzs,
          recipientPhone: quote.phone,
          recipientName: quote.recipientName,
          payoutRail: quote.payoutRail,
          providerQuoteId: quote.quoteId,
          requestedByUserId: userId,
        },
      });
      await holdWithdrawal(tx, wallet, transaction);
      return { transaction, reused: false };
    });
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const existing = await prisma.merchantWalletTransaction.findUnique({ where: { requestKey: key } });
    if (!existing) throw error;
    assertSameRetry(existing, { shopId, kind: "WITHDRAWAL", amountTzs: amount, phone: normalizedPhone });
    return { transaction: await resumeMerchantTransaction(existing.id), reused: true };
  }
  if (created.reused) return { transaction: await resumeMerchantTransaction(created.transaction.id), reused: true };

  try {
    const provider = await ntzs.request("/withdrawals", {
      method: "POST",
      headers: { "Idempotency-Key": providerIdempotencyKey(created.transaction) },
      body: JSON.stringify({
        userId: ntzs.merchantWalletUserId(),
        amountTzs: quote.amountTzs,
        phoneNumber: ntzsPhone(quote.phone),
        quoteId: quote.quoteId,
      }),
    });
    if (typeof provider.id !== "string" || !provider.id.trim()) throw Object.assign(new Error("Provider did not return a withdrawal ID"), { uncertain: true });
    await prisma.merchantWalletTransaction.update({
      where: { id: created.transaction.id },
      data: {
        providerId: provider.id,
        providerStatus: cleanShortText(provider.status, 80),
        payoutRail: cleanShortText(provider.payoutRail, 80) || quote.payoutRail,
        recipientName: cleanShortText(provider.recipientName, 160) || quote.recipientName,
        providerInstruction: safeProviderInstruction(provider.confirmationMessage || provider.message),
      },
    });
    // Store the provider reference before validating its final figures. If its
    // response is surprising after it accepted the payout, reconciliation can
    // still fetch the exact provider record without ever issuing a duplicate.
    verifyWithdrawalProviderResponse({ ...created.transaction, providerId: provider.id, providerFeeTzs: quote.providerFeeTzs }, provider);
    const reconciled = await reconcileWithdrawal(created.transaction.id).catch(() => null);
    return { transaction: reconciled || await hydrateTransaction(created.transaction.id), reused: false };
  } catch (error) {
    const failureInfo = providerFailure(error, "The withdrawal request needs review before any balance is released.");
    if (failureInfo.uncertain || error?.uncertain) {
      await updateUnsettledTransaction(created.transaction.id, {
        status: "REVIEW",
        failureCode: failureInfo.failureCode,
        failureReason: failureInfo.failureReason,
      });
    } else {
      await reverseWithdrawal(created.transaction.id, null, "The provider could not start this withdrawal. Your balance was returned.");
    }
    return { transaction: await hydrateTransaction(created.transaction.id), reused: false };
  }
}

async function reconcileTransaction(transactionId) {
  const transaction = await prisma.merchantWalletTransaction.findUnique({ where: { id: transactionId } });
  if (!transaction) throw failure("Wallet transaction not found.", 404, "WALLET_TRANSACTION_NOT_FOUND");
  if (transaction.kind === "DEPOSIT") return reconcileDeposit(transaction.id);
  if (transaction.kind === "WITHDRAWAL") return reconcileWithdrawal(transaction.id);
  return transaction;
}

// A network response can be lost after nTZS has received a request. Resume
// with the exact original provider idempotency key so this never creates a
// second collection or payout. Failed records are intentionally not resumed.
async function resumeMerchantTransaction(transactionId) {
  const transaction = await prisma.merchantWalletTransaction.findUnique({ where: { id: transactionId } });
  if (!transaction) throw failure("Wallet transaction not found.", 404, "WALLET_TRANSACTION_NOT_FOUND");
  if (transaction.providerId) return reconcileTransaction(transaction.id);
  if (!PENDING_STATUSES.has(transaction.status)) return hydrateTransaction(transaction.id);
  requireProviderConfigured();

  if (transaction.kind === "DEPOSIT") {
    try {
      const provider = await ntzs.request("/deposits", {
        method: "POST",
        headers: { "Idempotency-Key": providerIdempotencyKey(transaction) },
        body: JSON.stringify(depositPayload(transaction)),
      });
      if (typeof provider.id !== "string" || !provider.id.trim()) throw Object.assign(new Error("Provider did not return a deposit ID"), { uncertain: true });
      await prisma.merchantWalletTransaction.update({
        where: { id: transaction.id },
        data: {
          providerId: provider.id,
          providerStatus: cleanShortText(provider.status, 80),
          providerInstruction: safeProviderInstruction(provider.instructions),
        },
      });
      return (await reconcileDeposit(transaction.id).catch(() => null)) || await hydrateTransaction(transaction.id);
    } catch (error) {
      const failureInfo = providerFailure(error, "The deposit request could not be confirmed. No balance was added.");
      await updateUnsettledTransaction(transaction.id, {
        status: failureInfo.uncertain || error?.uncertain ? "REVIEW" : "FAILED",
        failureCode: failureInfo.failureCode,
        failureReason: failureInfo.failureReason,
      });
      return hydrateTransaction(transaction.id);
    }
  }

  if (transaction.kind === "WITHDRAWAL") {
    try {
      if (!transaction.providerQuoteId || !isTanzanianMobile(transaction.recipientPhone)) {
        throw failure("The original withdrawal request cannot be resumed automatically and needs review.", 409, "WITHDRAWAL_RESUME_INVALID");
      }
      const provider = await ntzs.request("/withdrawals", {
        method: "POST",
        headers: { "Idempotency-Key": providerIdempotencyKey(transaction) },
        body: JSON.stringify({
          userId: ntzs.merchantWalletUserId(),
          amountTzs: transaction.amountTzs,
          phoneNumber: ntzsPhone(transaction.recipientPhone),
          quoteId: transaction.providerQuoteId,
        }),
      });
      if (typeof provider.id !== "string" || !provider.id.trim()) throw Object.assign(new Error("Provider did not return a withdrawal ID"), { uncertain: true });
      await prisma.merchantWalletTransaction.update({
        where: { id: transaction.id },
        data: {
          providerId: provider.id,
          providerStatus: cleanShortText(provider.status, 80),
          payoutRail: cleanShortText(provider.payoutRail, 80) || transaction.payoutRail,
          recipientName: cleanShortText(provider.recipientName, 160) || transaction.recipientName,
          providerInstruction: safeProviderInstruction(provider.confirmationMessage || provider.message),
        },
      });
      verifyWithdrawalProviderResponse({ ...transaction, providerId: provider.id }, provider);
      return (await reconcileWithdrawal(transaction.id).catch(() => null)) || await hydrateTransaction(transaction.id);
    } catch (error) {
      const failureInfo = providerFailure(error, "The withdrawal request needs review before any balance is released.");
      if (failureInfo.uncertain || error?.uncertain) {
        await updateUnsettledTransaction(transaction.id, {
          status: "REVIEW",
          failureCode: failureInfo.failureCode,
          failureReason: failureInfo.failureReason,
        });
      } else {
        await reverseWithdrawal(transaction.id, null, "The provider could not start this withdrawal. Your balance was returned.");
      }
      return hydrateTransaction(transaction.id);
    }
  }

  return hydrateTransaction(transaction.id);
}

async function reconcileWebhook(event) {
  const type = String(event?.type || "").toLowerCase();
  const data = event?.data || {};
  if (type.startsWith("deposit.")) {
    const providerId = typeof data.depositId === "string" ? data.depositId : typeof data.id === "string" ? data.id : null;
    if (!providerId) return false;
    const transaction = await prisma.merchantWalletTransaction.findUnique({ where: { providerId } });
    if (!transaction || transaction.kind !== "DEPOSIT") return false;
    await reconcileDeposit(transaction.id);
    return true;
  }
  if (type.startsWith("withdrawal.") || type.startsWith("payout.")) {
    const providerId = typeof data.withdrawalId === "string" ? data.withdrawalId : typeof data.payoutId === "string" ? data.payoutId : typeof data.id === "string" ? data.id : null;
    if (!providerId) return false;
    const transaction = await prisma.merchantWalletTransaction.findUnique({ where: { providerId } });
    if (!transaction || transaction.kind !== "WITHDRAWAL") return false;
    await reconcileWithdrawal(transaction.id);
    return true;
  }
  return false;
}

async function merchantWalletOverview(shopId, { page = 1, limit = 20, status, kind } = {}) {
  const safePage = Math.min(Math.max(Number(page) || 1, 1), 100000);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const wallet = await prisma.merchantWallet.findUnique({ where: { businessShopId: shopId } });
  const where = { shopId };
  if (["DEPOSIT", "WITHDRAWAL", "ADJUSTMENT", "SUBSCRIPTION"].includes(String(kind || "").toUpperCase())) where.kind = String(kind).toUpperCase();
  if (["PENDING", "REVIEW", "COMPLETED", "FAILED", "REVERSED", "CANCELLED"].includes(String(status || "").toUpperCase())) where.status = String(status).toUpperCase();
  const [transactions, total, pendingDeposits, pendingWithdrawals] = await Promise.all([
    prisma.merchantWalletTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip: (safePage - 1) * safeLimit, take: safeLimit }),
    prisma.merchantWalletTransaction.count({ where }),
    prisma.merchantWalletTransaction.aggregate({ where: { shopId, kind: "DEPOSIT", status: { in: ["PENDING", "REVIEW"] } }, _sum: { amountTzs: true } }),
    prisma.merchantWalletTransaction.aggregate({ where: { shopId, kind: "WITHDRAWAL", status: { in: ["PENDING", "REVIEW"] } }, _sum: { totalDebitTzs: true } }),
  ]);
  return {
    config: { ...merchantWalletSettings(), enabled: merchantWalletEnabledForShop(shopId) },
    wallet: {
      balanceTzs: wallet?.balanceTzs || 0,
      pendingDepositTzs: pendingDeposits._sum.amountTzs || 0,
      pendingWithdrawalTzs: pendingWithdrawals._sum.totalDebitTzs || 0,
    },
    transactions: transactions.map(publicTransaction),
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) },
  };
}

async function listAdminTransactions({ page = 1, limit = 25, status, kind, search } = {}) {
  const safePage = Math.min(Math.max(Number(page) || 1, 1), 100000);
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const where = {};
  if (["DEPOSIT", "WITHDRAWAL", "ADJUSTMENT", "SUBSCRIPTION"].includes(String(kind || "").toUpperCase())) where.kind = String(kind).toUpperCase();
  if (["PENDING", "REVIEW", "COMPLETED", "FAILED", "REVERSED", "CANCELLED"].includes(String(status || "").toUpperCase())) where.status = String(status).toUpperCase();
  const query = String(search || "").trim().slice(0, 100);
  if (query) {
    where.OR = [
      { providerId: { contains: query, mode: "insensitive" } },
      { shop: { name: { contains: query, mode: "insensitive" } } },
    ];
  }
  const [transactions, total] = await Promise.all([
    prisma.merchantWalletTransaction.findMany({
      where,
      include: { shop: { select: { id: true, name: true, user: { select: { name: true, phone: true } } } } },
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    }),
    prisma.merchantWalletTransaction.count({ where }),
  ]);
  return { transactions: transactions.map(adminTransaction), pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.max(1, Math.ceil(total / safeLimit)) } };
}

async function adminOverview() {
  const [wallets, pending, completedFees, completedSubscriptions] = await Promise.all([
    prisma.merchantWallet.aggregate({ _sum: { balanceTzs: true }, _count: { id: true } }),
    prisma.merchantWalletTransaction.groupBy({ by: ["kind", "status"], where: { status: { in: ["PENDING", "REVIEW"] } }, _sum: { amountTzs: true, totalDebitTzs: true }, _count: { id: true } }),
    prisma.merchantWalletTransaction.aggregate({ where: { kind: "WITHDRAWAL", status: "COMPLETED" }, _sum: { platformFeeTzs: true } }),
    prisma.merchantWalletTransaction.aggregate({ where: { kind: "SUBSCRIPTION", status: "COMPLETED" }, _sum: { amountTzs: true } }),
  ]);
  let providerBalanceTzs = null;
  let providerError = null;
  if (merchantWalletSettings().enabled) {
    try {
      const providerUser = await ntzs.request(`/users/${encodeURIComponent(ntzs.merchantWalletUserId())}`);
      providerBalanceTzs = optionalWholeTzs(providerUser.balanceTzs, "Provider balance");
    } catch {
      providerError = "Provider balance could not be refreshed.";
    }
  }
  const customerLiabilityTzs = wallets._sum.balanceTzs || 0;
  const retainedPlatformFeeTzs = completedFees._sum.platformFeeTzs || 0;
  const retainedSubscriptionRevenueTzs = completedSubscriptions._sum.amountTzs || 0;
  const settledExpectedBalanceTzs = customerLiabilityTzs + retainedPlatformFeeTzs + retainedSubscriptionRevenueTzs;
  const pendingDeposits = pending.filter((row) => row.kind === "DEPOSIT").reduce((sum, row) => sum + (row._sum.amountTzs || 0), 0);
  const pendingWithdrawals = pending.filter((row) => row.kind === "WITHDRAWAL").reduce((sum, row) => sum + (row._sum.totalDebitTzs || 0), 0);
  // A payout can be pending before the provider debits its pool. In that
  // short window, either endpoint of this range is legitimate.
  // A completed collection can arrive at nTZS just before our webhook or
  // status check credits the DukaPilot ledger, so pending deposits also form
  // a legitimate upper end of the timing range.
  const expectedProviderRangeMaxTzs = settledExpectedBalanceTzs + pendingWithdrawals + pendingDeposits;
  return {
    config: merchantWalletSettings(),
    wallets: { count: wallets._count.id, customerLiabilityTzs },
    pending: { depositTzs: pendingDeposits, withdrawalTzs: pendingWithdrawals, count: pending.reduce((sum, row) => sum + row._count.id, 0) },
    retainedPlatformFeeTzs,
    retainedSubscriptionRevenueTzs,
    provider: {
      balanceTzs: providerBalanceTzs,
      settledExpectedBalanceTzs,
      expectedRangeMaxTzs: expectedProviderRangeMaxTzs,
      differenceTzs: providerBalanceTzs === null ? null : providerBalanceTzs - settledExpectedBalanceTzs,
      withinPendingSettlementRange: providerBalanceTzs !== null
        && providerBalanceTzs >= settledExpectedBalanceTzs
        && providerBalanceTzs <= expectedProviderRangeMaxTzs,
      error: providerError,
    },
  };
}

async function createAdminAdjustment({ shopId, userId, direction, amountTzs, reason, requestKey }) {
  const normalizedDirection = String(direction || "").toUpperCase();
  if (!new Set(["CREDIT", "DEBIT"]).has(normalizedDirection)) throw failure("Adjustment direction must be CREDIT or DEBIT.", 400, "INVALID_ADJUSTMENT_DIRECTION");
  const amount = wholeTzs(amountTzs, "Adjustment amount");
  const note = cleanShortText(reason, 500);
  if (!note) throw failure("Explain the adjustment before saving it.", 400, "ADJUSTMENT_REASON_REQUIRED");
  const key = validRequestKey(requestKey || crypto.randomUUID());
  const expected = { shopId, kind: "ADJUSTMENT", amountTzs: amount, direction: normalizedDirection, reason: note };
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.merchantWalletTransaction.findUnique({ where: { requestKey: key } });
      if (existing) {
        assertSameRetry(existing, expected);
        return existing;
      }
      const wallet = await lockWallet(tx, shopId);
      const transaction = await tx.merchantWalletTransaction.create({
        data: {
          walletId: wallet.id,
          shopId,
          kind: "ADJUSTMENT",
          status: "COMPLETED",
          requestKey: key,
          amountTzs: amount,
          totalDebitTzs: normalizedDirection === "DEBIT" ? amount : 0,
          requestedByUserId: userId,
          completedAt: new Date(),
          metadata: { reason: note, direction: normalizedDirection },
        },
      });
      await appendEntry(tx, wallet, transaction, {
        type: normalizedDirection === "CREDIT" ? "ADMIN_ADJUSTMENT_CREDIT" : "ADMIN_ADJUSTMENT_DEBIT",
        direction: normalizedDirection,
        amountTzs: amount,
        description: note,
      });
      return transaction;
    });
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const existing = await prisma.merchantWalletTransaction.findUnique({ where: { requestKey: key } });
    if (!existing) throw error;
    assertSameRetry(existing, expected);
    return existing;
  }
}

async function reconcilePending(limit = 30) {
  const take = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const transactions = await prisma.merchantWalletTransaction.findMany({
    where: { status: { in: Array.from(PENDING_STATUSES) }, providerId: { not: null }, kind: { in: ["DEPOSIT", "WITHDRAWAL"] } },
    orderBy: { updatedAt: "asc" },
    take,
    select: { id: true },
  });
  const results = [];
  for (const transaction of transactions) {
    try {
      const current = await reconcileTransaction(transaction.id);
      results.push({ id: transaction.id, status: current?.status || "UNKNOWN" });
    } catch {
      results.push({ id: transaction.id, status: "REVIEW" });
    }
  }
  return { checked: transactions.length, results };
}

module.exports = {
  merchantWalletSettings,
  merchantWalletEnabledForShop,
  platformFeeTzs,
  providerFailure,
  publicTransaction,
  adminTransaction,
  createDeposit,
  getWithdrawalQuote,
  assertConfirmedWithdrawalQuote,
  createWithdrawal,
  reconcileTransaction,
  resumeMerchantTransaction,
  reconcileWebhook,
  reconcilePending,
  merchantWalletOverview,
  listAdminTransactions,
  adminOverview,
  createAdminAdjustment,
  paySubscriptionFromBalance,
};
