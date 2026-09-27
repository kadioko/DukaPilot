# Production Verification - 20 September 2026

## Scope

This verification covered Merchant Balance, nTZS subscription checkout,
subscription payment from balance, reconciliation, the production frontend and
API, the Android wrapper, and the broader mocked regression suite. It records
the checks performed for commits `96acb9b` and `757fe8e` without storing any
API key, webhook secret, user PIN, provider wallet identifier, or unmasked
customer phone number.

## Hardening Completed

- Withdrawal confirmation is bound to the exact server-quoted amount,
  normalized destination phone, provider fee, total debit, recipient, and rail.
- Deposit and withdrawal request-key races resume the original provider
  operation instead of returning a stale pending object or starting another
  operation.
- Admin corrections can reuse a request key only for the exact same amount,
  direction, and reason.
- Documented provider rejections release a reserved withdrawal. Ambiguous 502,
  unknown 409, missing, or undocumented outcomes remain in review so DukaPilot
  cannot return money that may already be moving.
- Wallet history exposes the actual ledger effect. Failed and reversed records
  display no balance change; pending/review withdrawals display the reserved
  total; completed subscription payments display the exact debit.
- Production-route browser tests now intercept both `/api` and `/_api`, and
  shared shell inventory requests are mocked consistently.
- Android CI installs `platform-tools` explicitly and uses Java 17 through the
  current setup action, avoiding the obsolete Android SDK `tools` package.

## Automated Evidence

- Backend test suite: 183 tests passed.
- Frontend typecheck: passed.
- Prisma schema validation: passed.
- Production Next.js build: passed for all 46 routes.
- Focused Merchant Balance and Billing browser tests: 6 passed.
- Full production-mode mocked browser suite: 42 passed.
- GitHub Actions CI run
  [35537192343](https://github.com/kadioko/DukaPilot/actions/runs/35537192343)
  passed every job: backend, frontend typecheck, both npm audits, PostgreSQL
  migration/integrity, production-mode Playwright, and Android lint/build.

## Live Production Evidence

`cd backend && npm run monitor:prod` passed on 21 September 2026 for:

- Railway backend health;
- Vercel frontend shell;
- public catalog;
- CORS preflight;
- login;
- authenticated dashboard; and
- a controlled failed API path.

A private test merchant was used for a read-only wallet check. The live wallet
response included `balanceEffectTzs` for all returned history records, proving
the hardened backend was deployed. No new real-money withdrawal was initiated
solely for this verification.

The manually triggered `nTZS Payment Reconciliation` workflow run
[35536715003](https://github.com/kadioko/DukaPilot/actions/runs/35536715003)
completed successfully. It reported zero merchant-wallet and zero subscription
operations waiting for reconciliation at that moment.

## Operational Interpretation

The checked release is healthy for the tested flows. A future provider outage,
delayed webhook, or ambiguous provider response can still place a transaction
in `REVIEW`; that is intentional. Use the existing Check/Resume action or the
protected reconciliation workflow, and never create a replacement payment or
manual balance adjustment based only on amount and phone.

GitHub currently emits informational notices about its action runtime and a
future `ubuntu-latest` image migration. They did not fail this run and do not
represent an application incident, but the workflow actions and runner image
should be reviewed during routine CI maintenance.
