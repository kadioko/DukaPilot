require("dotenv").config();

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

// Railway CLI runs this script locally. Prefer the public migration URL there;
// the private DATABASE_URL remains suitable when it runs in Railway itself.
const databaseUrl = process.env.DATABASE_MIGRATE_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: databaseUrl, max: 3 });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// This script is intentionally separate from prisma/seed.js. The original seed
// creates a broad data fixture; this one safely refreshes only named showcase
// businesses and can be run again without duplicating their operations.
const CONFIRMATION = "REFRESH_DUKAPILOT_DEMO_SHOWCASE";
const DEMO_PIN = "1234";
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const merchants = [
  { key: "grocery", phone: "+255700000002", owner: "Mama Amina", shop: "Duka la Amina", location: "Mbagala", district: "Temeke", category: "grocery", language: "sw" },
  { key: "pharmacy", phone: "+255700000003", owner: "Bwana Salum", shop: "Salum Pharmacy", location: "Sinza", district: "Kinondoni", category: "pharmacy", language: "en" },
  { key: "bar", phone: "+255700000004", owner: "Hassan Juma", shop: "Hassan Bar & Kitchen", location: "Buguruni", district: "Ilala", category: "bar", language: "sw" },
  { key: "beauty", phone: "+255700000005", owner: "Fatuma Ally", shop: "Fatuma Beauty Shop", location: "Tegeta", district: "Kinondoni", category: "beauty", language: "sw" },
  { key: "restaurant", phone: "+255700000009", owner: "Mama Ntilie", shop: "Mama Ntilie Restaurant", location: "Mbezi Beach", district: "Kinondoni", category: "restaurant", language: "sw" },
  { key: "crops", phone: "+255700000012", owner: "Asha Macha", shop: "Kijani Mazao Farm", location: "Kibaha", district: "Pwani", category: "farm", language: "sw" },
  { key: "livestock", phone: "+255700000013", owner: "Musa Selemani", shop: "Upendo Poultry & Pigs Farm", location: "Kigamboni", district: "Dar es Salaam", category: "farm", language: "sw" },
];

const suppliers = [
  { key: "jumla", phone: "+255700000001", name: "Jumla Traders", company: "Jumla Traders Ltd", address: "Kariakoo, Dar es Salaam", language: "sw", products: [{ name: "Unga wa Sembe 2kg", sku: "JUM-UNGA", unit: "bag", price: 2800 }, { name: "Mchele 1kg", sku: "JUM-MCHELE", unit: "kg", price: 1800 }] },
  { key: "beverages", phone: "+255700000006", name: "Rafiki Beverages", company: "Rafiki Beverages Ltd", address: "Posta / Kisutu, Dar es Salaam", language: "sw", products: [{ name: "Safari Lager", sku: "RAF-SAFARI", unit: "bottle", price: 2800 }, { name: "Soda 300ml", sku: "RAF-SODA", unit: "bottle", price: 1200 }] },
  { key: "beauty-supplier", phone: "+255700000007", name: "Beauty Supplies TZ", company: "Beauty Supplies TZ", address: "Ilala, Dar es Salaam", language: "en", products: [{ name: "Body Lotion", sku: "BST-LOTION", unit: "bottle", price: 6500 }, { name: "Hair Food", sku: "BST-HAIR", unit: "jar", price: 4800 }] },
];

function id(...parts) {
  return `demo-showcase-${parts.join("-")}`;
}

function daysAgo(days, hour = 10) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  value.setHours(hour, 0, 0, 0);
  return value;
}

function daysFromNow(days, hour = 10) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, 0, 0, 0);
  return value;
}

function productData(data) {
  return {
    name: data.name,
    sku: data.sku,
    unit: data.unit,
    buyingPrice: data.buyingPrice,
    sellingPrice: data.sellingPrice,
    wholesalePrice: data.wholesalePrice || null,
    wholesaleMinQty: data.wholesaleMinQty || null,
    currentStock: data.currentStock,
    minimumStock: data.minimumStock,
    expiryDate: data.expiryDate || null,
    doesNotExpire: Boolean(data.doesNotExpire),
    isActive: true,
  };
}

async function ensureDemoMerchant(spec, pinHash) {
  const existing = await prisma.user.findUnique({ where: { phone: spec.phone }, include: { shop: true } });
  if (existing?.shop && !existing.shop.isDemo) {
    throw new Error(`Refusing to change ${spec.phone}: its shop is not marked as a demo.`);
  }

  const user = await prisma.user.upsert({
    where: { phone: spec.phone },
    create: { phone: spec.phone, pin: pinHash, name: spec.owner, role: "MERCHANT", language: spec.language },
    update: { pin: pinHash, name: spec.owner, role: "MERCHANT", language: spec.language, sessionVersion: { increment: 1 } },
  });
  const shop = await prisma.shop.upsert({
    where: { userId: user.id },
    create: {
      name: spec.shop,
      location: spec.location,
      district: spec.district,
      category: spec.category,
      userId: user.id,
      plan: "PRO",
      subscriptionEndsAt: new Date(Date.now() + YEAR_MS),
      isActive: true,
      isDemo: true,
      isCatalogPublished: false,
      onboardingStatus: "ACTIVATED",
      referralCode: `demo-${spec.key}`,
    },
    update: {
      name: spec.shop,
      location: spec.location,
      district: spec.district,
      category: spec.category,
      plan: "PRO",
      trialEndsAt: null,
      subscriptionEndsAt: new Date(Date.now() + YEAR_MS),
      isActive: true,
      isDemo: true,
      isCatalogPublished: false,
      onboardingStatus: "ACTIVATED",
    },
  });
  return { user, shop };
}

