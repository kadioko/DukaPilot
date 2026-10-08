const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/product.controller.js");

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function loadController(prismaMock) {
  delete require.cache[controllerPath];
  delete require.cache[path.resolve(__dirname, "../src/lib/shopAccess.js")];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: prismaMock,
  };
  return require(controllerPath);
}

test("product list returns paginated results", async () => {
  const prismaMock = {
    $queryRawUnsafe: async () => [{ count: 2 }],
    shop: {
      findUnique: async () => ({ id: "shop-1" }),
    },
    product: {
      findMany: async () => [{ id: "prod-2", name: "Beans", currentStock: 7, minimumStock: 5 }],
      count: async () => 3,
    },
  };

  const ctrl = loadController(prismaMock);
  const req = {
    user: { userId: "user-1" },
    query: { page: "2", limit: "1", search: "bea" },
  };
  const res = createRes();

  await ctrl.list(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.pagination.page, 2);
  assert.equal(res.payload.pagination.limit, 1);
  assert.equal(res.payload.pagination.total, 3);
  assert.equal(res.payload.products.length, 1);
});

test("product list caps a requested page to a safe catalogue size", async () => {
  let findManyArgs;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: {
      findMany: async (args) => { findManyArgs = args; return []; },
      count: async () => 0,
    },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.list({ user: { userId: "user-1" }, query: { limit: "5000" } }, res);

  assert.equal(findManyArgs.take, 200);
  assert.equal(res.payload.pagination.limit, 200);
});

test("stock-only staff do not receive buying or wholesale product prices", async () => {
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: {
      findMany: async () => [{ id: "prod-1", name: "Rice", buyingPrice: 1800, sellingPrice: 3000, wholesalePrice: 2500, wholesaleMinQty: 5 }],
      count: async () => 1,
    },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.list({ user: { userId: "staff-1", staffId: "staff-1", shopId: "shop-1", permissions: { canViewReports: false } }, query: {} }, res);

  assert.equal(res.payload.products[0].sellingPrice, 3000);
  assert.equal(res.payload.products[0].buyingPrice, null);
  assert.equal(res.payload.products[0].wholesalePrice, null);
  assert.equal(res.payload.products[0].wholesaleMinQty, null);
});

test("low-stock pagination asks PostgreSQL for one page before loading product details", async () => {
  let findManyArgs;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $queryRaw: async (query) => {
      const sql = String(query);
      return sql.includes("COUNT") ? [{ count: 2 }] : [{ id: "prod-3" }];
    },
    product: {
      findMany: async (args) => {
        findManyArgs = args;
        return [{ id: "prod-3", name: "Low stock later", currentStock: 1, minimumStock: 5 }];
      },
    },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.list({ user: { userId: "user-1" }, query: { lowStock: "true", page: "2", limit: "1" } }, res);

  assert.deepEqual(findManyArgs.where.id.in, ["prod-3"]);
  assert.equal(res.payload.pagination.total, 2);
  assert.equal(res.payload.pagination.totalPages, 2);
  assert.deepEqual(res.payload.products.map((item) => item.id), ["prod-3"]);
});

test("stock filters keep low-stock products separate from out-of-stock products", async () => {
  const queries = [];
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $queryRaw: async (strings, ...values) => {
      const sql = strings.join(" ");
      queries.push({ sql, values });
      return sql.includes("COUNT") ? [{ count: 1 }] : [{ id: "prod-low" }];
    },
    product: {
      findMany: async () => [{ id: "prod-low", name: "Low brake pads", currentStock: 2, minimumStock: 5 }],
    },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.list({ user: { userId: "user-1" }, query: { stockStatus: "LOW", page: "1", limit: "50" } }, res);

  assert.equal(res.payload.pagination.total, 1);
  assert.deepEqual(res.payload.products.map((item) => item.id), ["prod-low"]);
  assert.ok(queries.some(({ values }) => values.some((value) => value?.strings?.join(" ").includes('"currentStock" > 0 AND "currentStock" <= "minimumStock"'))));
});

