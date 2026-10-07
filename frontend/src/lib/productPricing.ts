export function activePromotionPrice(product: {
  sellingPrice: number;
  promotionPrice?: number | null;
  promotionStartsAt?: string | null;
  promotionEndsAt?: string | null;
}, now = Date.now()): number {
  const startsAt = product.promotionStartsAt ? new Date(product.promotionStartsAt).getTime() : NaN;
  const endsAt = product.promotionEndsAt ? new Date(product.promotionEndsAt).getTime() : NaN;
  return Number.isSafeInteger(product.promotionPrice) && product.promotionPrice! >= 0 &&
    Number.isFinite(startsAt) && Number.isFinite(endsAt) && startsAt <= now && now < endsAt
    ? product.promotionPrice!
    : product.sellingPrice;
}

export function toLocalDateTimeInput(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
