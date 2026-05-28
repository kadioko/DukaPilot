-- Performance indexes for high-frequency list queries
-- Sale: merchant sales list filtered by shop and sorted by date
CREATE INDEX IF NOT EXISTS "sales_shopId_createdAt_idx" ON "sales"("shopId", "createdAt" DESC);

-- Product: merchant inventory list filtered by shop and active status
CREATE INDEX IF NOT EXISTS "products_shopId_isActive_idx" ON "products"("shopId", "isActive");

-- Order: supplier orders list filtered by shop and status
CREATE INDEX IF NOT EXISTS "orders_shopId_status_idx" ON "orders"("shopId", "status");
