const prisma = require("./prisma");

async function getShopIdForUser(user) {
  const shop = await prisma.shop.findUnique({ where: { userId: user.userId } });
  if (!shop) throw Object.assign(new Error("Shop not found"), { status: 404 });
  return shop.id;
}

module.exports = { getShopIdForUser };
