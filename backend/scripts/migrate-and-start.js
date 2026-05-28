/**
 * Railway startup script.
 * Runs `prisma migrate deploy` using DATABASE_MIGRATE_URL (public TCP proxy)
 * so it works during Railway pre-start when private networking may not be
 * available yet. Then hands off to the main app via the internal DATABASE_URL.
 */
const { execSync } = require("child_process");
const path = require("path");

const migrateUrl = process.env.DATABASE_MIGRATE_URL || process.env.DATABASE_URL;

console.log("Running prisma migrate deploy...");
try {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, DATABASE_URL: migrateUrl },
  });
  console.log("Migrations complete.");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
}

// Hand off to the main app
require(path.resolve(__dirname, "../src/app.js"));
