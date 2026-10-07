# Purchase Analytics

## What the report counts

Open **Analytics > Purchases** (or select the Purchases metric from Analytics). It summarizes **saved stock receipts** by the date inventory was received, not by the date an order was placed or paid. The report includes receipts with no supplier, optional invoice numbers, product cost, transport and other allocated landed costs, payment method, and estimated allocations. Use today, this week, this month, this quarter, this year, all time, or a custom date range. Search receipt numbers, products, and supplier names; filter by supplier or payment method; open paginated receipt details; or export the filtered report to CSV. Date boundaries use `Africa/Dar_es_Salaam`.

To make a purchase appear, use **Receive Stock** (or receive an order through **Orders**), enter actual delivered quantities and costs, then save the receipt. A draft supplier order by itself is not included. Receipts can use a shared supplier or a shop-private supplier; leaving the supplier blank does not exclude the receipt from purchase totals.

## Accounting treatment

A stock purchase is inventory, not automatically an operating expense or an immediate COGS charge. Landed cost is attached to received products and becomes COGS as those products are sold. Do not enter the same receipt again as an ordinary expense, or profit would be understated. The report shows receipt value, not supplier-credit liabilities; the current receiving flow does not provide a complete supplier-credit balance ledger.

Production inputs are tracked separately by production/farm analytics. Their cost is included in the cost of output stock and becomes COGS when the output is sold; it should not be subtracted a second time as an operating expense.

## Scope and access

The report uses the active shop or branch scope and requires **Reports** permission. It includes all receipts in that scope, regardless of whether a supplier is attached. Supplier and product rankings are capped at the top 100 entries for readability; receipt history is database-paginated. CSV export is limited to 10,000 matching receipts; narrow the dates or filters if the export limit is reached. CSV files include the selected range, timezone, supplier/payment/search filters, totals, and a metric note.

## Metric definitions

- **Product cost:** amount recorded for received product lines before additional costs.
- **Transport and other:** additional receipt charges allocated across received items.
- **Landed purchases:** product cost plus transport and other charges, matching the receipt total.
- **Estimated allocation:** receipt costs distributed by the receiving workflow's estimate where exact line-level allocation was unavailable. The report flags these receipts and includes their recorded landed totals.
- **By supplier:** groups receipts without a supplier under “No supplier”; these receipts remain part of all purchase totals.

## API and verification

The authenticated, report-protected endpoint is `GET /api/dashboard/purchases`. It supports `period=today|week|month|quarter|year|all|custom`, `from`, `to`, `supplierId`, `paymentMethod`, `search`, `page`, `pageSize`, and `export=1`. Tanzania local calendar boundaries use `Africa/Dar_es_Salaam`; custom ranges are inclusive by local date and limited to ten years. The endpoint reads stock receipts and receipt items; it does not create accounting entries or modify inventory.

Regression coverage: `backend/tests/purchaseAnalytics.unit.test.js`; frontend smoke coverage: `frontend/tests/profit.analytics.spec.ts`.

## Important distinction

This report answers **how much stock was received at recorded landed cost**. It is not a full cash-flow report, supplier-credit payable ledger, or operating-expense list. A cash receipt may also affect an open Daily Close drawer, but the purchase value belongs in this report and inventory costing; do not record the same stock purchase again in Expenses. See [Owner Reports and Analytics](./OWNER_REPORTS_GUIDE.md) for how purchase cost later becomes COGS as products sell.
