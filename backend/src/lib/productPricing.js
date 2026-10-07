function hasPromotionInput(body) {
  return ["promotionPrice", "promotionStartsAt", "promotionEndsAt"]
    .some((field) => Object.prototype.hasOwnProperty.call(body || {}, field));
}

function normalizePromotion(input, { sellingPrice, isInternalUse = false } = {}) {
  const values = [input.promotionPrice, input.promotionStartsAt, input.promotionEndsAt];
  const empty = values.map((value) => value === undefined || value === null || value === "");
  if (empty.every(Boolean)) {
    return { data: { promotionPrice: null, promotionStartsAt: null, promotionEndsAt: null } };
  }
  if (empty.some(Boolean)) return { error: "Set the promotion price, start time, and end time together, or clear all three." };
  if (isInternalUse) return { error: "Internal-use products cannot have a sale promotion." };

  const price = Number(input.promotionPrice);
  if (!Number.isSafeInteger(price) || price < 0 || price >= Number(sellingPrice)) {
    return { error: "Promotion price must be a whole TZS amount below the regular selling price." };
  }
  const startsAt = new Date(input.promotionStartsAt);
  const endsAt = new Date(input.promotionEndsAt);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt >= endsAt) {
    return { error: "Promotion end time must be after its start time." };
  }
  return { data: { promotionPrice: price, promotionStartsAt: startsAt, promotionEndsAt: endsAt } };
}

function activeRetailPrice(product, now = new Date()) {
  const { promotionPrice, promotionStartsAt, promotionEndsAt } = product || {};
  if (
    Number.isSafeInteger(promotionPrice) && promotionPrice >= 0 &&
    promotionStartsAt && promotionEndsAt &&
    new Date(promotionStartsAt) <= now && now < new Date(promotionEndsAt)
  ) return promotionPrice;
  return product?.sellingPrice;
}

module.exports = { hasPromotionInput, normalizePromotion, activeRetailPrice };
