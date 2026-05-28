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

  // ── Supplier 1 — general wholesaler ───────────────────────────────────────
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

  // ── Supplier 2 — beverages wholesaler ─────────────────────────────────────
  const supplierUser2 = await prisma.user.upsert({
    where: { phone: "+255700000006" },
    update: {},
    create: {
      phone: "+255700000006",
      pin: pin1234,
      name: "Rafiki Beverages",
      role: "SUPPLIER",
      language: "sw",
    },
  });
  const supplier2 = await prisma.supplier.upsert({
    where: { userId: supplierUser2.id },
    update: {},
    create: {
      name: "Rafiki Beverages Ltd",
      phone: "+255700000006",
      address: "Posta / Kisutu, Dar es Salaam",
      userId: supplierUser2.id,
    },
  });

  // ── Supplier 3 — cosmetics wholesaler ─────────────────────────────────────
  const supplierUser3 = await prisma.user.upsert({
    where: { phone: "+255700000007" },
    update: {},
    create: {
      phone: "+255700000007",
      pin: pin1234,
      name: "Beauty Supplies TZ",
      role: "SUPPLIER",
      language: "en",
    },
  });
  const supplier3 = await prisma.supplier.upsert({
    where: { userId: supplierUser3.id },
    update: {},
    create: {
      name: "Beauty Supplies TZ",
      phone: "+255700000007",
      address: "Ilala, Dar es Salaam",
      userId: supplierUser3.id,
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

  // ── Merchant 3 — bar / liquor shop ────────────────────────────────────────
  // Scenario: high-turnover, credit-heavy sales, wholesale channel, one out-of-stock product
  const merchantUser3 = await prisma.user.upsert({
    where: { phone: "+255700000004" },
    update: {},
    create: {
      phone: "+255700000004",
      pin: pin1234,
      name: "Hassan Juma",
      role: "MERCHANT",
      language: "sw",
    },
  });
  const shop3 = await prisma.shop.upsert({
    where: { userId: merchantUser3.id },
    update: {},
    create: {
      name: "Hassan Bar & Wines",
      location: "Buguruni",
      district: "Ilala",
      category: "bar",
      userId: merchantUser3.id,
    },
  });

  // ── Merchant 4 — beauty / cosmetics shop ─────────────────────────────────
  // Scenario: online orders channel, two out-of-stock products, pending large restock
  const merchantUser4 = await prisma.user.upsert({
    where: { phone: "+255700000005" },
    update: {},
    create: {
      phone: "+255700000005",
      pin: pin1234,
      name: "Fatuma Ally",
      role: "MERCHANT",
      language: "sw",
    },
  });
  const shop4 = await prisma.shop.upsert({
    where: { userId: merchantUser4.id },
    update: {},
    create: {
      name: "Fatuma Beauty Shop",
      location: "Tegeta",
      district: "Kinondoni",
      category: "beauty",
      userId: merchantUser4.id,
    },
  });

  // ── Date helpers ──────────────────────────────────────────────────────────
  const daysFromNow = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
  const daysAgo     = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  const expirySoon  = daysFromNow(14);   // 2 weeks — dashboard "expiring soon" warning
  const expiryUrgent = daysFromNow(5);   // 5 days — very urgent expiry
  const expiryFar   = daysFromNow(180);  // 6 months — healthy

  // ── Products for Duka la Amina (shop 1) ──────────────────────────────────
  const productDefs = [
    // [0] Good stock, wholesale available — staple flour
    {
      name: "Unga wa Sembe (2kg)", sku: "UNG001", unit: "bag",
      buyingPrice: 2800, sellingPrice: 3200,
      wholesalePrice: 2950, wholesaleMinQty: 10,
      currentStock: 30, minimumStock: 10,
      doesNotExpire: true,
    },
    // [1] LOW STOCK — needs reorder (currentStock < minimumStock)
    {
      name: "Mchele (1kg)", sku: "MCH001", unit: "kg",
      buyingPrice: 1800, sellingPrice: 2200,
      wholesalePrice: 1950, wholesaleMinQty: 5,
      currentStock: 4, minimumStock: 10,
      doesNotExpire: true,
    },
    // [2] Healthy stock, expiry 6 months out
    {
      name: "Mafuta ya Kupikia (1L)", sku: "MAF001", unit: "litre",
      buyingPrice: 3500, sellingPrice: 4000,
      currentStock: 12, minimumStock: 5,
      expiryDate: expiryFar,
    },
    // [3] LOW STOCK — sugar, below minimum
    {
      name: "Sukari (1kg)", sku: "SUK001", unit: "kg",
      buyingPrice: 2200, sellingPrice: 2600,
      wholesalePrice: 2300, wholesaleMinQty: 5,
      currentStock: 3, minimumStock: 8,
      doesNotExpire: true,
    },
    // [4] Good stock, no expiry
    {
      name: "Sabuni ya Kufulia (bar)", sku: "SAB001", unit: "bar",
      buyingPrice: 600, sellingPrice: 800,
      currentStock: 25, minimumStock: 10,
      doesNotExpire: true,
    },
    // [5] Good stock, no expiry
    {
      name: "Chumvi (500g)", sku: "CHU001", unit: "pkt",
      buyingPrice: 300, sellingPrice: 500,
      currentStock: 20, minimumStock: 10,
      doesNotExpire: true,
    },
    // [6] EXPIRING SOON — 14 days, good for dashboard alert
    {
      name: "Maziwa Freshi (500ml)", sku: "MAZ001", unit: "pcs",
      buyingPrice: 1000, sellingPrice: 1300,
      currentStock: 8, minimumStock: 5,
      expiryDate: expirySoon,
    },
    // [7] High stock, wholesale for bulk buyers
    {
      name: "Soda (Fanta 300ml)", sku: "SOD001", unit: "pcs",
      buyingPrice: 700, sellingPrice: 1000,
      wholesalePrice: 750, wholesaleMinQty: 24,
      currentStock: 48, minimumStock: 12,
      doesNotExpire: true,
    },
    // [8] NEW — Mayai (eggs tray), no expiry edge case
    {
      name: "Mayai (tray 30)", sku: "MAY001", unit: "tray",
      buyingPrice: 7500, sellingPrice: 9000,
      wholesalePrice: 8000, wholesaleMinQty: 5,
      currentStock: 10, minimumStock: 3,
      doesNotExpire: true,
    },
    // [9] NEW — Nyanya, VERY URGENT expiry in 5 days (fresh produce scenario)
    {
      name: "Nyanya (kg)", sku: "NYA001", unit: "kg",
      buyingPrice: 1000, sellingPrice: 1500,
      currentStock: 15, minimumStock: 5,
      expiryDate: expiryUrgent,
    },
  ];

  const products = [];
  for (const def of productDefs) {
    const p = await prisma.product.upsert({
      where: { id: `seed-${def.sku}` },
      update: {},
      create: { id: `seed-${def.sku}`, shopId: shop.id, supplierId: supplier.id, ...def },
    });
    products.push(p);
  }

  // ── Products for Salum Pharmacy (shop 2) ──────────────────────────────────
  const pharmDefs = [
    // [0] Good stock, healthy expiry
    {
      name: "Panadol (tab x 10)", sku: "PAN001", unit: "pkt",
      buyingPrice: 500, sellingPrice: 800,
      currentStock: 50, minimumStock: 20,
      expiryDate: expiryFar,
    },
    // [1] Good stock
    {
      name: "ORS Sachet", sku: "ORS001", unit: "pcs",
      buyingPrice: 200, sellingPrice: 400,
      currentStock: 100, minimumStock: 30,
      expiryDate: expiryFar,
    },
    // [2] LOW STOCK — vitamin C
    {
      name: "Vitamin C 500mg", sku: "VTC001", unit: "pcs",
      buyingPrice: 800, sellingPrice: 1200,
      currentStock: 2, minimumStock: 10,
      expiryDate: expiryFar,
    },
    // [3] NEW — Malaria rapid test kit, high margin
    {
      name: "Malaria Test Kit (RDT)", sku: "MLR001", unit: "pcs",
      buyingPrice: 1500, sellingPrice: 3500,
      currentStock: 30, minimumStock: 10,
      expiryDate: expiryFar,
    },
    // [4] NEW — Bandages, OUT OF STOCK (demonstrates zero-stock dashboard alert)
    {
      name: "Bandage Roll (5cm)", sku: "BND001", unit: "pcs",
      buyingPrice: 700, sellingPrice: 1200,
      currentStock: 0, minimumStock: 15,
      expiryDate: expiryFar,
    },
  ];

  const pharmProducts = [];
  for (const def of pharmDefs) {
    const p = await prisma.product.upsert({
      where: { id: `seed-${def.sku}` },
      update: {},
      create: { id: `seed-${def.sku}`, shopId: shop2.id, supplierId: supplier.id, ...def },
    });
    pharmProducts.push(p);
  }

  // ── Products for Hassan Bar & Wines (shop 3) ──────────────────────────────
  const barDefs = [
    // [0] Beer crate — wholesale available, good stock
    {
      name: "Safari Lager (crate 24)", sku: "BEE001", unit: "crate",
      buyingPrice: 28000, sellingPrice: 36000,
      wholesalePrice: 30000, wholesaleMinQty: 3,
      currentStock: 15, minimumStock: 5,
      doesNotExpire: true,
    },
    // [1] Spirits — high margin, healthy stock
    {
      name: "Konyagi (350ml)", sku: "KON001", unit: "pcs",
      buyingPrice: 3500, sellingPrice: 5500,
      wholesalePrice: 4000, wholesaleMinQty: 12,
      currentStock: 40, minimumStock: 10,
      doesNotExpire: true,
    },
    // [2] Soda crate, LOW STOCK — needs urgent restock
    {
      name: "Coca-Cola (crate 24)", sku: "COK001", unit: "crate",
      buyingPrice: 22000, sellingPrice: 28800,
      wholesalePrice: 24000, wholesaleMinQty: 3,
      currentStock: 2, minimumStock: 5,
      doesNotExpire: true,
    },
    // [3] Snacks, EXPIRING SOON — 14 days
    {
      name: "Chips (Pringles 150g)", sku: "CHI001", unit: "pcs",
      buyingPrice: 3000, sellingPrice: 4500,
      currentStock: 20, minimumStock: 8,
      expiryDate: expirySoon,
    },
  ];

  const barProducts = [];
  for (const def of barDefs) {
    const p = await prisma.product.upsert({
      where: { id: `seed-${def.sku}` },
      update: {},
      create: { id: `seed-${def.sku}`, shopId: shop3.id, supplierId: supplier2.id, ...def },
    });
    barProducts.push(p);
  }

  // ── Products for Fatuma Beauty Shop (shop 4) ──────────────────────────────
  const beautyDefs = [
    // [0] Good stock, wholesale available
    {
      name: "Dark & Lovely Relaxer Kit", sku: "RLX001", unit: "pcs",
      buyingPrice: 6500, sellingPrice: 9500,
      wholesalePrice: 7500, wholesaleMinQty: 6,
      currentStock: 12, minimumStock: 5,
      expiryDate: expiryFar,
    },
    // [1] LOW STOCK — lotion, needs restock
    {
      name: "Vaseline Body Lotion (400ml)", sku: "LOT001", unit: "pcs",
      buyingPrice: 4000, sellingPrice: 6000,
      currentStock: 3, minimumStock: 10,
      expiryDate: expiryFar,
    },
    // [2] OUT OF STOCK — lip balm fully depleted
    {
      name: "Nivea Lip Balm", sku: "LIP001", unit: "pcs",
      buyingPrice: 1500, sellingPrice: 2500,
      currentStock: 0, minimumStock: 10,
      expiryDate: expiryFar,
    },
    // [3] Good stock, sold mainly via online channel
    {
      name: "Nail Polish (OPI 15ml)", sku: "NAL001", unit: "pcs",
      buyingPrice: 3500, sellingPrice: 6000,
      currentStock: 18, minimumStock: 5,
      doesNotExpire: true,
    },
  ];

  const beautyProducts = [];
  for (const def of beautyDefs) {
    const p = await prisma.product.upsert({
      where: { id: `seed-${def.sku}` },
      update: {},
      create: { id: `seed-${def.sku}`, shopId: shop4.id, supplierId: supplier3.id, ...def },
    });
    beautyProducts.push(p);
  }

  // ── Sales history for Duka la Amina (7 days) ─────────────────────────────
  const salesData = [
    // 6 days ago — cash, mixed items
    { createdAt: daysAgo(6), paymentMethod: "CASH",
      items: [{ product: products[0], qty: 2 }, { product: products[3], qty: 1 }] },
    // 5 days ago — M-Pesa
    { createdAt: daysAgo(5), paymentMethod: "MPESA",
      items: [{ product: products[2], qty: 1 }, { product: products[4], qty: 3 }] },
    // 4 days ago — cash
    { createdAt: daysAgo(4), paymentMethod: "CASH",
      items: [{ product: products[5], qty: 5 }, { product: products[1], qty: 2 }] },
    // 3 days ago — WHOLESALE, bank transfer to a small retailer
    { createdAt: daysAgo(3), paymentMethod: "BANK", pricingTier: "WHOLESALE",
      items: [{ product: products[0], qty: 12 }, { product: products[7], qty: 24 }] },
    // 2 days ago — Tigo Pesa
    { createdAt: daysAgo(2), paymentMethod: "TIGOPESA",
      items: [{ product: products[6], qty: 2 }, { product: products[2], qty: 1 }] },
    // yesterday — cash
    { createdAt: daysAgo(1), paymentMethod: "CASH",
      items: [{ product: products[3], qty: 3 }, { product: products[4], qty: 2 }] },
    // today — M-Pesa, includes new products
    { createdAt: daysAgo(0), paymentMethod: "MPESA",
      items: [{ product: products[0], qty: 1 }, { product: products[1], qty: 1 }, { product: products[8], qty: 2 }] },
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
      return { quantity: qty, unitPrice, buyingPrice: product.buyingPrice, totalPrice: total, productId: product.id };
    });
    await prisma.sale.create({
      data: {
        shopId: shop.id, totalAmount, profit,
        paymentMethod: s.paymentMethod,
        channel: s.channel || "POS",
        pricingTier,
        createdAt: s.createdAt,
        items: { create: items },
      },
    });
  }

  // ── Wholesale sales for Hassan Bar & Wines ────────────────────────────────
  // Wholesale sale 1: beer + spirits to a minibar owner, paid by bank (2 days ago)
  {
    const wsItems = [
      { product: barProducts[0], qty: 4 },  // 4 crates Safari Lager @ wholesale
      { product: barProducts[1], qty: 24 }, // 24 Konyagi @ wholesale
    ];
    let totalAmount = 0; let profit = 0;
    const items = wsItems.map(({ product, qty }) => {
      const unitPrice = product.wholesalePrice;
      const total = unitPrice * qty;
      totalAmount += total;
      profit += (unitPrice - product.buyingPrice) * qty;
      return { quantity: qty, unitPrice, buyingPrice: product.buyingPrice, totalPrice: total, productId: product.id };
    });
    await prisma.sale.create({
      data: {
        shopId: shop3.id, totalAmount, profit,
        paymentMethod: "BANK", channel: "POS", pricingTier: "WHOLESALE",
        customerPhone: "+255754001001",
        note: "Minibar Buguruni — bulk order",
        createdAt: daysAgo(2),
        items: { create: items },
      },
    });
  }

  // Wholesale sale 2: beer crate + soda crate to restaurant, paid by M-Pesa (today)
  {
    const wsItems2 = [
      { product: barProducts[0], qty: 3 },  // 3 crates Safari Lager @ wholesale
      { product: barProducts[2], qty: 2 },  // 2 crates Coca-Cola @ wholesale
    ];
    let totalAmount = 0; let profit = 0;
    const items = wsItems2.map(({ product, qty }) => {
      const unitPrice = product.wholesalePrice;
      const total = unitPrice * qty;
      totalAmount += total;
      profit += (unitPrice - product.buyingPrice) * qty;
      return { quantity: qty, unitPrice, buyingPrice: product.buyingPrice, totalPrice: total, productId: product.id };
    });
    await prisma.sale.create({
      data: {
        shopId: shop3.id, totalAmount, profit,
        paymentMethod: "MPESA", channel: "POS", pricingTier: "WHOLESALE",
        customerPhone: "+255754002002",
        note: "Resto Buguruni — vitu vya wiki",
        createdAt: daysAgo(0),
        items: { create: items },
      },
    });
  }

  // ── Pending supplier restock orders ──────────────────────────────────────
  // Original — Duka la Amina restocking rice + sugar from Jumla Traders
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

  // NEW — Hassan Bar restocking beer + soda from Rafiki Beverages (urgent, low stock on Coke)
  await prisma.order.create({
    data: {
      shopId: shop3.id,
      supplierId: supplier2.id,
      status: "PENDING",
      totalAmount: 130000,
      note: "Haraka — Coca-Cola imekwisha",
      items: {
        create: [
          { productId: barProducts[0].id, quantity: 5,  unitPrice: 28000 }, // 5 crates beer
          { productId: barProducts[2].id, quantity: 10, unitPrice: 22000 }, // 10 crates Coke — urgent
        ],
      },
    },
  });

  // NEW — Fatuma Beauty restocking lotion + lip balm from Beauty Supplies TZ
  await prisma.order.create({
    data: {
      shopId: shop4.id,
      supplierId: supplier3.id,
      status: "PENDING",
      totalAmount: 81500,
      note: "Stock ya Lotion na Lip Balm imekwisha — haraka",
      items: {
        create: [
          { productId: beautyProducts[1].id, quantity: 20, unitPrice: 4000 }, // 20 lotions
          { productId: beautyProducts[2].id, quantity: 15, unitPrice: 1500 }, // 15 lip balms (out of stock)
        ],
      },
    },
  });

  // ── Confirmed customer orders ─────────────────────────────────────────────
  // Original — customer order for Duka la Amina, confirmed, awaiting dispatch
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

  // NEW — second confirmed customer order for Duka la Amina (eggs + tomatoes — fresh produce)
  await prisma.customerOrder.create({
    data: {
      shopId: shop.id,
      customerName: "Neema Shaban",
      customerPhone: "+255789001122",
      status: "CONFIRMED",
      totalAmount: 22500,
      note: "Peleka Mbagala Rangi Tatu, karibu na kanisa",
      items: {
        create: [
          { productId: products[8].id, quantity: 2, unitPrice: 9000, pricingTier: "RETAIL" }, // 2 trays eggs
          { productId: products[9].id, quantity: 3, unitPrice: 1500, pricingTier: "RETAIL" }, // 3kg tomatoes
        ],
      },
    },
  });

  // NEW — confirmed customer order for Hassan Bar (snacks + soda, online channel)
  await prisma.customerOrder.create({
    data: {
      shopId: shop3.id,
      customerName: "Musa Omari",
      customerPhone: "+255765009988",
      status: "CONFIRMED",
      totalAmount: 13500,
      note: "Deliver to Buguruni Market, table 4",
      items: {
        create: [
          { productId: barProducts[3].id, quantity: 2, unitPrice: 4500, pricingTier: "RETAIL" }, // 2 Pringles
          { productId: barProducts[1].id, quantity: 2, unitPrice: 5500, pricingTier: "RETAIL" }, // 2 Konyagi
        ],
      },
    },
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("Seed complete");
  console.log("+---------------------------------------------------------+");
  console.log("|               TEST LOGIN CREDENTIALS                   |");
  console.log("+---------------------------------------------------------+");
  console.log("| ADMIN      +255700000000  PIN: 1234                     |");
  console.log("|                                                         |");
  console.log("| MERCHANT   +255700000002  PIN: 1234                     |");
  console.log("|             Duka la Amina (grocery, Temeke)             |");
  console.log("|             10 products | 7 days sales | 2 pending ord  |");
  console.log("|             2 low-stock | 1 expiring soon | 1 urgent    |");
  console.log("|                                                         |");
  console.log("| MERCHANT   +255700000003  PIN: 1234                     |");
  console.log("|             Salum Pharmacy (Kinondoni)                  |");
  console.log("|             5 products | 1 low-stock | 1 out-of-stock   |");
  console.log("|                                                         |");
  console.log("| MERCHANT   +255700000004  PIN: 1234                     |");
  console.log("|             Hassan Bar & Wines (Ilala)                  |");
  console.log("|             4 products | 2 wholesale sales              |");
  console.log("|             1 pending restock | 1 low-stock             |");
  console.log("|             1 confirmed customer order                  |");
  console.log("|                                                         |");
  console.log("| MERCHANT   +255700000005  PIN: 1234                     |");
  console.log("|             Fatuma Beauty Shop (Kinondoni)              |");
  console.log("|             4 products | 1 low-stock | 1 out-of-stock   |");
  console.log("|             1 pending restock                           |");
  console.log("|                                                         |");
  console.log("| SUPPLIER   +255700000001  PIN: 1234                     |");
  console.log("|             Jumla Traders Ltd (Kariakoo)                |");
  console.log("|                                                         |");
  console.log("| SUPPLIER   +255700000006  PIN: 1234                     |");
  console.log("|             Rafiki Beverages Ltd (Posta)                |");
  console.log("|                                                         |");
  console.log("| SUPPLIER   +255700000007  PIN: 1234                     |");
  console.log("|             Beauty Supplies TZ (Ilala)                  |");
  console.log("+---------------------------------------------------------+");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
