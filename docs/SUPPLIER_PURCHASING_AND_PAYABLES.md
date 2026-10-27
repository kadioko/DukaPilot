# Supplier Purchasing and Payables

## Workflow

1. Create an order in **Orders**. Optionally save the supplier's invoice number on it. Orders reserve no stock and are not purchases until stock is physically received.
2. Suppliers who are not DukaPilot users cannot update order progress in the app. The owner or a staff member with Stock and Reports access can record **Confirmed** and **Out for delivery** in Orders. This is a merchant-entered tracking note, not a supplier-verified event. Receiving or cancelling controls the final states.
3. Open **Receive Stock**, select the same supplier, and enter the invoice number. DukaPilot searches orders for that supplier and invoice, fills in the ordered products and remaining quantities, and links the receipt to the order. If more than one order matches, choose the correct one. A pending order can be received directly when goods arrive; recording the receipt updates the order. Enter only quantities delivered now. The remaining quantity stays visible as **Partially received** and a later receipt can complete the order.
4. Record how much was actually paid at receipt. The unpaid remainder becomes a supplier balance. Receiving adds only the delivered quantities to inventory and creates the normal receipt and stock-movement history.
   If an eligible saved receipt has a wrong quantity, invoice number, or note,
   use **Correct receipt** in Receive Stock. This creates linked history and
   recalculates the order and balance; it does not change the payment. See
   [Stock and receiving corrections](./STOCK_CORRECTIONS.md).
5. Open **Supplier Balances** to search a supplier, review receipt balances and aging, record a partial/full payment against a receipt, or record a return/credit note against the original receipt. The merchant screen records one selected receipt per payment entry; repeat for another receipt. The API supports allocation records but the UI does not expose multi-receipt allocation in one submission.
6. If a return or credit note leaves a negative receipt balance, that is supplier credit owed to the business. When the supplier actually pays that credit back, choose **Record supplier refund** on that receipt and enter the amount and the method actually received. The amount is capped at the receipt's remaining supplier credit. This settles the credit; it does not change the original return or stock movement. If the supplier has only promised a refund, leave the credit outstanding until the money arrives.

## Financial and inventory rules

- Receipt value is inventory at landed cost, not a second operating expense. Purchase Analytics measures the value and date stock was received; Supplier Balances calculates liability from each receipt less payments and credits.
- A payment must be allocated to receipt(s) for one supplier, in whole TZS, and cannot exceed the outstanding amount. The retry key makes an uncertain client retry safe.
- Stock receipts also preserve the original result on an unchanged retry, including API requests that let the server choose the received date. Keep the same retry key and details after an uncertain response; changing the products, quantities, payment, or an explicitly supplied date requires a new submission.
- The amount shown as **paid at receipt** is recorded when saving stock receipt and is included in that receipt's cash effect if paid in CASH. If it was entered incorrectly, use **Correct receipt payment** from the expanded receipt in Purchase Analytics, or from Supplier Balances for supplier-linked receipts. Enter the corrected amount, method, and a required reason. This appends a linked correction; it never edits or deletes the original receipt or earlier correction. The corrected value is used for supplier balances. A change affecting cash requires an open shift and is shown as a separate signed line in that shift's Daily Close. A zero corrected amount is treated as supplier credit. Unassigned receipts can be corrected in Purchase Analytics, but do not appear in Supplier Balances because they have no supplier account.
- A physical return reduces available stock only after verifying the returned quantity against the original received amount, previous returns, and current stock. It writes an OUT stock movement and credits the original landed cost. TZS rounding is distributed across partial returns so returning the whole receipt line credits exactly its original landed total.
- Stock History keeps the original receiving movement and displays the net
  returned quantity beside its receipt. Each physical return and any reversal
  appears as a separate dated movement linked back to that receipt. Receive
  Stock shows the net returned quantity per line and a return-correction badge
  when applicable. These records show what the merchant entered; supplier
  handoff and acknowledgement are tracked separately in Supplier Balances.
