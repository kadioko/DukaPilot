/**
 * Railway startup script.
 * Runs prisma migrate deploy using DATABASE_MIGRATE_URL (public TCP proxy)
 * so it works before Railway's private network is fully available.
 * If migrations fail, logs a warning and starts the app anyway — the schema
 * is already current from previous successful deploys.
 */
const { execSync } = require("child_process");
const path = require("path");

const appRoot = path.resolve(__dirname, "..");
// Prisma 7 reads datasourceUrl from prisma.config.ts, but we can override
// via DATABASE_URL env for the CLI invocation.
const migrateUrl = process.env.DATABASE_MIGRATE_URL || process.env.DATABASE_URL;

console.log("Attempting prisma migrate deploy...");
try {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    cwd: appRoot,
    env: { ...process.env, DATABASE_URL: migrateUrl },
  });
  console.log("Migrations complete.");
} catch (err) {
  console.warn("Migration step failed (schema may already be current):", err.message);
}

require(path.resolve(appRoot, "src/app.js"));
