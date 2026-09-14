const prisma = require("./prisma");

const FARM_CATEGORIES = new Set(["livestock", "farm"]);

async function getFarmConfiguration(shopId, client = prisma) {
  const shop = await client.shop.findUnique({
    where: { id: shopId },
    select: { category: true, farmSettings: { select: { hasLivestock: true, hasCrops: true } } },
  });
  if (!shop) return null;

  const category = String(shop.category || "").toLowerCase();
  const settings = shop.farmSettings;
  const hasLivestock = category === "livestock" || Boolean(settings?.hasLivestock);
  const hasCrops = Boolean(settings?.hasCrops);

  return {
    category,
    isFarm: FARM_CATEGORIES.has(category),
    hasLivestock,
    hasCrops,
    needsSetup: category === "farm" && !hasLivestock && !hasCrops,
  };
}

module.exports = { FARM_CATEGORIES, getFarmConfiguration };
