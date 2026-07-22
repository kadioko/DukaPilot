CREATE TABLE "push_subscriptions" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "deviceLabel" TEXT,
  "userId" TEXT,
  "staffId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_preferences" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "lowStock" BOOLEAN NOT NULL DEFAULT true,
  "debtDue" BOOLEAN NOT NULL DEFAULT true,
  "subscriptionExpiry" BOOLEAN NOT NULL DEFAULT true,
  "dailyAssistant" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "push_deliveries" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "subscriptionId" TEXT,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "href" TEXT NOT NULL DEFAULT '/notifications',
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "retryAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "push_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app_usage_events" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "action" TEXT,
  "route" TEXT NOT NULL,
  "userId" TEXT,
  "staffId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "app_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions"("endpoint");
CREATE UNIQUE INDEX "push_subscriptions_shopId_deviceId_key" ON "push_subscriptions"("shopId", "deviceId");
CREATE INDEX "push_subscriptions_shopId_isActive_idx" ON "push_subscriptions"("shopId", "isActive");
CREATE UNIQUE INDEX "notification_preferences_shopId_key" ON "notification_preferences"("shopId");
CREATE INDEX "push_deliveries_status_retryAt_idx" ON "push_deliveries"("status", "retryAt");
CREATE INDEX "push_deliveries_shopId_createdAt_idx" ON "push_deliveries"("shopId", "createdAt");
CREATE INDEX "app_usage_events_shopId_eventName_createdAt_idx" ON "app_usage_events"("shopId", "eventName", "createdAt");
CREATE INDEX "app_usage_events_shopId_deviceId_createdAt_idx" ON "app_usage_events"("shopId", "deviceId", "createdAt");

ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "push_deliveries" ADD CONSTRAINT "push_deliveries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "push_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "app_usage_events" ADD CONSTRAINT "app_usage_events_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
