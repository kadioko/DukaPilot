# Merchant Balance Wallet

## Purpose

Merchant Balance gives a business owner a separate prepaid balance that can be
funded and withdrawn through nTZS mobile money. It is deliberately not a POS
cash drawer, a sales total, an expense account, or a Daily Close amount. An
owner can use available balance to pay a DukaPilot subscription from Billing.

The feature uses two distinct provider-side concepts:

1. DukaPilot treasury: subscription and DukaPilot-owned money.
2. DukaPilot Merchant Balance: one private nTZS provider user wallet used only
   as the pooled settlement account for merchant balances.

Each merchant sees only their own DukaPilot ledger balance. They never see,
control, or receive the pooled nTZS wallet identifier, address, API key, or
another merchant's records.

| Money path | Provider destination | Accounting owner |
| --- | --- | --- |
| nTZS online subscription | Direct DukaPilot treasury collection | DukaPilot revenue after verified activation |
| Merchant Balance deposit | Pooled Merchant Balance provider user | Merchant liability in DukaPilot's isolated ledger |
| Subscription paid from balance | Pooled wallet, then one idempotent treasury transfer | Changes from merchant liability to DukaPilot revenue |
| DukaPilot withdrawal fee | Retained in the pooled wallet in this release | DukaPilot fee revenue awaiting a future controlled sweep |

## Who Can Use It

- Only the business owner can view, deposit, withdraw, check, or use the balance
  for a DukaPilot subscription.
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
   amount, `mobile_money` method, live status, and that the deposit was not
   routed to treasury.
5. A failed, cancelled, or reversed provider collection never becomes usable
   balance. A later reversal is recorded as a new compensating ledger entry.

nTZS reports a successful on-ramp as `minted`; DukaPilot treats that as the
terminal successful deposit state and credits the internal merchant ledger
once. A provider `rejected` state is terminal failure and is removed from the
pending total without creating a ledger credit.

If a browser or provider response is interrupted, the original transaction can
be checked again. DukaPilot resumes it with the same nTZS idempotency key, so
it does not generate a second collection request.

## Withdrawal Flow

1. The owner enters the net amount they want to receive and a Tanzanian mobile
   number.
2. DukaPilot gets a fresh nTZS payout quote from the server.
3. Before confirming, the owner sees the net received amount, DukaPilot's
   withdrawal fee, the provider payout fee, and the exact total deduction.
4. Confirmation is bound to the exact quoted amount, normalized phone,
   recipient, rail, provider fee, and total deduction. Any change requires a
   fresh quote.
5. DukaPilot locks and reserves that exact total in its ledger before starting
   the payout.
6. nTZS confirms the provider result. A terminal failure creates compensating
   credits that return the held principal and both fees. A delayed or uncertain
   result remains in review until the provider record is reconciled.

The default DukaPilot fee is 2% (`200` basis points), rounded up to whole TZS.
The recipient amount stays the amount the owner requested; provider fees are
shown separately and are not silently absorbed by DukaPilot. The default
minimum withdrawal is TZS 5,000.

The separate **Platform Fee** percentage in the nTZS dashboard must remain at
`0%` for this release. It applies to nTZS transfers and is not the DukaPilot
withdrawal fee above. Enabling both would create two independently configured
fee layers and make reconciliation harder. DukaPilot's disclosed withdrawal fee
is controlled only by `NTZS_MERCHANT_BALANCE_WITHDRAWAL_FEE_BPS`.

## Subscription Payment Flow

1. Billing shows the owner the server-calculated subscription amount, available
   Merchant Balance, and remaining balance after payment.
2. The owner must explicitly confirm the exact debit. No withdrawal fee or new
   mobile-money prompt applies.
3. The backend locks both the root shop and wallet, then rechecks the plan,
   branch capacity, subscription state, and available balance.
4. One database transaction writes an immutable `SUBSCRIPTION_PAYMENT` debit,
   creates the confirmed `subscription_payments` record, and activates or
   extends the subscription. A failure rolls all three changes back.
5. DukaPilot immediately sends the exact subscription amount from the pooled
   Merchant Balance provider user to the separate DukaPilot treasury address
   through `POST /transfers` with a stable provider idempotency key.
6. If the provider response is lost or remains pending, the subscription stays
   active and reconciliation retries that same treasury transfer. It never
   debits the merchant or extends the subscription again.
7. A client retry reuses the same request key and returns the original result;
   it cannot debit the balance or extend the plan a second time.

The debit reduces customer liability. Until the provider transfer completes,
admin reconciliation includes that amount as subscription revenue awaiting
treasury settlement. Once completed, it is excluded from the expected pooled
wallet balance because the money now belongs in DukaPilot treasury.

## Ledger and Reconciliation

`merchant_wallets` stores one available balance per root business.
`merchant_wallet_transactions` stores the provider workflow and status.
`merchant_wallet_entries` is append-only: deposits, holds, reversals,
subscription debits, and manual corrections are separate movements rather than
overwritten balances.

The merchant history response includes `balanceEffectTzs`, calculated by the
server from ledger semantics. Completed deposits are positive; pending/review
and completed withdrawals show the reserved/deducted total; completed
subscription payments show their debit; failed or reversed operations show no
balance change. The UI must not infer movement from transaction type alone.

The admin wallet screen shows:

- customer liability: total internal merchant balances;
- pooled nTZS provider balance;
- expected pool balance: merchant liability plus retained DukaPilot withdrawal
  fees and only subscription revenue still awaiting treasury transfer;
- pending deposits and withdrawals;
- completed subscription debits still awaiting treasury, marked `TREASURY
  REVIEW` with their provider error and an idempotent **Check** action;
