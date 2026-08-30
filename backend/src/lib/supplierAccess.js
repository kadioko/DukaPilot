function supplierVisibilityWhere(shopId) {
  return {
    OR: [
      { createdByShopId: null },
      { createdByShopId: shopId },
    ],
  };
}

async function findVisibleSupplier(client, supplierId, shopId, options = {}) {
  return client.supplier.findFirst({
    where: { id: supplierId, ...supplierVisibilityWhere(shopId) },
    ...options,
  });
}

module.exports = { supplierVisibilityWhere, findVisibleSupplier };