async function ensureProduct(shopId, key, data) {
  const productId = id(key, "product", data.sku.toLowerCase());
  return prisma.product.upsert({
    where: { id: productId },
    create: { id: productId, shopId, ...productData(data) },
    update: productData(data),
  });
}

async function ensureDemoSupplier(spec, pinHash) {
  const existing = await prisma.user.findUnique({ where: { phone: spec.phone }, include: { shop: true } });
  if (existing?.shop) throw new Error(`Refusing to turn ${spec.phone} into a supplier: it owns a shop.`);
  const user = await prisma.user.upsert({
    where: { phone: spec.phone },
    create: { phone: spec.phone, pin: pinHash, name: spec.name, role: "SUPPLIER", language: spec.language },
    update: { pin: pinHash, name: spec.name, role: "SUPPLIER", language: spec.language, sessionVersion: { increment: 1 } },
  });
  const supplier = await prisma.supplier.upsert({
    where: { userId: user.id },
    create: { name: spec.company, phone: spec.phone, address: spec.address, verificationStatus: "VERIFIED", verifiedAt: new Date(), adminNotes: "Official DukaPilot demo supplier", userId: user.id },
    update: { name: spec.company, phone: spec.phone, address: spec.address, verificationStatus: "VERIFIED", verifiedAt: new Date(), adminNotes: "Official DukaPilot demo supplier" },
  });
  for (const product of spec.products) {
    const catalogProductId = id("supplier", spec.key, product.sku.toLowerCase());
    await prisma.supplierCatalogProduct.upsert({
      where: { id: catalogProductId },
      create: { id: catalogProductId, supplierId: supplier.id, name: product.name, sku: product.sku, unit: product.unit, price: product.price, minOrderQty: 1, note: "Fresh showcase supplier product", isAvailable: true },
      update: { supplierId: supplier.id, name: product.name, sku: product.sku, unit: product.unit, price: product.price, minOrderQty: 1, note: "Fresh showcase supplier product", isAvailable: true },
    });
  }
  return { user, supplier };
}

async function ensureFreshActivity(shop, key, products, expenseTitle) {
  const product = products.find((item) => item.currentStock > 0);
  if (!product) return;
  const saleId = id(key, "fresh-sale");
  const itemId = id(key, "fresh-sale-item");
  const saleDate = daysAgo(0, 13);
  const total = product.sellingPrice;

  await prisma.$transaction(async (tx) => {
    await tx.sale.upsert({
      where: { id: saleId },
      create: {
        id: saleId,
        shopId: shop.id,
        totalAmount: total,
        profit: Math.max(0, product.sellingPrice - product.buyingPrice),
        paymentMethod: "MPESA",
        paymentRef: `DEMO-${key.toUpperCase()}-TODAY`,
        channel: "POS",
        pricingTier: "RETAIL",
        customerName: "Demo customer",
        receiptNumber: 9901,
        clientReference: `demo-showcase:${key}:fresh-sale`,
        note: "Fresh showcase sale. This account is refreshed for demonstrations.",
        createdAt: saleDate,
      },
      update: {
        totalAmount: total,
        profit: Math.max(0, product.sellingPrice - product.buyingPrice),
        paymentMethod: "MPESA",
        paymentRef: `DEMO-${key.toUpperCase()}-TODAY`,
        customerName: "Demo customer",
        note: "Fresh showcase sale. This account is refreshed for demonstrations.",
        createdAt: saleDate,
      },
    });
    await tx.saleItem.deleteMany({ where: { saleId } });
    await tx.saleItem.create({
      data: {
        id: itemId,
        saleId,
        productId: product.id,
        name: product.name,
        unit: product.unit,
        quantity: 1,
        unitPrice: product.sellingPrice,
        buyingPrice: product.buyingPrice,
        totalPrice: total,
      },
    });
    await tx.expense.upsert({
      where: { id: id(key, "fresh-expense") },
      create: { id: id(key, "fresh-expense"), shopId: shop.id, title: expenseTitle, amount: 12000, category: "UTILITIES", paymentMethod: "CASH", spentAt: daysAgo(0, 9), note: "Fresh showcase operating cost" },
      update: { title: expenseTitle, amount: 12000, category: "UTILITIES", paymentMethod: "CASH", spentAt: daysAgo(0, 9), note: "Fresh showcase operating cost" },
    });
  });
}

async function seedCashierDemo(shop, pinHash) {
  const phone = "+255700000008";
  const existing = await prisma.staffMember.findUnique({ where: { phone } });
  if (existing && existing.shopId !== shop.id) throw new Error(`Refusing to move staff demo ${phone} from another shop.`);
  await prisma.staffMember.upsert({
    where: { phone },
    create: {
      id: id("cashier"),
      shopId: shop.id,
      name: "Rehema - Sales & Stock",
      phone,
      pin: pinHash,
      language: "sw",
      role: "CASHIER",
      canSell: true,
      canManageStock: true,
      canManageCashSessions: true,
    },
    update: {
      shopId: shop.id,
      name: "Rehema - Sales & Stock",
      pin: pinHash,
      language: "sw",
      role: "CASHIER",
      canSell: true,
      canManageStock: true,
      canManageFarm: false,
      canManageStaff: false,
      canViewReports: false,
      canRecordExpenses: false,
      canManageCashSessions: true,
      canUseAssistant: false,
      isActive: true,
      sessionVersion: { increment: 1 },
    },
  });
}

