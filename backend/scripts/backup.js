#!/usr/bin/env node
/**
 * DukaPilot PostgreSQL backup
 *
 * Creates a PostgreSQL custom archive, verifies it immediately, records a
 * checksum manifest, and optionally sends it to S3-compatible storage.
 *
 * The local Windows task invokes this through `railway run`, so credentials
 * stay in Railway's environment and are never written to this machine.
 */

require("dotenv").config();
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DATABASE_URL = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_MIGRATE_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[backup] BACKUP_DATABASE_URL, DATABASE_MIGRATE_URL, or DATABASE_URL is required.");
  process.exit(1);
}

const BACKUP_DIR = path.resolve(process.env.LOCAL_BACKUP_DIR || process.env.BACKUP_DIR || path.join(__dirname, "..", "backups"));
const RETAIN_DAYS = Math.max(1, Number.parseInt(process.env.BACKUP_RETAIN_DAYS || "7", 10) || 7);
const PG_DUMP = process.env.PG_DUMP_PATH || "pg_dump";
const PG_RESTORE = process.env.PG_RESTORE_PATH || "pg_restore";
const DOCKER_POSTGRES_IMAGE = process.env.BACKUP_DOCKER_POSTGRES_IMAGE || "postgres:16-alpine";

fs.mkdirSync(BACKUP_DIR, { recursive: true });

const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
const filename = `dukapilot-backup-${timestamp}.dump`;
const filepath = path.join(BACKUP_DIR, filename);
const manifestPath = path.join(BACKUP_DIR, `${filename}.json`);

function run(command, args, label) {
  const result = spawnSync(command, args, { stdio: "inherit", windowsHide: true });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label} exited with code ${result.status}`);
}

function isAvailable(command, args = ["--version"]) {
  const result = spawnSync(command, args, { stdio: "ignore", windowsHide: true });
  return !result.error && result.status === 0;
}

function useDocker() {
  return isAvailable("docker", ["version", "--format", "{{.Server.Version}}"]);
}

function dockerMountArgs() {
  return ["--mount", `type=bind,source=${BACKUP_DIR},target=/backups`];
}

function createArchive() {
  const dumpArgs = [`--dbname=${DATABASE_URL}`, "--format=custom", "--compress=9", `--file=${filepath}`];
  if (isAvailable(PG_DUMP)) {
    run(PG_DUMP, dumpArgs, "pg_dump");
    return "local pg_dump";
  }
  if (useDocker()) {
    run("docker", ["run", "--rm", ...dockerMountArgs(), DOCKER_POSTGRES_IMAGE, "pg_dump", `--dbname=${DATABASE_URL}`, "--format=custom", "--compress=9", `--file=/backups/${filename}`], "Docker pg_dump");
    return `Docker (${DOCKER_POSTGRES_IMAGE})`;
  }
  throw new Error("pg_dump is not installed and Docker Desktop is unavailable. Install PostgreSQL client tools or start Docker Desktop, then try again.");
}

function verifyArchive() {
  if (isAvailable(PG_RESTORE)) {
    run(PG_RESTORE, ["--list", filepath], "pg_restore archive verification");
    return;
  }
  if (useDocker()) {
    run("docker", ["run", "--rm", ...dockerMountArgs(), DOCKER_POSTGRES_IMAGE, "pg_restore", "--list", `/backups/${filename}`], "Docker pg_restore archive verification");
    return;
  }
  throw new Error("The backup was created but cannot be verified because pg_restore and Docker Desktop are unavailable.");
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function deleteExpiredBackups() {
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  let deleted = 0;
  for (const entry of fs.readdirSync(BACKUP_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !/^dukapilot-backup-.*\.(dump|sql\.gz)$/.test(entry.name)) continue;
    const fullPath = path.join(BACKUP_DIR, entry.name);
    if (fs.statSync(fullPath).mtimeMs >= cutoff) continue;
    fs.unlinkSync(fullPath);
    const matchingManifest = path.join(BACKUP_DIR, `${entry.name}.json`);
    if (fs.existsSync(matchingManifest)) fs.unlinkSync(matchingManifest);
    deleted++;
  }
  console.log(`[backup] Retention cleanup removed ${deleted} old backup(s).`);
}

async function uploadToS3() {
  const bucket = process.env.BACKUP_S3_BUCKET;
  if (!bucket) return;
  const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
  const prefix = process.env.BACKUP_S3_PREFIX || "dukapilot-backups/";
  const client = new S3Client({
    region: process.env.BACKUP_S3_REGION || "auto",
    endpoint: process.env.BACKUP_S3_ENDPOINT || undefined,
    credentials: { accessKeyId: process.env.BACKUP_S3_ACCESS_KEY_ID, secretAccessKey: process.env.BACKUP_S3_SECRET_ACCESS_KEY },
  });
  const key = `${prefix}${filename}`;
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: fs.createReadStream(filepath), ContentType: "application/octet-stream" }));
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: `${key}.json`, Body: fs.createReadStream(manifestPath), ContentType: "application/json" }));
  const cutoff = Date.now() - RETAIN_DAYS * 24 * 60 * 60 * 1000;
  const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  const stale = (listed.Contents || []).filter((item) => item.LastModified && item.LastModified.getTime() < cutoff);
  if (stale.length) await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: stale.map((item) => ({ Key: item.Key })) } }));
  console.log(`[backup] Off-site upload complete: s3://${bucket}/${key}`);
}

async function main() {
  console.log(`[backup] Starting ${now.toISOString()}`);
  console.log(`[backup] Writing archive to ${filepath}`);
  const tool = createArchive();
  if (!fs.existsSync(filepath) || fs.statSync(filepath).size === 0) throw new Error("pg_dump reported success but produced no archive");
  verifyArchive();
  const stat = fs.statSync(filepath);
  const manifest = {
    format: "postgresql-custom",
    createdAt: now.toISOString(),
    filename,
    bytes: stat.size,
    sha256: sha256(filepath),
    tool,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  console.log(`[backup] Verified ${filename} (${(stat.size / (1024 * 1024)).toFixed(2)} MB, sha256 ${manifest.sha256.slice(0, 12)}...).`);
  deleteExpiredBackups();
  await uploadToS3();
  console.log("[backup] Complete.");
}

main().catch((error) => {
  console.error(`[backup] FAILED: ${error.message}`);
  process.exit(1);
});
