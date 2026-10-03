# Product performance and returns

## Product performance

Owners and staff with Reports permission open **Profit Analytics > Explore and compare products**. The report includes active and inactive products, supports search by name or SKU, sorts by revenue, known-cost gross profit, units, margin, stock or name, and pages through the shop's full product list. Select a product for its trend, latest sale lines and return ledger; select up to three products to compare the same date range.

Only completed sale items linked to a current product contribute to product metrics. Voided sales do not contribute. Revenue and units are net of dated returns in the selected period; gross sale value and returned value are also shown separately. Revenue includes credit sales; it is not cash received. Known-cost gross profit reverses returned revenue and restores cost of goods only for units restocked as sellable. Damaged units remain a cost. Sales with missing or zero cost are flagged and excluded from the displayed profit and margin. Product profit does not allocate operating expenses. Current stock, listed prices and current buying price are live product values, not historical snapshots. The estimated stock cover uses the selected period's net unit pace only when it spans at least seven days.

The product detail endpoint and list endpoint require the existing Reports permission and resolve the current shop from the authenticated session. Other shops' products and customer information are not returned.

## Recording a return

An owner or staff member with Reports permission opens **Sales > History > Record return** on a completed sale. For each line, enter the quantity returned and split it into sellable/restock and damaged/write-off quantities. The split must equal the returned quantity. Add a reason. Service lines can be financially returned but do not change inventory.

Returns are separate immutable dated records linked to the original sale and sale lines. The server enforces that cumulative returned quantity cannot exceed the sold quantity, including concurrent requests. Each submit has an idempotency key so an uncertain mobile response can be retried without repeating stock or debt changes. Restock stock movements link to the return line. Crop harvest allocations restore only sellable returned units; returned live animals also restore their farm group count when restocked.

For a credit sale, the return reduces the unpaid debt balance first, without deleting historical payments. Any return value beyond the remaining debt is money already collected and must be refunded through a selected method. Non-credit returns require a refund method for the full returned value. The refund reference is stored for reconciliation; DukaPilot records the refund but does not initiate M-Pesa, bank, or wallet transfers. A cash refund requires the recording user to have an open cash shift; the refund is an outflow in that shift's Daily Close/Z-Report. Other payment methods are recorded in Profit Analytics as negative collections on the return date.

Profit Analytics preserves original sale events and posts returns on the return date. It separates gross sales, returned value, net sales, money refunded, debt reductions, net collections, cost of goods sold, known-cost gross profit and expenses. Product performance and its trend subtract returned units/revenue and restore cost only for sellable units returned to stock. Sale history shows the item quantities still eligible for return and the recorded return details.

Direct stock receipts also use a request key and request fingerprint. If a phone loses the response, retry the unchanged receipt; the server returns the original receipt without adding stock twice. Changing any receipt details requires a new submission. A cash stock receipt requires an open shift so the outflow is included in Daily Close.

## Correcting an entirely mistaken sale

**Sales > History > Void entire sale** is only for an entirely incorrect sale where no payment was received. The user must explicitly confirm this; the confirmation is audited because DukaPilot cannot verify cash or mobile-money transfers externally. It restores linked stock, reverses farm/crop sale allocations and cancels any unpaid debt. A sale with a recorded partial return or a credit sale with a recorded payment cannot be voided.

Voiding does **not** issue or record a refund. If the customer paid, do not attest that payment was not received; use **Record return** so the refund is dated and included in cash/payment reconciliation.

## Deployment and boundaries

The API requires migration `20261003003000_sale_returns_and_refunds` before the updated backend is served. Deploy the backend and migration before deploying the frontend. Existing historical returns handled manually are not automatically imported; do not backdate or invent ledger rows. Physical cash/M-Pesa/bank transfers still happen outside DukaPilot and must be confirmed by the operator before recording them. A deleted product whose sale line has lost its product link cannot be restocked automatically; keep products with sales history archived rather than deleting them where possible.

Supplier-side purchase returns/credits are not part of this customer return ledger yet. Until that separate workflow exists, reconcile supplier returns with an auditable stock adjustment and supplier balance outside receipt history; do not edit or delete a receipt that already contributed to a closed cash shift.