test("out-of-stock filters use an exact zero-stock query and retain supplier filters", async () => {
  let findManyArgs;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: {
      findMany: async (args) => { findManyArgs = args; return []; },
      count: async () => 0,
    },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.list({ user: { userId: "user-1" }, query: { stockStatus: "OUT", supplierId: "supplier-1" } }, res);

  assert.equal(findManyArgs.where.currentStock, 0);
  assert.equal(findManyArgs.where.supplierId, "supplier-1");
});

test("inventory summary returns whole-shop stock and expiry counts", async () => {
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $queryRaw: async () => [{ total: 18, lowStock: 3, outOfStock: 2, inStock: 16, expiringSoon: 4, expired: 1 }],
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.getSummary({ user: { userId: "user-1" } }, res);

  assert.deepEqual(res.payload.summary, {
    total: 18,
    lowStock: 3,
    outOfStock: 2,
    inStock: 16,
    expiringSoon: 4,
    expired: 1,
  });
});

test("getLowStock returns only database-filtered low-stock products", async () => {
  const prismaMock = {
    $queryRaw: async (query) => String(query).includes("COUNT")
      ? [{ count: 2 }]
      : [{ id: "prod-1" }, { id: "prod-3" }],
    shop: {
      findUnique: async () => ({ id: "shop-1" }),
    },
    product: {
      findMany: async () => [
        { id: "prod-1", name: "Rice", currentStock: 2, minimumStock: 5 },
        { id: "prod-3", name: "Salt", currentStock: 0, minimumStock: 1 },
      ],
    },
  };

  const ctrl = loadController(prismaMock);
  const req = { user: { userId: "user-1" }, query: {} };
  const res = createRes();

  await ctrl.getLowStock(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    res.payload.products.map((item) => item.id),
    ["prod-1", "prod-3"],
  );
});

test("product creation commits opening stock and stock movement together", async () => {
  const movements = [];
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $transaction: async (work) => work({
      product: { create: async ({ data }) => ({ id: "prod-1", ...data, supplier: null }) },
      stockMovement: { create: async ({ data }) => movements.push(data) },
    }),
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.create({ user: { userId: "user-1" }, body: { name: "Rice", unit: "nusu ya kuku", buyingPrice: 2000, sellingPrice: 3000, currentStock: 12, minimumStock: 0 } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.product.currentStock, 12);
  assert.equal(res.payload.product.minimumStock, 0);
  assert.equal(res.payload.product.unit, "nusu ya kuku");
  assert.equal(res.payload.product.isCatalogVisible, true);
  assert.deepEqual(movements, [{ type: "IN", quantity: 12, note: "Initial stock", productId: "prod-1" }]);
});

test("product creation retry with the same key returns the original product and does not duplicate opening stock", async () => {
  let savedProduct = null;
  let productCreates = 0;
  let movementCreates = 0;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: { findFirst: async () => savedProduct },
    $transaction: async (work) => work({
      product: {
        findFirst: async () => savedProduct,
        create: async ({ data }) => {
          productCreates += 1;
          savedProduct = { id: "prod-idempotent", ...data, supplier: null };
          return savedProduct;
        },
      },
      stockMovement: { create: async () => { movementCreates += 1; } },
    }),
  };
  const ctrl = loadController(prismaMock);
  const req = {
    user: { userId: "user-1" },
    body: {
      createRequestId: "aa90c06f-5aeb-4b07-9f41-1fa817c84c12",
      name: "Rice", unit: "kg", buyingPrice: 2000, sellingPrice: 3000, currentStock: 12, minimumStock: 0,
    },
  };

  const firstResponse = createRes();
  await ctrl.create(req, firstResponse);
  const retryResponse = createRes();
  await ctrl.create(req, retryResponse);

  assert.equal(firstResponse.payload.product.id, "prod-idempotent");
  assert.equal(retryResponse.payload.product.id, "prod-idempotent");
  assert.equal("createRequestId" in firstResponse.payload.product, false);
  assert.equal("createRequestHash" in firstResponse.payload.product, false);
  assert.equal(productCreates, 1);
  assert.equal(movementCreates, 1);
});

