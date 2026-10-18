function redactProduct(product, req) {
  const safeProduct = { ...product };
  delete safeProduct.createRequestId;
  delete safeProduct.createRequestHash;
  if (req.user.role === "ADMIN" || !req.user.staffId || req.user.permissions?.canViewReports) {
    return safeProduct;
  }
  return { ...safeProduct, buyingPrice: null, wholesalePrice: null, wholesaleMinQty: null };
}

module.exports = { redactProduct };
