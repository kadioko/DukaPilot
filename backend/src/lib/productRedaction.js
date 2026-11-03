function redactProduct(product, req) {
  const safeProduct = { ...product };
  delete safeProduct.createRequestId;
  delete safeProduct.createRequestHash;
  if (req.user.role === "ADMIN" || !req.user.staffId || req.user.permissions?.canViewReports) {
    return safeProduct;
  }
  const permissions = req.user.permissions || {};
  const canSeeSellingPrices = permissions.canSell || permissions.canManageStock || permissions.canViewSalePrices;
  const canSeeWholesale = permissions.canSell || permissions.canViewSalePrices;
  if (permissions.canViewStock && !permissions.canManageStock && !permissions.canSell) {
    const { id, name, labelName, sku, barcode, manufacturerBarcode, internalBarcode, unit, currentStock, minimumStock, expiryDate, doesNotExpire, isInternalUse, isCatalogVisible } = safeProduct;
    return { id, name, labelName, sku, barcode, manufacturerBarcode, internalBarcode, unit, currentStock, minimumStock, expiryDate, doesNotExpire, isInternalUse, isCatalogVisible,
      buyingPrice: null, sellingPrice: canSeeSellingPrices ? safeProduct.sellingPrice : null,
      promotionPrice: canSeeSellingPrices ? safeProduct.promotionPrice : null,
      promotionStartsAt: canSeeSellingPrices ? safeProduct.promotionStartsAt : null,
      promotionEndsAt: canSeeSellingPrices ? safeProduct.promotionEndsAt : null,
      wholesalePrice: canSeeWholesale ? safeProduct.wholesalePrice : null,
      wholesaleMinQty: canSeeWholesale ? safeProduct.wholesaleMinQty : null };
  }
  return {
    ...safeProduct,
    buyingPrice: null,
    sellingPrice: canSeeSellingPrices ? safeProduct.sellingPrice : null,
    promotionPrice: canSeeSellingPrices ? safeProduct.promotionPrice : null,
    wholesalePrice: canSeeWholesale ? safeProduct.wholesalePrice : null,
    wholesaleMinQty: canSeeWholesale ? safeProduct.wholesaleMinQty : null,
  };
}

module.exports = { redactProduct };
