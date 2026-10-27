# DukaPilot AI Assistant

The assistant is a permission-aware, deterministic operational helper. Its recommendations and Ask answers are generated from DukaPilot records; questions are not sent to an external AI provider, and Ask cannot create or change sales, payments, stock, or farm records.

## Data loading and freshness

The frontend loads one authenticated `GET /api/assistant/today` snapshot. The backend reports each source independently as `ready`, `unavailable`, or `not_permitted`, with a check time and, where available, the newest source-record time (`dataThrough`). A source failure does not discard successful sections. The assistant screen keeps existing data visible when a retry fails, labels that source unavailable, and offers a source-specific retry or a full refresh.

Available sources are today's sales summary, low-stock inventory, debts, expenses, quotations, farm operations, and action history. Access is derived on the server from the authenticated shop and staff permissions. Financial summaries require Reports access; inventory also requires Stock access; debts additionally require selling permission; expenses additionally require expense-recording permission; farm operations require farm permission; quotation data requires Reports or quotation-cost visibility. Unauthorized sections are returned as `not_permitted`, not queried and then hidden in the browser.

## Recommendation rules

- **Stock:** only active, sellable products at or below their minimum are considered. Internal-use products are excluded. Demand uses completed POS quantities net of recorded customer returns over the last 28 days. A run-out estimate is shown only with at least 14 observed days, sales on at least 7 distinct days, and positive net quantity. A suggested reorder quantity targets 14 days of estimated cover, less current stock. Approximate cash is shown only to an account with Reports access and a saved positive buying price. The estimate excludes supplier lead time, seasonality, and unrecorded demand; confirm quantities and supplier timing before ordering.
- **Debts:** open balances are ordered by due date and age. The assistant reports recorded balances, not cash received.
- **Expenses:** an unusual increase is highlighted only when both seven-day periods have at least three expense records and the current total is at least 25% above the previous period. Otherwise the assistant asks the owner to review the recorded total without labelling it abnormal.
- **Farm:** recommendations reflect logged operations, tasks, inputs, losses, harvests, and recorded warnings. They are not diagnosis, veterinary treatment, pesticide instructions, or agronomic advice.
- **Quotations:** server-generated follow-up actions remain quotations until the business explicitly converts one to a sale. Quotation value is not reported as revenue.

## Ask DukaPilot

`POST /api/assistant/ask` accepts a short English or Kiswahili question and routes it to a supported topic (inventory, debts, expenses, farm operations, or today's sales). It returns a concise answer, an in-app destination, the check time and source evidence, and a privacy note. It is intentionally not a general-purpose language model: unsupported questions receive a safe summary of the supported topics rather than invented advice. The route loads only the relevant section for a recognized topic; broad questions load permission-checked sections.

## Outcome measurement

Assistant action events distinguish `SHOWN`, `OPENED`, `MARKED_DONE`, and `OUTCOME_VERIFIED`. A click or a user's “Mark done” confirmation is not a verified outcome. Verification is a limited proxy: it checks for a supported record change relative to the recommendation's display baseline. Checks include a recorded debt balance decrease, an increase in the quantity of the same recommended stock product, a recorded deposit increase, quotation conversion, or a crop input/harvest/irrigation, due-task, or warning-resolution record change. Removing or deactivating a product does not count as restocking. This does not establish that the recommendation caused the change. Admin analytics should present shown/opened/marked-done/verified counts separately and preserve this caveat.

The first time a recommendation is shown each Tanzania business day, its event stores a numeric measurement baseline for that recommendation. Completion compares against that displayed baseline, not the value at the moment the user marks it done. Stock recommendations are keyed per product and verify only when that product's recorded quantity rises; deleting or deactivating a product does not count as a restock. Fractional stock is stored as thousandths in the internal integer measurement. Event rows use a shop-scoped idempotency key and store only the recommendation key, event type, impression key, numeric baseline, shop, and time. They do not store the user's question or product/customer/payment details.

## Deployment and verification

The event funnel requires migration `20261027001000_assistant_snapshot_outcomes`. Apply it through the normal Railway migration deployment before serving a backend release that uses the new event model. Verify with:

```powershell
cd backend
npm run db:generate
  npm run test:assistant
```

Also run the frontend typecheck, the assistant Playwright tests, and production build before release. In production, verify source-specific failure/retry, staff permission redaction, bilingual Ask answers, and the admin funnel. Do not mark an action outcome verified based only on a click or a manual completion.
