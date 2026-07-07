CREATE TABLE "assistant_actions" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "actionKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "source" TEXT NOT NULL DEFAULT 'ASSISTANT',
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_actions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assistant_actions_shopId_actionKey_key" ON "assistant_actions"("shopId", "actionKey");
CREATE INDEX "assistant_actions_shopId_status_idx" ON "assistant_actions"("shopId", "status");
CREATE INDEX "assistant_actions_createdAt_idx" ON "assistant_actions"("createdAt");

ALTER TABLE "assistant_actions" ADD CONSTRAINT "assistant_actions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
