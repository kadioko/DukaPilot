const { PrismaClient } = require("@prisma/client");

// Limit connection pool to avoid exhausting Railway Hobby PostgreSQL (100 max connections).
// connection_limit=5 leaves headroom for migrations, admin tools, and multiple dynos.
// Safely append query params regardless of whether DATABASE_URL already has a query string.
const base = process.env.DATABASE_URL || "";
const sep = base.includes("?") ? "&" : "?";
const dbUrl = base + sep + "connection_limit=5&pool_timeout=10";

const prisma =
  global.__prisma ||
  new PrismaClient({
    datasources: { db: { url: dbUrl } },
  });

if (process.env.NODE_ENV !== "production") global.__prisma = prisma;

module.exports = prisma;
