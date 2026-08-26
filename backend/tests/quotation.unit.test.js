const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const quotation = require("../src/controllers/quotation.controller");

function sampleQuote() {
  return {
    quotationNumber: "QT-0001", currentRevisionNumber: 2, status: "SENT", issueDate: new Date("2026-08-01"), expiryDate: new Date("2026-08-15"), projectTitle: "Kitchen fitting", projectType: "Installation", scopeOfWork: "Fit cabinets", currency: "TZS",
    customer: { name: "Amina", phone: "+255700000001", email: "amina@example.com", address: "Mwanza" }, customerNote: "Thank you", internalNote: "Ask supplier for a better price", termsAndConditions: "50% deposit", paymentTerms: "Pay by M-Pesa",
    discountAmount: 10000, taxRateBasisPoints: 1800, subtotalAmount: 100000, taxAmount: 16200, totalAmount: 106200, amountPaid: 20000, depositRequiredAmount: 53100, depositDueDate: new Date("2026-08-05"),
    sections: [{ id: "materials", name: "Materials", position: 0, visibleToCustomer: true }],
    items: [{ id: "item-1", sectionId: "materials", position: 0, category: "MATERIAL", name: "Cabinet board", description: "18mm board", quantityMilli: 2000, unit: "pcs", unitPrice: 50000, discountAmount: 0, taxRateBasisPoints: 1800, lineSubtotal: 100000, taxAmount: 16200, totalSellingPrice: 116200, visibleToCustomer: true, productId: "product-1", estimatedUnitCost: 28000, estimatedTotalCost: 56000, supplierId: "supplier-1", supplier: { name: "Private supplier" }, internalNote: "Delivery included", markupBasisPoints: 7857, estimatedProfit: 44000, estimatedProfitMarginBps: 4400 }],
  };
}

const settings = { showQuantities: true, showUnitPrices: true, showItemDiscounts: true, showSections: true, signatureName: "Owner", business: { name: "Duka la Amina", phone: "+255700000000" } };

test("public quotation snapshot omits all internal costs, margins, suppliers, and notes", () => {
  const snapshot = quotation.quotationSnapshot(sampleQuote(), settings);
  const rendered = JSON.stringify(snapshot.publicSnapshot);
  assert.match(rendered, /Cabinet board/);
  assert.equal(rendered.includes("Private supplier"), false);
  assert.equal(rendered.includes("Ask supplier"), false);
  assert.equal(rendered.includes("estimatedUnitCost"), false);
  assert.equal(rendered.includes("estimatedTotalCost"), false);
  assert.equal(rendered.includes("estimatedProfit"), false);
  assert.equal(rendered.includes("markupBasisPoints"), false);
  assert.equal(snapshot.publicSnapshot.items[0].unitPrice, 50000);
  assert.equal(snapshot.publicSnapshot.outstandingAmount, 86200);
});

test("customer visibility and document settings remove hidden lines and optional pricing fields", () => {
  const source = sampleQuote();
  source.items.push({ ...source.items[0], id: "internal-line", name: "Internal contingency", visibleToCustomer: false, sectionId: null });
  const snapshot = quotation.quotationSnapshot(source, { ...settings, showQuantities: false, showUnitPrices: false, showItemDiscounts: false, showSections: false });
  assert.equal(snapshot.publicSnapshot.sections.length, 0);
  assert.equal(snapshot.publicSnapshot.items.length, 1);
  assert.equal(snapshot.publicSnapshot.items[0].quantity, undefined);
  assert.equal(snapshot.publicSnapshot.items[0].unitPrice, undefined);
});

test("schema keeps quotation conversion one-to-one and service sale lines stock-neutral", () => {
  const schema = fs.readFileSync(path.resolve(__dirname, "../prisma/schema.prisma"), "utf8");
  assert.match(schema, /quotationId\s+String\?\s+@unique/);
  assert.match(schema, /productId\s+String\?/);
  assert.match(schema, /serviceId\s+String\?/);
  assert.match(schema, /model Service/);
});

test("migration contains tenant indexes and the public-share token uniqueness boundary", () => {
  const migration = fs.readFileSync(path.resolve(__dirname, "../prisma/migrations/20260827090000_quotation_management/migration.sql"), "utf8");
  assert.match(migration, /quotations_shopId_quotationNumber_key/);
  assert.match(migration, /quotation_shares_token_key/);
  assert.match(migration, /sales_quotationId_key/);
  assert.match(migration, /services_shopId_isActive_name_idx/);
});
