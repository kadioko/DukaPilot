const prisma = require("../lib/prisma");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function getShopId(userId) {
  const shop = await prisma.shop.findUnique({ where: { userId } });
  if (!shop) throw Object.assign(new Error("Shop not found"), { status: 404 });
  return shop.id;
}

function csvValue(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function sendCsv(res, filename, rows) {
  const csv = rows.map((row) => row.map(csvValue).join(",")).join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

const exportSalesCsv = asyncHandler(async (req, res) => {
  const where = {};
  if (req.user.role !== "ADMIN") {
    where.shopId = await getShopId(req.user.userId);
  }

  const sales = await prisma.sale.findMany({
    where,
    include: {
      shop: { select: { name: true } },
      items: {
        include: {
          product: { select: { name: true, unit: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });

  const rows = [["saleId", "shop", "createdAt", "paymentMethod", "totalAmount", "profit", "items"]];
  for (const sale of sales) {
    rows.push([
      sale.id,
      sale.shop?.name || "",
      sale.createdAt.toISOString(),
      sale.paymentMethod,
      sale.totalAmount,
      sale.profit,
      sale.items.map((item) => `${item.product.name} (${item.quantity} ${item.product.unit})`).join("; "),
    ]);
  }

  req.audit = { action: "export.sales.csv", resourceType: "sale_export", metadata: { count: sales.length } };
  sendCsv(res, "sales-export.csv", rows);
});

const exportInventoryCsv = asyncHandler(async (req, res) => {
  const where = { isActive: true };
  if (req.user.role !== "ADMIN") {
    where.shopId = await getShopId(req.user.userId);
  }

  const products = await prisma.product.findMany({
    where,
    include: {
      shop: { select: { name: true } },
      supplier: { select: { name: true, phone: true } },
    },
    orderBy: { name: "asc" },
    take: 1000,
  });

  const rows = [["productId", "shop", "name", "sku", "unit", "buyingPrice", "sellingPrice", "currentStock", "minimumStock", "supplier", "supplierPhone"]];
  for (const product of products) {
    rows.push([
      product.id,
      product.shop?.name || "",
      product.name,
      product.sku || "",
      product.unit,
      product.buyingPrice,
      product.sellingPrice,
      product.currentStock,
      product.minimumStock,
      product.supplier?.name || "",
      product.supplier?.phone || "",
    ]);
  }

  req.audit = { action: "export.inventory.csv", resourceType: "inventory_export", metadata: { count: products.length } };
  sendCsv(res, "inventory-export.csv", rows);
});

module.exports = { exportSalesCsv, exportInventoryCsv };
