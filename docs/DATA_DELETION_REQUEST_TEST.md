# Controlled Data Deletion Request Test

Status: Completed; public process and database-backed synthetic workflow verified

Request ID: `DUKA-DEL-TEST-20260825-001`

Request date: 2026-08-25

Owner: DukaPilot Privacy Owner (platform admin), Necuva Group Limited

## Scope and verification

| Field | Recorded result |
| --- | --- |
| Requester | Synthetic test request only; no production merchant, customer, staff, supplier, or payment data was used. |
| Verification method | Checked that the public deletion page asks for the account phone number and shop name before scope confirmation. Confirmed its email and WhatsApp request links are present. |
| Requested scope | Full account and shop deletion, including staff, products, stock, sales, debts, expenses, orders, catalog settings, push subscriptions, and app-usage records. |
| Expected excluded/retained data | Limited security, audit, payment, tax, and request-confirmation records; backup copies until their scheduled expiry; third-party messages under the relevant provider policy. |
| Public route tested | `https://www.dukapilot.com/delete-account` |

## Completion record

Completion date: 2026-08-25

Database workflow verification date: 2026-09-10

Completed by: DukaPilot Privacy Owner (platform admin)

Outcome: The public intake, identity-verification requirements, deletion scope,
30-day completion statement, partial-deletion option, and 90-day retention
statement were verified. The PostgreSQL test creates a synthetic owner, root shop,
branch, customer, debt collection, subscription payment, checkout, quotation and
signature settings, stock notes, food preparation records, livestock records, crop
plots/cycles/input/harvest records, and farm records. It then
runs the production anonymization service and verifies that access and identifying
data are removed while required financial records retain referential integrity. No
real customer or production data is used.

Automated evidence: `backend/tests/postgresIntegrity.test.js`, configured in the
`postgres-integrity` CI job after applying all migrations to a disposable database.
The earlier core workflow passed in GitHub Actions run
`https://github.com/kadioko/DukaPilot/actions/runs/34288036715`. The expanded field
coverage passed locally on 2026-09-10 against a disposable PostgreSQL database after
all 39 migrations; the next CI run is the durable verification record for this expansion.

## Retention expiry

The evidence for this synthetic test contains no customer data. Retain this
record only until 2026-12-08, then delete or replace it with a new test record.

## Live-request handling checklist

For an actual verified request, create a private support record with the request
date, account verification, exact scope, assigned owner, completion date, and
the date any retained data/backups expire. Do not place a real customer's phone,
name, or deletion evidence in the public repository.
