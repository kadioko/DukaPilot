const prisma = require("./prisma");

async function getShopIdForUser(user) {
  if (user.staffId) {
    if (user.shopId) return user.shopId;
    const staff = await prisma.staffMember.findUnique({ where: { id: user.staffId } });
    if (!staff || !staff.isActive) throw Object.assign(new Error("Staff access not found"), { status: 403 });
    return staff.shopId;
  }

  const shop = await prisma.shop.findUnique({ where: { userId: user.userId } });
  if (!shop) throw Object.assign(new Error("Shop not found"), { status: 404 });
  return shop.id;
}

module.exports = { getShopIdForUser };