async function seedKitchen(shop, key, config) {
  const products = await Promise.all(config.products.map((product) => ensureProduct(shop.id, key, product)));
  const bySku = Object.fromEntries(products.map((product) => [product.sku, product]));
  const recipeId = id(key, "recipe");
  const batchId = id(key, "batch");
  const recipeItems = config.recipeItems.map((item, index) => ({ ...item, product: bySku[item.sku], id: id(key, "recipe-item", index + 1) }));
  const batchItems = config.batchItems.map((item, index) => ({ ...item, product: bySku[item.sku], id: id(key, "batch-item", index + 1) }));
  const output = bySku[config.outputSku];
  const ingredientCost = batchItems.reduce((sum, item) => sum + item.quantity * item.product.buyingPrice, 0);
  const totalCost = ingredientCost + config.additionalCost;

  await prisma.$transaction(async (tx) => {
    await tx.foodRecipe.upsert({
      where: { id: recipeId },
      create: { id: recipeId, shopId: shop.id, name: config.recipeName, instructions: config.instructions, expectedYield: config.expectedYield, outputProductId: output.id },
      update: { name: config.recipeName, instructions: config.instructions, expectedYield: config.expectedYield, outputProductId: output.id, isActive: true },
    });
    for (const item of recipeItems) {
      await tx.foodRecipeItem.upsert({
        where: { id: item.id },
        create: { id: item.id, recipeId, productId: item.product.id, quantity: item.quantity },
        update: { recipeId, productId: item.product.id, quantity: item.quantity },
      });
    }
    await tx.foodPreparationBatch.upsert({
      where: { id: batchId },
      create: {
        id: batchId,
        shopId: shop.id,
        recipeId,
        outputProductId: output.id,
        expectedYield: config.expectedYield,
        actualYield: config.actualYield,
        wasteQuantity: Math.max(0, config.expectedYield - config.actualYield),
        ingredientCost,
        additionalCost: config.additionalCost,
        totalCost,
        unitCost: Math.round(totalCost / config.actualYield),
        additionalCostNote: config.additionalCostNote,
        paymentMethod: "CASH",
        note: "Fresh food preparation showcase batch",
        preparedAt: daysAgo(0, 11),
      },
      update: {
        recipeId,
        outputProductId: output.id,
        expectedYield: config.expectedYield,
        actualYield: config.actualYield,
        wasteQuantity: Math.max(0, config.expectedYield - config.actualYield),
        ingredientCost,
        additionalCost: config.additionalCost,
        totalCost,
        unitCost: Math.round(totalCost / config.actualYield),
        additionalCostNote: config.additionalCostNote,
        note: "Fresh food preparation showcase batch",
        preparedAt: daysAgo(0, 11),
      },
    });
    for (const item of batchItems) {
      await tx.foodPreparationItem.upsert({
        where: { id: item.id },
        create: { id: item.id, foodPreparationId: batchId, productId: item.product.id, quantity: item.quantity, unitCost: item.product.buyingPrice, totalCost: item.quantity * item.product.buyingPrice },
        update: { foodPreparationId: batchId, productId: item.product.id, quantity: item.quantity, unitCost: item.product.buyingPrice, totalCost: item.quantity * item.product.buyingPrice },
      });
      await tx.stockMovement.upsert({
        where: { id: id(key, "movement-out", item.product.sku.toLowerCase()) },
        create: { id: id(key, "movement-out", item.product.sku.toLowerCase()), type: "OUT", quantity: item.quantity, note: `Food preparation: ${config.recipeName}`, productId: item.product.id, foodPreparationBatchId: batchId, createdAt: daysAgo(0, 11) },
        update: { type: "OUT", quantity: item.quantity, note: `Food preparation: ${config.recipeName}`, productId: item.product.id, foodPreparationBatchId: batchId, createdAt: daysAgo(0, 11) },
      });
    }
    await tx.stockMovement.upsert({
      where: { id: id(key, "movement-in") },
      create: { id: id(key, "movement-in"), type: "IN", quantity: config.actualYield, note: `Food preparation: ${config.recipeName}`, productId: output.id, foodPreparationBatchId: batchId, createdAt: daysAgo(0, 11) },
      update: { type: "IN", quantity: config.actualYield, note: `Food preparation: ${config.recipeName}`, productId: output.id, foodPreparationBatchId: batchId, createdAt: daysAgo(0, 11) },
    });
  });
  await ensureFreshActivity(shop, key, [output, ...products], config.expenseTitle);
}

