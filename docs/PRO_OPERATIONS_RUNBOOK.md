# Railway Pro Operations Runbook

Use this runbook when DukaPilot moves from Railway Hobby to a Railway plan with
the production backup and operational capacity the team has selected. It is an
operating checklist, not an assumption about a particular Railway plan: confirm
the current Railway plan features, retention, region, and limits in the Railway
dashboard before relying on them.

## Goal

Keep DukaPilot recoverable and observable as real merchants use sales, stock,
debts, expenses, farms, subscriptions, and supplier tools. A backup is only
useful when an isolated restore has been proven. A monitoring tool is only useful
when someone reviews and acts on it.

## Upgrade Checklist

1. Record the current Railway project, service, PostgreSQL service, region,
   deployment image or commit, custom domain, and database size in the private
   operations record. Do not put secrets, passwords, tokens, VAPID keys, or PINs
   in this document.
2. Confirm the production backend deploy command remains `npm run start:prod` so
   `prisma migrate deploy` runs before the API starts.
3. Run `cd backend; npm run monitor:prod` and save the redacted result with the
   release commit. It must pass health, CORS, catalog, and login checks before
   changing the plan.
4. Confirm Railway and Vercel production environment variables are present and
   their values are never printed in terminal history, screenshots, Git, or
   support chat.
5. Upgrade the plan in Railway, then check the service is healthy and the latest
   committed release is serving. Do not make a migration, pricing, or domain
   change in the same window unless an incident requires it.

## Backups And Restore Drills

1. Enable the Railway PostgreSQL backup option and record its retention period
   and accountable owner in the private operations record.
2. Keep an additional encrypted export only in an access-controlled company
   storage location when the selected plan or process requires it. Never store a
   production SQL dump in the repository, a public Drive link, or an unmanaged
   personal device.
3. Run a restore drill at least quarterly, and after a database-provider or
   backup-policy change. Use an isolated non-production database only; never
   restore a drill over live merchant data.
4. Use the existing scripts with protected environment variables:

   ```powershell
   cd backend
   npm run db:backup
   npm run db:restore-drill
   ```

5. Verify the drill record includes: backup timestamp, restore start/end, target
   database name, row-count or smoke checks, operator, and result. Destroy the
   temporary restore database and export when the drill is complete, subject to
   the approved retention policy.
6. Treat a failed backup or failed restore drill as a production operational
   incident. Fix it and repeat the drill before claiming recovery readiness.

## Monitoring And Sentry Cadence

### After Every Production Deployment

1. Check Railway deployment logs and `/health`.
2. Run `npm run monitor:prod` from `backend` after rate limits have cooled.
3. Check the live Vercel routes relevant to the release.
4. Review Sentry release health and new unresolved issues. Attach a release or
   deployment reference; do not add merchant names, phones, payment references,
   tokens, PINs, or request bodies to Sentry context.

### Daily On Business Days

1. Check new Sentry issues and recent error volume.
2. Check the Admin support dashboard for failed offline sync, pending payment
   review, support statuses, and suspicious operational errors.
3. Review Railway logs and metrics for restarts, failed deploys, database
   connection errors, CPU or memory pressure, and unusual response failures.

### Weekly

1. Triage every unresolved Sentry issue: owner, severity, affected workflow,
   first/last seen, mitigation, and target release.
2. Run `npm run monitor:prod` once as a clean scheduled check.
3. Check the backup status and retention setting.
4. Review Vercel deployments and environment changes. Re-run the monitor after
   a frontend API URL, CORS, cookie, or domain change.

### Quarterly

1. Perform and document the isolated restore drill.
2. Trigger and resolve the documented Sentry alert drill if Sentry settings,
   DSNs, alert rules, or notification destinations changed; otherwise follow the
   quarterly guidance in `docs/SENTRY_MONITORING.md`.
3. Reconfirm who holds operational access and remove people who no longer need
   Railway, Vercel, GitHub, Sentry, or database access.

## Incident Response

1. Confirm impact using health checks, Railway and Vercel logs, Sentry, and a
   test account. Do not inspect or alter a merchant's records unless support and
   authorization require it.
2. For a broad outage, pause risky deploys and roll back to the last known-good
   release if that is safer than a hot fix.
3. For data-integrity concerns, preserve evidence, stop the affected automation
   where possible, and decide whether an isolated restore investigation is
   needed. Never run an untested restore against production.
4. Record timeline, affected workflows, mitigations, owner, follow-up test, and
   customer communication. Resolve the Sentry issue only after production is
   verified.

## Operational Evidence Template

Keep this in a private company-controlled location:

| Date | Activity | Operator | Release or backup ID | Result | Follow-up |
| --- | --- | --- | --- | --- | --- |
| YYYY-MM-DD | Production monitor / backup check / restore drill / Sentry review | Name | Commit or backup timestamp | Pass / fail | Ticket or next action |

## Related Documents

- `docs/SENTRY_MONITORING.md`
- `docs/SCALING.md`
- `docs/DATA_DELETION_REQUEST_TEST.md`
- `docs/FARM_OPERATIONS.md`
