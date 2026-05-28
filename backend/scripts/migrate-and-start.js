/**
 * Railway startup script.
 * Attempts prisma migrate deploy using DATABASE_MIGRATE_URL (public TCP proxy)
 * which works before Railway's private network is fully available.
 * If migrations fail, logs a warning but starts the app anyway — the schema
 * may already be current from a previous successful deploy.
 */
const { execSync } = require("child_process");
const path = require("path");

const migrateUrl = process.env.DATABASE_MIGRATE_URL || process.env.DATABASE_URL;
const appRoot = path.resolve(__dirname, "..");

console.log("Attempting prisma migrate deploy...");
try {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    cwd: appRoot,
    env: { ...process.env, DATABASE_URL: migrateUrl },
  });
  console.log("Migrations complete.");
} catch (err) {
  // Non-fatal: schema may already be up to date.
  // The app will crash on startup if the schema is genuinely incompatible.
  console.warn("Migration step failed (schema may already be current):", err.message);
}

// Start the main app
require(path.resolve(appRoot, "src/app.js"));
