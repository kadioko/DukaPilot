ALTER TABLE "products"
  ADD COLUMN "promotionPrice" INTEGER,
  ADD COLUMN "promotionStartsAt" TIMESTAMP(3),
  ADD COLUMN "promotionEndsAt" TIMESTAMP(3);

ALTER TABLE "products"
  ADD CONSTRAINT "products_promotion_window_valid"
  CHECK (
    ("promotionPrice" IS NULL AND "promotionStartsAt" IS NULL AND "promotionEndsAt" IS NULL)
    OR
    ("promotionPrice" IS NOT NULL AND "promotionStartsAt" IS NOT NULL AND "promotionEndsAt" IS NOT NULL
      AND "promotionPrice" >= 0 AND "promotionPrice" < "sellingPrice"
      AND "promotionStartsAt" < "promotionEndsAt")
  );
