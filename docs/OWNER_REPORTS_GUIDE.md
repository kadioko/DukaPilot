# Owner Reports and Analytics

Owner reports are available to the merchant owner and staff explicitly granted the Reports permission. Financial analytics must not be exposed to staff without that permission.

## Metric definitions

- **Sales revenue** is the total value of completed sales recorded in the selected Tanzania-time range. It includes credit sales and is not the same as cash received.
- **Cash collected** in Profit Analytics is completed non-credit sales recorded in the range, quotation payments/refunds on their original paid date, and ordinary debt-payment ledger entries received in the range. Converted quotation sales and their copied debt-payment rows are excluded to prevent counting the same receipt twice. Supplier settlements and other cash movements are not included.
- **Credit sales** is the value of completed sales marked CREDIT during the selected range. It is not the current unpaid balance; use receivables for the current balance.
- **Cost of goods sold** uses the buying-price snapshot recorded on sale items. A zero buying-price line is treated conservatively as uncosted, not as free inventory.
- **Gross profit (known costs)** includes only sale items with a recorded positive cost. The report flags revenue from zero-cost items and excludes those items from gross profit and its margin denominator.
- **Operating expenses** includes recorded expenses except the STOCK category. Stock purchase cost is recognized through cost of goods sold when those products sell, to avoid subtracting the same inventory purchase twice.
- **Net profit (known costs)** is known-cost gross profit minus operating expenses for the selected period. It remains incomplete while uncosted sale revenue is present; it is not a cash-flow or tax statement.
- **Receivables aging** is a current snapshot of open/partial debts grouped by overdue, due in the next seven days, or missing due date. It is not reconstructed as-of the selected report dates.
- **Branch receivables** is also a current balance snapshot. Branch revenue, profit, and expenses use the selected range.

## Ranges and comparisons

Date-only filters are interpreted as full calendar dates in `Africa/Dar_es_Salaam`; the end date is inclusive. Dashboard and Profit preset comparisons align with the prior calendar period: today compares with the same local time yesterday, week-to-date with the same weekdays and time last week, and month/quarter/year-to-date with the matching date and time in the prior calendar period. Custom Profit and branch ranges compare with the immediately preceding interval of equal duration.

The Branch performance view applies one date range to all branches, compares combined totals with the preceding equal-duration range, combines totals over the filtered branch set, and exports the same filtered rows shown in the table. Profit Analytics trends known-cost gross profit, expenses, and net profit using the same local-time buckets. Its export includes the selected range, comparison range, financial summary, receivables snapshot, product performance, and trend rows.

## Owner workflow

1. Review missing-cost warnings first. Correct product buying prices before relying on profit or margin.
2. Compare sales revenue with cash collected and credit sales to understand sales versus collections.
3. Follow up overdue receivables; check un-dated debts and add due dates where appropriate.
4. Review product profit and stock on hand, then investigate items with stock and no completed sale for 30 days.
5. Use CSV exports for analysis only after checking the date range and metric definitions above.

## Demo data caution

Public demo sales are synthetic examples, not evidence of a real merchant's trading. The history seeder deliberately does not change on-hand stock or create Daily Close cash records, so demo sales, inventory, and drawer totals are not expected to reconcile. The current public demo snapshot has 72 completed sales per merchant account across 30 days ending 2026-10-02; refresh it only through the guarded process in [Demo Sales History Seeding](./DEMO_HISTORY_SEEDING.md).