async function seedCropFarm(shop) {
  const key = "crops";
  const products = await Promise.all([
    ensureProduct(shop.id, key, { name: "Mbegu za Mahindi", sku: "CROP-SEED", unit: "kg", buyingPrice: 6500, sellingPrice: 8000, currentStock: 14, minimumStock: 5, doesNotExpire: true }),
    ensureProduct(shop.id, key, { name: "NPK Mbolea", sku: "CROP-NPK", unit: "bag", buyingPrice: 120000, sellingPrice: 135000, currentStock: 10, minimumStock: 4, doesNotExpire: true }),
    ensureProduct(shop.id, key, { name: "Dawa ya Mimea", sku: "CROP-PEST", unit: "litre", buyingPrice: 18000, sellingPrice: 23000, currentStock: 6, minimumStock: 2, doesNotExpire: true }),
    ensureProduct(shop.id, key, { name: "Mahindi - Shamba A", sku: "CROP-MAIZE-A", unit: "kg", buyingPrice: 708, sellingPrice: 1500, currentStock: 190, minimumStock: 50, doesNotExpire: true }),
    ensureProduct(shop.id, key, { name: "Nyanya - Greenhouse", sku: "CROP-TOMATO-G", unit: "crate", buyingPrice: 2400, sellingPrice: 4800, currentStock: 0, minimumStock: 10, doesNotExpire: false }),
  ]);
  const bySku = Object.fromEntries(products.map((product) => [product.sku, product]));
  const maizePlotId = id(key, "plot-maize");
  const tomatoPlotId = id(key, "plot-tomato");
  const maizeCycleId = id(key, "cycle-maize");
  const tomatoCycleId = id(key, "cycle-tomato");
  const seedInputId = id(key, "input-seed");
  const fertilizerInputId = id(key, "input-fertilizer");
  const labourInputId = id(key, "input-labour");
  const harvestOneId = id(key, "harvest-one");
  const harvestTwoId = id(key, "harvest-two");

  await prisma.$transaction(async (tx) => {
    await tx.farmSettings.upsert({ where: { shopId: shop.id }, create: { shopId: shop.id, hasCrops: true, hasLivestock: false }, update: { hasCrops: true, hasLivestock: false } });
    await tx.cropPlot.upsert({
      where: { id: maizePlotId },
      create: { id: maizePlotId, shopId: shop.id, name: "Shamba A", location: "Kibaha - Mlandizi", areaMilli: 2500, areaUnit: "ACRE", note: "Maize plot with two harvest batches" },
      update: { name: "Shamba A", location: "Kibaha - Mlandizi", areaMilli: 2500, areaUnit: "ACRE", note: "Maize plot with two harvest batches", isActive: true },
    });
    await tx.cropPlot.upsert({
      where: { id: tomatoPlotId },
      create: { id: tomatoPlotId, shopId: shop.id, name: "Greenhouse 1", location: "Kibaha - Mlandizi", areaMilli: 500, areaUnit: "SQUARE_METRE", note: "Growing tomatoes" },
      update: { name: "Greenhouse 1", location: "Kibaha - Mlandizi", areaMilli: 500, areaUnit: "SQUARE_METRE", note: "Growing tomatoes", isActive: true },
    });
    await tx.cropCycle.upsert({
      where: { id: maizeCycleId },
      create: { id: maizeCycleId, shopId: shop.id, plotId: maizePlotId, cropName: "Mahindi", variety: "DK 8031", status: "HARVESTING", plantedAt: daysAgo(112), expectedHarvestAt: daysAgo(4), expectedYield: 500, yieldUnit: "kg", note: "Two harvest batches demonstrate traceable crop costing." },
      update: { plotId: maizePlotId, cropName: "Mahindi", variety: "DK 8031", status: "HARVESTING", plantedAt: daysAgo(112), expectedHarvestAt: daysAgo(4), expectedYield: 500, yieldUnit: "kg", note: "Two harvest batches demonstrate traceable crop costing.", closedAt: null },
    });
    await tx.cropCycle.upsert({
      where: { id: tomatoCycleId },
      create: { id: tomatoCycleId, shopId: shop.id, plotId: tomatoPlotId, cropName: "Nyanya", variety: "Anna F1", status: "GROWING", plantedAt: daysAgo(35), expectedHarvestAt: daysFromNow(28), expectedYield: 180, yieldUnit: "crate", note: "Current growing cycle with field tasks and irrigation." },
      update: { plotId: tomatoPlotId, cropName: "Nyanya", variety: "Anna F1", status: "GROWING", plantedAt: daysAgo(35), expectedHarvestAt: daysFromNow(28), expectedYield: 180, yieldUnit: "crate", note: "Current growing cycle with field tasks and irrigation.", closedAt: null },
    });
    const inputs = [
      { id: seedInputId, product: bySku["CROP-SEED"], category: "SEED", title: "Mbegu za Mahindi", quantity: 10, totalCost: 65000, usedAt: daysAgo(112) },
      { id: fertilizerInputId, product: bySku["CROP-NPK"], category: "FERTILIZER", title: "NPK Mbolea", quantity: 2, totalCost: 240000, usedAt: daysAgo(74) },
      { id: labourInputId, product: null, category: "LABOUR", title: "Vibarua vya palizi", quantity: null, totalCost: 49000, usedAt: daysAgo(40) },
    ];
    for (const input of inputs) {
      await tx.cropInputUsage.upsert({
        where: { id: input.id },
        create: { id: input.id, shopId: shop.id, cropCycleId: maizeCycleId, productId: input.product?.id || null, category: input.category, title: input.title, quantity: input.quantity, unitCost: input.product?.buyingPrice || null, totalCost: input.totalCost, paymentMethod: "CASH", note: "Crop showcase input", usedAt: input.usedAt, clientRequestId: `demo-showcase-${input.id}` },
        update: { cropCycleId: maizeCycleId, productId: input.product?.id || null, category: input.category, title: input.title, quantity: input.quantity, unitCost: input.product?.buyingPrice || null, totalCost: input.totalCost, paymentMethod: "CASH", note: "Crop showcase input", usedAt: input.usedAt },
      });
      if (input.product) {
        await tx.stockMovement.upsert({
          where: { id: id(key, "input-movement", input.id) },
          create: { id: id(key, "input-movement", input.id), type: "OUT", quantity: input.quantity, note: `Crop input: ${input.title}`, productId: input.product.id, createdAt: input.usedAt },
          update: { type: "OUT", quantity: input.quantity, note: `Crop input: ${input.title}`, productId: input.product.id, createdAt: input.usedAt },
        });
      }
    }
    const harvests = [
      { id: harvestOneId, actualYield: 180, remainingQuantity: 90, totalCost: 127440, remainingCost: 106200, soldQuantity: 30, realizedRevenue: 45000, realizedCost: 21240, harvestAt: daysAgo(7), note: "First maize harvest" },
      { id: harvestTwoId, actualYield: 140, remainingQuantity: 100, totalCost: 99120, remainingCost: 99120, soldQuantity: 0, realizedRevenue: 0, realizedCost: 0, harvestAt: daysAgo(2), note: "Second maize harvest" },
    ];
    for (const harvest of harvests) {
      await tx.cropHarvestBatch.upsert({
        where: { id: harvest.id },
        create: { ...harvest, shopId: shop.id, cropCycleId: maizeCycleId, outputProductId: bySku["CROP-MAIZE-A"].id, expectedYield: 500, wasteQuantity: 0, unitCost: Math.round(harvest.totalCost / harvest.actualYield), clientRequestId: `demo-showcase-${harvest.id}` },
        update: { cropCycleId: maizeCycleId, outputProductId: bySku["CROP-MAIZE-A"].id, expectedYield: 500, actualYield: harvest.actualYield, remainingQuantity: harvest.remainingQuantity, totalCost: harvest.totalCost, remainingCost: harvest.remainingCost, soldQuantity: harvest.soldQuantity, realizedRevenue: harvest.realizedRevenue, realizedCost: harvest.realizedCost, unitCost: Math.round(harvest.totalCost / harvest.actualYield), harvestAt: harvest.harvestAt, note: harvest.note },
      });
      await tx.stockMovement.upsert({
        where: { id: id(key, "harvest-movement", harvest.id) },
        create: { id: id(key, "harvest-movement", harvest.id), type: "IN", quantity: harvest.actualYield, note: `Crop harvest: ${harvest.note}`, productId: bySku["CROP-MAIZE-A"].id, cropHarvestBatchId: harvest.id, createdAt: harvest.harvestAt },
        update: { type: "IN", quantity: harvest.actualYield, note: `Crop harvest: ${harvest.note}`, productId: bySku["CROP-MAIZE-A"].id, cropHarvestBatchId: harvest.id, createdAt: harvest.harvestAt },
      });
    }
    const allocations = [
      [seedInputId, harvestOneId, 23400], [fertilizerInputId, harvestOneId, 86400], [labourInputId, harvestOneId, 17640],
      [seedInputId, harvestTwoId, 18200], [fertilizerInputId, harvestTwoId, 67200], [labourInputId, harvestTwoId, 13720],
    ];
    for (const [inputId, harvestId, amount] of allocations) {
      const allocationId = id(key, "allocation", inputId, harvestId);
      await tx.cropInputCostAllocation.upsert({ where: { id: allocationId }, create: { id: allocationId, cropInputUsageId: inputId, harvestBatchId: harvestId, amount, reason: "HARVEST" }, update: { cropInputUsageId: inputId, harvestBatchId: harvestId, amount, reason: "HARVEST" } });
    }
    await tx.cropHarvestGrade.upsert({ where: { id: id(key, "grade-a") }, create: { id: id(key, "grade-a"), harvestBatchId: harvestTwoId, grade: "Grade A", quantity: 110, unit: "kg", note: "Dry, clean grain" }, update: { harvestBatchId: harvestTwoId, grade: "Grade A", quantity: 110, unit: "kg", note: "Dry, clean grain" } });
    await tx.cropHarvestGrade.upsert({ where: { id: id(key, "grade-b") }, create: { id: id(key, "grade-b"), harvestBatchId: harvestTwoId, grade: "Grade B", quantity: 30, unit: "kg", note: "Local market grade" }, update: { harvestBatchId: harvestTwoId, grade: "Grade B", quantity: 30, unit: "kg", note: "Local market grade" } });
    await tx.cropSeasonBudget.upsert({ where: { cropCycleId: maizeCycleId }, create: { cropCycleId: maizeCycleId, plannedCost: 390000, plannedRevenue: 750000, note: "Maize season plan" }, update: { plannedCost: 390000, plannedRevenue: 750000, note: "Maize season plan" } });
    await tx.cropIrrigationLog.upsert({ where: { id: id(key, "irrigation") }, create: { id: id(key, "irrigation"), shopId: shop.id, cropCycleId: tomatoCycleId, amount: 1200, unit: "litres", durationMinutes: 45, irrigatedAt: daysAgo(1, 7), note: "Morning drip irrigation", clientRequestId: "demo-showcase-crops-irrigation" }, update: { cropCycleId: tomatoCycleId, amount: 1200, unit: "litres", durationMinutes: 45, irrigatedAt: daysAgo(1, 7), note: "Morning drip irrigation" } });
    await tx.cropFieldTask.upsert({ where: { id: id(key, "task") }, create: { id: id(key, "task"), shopId: shop.id, cropCycleId: tomatoCycleId, title: "Inspect tomato leaves for pests", status: "TODO", priority: "HIGH", dueAt: daysFromNow(1, 8), note: "Walk the greenhouse before irrigation." }, update: { cropCycleId: tomatoCycleId, title: "Inspect tomato leaves for pests", status: "TODO", priority: "HIGH", dueAt: daysFromNow(1, 8), note: "Walk the greenhouse before irrigation.", completedAt: null } });
    await tx.cropBuyerContract.upsert({ where: { id: id(key, "buyer") }, create: { id: id(key, "buyer"), shopId: shop.id, cropCycleId: maizeCycleId, buyerName: "Kibaha Grain Market", buyerPhone: "+255700000099", produceName: "Mahindi Grade A", quantity: 100, unit: "kg", unitPrice: 1500, deliveryAt: daysFromNow(2, 9), status: "AGREED", note: "Collect after moisture check." }, update: { cropCycleId: maizeCycleId, buyerName: "Kibaha Grain Market", buyerPhone: "+255700000099", produceName: "Mahindi Grade A", quantity: 100, unit: "kg", unitPrice: 1500, deliveryAt: daysFromNow(2, 9), status: "AGREED", note: "Collect after moisture check." } });
    await tx.cropWeatherAlert.upsert({ where: { id: id(key, "weather") }, create: { id: id(key, "weather"), shopId: shop.id, cropPlotId: tomatoPlotId, cropCycleId: tomatoCycleId, type: "RAIN", severity: "WATCH", message: "Check greenhouse drainage after heavy rain.", source: "MANUAL", startsAt: daysAgo(0, 8), isResolved: false }, update: { cropPlotId: tomatoPlotId, cropCycleId: tomatoCycleId, type: "RAIN", severity: "WATCH", message: "Check greenhouse drainage after heavy rain.", source: "MANUAL", startsAt: daysAgo(0, 8), isResolved: false, resolvedAt: null } });
  });

  const saleId = id(key, "fresh-sale");
  const saleItemId = id(key, "fresh-sale-item");
  await prisma.$transaction(async (tx) => {
    await tx.sale.upsert({
      where: { id: saleId },
      create: { id: saleId, shopId: shop.id, totalAmount: 45000, profit: 23760, paymentMethod: "MPESA", paymentRef: "DEMO-CROP-TODAY", channel: "POS", pricingTier: "RETAIL", customerName: "Demo grain buyer", receiptNumber: 9901, clientReference: "demo-showcase:crops:fresh-sale", note: "Fresh harvest showcase sale", createdAt: daysAgo(0, 13) },
      update: { totalAmount: 45000, profit: 23760, paymentMethod: "MPESA", paymentRef: "DEMO-CROP-TODAY", customerName: "Demo grain buyer", note: "Fresh harvest showcase sale", createdAt: daysAgo(0, 13) },
    });
    await tx.saleItem.deleteMany({ where: { saleId } });
    await tx.saleItem.create({ data: { id: saleItemId, saleId, productId: bySku["CROP-MAIZE-A"].id, name: "Mahindi - Shamba A", unit: "kg", quantity: 30, unitPrice: 1500, buyingPrice: 708, totalPrice: 45000 } });
    await tx.cropHarvestAllocation.upsert({ where: { id: id(key, "sale-allocation") }, create: { id: id(key, "sale-allocation"), harvestBatchId: harvestOneId, saleItemId, quantity: 30, revenue: 45000, cost: 21240 }, update: { harvestBatchId: harvestOneId, saleItemId, quantity: 30, revenue: 45000, cost: 21240 } });
    await tx.expense.upsert({ where: { id: id(key, "fresh-expense") }, create: { id: id(key, "fresh-expense"), shopId: shop.id, title: "Greenhouse water", amount: 18000, category: "UTILITIES", paymentMethod: "CASH", spentAt: daysAgo(0, 9), note: "Fresh crop showcase operating cost" }, update: { title: "Greenhouse water", amount: 18000, category: "UTILITIES", paymentMethod: "CASH", spentAt: daysAgo(0, 9), note: "Fresh crop showcase operating cost" } });
  });
}

