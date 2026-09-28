const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/labelPrint.controller.js");

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { this.ended = true; return this; },
  };
}

function loadController(prismaMock) {
  delete require.cache[controllerPath];
  delete require.cache[shopAccessPath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
  require.cache[shopAccessPath] = {
    id: shopAccessPath,
    filename: shopAccessPath,
    loaded: true,
    exports: { getShopIdForUser: async () => "shop-1" },
  };
  return require(controllerPath);
}

const product = {
  id: "product-1", name: "Rice", labelName: null, sku: "RIC001",
  barcode: "DP00000001", internalBarcode: "DP00000001", manufacturerBarcode: "4006381333931",
  barcodeType: "INTERNAL", unit: "pcs", currentStock: 5, sellingPrice: 3000, wholesalePrice: 2600,
};

test("label list hides wholesale templates and full job snapshots from stock-only staff", async () => {
  let jobQuery;
  const ctrl = loadController({
    labelTemplate: { findMany: async () => [{ id: "template-1", fields: ["name", "wholesalePrice"] }] },
    printerProfile: { findMany: async () => [{ id: "profile-1", options: {}, config: {}, template: { id: "template-1", fields: ["name", "wholesalePrice"] } }] },
    labelPrintJob: { findMany: async (query) => { jobQuery = query; return [{ id: "job-1", outputDriver: "ZPL", status: "PREPARED", createdAt: new Date() }]; } },
  });
  const res = response();

  await ctrl.list({ user: { userId: "staff-1", staffId: "staff-1", role: "MERCHANT", permissions: { canManageStock: true, canViewReports: false } } }, res);

  assert.deepEqual(res.payload.templates[0].fields, ["name"]);
  assert.deepEqual(res.payload.profiles[0].template.fields, ["name"]);
  assert.equal("items" in jobQuery.select, false);
  assert.equal("templateSnapshot" in jobQuery.select, false);
});

test("label jobs reject inactive profiles and overlapping barcode fields", async () => {
  const ctrl = loadController({
    product: { findMany: async () => [product] },
    printerProfile: { findFirst: async () => ({ id: "profile-1", shopId: "shop-1", isActive: false, driver: "TSPL" }) },
  });
  const user = { userId: "owner-1", role: "MERCHANT" };
  const inactive = response();
  await ctrl.prepareJob({ user, body: { items: [{ productId: "product-1", copies: 1 }], printerProfileId: "profile-1", outputDriver: "TSPL", template: {} } }, inactive);
  assert.equal(inactive.statusCode, 409);
  assert.match(inactive.payload.error, /inactive/);

  const overlapping = response();
  await ctrl.prepareJob({ user, body: { items: [{ productId: "product-1", copies: 1 }], outputDriver: "BROWSER", template: { layout: "CUSTOM", fields: ["manufacturerBarcode", "internalBarcode"] } } }, overlapping);
  assert.equal(overlapping.statusCode, 400);
  assert.match(overlapping.payload.error, /one barcode field/);
});

test("stock-only staff cannot prepare a wholesale-price label", async () => {
  const ctrl = loadController({ product: { findMany: async () => [product] } });
  let forwarded;
  await ctrl.prepareJob(
    {
      user: { userId: "staff-1", staffId: "staff-1", role: "MERCHANT", permissions: { canManageStock: true, canViewReports: false } },
      body: { items: [{ productId: "product-1", copies: 1 }], outputDriver: "BROWSER", template: { layout: "CUSTOM", fields: ["name", "wholesalePrice"] } },
    },
    response(),
    (error) => { forwarded = error; },
  );
  assert.equal(forwarded.status, 403);
  assert.match(forwarded.message, /wholesale prices/);
});

test("stock-only staff cannot download raw output from a historical wholesale job", async () => {
  const ctrl = loadController({
    labelPrintJob: {
      findFirst: async () => ({
        id: "job-1", outputDriver: "TSPL", items: [product],
        templateSnapshot: { layout: "CUSTOM", fields: ["name", "wholesalePrice"] },
        profileSnapshot: { driver: "TSPL", dpi: 203 },
      }),
    },
  });
  let forwarded;
  await ctrl.getOutput(
    { user: { userId: "staff-1", staffId: "staff-1", role: "MERCHANT", permissions: { canManageStock: true, canViewReports: false } }, params: { id: "job-1" } },
    response(),
    (error) => { forwarded = error; },
  );
  assert.equal(forwarded.status, 403);
  assert.match(forwarded.message, /wholesale prices/);
});