- a timing range for pending deposits and payouts: nTZS may mint a completed
  deposit before DukaPilot receives its signed event, or debit a payout
  slightly before or after DukaPilot receives its final status.

Do not sweep DukaPilot withdrawal-fee revenue into treasury while the provider balance is
outside the displayed expected range. There is no automatic fee sweep in this
release. Subscription revenue is different: it transfers automatically with an
idempotency key and is removed from expected pool funds after confirmation.

## Safety Rules

- All money values are whole integer TZS on the server.
- Every provider operation has a DukaPilot transaction ID and idempotency key.
- A database uniqueness race on a deposit or withdrawal request key resumes the
  original operation. An admin adjustment retry must match the original amount,
  direction, and written reason.
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
- Do not add wallet deposits or withdrawals to sales, expenses, cash sessions,
  profit, or quotations. Subscription use must go only through the atomic
  owner-only Billing flow; never model it as a withdrawal or business expense.
- Release a withdrawal hold only for a documented pre-movement provider
  rejection. A gateway 502, unknown conflict, missing response, or undocumented
  outcome remains in `REVIEW` until authenticated provider readback resolves it.

## Railway Configuration

Keep all of the following in Railway private variables, never in Vercel or the
frontend:

```text
NTZS_API_KEY=<existing nTZS live key>
NTZS_WEBHOOK_SECRET=<existing signed webhook secret>
NTZS_MERCHANT_BALANCE_ENABLED=false
NTZS_MERCHANT_BALANCE_PILOT_SHOP_IDS=
NTZS_MERCHANT_BALANCE_USER_ID=<private pooled merchant-balance nTZS user ID>
NTZS_MERCHANT_BALANCE_WALLET_ADDRESS=<private provider wallet address>
NTZS_TREASURY_WALLET_ADDRESS=<private DukaPilot partner treasury address>
NTZS_MERCHANT_BALANCE_WITHDRAWAL_FEE_BPS=200
NTZS_MERCHANT_BALANCE_MIN_WITHDRAWAL_TZS=5000
MERCHANT_WALLET_RECONCILE_CRON_SECRET=<strong random secret>
```

`NTZS_ENABLED` controls subscription checkout and is intentionally independent
from `NTZS_MERCHANT_BALANCE_ENABLED`. Turning on one must never turn on the
other.

`NTZS_TREASURY_WALLET_ADDRESS` must be the partner treasury address shown by
nTZS, not the DukaPilot Merchant Balance address. The backend validates the
Base address format and refuses new balance-funded subscription payments when
the two addresses are equal or treasury is missing. Deposits and withdrawals
remain independently available so a configuration problem cannot trap merchant
funds.

`NTZS_MERCHANT_BALANCE_PILOT_SHOP_IDS` is an optional comma-separated
allowlist of root business IDs. Normal production rollout leaves it empty so
every merchant owner can initiate deposits, withdrawals, and subscription
payments; branches share the parent business balance. Set an allowlist only
as a temporary incident or controlled-rollout measure. Existing pending
operations can still be checked and reconciled.

The example keeps the global flag `false` because environment templates must be
safe when copied. After controlled acceptance, normal production availability
uses `NTZS_MERCHANT_BALANCE_ENABLED=true` with an empty allowlist. The flag can
be turned off immediately to stop new wallet operations while existing records
remain available to reconciliation.

Set the same strong random value as `MERCHANT_WALLET_RECONCILE_CRON_SECRET` in
Railway and as the GitHub Actions secret with that exact name. The
[`merchant-wallet-reconcile` workflow](../.github/workflows/merchant-wallet-reconcile.yml)
checks known merchant-wallet and subscription provider IDs every 15 minutes.
It intentionally does not re-send an operation with no provider ID: that case
remains in review until an owner or platform admin presses Check, preserving
the original idempotency key.

## Controlled Production Rollout

1. Deploy the backend first so Railway applies migrations
   `20260919090000_merchant_wallets` and
   `20260920120000_merchant_wallet_subscription_kind`.
   Those are the Merchant Balance schema migrations. A complete current
   production deployment must still apply every later committed migration,
   presently through `20260923001000_label_printing_and_product_codes`.
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
7. With a test balance large enough for Basic, confirm Billing previews the
   remaining balance, activates once, records one subscription payment, and
   shows one ledger debit. Retry the same request key and verify no second debit
   or subscription extension occurs.
8. For full availability, leave `NTZS_MERCHANT_BALANCE_PILOT_SHOP_IDS` empty.
   If any live operation cannot be reconciled, use the allowlist to restrict
   new operations or turn off the feature while existing pending records are
   investigated.

The current release baseline completed these code, CI, and read-only live
checks on 20-21 September 2026. See
[Production Verification](./PRODUCTION_VERIFICATION_2026-09-20.md). A future
release that changes money movement, provider status mapping, subscription
activation, or ledger entries must repeat the controlled acceptance steps; a
green mocked test suite does not replace a low-value provider settlement test.

## Current Scope

- Tanzanian mobile-money deposits and withdrawals only.
- One pooled provider settlement wallet and one isolated DukaPilot ledger per
  root business; branches share their parent business balance. Owners can pay
  DukaPilot subscriptions from sufficient available balance.
- No automatic treasury fee sweep, bank payout, card funding, merchant-to-
  merchant transfer, interest, lending, or investment functionality. The fee
  sweep limitation does not apply to subscription revenue, which is transferred
  to treasury automatically.
- A manual adjustment is an exceptional admin reconciliation tool, not normal
  merchant support or a substitute for provider confirmation.

Official nTZS reference: <https://www.ntzs.co.tz/developers> and
<https://www.ntzs.co.tz/openapi.json>.
