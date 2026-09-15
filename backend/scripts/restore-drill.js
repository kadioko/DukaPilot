#!/usr/bin/env node

// Restore a custom DukaPilot archive into an isolated, empty database only.
require("dotenv").config();
const { spawnSync } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

const targetUrl = process.env.RESTORE_DRILL_DATABASE_URL;
const backupFile = process.env.RESTORE_DRILL_BACKUP_FILE;
const productionUrl = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_MIGRATE_URL || process.env.DATABASE_URL;
const pgRestore = process.env.PG_RESTORE_PATH || "pg_restore";
const psql = process.env.PSQL_PATH || "psql";
const image = process.env.BACKUP_DOCKER_POSTGRES_IMAGE || "postgres:16-alpine";

if (process.env.RESTORE_DRILL_CONFIRM !== "RESTORE_INTO_NON_PRODUCTION") throw new Error("Set RESTORE_DRILL_CONFIRM=RESTORE_INTO_NON_PRODUCTION to continue.");
if (!targetUrl || !backupFile) throw new Error("RESTORE_DRILL_DATABASE_URL and RESTORE_DRILL_BACKUP_FILE are required.");
if (targetUrl === productionUrl) throw new Error("Target must be a separate non-production database.");

const resolvedBackup = path.resolve(backupFile);
if (!existsSync(resolvedBackup)) throw new Error(`Backup file not found: ${resolvedBackup}`);
if (!resolvedBackup.endsWith(".dump")) throw new Error("This restore drill accepts verified .dump archives only. Create a current local backup first.");

function available(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore", windowsHide: true });
  return !result.error && result.status === 0;
}

function run(command, args, label) {
  const result = spawnSync(command, args, { stdio: "inherit", windowsHide: true });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} exited with code ${result.status}`);
}

function dockerReady() {
  return available("docker", ["version", "--format", "{{.Server.Version}}"]);
}

const backupDir = path.dirname(resolvedBackup);
const backupName = path.basename(resolvedBackup);
const mount = ["--mount", `type=bind,source=${backupDir},target=/backups`];

if (available(pgRestore)) run(pgRestore, [`--dbname=${targetUrl}`, "--no-owner", "--no-privileges", "--exit-on-error", resolvedBackup], "pg_restore");
else if (dockerReady()) run("docker", ["run", "--rm", ...mount, image, "pg_restore", `--dbname=${targetUrl}`, "--no-owner", "--no-privileges", "--exit-on-error", `/backups/${backupName}`], "Docker pg_restore");
else throw new Error("pg_restore is not installed and Docker Desktop is unavailable.");

const verificationQuery = [
  "SELECT 'users', COUNT(*) FROM users",
  "SELECT 'shops', COUNT(*) FROM shops",
  "SELECT 'products', COUNT(*) FROM products",
  "SELECT 'sales', COUNT(*) FROM sales",
].join(" UNION ALL ");

if (available(psql)) run(psql, [`--dbname=${targetUrl}`, "-v", "ON_ERROR_STOP=1", "-c", verificationQuery], "psql restore verification");
else if (dockerReady()) run("docker", ["run", "--rm", image, "psql", `--dbname=${targetUrl}`, "-v", "ON_ERROR_STOP=1", "-c", verificationQuery], "Docker psql restore verification");
else throw new Error("The restore completed but psql is unavailable for verification.");

console.log("[restore-drill] SUCCESS: archive restored and core tables verified.");
