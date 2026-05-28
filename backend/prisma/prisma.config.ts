import { defineConfig } from "prisma/config";

// prisma.config.ts is used by Prisma CLI (migrate, generate, etc.)
// The running app uses @prisma/adapter-pg directly in src/lib/prisma.js.
export default defineConfig({
  datasourceUrl: process.env.DATABASE_URL ?? process.env.DATABASE_MIGRATE_URL,
});
