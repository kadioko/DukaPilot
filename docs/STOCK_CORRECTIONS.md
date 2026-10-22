# Stock and receiving corrections

This release adds linked corrections; it does not delete financial or inventory history.
Apply migration `20261022001000_stock_receipt_corrections` before deploying the backend and updated frontend. Do not use the new UI against an older backend.

## Who can correct

- The business owner can correct stock in the selected shop or branch.
- Staff need **Stock** and the new **Correct stock/receipts** permission. Receipt corrections also require **Reports**, because they can change purchase and supplier-balance totals.
- Existing staff do not receive the new permission automatically. Grant it deliberately on Staff Roles.
- Every correction requires a reason and records its actor, timestamp, original values, revised values, and linked stock movement. Retry keys prevent the same correction being applied twice.

## Stock History

Open **Stock > Stock History**. Select an eligible manual entry on the current page, give a reason, and choose **Reverse entry**. The original row remains; an opposite movement is added. Stock cannot go below zero. Only newly recorded, positively identified manual adjustments are reversible here. Older stock-history rows cannot be reliably distinguished from sales or other source movements, so they remain read-only. Receipt, sale, supplier-return, and farm movements must use their own source workflows.

The **Stock now** column is the product's current balance, not its balance at the historical event. New manual and correction movements also store before/after quantities in the backend ledger.

## Receive Stock

Open a recent receipt under **Stock > Receive Stock** and choose **Correct receipt**. Change a recorded whole-item quantity, invoice number, or note and enter a reason. A zero quantity removes that line's received stock. Setting every line to zero reverses the entire receipt, while leaving its original details and correction history visible. The linked supplier order's received quantities and status are recalculated in the same transaction. Purchase totals and supplier balances use the revised receipt total.

Fully reversed receipts remain in Receive Stock and Stock History for audit but no longer count in Purchase Analytics totals or exports. A quantity correction restates the original receipt's purchase period; the dated correction remains visible on the receipt.

The server refuses a quantity reduction that would make stock negative, exceed recorded supplier returns, or put the revised receipt below settled payments and credits. If receipt-time payment was wrong, correct it first in **Analytics > Purchases**; later supplier payments and returns have their own reversal workflows. Cash is **not** moved by a quantity correction, because it does not represent a new payment or refund. The existing payment correction records any real cash change in Daily Close.

Quantity correction is currently limited to directly costed receipts with no allocated transport/other costs and no supplier-credit history. Estimated-cost receipts and receipts with allocated charges can still correct invoice number and note; quantity/cost reallocation needs a reviewed workflow. Buying unit cost, supplier identity, payment method, and past sale profit snapshots are not changed by this correction. Do not use a manual stock reversal to bypass these financial guards. Contact support for a receipt that needs a more complex accounting correction.

## Verification

Use a demo shop, not a live supplier transaction:

1. Receive two unpaid units at a direct cost with no extra charges. Verify stock, Purchase Analytics, Supplier Balance, and the linked order.
2. Correct the receipt to one unit. Verify stock falls by one, the purchase/payable total falls by one unit's cost, the linked order's remainder grows, and the correction appears in receipt and Stock History.
3. Retry with the same key and confirm no second movement. Attempt to reduce below available stock and confirm a conflict.
4. Reverse a new manual stock-in entry and confirm the opposite movement and the original row both remain.
5. Confirm a staff member without **Correct stock/receipts** cannot call either correction route.

The unit suite covers these guards. A real PostgreSQL concurrency/integration run and demo browser smoke test are still required before production rollout. No migration or production data change is performed by editing this guide.
