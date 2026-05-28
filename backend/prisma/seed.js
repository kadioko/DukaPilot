const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const pool = new Pool({
  connectionString: process.env.DATABASE_MIGRATE_URL || process.env.DATABASE_URL,
  max: 3,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const pin1234 = await bcrypt.hash("1234", 10);

  // ── Admin ──────────────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { phone: "+255700000000" },
    update: {},
    create: {
      phone: "+255700000000",
      pin: pin1234,
      name: "Admin DukaOS",
      role: "ADMIN",
      language: "sw",
    },
  });

  // ── Supplier ───────────────────────────────────────────────────────────────
  const supplierUser = await prisma.user.upsert({
    where: { phone: "+255700000001" },
    update: {},
    create: {
      phone: "+255700000001",
      pin: pin1234,
      name: "Jumla Traders",
      role: "SUPPLIER",
      language: "sw",
    },
  });

  const supplier = await prisma.supplier.upsert({
    where: { userId: supplierUser.id },
    update: {},
    create: {
      name: "Jumla Traders Ltd",
      phone: "+255700000001",
      address: "Kariakoo, Dar es Salaam",
      userId: supplierUser.id,
    },
  });

  // ── Merchant 1 — grocery shop ──────────────────────────────────────────────
  const merchantUser = await prisma.user.upsert({
    where: { phone: "+255700000002" },
    update: {},
    create: {
      phone: "+255700000002",
      pin: pin1234,
      name: "Mama Amina",
      role: "MERCHANT",
      language: "sw",
    },
  });

  const shop = await prisma.shop.upsert({
    where: { userId: merchantUser.id },
    update: {},
    create: {
      name: "Duka la Amina",
      location: "Mbagala",
      district: "Temeke",
      category: "grocery",
      userId: merchantUser.id,
    },
  });

  // ── Merchant 2 — pharmacy shop ─────────────────────────────────────────────
  const merchantUser2 = await prisma.user.upsert({
    where: { phone: "+255700000003" },
    update: {},
    create: {
      phone: "+255700000003",
      pin: pin1234,
      name: "Bwana Salum",
      role: "MERCHANT",
      language: "en",
    },
  });

  const shop2 = await prisma.shop.upsert({
    where: { userId: merchantUser2.id },
    update: {},
    create: {
      name: "Salum Pharmacy",
      location: "Sinza",
      district: "Kinondoni",
      category: "pharmacy",
      userId: merchantUser2.id,
    },
  });

  // ── Products for Duka la Amina ─────────────────────────────────────────────
  const expirySoon = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days
  const expiryFar  = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 6 months

  const productDefs = [
    {
      name: "Unga wa Sembe (2kg)",    sku: "UNG001", unit: "bag",
      buyingPrice: 2800, sellingPrice: 3200,
      wholesalePrice: 2950, wholesaleMinQty: 10,
      currentStock: 30, minimumStock: 10,
      doesNotExpire: true,
    },
    {
      name: "Mchele (1kg)",           sku: "MCH001", unit: "kg",
      buyingPrice: 1800, sellingPrice: 2200,
      wholesalePrice: 1950, wholesaleMinQty: 5,
      currentStock: 4, minimumStock: 10,   // low-stock on purpose
      doesNotExpire: true,
    },
    {
      name: "Mafuta ya Kupikia (1L)", sku: "MAF001", unit: "litre",
      buyingPrice: 3500, sellingPrice: 4000,
      currentStock: 12, minimumStock: 5,
      expiryDate: expiryFar,
    },
    {
      name: "Sukari (1kg)",           sku: "SUK001", unit: "kg",
      buyingPrice: 2200, sellingPrice: 2600,
      wholesalePrice: 2300, wholesaleMinQty: 5,
      currentStock: 3, minimumStock: 8,    // low-stock on purpose
      doesNotExpire: true,
    },
    {
      name: "Sabuni ya Kufulia (bar)", sku: "SAB001", unit: "bar",
      buyingPrice: 600, sellingPrice: 800,
      currentStock: 25, minimumStock: 10,
      doesNotExpire: true,
    },
    {
      name: "Chumvi (500g)",          sku: "CHU001", unit: "pkt",
      buyingPrice: 300, sellingPrice: 500,
      currentStock: 20, minimumStock: 10,
      doesNotExpire: true,
    },
    {
      name: "Maziwa Freshi (500ml)",  sku: "MAZ001", unit: "pcs",
      buyingPrice: 1000, sellingPrice: 1300,
      currentStock: 8, minimumStock: 5,
      expiryDate: expirySoon,           // expiring soon — good for dashboard warning
    },
    {
      name: "Soda (Fanta 300ml)",     sku: "SOD001", unit: "pcs",
      buyingPrice: 700, sellingPrice: 1000,
      wholesalePrice: 750, wholesaleMinQty: 24,
      currentStock: 48, minimumStock: 12,
      doesNotExpire: true,
    },
  ];

  const products = [];
  for (const def of productDefs) {
    const p = await prisma.product.upsert({
      where: { id: `seed-${def.sku}` },
      update: {},
      create: {
        id: `seed-${def.sku}`,
        shopId: shop.id,
        supplierId: supplier.id,
        ...def,
      },
    });
    products.push(p);
  }

  // ── Products for Salum Pharmacy ────────────────────────────────────────────
  const pharmDefs = [
    {
      name: "Panadol (tab x 10)",     sku: "PAN001", unit: "pkt",
      buyingPrice: 500, sellingPrice: 800,
      currentStock: 50, minimumStock: 20,
      expiryDate: expiryFar,
    },
    {
      name: "ORS Sachet",             sku: "ORS001", unit: "pcs",
      buyingPrice: 200, sellingPrice: 400,
      currentStock: 100, minimumStock: 30,
      expiryDate: expiryFar,
    },
    {
      name: "Vitamin C 500mg",        sku: "VTC001", unit: "pcs",
      buyingPrice: 800, sellingPrice: 1200,
      currentStock: 2, minimumStock: 10,   // low-stock
      expiryDate: expiryFar,
    },
  ];

  const pharmProducts = [];
  for (const def of pharmDefs) {
    const p = await prisma.product.upsert({
      where: { id: `seed-${def.sku}` },
      update: {},
      create: {
        id: `seed-${def.sku}`,
        shopId: shop2.id,
        supplierId: supplier.id,
        ...def,
      },
    });
    pharmProducts.push(p);
  }

  // ── Sales history for Duka la Amina (last 7 days) ─────────────────────────
  const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  const salesData = [
    // 6 days ago
    { createdAt: daysAgo(6), paymentMethod: "CASH",   items: [{ product: products[0], qty: 2 }, { product: products[3], qty: 1 }] },
    // 5 days ago
    { createdAt: daysAgo(5), paymentMethod: "MPESA",  items: [{ product: products[2], qty: 1 }, { product: products[4], qty: 3 }] },
    // 4 days ago
    { createdAt: daysAgo(4), paymentMethod: "CASH",   items: [{ product: products[5], qty: 5 }, { product: products[1], qty: 2 }] },
    // 3 days ago — wholesale
    { createdAt: daysAgo(3), paymentMethod: "BANK",   channel: "POS", pricingTier: "WHOLESALE",
      items: [{ product: products[0], qty: 12 }, { product: products[7], qty: 24 }] },
    // 2 days ago
    { createdAt: daysAgo(2), paymentMethod: "TIGOPESA", items: [{ product: products[6], qty: 2 }, { product: products[2], qty: 1 }] },
    // yesterday
    { createdAt: daysAgo(1), paymentMethod: "CASH",   items: [{ product: products[3], qty: 3 }, { product: products[4], qty: 2 }] },
    // today
    { createdAt: daysAgo(0), paymentMethod: "MPESA",  items: [{ product: products[0], qty: 1 }, { product: products[1], qty: 1 }, { product: products[5], qty: 2 }] },
  ];

  for (const s of salesData) {
    const pricingTier = s.pricingTier || "RETAIL";
    let totalAmount = 0;
    let profit = 0;
    const items = s.items.map(({ product, qty }) => {
      const unitPrice = pricingTier === "WHOLESALE" && product.wholesalePrice
        ? product.wholesalePrice
        : product.sellingPrice;
      const total = unitPrice * qty;
      totalAmount += total;
      profit += (unitPrice - product.buyingPrice) * qty;
      return {
        quantity: qty,
        unitPrice,
        buyingPrice: product.buyingPrice,
        totalPrice: total,
        productId: product.id,
      };
    });

    await prisma.sale.create({
      data: {
        shopId: shop.id,
        totalAmount,
        profit,
        paymentMethod: s.paymentMethod,
        channel: s.channel || "POS",
        pricingTier,
        createdAt: s.createdAt,
        items: { create: items },
      },
    });
  }

  // ── Supplier order (pending restock) ──────────────────────────────────────
  await prisma.order.create({
    data: {
      shopId: shop.id,
      supplierId: supplier.id,
      status: "PENDING",
      totalAmount: 28000,
      note: "Restock ya wiki",
      items: {
        create: [
          { productId: products[1].id, quantity: 10, unitPrice: 1800 },
          { productId: products[3].id, quantity: 10, unitPrice: 2200 },
        ],
      },
    },
  });

  // ── Customer order (online) ────────────────────────────────────────────────
  await prisma.customerOrder.create({
    data: {
      shopId: shop.id,
      customerName: "John Mwangi",
      customerPhone: "+255712345678",
      status: "CONFIRMED",
      totalAmount: 9400,
      note: "Peleka Mbagala bus stand",
      items: {
        create: [
          { productId: products[0].id, quantity: 2, unitPrice: 3200, pricingTier: "RETAIL" },
          { productId: products[2].id, quantity: 1, unitPrice: 4000, pricingTier: "RETAIL" },
        ],
      },
    },
  });

  console.log("✅ Seed complete");
  console.log("┌─────────────────────────────────────────┐");
  console.log("│         TEST LOGIN CREDENTIALS          │");
  console.log("├─────────────────────────────────────────┤");
  console.log("│ ADMIN    +255700000000  PIN: 1234        │");
  console.log("│ MERCHANT +255700000002  PIN: 1234        │");
  console.log("│          (Duka la Amina, Temeke)         │");
  console.log("│ MERCHANT +255700000003  PIN: 1234        │");
  console.log("│          (Salum Pharmacy, Kinondoni)     │");
  console.log("│ SUPPLIER +255700000001  PIN: 1234        │");
  console.log("└─────────────────────────────────────────┘");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
