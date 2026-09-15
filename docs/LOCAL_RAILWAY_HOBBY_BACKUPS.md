# Local Railway Hobby Backups

This is DukaPilot's current backup path while Railway's selected plan does not
provide the managed backup process the team wants. It creates a PostgreSQL
custom archive on this Windows machine without writing the Railway database URL
to a file or printing it in the terminal.

## What It Creates

- Directory: `C:\Users\USER\DukaPilot-Backups` by default.
- Archive: `dukapilot-backup-YYYY-MM-DD_HH-MM-SS.dump`.
- Manifest: a matching `.dump.json` file with timestamp, byte count, archive
  tool, and SHA-256 checksum.
- Log: `C:\Users\USER\DukaPilot-Backups\logs\backup-YYYY-MM-DD.log`.
- Retention: 14 days by default. Old archives and their matching manifests are
  removed only from that backup directory.

The archive is verified with `pg_restore --list` immediately after it is
created. A file is not called a successful backup merely because `pg_dump`
exited successfully.

## Local Prerequisites

1. Sign in to the Railway CLI and keep the project linked to DukaPilot.
2. Use either PostgreSQL client tools with `pg_dump`, `pg_restore`, and `psql`
   on your PATH, or start Docker Desktop. The script falls back to the official
   `postgres:16-alpine` image and pulls it on its first successful run.
3. Keep the backup folder in the signed-in Windows user's protected profile or
   on a full-disk-encrypted drive. Do not move archives into Git, a public link,
   WhatsApp, an unprotected USB device, or a shared folder.

## Run Now

```powershell
cd "C:\Users\USER\Documents\Coding\Projects 2\DukaOS\backend"
npm run db:backup:local
```

The wrapper calls Railway with the production backend service, receives the
connection values only in the child process environment, and prefers the public
migration connection for this local export. It never calls `railway variable
list`, which could expose secret values.

## Daily Schedule

Install the current-user scheduled task once:

```powershell
cd "C:\Users\USER\Documents\Coding\Projects 2\DukaOS\backend"
npm run db:backup:install-task
```

It runs every day at 02:20 while this Windows user is signed in. Confirm it
without printing secrets:

```powershell
Get-ScheduledTask -TaskName "DukaPilot Local Database Backup"
Get-ScheduledTaskInfo -TaskName "DukaPilot Local Database Backup"
```

To use another location or retention period, set `DUKAPILOT_BACKUP_DIR` and
`DUKAPILOT_BACKUP_RETAIN_DAYS` in the local Windows user environment before
running either command. They are local configuration values, not Railway
variables and not repository files.

## Restore Drill

Never restore an archive over production. Create an empty temporary PostgreSQL
database, then set `RESTORE_DRILL_DATABASE_URL`, `RESTORE_DRILL_BACKUP_FILE`,
and `RESTORE_DRILL_CONFIRM=RESTORE_INTO_NON_PRODUCTION` before running:

```powershell
npm run db:restore-drill
```

The drill accepts only the verified `.dump` archive format, restores without
ownership or privilege changes, and verifies the `users`, `shops`, `products`,
and `sales` tables. Record the date, archive filename, checksum, target, row
counts, duration, and outcome in the private operations record.

## Failure Handling

- If Docker Desktop and PostgreSQL client tools are both unavailable, the
  backup fails before claiming success. Start Docker Desktop or install the
  client tools, then rerun it.
- If Railway cannot inject the production connection, confirm the Railway CLI
  login, project link, and production backend service name. Do not copy the
  database URL from Railway into a command or document.
- If a scheduled run fails, review that day's local log, fix the cause, and run
  a successful manual backup the same day.

This local copy reduces risk on Railway Hobby, but it is not a substitute for
an isolated restore drill. If `BACKUP_S3_BUCKET` is configured in Railway, the
same verified archive and manifest are uploaded off-site. Confirm bucket access
controls and encryption-at-rest in the storage provider; do not assume that a
bucket is private or encrypted by default.