async function seedLivestockFarm(shop) {
  const key = "livestock";
  const products = await Promise.all([
    ensureProduct(shop.id, key, { name: "Layer Mash", sku: "FARM-LAYER-MASH", unit: "bag", buyingPrice: 46000, sellingPrice: 52000, currentStock: 12, minimumStock: 5, doesNotExpire: true }),
    ensureProduct(shop.id, key, { name: "Pig Grower Feed", sku: "FARM-PIG-FEED", unit: "bag", buyingPrice: 47000, sellingPrice: 54000, currentStock: 8, minimumStock: 4, doesNotExpire: true }),
    ensureProduct(shop.id, key, { name: "Mayai Mabichi", sku: "FARM-EGGS", unit: "egg", buyingPrice: 313, sellingPrice: 450, currentStock: 420, minimumStock: 120, doesNotExpire: true }),
    ensureProduct(shop.id, key, { name: "Tray ya Mayai", sku: "FARM-EGG-TRAY", unit: "tray", buyingPrice: 9390, sellingPrice: 12500, currentStock: 14, minimumStock: 5, doesNotExpire: true }),
    ensureProduct(shop.id, key, { name: "Nyama ya Nguruwe", sku: "FARM-PORK", unit: "kg", buyingPrice: 3400, sellingPrice: 12500, currentStock: 45, minimumStock: 10, doesNotExpire: true }),
  ]);
  const bySku = Object.fromEntries(products.map((product) => [product.sku, product]));
  const layersGroupId = id(key, "layers-group");
  const pigsGroupId = id(key, "pigs-group");
  const eggsBatchId = id(key, "eggs-batch");
  const porkBatchId = id(key, "pork-batch");

  await prisma.$transaction(async (tx) => {
    await tx.farmSettings.upsert({ where: { shopId: shop.id }, create: { shopId: shop.id, hasCrops: false, hasLivestock: true }, update: { hasCrops: false, hasLivestock: true } });
    for (const type of ["LAYERS", "PIGS"]) {
      await tx.farmProfile.upsert({ where: { shopId_type: { shopId: shop.id, type } }, create: { shopId: shop.id, type, isActive: true }, update: { isActive: true } });
    }
    await tx.farmGroup.upsert({ where: { id: layersGroupId }, create: { id: layersGroupId, shopId: shop.id, profileType: "LAYERS", name: "Layer House A", currentAnimals: 240, note: "Active laying flock" }, update: { profileType: "LAYERS", name: "Layer House A", currentAnimals: 240, note: "Active laying flock", isActive: true } });
    await tx.farmGroup.upsert({ where: { id: pigsGroupId }, create: { id: pigsGroupId, shopId: shop.id, profileType: "PIGS", name: "Pig Pen 1", currentAnimals: 18, note: "Grower pigs" }, update: { profileType: "PIGS", name: "Pig Pen 1", currentAnimals: 18, note: "Grower pigs", isActive: true } });
    const events = [
      { id: id(key, "layers-opening"), groupId: layersGroupId, type: "OPENING", quantity: 250, note: "Opening flock", occurredAt: daysAgo(75) },
      { id: id(key, "layers-loss"), groupId: layersGroupId, type: "MORTALITY", quantity: 10, note: "Recorded mortality", occurredAt: daysAgo(28) },
      { id: id(key, "pigs-opening"), groupId: pigsGroupId, type: "OPENING", quantity: 20, note: "Opening grower pigs", occurredAt: daysAgo(80) },
      { id: id(key, "pigs-cull"), groupId: pigsGroupId, type: "CULL", quantity: 2, note: "Moved to sale batch", occurredAt: daysAgo(5) },
    ];
    for (const event of events) {
      await tx.farmAnimalEvent.upsert({ where: { id: event.id }, create: event, update: { groupId: event.groupId, type: event.type, quantity: event.quantity, note: event.note, occurredAt: event.occurredAt } });
    }
    const batches = [
      { id: eggsBatchId, groupId: layersGroupId, output: bySku["FARM-EGGS"], type: "EGGS", expectedYield: 330, actualYield: 320, wasteQuantity: 10, ingredient: bySku["FARM-LAYER-MASH"], quantity: 2, additionalCost: 8000, note: "Morning egg collection" },
      { id: porkBatchId, groupId: pigsGroupId, output: bySku["FARM-PORK"], type: "HARVEST", expectedYield: 48, actualYield: 45, wasteQuantity: 3, ingredient: bySku["FARM-PIG-FEED"], quantity: 3, additionalCost: 12000, note: "Processed pork batch" },
    ];
    for (const batch of batches) {
      const ingredientCost = batch.ingredient.buyingPrice * batch.quantity;
      const totalCost = ingredientCost + batch.additionalCost;
      await tx.farmProductionBatch.upsert({
        where: { id: batch.id },
        create: { id: batch.id, shopId: shop.id, groupId: batch.groupId, type: batch.type, outputProductId: batch.output.id, expectedYield: batch.expectedYield, actualYield: batch.actualYield, wasteQuantity: batch.wasteQuantity, ingredientCost, additionalCost: batch.additionalCost, totalCost, unitCost: Math.round(totalCost / batch.actualYield), additionalCostNote: "Labour and utilities", paymentMethod: "CASH", note: batch.note, producedAt: daysAgo(0, 10) },
        update: { groupId: batch.groupId, type: batch.type, outputProductId: batch.output.id, expectedYield: batch.expectedYield, actualYield: batch.actualYield, wasteQuantity: batch.wasteQuantity, ingredientCost, additionalCost: batch.additionalCost, totalCost, unitCost: Math.round(totalCost / batch.actualYield), additionalCostNote: "Labour and utilities", note: batch.note, producedAt: daysAgo(0, 10) },
      });
      await tx.farmProductionItem.upsert({ where: { id: id(key, "batch-item", batch.id) }, create: { id: id(key, "batch-item", batch.id), farmProductionId: batch.id, productId: batch.ingredient.id, quantity: batch.quantity, unitCost: batch.ingredient.buyingPrice, totalCost: ingredientCost }, update: { farmProductionId: batch.id, productId: batch.ingredient.id, quantity: batch.quantity, unitCost: batch.ingredient.buyingPrice, totalCost: ingredientCost } });
      await tx.stockMovement.upsert({ where: { id: id(key, "production-out", batch.id) }, create: { id: id(key, "production-out", batch.id), type: "OUT", quantity: batch.quantity, note: `Farm production: ${batch.note}`, productId: batch.ingredient.id, createdAt: daysAgo(0, 10) }, update: { type: "OUT", quantity: batch.quantity, note: `Farm production: ${batch.note}`, productId: batch.ingredient.id, createdAt: daysAgo(0, 10) } });
      await tx.stockMovement.upsert({ where: { id: id(key, "production-in", batch.id) }, create: { id: id(key, "production-in", batch.id), type: "IN", quantity: batch.actualYield, note: `Farm production: ${batch.note}`, productId: batch.output.id, createdAt: daysAgo(0, 10) }, update: { type: "IN", quantity: batch.actualYield, note: `Farm production: ${batch.note}`, productId: batch.output.id, createdAt: daysAgo(0, 10) } });
    }
    await tx.farmPackConversion.upsert({ where: { id: id(key, "egg-pack") }, create: { id: id(key, "egg-pack"), shopId: shop.id, inputProductId: bySku["FARM-EGGS"].id, outputProductId: bySku["FARM-EGG-TRAY"].id, inputQuantity: 360, outputQuantity: 12, totalCost: 112680, unitCost: 9390, note: "Packed eggs into trays", convertedAt: daysAgo(0, 12) }, update: { inputProductId: bySku["FARM-EGGS"].id, outputProductId: bySku["FARM-EGG-TRAY"].id, inputQuantity: 360, outputQuantity: 12, totalCost: 112680, unitCost: 9390, note: "Packed eggs into trays", convertedAt: daysAgo(0, 12) } });
  });
  await ensureFreshActivity(shop, key, [bySku["FARM-EGG-TRAY"], ...products], "Pump water for farm");
}

