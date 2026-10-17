# Product performance and returns

## Product performance

Owners and staff with Reports permission open **Analytics > Explore and compare products**. The report includes active and inactive products, supports search by name or SKU, sorts by revenue, known-cost gross profit, units, margin, stock or name, and pages through the shop's full product list. Select a product for its trend, latest sale lines and return ledger; select up to three products to compare the same date range.

Only completed sale items linked to a current product contribute to product metrics. Voided sales do not contribute. Revenue and units are net of dated returns in the selected period; gross sale value and returned value are also shown separately. Revenue includes credit sales; it is not cash received. Known-cost gross profit reverses returned revenue and restores cost of goods only for units restocked as sellable. Damaged units remain a cost. Sales with missing or zero cost are flagged and excluded from the displayed profit and margin. Product profit does not allocate operating expenses. Current stock, listed prices and current buying price are live product values, not historical snapshots. The estimated stock cover uses the selected period's net unit pace only when it spans at least seven days.

The product detail endpoint and list endpoint require the existing Reports permission and resolve the current shop from the authenticated session. Other shops' products and customer information are not returned.

## Recording a return

An owner or staff member with Reports permission opens **Sales > History > Record return** on a completed sale. For each line, enter the quantity returned and split it into sellable/restock and damaged/write-off quantities. The split must equal the returned quantity. Add a reason. Service lines can be financially returned but do not change inventory.

Returns are separate immutable dated records linked to the original sale and sale lines. The server enforces that cumulative returned quantity cannot exceed the sold quantity, including concurrent requests. Each submit has an idempotency key so an uncertain mobile response can be retried without repeating stock or debt changes. Restock stock movements link to the return line. Crop harvest allocations reduce sold quantity and realized revenue for both sellable and damaged units; only sellable units restore crop stock and allocated cost, while damaged-unit cost remains a loss. Returned live animals also restore their farm group count when restocked.

For a credit sale, the return reduces the unpaid debt balance first, without deleting historical payments. Any return value beyond the remaining debt is money already collected and must be refunded through a selected method. Non-credit returns require a refund method for the full returned value. The refund reference is stored for reconciliation; DukaPilot records the refund but does not initiate M-Pesa, bank, or wallet transfers. A cash refund requires the recording user to have an open cash shift; the refund is an outflow in that shift's Daily Close/Z-Report. Other payment methods are recorded in Profit Analytics as negative collections on the return date.

Profit Analytics preserves original sale events and posts returns on the return date. It separates gross sales, returned value, net sales, money refunded, debt reductions, net collections, cost of goods sold, known-cost gross profit and expenses. Product performance and its trend subtract returned units/revenue and restore cost only for sellable units returned to stock. Crop-cycle realized revenue likewise subtracts every returned unit; damaged units remain a crop cost/loss and are not restored to stock. Sale history shows the item quantities still eligible for return and the recorded return details.

Direct stock receipts also use a request key and request fingerprint. If a phone loses the response, retry the unchanged receipt; the server returns the original receipt without adding stock twice. Changing any receipt details requires a new submission. A cash stock receipt requires an open shift so the outflow is included in Daily Close.

## Correcting an entirely mistaken sale

**Sales > History > Void entire sale** is only for an entirely incorrect sale where no payment was received. The user must explicitly confirm this; the confirmation is audited because DukaPilot cannot verify cash or mobile-money transfers externally. It restores linked stock, reverses farm/crop sale allocations and cancels any unpaid debt. A sale with a recorded partial return or a credit sale with a recorded payment cannot be voided.

Voiding does **not** issue or record a refund. If the customer paid, do not attest that payment was not received; use **Record return** so the refund is dated and included in cash/payment reconciliation.

## Correcting an entirely mistaken return

An owner or staff member with Reports permission can open **Sales > History > Correct return** on a recorded return. The correction is a full reversal of that return; partial correction is not supported yet. Enter a reason. The original return remains in history and the correction is appended as a linked event, so reports use the dated reversal rather than silently rewriting the original.

The correction restores the sale's returned-quantity eligibility and reverses the return's debt reduction without deleting debt payments. If sellable goods had been restocked, the matching quantity must still be on hand; the correction records a linked stock-out. For crop harvests, it restores the original crop allocation only if the returned crop stock/cost remains available. Returned live-animal counts are reversed through a linked farm event. If stock was sold, consumed, or otherwise moved, correct the stock situation through the normal stock workflow first; the system rejects a correction that cannot be reconciled safely.

If the original return recorded a refund, only record recovery after the customer has actually repaid/returned that money. Select the real recovery method and optionally add its reference; DukaPilot records the operator's attestation and does not initiate or verify an external transfer. Cash recovery requires an open shift and is a new inflow in that correction shift's Daily Close. The original cash refund remains an outflow on the original shift; the net cash effect across both shifts reflects the correction without rewriting either close. Non-cash recovery appears as a dated adjustment in analytics, not as a cash drawer movement.

## Deployment and boundaries

Return correction currently supports only a full reversal, not a partial amendment. A recovery method is recorded from the operator's confirmation and is not independently verified by DukaPilot. Existing historical returns are not imported by the correction migration; only returns linked to crop harvest allocations are backfilled for crop-cycle reporting. Do not backdate or invent ledger rows. A deleted product whose sale line has lost its product link cannot be restocked automatically; keep products with sales history archived rather than deleting them where possible.

The API requires migrations `20261003003000_sale_returns_and_refunds` and `20261017001000_customer_return_reversals_crop_allocations` before the updated backend is served. The latter backfills eligible prior damaged crop returns against their existing FIFO harvest allocations. Deploy the backend and migrations before deploying the frontend. Physical cash/M-Pesa/bank transfers still happen outside DukaPilot and must be confirmed by the operator before recording them.

Supplier-side purchase returns and credit notes use the separate **Supplier Balances** workflow. Link each return/credit to the original receipt and item; a physical return creates an auditable stock-out and cannot exceed eligible received quantity/current stock, while a credit note alone does not change inventory. A return also has an append-only, merchant-entered progress trail (Recorded, Handed over, Supplier acknowledged, or Disputed). This trail does not prove delivery or change stock/balances; DukaPilot does not arrange the physical return. Record a supplier refund only after the money arrives. A cash refund needs an open shift and appears in Daily Close. These supplier records do not change the customer-sale return ledger. See [Supplier Purchasing and Payables](./SUPPLIER_PURCHASING_AND_PAYABLES.md). Do not edit or delete an original receipt that has affected a cash shift.
