# Merchant Balance Wallet

## Purpose

Merchant Balance gives a business owner a separate prepaid balance that can be
funded and withdrawn through nTZS mobile money. It is deliberately not a POS
cash drawer, a sales total, an expense account, a Daily Close amount, or a way
to pay a DukaPilot subscription.

The feature uses two distinct provider-side concepts:

1. DukaPilot treasury: subscription and DukaPilot-owned money.
2. DukaPilot Merchant Balance: one private nTZS provider user wallet used only
   as the pooled settlement account for merchant balances.

Each merchant sees only their own DukaPilot ledger balance. They never see,
control, or receive the pooled nTZS wallet identifier, address, API key, or
another merchant's records.

## Who Can Use It

- Only the business owner can view, deposit, withdraw, or check their balance.
- Staff cannot access it, even when they can sell, record expenses, or manage
  Daily Close.
- Platform admins can reconcile all wallet transactions and make an
  evidence-backed adjustment. Adjustments are audit-logged and do not call
  nTZS or move provider funds.
- An owner may view or withdraw their balance even when the DukaPilot
  subscription has expired. Subscription access does not trap merchant funds.

## Deposit Flow

1. The owner enters an amount and a Tanzanian mobile number.
2. DukaPilot creates a pending internal transaction before it asks nTZS to
   collect money.
3. nTZS sends the mobile-money prompt.
4. DukaPilot credits the internal ledger only after a signed webhook or a
   provider record check confirms the exact provider ID, pooled provider user,
   amount, `mobile_money` method, and live status.
5. A failed, cancelled, or reversed provider collection never becomes usable
   balance. A later reversal is recorded as a new compensating ledger entry.

If a browser or provider response is interrupted, the original transaction can
be checked again. DukaPilot resumes it with the same nTZS idempotency key, so
it does not generate a second collection request.

## Withdrawal Flow

1. The owner enters the net amount they want to receive and a Tanzanian mobile
   number.
2. DukaPilot gets a fresh nTZS payout quote from the server.
3. Before confirming, the owner sees the net received amount, DukaPilot's
   withdrawal fee, the provider payout fee, and the exact total deduction.
4. DukaPilot locks and reserves that exact total in its ledger before starting
   the payout.
5. nTZS confirms the provider result. A terminal failure creates compensating
   credits that return the held principal and both fees. A delayed or uncertain
   result remains in review until the provider record is reconciled.

The default DukaPilot fee is 2% (`200` basis points), rounded up to whole TZS.
The recipient amount stays the amount the owner requested; provider fees are
shown separately and are not silently absorbed by DukaPilot. The default
minimum withdrawal is TZS 5,000.

## Ledger and Reconciliation

`merchant_wallets` stores one available balance per root business.
`merchant_wallet_transactions` stores the provider workflow and status.
`merchant_wallet_entries` is append-only: deposits, holds, reversals, and
manual corrections are separate movements rather than overwritten balances.

The admin wallet screen shows:

- customer liability: total internal merchant balances;
- pooled nTZS provider balance;
- settled expected pool balance: merchant liability plus completed retained
  DukaPilot withdrawal fees;
- pending deposits and withdrawals;
- a timing range for pending deposits and payouts: nTZS may mint a completed
  deposit before DukaPilot receives its signed event, or debit a payout
  slightly before or after DukaPilot receives its final status.

Do not sweep DukaPilot fee revenue into treasury while the provider balance is
outside the displayed expected range. There is no automatic fee sweep in this
release; keep fee transfers documented and reconcile them before moving money.

## Safety Rules

- All money values are whole integer TZS on the server.
- Every provider operation has a DukaPilot transaction ID and idempotency key.
- No browser-provided provider quote, fee, status, or balance is trusted.
- Provider events are signed and then verified again by fetching the provider
  record before the internal ledger changes.
- Deposit prompts, withdrawal quotes, withdrawals, and reconciliation calls
  have purpose-specific rate limits. Redis shares those limits across Railway
  instances when configured.
