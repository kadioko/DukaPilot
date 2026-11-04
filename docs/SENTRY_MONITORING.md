# Sentry Production Monitoring

Last reviewed: 2026-11-04

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

## API Request Diagnostics

The frontend records a privacy-safe diagnostic breadcrumb for failed API requests. Network failures, timeouts, invalid API responses, and `5xx` responses are also captured as Sentry exceptions. Expected `4xx` responses remain breadcrumbs so rejected logins and normal permission checks do not create noisy incidents.

Each API diagnostic includes only:

- Request method and endpoint path without its query string.
- The browser-facing API hostname, expected upstream hostname when using the `/_api` proxy, HTTP status when available, transport type, timeout flag, and failure category.
- Browser connectivity state, browser language, and application environment.

It must never include request or response bodies, authorization headers, cookies, customer details, sales data, payment references, or secrets. For an API incident, compare the Sentry event timestamp with Railway HTTP logs and Vercel deployment logs before treating it as a backend outage.

For slow or failed requests to `GET /api/products`, `GET /api/products/summary`, `GET /api/expenses`, and `PATCH /api/settings/profile`, the backend logs a timing record only when the request is slow (at least 1.5 seconds), returns a `5xx`, or the client disconnects. Records include the request ID, method, path without query parameters, status, duration, outcome, and safe server-side phase timings. Use the Sentry event's `requestId` to search Railway logs. A matching backend record means the request reached Railway; no matching record suggests it failed earlier in the browser/Vercel/proxy path, but verify the relevant platform logs before concluding.

The inventory page treats missing summary data as unavailable rather than zero and provides an explicit retry. Expense and inventory list failures also provide an in-page retry. Product creation uses a persisted idempotency key and an uncertain-save recovery state; do not ask a merchant to start a second product until the original attempt is confirmed or retried with that same key. Profile-name PATCH retries once with the identical value because setting a name is idempotent.

As of 2026-11-04, the frontend Sentry feed had seven unresolved issue groups with recent production network/timeout events on authentication, inventory, settings, and expenses. Keep them unresolved until correlated with platform logs and a deployed fix has been verified. The backend feed had no unresolved issues with events in the preceding 30 days; this does not establish that every backend request succeeded.

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
