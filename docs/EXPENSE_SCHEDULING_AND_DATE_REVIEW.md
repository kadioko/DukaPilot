# Expense Recording And Scheduling

## Recording Versus Scheduling

`Record expense` creates a real financial event. Enter the date the business actually paid or incurred the cost. The API accepts today or a past Tanzania business date, including legitimate backdated entries. It does not accept a future date as a completed transaction.

`Schedule monthly` creates only a reminder. The first due date is the date selected, and creating or reaching that date does not create an expense, reduce profit, alter cash, or affect Daily Close. DukaPilot does not auto-post recurring payments. After payment actually happens, an authorized user chooses `Confirm paid`, confirms the actual payment date, and saves. That creates one expense with a retry key and advances the schedule. If the payment has not happened, leave the schedule pending; `Due today` is not `Paid`.

For monthly schedules, the original day-of-month is retained. A day 30 schedule uses February 28 (or 29 in a leap year), then returns to the 30th. A day 31 schedule uses the last available day in shorter months and returns to the 31st when available. Existing schedules with no recorded anchor are not backfilled by guesswork; their saved next due date supplies the conservative anchor when first recorded/advanced. Owners can correct the next due date in the schedule screen, which also establishes the intended anchor day.

## Reporting Dates

Expense totals use the expense transaction date (`spentAt`), not a future schedule's due date. Dashboard today, week, month, and all-time totals use half-open Tanzania-local ranges and stop at the end of the current Africa/Dar_es_Salaam business day. Backdated transactions remain in their actual historical period. Purchase receipts remain inventory costs and are not duplicated as operating expenses.

Expense records created by the older behavior may have a transaction date after the Tanzania business day on which the record was created. Until an owner verifies the payment, those candidate rows are excluded from expense history totals, dashboard/profit analytics, branch reporting, assistant calculations, and Daily Close, and appear in `Expense records needing date review`. This is deliberately conservative: the date pattern alone does not prove an error, because it could be a legitimate advance payment.

## Read-Only Diagnostic

The diagnostic requires an exact shop ID and performs only a tenant-scoped `SELECT`. It does not modify expenses or schedules and does not print vendor, note, or customer data.

```powershell
cd backend
npm run expenses:diagnose-future -- --shop-id <exact-shop-id>
```

Review every candidate with the business owner and payment evidence. Do not infer an error solely from its dates. The output is limited to 500 rows per shop; investigate additional pages with a reviewed read-only query if it reports the limit.

## Controlled Correction Of An Older Record

For a candidate expense, verify whether the payment really happened and the actual payment date with the owner:

- **Not paid:** the owner can delete the erroneous ledger entry after explicit confirmation. The endpoint writes the original expense details to the audit log before the entry is removed. Then edit the recurring schedule to the correct first due date. For the Icy Lush example, if no payment has occurred, remove the erroneous TZS 49,000 Wifi entry and set the schedule's next due date to October 30, 2026. No expense is then counted on October 28; after an actual payment, confirm and record it once. If a candidate is linked to a closed cash shift, the normal expense edit/delete guard may block the correction; keep the closed Z-report unchanged and ask support for a separately audited correction instead of editing SQL.
- **Paid:** the owner opens the candidate, chooses the actual payment date, and explicitly confirms that payment occurred. This records who verified it and when, and preserves the before/after dates in the audit log. The record is then included in its actual transaction period. If it was paid in cash in a shift that has already been closed, do not rewrite that closed Z-report; use the existing owner correction process and keep the original close intact.
- **Uncertain:** leave it unverified and excluded while the owner checks receipts, M-Pesa/bank evidence, or cash records.

For the Icy Lush report (Wifi, TZS 49,000, M-Pesa, expense dated October 30 and schedule showing November 30), first check the shop-scoped candidate and ask whether the October 30 payment was actually made. If it was not, remove the candidate entry and restore the schedule's first due date to October 30 with anchor 30. If it was paid, retain the record and have the owner verify the actual payment date. Never make this correction directly in production SQL and never delete a legitimate transaction.

Corrections are auditable but not automatically reversible. If an owner confirms or removes the wrong entry, preserve the audit event and contact support to create a linked correcting entry if needed; do not erase or rewrite audit history. Take the normal production backup before any customer-specific correction. This release does not alter existing production data.

## Deployment

Apply migration `20261028002000_expense_schedule_integrity` before deploying the matching backend and frontend. Deploy the backend and frontend as one coordinated change: current clients need the new request key for idempotent expense submissions, and the backend expects the new schema columns. Verify the migration, then manually test that scheduling creates no Expense row, an Oct 30 due date stays Oct 30, payment confirmation records once, and Daily Close changes only for an actually recorded cash payment in today's open shift.