test("product creation rejects reuse of a retry key with changed details", async () => {
  const existing = { id: "prod-existing", createRequestHash: "original-hash", supplier: null };
  const ctrl = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: { findFirst: async () => existing },
  });
  const res = createRes();
  let forwardedError;
  await ctrl.create({
    user: { userId: "user-1" },
    body: { createRequestId: "aa90c06f-5aeb-4b07-9f41-1fa817c84c12", name: "Changed name" },
  }, res, (error) => { forwardedError = error; });

  assert.equal(forwardedError.status, 409);
  assert.equal(forwardedError.code, "PRODUCT_CREATE_KEY_CONFLICT");
});

test("repeating a soft product deletion is safe and returns success", async () => {
  const product = { id: "prod-deleted", shopId: "shop-1", isActive: false };
  let updates = 0;
  const ctrl = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: {
      findFirst: async () => product,
      update: async ({ data }) => {
        updates += 1;
        Object.assign(product, data);
      },
    },
  });

  const firstResponse = createRes();
  await ctrl.remove({ user: { userId: "user-1" }, params: { id: product.id } }, firstResponse);
  const retryResponse = createRes();
  await ctrl.remove({ user: { userId: "user-1" }, params: { id: product.id } }, retryResponse);

  assert.equal(firstResponse.statusCode, 200);
  assert.equal(retryResponse.statusCode, 200);
  assert.equal(product.isActive, false);
  assert.equal(updates, 2);
});

test("product creation can start hidden from the public catalog", async () => {
  let createdData;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $transaction: async (work) => work({
      product: { create: async ({ data }) => { createdData = data; return { id: "prod-1", ...data, supplier: null }; } },
      stockMovement: { create: async () => {} },
    }),
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.create({ user: { userId: "user-1" }, body: { name: "Seasonal gift box", buyingPrice: 1000, sellingPrice: 1500, isCatalogVisible: false } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createdData.isCatalogVisible, false);
  assert.equal(res.payload.product.isCatalogVisible, false);
});

test("internal-use feed is kept in stock without a selling price or catalog listing", async () => {
  let createdData;
  const ctrl = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $transaction: async (work) => work({
      product: { create: async ({ data }) => { createdData = data; return { id: "feed-1", ...data }; } },
      stockMovement: { create: async () => {} },
    }),
  });
  const res = createRes();
  await ctrl.create({ user: { userId: "owner-1" }, body: { name: "Layers feed", buyingPrice: 85000, currentStock: 3, isInternalUse: true } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(createdData.sellingPrice, 0);
  assert.equal(createdData.isInternalUse, true);
  assert.equal(createdData.isCatalogVisible, false);
  assert.equal(createdData.currentStock, 3);
});

test("owner can create a scheduled promotion with the product while staff cannot set one", async () => {
  let createdData;
  const ctrl = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $transaction: async (work) => work({
      product: { create: async ({ data }) => { createdData = data; return { id: "promo-product", ...data }; } },
      stockMovement: { create: async () => {} },
    }),
  });
  const offer = {
    promotionPrice: 4200,
    promotionStartsAt: "2026-10-06T10:00:00.000Z",
    promotionEndsAt: "2026-10-07T10:00:00.000Z",
  };
  const ownerRes = createRes();
  await ctrl.create({ user: { userId: "owner-1" }, body: { name: "Rice", buyingPrice: 2500, sellingPrice: 5000, ...offer } }, ownerRes);
  assert.equal(ownerRes.statusCode, 201);
  assert.equal(createdData.promotionPrice, 4200);
  assert.ok(createdData.promotionStartsAt instanceof Date);

  const staffRes = createRes();
  await ctrl.create({ user: { userId: "staff-1", staffId: "staff-1", shopId: "shop-1", role: "MERCHANT" }, body: { name: "Rice", buyingPrice: 2500, sellingPrice: 5000, ...offer } }, staffRes);
  assert.equal(staffRes.statusCode, 403);
});

