const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const { Prisma } = require("@prisma/client");
const prisma = require("../lib/prisma");

async function assertMerchantWalletCanBeDeleted(tx, rootId) {
  const [wallet, unsettledTransactions] = await Promise.all([
    tx.merchantWallet.findUnique({ where: { businessShopId: rootId }, select: { balanceTzs: true } }),
    tx.merchantWalletTransaction.count({ where: { shopId: rootId, status: { in: ["PENDING", "REVIEW"] } } }),
  ]);
  if ((wallet?.balanceTzs || 0) !== 0 || unsettledTransactions > 0) {
    throw Object.assign(new Error("Withdraw the merchant balance and resolve all pending wallet transactions before deleting this account."), {
      status: 409,
      code: "MERCHANT_WALLET_NOT_EMPTY",
    });
  }
}

async function anonymizeMerchantAccount(userId) {
  const disabledPin = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: { shop: { select: { id: true } }, supplier: { select: { id: true } } },
    });
    if (!user?.shop) throw Object.assign(new Error("Merchant shop not found"), { status: 404 });
    const rootId = user.shop.id;
    await assertMerchantWalletCanBeDeleted(tx, rootId);
    const shops = await tx.shop.findMany({ where: { OR: [{ id: rootId }, { parentShopId: rootId }] }, select: { id: true } });
    const shopIds = shops.map((shop) => shop.id);

    // Remove device and behavioural records entirely before de-identifying the
    // accounting records that must remain internally consistent.
    await tx.pushDelivery.deleteMany({ where: { shopId: { in: shopIds } } });
    await tx.pushSubscription.deleteMany({ where: { shopId: { in: shopIds } } });
    await tx.notificationPreference.deleteMany({ where: { shopId: { in: shopIds } } });
    await tx.appUsageEvent.deleteMany({ where: { shopId: { in: shopIds } } });
    await tx.offlineSyncEvent.deleteMany({ where: { shopId: { in: shopIds } } });
    await tx.assistantAction.deleteMany({ where: { shopId: { in: shopIds } } });

    await tx.staffMember.updateMany({
      where: { shopId: { in: shopIds } },
      data: { name: "Deleted staff", phone: null, pin: null, isActive: false, sessionVersion: { increment: 1 } },
    });
    await tx.customer.updateMany({ where: { shopId: { in: shopIds } }, data: { name: "Deleted customer", phone: null, email: null, address: null, notes: null } });
    await tx.sale.updateMany({ where: { shopId: { in: shopIds } }, data: { customerName: null, customerPhone: null, note: null } });
    await tx.saleItem.updateMany({ where: { sale: { shopId: { in: shopIds } } }, data: { name: null, description: null } });
    await tx.debt.updateMany({ where: { shopId: { in: shopIds } }, data: { customerName: null, customerPhone: "deleted", note: null } });
    await tx.debtPayment.updateMany({ where: { debt: { shopId: { in: shopIds } } }, data: { note: null } });
    await tx.customerOrder.updateMany({ where: { shopId: { in: shopIds } }, data: { customerName: "Deleted customer", customerPhone: "deleted", note: null } });
    await tx.product.updateMany({ where: { shopId: { in: shopIds } }, data: { name: "Deleted product", sku: null, barcode: null, supplierId: null, supplierCatalogProductId: null, isActive: false } });
    await tx.service.updateMany({ where: { shopId: { in: shopIds } }, data: { name: "Deleted service", description: null, isActive: false } });
    await tx.expense.updateMany({ where: { shopId: { in: shopIds } }, data: { title: "Deleted expense", vendor: null, note: null } });
    await tx.recurringExpense.updateMany({ where: { shopId: { in: shopIds } }, data: { title: "Deleted recurring expense", vendor: null, note: null, isActive: false } });
    await tx.merchantWalletTransaction.updateMany({
      where: { shopId: rootId },
      data: { payerPhone: null, recipientPhone: null, recipientName: null, providerInstruction: null, requestedByUserId: null, metadata: Prisma.DbNull },
    });
    await tx.order.updateMany({ where: { shopId: { in: shopIds } }, data: { note: null } });
    await tx.stockReceipt.updateMany({ where: { shopId: { in: shopIds } }, data: { invoiceNumber: null, note: null, receivedBy: null } });
    await tx.stockMovement.updateMany({ where: { product: { shopId: { in: shopIds } } }, data: { note: null } });
    await tx.cashSession.updateMany({ where: { shopId: { in: shopIds } }, data: { openedByName: "Deleted staff", note: null } });
    await tx.quotationSettings.updateMany({
      where: { shopId: { in: shopIds } },
      data: { defaultPaymentTerms: null, defaultTerms: null, defaultCustomerNote: null, signatureName: null, signatureUrl: null },
    });
    await tx.quotationShare.deleteMany({ where: { quotation: { shopId: { in: shopIds } } } });
    await tx.quotationRevision.deleteMany({ where: { quotation: { shopId: { in: shopIds } } } });
    await tx.quotation.updateMany({
      where: { shopId: { in: shopIds } },
      data: {
        projectTitle: "Deleted quotation", projectType: null, scopeOfWork: null,
        customerNote: null, internalNote: null, termsAndConditions: null, paymentTerms: null,
        acceptedByName: null, acceptanceComment: null, acceptanceSignature: null,
        rejectionReason: null, cancellationReason: null,
      },
    });
    await tx.quotationSection.updateMany({ where: { quotation: { shopId: { in: shopIds } } }, data: { name: "Deleted section" } });
    await tx.quotationItem.updateMany({ where: { quotation: { shopId: { in: shopIds } } }, data: { name: "Deleted quotation item", description: null, internalNote: null } });
    await tx.foodRecipe.updateMany({ where: { shopId: { in: shopIds } }, data: { name: "Deleted recipe", instructions: null, isActive: false } });
    await tx.foodPreparationBatch.updateMany({ where: { shopId: { in: shopIds } }, data: { additionalCostNote: null, note: null, preparedBy: null } });
    await tx.farmGroup.updateMany({ where: { shopId: { in: shopIds } }, data: { name: "Deleted group", note: null, isActive: false } });
    await tx.farmAnimalEvent.updateMany({ where: { group: { shopId: { in: shopIds } } }, data: { note: null, recordedBy: null } });
    await tx.farmProductionBatch.updateMany({ where: { shopId: { in: shopIds } }, data: { additionalCostNote: null, note: null, producedBy: null } });
    await tx.farmPackConversion.updateMany({ where: { shopId: { in: shopIds } }, data: { note: null, convertedBy: null } });
    // Field plans and buyer commitments are operational data with direct
    // identifiers, so deletion removes them rather than retaining aliases.
    await tx.cropBuyerContract.deleteMany({ where: { shopId: { in: shopIds } } });
    await tx.cropFieldTask.deleteMany({ where: { shopId: { in: shopIds } } });
    await tx.cropIrrigationLog.deleteMany({ where: { shopId: { in: shopIds } } });
    await tx.cropWeatherAlert.deleteMany({ where: { shopId: { in: shopIds } } });
    await tx.cropSeasonBudget.deleteMany({ where: { cropCycle: { shopId: { in: shopIds } } } });
    await tx.cropHarvestGrade.updateMany({ where: { harvestBatch: { shopId: { in: shopIds } } }, data: { note: null, recordedBy: null } });
    await tx.cropPlot.updateMany({ where: { shopId: { in: shopIds } }, data: { name: "Deleted plot", location: null, note: null, isActive: false } });
    await tx.cropCycle.updateMany({ where: { shopId: { in: shopIds } }, data: { cropName: "Deleted crop", variety: null, note: null, status: "CANCELLED", closedAt: new Date(), unrecoveredCost: 0, costReconciledAt: null } });
    await tx.cropInputUsage.updateMany({ where: { shopId: { in: shopIds } }, data: { title: "Deleted crop input", note: null, recordedBy: null } });
    await tx.cropHarvestBatch.updateMany({ where: { shopId: { in: shopIds } }, data: { note: null, recordedBy: null } });
    await tx.report.updateMany({ where: { userId }, data: { title: "Deleted support report", description: "Account deleted", adminNotes: null } });
    await tx.auditLog.updateMany({ where: { userId }, data: { ipAddress: null, userAgent: null, metadata: Prisma.DbNull } });
    const anonymizedShopData = {
      name: "Deleted business",
      location: "Deleted",
      district: null,
      isActive: false,
      isCatalogPublished: false,
      followUpNotes: null,
      lastContactedAt: null,
    };
    await tx.shop.updateMany({
      where: { parentShopId: rootId },
      data: { ...anonymizedShopData, branchArchived: true },
    });
    await tx.shop.update({
      where: { id: rootId },
      data: anonymizedShopData,
    });
    if (user.supplier) {
      await tx.supplierCatalogProduct.updateMany({ where: { supplierId: user.supplier.id }, data: { name: "Deleted supplier product", sku: null, note: null, isAvailable: false } });
      await tx.supplier.update({ where: { id: user.supplier.id }, data: { name: "Deleted supplier", phone: `deleted-${user.supplier.id}`, address: null, verificationStatus: "REJECTED", verifiedAt: null, adminNotes: null, createdByShopId: null, userId: null } });
    }
    const account = await tx.user.update({
      where: { id: userId },
      data: { phone: `deleted-${userId}@dukapilot.invalid`, name: "Deleted account", pin: disabledPin, sessionVersion: { increment: 1 } },
      select: { id: true },
    });
    return { account, rootId, shopIds };
  });
}

module.exports = { anonymizeMerchantAccount, assertMerchantWalletCanBeDeleted };
