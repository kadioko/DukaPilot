-- Add user reports table
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL, -- BUG, FEATURE_REQUEST, ACCOUNT_ISSUE, OTHER
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, IN_PROGRESS, RESOLVED, REJECTED
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM', -- LOW, MEDIUM, HIGH, URGENT
    "adminNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- Add indexes
CREATE INDEX "reports_userId_idx" ON "reports"("userId");
CREATE INDEX "reports_status_idx" ON "reports"("status");
CREATE INDEX "reports_type_idx" ON "reports"("type");
CREATE INDEX "reports_priority_idx" ON "reports"("priority");

-- Add foreign key
ALTER TABLE "reports" ADD CONSTRAINT "reports_userId_fkey" FOREIGN KEY("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;