async function main() {
  if (process.env.DEMO_SHOWCASE_CONFIRM !== CONFIRMATION) {
    throw new Error(`Refusing to refresh demo accounts. Set DEMO_SHOWCASE_CONFIRM=${CONFIRMATION} after reading docs/DEMO_SHOWCASE_SEEDING.md.`);
  }
  if (!databaseUrl) throw new Error("DATABASE_MIGRATE_URL or DATABASE_URL is required to refresh the demo showcase.");

  const pinHash = await bcrypt.hash(DEMO_PIN, 10);
  const accounts = new Map();
  for (const spec of merchants) {
    accounts.set(spec.key, await ensureDemoMerchant(spec, pinHash));
  }
  for (const spec of suppliers) {
    await ensureDemoSupplier(spec, pinHash);
  }

  await seedCashierDemo(accounts.get("grocery").shop, pinHash);

  const genericProducts = new Map();
  for (const key of ["grocery", "pharmacy", "beauty"]) {
    const shop = accounts.get(key).shop;
    const products = await prisma.product.findMany({ where: { shopId: shop.id, isActive: true, currentStock: { gt: 0 } }, orderBy: { currentStock: "desc" }, take: 3 });
    genericProducts.set(key, products);
  }
  await ensureFreshActivity(accounts.get("grocery").shop, "grocery", genericProducts.get("grocery"), "Duka electricity");
  await ensureFreshActivity(accounts.get("pharmacy").shop, "pharmacy", genericProducts.get("pharmacy"), "Pharmacy electricity");
  await ensureFreshActivity(accounts.get("beauty").shop, "beauty", genericProducts.get("beauty"), "Salon electricity");

  await seedKitchen(accounts.get("bar").shop, "bar", {
    recipeName: "Kuku Choma Plate",
    instructions: "Grill chicken, portion with chips, then serve fresh.",
    expectedYield: 12,
    actualYield: 11,
    outputSku: "BAR-CHICKEN-PLATE",
    additionalCost: 9000,
    additionalCostNote: "Mkaa na kupika",
    expenseTitle: "Bar electricity",
    products: [
      { name: "Kuku Mbichi", sku: "BAR-RAW-CHICKEN", unit: "kuku", buyingPrice: 18000, sellingPrice: 22000, currentStock: 8, minimumStock: 4, doesNotExpire: false },
      { name: "Chips", sku: "BAR-CHIPS", unit: "portion", buyingPrice: 1800, sellingPrice: 3500, currentStock: 36, minimumStock: 10, doesNotExpire: true },
      { name: "Mafuta ya Kupikia", sku: "BAR-OIL", unit: "litre", buyingPrice: 5000, sellingPrice: 6500, currentStock: 10, minimumStock: 3, doesNotExpire: false },
      { name: "Kuku Choma Plate", sku: "BAR-CHICKEN-PLATE", unit: "plate", buyingPrice: 6200, sellingPrice: 14000, currentStock: 18, minimumStock: 6, doesNotExpire: false },
      { name: "Safari Lager", sku: "BAR-SAFARI", unit: "bottle", buyingPrice: 2800, sellingPrice: 4500, currentStock: 48, minimumStock: 12, doesNotExpire: true },
    ],
    recipeItems: [{ sku: "BAR-RAW-CHICKEN", quantity: 3 }, { sku: "BAR-CHIPS", quantity: 12 }, { sku: "BAR-OIL", quantity: 2 }],
    batchItems: [{ sku: "BAR-RAW-CHICKEN", quantity: 3 }, { sku: "BAR-CHIPS", quantity: 12 }, { sku: "BAR-OIL", quantity: 2 }],
  });
  await seedKitchen(accounts.get("restaurant").shop, "restaurant", {
    recipeName: "Wali Maharage Plate",
    instructions: "Cook rice and beans, then portion each serving consistently.",
    expectedYield: 25,
    actualYield: 24,
    outputSku: "REST-RICE-BEANS-PLATE",
    additionalCost: 11000,
    additionalCostNote: "Mkaa na vibarua",
    expenseTitle: "Restaurant cooking gas",
    products: [
      { name: "Mchele", sku: "REST-RICE", unit: "kg", buyingPrice: 2300, sellingPrice: 3100, currentStock: 30, minimumStock: 10, doesNotExpire: true },
      { name: "Maharage", sku: "REST-BEANS", unit: "kg", buyingPrice: 3000, sellingPrice: 4200, currentStock: 22, minimumStock: 8, doesNotExpire: true },
      { name: "Mafuta ya Kupikia", sku: "REST-OIL", unit: "litre", buyingPrice: 5000, sellingPrice: 6500, currentStock: 9, minimumStock: 3, doesNotExpire: false },
      { name: "Wali Maharage Plate", sku: "REST-RICE-BEANS-PLATE", unit: "plate", buyingPrice: 1500, sellingPrice: 5000, currentStock: 20, minimumStock: 8, doesNotExpire: false },
      { name: "Fresh Juice", sku: "REST-JUICE", unit: "glass", buyingPrice: 900, sellingPrice: 2500, currentStock: 30, minimumStock: 10, doesNotExpire: false },
    ],
    recipeItems: [{ sku: "REST-RICE", quantity: 9 }, { sku: "REST-BEANS", quantity: 5 }, { sku: "REST-OIL", quantity: 2 }],
    batchItems: [{ sku: "REST-RICE", quantity: 9 }, { sku: "REST-BEANS", quantity: 5 }, { sku: "REST-OIL", quantity: 2 }],
  });
  await seedCropFarm(accounts.get("crops").shop);
  await seedLivestockFarm(accounts.get("livestock").shop);

  console.log(`Demo showcase refreshed: ${merchants.length} merchant owners, ${suppliers.length} suppliers, 1 staff cashier, food operations, crop operations, and livestock operations.`);
  console.log("All refreshed merchant demos are active Pro accounts and hidden from the public catalog.");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
