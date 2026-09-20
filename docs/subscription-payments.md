# Subscription payments

## Merchant experience

Choose Basic (TZS 15,000/month) or Pro (TZS 35,000/month) in Billing.

1. Lipa number / Send money: M-Pesa 52806296 (Necuva Group Limited), Mix by Yas
   18214626 (Necuva), AzamPesa 293726045 (Necuva Group Limited), Selcom 7006 3589
   (Necuva Group Limited), or send money
   to 0743910580. Check the recipient on the phone before paying. Submit the
   reference for admin verification; submitting a reference is not activation.
2. nTZS online: when enabled, an owner enters a Tanzanian mobile number and
   approves the collection prompt on the phone. nTZS creates or reuses a
   provider-side payer reference for that business and collects directly to
   DukaPilot's treasury; it does not expose a wallet or API key to the browser.
   Never enter the mobile-money PIN in DukaPilot. A verified `completed` or
   `minted` deposit creates one confirmed subscription payment and activates or
   extends the selected plan automatically. No manual reference is required.
3. Merchant Balance: when enabled for the business, Billing shows the available
   balance, exact server-calculated plan price, and balance after payment. The
   owner explicitly confirms the debit. DukaPilot writes the balance debit,
   confirmed subscription payment, and plan activation in one database
   transaction. No withdrawal fee, new mobile-money prompt, or manual reference
   applies. An insufficient balance cannot activate a plan or create a debit.

## Production configuration

- Keep `NTZS_API_KEY` and `NTZS_WEBHOOK_SECRET` in Railway private variables.
- Set `NTZS_ENABLED=true` only when Collections and business verification are
  active on the provider account. This flag is independent from Merchant Balance.
- Deploy backend first with `npm run db:deploy` in backend. The additive
  migrations create subscription_checkouts/branch fields and do not modify old payments.
- Configure provider webhook URL:
  https://dukapilotproduction.up.railway.app/api/webhooks/ntzs
- The webhook handler accepts epoch seconds/milliseconds within five minutes and signs the
  exact timestamp + dot + raw JSON body using HMAC-SHA256.
- Never put nTZS keys in Vercel, frontend variables, screenshots, Git, logs,
  browser responses, or customer messages.
- The scheduled nTZS reconciliation workflow uses the existing private
  `MERCHANT_WALLET_RECONCILE_CRON_SECRET` and checks known wallet and
  subscription provider IDs every 15 minutes.

## Payment integrity

Prices are server controlled whole TZS. Owners only, scoped to their shop; expired
subscriptions may pay, deliberately suspended shops must contact support.
One open checkout per shop prevents concurrent new prompts. The original request
key and provider idempotency key are persisted before initiating collection.
Initiation timeouts remain REVIEW with the lock intact. Owners and administrators
can retry/reconcile that same checkout; the backend reuses the original checkout ID
and provider idempotency keys and records the action in the audit log. Never create
a new checkout merely because the first provider response was lost.
Provider readback verifies deposit ID, payer ID when returned, amount, payment
method, treasury mode when returned, and live status. Webhooks require a valid
signature and live event, then perform the same authenticated readback.
No redirect, browser assertion, manual reference or unverified webhook activates access.
Shop row locking serializes online renewals and Merchant Balance payments;
payment insertion and plan extension are one transaction. Merchant Balance also
locks the wallet and writes one immutable ledger debit. The same request key
returns the original success instead of charging twice. Pending records do not
enter confirmed-payment statistics.

## Support and limitations

- One-month purchases only. Changes between prepaid plans require support; no
  automatic proration or conversion of Basic months into Pro months.
- A confirmed provider failure releases the active checkout so the owner can
  start a fresh request. Review/unknown outcomes keep their lock, appear in the
  administrator payment-exceptions queue, and must be reconciled before another
  payment is attempted.
- No automatic refund, recurring debit mandate, or hosted card checkout is
  implemented. The backend reuses one provider payer reference per business
  for nTZS online checkout. Merchant Balance payment is an internal ledger
  debit and does not call nTZS again; it converts that amount from customer
  liability into recorded subscription revenue in the pooled reconciliation.
- Webhook delivery is the first background completion path; owners can also
  check or retry the original checkout manually. The admin review queue supports
  the same safe retry. The scheduled nTZS reconciliation workflow also reads
  back known pending/review provider IDs every 15 minutes.
- Lost initiation responses without a deposit ID need provider-assisted matching
  using the saved checkout ID/idempotency key. Never guess a match by amount alone.
- Manual payment recording and online renewals share shop row-lock discipline.
  Repeat production restore, concurrency, and provider acceptance drills after
  material payment or database changes.

## Acceptance checklist

The repository now runs the full mocked backend suite, payment tests, browser billing
tests, TypeScript and Prisma validation in CI. Browser tests use mocks, not real
charges. Live provider settlement still requires the controlled acceptance checks below.

- Apply migration to a disposable database; verify rollback on payment insertion failure.
- Concurrent duplicate check/webhook: exactly one payment and one month added.
- Wrong shop, wrong amount, wrong ID, test event and invalid signature never activate.
- Expired owner can pay; staff and suspended owners cannot initiate payments.
- Verify one authorized Basic and Pro collection including real provider delivery.
- Test denied phone prompt, insufficient funds, provider timeout and late completion.
- Close browser before paying; webhook must activate without browser polling.
- Repeat webhook and browser check; expiry must not move a second time.
- Check month-end renewal, no future paid days lost, and manual-renewal concurrency.
- Test mobile English/Swahili, copy numbers, failed reference preservation.
- Test Merchant Balance with an exact balance, insufficient balance, an expired
  subscription, a repeated request key, and a forced database failure. Confirm
  that debit and activation either both commit or both roll back.

Official contract reviewed: https://www.ntzs.co.tz/developers and
https://www.ntzs.co.tz/openapi.json (20 September 2026).
