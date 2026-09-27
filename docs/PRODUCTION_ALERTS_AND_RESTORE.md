# Production Alerts And Restore Drill

## Scheduled Monitor

The `Production Monitor` GitHub workflow runs at 17 and 47 minutes past each hour. It checks Railway health, the Vercel frontend, catalog proxy, CORS, login, an authenticated dashboard request, and an invalid-token response.

Before relying on it, add these repository secrets in GitHub Actions:

- `MONITOR_LOGIN_PHONE`
- `MONITOR_LOGIN_PIN`

On failure, the workflow opens one `Production monitor failure` issue. Watching the repository or enabling GitHub issue notifications is the Railway uptime alert destination.

The monitor passed its full live check on 21 September 2026. The matching
release evidence is in
[Production Verification](./PRODUCTION_VERIFICATION_2026-09-20.md).

## nTZS Payment Reconciliation

The `nTZS Payment Reconciliation` GitHub workflow runs every 15 minutes and can
also be started manually. It calls the protected Railway endpoint with the
`MERCHANT_WALLET_RECONCILE_CRON_SECRET` stored separately in Railway and GitHub
Actions. Never put this secret in Vercel, documentation, workflow output, or a
customer-facing response.

The endpoint checks at most 100 known pending/review Merchant Balance records
and 100 known pending/review subscription checkouts per run. It reads provider
status for existing IDs and does not scan or recreate all historical payments.
A zero-checked result is healthy when no known operation is pending; it is not
proof that a provider-side operation with no saved provider ID does not exist.

On 20 September 2026, manual run
[35536715003](https://github.com/kadioko/DukaPilot/actions/runs/35536715003)
completed successfully with zero waiting wallet and subscription operations.
If a later run reports unresolved items, review provider evidence and the saved
idempotency key before attempting an adjustment or a new collection.

## Sentry Alert Destination

Backend monitoring is live. The `dukapilot-backend` Sentry project receives Railway production errors through `SENTRY_DSN`, and new high-priority issues notify the founder by email.

The alert path was tested successfully on 2026-08-06 with issue `DUKAPILOT-BACKEND-1 - DukaPilot alert drill`. Railway startup logs also confirmed `[sentry] Initialized`.

Run future drills without copying the DSN locally:

```powershell
cd backend
railway run npm run sentry:test
```

Confirm both the Sentry issue and notification email arrive, then resolve the test issue.

Frontend browser and Next.js server monitoring are also live through the `javascript-nextjs` project. Vercel production holds both `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_DSN`; neither value belongs in Git or documentation.

The frontend issue and email path was verified on 2026-08-06 with `JAVASCRIPT-NEXTJS-1 - DukaPilot frontend alert drill`, then the test issue was resolved.

See `docs/SENTRY_MONITORING.md` for coverage, limits, testing, and incident response.

## Restore Drill

Never restore into the live Railway database. Create an empty, temporary PostgreSQL database and use a recent verified PostgreSQL custom archive from the protected local backup folder or approved off-site storage.

```powershell
$env:RESTORE_DRILL_DATABASE_URL = "postgresql://...temporary-drill-db..."
$env:RESTORE_DRILL_BACKUP_FILE = "C:\Users\USER\DukaPilot-Backups\dukapilot-backup-YYYY-MM-DD_HH-MM-SS.dump"
$env:RESTORE_DRILL_CONFIRM = "RESTORE_INTO_NON_PRODUCTION"
cd backend
npm run db:restore-drill
```

Success means the restore completes and the script prints row counts for users, shops, products, and sales. Record the date, backup timestamp, archive checksum, duration, operator, and row counts in the incident log. Destroy the temporary database and any downloaded working copy after the drill.

Run this every quarter and after any backup-storage or migration change.

For the current Railway Hobby local backup schedule, storage location, retention,
and Windows/Docker prerequisites, see
[Local Railway Hobby Backups](./LOCAL_RAILWAY_HOBBY_BACKUPS.md).
