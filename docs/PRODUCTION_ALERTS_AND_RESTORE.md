# Production Alerts And Restore Drill

## Scheduled Monitor

The `Production Monitor` GitHub workflow runs at 17 and 47 minutes past each hour. It checks Railway health, the Vercel frontend, catalog proxy, CORS, login, an authenticated dashboard request, and an invalid-token response.

Before relying on it, add these repository secrets in GitHub Actions:

- `MONITOR_LOGIN_PHONE`
- `MONITOR_LOGIN_PIN`

On failure, the workflow opens one `Production monitor failure` issue. Watching the repository or enabling GitHub issue notifications is the Railway uptime alert destination.

## Sentry Alert Destination

Backend monitoring is live. The `dukapilot-backend` Sentry project receives Railway production errors through `SENTRY_DSN`, and new high-priority issues notify the founder by email.

The alert path was tested successfully on 2026-08-06 with issue `DUKAPILOT-BACKEND-1 - DukaPilot alert drill`. Railway startup logs also confirmed `[sentry] Initialized`.

Run future drills without copying the DSN locally:

```powershell
cd backend
railway run npm run sentry:test
```

Confirm both the Sentry issue and notification email arrive, then resolve the test issue. The frontend SDK is present but Vercel DSNs are not yet configured; do not describe frontend error monitoring as active until that setup has its own successful drill.

See `docs/SENTRY_MONITORING.md` for coverage, limits, testing, and incident response.

## Restore Drill

Never restore into the live Railway database. Create an empty, temporary PostgreSQL database and download a recent encrypted/off-site backup to a secure machine.

```powershell
$env:RESTORE_DRILL_DATABASE_URL = "postgresql://...temporary-drill-db..."
$env:RESTORE_DRILL_BACKUP_FILE = "C:\secure\dukapilot-backup.sql.gz"
$env:RESTORE_DRILL_CONFIRM = "RESTORE_INTO_NON_PRODUCTION"
cd backend
npm run db:restore-drill
```

Success means the restore completes and the script prints row counts for users, shops, products, and sales. Record the date, backup timestamp, duration, operator, and row counts in the incident log. Destroy the temporary database and downloaded backup after the drill.

Run this every quarter and after any backup-storage or migration change.
