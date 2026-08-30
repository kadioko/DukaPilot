-- The low-stock screen filters this subset on every inventory review. Keeping
-- only active low-stock rows makes the ordered page lookup inexpensive even
-- when a shop has a large full catalogue.
CREATE INDEX "products_low_stock_active_idx"
  ON "products"("shopId", "currentStock", "name")
  WHERE "isActive" = true AND "currentStock" <= "minimumStock";
