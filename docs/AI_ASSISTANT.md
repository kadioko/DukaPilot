# DukaPilot Assistant

The assistant is a permission-aware, deterministic operational helper. Its recommendations and Ask answers use DukaPilot records; questions are not sent to an external AI provider, and Ask cannot create or change sales, payments, stock, debts, or farm records.

## Data Loading And Freshness

The frontend loads an authenticated `GET /api/assistant/today` snapshot. The backend reports each source independently as `ready`, `unavailable`, or `not_permitted`, with a check time and, where available, the newest source-record time (`dataThrough`). A failure in one section does not hide healthy sections. Failed content sources are cleared, their dependent recommendations are hidden, and they offer a source-specific retry. For action history only, the UI may retain the small status-only cache while the source is unavailable so a previously dismissed/completed action does not reappear; the source is visibly marked unavailable. A newly restricted section is cleared immediately. A refresh pauses recommendations that depend on the sources being refreshed.

Available sources are today's sales summary, low-stock inventory, debts, expenses, quotations, farm operations, and action history. Access is derived on the server from the authenticated shop and staff permissions. Financial summaries require Reports access; inventory also requires Stock access; debts additionally require selling permission; expenses additionally require expense-recording permission; farm operations require farm permission; quotation data requires Reports or quotation-cost visibility. Unauthorized sections are returned as `not_permitted`, not queried and then hidden in the browser.

Slow assistant sources log `assistant_source_timing` with the request ID, source, duration, and status. Slow overall snapshots log `assistant_snapshot_timing`. Failures log the source, request ID, error class, and duration, but not question text or business/customer records. Use the request ID to correlate with the API request timing logs.

## Ask DukaPilot

`POST /api/assistant/ask` accepts a short English or Kiswahili question and routes it to a supported topic. In addition to sales, profit, expenses, low stock, debts and farm actions, it can summarize received purchase costs, the supplier with the highest received-stock cost, credit-method sales, customer return values and refunds, recorded product expiry dates, upcoming expense schedules and quotation actions. It returns a concise answer, an in-app destination, check time/source evidence, and a privacy note.

Sales, profit, and expense questions support these Tanzania-local periods: today, yesterday, this/last week, this/last month, this/last quarter, this/last year, the last 7 calendar days, and explicit date ranges in `YYYY-MM-DD` format. “This” periods run from the calendar period's start through the end of the current business day in Africa/Dar_es_Salaam. Future-dated, unverified legacy expense rows and unrecorded recurring schedules are excluded. Expense comparisons use the equivalent dates in the previous calendar period where applicable; custom ranges compare with the preceding range of equal duration. Expenses default to the last 7 calendar days when no period is stated. Sales and profit default to today.

For a date period Ask cannot support for a topic (such as historical stock, farm, or debt balances), or for ambiguous/invalid dates, it asks for clarification rather than substituting today's data. Debt answers describe current outstanding balances only. Sales revenue is kept distinct from cash collected. Profit answers disclose incomplete cost coverage and show uncosted sales revenue; they do not present partial cost data as a complete profit result.

Ask is not a general-purpose language model: it uses topic and date patterns and does not make writes. Ask one topic at a time. The page offers example questions for sources the account is allowed to access; farm examples appear only for farm categories. For example:

- "How much were sales this month?" / "Mauzo ya mwezi huu ni kiasi gani?"
- "What was my profit this week?" / "Faida ya wiki hii ni kiasi gani?"
- "Which product may need reordering?" / "Ni bidhaa gani inahitaji kuagizwa?"
- "How much debt is outstanding?" / "Madeni yaliyobaki ni kiasi gani?"
- "Who owes me money?" or "Which debts are overdue?" (up to five current debt records, with the full list in Debts)
- "What were today's expenses?" / "Matumizi ya leo ni kiasi gani?"
- "What farm action should I review?" / "Ni shughuli gani ya shamba nikague?"
- "How much stock was received this month?" / "Stock iliyopokelewa mwezi huu ni kiasi gani?"
- "How many credit sales this month?" / "Mauzo ya mkopo mwezi huu yalikuwa mangapi?"
- "Which products expire in the next 30 days?" / "Ni bidhaa gani zinaisha muda siku 30 zijazo?"
- "What recurring expenses are due?" / "Ni ratiba gani za matumizi zinatarajiwa?"
- "How much was refunded this month?" / "Marejesho ya mwezi huu ni kiasi gani?"
- "Which quotations need follow-up?" / "Ni nukuu gani nahitaji kufuatilia?"
- "Is my shift open?" / "Zamu yangu iko wazi?"

Answers are summaries, not individual product or customer lookups. For example, product rankings and an individual customer's debt are not yet supported in Ask; use Analytics or Debts for those. Unrecognized or mixed-topic questions receive a clarification and examples instead of a generic recommendation being presented as the answer. A new question clears the previous answer, including when the new request fails. A source marked unavailable should be retried; an access restriction needs an owner to review permissions. An empty source or zero is not, by itself, a diagnosis of why a question was misunderstood.

