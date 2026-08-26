CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'ARCHIVED', 'CANCELLED');
CREATE TYPE "QuotationItemCategory" AS ENUM ('MATERIAL', 'LABOUR', 'TRANSPORT', 'DESIGN', 'INSTALLATION', 'SUBCONTRACTOR', 'SERVICE', 'OTHER');
CREATE TYPE "QuotationShareMethod" AS ENUM ('PDF', 'PRINT', 'LINK', 'WHATSAPP', 'EMAIL');
CREATE TYPE "QuotationPaymentStage" AS ENUM ('DEPOSIT', 'MILESTONE', 'FINAL', 'OTHER');

ALTER TABLE "shops" ADD COLUMN "nextQuotationNumber" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "staff_members"
  ADD COLUMN "canViewQuotations" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canCreateQuotations" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canEditSentQuotations" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canViewQuotationCosts" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canApproveQuotationDiscounts" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canSendQuotations" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canAcceptQuotations" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canConvertQuotations" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canRecordQuotationPayments" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canArchiveQuotations" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canDeleteQuotationDrafts" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "customers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "shopId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotation_settings" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "prefix" TEXT NOT NULL DEFAULT 'QT',
  "numberingFormat" TEXT NOT NULL DEFAULT '{prefix}-{number}',
  "defaultValidityDays" INTEGER NOT NULL DEFAULT 14,
  "defaultCurrency" TEXT NOT NULL DEFAULT 'TZS',
  "defaultTaxRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
  "defaultPaymentTerms" TEXT,
  "defaultTerms" TEXT,
  "defaultCustomerNote" TEXT,
  "signatureName" TEXT,
  "signatureUrl" TEXT,
  "showQuantities" BOOLEAN NOT NULL DEFAULT true,
  "showUnitPrices" BOOLEAN NOT NULL DEFAULT true,
  "showItemDiscounts" BOOLEAN NOT NULL DEFAULT true,
  "showSections" BOOLEAN NOT NULL DEFAULT true,
  "defaultDepositPercent" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quotation_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "services" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'service',
  "defaultSellingPrice" INTEGER NOT NULL DEFAULT 0,
  "defaultEstimatedUnitCost" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "shopId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotations" (
  "id" TEXT NOT NULL,
  "quotationNumber" TEXT NOT NULL,
  "currentRevisionNumber" INTEGER NOT NULL DEFAULT 1,
  "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
  "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiryDate" TIMESTAMP(3),
  "projectTitle" TEXT NOT NULL,
  "projectType" TEXT,
  "scopeOfWork" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'TZS',
  "customerNote" TEXT,
  "internalNote" TEXT,
  "termsAndConditions" TEXT,
  "paymentTerms" TEXT,
  "discountAmount" INTEGER NOT NULL DEFAULT 0,
  "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
  "subtotalAmount" INTEGER NOT NULL DEFAULT 0,
  "taxAmount" INTEGER NOT NULL DEFAULT 0,
  "totalAmount" INTEGER NOT NULL DEFAULT 0,
  "amountPaid" INTEGER NOT NULL DEFAULT 0,
  "depositRequiredAmount" INTEGER NOT NULL DEFAULT 0,
  "depositDueDate" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "acceptedByName" TEXT,
  "acceptanceComment" TEXT,
  "acceptanceSignature" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "archivedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  "createdById" TEXT NOT NULL,
  "lastEditedById" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotation_sections" (
  "id" TEXT NOT NULL,
  "quotationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "visibleToCustomer" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quotation_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotation_items" (
  "id" TEXT NOT NULL,
  "quotationId" TEXT NOT NULL,
  "sectionId" TEXT,
  "position" INTEGER NOT NULL,
  "category" "QuotationItemCategory" NOT NULL DEFAULT 'OTHER',
  "name" TEXT NOT NULL,
  "description" TEXT,
  "quantityMilli" INTEGER NOT NULL DEFAULT 1000,
  "unit" TEXT NOT NULL DEFAULT 'pcs',
  "unitPrice" INTEGER NOT NULL,
  "discountAmount" INTEGER NOT NULL DEFAULT 0,
  "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
  "lineSubtotal" INTEGER NOT NULL,
  "taxAmount" INTEGER NOT NULL DEFAULT 0,
  "totalSellingPrice" INTEGER NOT NULL,
  "visibleToCustomer" BOOLEAN NOT NULL DEFAULT true,
  "productId" TEXT,
  "serviceId" TEXT,
  "estimatedUnitCost" INTEGER NOT NULL DEFAULT 0,
  "estimatedTotalCost" INTEGER NOT NULL DEFAULT 0,
  "supplierId" TEXT,
  "internalNote" TEXT,
  "markupBasisPoints" INTEGER NOT NULL DEFAULT 0,
  "estimatedProfit" INTEGER NOT NULL DEFAULT 0,
  "estimatedProfitMarginBps" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotation_revisions" (
  "id" TEXT NOT NULL,
  "quotationId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "publicSnapshot" JSONB NOT NULL,
  "changeSummary" TEXT,
  "changedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quotation_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotation_shares" (
  "id" TEXT NOT NULL,
  "quotationId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "token" TEXT NOT NULL,
  "method" "QuotationShareMethod" NOT NULL,
  "sentTo" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "viewedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  CONSTRAINT "quotation_shares_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quotation_payments" (
  "id" TEXT NOT NULL,
  "quotationId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "stage" "QuotationPaymentStage" NOT NULL DEFAULT 'OTHER',
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "paymentRef" TEXT,
  "note" TEXT,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedById" TEXT NOT NULL,
  "debtPaymentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quotation_payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sales"
  ADD COLUMN "customerName" TEXT,
  ADD COLUMN "customerId" TEXT,
  ADD COLUMN "quotationId" TEXT;
ALTER TABLE "sale_items"
  ALTER COLUMN "productId" DROP NOT NULL,
  ADD COLUMN "name" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "quotedQuantityMilli" INTEGER;

CREATE UNIQUE INDEX "quotation_settings_shopId_key" ON "quotation_settings"("shopId");
CREATE UNIQUE INDEX "quotations_shopId_quotationNumber_key" ON "quotations"("shopId", "quotationNumber");
CREATE UNIQUE INDEX "quotation_sections_quotationId_position_key" ON "quotation_sections"("quotationId", "position");
CREATE UNIQUE INDEX "quotation_revisions_quotationId_revisionNumber_key" ON "quotation_revisions"("quotationId", "revisionNumber");
CREATE UNIQUE INDEX "quotation_shares_token_key" ON "quotation_shares"("token");
CREATE UNIQUE INDEX "quotation_payments_debtPaymentId_key" ON "quotation_payments"("debtPaymentId");
CREATE UNIQUE INDEX "sales_quotationId_key" ON "sales"("quotationId");
CREATE INDEX "customers_shopId_name_idx" ON "customers"("shopId", "name");
CREATE INDEX "customers_shopId_phone_idx" ON "customers"("shopId", "phone");
CREATE INDEX "customers_shopId_email_idx" ON "customers"("shopId", "email");
CREATE INDEX "services_shopId_isActive_name_idx" ON "services"("shopId", "isActive", "name");
CREATE INDEX "quotations_shopId_status_issueDate_idx" ON "quotations"("shopId", "status", "issueDate");
CREATE INDEX "quotations_shopId_customerId_createdAt_idx" ON "quotations"("shopId", "customerId", "createdAt");
CREATE INDEX "quotations_shopId_expiryDate_idx" ON "quotations"("shopId", "expiryDate");
CREATE INDEX "quotation_items_quotationId_position_idx" ON "quotation_items"("quotationId", "position");
CREATE INDEX "quotation_items_productId_idx" ON "quotation_items"("productId");
CREATE INDEX "quotation_revisions_quotationId_createdAt_idx" ON "quotation_revisions"("quotationId", "createdAt");
CREATE INDEX "quotation_shares_quotationId_revisionNumber_idx" ON "quotation_shares"("quotationId", "revisionNumber");
CREATE INDEX "quotation_payments_quotationId_paidAt_idx" ON "quotation_payments"("quotationId", "paidAt");
CREATE INDEX "sales_shopId_customerId_createdAt_idx" ON "sales"("shopId", "customerId", "createdAt");

ALTER TABLE "customers" ADD CONSTRAINT "customers_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_settings" ADD CONSTRAINT "quotation_settings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_sections" ADD CONSTRAINT "quotation_sections_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "quotation_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "services" ADD CONSTRAINT "services_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_revisions" ADD CONSTRAINT "quotation_revisions_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_shares" ADD CONSTRAINT "quotation_shares_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quotation_payments" ADD CONSTRAINT "quotation_payments_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_items" DROP CONSTRAINT IF EXISTS "sale_items_productId_fkey";
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
