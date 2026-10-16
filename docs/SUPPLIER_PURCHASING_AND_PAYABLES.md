# Supplier Purchasing and Payables

## Workflow

1. Create an order in **Orders**. Orders reserve no stock and are not purchases until stock is physically received.
2. Open **Receive Stock**, choose the order, and enter only the quantities delivered now. The remaining quantity stays visible on the order as **Partially received**. A later receipt can complete the same order.
3. Record how much was actually paid at receipt. The unpaid remainder becomes a supplier balance. Receiving adds only the delivered quantities to inventory and creates the normal receipt and stock-movement history.
4. Open **Supplier Balances** to search a supplier, review receipt balances and aging, record a partial/full payment against a receipt, or record a return/credit note against the original receipt. The merchant screen records one selected receipt per payment entry; repeat for another receipt. The API supports allocation records but the UI does not expose multi-receipt allocation in one submission.

## Financial and inventory rules

- Receipt value is inventory at landed cost, not a second operating expense. Purchase Analytics measures the value and date stock was received; Supplier Balances calculates liability from each receipt less payments and credits.
- A payment must be allocated to receipt(s) for one supplier, in whole TZS, and cannot exceed the outstanding amount. The retry key makes an uncertain client retry safe.
- The amount shown as **paid at receipt** is recorded when saving stock receipt and is included in that receipt's cash effect if paid in CASH. If it was entered incorrectly, use **Correct receipt payment** from the expanded receipt in Purchase Analytics, or from Supplier Balances for supplier-linked receipts. Enter the corrected amount, method, and a required reason. This appends a linked correction; it never edits or deletes the original receipt or earlier correction. The corrected value is used for supplier balances. A change affecting cash requires an open shift and is shown as a separate signed line in that shift's Daily Close. A zero corrected amount is treated as supplier credit. Unassigned receipts can be corrected in Purchase Analytics, but do not appear in Supplier Balances because they have no supplier account.
- A physical return reduces available stock only after verifying the returned quantity against the original received amount, previous returns, and current stock. It writes an OUT stock movement and credits the original landed cost. TZS rounding is distributed across partial returns so returning the whole receipt line credits exactly its original landed total.
- A non-stock credit note changes the supplier balance but does not change inventory. Both credits and payments remain in history. Corrections create linked reversal records; they do not rewrite the original event.
- Supplier balances age from each receipt's `receivedAt` date in 0-30, 31-60, 61-90, and over-90-day buckets. A supplier credit owed back to the business is shown separately as a negative balance.
- A receipt's original **paid at receipt** amount is counted as cash-out for its receipt cash shift only when the method is CASH. A later cash settlement is counted in the cash shift when it is paid. A correction never rewrites that original cash entry: its signed cash effect is recorded separately in the correcting user's open shift and visible in Daily Close. A reversal of a later cash payment requires an open shift and is counted as cash received. Non-cash settlements do not alter drawer cash.
- Before this release, receipts did not store partial amounts paid. During migration, historical `CREDIT` receipts are treated as unpaid and other historical receipts as fully paid at receipt; the system cannot reconstruct partial settlements that were never recorded.

## Access and branch scope

Orders, receiving, and supplier balances require the active shop/branch, an active subscription, **Stock** permission, and **Reports** permission. Supplier receipts, payments, credits, and movements are scoped to that active branch. Staff without both permissions cannot use this area. Cash payments also require an open cash shift.

## Current limits

- Each supplier payment is allocated to receipt(s) for exactly one supplier. Payments are entered manually; this release does not initiate bank, mobile-money, or supplier transfers.
- Purchase Analytics shows the effective receipt-time amount and method, including the latest linked correction; it does not show later settlements in that breakdown. Use Supplier Balances to review the full correction history, payment allocations, and outstanding balances.
- Returns and credit notes are tied to a receipt line. A return cannot exceed received units net of prior returns, and stock must still be available to return.
- This is an auditable supplier subledger, not a general journal, tax system, balance sheet, or complete accounting suite. Purchase Analytics remains the source for received inventory purchases; never add the same receipt to Expenses.
- Suppliers with order, receipt, payment, or credit history cannot be deleted, so linked source records remain usable for audit and reconciliation.

## Verification

Run `npm run test:supplier-payables` in `backend` for focused unit and Daily Close checks. Run `npm run test:postgres-integrity` against an explicitly local test database to exercise actual partial receipts, payment corrections, concurrency, stock movements, retries, and branch isolation. Apply `20261016002000_stock_receipt_payment_corrections` before deploying the correction UI/backend.
