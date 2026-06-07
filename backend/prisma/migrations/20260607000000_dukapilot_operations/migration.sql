-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'SALARY', 'UTILITIES', 'TRANSPORT', 'STOCK', 'MARKETING', 'TAX', 'OTHER');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'STOCK_CLERK');

-- CreateTable
CREATE TABLE "debts" (
    "id" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "note" TEXT,
    "status" "DebtStatus" NOT NULL DEFAULT 'OPEN',
    "shopId" TEXT NOT NULL,
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "vendor" TEXT,
    "note" TEXT,
    "spentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_members" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "StaffRole" NOT NULL DEFAULT 'CASHIER',
    "canSell" BOOLEAN NOT NULL DEFAULT true,
    "canManageStock" BOOLEAN NOT NULL DEFAULT false,
    "canManageStaff" BOOLEAN NOT NULL DEFAULT false,
    "canViewReports" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "shopId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "debts_saleId_key" ON "debts"("saleId");

-- CreateIndex
CREATE INDEX "debts_shopId_status_idx" ON "debts"("shopId", "status");

-- CreateIndex
CREATE INDEX "debts_customerPhone_idx" ON "debts"("customerPhone");

-- CreateIndex
CREATE INDEX "expenses_shopId_spentAt_idx" ON "expenses"("shopId", "spentAt");

-- CreateIndex
CREATE INDEX "expenses_shopId_category_idx" ON "expenses"("shopId", "category");

-- CreateIndex
CREATE INDEX "staff_members_shopId_role_idx" ON "staff_members"("shopId", "role");

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
