# Production Verification - 27 September 2026

## Scope

This verification covered Merchant Balance subscription revenue settlement,
the separate nTZS treasury destination, retry/backfill behavior, admin
reconciliation, Billing safeguards, Railway, Vercel, PostgreSQL, CI, and the
private Kadioko Store test account. No API key, webhook secret, PIN, provider
wallet identifier, or unmasked customer phone is stored in this document.

## Incident And Fix

Kadioko Store paid TZS 15,000 for Basic from Merchant Balance. DukaPilot
correctly debited the internal merchant ledger and renewed the subscription,
but the existing implementation did not transfer the corresponding provider
funds out of the pooled Merchant Balance wallet.

Commit `0f422f6` fixes this by:

- requiring a separate Railway-only `NTZS_TREASURY_WALLET_ADDRESS` before a
  new balance-funded subscription can be confirmed;
- transferring the exact subscription amount from the pooled nTZS user wallet
  to the DukaPilot treasury through `POST /api/v1/transfers`;
- deriving one stable provider idempotency key from the DukaPilot transaction;
- retaining an active subscription if the provider response is interrupted,
  while scheduled reconciliation safely resumes the same transfer;
- backfilling completed subscription debits that predate the transfer logic;
- excluding settled subscription revenue from the expected pooled-wallet
  balance; and
- marking unresolved rows `TREASURY REVIEW` in Admin with an idempotent
  **Check** action.

The provider contract is documented by the official
[nTZS developer guide](https://www.ntzs.co.tz/developers) and
[OpenAPI specification](https://www.ntzs.co.tz/openapi.json).

## Automated Evidence

- Backend test suite: 192 tests passed.
- Prisma schema validation: passed.
- Frontend TypeScript: passed.
- Production Next.js build: passed for all 46 routes.
- Production-mode mocked browser suite: 49 tests passed with two workers.
- GitHub Actions CI run
  [36326666133](https://github.com/kadioko/DukaPilot/actions/runs/36326666133)
  passed backend, frontend, PostgreSQL integrity, npm audits, Playwright, and
  Android jobs.

## Production Evidence

- Railway deployed commit `0f422f6`; `/health` returned HTTP 200.
- Vercel reported the same commit deployed successfully.
- The protected reconciliation run
  [36326724022](https://github.com/kadioko/DukaPilot/actions/runs/36326724022)
  checked one wallet record and returned `TREASURY_COMPLETED` for the exact
  Kadioko subscription transaction.
- The nTZS partner dashboard recorded one completed TZS 15,000 transfer from
  `DukaPilot Merchant Balance`; treasury balance increased from TZS 3,000 to
  TZS 18,000.
- The production database now stores a provider transfer identifier,
  `providerStatus=completed`, no failure code, and a completed treasury
  settlement timestamp on that transaction.
- The live Kadioko response reports Merchant Balance TZS 0, an active
  subscription, treasury settlement enabled, and a TZS -15,000 subscription
  ledger effect.

## Accounting Result

The TZS 15,000 is no longer merchant liability or retained pooled-wallet
revenue. It is DukaPilot subscription revenue held in the separate treasury.
The merchant was not charged again, the subscription was not extended again,
and no manual ledger adjustment was used.

Future balance-funded subscriptions follow this path automatically. If nTZS
cannot confirm a transfer immediately, Billing explains that the subscription
is active while settlement continues, Admin exposes the unresolved treasury
leg, and the 15-minute reconciliation job retries the same provider operation.

## Second-Pass Hardening

The same-day review also closed three recovery and user-feedback gaps:

- new nTZS online subscription checkouts still collect directly to treasury,
  while a legacy checkout with a saved provider user now retries the exact
  original `userId` plus `collectToTreasury: true` payload under the same
  idempotency key;
- a Merchant Balance deposit cannot credit a merchant ledger if provider
  readback says the collection was routed to treasury; and
- signed-out Inventory and Supplier Orders requests suppress only the expected
  HTTP 401 redirect. Authenticated Supplier Orders failures now show a durable
  inline error and retry action instead of a false empty state.

Local verification after these changes:

- Backend test suite: 195 tests passed.
- Focused payment suite: 13 tests passed.
- Prisma schema validation: passed.
- Frontend TypeScript: passed.
- Production Next.js build: passed for all 46 routes.
- Production-mode mocked browser suite: 52 tests passed.

The local PostgreSQL integrity command correctly refused to run without an
explicit disposable local test database. The GitHub Actions PostgreSQL job
creates `dukapilot_test`, applies every migration, and is the required
database-integrity evidence for the pushed release.