For sales, profit, expenses, purchases, credit sales and customer returns, a short period-only follow-up such as "And last month?" uses the prior topic. This is not a full chat history: the browser keeps a signed, 30-minute topic token in component memory only, and **New conversation** clears it. The token is bound to the authenticated account, staff identity and selected branch. The server rechecks current permissions and business scope for every answer. No customer or financial records are included in the token. Expiry and scheduled-expense summaries use the next 30 days (plus overdue schedules); they are not arbitrary date-range reports. Expiry reflects product-level dates, not guaranteed lot-level dates; schedules are not paid transactions. Purchase totals are received landed costs before supplier returns and credits, not cash paid or operating expenses. Customer returns distinguish return value, paid refunds and refund recoveries.

The current-shift answer uses the existing Daily Close calculations and displays only the requesting actor's open shift and expected drawer cash; it is not total sales. Team-shift discrepancy questions remain unsupported.

Not yet implemented as Ask answers: product rankings or named-product performance, named or overdue supplier balances, named-customer debt lookup and debt collection totals, per-category expense changes, supplier return/refund settlement, team-shift discrepancies, cross-branch comparisons, food preparation details, crop task and cycle detail, livestock production/feed detail, or general free-form model answers. Use the existing relevant screens until these receive independently verified, permission-scoped query paths and tests.

## Recommendation Rules

- **Stock:** only active, sellable products at or below their minimum are considered. Internal-use products are excluded. Demand uses completed POS quantities net of recorded customer returns over the last 28 days. A run-out estimate is shown only with at least 14 observed days, sales on at least 7 distinct days, and positive net quantity. A suggested reorder quantity targets 14 days of estimated cover, less current stock. Approximate cash is shown only to an account with Reports access and a saved positive buying price. The estimate does not yet model stockout gaps, supplier lead time, seasonality, or unrecorded demand; it is a planning estimate, not a purchase order.
- **Debts:** open balances are prioritized by overdue due date, then upcoming due date, then age. The recommended action links to the exact tenant-scoped debt record in the customer's grouped debt history. It reports recorded balances, not cash received.
- **Expenses:** the assistant compares equivalent date windows. An unusual increase is highlighted only when both seven-day periods have at least three expense records and the current total is at least 25% above the previous period. Otherwise it asks the owner to review the recorded total without labelling it abnormal.
- **Profit:** a loss warning is stated only when sale cost coverage is complete. With missing product costs, the assistant labels the result a known-cost estimate and shows the sales revenue whose cost is missing.
- **Farm:** recommendations reflect logged operations, tasks, inputs, losses, harvests, and recorded warnings. They are not diagnosis, veterinary treatment, pesticide instructions, or agronomic advice.
- **Quotations:** server-generated follow-up actions remain quotations until the business explicitly converts one to a sale. Quotation value is not reported as revenue.

The assistant does not yet provide recommendations for supplier payable aging, lot-level expiry, unresolved customer returns, cash-close discrepancies, branch comparisons, or configurable farm reminder thresholds. Those should be added only with tenant-scoped, permission-checked source data and clear definitions. Product expiry is currently not necessarily lot-specific, and supplier lead times/stockout intervals are not reliable enough to imply precise forecasts.

## Recommendation Lifecycle And Measurement

Each recommendation occurrence is identified by its action key and Tanzania-local business date. Completing or dismissing it hides that occurrence for the rest of that date; the same action can appear again on a later date if the underlying condition remains. A save failure is shown on the recommendation and does not silently mark it complete. The owner can review dated action occurrences and their event history in Assistant History.

Admin “top actions” counts recorded `SHOWN` impression events by safe category (for example, stock or debt follow-up), not current status rows or raw recommendation keys. This avoids counting each product-specific stock action as a separate action type and avoids exposing record identifiers in the category list. The event funnel distinguishes shown, opened, marked done, and verified outcomes. A click or a user's “Mark done” confirmation is not a verified outcome.

Action events and action-history rows are retained for 400 days, covering the maximum 365-day admin reporting window plus a buffer. The daily GitHub Actions workflow calls the authenticated Railway endpoint `POST /api/cron/assistant-analytics-retention`; configure the same high-entropy `ASSISTANT_ANALYTICS_RETENTION_CRON_SECRET` in Railway and GitHub Actions secrets. The workflow deliberately fails if its secret is absent, so an unconfigured retention job is visible rather than silently skipped. Run `npm run assistant:prune-history` manually only when an operator intentionally requests a cleanup.

Verification remains a limited proxy: it checks for a supported record change relative to the recommendation's shown baseline. Checks include a recorded debt balance decrease, an increase in the quantity of the same recommended stock product, a recorded deposit increase, quotation conversion, or a crop input/harvest/irrigation, due-task, or warning-resolution record change. Removing or deactivating a product does not count as restocking. A measured change does not establish that the recommendation caused it.

Event rows store only the recommendation key, event type, occurrence/impression key, numeric measurement baseline, shop, and time. They do not store the user's question or product/customer/payment details.

## Deployment And Verification

Migration `20261028001000_assistant_recommendation_occurrences` adds the daily occurrence identity to assistant actions. Apply it through the normal Railway migration deployment before serving the matching backend release or frontend. Then configure the retention secret before treating the scheduled cleanup as active. The backend uses Prisma's generated client; run `npm run db:generate` after schema changes.

Verify with:

```powershell
cd backend
npm run db:generate
npm run test:assistant
```

Also run the frontend typecheck, focused assistant/debt Playwright tests, production build, and the normal CI suite before release. In production, verify source-specific failure/retry, staff permission redaction, period-aware bilingual Ask answers, per-day dismissal, exact debt focus, and impression-based admin counts. Do not mark an action outcome verified based only on a click or a manual completion.