test("product creation cannot attach a supplier private to another shop", async () => {
  let transactionStarted = false;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    supplier: { findFirst: async () => null },
    $transaction: async () => { transactionStarted = true; },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.create({
    user: { userId: "user-1" },
    body: { name: "Rice", buyingPrice: 2000, sellingPrice: 3000, supplierId: "private-supplier" },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, "Supplier not found in this shop");
  assert.equal(transactionStarted, false);
});

test("product update rejects direct currentStock changes and names the supported endpoint", async () => {
  let updateCalled = false;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: {
      findFirst: async () => ({ id: "prod-1", shopId: "shop-1", currentStock: 5 }),
      update: async () => { updateCalled = true; },
    },
  };
  const ctrl = loadController(prismaMock);
  const req = {
    user: { userId: "user-1" },
    params: { id: "prod-1" },
    headers: { "x-dukapilot-language": "sw" },
    body: { currentStock: 12 },
  };
  const res = createRes();

  await ctrl.update(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.code, "STOCK_ADJUSTMENT_REQUIRED");
  assert.equal(res.payload.supportedEndpoint, "POST /api/stock/adjust");
  assert.match(res.payload.error, /Stock haiwezi/);
  assert.equal(updateCalled, false);
});

test("product update accepts unchanged legacy currentStock while changing product details", async () => {
  let updated;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: {
      findFirst: async () => ({ id: "prod-1", shopId: "shop-1", name: "Rice", currentStock: 5, sellingPrice: 3000, wholesalePrice: null }),
      update: async ({ data }) => {
        updated = data;
        return { id: "prod-1", name: data.name, buyingPrice: data.buyingPrice, currentStock: 5, supplier: null };
      },
    },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.update({
    user: { userId: "user-1" },
    params: { id: "prod-1" },
    body: { name: "Premium Rice", buyingPrice: 2400, currentStock: 5 },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(updated.name, "Premium Rice");
  assert.equal(updated.buyingPrice, 2400);
  assert.equal(res.payload.product.currentStock, 5);
});

test("product update persists catalog visibility changes", async () => {
  let updated;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: {
      findFirst: async () => ({ id: "prod-1", shopId: "shop-1", currentStock: 5, sellingPrice: 3000, wholesalePrice: null }),
      update: async ({ data }) => { updated = data; return { id: "prod-1", ...data }; },
    },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.update({ user: { userId: "user-1" }, params: { id: "prod-1" }, body: { isCatalogVisible: false } }, res);

  assert.equal(updated.isCatalogVisible, false);
  assert.equal(res.payload.product.isCatalogVisible, false);
});

test("marking a product internal always unpublishes it and prevents accidental republishing", async () => {
  let updated;
  const ctrl = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: {
      findFirst: async () => ({ id: "prod-1", shopId: "shop-1", currentStock: 5, sellingPrice: 3000, isInternalUse: false, isCatalogVisible: true }),
      update: async ({ data }) => { updated = data; return { id: "prod-1", ...data }; },
    },
  });
  const res = createRes();
  await ctrl.update({ user: { userId: "owner-1" }, params: { id: "prod-1" }, body: { isInternalUse: true } }, res);
  assert.equal(updated.isInternalUse, true);
  assert.equal(updated.isCatalogVisible, false);
  const invalid = createRes();
  await ctrl.update({ user: { userId: "owner-1" }, params: { id: "prod-1" }, body: { isInternalUse: true, isCatalogVisible: true } }, invalid);
  assert.equal(invalid.statusCode, 400);
});

test("saleable product lookup excludes internal-use products before pagination", async () => {
  let where;
  const ctrl = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: {
      findMany: async (args) => { where = args.where; return []; },
      count: async () => 0,
    },
  });
  await ctrl.list({ user: { userId: "owner-1" }, query: { usage: "FOR_SALE" } }, createRes());
  assert.equal(where.isInternalUse, false);
});