- Phone numbers are returned to merchants and admins only in masked form.
- Account deletion is blocked until the available merchant balance is zero and
  every pending or review transaction is resolved. It then anonymizes wallet
  phone and recipient data while retaining the financial ledger required for
  reconciliation.
- Do not add wallet operations to sales, expenses, cash sessions, profit,
  quotations, or subscription payment logic.

## Railway Configuration

Keep all of the following in Railway private variables, never in Vercel or the
frontend:

```text
NTZS_API_KEY=<existing nTZS live key>
NTZS_WEBHOOK_SECRET=<existing signed webhook secret>
NTZS_MERCHANT_BALANCE_ENABLED=false
NTZS_MERCHANT_BALANCE_PILOT_SHOP_IDS=<one root shop ID for the first live test>
NTZS_MERCHANT_BALANCE_USER_ID=<private pooled merchant-balance nTZS user ID>
NTZS_MERCHANT_BALANCE_WALLET_ADDRESS=<private provider wallet address>
NTZS_MERCHANT_BALANCE_WITHDRAWAL_FEE_BPS=200
NTZS_MERCHANT_BALANCE_MIN_WITHDRAWAL_TZS=5000
MERCHANT_WALLET_RECONCILE_CRON_SECRET=<strong random secret>
```

`NTZS_ENABLED` controls subscription checkout and is intentionally independent
from `NTZS_MERCHANT_BALANCE_ENABLED`. Turning on one must never turn on the
other.

`NTZS_MERCHANT_BALANCE_PILOT_SHOP_IDS` is a comma-separated allowlist of root
business IDs. While it has a value, only those owners can initiate a deposit
or withdrawal; their branches share that same business balance. Existing
pending operations can still be checked and reconciled. Leave it empty only
after the pilot has passed.

Set the same strong random value as `MERCHANT_WALLET_RECONCILE_CRON_SECRET` in
Railway and as the GitHub Actions secret with that exact name. The
[`merchant-wallet-reconcile` workflow](../.github/workflows/merchant-wallet-reconcile.yml)
checks known provider payout IDs every 15 minutes. It intentionally does not
re-send an operation with no provider ID: that case remains in review until an
owner or platform admin presses Check, preserving the original idempotency key.

## Controlled Production Rollout

1. Deploy the backend first so Railway applies migration
   `20260919090000_merchant_wallets`.
2. Confirm the nTZS webhook still reaches `/api/webhooks/ntzs` and uses the
   existing signed timestamp/signature headers. Add the wallet reconciliation
   secret in Railway and GitHub before enabling the feature.
3. Keep `NTZS_MERCHANT_BALANCE_ENABLED=false` while checking the owner and
   admin screens, permissions, history, and zero-balance reconciliation.
4. Set `NTZS_MERCHANT_BALANCE_PILOT_SHOP_IDS` to one test business's root shop
   ID. Use a private controlled test account, never a publicly documented demo
   login for a wallet that can hold or withdraw real funds. Then set the
   feature flag to `true`. Confirm a controlled low-value
   deposit: mobile prompt, signed webhook, provider record, one ledger credit,
   and one balance increase.
5. Perform one controlled low-value withdrawal. Confirm the fee preview, one
   ledger hold, provider payout, final reconciliation, and no duplicate payout
   after pressing Check/Resume.
6. Confirm the admin pooled balance is within its expected range. If it is not,
   stop further wallet testing and reconcile the provider records before any
   manual correction or fee transfer.
7. Keep the feature pilot-only or turn it off if either test cannot be
   reconciled. Remove the pilot allowlist only after both tests are correct.

## Current Scope

- Tanzanian mobile-money deposits and withdrawals only.
- One pooled provider settlement wallet and one isolated DukaPilot ledger per
  root business; branches share their parent business balance.
- No automatic treasury fee sweep, bank payout, card funding, merchant-to-
  merchant transfer, interest, lending, or investment functionality.
- A manual adjustment is an exceptional admin reconciliation tool, not normal
  merchant support or a substitute for provider confirmation.

Official nTZS reference: <https://www.ntzs.co.tz/developers> and
<https://www.ntzs.co.tz/openapi.json>.
