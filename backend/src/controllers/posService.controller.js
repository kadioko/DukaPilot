const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const canSeeCosts = (req) => req.user.role === "ADMIN" || !req.user.staffId || req.user.permissions?.canViewReports;
const visible = (service, req) => {
  const permissions = req.user.permissions || {};
  const canSeePrice = canSeeCosts(req) || permissions.canManageStock || permissions.canSell || permissions.canViewSalePrices;
  return { id: service.id, name: service.name, unit: service.unit, defaultSellingPrice: canSeePrice ? service.defaultSellingPrice : null,
    ...(canSeeCosts(req) ? { defaultEstimatedUnitCost: service.defaultEstimatedUnitCost } : {}) };
};

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const search = String(req.query.search || "").trim().slice(0, 160);
  const page = Math.min(100000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 30));
  const where = { shopId, isActive: true, ...(search ? { name: { contains: search, mode: "insensitive" } } : {}) };
  const [services, total] = await Promise.all([
    prisma.service.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
    prisma.service.count({ where }),
  ]);
  res.json({ services: services.map((service) => visible(service, req)), total, page, limit });
});

function parseInput(body, req, previous) {
  const name = String(body.name ?? previous?.name ?? "").trim();
  const price = Number(body.defaultSellingPrice ?? previous?.defaultSellingPrice);
  const hasCost = Object.prototype.hasOwnProperty.call(body, "defaultEstimatedUnitCost");
  if (hasCost && !canSeeCosts(req)) throw Object.assign(new Error("Reports permission is required to set service costs"), { status: 403 });
  const cost = hasCost ? Number(body.defaultEstimatedUnitCost) : (previous?.defaultEstimatedUnitCost ?? 0);
  if (!name || name.length > 240) throw Object.assign(new Error("Enter a service name of 1 to 240 characters"), { status: 400 });
  if (!Number.isSafeInteger(price) || price < 0 || price > 2147483647 || !Number.isSafeInteger(cost) || cost < 0 || cost > 2147483647) throw Object.assign(new Error("Prices must be non-negative whole TZS amounts"), { status: 400 });
  return { name, defaultSellingPrice: price, defaultEstimatedUnitCost: cost };
}

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const data = parseInput(req.body, req);
  const id = String(req.body.requestId || "");
  if (!/^[a-f0-9-]{36}$/i.test(id)) return res.status(400).json({ error: "A valid service request ID is required" });
  const sameRequest = (item) => item && item.shopId === shopId && item.name === data.name && item.defaultSellingPrice === data.defaultSellingPrice && item.defaultEstimatedUnitCost === data.defaultEstimatedUnitCost && item.unit === "service";
  let service;
  try {
    service = await prisma.service.create({ data: { id, shopId, unit: "service", ...data } });
  } catch (error) {
    if (error.code !== "P2002") throw error;
    service = await prisma.service.findUnique({ where: { id } });
    if (!sameRequest(service)) return res.status(409).json({ error: "This service request ID has already been used" });
    return res.json({ service: visible(service, req), reused: true });
  }
  req.audit = { action: "service.create", resourceType: "service", resourceId: service.id };
  res.status(201).json({ service: visible(service, req) });
});

const update = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await prisma.service.findFirst({ where: { id: req.params.id, shopId, isActive: true } });
  if (!existing) return res.status(404).json({ error: "Service not found" });
  const data = parseInput(req.body, req, existing);
  const service = await prisma.service.update({ where: { id: existing.id }, data });
  req.audit = { action: "service.update", resourceType: "service", resourceId: service.id };
  res.json({ service: visible(service, req) });
});

module.exports = { list, create, update };