test("staff cannot change a product's public catalog visibility", async () => {
  let updateCalled = false;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: {
      findFirst: async () => ({ id: "prod-1", shopId: "shop-1", currentStock: 5, sellingPrice: 3000, wholesalePrice: null }),
      update: async () => { updateCalled = true; },
    },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.update({ user: { userId: "staff-1", staffId: "staff-1", shopId: "shop-1", role: "MERCHANT", permissions: { canManageStock: true } }, params: { id: "prod-1" }, body: { isCatalogVisible: false } }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(updateCalled, false);
});

test("CSV import creates products and an opening stock movement for each stocked item", async () => {
  const movements = [];
  const created = [];
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: { findMany: async () => [] },
    $transaction: async (work) => work({
      product: {
        create: async ({ data }) => {
          created.push(data);
          return { id: `prod-${created.length}`, ...data, supplier: null };
        },
      },
      stockMovement: { create: async ({ data }) => movements.push(data) },
    }),
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.importCsv({
    user: { userId: "user-1" },
    body: { csv: "name,buyingPrice,sellingPrice,currentStock\nRice,2000,3000,8\nSalt,500,700,0" },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.count, 2);
  assert.equal(created[0].currentStock, 8);
  assert.deepEqual(movements, [{ type: "IN", quantity: 8, note: "Opening stock from CSV import", productId: "prod-1" }]);
});

test("owner CSV import accepts internal feed without a selling price", async () => {
  const created = [];
  const ctrl = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: { findMany: async () => [] },
    $transaction: async (work) => work({
      product: { create: async ({ data }) => { created.push(data); return { id: "feed-1", ...data }; } },
      stockMovement: { create: async () => {} },
    }),
  });
  const res = createRes();
  await ctrl.importCsv({ user: { userId: "owner-1" }, body: { csv: "name,buyingPrice,sellingPrice,currentStock,isInternalUse\nLayers feed,85000,,3,true" } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created[0].sellingPrice, 0);
  assert.equal(created[0].isInternalUse, true);
  assert.equal(created[0].isCatalogVisible, false);
});

test("CSV import keeps wholesale off by default and enables it only when explicitly requested", async () => {
  const created = [];
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: { findMany: async () => [] },
    $transaction: async (work) => work({
      product: { create: async ({ data }) => { created.push(data); return { id: `prod-${created.length}`, ...data, supplier: null }; } },
      stockMovement: { create: async () => {} },
    }),
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.importCsv({
    user: { userId: "user-1" },
    body: { csv: "name,buyingPrice,sellingPrice,wholesaleEnabled,wholesalePrice,wholesaleMinQty\nRice,2000,3000,,,\nBeans,1500,2400,true,2000," },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(created[0].wholesalePrice, null);
  assert.equal(created[0].wholesaleMinQty, null);
  assert.equal(created[1].wholesalePrice, 2000);
  assert.equal(created[1].wholesaleMinQty, 5);
});

test("CSV import rejects a wholesale price until wholesale is explicitly enabled", async () => {
  const prismaMock = { shop: { findUnique: async () => ({ id: "shop-1" }) } };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.importCsv({
    user: { userId: "user-1" },
    body: { csv: "name,buyingPrice,sellingPrice,wholesaleEnabled,wholesalePrice\nRice,2000,3000,false,2500" },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.details[0].field, "wholesaleEnabled");
});

test("CSV import rejects blank required prices before writing anything", async () => {
  const prismaMock = { shop: { findUnique: async () => ({ id: "shop-1" }) } };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.importCsv({
    user: { userId: "user-1" },
    body: { csv: "name,buyingPrice,sellingPrice\nRice,,3000" },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.code, "PRODUCT_CSV_INVALID");
  assert.equal(res.payload.details[0].field, "buyingPrice");
});

test("CSV import accepts whole TZS amounts formatted with commas or spaces", async () => {
  const created = [];
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: { findMany: async () => [] },
    $transaction: async (work) => work({
      product: { create: async ({ data }) => { created.push(data); return { id: `prod-${created.length}`, ...data, supplier: null }; } },
      stockMovement: { create: async () => {} },
    }),
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.importCsv({
    user: { userId: "user-1" },
    body: { csv: "name,buyingPrice,sellingPrice,wholesaleEnabled,wholesalePrice\nBrake pad,\"1,600\",\"3 000\",true,TZS 2300" },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(created[0].buyingPrice, 1600);
  assert.equal(created[0].sellingPrice, 3000);
  assert.equal(created[0].wholesalePrice, 2300);
});

test("CSV import rejects malformed grouped TZS amounts", async () => {
  const prismaMock = { shop: { findUnique: async () => ({ id: "shop-1" }) } };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.importCsv({
    user: { userId: "user-1" },
    body: { csv: "name,buyingPrice,sellingPrice\nRice,\"1,23,4\",3000" },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.details[0].field, "buyingPrice");
});
