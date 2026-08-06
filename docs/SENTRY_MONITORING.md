# Sentry Production Monitoring

Last verified: 2026-08-06

## What Sentry Does For DukaPilot

Sentry captures unexpected application errors that would otherwise appear only in server logs or merchant complaints. It groups repeated failures into one issue and records the stack trace, environment, affected route, frequency, and first/last occurrence. This helps the team answer:

- What failed and where in the code?
- Is it one merchant or a repeated production problem?
- Did the failure begin after a deployment?
- Is a core workflow such as login, sales, stock, debt, or billing affected?

Sentry also emails the founder when a new high-priority backend issue is detected.

## What Sentry Does Not Replace

Sentry is error tracking, not a complete availability or data-protection system. Continue to use:

- `npm run monitor:prod` and the scheduled GitHub production monitor for uptime and core-flow checks.
- Database backups and quarterly restore drills for recovery readiness.
- Unit, browser, and smoke tests for expected business behaviour.
- Railway and Vercel logs for deployment and infrastructure diagnosis.

Normal validation failures, rejected logins, and expected `4xx` responses should not become Sentry incidents.

## Current Production State

### Backend

- Sentry project: `dukapilot-backend` in the `necuva-group` organization.
- Railway production variable: `SENTRY_DSN` is configured.
- Alert destination: founder email for new high-priority issues.
- Express error handler: enabled after application routes.
- Performance tracing sample: 10% of transactions.
- Alert drill: `DUKAPILOT-BACKEND-1 - DukaPilot alert drill` was received by Sentry and email on 2026-08-06.

The DSN must remain in Railway variables or another approved secrets manager. Never commit it to Git, paste it into documentation, or expose it in screenshots.

### Frontend

Frontend monitoring is live through the existing `javascript-nextjs` Sentry project.

- Vercel production variable `NEXT_PUBLIC_SENTRY_DSN` enables browser error capture.
- Vercel production variable `SENTRY_DSN` enables Next.js server-side error capture.
- Browser and server performance tracing sample 10% of transactions.
- Browser replay is disabled for normal sessions and enabled only when an error is captured.
- Alert drill: `JAVASCRIPT-NEXTJS-1 - DukaPilot frontend alert drill` was received by Sentry and email, then resolved, on 2026-08-06.

Both variables are configured only in Vercel and must never be committed to Git. Review Sentry events before sharing them outside the incident-response team, and never add PINs, OTPs, authentication tokens, payment references, or customer phone numbers as custom Sentry context.

## Test The Backend Alert

Run the test using Railway's production environment variable without printing the DSN:

```powershell
cd backend
railway run npm run sentry:test
```

Expected result:

1. The command prints `Test event sent`.
2. A `DukaPilot alert drill` issue appears in the `dukapilot-backend` project.
3. The founder receives the Sentry email notification.
4. The test issue is resolved after verification so the issue feed stays useful.

Run an alert drill after changing either Sentry project, a DSN, alert rule, notification email, SDK version, Railway environment, or Vercel environment. Otherwise, test quarterly.

## Incident Response

1. Confirm whether the issue is production and whether it affects a core merchant workflow.
2. Check event count, first/last seen time, route, release, and stack trace.
3. Reproduce with a test shop without changing real merchant data.
4. Fix the smallest responsible code path and add a regression test.
5. Deploy, run production smoke and monitor scripts, then watch Sentry for recurrence.
6. Resolve the issue only after the fix is live and verified.

Treat data corruption, cross-shop access, payment duplication, stock corruption, and broad login failure as urgent even when event volume is low.
