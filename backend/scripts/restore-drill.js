#!/usr/bin/env node

// Restore a backup into a separate empty database and verify core records.
// This intentionally refuses to run without an explicit non-production confirmation.
require("dotenv").config();
const { existsSync } = require("fs");
const { spawnSync } = require("child_process");
const path = require("path");

const targetUrl = process.env.RESTORE_DRILL_DATABASE_URL;
const backupFile = process.env.RESTORE_DRILL_BACKUP_FILE;

if (process.env.RESTORE_DRILL_CONFIRM !== "RESTORE_INTO_NON_PRODUCTION") {
  console.error("[restore-drill] Set RESTORE_DRILL_CONFIRM=RESTORE_INTO_NON_PRODUCTION to continue.");
  process.exit(1);
}
if (!targetUrl || !backupFile) {
  console.error("[restore-drill] RESTORE_DRILL_DATABASE_URL and RESTORE_DRILL_BACKUP_FILE are required.");
  process.exit(1);
}
if (targetUrl === process.env.DATABASE_URL || targetUrl === process.env.DATABASE_MIGRATE_URL) {
  console.error("[restore-drill] Target must be a separate non-production database.");
  process.exit(1);
}

const resolvedBackup = path.resolve(backupFile);
if (!existsSync(resolvedBackup)) {
  console.error(`[restore-drill] Backup file not found: ${resolvedBackup}`);
  process.exit(1);
}

const command = resolvedBackup.endsWith(".gz")
  ? `gzip -dc "${resolvedBackup}" | psql "${targetUrl}" -v ON_ERROR_STOP=1`
  : `psql "${targetUrl}" -v ON_ERROR_STOP=1 -f "${resolvedBackup}"`;
const restore = spawnSync("sh", ["-c", command], { stdio: "inherit" });
if (restore.status !== 0) {
  console.error("[restore-drill] Restore failed.");
  process.exit(1);
}

const verificationQuery = [
  "SELECT 'users', COUNT(*) FROM users",
  "SELECT 'shops', COUNT(*) FROM shops",
  "SELECT 'products', COUNT(*) FROM products",
  "SELECT 'sales', COUNT(*) FROM sales",
].join(" UNION ALL ");
const verification = spawnSync("psql", [targetUrl, "-v", "ON_ERROR_STOP=1", "-c", verificationQuery], { stdio: "inherit" });
if (verification.status !== 0) {
  console.error("[restore-drill] Restore completed but verification failed.");
  process.exit(1);
}

console.log("[restore-drill] SUCCESS: backup restored and core tables verified.");
