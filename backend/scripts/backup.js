#!/usr/bin/env node
/**
 * DukaOS — PostgreSQL backup script
 *
 * Usage:
 *   node scripts/backup.js
 *
 * Required env vars (can be provided in .env or directly):
 *   DATABASE_URL — PostgreSQL connection URL
 *   BACKUP_DIR   — Directory to write backups to (default: ./backups)
 *   BACKUP_RETAIN_DAYS — Days to keep backups (default: 7)
 *
 * Recommended: run daily via cron or Railway's cron job:
 *   0 2 * * * node /app/scripts/backup.js >> /var/log/dukaos-backup.log 2>&1
 *
 * On Railway, add a separate "cron" service that runs this script using
 * the same DATABASE_URL environment variable from your project.
 */

require("dotenv").config();
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[backup] ERROR: DATABASE_URL is not set");
  process.exit(1);
}

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "..", "backups");
const RETAIN_DAYS = parseInt(process.env.BACKUP_RETAIN_DAYS || "7", 10);

// Ensure backup directory exists
fs.mkdirSync(BACKUP_DIR, { recursive: true });

const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
const filename = `dukaos-backup-${timestamp}.sql.gz`;
const filepath = path.join(BACKUP_DIR, filename);

console.log(`[backup] Starting backup at ${now.toISOString()}`);
console.log(`[backup] Output: ${filepath}`);

// Run pg_dump and gzip
const result = spawnSync(
  "sh",
  ["-c", `pg_dump "${DATABASE_URL}" | gzip > "${filepath}"`],
  { stdio: "inherit" }
);

if (result.status !== 0) {
  console.error("[backup] pg_dump failed with exit code:", result.status);
  if (result.error) console.error("[backup] Error:", result.error.message);
  process.exit(1);
}

const stat = fs.statSync(filepath);
const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
console.log(`[backup] Backup complete: ${filename} (${sizeMB} MB)`);

// Delete backups older than RETAIN_DAYS
const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
let deleted = 0;
for (const file of fs.readdirSync(BACKUP_DIR)) {
  if (!file.startsWith("dukaos-backup-") || !file.endsWith(".sql.gz")) continue;
  const fullPath = path.join(BACKUP_DIR, file);
  const fileStat = fs.statSync(fullPath);
  if (fileStat.mtimeMs < cutoff) {
    fs.unlinkSync(fullPath);
    deleted++;
    console.log(`[backup] Deleted old backup: ${file}`);
  }
}
console.log(`[backup] Cleanup complete: ${deleted} old backup(s) removed`);
console.log(`[backup] Done.`);