- Each supplier return has an append-only progress timeline: **Recorded**, **Handed over**, **Supplier acknowledged**, or **Disputed**. Hand-off references and notes are merchant-entered evidence. These status events do not alter the return's stock movement or supplier-credit amount. Older returns are backfilled as **Recorded**, not as delivered or acknowledged.
- A non-stock credit note changes the supplier balance but does not change inventory. Both credits and payments remain in history. Corrections create linked reversal records; they do not rewrite the original event.
- A supplier refund is recorded as a signed refund transaction allocated to the credited receipt. It reduces the negative supplier-credit balance; it is not a new purchase, sales income, or operating expense. Record only money actually received. CASH requires an open shift and increases expected drawer cash in Daily Close; mobile-money or bank refunds do not affect drawer cash. A refund can be reversed through the linked reversal action if entered incorrectly; the original refund remains in history.
- Supplier balances age from each receipt's `receivedAt` date in 0-30, 31-60, 61-90, and over-90-day buckets. A supplier credit owed back to the business is shown separately as a negative balance.
- A receipt's original **paid at receipt** amount is counted as cash-out for its receipt cash shift only when the method is CASH. A later cash settlement is counted in the cash shift when it is paid. A correction never rewrites that original cash entry: its signed cash effect is recorded separately in the correcting user's open shift and visible in Daily Close. A reversal of a later cash payment requires an open shift and is counted as cash received. Non-cash settlements do not alter drawer cash.
- Before this release, receipts did not store partial amounts paid. During migration, historical `CREDIT` receipts are treated as unpaid and other historical receipts as fully paid at receipt; the system cannot reconstruct partial settlements that were never recorded.

## Access and branch scope

Orders, receiving, and supplier balances require the active shop/branch, an active subscription, **Stock** permission, and **Reports** permission. Supplier receipts, payments, credits, and movements are scoped to that active branch. Staff without both permissions cannot use this area. Cash payments also require an open cash shift.

## Current limits

- Each supplier payment is allocated to receipt(s) for exactly one supplier. Payments are entered manually; this release does not initiate bank, mobile-money, or supplier transfers.
- Purchase Analytics shows the effective receipt-time amount and method, including the latest linked correction; it does not show later settlements in that breakdown. Use Supplier Balances to review the full correction history, payment allocations, and outstanding balances.
- Returns and credit notes are tied to a receipt line. A return cannot exceed received units net of prior returns, and stock must still be available to return.
- Supplier refund settlement can only use an existing negative credit balance on the selected receipt. It cannot exceed that credit; any remaining credit stays available until refunded or applied by the supplier outside DukaPilot.
- DukaPilot records the merchant's supplier-return and refund events and provides a status/evidence timeline; it does not arrange collection/delivery of returned goods, independently verify that the supplier received them, initiate a transfer, or confirm an external refund. Keep supplier confirmation and transfer evidence with the business records. Do not record a refund until funds have actually arrived.
- This is an auditable supplier subledger, not a general journal, tax system, balance sheet, or complete accounting suite. Purchase Analytics remains the source for received inventory purchases; never add the same receipt to Expenses.
- Suppliers with order, receipt, payment, or credit history cannot be deleted, so linked source records remain usable for audit and reconciliation.
- Invoice references are scoped to the active branch and supplier; they are case-insensitive exact matches. Receiving records only delivered quantities and automatically advances the linked order to **Partially received** or **Delivered**. The manual tracking controls cannot mark stock received or move a status backwards.

## Verification

Run `npm run test:supplier-payables` and `npm run test:stock-receipt` in `backend` for focused checks. Run `npm run test:postgres-integrity` against an explicitly local test database to exercise actual partial receipts, payment corrections, return status history, concurrency, stock movements, retries, and branch isolation. Apply pending migrations in order, including `20261016001000_supplier_payables`, `20261016002000_stock_receipt_payment_corrections`, `20261016003000_order_invoice_reference`, `20261016004000_supplier_refund_settlements`, and `20261016005000_supplier_return_handoff_tracking`, before deploying the corresponding UI/backend.
